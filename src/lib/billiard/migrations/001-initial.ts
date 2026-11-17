import type { GameDatabase } from "../models";

const ID = "001-initial";
const prices = {
  "break-standard": 0,
  "glide-standard": 0,
  "jump-standard": 0,
  "glide-walnut": 150,
  "break-graphite": 225,
};

export const initialMigration = async (db: GameDatabase) => {
  if (await db.migrations.findOne({ _id: ID })) return;
  await db.users.createIndex({ sessionHash: 1 }, {
    unique: true, partialFilterExpression: { sessionHash: { $type: "string" } },
  });
  await db.matches.createIndex({ players: 1, completedAt: -1 });
  await db.queue.createIndex({ rule: 1, table: 1, joinedAt: 1 });
  await db.queue.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.transactions.createIndex({ userId: 1, reference: 1 }, { unique: true });
  for (const [id, price] of Object.entries(prices)) {
    await db.cues.updateOne({ _id: id }, { $setOnInsert: { price } }, { upsert: true });
  }
  await db.migrations.updateOne({ _id: "matchmaking" }, { $setOnInsert: { sequence: 0 } }, { upsert: true });
  await db.migrations.updateOne({ _id: ID }, { $setOnInsert: { appliedAt: new Date() } }, { upsert: true });
};
