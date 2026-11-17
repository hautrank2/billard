import type { MatchOptions, ShotCommand } from "../../billiard/_components/billiard-game/match-types";

type Versioned = { id: string; version: number };

export type LobbyAction =
  | { type: "profile"; name: string }
  | { type: "cue"; id: string; action: "buy" | "equip" }
  | ({ type: "queue" | "practice" } & MatchOptions)
  | { type: "leave" }
  | ({ type: "shot"; shot: ShotCommand } & Versioned)
  | ({ type: "computer" } & Versioned)
  | ({ type: "manage"; action: "resign" | "timeout" | "pass" } & Versioned);
