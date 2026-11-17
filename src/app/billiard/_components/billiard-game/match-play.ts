import { BALL_RADIUS, PHYSICS_CONFIG } from "./constants";
import { createStroke, CUE_CATALOG, resolveCue, strokeCueType, strokeSpread } from "./cues";
import { placeCue, placeCueAtDefault, stepPhysics, strike } from "./engine";
import { ballGroup, isBreakShot, legalTargets } from "./rules";
import { pocketCenters } from "./table-geometry";
import type { Seat, ShotCommand, ShotReplay } from "./match-types";
import type { Ball, CueLoadout, GameState, Vector2 } from "./type";

export const otherSeat = (seat: Seat): Seat => seat === 0 ? 1 : 0;

export const replayShot = (game: GameState, shot: ShotReplay) => {
  const cueModel = CUE_CATALOG.find((cue) => cue.id === shot.cueId);
  if (!cueModel || (shot.placement && !game.cueInHand)) return false;
  if (game.cueInHand) {
    game.ballInHand = true;
    if (!(shot.placement ? placeCue(game, shot.placement) : placeCueAtDefault(game))) return false;
    game.ballInHand = false;
  }
  if (shot.pushOut) {
    if (game.pushOut !== "offered") return false;
    game.pushOut = "declared";
  }
  return strike(game, shot.angle, shot.power, shot.spin, createStroke(cueModel, shot.elevation));
};

export const resolveMatchShot = (initial: GameState, command: ShotCommand, loadout: CueLoadout) => {
  const game = structuredClone(initial);
  const type = strokeCueType(isBreakShot(game), command.mode);
  const stroke = createStroke(resolveCue(loadout, type), command.elevation);
  const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 2;
  const replay: ShotReplay = {
    ...command,
    angle: command.angle + noise * strokeSpread(stroke),
    cueId: stroke.cue.id,
  };
  if (!replayShot(game, replay) || !game.shot) return null;
  const shot = game.shot;
  // A bounded simulation uses the same fixed timestep as the Three.js scene.
  for (let step = 0; step < 20_000 && game.moving; step += 1) {
    stepPhysics(game, PHYSICS_CONFIG.stepSeconds);
  }
  if (game.moving) return null;

  const foul = game.fouls > initial.fouls;
  const canPass = shot.pushOut && !foul;
  const potted = shot.pocketed.some((id) => id > 0 &&
    (game.options.mode !== "eight" || (id !== 8 && (shot.opening || ballGroup(id) === game.group))));
  const keepsTurn = !foul && !canPass && potted;
  const terminal = game.won || game.lost;
  if (!keepsTurn && !terminal && game.group) {
    game.group = game.group === "solids" ? "stripes" : "solids";
  }
  if (foul && game.pushOut === "offered") {
    game.pushOut = "none";
    game.message = game.message.replace(" Cú tiếp theo được đánh an toàn (P).", "");
  }
  return { game, replay, canPass, keepsTurn };
};

const distance = (a: Vector2, b: Vector2) => Math.hypot(a.x - b.x, a.z - b.z);
const aimAt = (from: Vector2, to: Vector2) => Math.atan2(to.x - from.x, from.z - to.z);

const clearPath = (from: Vector2, to: Vector2, obstacles: Ball[]) => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return obstacles.every((ball) => {
    const along = Math.max(0, Math.min(1, ((ball.x - from.x) * dx + (ball.z - from.z) * dz) / (dx * dx + dz * dz)));
    return distance(ball, { x: from.x + dx * along, z: from.z + dz * along }) >= BALL_RADIUS * 2;
  });
};

export const chooseComputerShot = (initial: GameState): ShotCommand | null => {
  const game = structuredClone(initial);
  if (game.cueInHand) {
    game.ballInHand = true;
    if (!placeCueAtDefault(game)) return null;
  }
  const cue = game.balls.find((ball) => ball.id === 0);
  const legal = legalTargets(game);
  const balls = game.balls.filter((ball) => ball.id > 0 && !ball.pocketed);
  const targets = balls.filter((ball) => legal.includes(ball.id));
  const fallback = targets[0];
  if (!cue || !fallback) return null;

  const command: ShotCommand = {
    angle: aimAt(cue, fallback), power: isBreakShot(game) ? 92 : 45,
    spin: { x: 0, y: 0 }, mode: "glide", elevation: 0, pushOut: false,
  };
  if (game.cueInHand) command.placement = { x: cue.x, z: cue.z };
  if (isBreakShot(game)) return command;

  const pots = targets.flatMap((target) => pocketCenters(game.options.tableId).flatMap((pocket) => {
    const length = distance(target, pocket);
    if (length === 0) return [];
    const dx = (pocket.x - target.x) / length;
    const dz = (pocket.z - target.z) / length;
    const ghost = { x: target.x - BALL_RADIUS * 2 * dx, z: target.z - BALL_RADIUS * 2 * dz };
    const travel = distance(cue, ghost);
    if (travel < BALL_RADIUS || !length) return [];
    const alignment = ((ghost.x - cue.x) * dx + (ghost.z - cue.z) * dz) / travel;
    const obstacles = balls.filter((ball) => ball !== target);
    if (alignment < 0.35 || !clearPath(cue, ghost, obstacles) || !clearPath(target, pocket, obstacles)) return [];
    return [{ angle: aimAt(cue, ghost), power: Math.min(83, 30 + 18 * (travel + length) / alignment),
      cost: travel + length / alignment }];
  })).sort((a, b) => a.cost - b.cost);
  if (pots[0]) {
    return { ...command, angle: pots[0].angle + (Math.random() - 0.5) * 0.014, power: pots[0].power };
  }
  const openTarget = targets.find((target) => clearPath(cue, target, balls.filter((ball) => ball !== target)));
  return openTarget ? { ...command, angle: aimAt(cue, openTarget) } : command;
};
