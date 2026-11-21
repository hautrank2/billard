import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";

import type { GuestDetails } from "../../app/_components/lobby/hall-types";
import { CUE_CATALOG, DEFAULT_LOADOUT } from "../../app/billiard/_components/billiard-game/cues";
import type { PlayerProfile, ShopCue } from "../../app/billiard/_components/billiard-game/match-types";
import { GameError, transaction } from "./db";
import type { GameDatabase, User } from "./models";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export const SESSION = "black_nine_session";

export const userBySession = async (db: GameDatabase, token: string | undefined) => {
  if (!token || !/^[\da-f]{64}$/.test(token)) return null;
  const user = await db.users.findOne({ sessionHash: digest(token) }, { projection: { _id: 1 } });
  return user?._id ?? null;
};

export const updateBalance = async (
  db: GameDatabase, session: ClientSession, userId: string, reference: string, coins: number, points = 0,
) => {
  const user = await readPlayer(db, userId, session);
  // Only identities verified by Google participate in the coin economy.
  if (!user.googleId) return;
  await db.transactions.insertOne({ userId, reference, coins, points, createdAt: new Date() }, { session });
  const updated = await db.users.updateOne(
    { _id: userId, coins: { $gte: coins < 0 ? -coins : 0 } },
    { $inc: { coins, points } }, { session },
  );
  if (updated.matchedCount !== 1) throw new GameError(409, "Bạn không đủ xu.");
};

export const createPlayer = (db: GameDatabase, name: string, details?: GuestDetails) => transaction(db, async (session) => {
  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  await db.users.insertOne({
    _id: id, name, sessionHash: digest(token), coins: 0, points: 0, activeMatch: null,
    cues: Object.values(DEFAULT_LOADOUT), loadout: { ...DEFAULT_LOADOUT }, ...details,
  }, { session });
  return { id, token };
});

export const savePlayer = (db: GameDatabase, id: string, name: string, details?: GuestDetails) =>
  db.users.updateOne({ _id: id }, {
    $set: { name, ...details },
    ...(details && { $unset: {
      ...(details.birthYear === undefined && { birthYear: "" }),
      ...(details.address === undefined && { address: "" }),
    } }),
  });

export const readPlayer = async (db: GameDatabase, id: string, session?: ClientSession) => {
  const user = await db.users.findOne({ _id: id }, { session });
  if (!user) throw new GameError(401, "Hồ sơ không còn khả dụng.");
  return user;
};

export const profile = (user: User): PlayerProfile => ({
  id: user._id, name: user.name, coins: user.googleId ? user.coins : 0, points: user.points, loadout: user.loadout,
  registered: Boolean(user.googleId), email: user.email,
  gender: user.gender, birthYear: user.birthYear, address: user.address,
});

export const shop = async (db: GameDatabase, owned: string[]): Promise<ShopCue[]> => {
  const rows = await db.cues.find({}).sort({ price: 1, _id: 1 }).toArray();
  return rows.flatMap(({ _id: id, price }) => {
    const cue = CUE_CATALOG.find((model) => model.id === id);
    return cue ? [{ id, price, owned: owned.includes(id), name: cue.name, type: cue.type }] : [];
  });
};

export const updateCueInventory = (db: GameDatabase, id: string, cueId: string, action: "buy" | "equip") =>
  transaction(db, async (session) => {
    const user = await readPlayer(db, id, session);
    if (action === "buy" && !user.googleId) throw new GameError(403, "Đăng ký bằng Gmail để nhận xu và mua gậy.");
    const cue = CUE_CATALOG.find((item) => item.id === cueId);
    const item = await db.cues.findOne({ _id: cueId }, { session });
    if (!cue || !item) throw new GameError(404, "Không tìm thấy gậy.");
    if (action === "equip") {
      if (!user.cues.includes(cueId)) throw new GameError(409, "Bạn chưa sở hữu gậy này.");
      await db.users.updateOne({ _id: id }, { $set: { [`loadout.${cue.type}`]: cueId } }, { session });
      return;
    }
    if (user.cues.includes(cueId)) return;
    if (user.coins < item.price) throw new GameError(409, "Bạn không đủ xu.");
    // Update the user first so concurrent purchases retry on a write conflict.
    await db.users.updateOne({ _id: id }, { $addToSet: { cues: cueId } }, { session });
    await updateBalance(db, session, id, `cue:${cueId}`, -item.price);
  });

// Called only after the server exchanges Google's authorization code and verifies userinfo.
export const signInGoogle = (db: GameDatabase, identity: { sub: string; email: string; name: string }, guestId: string | null) =>
  transaction(db, async (session) => {
    const existing = await db.users.findOne({ googleId: identity.sub }, { session });
    const guest = guestId ? await readPlayer(db, guestId, session) : null;
    if (guest?.activeMatch && existing?._id !== guestId) throw new GameError(409, "Hãy hoàn tất trận trước khi đổi tài khoản.");
    const token = randomBytes(32).toString("hex");
    if (existing) {
      await db.users.updateOne({ _id: existing._id }, { $set: { sessionHash: digest(token), email: identity.email } }, { session });
      return { id: existing._id, token };
    }
    const id = guest && !guest.googleId ? guest._id : randomUUID();
    if (id === guest?._id) {
      await db.users.updateOne({ _id: id }, { $set: {
        googleId: identity.sub, email: identity.email, registeredAt: new Date(), sessionHash: digest(token), coins: 0,
      } }, { session });
    } else {
      await db.users.insertOne({
        _id: id, name: identity.name.slice(0, 24), googleId: identity.sub, email: identity.email,
        registeredAt: new Date(), sessionHash: digest(token), coins: 0, points: 0, activeMatch: null,
        cues: Object.values(DEFAULT_LOADOUT), loadout: { ...DEFAULT_LOADOUT },
      }, { session });
    }
    await updateBalance(db, session, id, "gmail-starter", 200);
    return { id, token };
  });
