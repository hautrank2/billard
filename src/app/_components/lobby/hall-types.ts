import type { GameRule } from "../../billiard/_components/billiard-game/type";

export const HALL_CAPACITY = 10;
export type Gender = "male" | "female";
export type GuestDetails = { gender: Gender; birthYear?: number; address?: string };
export type HallMotion = { x: number; z: number; y: number; yaw: number; pitch: number; sitting: boolean; action: "idle" | "hit" | "wave" };
export type HallPlayer = { id: string; name: string; gender: Gender; motion?: HallMotion };
export type HallTable = {
  id: string;
  slot: number;
  hostId: string;
  host: string;
  rule: GameRule;
  locked: boolean;
  playing: boolean;
};
export type HallMessage = { id: string; playerId: string; name: string; text: string; sentAt: number };
export type HallView = { people: HallPlayer[]; tables: HallTable[]; messages: HallMessage[] };
