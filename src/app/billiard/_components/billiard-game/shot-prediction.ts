import { Vector3 } from "three";
import type { PerspectiveCamera } from "three";

import { BALL_RADIUS, PHYSICS_CONFIG } from "./constants";
import { stepPhysics, strike } from "./engine";
import { aimTarget } from "./rules";
import type { GameState, Spin, Stroke, Vector2, VisibilityProbe } from "./type";

export const isBallInCameraView = (point: Vector2, camera: PerspectiveCamera) => {
  const position = new Vector3(point.x, BALL_RADIUS, point.z);
  const cameraSpace = position.clone().applyMatrix4(camera.matrixWorldInverse);
  const depth = -cameraSpace.z;
  if (depth <= camera.near + BALL_RADIUS || depth >= camera.far - BALL_RADIUS) return false;
  const projected = position.project(camera);
  const radiusX = BALL_RADIUS * camera.projectionMatrix.elements[0] / depth;
  const radiusY = BALL_RADIUS * camera.projectionMatrix.elements[5] / depth;
  const edge = 1 - 2 * PHYSICS_CONFIG.cameraSafetyMargin;
  return Math.abs(projected.x) + radiusX < edge && Math.abs(projected.y) + radiusY < edge;
};

// Run the same fixed-step physics on a private copy. No sound, score or live
// ball is changed while deciding whether the current first-person view fits.
export const predictShotLeavesView = (
  game: GameState,
  angle: number,
  power: number,
  spin: Spin,
  visible: VisibilityProbe,
  stroke?: Stroke,
) => {
  const simulation: GameState = {
    ...game,
    options: { ...game.options },
    balls: game.balls.map((ball) => ({ ...ball })),
    shot: null,
  };
  if (!strike(simulation, angle, power, spin, stroke)) return false;
  const tracked = new Set([0, aimTarget(game)?.id ?? 0]);
  const outside = () => simulation.balls.some((ball) =>
    tracked.has(ball.id) && !ball.pocketed && !visible(ball),
  );
  if (outside()) return true;
  const steps = Math.ceil(PHYSICS_CONFIG.predictionSeconds / PHYSICS_CONFIG.stepSeconds);
  for (let i = 0; i < steps && simulation.moving; i += 1) {
    stepPhysics(simulation, PHYSICS_CONFIG.stepSeconds);
    const contact = simulation.shot?.firstContact;
    if (contact !== null && contact !== undefined) tracked.add(contact);
    // An automatically respotted cue after a foul is not part of its path.
    if (!simulation.moving && simulation.ballInHand) break;
    if ((i % PHYSICS_CONFIG.predictionSampleSteps === 0 || !simulation.moving) && outside()) return true;
  }
  return false;
};
