import { BALL_RADIUS, SPIN_MAX_OFFSET } from "./constants";
import type { CueLoadout, CueMode, CueModel, CueType, Spin, Stroke } from "./type";

// Fractions of the ball radius in the plane perpendicular to the shaft.
export const cueTipOffset = (cue: CueModel, spin: Spin): Spin => {
  const scale = cue.maxTipOffset / SPIN_MAX_OFFSET;
  return { x: spin.x * scale, y: spin.y * scale };
};

export const cueContactPoint = (cue: CueModel, spin: Spin) => {
  const { x, y } = cueTipOffset(cue, spin);
  return {
    x: BALL_RADIUS * x,
    y: BALL_RADIUS * y,
    z: BALL_RADIUS * Math.sqrt(Math.max(0, 1 - x ** 2 - y ** 2)),
  };
};

// Short, with a thick butt and a hard tip: the most speed, the least spin.
const BREAK_CUE: CueModel = Object.freeze({
  id: "break-standard",
  name: "Phá tiêu chuẩn",
  type: "break",
  length: 0.95,
  tipRadius: 0.0056,
  buttRadius: 0.0125,
  color: "#5d4630",
  massGrams: 600,
  speedScale: 1.2,
  maxTipOffset: 0.7,
  minElevation: 0,
  maxElevation: 0,
  defaultElevation: 0,
  spread: 0,
});

// The playing cue, with the stroke values tuned before cues existed.
const GLIDE_CUE: CueModel = Object.freeze({
  id: "glide-standard",
  name: "Lướt tiêu chuẩn",
  type: "glide",
  length: 1.2,
  tipRadius: 0.0045,
  buttRadius: 0.009,
  color: "#a89675",
  massGrams: 540,
  speedScale: 1,
  maxTipOffset: 0.8,
  minElevation: 0,
  maxElevation: 0,
  defaultElevation: 0,
  spread: 0,
});

// A little shorter and much lighter than the playing cue. Raised steeply it
// drives the ball into the slate, which throws it into the air; the higher
// it is raised, the less accurate the stroke.
const JUMP_CUE: CueModel = Object.freeze({
  id: "jump-standard",
  name: "Nhảy tiêu chuẩn",
  type: "jump",
  length: 1.08,
  tipRadius: 0.005,
  buttRadius: 0.0085,
  color: "#8c7650",
  massGrams: 260,
  // Lighter and swung shorter: a full stroke still clears 20 cm, not half a metre.
  speedScale: 0.8,
  maxTipOffset: 0.7,
  minElevation: 15,
  maxElevation: 60,
  defaultElevation: 30,
  spread: 1,
});

export const STANDARD_CUES: Readonly<Record<CueType, CueModel>> = Object.freeze({
  break: BREAK_CUE,
  glide: GLIDE_CUE,
  jump: JUMP_CUE,
});

export const CUE_CATALOG: readonly CueModel[] = Object.freeze([
  BREAK_CUE, GLIDE_CUE, JUMP_CUE,
  Object.freeze({ ...GLIDE_CUE, id: "glide-walnut", name: "Lướt gỗ óc chó",
    color: "#815534", speedScale: 0.97, maxTipOffset: 0.83 }),
  Object.freeze({ ...BREAK_CUE, id: "break-graphite", name: "Phá graphite",
    color: "#475461", speedScale: 1.24, maxTipOffset: 0.65 }),
]);

export const CUE_TYPE_LABELS: Record<CueType, string> = {
  break: "Phá",
  glide: "Lướt",
  jump: "Nhảy",
};

export const DEFAULT_LOADOUT: CueLoadout = Object.freeze({
  break: BREAK_CUE.id,
  glide: GLIDE_CUE.id,
  jump: JUMP_CUE.id,
});

// A slot only takes a cue of its own type, so a cue never changes role;
// an unknown or mistyped id falls back to the standard cue of that type.
export const resolveCue = (loadout: CueLoadout, type: CueType) => {
  const chosen = CUE_CATALOG.find((cue) => cue.id === loadout[type]);
  return chosen?.type === type ? chosen : STANDARD_CUES[type];
};

// The break is always played with the break cue; later strokes use the
// cue the player picked.
export const strokeCueType = (breaking: boolean, mode: CueMode): CueType =>
  breaking ? "break" : mode;

export const clampElevation = (cue: CueModel, elevation: number) =>
  Math.max(cue.minElevation, Math.min(cue.maxElevation, elevation));

// 0 at the lowest elevation the cue allows, 1 at the highest.
export const elevationFraction = (cue: CueModel, elevation: number) =>
  cue.maxElevation > cue.minElevation
    ? (clampElevation(cue, elevation) - cue.minElevation) /
      (cue.maxElevation - cue.minElevation)
    : 0;

export const createStroke = (cue: CueModel, elevation = cue.defaultElevation): Stroke => ({
  cue,
  elevation: clampElevation(cue, elevation),
});

export const GLIDE_STROKE = createStroke(GLIDE_CUE);

// Standard deviation of the random aim error, in radians, for a stroke.
export const strokeSpread = (stroke: Stroke) => {
  const reach = elevationFraction(stroke.cue, stroke.elevation);
  return stroke.cue.spread * (0.2 + 0.8 * reach) * Math.PI / 180;
};
