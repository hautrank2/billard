// Maximum visible cue travel in metres, from rest to a full-power pull.
export const CUE_PULLBACK_MAX = 0.55;
export const CUE_REST_GAP = 0.0075;
export const SHOT_DRAG_PIXELS_PER_PERCENT = 3.2;
// Live copy for the tuning panel; the constant above stays the default.
export const SHOT_INPUT_CONFIG = { dragPixelsPerPercent: SHOT_DRAG_PIXELS_PER_PERCENT };
export const SHOT_DRAG_DEAD_ZONE = 4;
export const CAMERA_BASE_DISTANCE = 3.65;
export const AIM_CAMERA_DEFAULT_PITCH = 0.4;
export const AIM_CAMERA_PITCH_STEP = 0.025;
export const SHOT_CAMERA_SETTLE_DISTANCE = 0.005;

export const CUE_PLACEMENT_KEY = "G";
export const SPIN_MAX_OFFSET = 0.85;
export const SPIN_ARROW_STEP = 0.1;
export const SPIN_PER_POINTER_PIXEL = 0.008;
// Keyboard aiming in radians: one tap, then a hold that speeds up; Shift is fine.
export const AIM_KEY_TAP = 0.0015;
export const AIM_KEY_FINE_TAP = 0.0003;
export const AIM_KEY_HOLD_DELAY = 0.22;
export const AIM_KEY_MIN_SPEED = 0.03;
export const AIM_KEY_MAX_SPEED = 0.7;
export const AIM_KEY_RAMP_SECONDS = 1.5;
export const AIM_KEY_FINE_SPEED = 0.012;
export const PLACEMENT_CLEARANCE = 0.008;
export const PLACEMENT_BALL_SPACING = 2.05;
export const RAIL_SIGHT_RADIUS = 0.004;

// The jump view looks down at 47° behind the cue ball and steepens as the
// cue rises, so a steep jump sees less of the table ahead. Its guide fades
// out after a distance that also shrinks with elevation.
export const JUMP_VIEW = {
  minPitch: 47,
  maxPitch: 72,
  minDistance: 0.85,
  maxDistance: 1.05,
  minLookAhead: 0.12,
  maxLookAhead: 0.42,
  guideFar: 0.9,
  guideNear: 0.22,
  guidePieces: 8,
} as const;
// J switches a normal stroke to the jump cue; E and R lower and raise it
// by this many degrees (a quarter with Shift).
export const JUMP_TOGGLE_KEY = "J";
export const ELEVATION_DOWN_KEY = "E";
export const ELEVATION_UP_KEY = "R";
export const ELEVATION_STEP = 1;
// P declares a push-out; T lays a drill out again, N moves to its next one.
export const PUSH_OUT_KEY = "P";
export const DRILL_RETRY_KEY = "T";
export const DRILL_NEXT_KEY = "N";

// Metres, kilograms and seconds in the simulation; editable input units below.
// Not frozen: the tuning panel writes coefficients here while playing.
export const PHYSICS_CONFIG = {
  ballMassGrams: 170,
  ballDiameterMm: 57.2,
  // Cloth: sliding friction until the ball rolls, then rolling resistance.
  slidingFriction: 0.2,
  rollingFriction: 0.048,
  spinningFriction: 0.024,
  // Share of the vertical speed a ball keeps bouncing off the slate.
  tableRestitution: 0.5,
  gravity: 9.81,
  // Ball–ball friction falls with slip speed: μ = min + range·e^(−decay·v).
  ballFrictionMin: 0.01,
  ballFrictionRange: 0.108,
  ballFrictionDecay: 0.58,
  ballRestitution: 0.9,
  // Cushion nose sits at 63.5% of the ball height; its bounce softens with speed.
  cushionHeightRatio: 0.635,
  cushionFriction: 0.2,
  cushionRestitution: 0.95,
  cushionRestitutionLoss: 0.04, // lost per m/s of normal speed
  cushionRestitutionMin: 0.7,
  // Centre-ball speed for the softest and the 100% stroke; the lift raises
  // the bottom half of the bar and is gone before 70%.
  minimumShotSpeed: 0.65,
  maximumShotSpeed: 7.5,
  powerCurve: 1.4,
  lowPowerLift: 1.2,
  stepSeconds: 1 / 240,
  maxSubstepTravel: 0.006,
  maxSubsteps: 8,
  predictionSeconds: 30,
  predictionSampleSteps: 4,
  cameraSafetyMargin: 0.06,
};
export const PHYSICS_DEFAULTS = Object.freeze({ ...PHYSICS_CONFIG });

export const BALL_MASS_KG = PHYSICS_CONFIG.ballMassGrams / 1000;
export const BALL_RADIUS = PHYSICS_CONFIG.ballDiameterMm / 2000;
export const BALL_INERTIA = 2 / 5 * BALL_MASS_KG * BALL_RADIUS ** 2;

// Top of the rail and cushions, measured above the cloth in metres.
export const RAIL_HEIGHT = 0.041;
export const POCKET_PROFILE = {
  diameterInBalls: 2,
  cushionDepth: 0.047,
  mouthRecess: 0.012,
  sideCutIn: 0.022,
  cornerCenterOffset: 0.004,
  cornerRadiusExtra: 0.007,
  linerDepth: 0.034,
  dropDepth: 0.15,
  throatScale: 0.82,
} as const;
export const POCKET_DIAMETER = BALL_RADIUS * 2 * POCKET_PROFILE.diameterInBalls;

// Each set lists the cue ball and 1–8; 9–15 are the stripes of 1–7.
const withStripes = (solids: string[]) => [...solids, ...solids.slice(1, 8)];
// Aramith Black: blue 2, red 3, pink 4, purple 5, green 6, brown 7; its
// stripes have black caps instead of white.
export const MR_SUNG_BALL_COLORS = withStripes([
  "#f6f1d8", "#f4c818", "#165cad", "#c91c38", "#f18cae",
  "#7951a5", "#24a58a", "#95502b", "#111418",
]);
// Predator Arcos II: purple 4, orange 5, green 6, maroon 7, white caps.
export const PREDATOR_BALL_COLORS = withStripes([
  "#f6f1d8", "#f2bd12", "#195da8", "#e73242", "#7a4b99",
  "#ed7920", "#008865", "#a25a27", "#171b20",
]);

export const cuePullback = (power: number) =>
  Math.max(0, Math.min(100, power)) / 100 * CUE_PULLBACK_MAX;
