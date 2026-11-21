import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { HALL_CAPACITY } from "../../app/_components/lobby/hall-types";
import { isHallWalkable } from "../../app/_components/lobby/hall-layout";
import type { HallMotion, HallTable, HallView } from "../../app/_components/lobby/hall-types";
import type { MatchOptions } from "../../app/billiard/_components/billiard-game/match-types";
import { GameError, transaction } from "./db";
import { createMatch, expireMatch, lockMatchmaking } from "./matches";
import type { GameDatabase, WaitingTable } from "./models";
import { readPlayer } from "./players";

const PRESENCE_MS = 15_000;
const TABLE_MS = 45_000;
const CHAT_MS = 24 * 60 * 60 * 1000;
const deriveKey = promisify(scrypt);
const activeHallMatches = { completedAt: null, hallSlot: { $exists: true } };

const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await deriveKey(password, salt, 32) as Buffer).toString("hex")}`;
};

const allowsJoin = async (table: WaitingTable, password?: string) => {
  if (!table.passwordHash) return true;
  if (!password) return false;
  const [salt, hash] = table.passwordHash.split(":");
  return timingSafeEqual(Buffer.from(hash!, "hex"), await deriveKey(password, salt!, 32) as Buffer);
};

export const readHall = async (db: GameDatabase, user: string, inMatch: boolean): Promise<HallView> => {
  const now = new Date();
  if (!inMatch) {
    const player = await readPlayer(db, user);
    await Promise.all([
      db.presence.updateOne({ _id: user }, {
        $set: { name: player.name, gender: player.gender ?? "male", expiresAt: new Date(now.getTime() + PRESENCE_MS) },
      }, { upsert: true }),
      db.tables.updateOne({ hostId: user, expiresAt: { $gt: now } }, {
        $set: { expiresAt: new Date(now.getTime() + TABLE_MS) },
      }),
    ]);
  }
  const [people, waiting, playing, chat] = await Promise.all([
    db.presence.find({ expiresAt: { $gt: now } }).sort({ _id: 1 }).toArray(),
    db.tables.find({ expiresAt: { $gt: now } }).sort({ slot: 1 }).toArray(),
    db.matches.find({ ...activeHallMatches, deadline: { $gt: now.getTime() } }, {
      projection: { _id: 1, hallSlot: 1, players: 1, "state.options.mode": 1 },
    }).toArray(),
    db.chat.find({ expiresAt: { $gt: now } }).sort({ sentAt: -1, _id: -1 }).limit(30).toArray(),
  ]);
  const names = new Map(people.map(({ _id, name }) => [_id, name]));
  const missing = [...new Set([...waiting.map((table) => table.hostId), ...playing.map((match) => match.players[0])])]
    .filter((id) => !names.has(id));
  if (missing.length) {
    const hosts = await db.users.find({ _id: { $in: missing } }, { projection: { name: 1 } }).toArray();
    for (const host of hosts) names.set(host._id, host.name);
  }
  const tables: HallTable[] = waiting.map(({ _id, hostId, slot, rule, passwordHash }) => ({
    id: _id, hostId, host: names.get(hostId) ?? "Người chơi", slot, rule, locked: Boolean(passwordHash), playing: false,
  }));
  for (const match of playing) {
    const { mode } = match.state.options;
    if (mode === "drill" || match.hallSlot === undefined) continue;
    const hostId = match.players[0];
    tables.push({ id: match._id, hostId, host: names.get(hostId) ?? "Người chơi", slot: match.hallSlot, rule: mode, locked: false, playing: true });
  }
  return {
    people: people.map(({ _id, name, gender, motion }) => ({ id: _id, name, gender, ...(motion && { motion }) })),
    tables: tables.sort((first, second) => first.slot - second.slot),
    messages: chat.reverse().map(({ _id, playerId, name, text, sentAt }) => ({
      id: _id, playerId, name, text, sentAt: sentAt.getTime(),
    })),
  };
};

export const moveInHall = async (db: GameDatabase, user: string, motion: HallMotion) => {
  if (!isHallWalkable(motion.x, motion.z)) throw new GameError(400, "Vị trí trong sảnh không hợp lệ.");
  const player = await readPlayer(db, user);
  if (player.activeMatch) throw new GameError(409, "Bạn đang trong trận đấu.");
  await db.presence.updateOne({ _id: user }, { $set: {
    name: player.name, gender: player.gender ?? "male", motion,
    expiresAt: new Date(Date.now() + PRESENCE_MS),
  } }, { upsert: true });
};

export const openHallTable = async (db: GameDatabase, hostId: string, options: MatchOptions, password?: string) => {
  const passwordHash = password ? await hashPassword(password) : null;
  return transaction(db, async (session) => {
    await lockMatchmaking(db, session);
    const now = new Date();
    const playing = await db.matches.find(activeHallMatches, { session }).toArray();
    const occupied = new Set<number>();
    for (const match of playing) {
      if (!await expireMatch(db, session, match) && match.hallSlot !== undefined) occupied.add(match.hallSlot);
    }
    const player = await readPlayer(db, hostId, session);
    if (player.activeMatch) throw new GameError(409, "Bạn đang có trận đấu.");
    const waiting = await db.tables.find({ expiresAt: { $gt: now } }, { session }).toArray();
    if (waiting.some((table) => table.hostId === hostId)) return;
    for (const table of waiting) occupied.add(table.slot);
    const slot = Array.from({ length: HALL_CAPACITY }, (_, index) => index + 1).find((number) => !occupied.has(number));
    if (slot === undefined) throw new GameError(409, "Mọi bàn đều đang có người.");
    await db.queue.deleteOne({ _id: hostId }, { session });
    await db.tables.deleteOne({ hostId }, { session });
    await db.tables.insertOne({
      _id: randomUUID(), hostId, rule: options.rule, slot, passwordHash,
      expiresAt: new Date(now.getTime() + TABLE_MS),
    }, { session });
  });
};

export const joinHallTable = async (db: GameDatabase, guestId: string, id: string, password?: string) => {
  const invitation = await db.tables.findOne({ _id: id, expiresAt: { $gt: new Date() } });
  if (!invitation) throw new GameError(409, "Bàn này đã đóng hoặc đã đủ người.");
  if (invitation.hostId === guestId) throw new GameError(409, "Bạn đang là chủ bàn.");
  if (!await allowsJoin(invitation, password)) throw new GameError(403, "Mật khẩu bàn chưa đúng.");
  return transaction(db, async (session) => {
    await lockMatchmaking(db, session);
    const table = await db.tables.findOne({ _id: id, expiresAt: { $gt: new Date() } }, { session });
    if (!table) throw new GameError(409, "Bàn này đã đóng hoặc đã đủ người.");
    return createMatch(db, session, "online", { rule: table.rule }, table.hostId, guestId, table.slot);
  });
};

export const closeHallTable = (db: GameDatabase, hostId: string) =>
  db.tables.deleteOne({ hostId });

export const postHallMessage = async (db: GameDatabase, user: string, text: string) => {
  const player = await readPlayer(db, user);
  const now = new Date();
  // An atomic write limits every profile to one message per second across tabs.
  await db.presence.updateOne({ _id: user }, { $setOnInsert: {
    name: player.name, gender: player.gender ?? "male", expiresAt: now,
  } }, { upsert: true });
  const allowed = await db.presence.updateOne({
    _id: user, $or: [{ lastMessageAt: { $exists: false } }, { lastMessageAt: { $lte: new Date(now.getTime() - 1000) } }],
  }, { $set: { lastMessageAt: now, expiresAt: new Date(now.getTime() + PRESENCE_MS) } });
  if (!allowed.matchedCount) throw new GameError(429, "Chờ một chút trước khi gửi tiếp.");
  await db.chat.insertOne({
    _id: randomUUID(), playerId: user, name: player.name, text, sentAt: now, expiresAt: new Date(now.getTime() + CHAT_MS),
  });
};
