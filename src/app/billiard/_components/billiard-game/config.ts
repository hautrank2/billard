import {
  AIM_CAMERA_DEFAULT_PITCH, BALL_RADIUS, CAMERA_BASE_DISTANCE, MR_SUNG_BALL_COLORS,
  POCKET_DIAMETER, PREDATOR_BALL_COLORS,
} from "./constants";
import type { CameraView, GameOptions, RackHeight, TableId, TablePreset } from "./type";

export const TABLE = { width: 1.27, length: 2.54, radius: BALL_RADIUS };
export const FOOT_SPOT = -TABLE.length / 4;
export const HEAD_STRING = TABLE.length / 4;
export const KITCHEN_DIVIDER_X = TABLE.width / 6;
export const DEFAULT_OPTIONS: GameOptions = {
  tableId: "mr-sung",
  rackHeight: "high",
  mode: "nine",
  drill: "bank",
};
export const TABLE_PRESETS: Record<TableId, TablePreset> = {
  "mr-sung": {
    id: "mr-sung",
    name: "Mr Sung",
    outerWidth: 1.63,
    outerLength: 2.9,
    height: 0.8,
    cornerMouth: POCKET_DIAMETER,
    sideMouth: POCKET_DIAMETER,
    cloth: "#929a9d",
    cushion: "#747e83",
    body: "#383632",
    trim: "#a3a9ab",
    balls: MR_SUNG_BALL_COLORS,
    stripeCap: MR_SUNG_BALL_COLORS[8],
    numberStyle: "plain",
    cueMark: "dot",
  },
  predator: {
    id: "predator",
    name: "Predator",
    outerWidth: 1.65,
    outerLength: 2.9,
    height: 0.8,
    cornerMouth: POCKET_DIAMETER,
    sideMouth: POCKET_DIAMETER,
    cloth: "#008eca",
    cushion: "#1059a5",
    body: "#151719",
    trim: "#b79a4c",
    balls: PREDATOR_BALL_COLORS,
    stripeCap: PREDATOR_BALL_COLORS[0],
    numberStyle: "ring",
    cueMark: "triangle",
  },
};

export const rackApex = (height: RackHeight) =>
  FOOT_SPOT + (height === "high" ? 2 * TABLE.radius * Math.sqrt(3) * 1.003 : 0);

export const defaultCamera = (view: CameraView = "aim") => ({
  yaw: view === "overhead" ? 0 : 0.73,
  pitch: view === "aim" ? AIM_CAMERA_DEFAULT_PITCH
    : view === "overhead" ? Math.PI / 2 - 0.015 : 0.52,
  distance: CAMERA_BASE_DISTANCE,
  x: 0,
  z: 0,
});
