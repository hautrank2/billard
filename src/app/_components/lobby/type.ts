import type { MatchOptions, ShotCommand } from "../../billiard/_components/billiard-game/match-types";
import type { GuestDetails } from "./hall-types";

type Versioned = { id: string; version: number };

export type LobbyAction =
  | { type: "profile"; name: string; details?: GuestDetails }
  | ({ type: "table-open"; password?: string } & MatchOptions)
  | { type: "table-join"; id: string; password?: string }
  | { type: "table-close" }
  | { type: "chat"; text: string }
  | { type: "cue"; id: string; action: "buy" | "equip" }
  | ({ type: "queue" | "practice" } & MatchOptions)
  | { type: "leave" }
  | ({ type: "shot"; shot: ShotCommand } & Versioned)
  | ({ type: "computer" } & Versioned)
  | ({ type: "manage"; action: "resign" | "timeout" | "pass" } & Versioned);
