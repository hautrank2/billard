import * as THREE from "three";
import { AVATAR_HIP_HEIGHT, AVATAR_SCALE, hallSurfaceHeight } from "./hall-layout";
import type { HallMotion } from "./hall-types";

type Rig = Record<"leftHip" | "rightHip" | "leftKnee" | "rightKnee" | "leftShoulder" | "rightShoulder" | "leftElbow" | "rightElbow" | "body", THREE.Group>;
type Animation = { x: number; z: number; y: number; phase: number; stride: number; action: string; started: number; landing: number; airborne: boolean };
const animations = new WeakMap<THREE.Group, Animation>();
const ease = (a: number, b: number, dt: number) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-dt * 16));

export function animateAvatar(model: THREE.Group, motion: HallMotion | undefined, dt: number, now: number) {
  const rig = model.userData.rig as Rig;
  if (!rig) return;
  let state = animations.get(model);
  if (!state) {
    state = { x: model.position.x, z: model.position.z, y: motion?.y ?? 0, phase: 0, stride: 0, action: "idle", started: now, landing: 0, airborne: false };
    animations.set(model, state);
  }
  const sitting = Boolean(motion?.sitting);
  const height = motion?.y ?? 0;
  const airborne = !sitting && height > hallSurfaceHeight(model.position.x, model.position.z) + .035;
  const distance = Math.hypot(model.position.x - state.x, model.position.z - state.z);
  const speed = Math.min(3, distance / Math.max(dt, .001));
  state.phase += distance * 8;
  state.stride = ease(state.stride, sitting || airborne ? 0 : Math.min(1, speed / 2.7), dt);
  if (state.airborne && !airborne) state.landing = 1;
  state.landing = Math.max(0, state.landing - dt * 5);
  const action = motion?.action ?? "idle";
  if (action !== state.action) { state.action = action; state.started = now; }
  const progress = Math.min(1, (now - state.started) / 650);
  // A single wind-up, extension and recovery instead of a repeating arm oscillation.
  const punch = action === "hit" ? Math.sin(Math.PI * progress) ** 2 : 0;
  const extension = action === "hit" ? Math.max(0, 1 - Math.abs(progress - .48) / .2) : 0;
  const tuck = airborne ? THREE.MathUtils.clamp(.35 + Math.max(0, height - state.y) / Math.max(dt, .001) * .15, .3, .9) : state.landing * .4;
  for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
    const swing = Math.sin(state.phase + (sign < 0 ? Math.PI : 0)) * state.stride;
    const hip = rig[`${side}Hip`];
    const knee = rig[`${side}Knee`];
    const shoulder = rig[`${side}Shoulder`];
    const elbow = rig[`${side}Elbow`];
    hip.rotation.x = ease(hip.rotation.x, sitting ? -Math.PI / 2 : swing * .6 - tuck * .65, dt);
    knee.rotation.x = ease(knee.rotation.x, sitting ? Math.PI / 2 : Math.max(0, -swing) * .85 + tuck * 1.4, dt);
    let arm = sitting ? -.2 : -swing * .5 - tuck * .3;
    let bend = sitting ? -.35 : -.13 - Math.max(0, swing) * .3;
    if (action === "hit") {
      arm = sign > 0 ? -punch * 1.5 : -.5 * punch;
      bend = sign > 0 ? -1.5 * punch * (1 - extension) : -.9 * punch;
    } else if (action === "wave" && sign > 0) {
      arm = -2.5; bend = -.4 + Math.sin(now * .014) * .35;
    }
    shoulder.rotation.x = ease(shoulder.rotation.x, arm, dt);
    shoulder.rotation.z = ease(shoulder.rotation.z, action === "wave" && sign > 0 ? -.35 : sign * .08, dt);
    elbow.rotation.x = ease(elbow.rotation.x, bend, dt);
  }
  rig.body.rotation.x = ease(rig.body.rotation.x, punch * .16 + (sitting ? .04 : state.stride * .06), dt);
  rig.body.rotation.y = ease(rig.body.rotation.y, -punch * .28 + Math.sin(state.phase) * state.stride * .055, dt);
  rig.body.position.y = AVATAR_HIP_HEIGHT + Math.abs(Math.sin(state.phase)) * state.stride * .025 - state.landing * .045;
  model.scale.setScalar(AVATAR_SCALE);
  // The motion height is the support surface; the hips rest on it when seated.
  if (sitting) model.position.y -= AVATAR_HIP_HEIGHT * AVATAR_SCALE;
  state.x = model.position.x; state.z = model.position.z; state.y = height; state.airborne = airborne;
}
