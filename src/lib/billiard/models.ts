import type { Collection, MongoClient } from "mongodb";

import type { GuestDetails, HallPlayer } from "../../app/_components/lobby/hall-types";
import type { MatchKind, MatchOptions, MatchResult, Seat, ShotReplay } from "../../app/billiard/_components/billiard-game/match-types";
import type { CueLoadout, GameState } from "../../app/billiard/_components/billiard-game/type";

export type User = {
  _id: string;
  name: string;
  sessionHash: string;
  coins: number;
  points: number;
  cues: string[];
  loadout: CueLoadout;
  activeMatch: string | null;
  googleId?: string;
  email?: string;
  registeredAt?: Date;
} & Partial<GuestDetails>;

export type Cue = { _id: string; price: number };

export type Match = {
  _id: string;
  kind: MatchKind;
  players: [string, string | null];
  turn: Seat;
  version: number;
  state: GameState;
  replay: ShotReplay | null;
  result: MatchResult | null;
  canPass: boolean;
  deadline: number | null;
  createdAt: Date;
  completedAt: Date | null;
  hallSlot?: number;
};

export type QueueEntry = MatchOptions & { _id: string; joinedAt: Date; expiresAt: Date };
export type WaitingTable = MatchOptions & {
  _id: string;
  hostId: string;
  slot: number;
  passwordHash: string | null;
  expiresAt: Date;
};
export type Presence = Omit<HallPlayer, "id"> & { _id: string; expiresAt: Date; lastMessageAt?: Date };
export type ChatMessage = {
  _id: string;
  playerId: string;
  name: string;
  text: string;
  sentAt: Date;
  expiresAt: Date;
};
export type CoinTransaction = {
  userId: string;
  reference: string;
  coins: number;
  points: number;
  createdAt: Date;
};
export type GameDatabase = {
  client: MongoClient;
  users: Collection<User>;
  cues: Collection<Cue>;
  matches: Collection<Match>;
  queue: Collection<QueueEntry>;
  transactions: Collection<CoinTransaction>;
  tables: Collection<WaitingTable>;
  presence: Collection<Presence>;
  chat: Collection<ChatMessage>;
  migrations: Collection<{ _id: string; sequence?: number; appliedAt?: Date }>;
};
