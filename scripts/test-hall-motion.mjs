import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import * as THREE from "three";
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes("/src/") && specifier.startsWith(".") && !specifier.endsWith(".ts")) return next(`${specifier}.ts`, context);
  return next(specifier, context);
} });
const { AVATAR_HIP_HEIGHT, HALL_BOUNDS, SEAT_HEIGHT, hallSeats, hallSurfaceHeight, isHallWalkable, sofaPositions } = await import("../src/app/_components/lobby/hall-layout.ts");
const { createHallWalk } = await import("../src/app/_components/lobby/hall-walk.ts");
const { createAvatar } = await import("../src/app/_components/lobby/avatar.ts");
const { animateAvatar } = await import("../src/app/_components/lobby/avatar-motion.ts");
const { disposeGroup } = await import("../src/app/billiard/_components/billiard-game/table-scene.ts");
const noop = () => {};
// Controllers only require event subscriptions, not a browser or WebGL renderer.
const eventTarget = { addEventListener: noop, removeEventListener: noop };
globalThis.window = eventTarget;
globalThis.document = { ...eventTarget, pointerLockElement: null };
const create = () => createHallWalk(eventTarget, new THREE.PerspectiveCamera(), noop, noop);
const tick = (walk, frames = 1) => { for (let i = 0; i < frames; i++) walk.step(1 / 60, performance.now()); };

test("expanded room remains bounded; cushions are solid on foot and accessible above their surface", () => {
  assert.equal(isHallWalkable(17, 0), true);
  assert.equal(isHallWalkable(HALL_BOUNDS.x + .1, 0), false);
  for (const seat of hallSeats) {
    assert.equal(isHallWalkable(seat.x, seat.z, 0), false);
    assert.equal(isHallWalkable(seat.x, seat.z, seat.height), true);
    assert.equal(hallSurfaceHeight(seat.x, seat.z), seat.height);
  }
});
test("jump lands on a cushion, prevents double jumping, then falls to the floor when walking off", () => {
  const walk = create();
  const seat = hallSeats[0];
  Object.assign(walk.motion, { x: seat.x, z: seat.z + .75, yaw: 0 });
  walk.command("jump"); tick(walk, 12);
  const before = walk.motion.y;
  walk.command("jump"); tick(walk, 1);
  assert.ok(walk.motion.y - before < .04, "cannot reset launch velocity in the air");
  walk.command("forward"); tick(walk, 16); walk.command("forward", false);
  tick(walk, 60);
  assert.equal(walk.motion.y, SEAT_HEIGHT);
  assert.equal(hallSurfaceHeight(walk.motion.x, walk.motion.z), SEAT_HEIGHT);
  walk.motion.yaw = -Math.PI;
  walk.command("forward"); tick(walk, 35); walk.command("forward", false); tick(walk, 60);
  assert.equal(walk.motion.y, 0);
  walk.dispose();
});
test("sitting requires a nearby free chair, locks feet, and standing enables a jump from the cushion", () => {
  const walk = create(); walk.command("sit"); assert.equal(walk.motion.sitting, false);
  const seat = hallSeats[0];
  Object.assign(walk.motion, { x: seat.x, z: seat.z + .85 });
  walk.command("sit");
  assert.equal(walk.motion.sitting, true); assert.equal(walk.motion.y, SEAT_HEIGHT);
  const x = walk.motion.x; const z = walk.motion.z;
  walk.command("forward"); walk.command("jump"); tick(walk, 20);
  assert.equal(walk.motion.x, x); assert.equal(walk.motion.z, z); assert.equal(walk.motion.y, SEAT_HEIGHT);
  walk.command("sit"); walk.command("jump"); tick(walk, 10);
  assert.ok(walk.motion.y > SEAT_HEIGHT);
  walk.dispose();
});
test("occupied seats cannot be selected", () => {
  const walk = create(); const seat = hallSeats[0];
  walk.place("test", undefined, [{x: seat.x, z: seat.z}]);
  Object.assign(walk.motion, { x: seat.x, z: seat.z + .8 }); walk.command("sit");
  assert.equal(walk.motion.sitting, false); walk.dispose();
});
for (const gender of ["male", "female"]) test(`${gender}: walking swings opposing legs; sitting bends joints without flattening the body; punches recover`, () => {
  const model = createAvatar(gender); const rig = model.userData.rig;
  const motion = {x: 0, z: 0, y: 0, yaw: 0, pitch: 0, sitting: false, action: "idle"};
  for (let i = 0; i < 15; i++) { model.position.set(i * .04, 0, 0); animateAvatar(model, motion, 1 / 60, i * 16); }
  assert.ok(rig.leftHip.rotation.x * rig.rightHip.rotation.x < 0);
  motion.sitting = true; motion.y = SEAT_HEIGHT;
  for (let i = 0; i < 60; i++) { model.position.y = SEAT_HEIGHT; animateAvatar(model, motion, 1 / 60, 300 + i * 16); }
  assert.ok(Math.abs(rig.leftHip.rotation.x + Math.PI / 2) < .01);
  assert.ok(Math.abs(rig.leftKnee.rotation.x - Math.PI / 2) < .01);
  assert.equal(model.scale.x, model.scale.y);
  assert.ok(Math.abs(model.position.y + AVATAR_HIP_HEIGHT * model.scale.y - SEAT_HEIGHT) < 1e-8);
  motion.sitting = false; motion.y = 0; motion.action = "hit";
  for (let i = 0; i < 25; i++) { model.position.y = 0; animateAvatar(model, motion, 1 / 60, 1400 + i * 16); }
  assert.ok(rig.rightShoulder.rotation.x < -.7);
  for (let i = 25; i < 90; i++) { model.position.y = 0; animateAvatar(model, motion, 1 / 60, 1400 + i * 16); }
  assert.ok(Math.abs(rig.rightShoulder.rotation.x) < .03);
  let meshes = 0;
  model.traverse((node) => { if (node instanceof THREE.Mesh) meshes++; });
  assert.ok(meshes < 100, "fixed details must remain batched for a crowded hall");
  disposeGroup(model);
});

test("camera stays inside the room and keeps its distance when a wall is behind the player", () => {
  const camera = new THREE.PerspectiveCamera();
  const walk = createHallWalk(eventTarget, camera, noop, noop);
  Object.assign(walk.motion, { x: 0, z: -6.7, yaw: -Math.PI });
  tick(walk);
  const target = new THREE.Vector3(walk.motion.x, 1.25 * .85 + walk.motion.y, walk.motion.z);
  assert.ok(camera.position.distanceTo(target) > 2);
  assert.ok(Math.abs(camera.position.x) <= HALL_BOUNDS.x);
  assert.ok(Math.abs(camera.position.z) <= HALL_BOUNDS.z);
  walk.dispose();
});

test("sofa edges and corners support landings and allow walking back to the floor", () => {
  for (const sofa of sofaPositions) for (const side of [-1, 1]) {
    // These points are inside the collision padding but outside the old support.
    const x = sofa.x + side * 1.15;
    const z = sofa.z + (sofa.turned ? -.42 : .42);
    const walk = create();
    Object.assign(walk.motion, { x, z, y: 1.2, yaw: sofa.turned ? 0 : Math.PI });
    tick(walk, 90);
    assert.equal(walk.motion.y, SEAT_HEIGHT);
    assert.equal(isHallWalkable(x, z, walk.motion.y), true);
    walk.command("forward"); tick(walk, 25); walk.command("forward", false); tick(walk, 60);
    assert.equal(walk.motion.y, 0);
    assert.ok(Math.abs(walk.motion.z - z) > .7);
    assert.equal(isHallWalkable(walk.motion.x, walk.motion.z, 0), true);
    walk.dispose();
  }
});

test("coffee tables support landings and let players step off", () => {
  for (const sofa of sofaPositions) {
    const walk = create();
    const z = sofa.z + (sofa.turned ? -.72 : .72);
    Object.assign(walk.motion, { x: sofa.x, z, y: 1.2, yaw: -Math.PI / 2 });
    tick(walk, 90);
    assert.ok(walk.motion.y > .4);
    assert.equal(isHallWalkable(walk.motion.x, walk.motion.z, walk.motion.y), true);
    walk.command("forward"); tick(walk, 25); walk.command("forward", false); tick(walk, 60);
    assert.equal(walk.motion.y, 0);
    assert.ok(walk.motion.x > sofa.x + .7);
    walk.dispose();
  }
});

test("a player already below a sofa corner recovers onto its support", () => {
  const sofa = sofaPositions[0];
  const walk = create();
  Object.assign(walk.motion, { x: sofa.x + 1.15, z: sofa.z + .42, y: 0 });
  tick(walk, 2);
  assert.equal(walk.motion.y, SEAT_HEIGHT);
  walk.dispose();
});

test("former bar stool positions are clear floor with no sitting targets", () => {
  for (let index = 0; index < 5; index++) {
    const x = 14.7;
    const z = (-2.3 - 1.32 + index * .55) * 1.5;
    assert.equal(isHallWalkable(x, z), true);
    assert.equal(hallSurfaceHeight(x, z), 0);
    const walk = create();
    Object.assign(walk.motion, { x, z });
    walk.command("sit");
    assert.equal(walk.motion.sitting, false);
    walk.dispose();
  }
});

test("restoring an old bar stool sitting position stands on the floor", () => {
  const walk = create();
  walk.place("returning", { ...walk.motion, x: 14.7, z: -4, y: .605, sitting: true }, []);
  tick(walk);
  assert.equal(walk.motion.sitting, false);
  assert.equal(walk.motion.y, 0);
  walk.dispose();
});
