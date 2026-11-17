import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";

import { DEFAULT_OPTIONS } from "../../app/billiard/_components/billiard-game/config";
import { DEFAULT_LOADOUT } from "../../app/billiard/_components/billiard-game/cues";
import { createGame } from "../../app/billiard/_components/billiard-game/engine";
import { chooseComputerShot, otherSeat, resolveMatchShot } from "../../app/billiard/_components/billiard-game/match-play";
import type { LobbyView, MatchKind, MatchOptions, MatchResult, MatchView, Seat, ShotCommand, ShotReplay } from
  "../../app/billiard/_components/billiard-game/match-types";
import type { GameState } from "../../app/billiard/_components/billiard-game/type";
import { GameError, transaction } from "./db";
import type { GameDatabase, Match } from "./models";
import { profile, readPlayer, shop, updateBalance } from "./players";

const QUEUE_LIFETIME = 35_000;
const TURN_TIME = 180_000;

const readMatch = async (db: GameDatabase, user: string, id: string, session?: ClientSession) => {
  const match = await db.matches.findOne({ _id: id, players: user }, { session });
  if (!match) throw new GameError(404, "Không tìm thấy trận đấu.");
  return match;
};

const seatOf = (match: Match, user: string): Seat => match.players[0] === user ? 0 : 1;

export const lobby = async (db: GameDatabase, user: string | null, id?: string): Promise<LobbyView> => {
  if (!user) return { player: null, history: [], cues: await shop(db, []), match: null, queued: null };
  const player = await readPlayer(db, user);
  const selected = id ?? player.activeMatch;
  const [queue, match, history, cues] = await Promise.all([
    db.queue.findOne({ _id: user, expiresAt: { $gt: new Date() } }),
    selected ? readMatch(db, user, selected) : null,
    db.matches.find({ players: user, completedAt: { $ne: null } }).sort({ completedAt: -1 }).limit(12).toArray(),
    shop(db, player.cues),
  ]);
  const opponentId = (entry: Match) => entry.players[otherSeat(seatOf(entry, user))];
  const ids = [...new Set([...history, ...(match ? [match] : [])].map(opponentId).filter((value) => value !== null))];
  const names = ids.length ? await db.users.find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray() : [];
  const opponent = (entry: Match) => {
    const id = opponentId(entry);
    return id ? names.find((item) => item._id === id)?.name ?? "Người chơi" : "Máy";
  };
  const view: MatchView | null = match && {
    id: match._id, kind: match.kind, seat: seatOf(match, user), turn: match.turn, version: match.version,
    game: match.state, replay: match.replay, result: match.result, canPass: match.canPass, deadline: match.deadline,
    opponent: opponent(match),
  };
  return {
    player: profile(player), cues, match: view,
    queued: queue && { rule: queue.rule, table: queue.table },
    history: history.flatMap((entry) => {
      const { result } = entry;
      const rule = entry.state.options.mode;
      return !result || rule === "drill" ? [] : [{
        ...result, id: entry._id, won: result.winner === seatOf(entry, user),
        opponent: opponent(entry), kind: entry.kind, rule,
      }];
    }),
  };
};

const createMatch = async (
  db: GameDatabase, session: ClientSession, kind: MatchKind, options: MatchOptions, first: string, second: string | null,
) => {
  const id = randomUUID();
  const now = new Date();
  const state = createGame({ ...DEFAULT_OPTIONS, mode: options.rule, tableId: options.table });
  state.ballInHand = true;
  await db.matches.insertOne({
    _id: id, kind, players: [first, second], state, version: 0, turn: 0, replay: null, result: null,
    canPass: false, deadline: kind === "online" ? now.getTime() + TURN_TIME : null, createdAt: now, completedAt: null,
  }, { session });
  const users = second ? [first, second] : [first];
  const reserved = await db.users.updateMany({ _id: { $in: users }, activeMatch: null },
    { $set: { activeMatch: id } }, { session });
  if (reserved.matchedCount !== users.length) throw new GameError(409, "Người chơi đã vào trận.");
  await db.queue.deleteMany({ _id: { $in: users } }, { session });
  return id;
};

export const requestMatch = (db: GameDatabase, user: string, kind: MatchKind, options: MatchOptions) =>
  transaction(db, async (session) => {
    // Serialize match formation so two simultaneous joins cannot both miss each other.
    await db.migrations.updateOne({ _id: "matchmaking" }, { $inc: { sequence: 1 } }, { session });
    const player = await readPlayer(db, user, session);
    if (player.activeMatch) return player.activeMatch;
    if (kind === "ai") return createMatch(db, session, kind, options, user, null);

    const now = new Date();
    const waiting = await db.queue.findOne(
      { _id: { $ne: user }, rule: options.rule, table: options.table, expiresAt: { $gt: now } },
      { sort: { joinedAt: 1, _id: 1 }, session },
    );
    if (waiting) return createMatch(db, session, kind, options, waiting._id, user);
    const prior = await db.queue.findOne({ _id: user, ...options, expiresAt: { $gt: now } }, { session });
    await db.queue.updateOne({ _id: user }, {
      $set: { ...options, joinedAt: prior?.joinedAt ?? now, expiresAt: new Date(now.getTime() + QUEUE_LIFETIME) },
    }, { upsert: true, session });
    return undefined;
  });

export const leaveQueue = (db: GameDatabase, user: string) => db.queue.deleteOne({ _id: user });

export const touchQueue = (db: GameDatabase, user: string) => {
  const now = new Date();
  return db.queue.updateOne({ _id: user, expiresAt: { $gt: now } },
    { $set: { expiresAt: new Date(now.getTime() + QUEUE_LIFETIME) } });
};

const finish = async (
  db: GameDatabase, session: ClientSession, match: Match, result: MatchResult,
  state = match.state, replay: ShotReplay | null = null,
) => {
  await db.matches.updateOne({ _id: match._id }, {
    $inc: { version: 1 },
    $set: { state, replay, result, canPass: false, deadline: null, completedAt: new Date() },
  }, { session });
  await db.users.updateMany({ activeMatch: match._id, _id: { $in: match.players.filter((id) => id !== null) } },
    { $set: { activeMatch: null } }, { session });
  const winner = match.players[result.winner];
  if (match.kind === "online" && winner && (result.reason === "rack" || state.shots >= 4)) {
    await updateBalance(db, session, winner, `match:${match._id}`, 30, 10);
  }
};

const expireMatch = async (db: GameDatabase, session: ClientSession, match: Match) => {
  if (match.deadline === null || match.deadline > Date.now()) return false;
  await finish(db, session, match, { winner: otherSeat(match.turn), reason: "timeout" });
  return true;
};

export const playMatch = (db: GameDatabase, user: string, id: string, version: number, command?: ShotCommand) =>
  transaction(db, async (session) => {
    const match = await readMatch(db, user, id, session);
    if (match.version !== version || match.result || await expireMatch(db, session, match)) return;
    const computerTurn = match.kind === "ai" && match.turn === 1;
    if (command ? computerTurn || match.turn !== seatOf(match, user) : !computerTurn) {
      throw new GameError(409, "Chưa đến lượt đánh.");
    }
    const shot = command ?? chooseComputerShot(match.state);
    const loadout = computerTurn ? DEFAULT_LOADOUT : (await readPlayer(db, user, session)).loadout;
    const result = shot && resolveMatchShot(match.state, shot, loadout);
    if (!result) throw new GameError(422, "Cú đánh không hợp lệ. Kiểm tra vị trí bi cái và thử lại.");
    const { game, replay, keepsTurn, canPass } = result;
    if (game.won || game.lost) {
      await finish(db, session, match, { winner: game.won ? match.turn : otherSeat(match.turn), reason: "rack" }, game, replay);
      return;
    }
    const turn = keepsTurn ? match.turn : otherSeat(match.turn);
    const deadline = match.kind === "online" ? Date.now() + TURN_TIME : null;
    await db.matches.updateOne({ _id: id }, {
      $inc: { version: 1 }, $set: { turn, state: game, replay, canPass, deadline },
    }, { session });
  });

export const manageMatch = (
  db: GameDatabase, user: string, id: string, version: number, action: "resign" | "timeout" | "pass",
) => transaction(db, async (session) => {
  const match = await readMatch(db, user, id, session);
  if (match.version !== version || match.result || await expireMatch(db, session, match)) return;
  const seat = seatOf(match, user);
  if (action === "timeout") throw new GameError(409, "Lượt đánh vẫn còn thời gian.");
  if (action === "pass") {
    if (seat !== match.turn || !match.canPass) throw new GameError(409, "Không thể trả lượt lúc này.");
    const state: GameState = { ...match.state, message: "Đã trả lượt sau cú đánh an toàn." };
    const deadline = match.kind === "online" ? Date.now() + TURN_TIME : null;
    await db.matches.updateOne({ _id: id }, {
      $inc: { version: 1 }, $set: { turn: otherSeat(seat), state, replay: null, canPass: false, deadline },
    }, { session });
    return;
  }
  await finish(db, session, match, { winner: otherSeat(seat), reason: "resigned" });
});
