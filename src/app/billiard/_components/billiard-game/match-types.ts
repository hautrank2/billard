import type { CueLoadout, CueMode, CueType, GameRule, GameState, Spin, TableId, Vector2 } from "./type";

export type Seat = 0 | 1;
export type MatchKind = "online" | "ai";
export type MatchOptions = { rule: GameRule; table: TableId };
export type ShotCommand = {
  angle: number;
  power: number;
  spin: Spin;
  mode: CueMode;
  elevation: number;
  placement?: Vector2;
  pushOut: boolean;
};
export type ShotReplay = ShotCommand & { cueId: string };
export type MatchResult = { winner: Seat; reason: "rack" | "resigned" | "timeout" };
export type MatchView = {
  id: string;
  kind: MatchKind;
  opponent: string;
  seat: Seat;
  turn: Seat;
  version: number;
  game: GameState;
  replay: ShotReplay | null;
  result: MatchResult | null;
  canPass: boolean;
  deadline: number | null;
};
export type MatchHistory = MatchResult & {
  id: string;
  won: boolean;
  opponent: string;
  kind: MatchKind;
  rule: GameRule;
};
export type PlayerProfile = { id: string; name: string; coins: number; points: number; loadout: CueLoadout };
export type ShopCue = { id: string; name: string; type: CueType; price: number; owned: boolean };
export type LobbyView = {
  player: PlayerProfile | null;
  cues: ShopCue[];
  history: MatchHistory[];
  queued: MatchOptions | null;
  match: MatchView | null;
};
