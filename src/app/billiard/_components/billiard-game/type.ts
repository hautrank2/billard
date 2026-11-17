import type { KeyboardEventHandler, PointerEventHandler } from "react";
import type { MatchView, ShotCommand } from "./match-types";

export type BilliardGameProps = {
  match?: MatchView;
  loadout?: CueLoadout;
  onShot?: (shot: ShotCommand) => Promise<void>;
  onBack?: () => void;
  onMatchAction?: (action: "resign" | "timeout" | "pass") => Promise<void>;
  onComputer?: () => void;
  matchBusy?: boolean;
  matchError?: string;
  turnSeconds?: number | null;
};

export type Vector2 = { x: number; z: number; };
export type Vector3 = { x: number; y: number; z: number; };
export type VisibilityProbe = (point: Vector2) => boolean;
export type Spin = { x: number; y: number; };
export type CameraView = "aim" | "overhead" | "spectator";
export type TableId = "mr-sung" | "predator";
export type RackHeight = "high" | "low";
export type GameRule = "eight" | "nine" | "ten";
// A full rack under one of the rules, or a one-shot practice drill.
export type GameMode = GameRule | "drill";
export type DrillId = "bank" | "kick" | "jump" | "cut" | "position";
export type GameOptions = {
  tableId: TableId;
  rackHeight: RackHeight;
  mode: GameMode;
  // Only read in drill mode; kept so the setup screen remembers it.
  drill: DrillId;
};
export type BallGroup = "solids" | "stripes";
// 9 and 10-ball: the stroke right after the break may be a push-out.
export type PushOut = "none" | "offered" | "declared";
export type RuleSpec = {
  name: string;
  label: string;
  // The ball that ends the rack.
  money: number;
  // Rows from the apex toward the foot rail.
  rack: number[][];
};
export type TablePreset = {
  id: TableId;
  name: string;
  outerWidth: number;
  outerLength: number;
  height: number;
  cornerMouth: number;
  sideMouth: number;
  cloth: string;
  cushion: string;
  body: string;
  trim: string;
  // Sixteen colours by ball number; 9–15 repeat 1–7 as stripes.
  balls: string[];
  stripeCap: string;
  // Arcos II rings its numbers; the Black set prints them plain.
  numberStyle: "plain" | "ring";
  cueMark: "dot" | "triangle";
};
// "roll" is sent once per rendered frame with the summed rolling speed;
// the other kinds are single impacts with their normal impact speed.
// "land" is an airborne ball coming down on the slate.
export type PhysicsEvent = {
  kind: "ball" | "rail" | "pocket" | "roll" | "land";
  speed: number;
  ballId: number;
  x: number;
};
// Each cue has one fixed role: a later cue rack can swap a cue only for
// another of the same type.
export type CueType = "break" | "glide" | "jump";
export type CueModel = {
  id: string;
  name: string;
  type: CueType;
  // Visible size in metres, from the tip ferrule to the butt.
  length: number;
  tipRadius: number;
  buttRadius: number;
  color: string;
  massGrams: number;
  // Multiplies the centre-ball speed the power bar gives.
  speedScale: number;
  // Tip offset at the edge of the spin control, as a fraction of R.
  maxTipOffset: number;
  // Cue elevation above level, in degrees, that this cue can be raised to.
  minElevation: number;
  maxElevation: number;
  defaultElevation: number;
  // Random aim error (standard deviation, degrees) at the top elevation.
  spread: number;
};
export type CueLoadout = Record<CueType, string>;
// The two cues a normal stroke can be played with; the break cue is
// taken automatically for the break.
export type CueMode = "glide" | "jump";
export type Stroke = { cue: CueModel; elevation: number };
export type SoundMode = { frequency: number; decay: number; gain: number };
export type ImpactVoice = {
  modes: SoundMode[];
  attack: number;
  click: number;
  clickDecay: number;
  clickTone: number;
  detune: number;
  duration: number;
};
export type PhysicsListener = (event: PhysicsEvent) => void;
export type VoicePlayback = {
  gain: number;
  brightness: number;
  pan: number;
  delay?: number;
  rate?: number;
};
export type PhysicsTuningKey =
  | "maximumShotSpeed"
  | "minimumShotSpeed"
  | "powerCurve"
  | "lowPowerLift"
  | "slidingFriction"
  | "rollingFriction"
  | "spinningFriction"
  | "tableRestitution"
  | "ballRestitution"
  | "ballFrictionMin"
  | "ballFrictionRange"
  | "ballFrictionDecay"
  | "cushionRestitution"
  | "cushionRestitutionLoss"
  | "cushionRestitutionMin"
  | "cushionFriction"
  | "cushionHeightRatio";
export type TuningKey = PhysicsTuningKey | "dragPixelsPerPercent";
export type TuningValues = Record<TuningKey, number>;
export type TuningField = {
  key: TuningKey;
  label: string;
  hint: string;
  unit: string;
  min: number;
  max: number;
  step: number;
};
export type TuningGroup = { id: string; title: string; fields: TuningField[] };
export type AudioBus = { dry: AudioNode; wet: AudioNode };
export type RollingVoice = { source: AudioBufferSourceNode; gain: GainNode };
export type SampleFile =
  | "hit"
  | "hit_strong"
  | "hit_strong_2"
  | "break"
  | "hole"
  | "setup";
// A cut from one recording, in seconds from the start of the file.
export type SampleClip = { file: SampleFile; start: number; end: number };
export type ClipName =
  | "cueSoft"
  | "cueStrong"
  | "clackLight"
  | "clackSoft"
  | "clackStrong"
  | "rackBurst"
  | "pocket"
  | "rack";
export type AudioController = {
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  play: (event: PhysicsEvent) => void;
  // `opening` marks the break, whose first contact plays the rack scatter.
  cue: (power: number, opening?: boolean) => void;
  // Balls being racked for a new game.
  rack: () => void;
  dispose: () => void;
};
export type CameraRig = {
  yaw: number;
  pitch: number;
  distance: number;
  x: number;
  z: number;
};
export type CushionPolygon = Vector2[];
export type ShotInput = {
  armed: boolean;
  pull: { x: number; y: number; pointerId: number } | null;
  power: number;
  firedPower: number | null;
};
export type ShotInputAction =
  | { kind: "arm" }
  | { kind: "cancel" }
  | { kind: "down" | "move"; x: number; y: number; pointerId: number }
  | { kind: "up"; pointerId: number };
export type Ball = Vector2 & {
  id: number;
  // Height of the centre above its resting height; above zero it flies.
  y: number;
  vx: number;
  vy: number;
  vz: number;
  // Angular velocity in rad/s; omegaY is side spin about the vertical axis.
  omegaX: number;
  omegaY: number;
  omegaZ: number;
  // Removed from play, either by a pot or by leaving the table.
  pocketed: boolean;
  offTable?: boolean;
};
export type BallContact = {
  a: Ball;
  b: Ball;
  normal: Vector2;
  approach: number;
  impulse: number;
};
export type RailTouch = Vector2 & { ballId: number; beforeContact: boolean };
export type Shot = {
  // Balls that may be hit first on this stroke.
  legal: number[];
  opening: boolean;
  pushOut: boolean;
  firstContact: number | null;
  pocketed: number[];
  offTable: number[];
  // Where each ball dropped, for drills that judge the pocket.
  drops: Record<number, Vector2>;
  railAfterContact: boolean;
  rails: RailTouch[];
  spin: Spin;
};
export type DrillZone = Vector2 & { radius: number };
export type DrillLayout = {
  balls: { id: number; x: number; z: number }[];
  // The ball the drill is about; any other object ball is in the way.
  target: number;
  zone?: DrillZone;
};
export type DrillResult = { success: boolean; note: string };
export type DrillSpec = {
  id: DrillId;
  name: string;
  goal: string;
  // The cue the drill starts with.
  cue: CueMode;
  layouts: DrillLayout[];
  judge: (game: GameState, shot: Shot, layout: DrillLayout) => DrillResult;
};
export type DrillState = {
  id: DrillId;
  variant: number;
  target: number;
  zone: DrillZone | null;
  attempts: number;
  made: number;
  // Set once the attempt has settled; the layout must be reset to try again.
  result: DrillResult | null;
};
export type GameState = {
  options: GameOptions;
  balls: Ball[];
  moving: boolean;
  shots: number;
  fouls: number;
  won: boolean;
  // 8-ball only: the 8 went down early or on a foul.
  lost: boolean;
  group: BallGroup | null;
  pushOut: PushOut;
  drill: DrillState | null;
  // ballInHand: placing right now; cueInHand: allowed to place before the next shot.
  ballInHand: boolean;
  cueInHand: boolean;
  message: string;
  shot: Shot | null;
};
export type GameSnapshot = Omit<GameState, "balls" | "shot"> & {
  ballIds: number[];
  pocketed: number[];
  offTable: number[];
  legal: number[];
  target: number;
  targetLabel: string;
  breaking: boolean;
  over: boolean;
};
export type SceneControls = {
  angle: number;
  power: number;
  spin: Spin;
  view: CameraView;
  guide: boolean;
  camera: CameraRig;
  navigation: Vector2;
  cuePull: number;
  cueMode: CueMode;
  // Jump cue elevation in degrees; a glide or break stroke stays level.
  elevation: number;
  loadout: CueLoadout;
};
export type SceneHandle = {
  dispose: () => void;
  pointOnTable: (x: number, y: number, height?: number) => Vector2 | null;
  isCueHit: (x: number, y: number) => boolean;
  predictShotCamera: (angle: number, power: number, spin: Spin, stroke: Stroke) => boolean;
  waitForShotCamera: () => Promise<boolean>;
  cancelShotCamera: () => void;
};
export type CameraShotResolver = (ready: boolean) => void;

export type BallChipProps = {
  number: number;
  pocketed?: boolean;
  offTable?: boolean;
  className?: string;
};

export type CueControlsProps = {
  cue: CueModel;
  cueMode: CueMode;
  elevation: number;
  breaking: boolean;
  disabled: boolean;
  pushOut: PushOut;
  onToggleJump: () => void;
  onElevation: (elevation: number) => void;
  onTogglePushOut: () => void;
};

export type RackPanelProps = {
  game: GameSnapshot;
  disabled: boolean;
  onRetry: () => void;
  onNext: () => void;
};

export type AimDrag = {
  x: number;
  y: number;
  angle: number;
  yaw: number;
  pitch: number;
};

export type GameSetupProps = {
  options: GameOptions;
  disabled: boolean;
  onChange: (options: GameOptions) => void;
  onApply: () => void;
  onCancel: () => void;
};


export type SpinControlProps = {
  cue: CueModel;
  spin: Spin;
  label: string;
  disabled: boolean;
  onPointer: PointerEventHandler<HTMLDivElement>;
  onKey: KeyboardEventHandler<HTMLDivElement>;
};

export type CueDrag = {
  pointerId: number;
  clientX: number;
  clientY: number;
  height: number;
  offset: Vector2;
};
// An aim key hold tracks its start, last frame, and Shift.
export type AimTurn = { frame: number; start: number; last: number; fine: boolean };
export type PlacementOrigin = { point: Vector2; view: CameraView };
