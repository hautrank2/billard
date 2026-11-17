import { MongoClient } from "mongodb";
import type { ClientSession } from "mongodb";

import { initialMigration } from "./migrations/001-initial";
import type { CoinTransaction, Cue, GameDatabase, Match, QueueEntry, User } from "./models";

export class GameError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const openDatabase = async (client: MongoClient, name: string): Promise<GameDatabase> => {
  const db = client.db(name);
  const game: GameDatabase = {
    client,
    users: db.collection<User>("user"),
    cues: db.collection<Cue>("cue"),
    matches: db.collection<Match>("black_nine_matches"),
    queue: db.collection<QueueEntry>("black_nine_matchmaking"),
    transactions: db.collection<CoinTransaction>("black_nine_coin_transactions"),
    migrations: db.collection<{ _id: string; sequence?: number; appliedAt?: Date }>("black_nine_migrations"),
  };
  await initialMigration(game);
  return game;
};

export const transaction = <T>(db: GameDatabase, operation: (session: ClientSession) => Promise<T>) =>
  db.client.withSession((session) => session.withTransaction(() => operation(session), {
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority" },
    maxCommitTimeMS: 5000,
  }));

let connection: Promise<GameDatabase> | undefined;

export const database = () => {
  if (connection) return connection;
  const uri = process.env.MONGODB_URI;
  const name = process.env.MONGODB_DB || "Billard";
  if (!uri) throw new GameError(503, "Máy chủ chưa cấu hình kết nối MongoDB.");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000, ignoreUndefined: true });
  connection = openDatabase(client, name).catch(async (error: unknown) => {
    connection = undefined;
    await client.close();
    console.error("Billiard database connection failed", error instanceof Error ? error.name : "");
    throw new GameError(503, "Không thể kết nối cơ sở dữ liệu. Hãy thử lại.");
  });
  return connection;
};
