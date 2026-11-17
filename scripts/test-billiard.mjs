import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/billiard/") && specifier.startsWith("./") && !specifier.endsWith(".ts")) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const engine = await import("../src/app/billiard/_components/billiard-game/engine.ts");
const {
  canPlaceCue, createDrill, createGame, finishShot, placeCue, placeCueAtDefault, snapshot,
  stepPhysics, strike, TABLE,
} = engine;
const {
  DEFAULT_OPTIONS, FOOT_SPOT, HEAD_STRING, KITCHEN_DIVIDER_X, TABLE_PRESETS, rackApex,
} = await import("../src/app/billiard/_components/billiard-game/config.ts");
const {
  aimTarget, ballGroup, isBreakShot, isOver, legalTargets, RULES, targetLabel,
} = await import("../src/app/billiard/_components/billiard-game/rules.ts");
const { DRILL_IDS, DRILLS } = await import("../src/app/billiard/_components/billiard-game/drills.ts");
const { cushionPolygons, isInPocket, pocketCenters, pocketRadius, sidePocketJaw } = await import("../src/app/billiard/_components/billiard-game/table-geometry.ts");
const { createPocketBoundary, createPocketPlate, createSidePocketFacing } = await import("../src/app/billiard/_components/billiard-game/pocket-shapes.ts");
const { cuePullback, CUE_PULLBACK_MAX, SHOT_DRAG_PIXELS_PER_PERCENT, SPIN_MAX_OFFSET } = await import("../src/app/billiard/_components/billiard-game/constants.ts");
const { createShotInput, reduceShotInput } = await import("../src/app/billiard/_components/billiard-game/shot-input.ts");
const { createShotCameraTransition } = await import("../src/app/billiard/_components/billiard-game/shot-camera-transition.ts");

const { BALL_INERTIA, BALL_MASS_KG, BALL_RADIUS, PHYSICS_CONFIG, POCKET_PROFILE } = await import("../src/app/billiard/_components/billiard-game/constants.ts");
const { createStroke, resolveCue, STANDARD_CUES, strokeCueType, DEFAULT_LOADOUT, CUE_CATALOG, strokeSpread } = await import("../src/app/billiard/_components/billiard-game/cues.ts");

// The game ships play-tested coefficients that may be retuned at any time.
// Physics behaviour is checked against measured pool values instead
// (Alciatore, Leckie & Greenspan, Mathavan), so a retune cannot hide a bug.
const REFERENCE_PHYSICS = {
  maximumShotSpeed: 5,
  minimumShotSpeed: 0.1,
  powerCurve: 1.7,
  // The lift is a feel setting for the power bar, not measured physics.
  lowPowerLift: 0,
  slidingFriction: 0.2,
  rollingFriction: 0.015,
  spinningFriction: 0.024,
  // Slate under cloth returns about half of a ball's vertical speed.
  tableRestitution: 0.5,
  ballRestitution: 0.94,
  ballFrictionMin: 0.00995,
  ballFrictionRange: 0.108,
  ballFrictionDecay: 1.088,
  cushionRestitution: 0.95,
  cushionRestitutionLoss: 0.06,
  cushionRestitutionMin: 0.7,
  cushionFriction: 0.2,
  cushionHeightRatio: 0.635,
};
const SHIPPED_PHYSICS = { ...PHYSICS_CONFIG };
Object.assign(PHYSICS_CONFIG, REFERENCE_PHYSICS);
const {
  cushionRestitution, resolveBallCluster, resolveBallContact, resolveCushionContact, shotSpeed,
} = await import("../src/app/billiard/_components/billiard-game/contact-physics.ts");
const { isBallInCameraView, predictShotLeavesView } = await import("../src/app/billiard/_components/billiard-game/shot-prediction.ts");
const { PerspectiveCamera, Raycaster, Vector3, Mesh, MeshBasicMaterial, ShapeGeometry, Shape, DoubleSide } = await import("three");

test("all six circular cups are uncovered by cloth or rail, with no black leaks outside their rims", () => {
  for (const preset of Object.values(TABLE_PRESETS)) {
    const rail = new Shape();
    const w = preset.outerWidth / 2;
    const l = preset.outerLength / 2;
    rail.moveTo(-w, -l);
    rail.lineTo(w, -l);
    rail.lineTo(w, l);
    rail.lineTo(-w, l);
    rail.closePath();
    rail.holes.push(createPocketBoundary(preset.id, true));
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const centers = pocketCenters(preset.id);
    const plates = centers.map((center) => createPocketPlate(preset.id, center));
    const surfaces = [rail, createPocketBoundary(preset.id, false), ...plates].map((shape) =>
      new Mesh(new ShapeGeometry(shape, 96), material));
    for (const [index, center] of centers.entries()) {
      const radius = pocketRadius(preset.id, index % 3 === 1);
      for (let i = 0; i < 96; i += 1) {
        const angle = i * Math.PI * 2 / 96;
        for (const scale of [0, 0.97, 1.03]) {
          const x = center.x + Math.cos(angle) * radius * scale;
          const z = center.z + Math.sin(angle) * radius * scale;
          const ray = new Raycaster(new Vector3(x, -z, 1), new Vector3(0, 0, -1));
          assert.equal(ray.intersectObjects(surfaces).length > 0, scale > 1,
            `${preset.id} cup ${index}, angle ${i}, radius ${scale}`);
        }
      }
    }
    surfaces.forEach((mesh) => mesh.geometry.dispose());
    material.dispose();
  }
});

test("side pocket facings bridge both jaws without covering the well", () => {
  const material = new MeshBasicMaterial();
  for (const tableId of Object.keys(TABLE_PRESETS)) {
    const { nose, bevel, back } = sidePocketJaw(tableId);
    for (const center of pocketCenters(tableId).filter((point) => point.z === 0)) {
      const radius = pocketRadius(tableId, true);
      const geometry = createSidePocketFacing(tableId, center);
      const facing = new Mesh(geometry, material);
      for (const end of [-1, 1]) {
        facing.scale.set(Math.sign(center.x), 1, end);
        facing.updateMatrixWorld(true);
        for (const [from, to] of [[nose, bevel], [bevel, back]]) {
          for (const t of [0.1, 0.5, 0.9]) {
            const x = from.x + (to.x - from.x) * t;
            const jawZ = from.z + (to.z - from.z) * t;
            const rimZ = Math.sqrt(radius ** 2 - (x - Math.abs(center.x)) ** 2);
            const ray = new Raycaster(
              new Vector3(Math.sign(center.x) * x, 1, end * (jawZ + rimZ) / 2),
              new Vector3(0, -1, 0),
            );
            assert.equal(ray.intersectObject(facing).length, 1);
            ray.ray.origin.z = end * (rimZ - 0.001);
            assert.equal(ray.intersectObject(facing).length, 0);
          }
        }
      }
      geometry.dispose();
    }
  }
  material.dispose();
});

const settle = (game) => {
  for (let i = 0; i < 240 * 45 && game.moving; i += 1) {
    stepPhysics(game, 1 / 240);
  }
  assert.equal(game.moving, false, "Every shot must come to rest");
  for (const ball of game.balls) {
    assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.z));
    assert.equal(Math.hypot(ball.vx, ball.vz), 0);
  }
};

test("automatic overhead transition displays the settled view before launching the saved shot", async () => {
  const game = createGame();
  const before = structuredClone(game.balls);
  const transition = createShotCameraTransition();
  const launch = transition.wait().then((ready) => {
    if (ready) strike(game, 0, 65, { x: 0.4, y: -0.3 });
  });
  for (const settled of [false, false, true, false, true]) {
    transition.afterRender(settled);
    await Promise.resolve();
    assert.deepEqual(game.balls, before);
    assert.equal(game.shots, 0);
    assert.equal(game.moving, false);
  }
  transition.afterRender(true);
  await launch;
  assert.equal(game.shots, 1);
  assert.equal(game.moving, true);
  assert.deepEqual(game.shot.spin, { x: 0.4, y: -0.3 });
  const expected = createGame();
  strike(expected, 0, 65, { x: 0.4, y: -0.3 });
  assert.deepEqual(game.balls, expected.balls);
});

test("cancelling a camera transition cannot launch a deferred shot", async () => {
  const game = createGame();
  const transition = createShotCameraTransition();
  const launch = transition.wait().then((ready) => {
    if (ready) strike(game, 0, 65, { x: 0, y: 0 });
  });
  transition.afterRender(true);
  transition.cancel();
  transition.afterRender(true);
  await launch;
  assert.equal(game.shots, 0);
  assert.equal(game.moving, false);
});

test("rack has nine separated balls, 1 at apex and 9 in the center", () => {
  const game = createGame();
  assert.deepEqual(game.balls.map((ball) => ball.id).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(game.balls.find((ball) => ball.id === 9).x, 0);
  const objects = game.balls.filter((ball) => ball.id > 0);
  assert.equal(objects.reduce((a, b) => a.z > b.z ? a : b).id, 1);
  objects.forEach((a, i) => objects.slice(i + 1).forEach((b) => {
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= TABLE.radius * 2);
  }));
});

test("full-power break hits 1 first, spreads the rack, and settles", () => {
  const game = createGame();
  assert.ok(strike(game, 0, 100, { x: 0, y: 0 }));
  assert.equal(strike(game, 0, 100, { x: 0, y: 0 }), false);
  for (let i = 0; i < 240; i += 1) stepPhysics(game, 1 / 240);
  assert.equal(game.shot.firstContact, 1);
  assert.ok(game.balls.filter((ball) => ball.id > 0 && Math.abs(ball.x) > 0.12).length >= 3);
  settle(game);
});

test("a full stun hit hands almost all speed to the object ball", () => {
  const game = createGame();
  game.balls = game.balls.slice(0, 2);
  Object.assign(game.balls[0], { x: 0, z: 0.2 });
  Object.assign(game.balls[1], { x: 0, z: 0 });
  strike(game, 0, 60, { x: 0, y: 0 });
  for (let i = 0; i < 35; i += 1) stepPhysics(game, 1 / 240);
  assert.equal(game.shot.firstContact, 1);
  assert.ok(game.balls[1].vz < -1);
  // Still sliding at contact, so the cue keeps only the restitution loss.
  assert.ok(Math.abs(game.balls[0].vz) < 0.1 * Math.abs(game.balls[1].vz));
});

test("follow and draw come from tip height, then cloth friction", () => {
  const simulate = (spin) => {
    const game = createGame();
    game.balls = game.balls.slice(0, 2);
    Object.assign(game.balls[0], { x: 0, z: 0.2 });
    Object.assign(game.balls[1], { x: 0, z: 0 });
    // Draw wears off quickly on cloth, so it needs a firm stroke to survive.
    strike(game, 0, 70, { x: 0, y: spin });
    for (let i = 0; i < 240 && game.shot.firstContact === null; i += 1) {
      stepPhysics(game, 1 / 240);
    }
    const atContact = game.balls[0].vz;
    for (let i = 0; i < 120; i += 1) stepPhysics(game, 1 / 240);
    return { atContact, later: game.balls[0].vz };
  };
  const follow = simulate(0.8);
  const draw = simulate(-0.8);
  // Right after contact the cue nearly stops in both cases ...
  assert.ok(Math.abs(follow.atContact) < 0.2 && Math.abs(draw.atContact) < 0.2);
  // ... then retained topspin drives it forward and backspin pulls it back.
  assert.ok(follow.later < -0.2);
  assert.ok(draw.later > 0.2);
});

test("a centre-ball shot slides first and then rolls at five sevenths", () => {
  const game = createGame();
  game.balls = [game.balls[0]];
  Object.assign(game.balls[0], { x: 0, z: 1 });
  strike(game, 0, 40, { x: 0, y: 0 });
  const cue = game.balls[0];
  const launch = -cue.vz;
  assert.ok(cue.omegaX === 0);
  for (let i = 0; i < 240; i += 1) stepPhysics(game, 1 / 240);
  // Rolling without slip: v = ω R about the horizontal axis.
  assert.ok(Math.abs(cue.vz - cue.omegaX * TABLE.radius) < 1e-9);
  const sliding = 2 * launch / (7 * PHYSICS_CONFIG.slidingFriction * PHYSICS_CONFIG.gravity);
  const rolling = 5 / 7 * launch -
    PHYSICS_CONFIG.rollingFriction * PHYSICS_CONFIG.gravity * (1 - sliding);
  assert.ok(Math.abs(-cue.vz - rolling) < 1e-9);
});

test("natural roll at 0.4 R needs no sliding phase", () => {
  const game = createGame();
  game.balls = [game.balls[0]];
  const height = 0.4 / STANDARD_CUES.glide.maxTipOffset * SPIN_MAX_OFFSET;
  strike(game, 0, 50, { x: 0, y: height });
  const cue = game.balls[0];
  assert.ok(Math.abs(cue.vz - cue.omegaX * TABLE.radius) < 1e-9);
});

test("off-centre hits trade launch speed for spin, side spin sets omegaY", () => {
  const centre = createGame();
  const side = createGame();
  strike(centre, 0, 50, { x: 0, y: 0 });
  strike(side, 0, 50, { x: SPIN_MAX_OFFSET, y: 0 });
  assert.ok(Math.abs(side.balls[0].vz) < Math.abs(centre.balls[0].vz));
  assert.ok(side.balls[0].omegaY > 0);
  assert.equal(centre.balls[0].omegaY, 0);
});

test("power curve keeps soft and medium shots realistic", () => {
  assert.ok(Math.abs(shotSpeed(100) - PHYSICS_CONFIG.maximumShotSpeed) < 1e-12);
  assert.ok(Math.abs(shotSpeed(0) - PHYSICS_CONFIG.minimumShotSpeed) < 1e-12);
  assert.ok(shotSpeed(50) < 2);
  for (let p = 1; p <= 100; p += 1) assert.ok(shotSpeed(p) > shotSpeed(p - 1));
});

test("shipped physics: a soft full hit sends the object ball about a metre, slowing evenly", () => {
  try {
    Object.assign(PHYSICS_CONFIG, SHIPPED_PHYSICS);
    const game = createGame();
    const rest = { y: 0, vx: 0, vy: 0, vz: 0, omegaX: 0, omegaY: 0, omegaZ: 0, pocketed: false };
    game.balls = [{ id: 0, x: 0, z: 0.6, ...rest }, { id: 1, x: 0, z: 0, ...rest }];
    strike(game, 0, 20, { x: 0, y: 0 });
    const object = game.balls[1];
    const speeds = [];
    for (let i = 0; i < 240 * 20 && game.moving; i += 1) {
      stepPhysics(game, 1 / 240);
      const speed = Math.hypot(object.vx, object.vz);
      if (speed > 0) speeds.push(speed);
    }
    const travel = -object.z;
    const seconds = speeds.length / 240;
    assert.ok(travel > 0.8 && travel < 1.3, `travel ${travel}`);
    assert.ok(seconds > 1.5, `stopped after ${seconds}s`);
    // Once rolling, the object ball loses the same speed every second.
    const rollingFrom = speeds.findIndex((speed, index) => index > 0 &&
      Math.abs(speeds[index - 1] - speed - PHYSICS_CONFIG.rollingFriction * PHYSICS_CONFIG.gravity / 240) < 1e-9);
    assert.ok(rollingFrom > 0 && rollingFrom < speeds.length / 2);
    for (let index = rollingFrom + 1; index < speeds.length - 1; index += 1) {
      const drop = (speeds[index - 1] - speeds[index]) * 240;
      assert.ok(Math.abs(drop - PHYSICS_CONFIG.rollingFriction * PHYSICS_CONFIG.gravity) < 1e-6);
    }
  } finally {
    Object.assign(PHYSICS_CONFIG, REFERENCE_PHYSICS);
  }
});

test("the low-power lift strengthens the bottom of the bar without moving its ends", () => {
  try {
    Object.assign(PHYSICS_CONFIG, SHIPPED_PHYSICS);
    const plain = (power) => {
      PHYSICS_CONFIG.lowPowerLift = 0;
      const speed = shotSpeed(power);
      PHYSICS_CONFIG.lowPowerLift = SHIPPED_PHYSICS.lowPowerLift;
      return speed;
    };
    assert.ok(Math.abs(shotSpeed(0) - PHYSICS_CONFIG.minimumShotSpeed) < 1e-12);
    assert.ok(Math.abs(shotSpeed(100) - PHYSICS_CONFIG.maximumShotSpeed) < 1e-12);
    for (const power of [10, 20, 30, 40]) assert.ok(shotSpeed(power) > plain(power) * 1.15, `${power}%`);
    for (const power of [70, 80, 90]) assert.ok(shotSpeed(power) < plain(power) * 1.02, `${power}%`);
    // The bar must keep rising across the whole panel range of both settings.
    for (let curve = 1; curve <= 3; curve += 0.25) {
      for (let lift = 0; lift <= 1.5; lift += 0.25) {
        Object.assign(PHYSICS_CONFIG, { powerCurve: curve, lowPowerLift: lift });
        for (let power = 0.5; power <= 100; power += 0.5) {
          assert.ok(shotSpeed(power) > shotSpeed(power - 0.5), `${curve} ${lift} ${power}`);
        }
      }
    }
  } finally {
    Object.assign(PHYSICS_CONFIG, REFERENCE_PHYSICS);
  }
});

test("cluster contacts on the break split the impact symmetrically without adding energy", () => {
  const r = TABLE.radius;
  const apex = { id: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: -3, omegaX: 0, omegaY: 0, omegaZ: 0, pocketed: false };
  const left = { ...apex, id: 2, x: -r, z: -Math.sqrt(3) * r, vz: 0 };
  const right = { ...apex, id: 3, x: r, z: -Math.sqrt(3) * r, vz: 0 };
  const total = () => [apex, left, right].reduce((sum, ball) => sum + kineticEnergy(ball), 0);
  const before = total();
  const normal = (a, b) => {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    return { x: (b.x - a.x) / d, z: (b.z - a.z) / d };
  };
  resolveBallCluster([
    { a: apex, b: left, normal: normal(apex, left), approach: 0, impulse: 0 },
    { a: apex, b: right, normal: normal(apex, right), approach: 0, impulse: 0 },
  ]);
  assert.ok(Math.abs(apex.vx) < 1e-9);
  assert.ok(Math.abs(left.vx + right.vx) < 1e-9 && Math.abs(left.vz - right.vz) < 1e-9);
  assert.ok(left.vz < -1);
  assert.ok(total() <= before + 1e-12);
});

test("a scratch gives ball in hand and prevents shooting until placed", () => {
  const game = createGame();
  Object.assign(game.balls[0], { x: 0.4, z: 0 });
  strike(game, Math.PI / 2, 35, { x: 0, y: 0 });
  settle(game);
  assert.equal(game.ballInHand, true);
  assert.equal(game.fouls, 1);
  assert.match(game.message, /Bi cái rơi lỗ/);
  assert.equal(strike(game, 0, 10, { x: 0, y: 0 }), false);
  assert.equal(placeCue(game, { x: 0, z: -0.55 }), false);
  assert.equal(placeCue(game, { x: 1, z: 0 }), false);
  assert.equal(placeCue(game, { x: 0.3, z: 0.5 }), true);
});

test("wrong first contact respots a potted 9 and does not win", () => {
  const game = createGame();
  strike(game, 0, 40, { x: 0, y: 0 });
  game.shot.firstContact = 2;
  game.shot.pocketed = [9];
  game.balls.find((ball) => ball.id === 9).pocketed = true;
  finishShot(game);
  assert.equal(game.won, false);
  assert.equal(game.fouls, 1);
  assert.equal(game.balls.find((ball) => ball.id === 9).pocketed, false);
  assert.equal(game.ballInHand, true);
});

test("a legal 9 wins, and no further shot is accepted", () => {
  const game = createGame();
  strike(game, 0, 40, { x: 0, y: 0 });
  game.shot.firstContact = 1;
  game.shot.pocketed = [9];
  finishShot(game);
  assert.equal(game.won, true);
  assert.equal(game.fouls, 0);
  assert.equal(strike(game, 0, 10, { x: 0, y: 0 }), false);
});

test("no rail after contact is a foul, a rail makes it legal", () => {
  for (const rail of [false, true]) {
    const game = createGame();
    strike(game, 0, 40, { x: 0, y: 0 });
    game.shot.firstContact = 1;
    game.shot.railAfterContact = rail;
    finishShot(game);
    assert.equal(game.fouls, rail ? 0 : 1);
  }
});

test("repeated shots keep all active balls inside the table", () => {
  const game = createGame();
  for (let i = 0; i < 25 && !game.won; i += 1) {
    game.ballInHand = false;
    strike(game, i * 2.399, 15 + i % 5 * 20, { x: 0.5, y: -0.5 });
    settle(game);
    game.balls.filter((ball) => !ball.pocketed).forEach((ball) => {
      assert.ok(Math.abs(ball.x) <= TABLE.width / 2 + 0.036);
      assert.ok(Math.abs(ball.z) <= TABLE.length / 2 + 0.036);
    });
  }
});


test("rack height puts the selected anchor at the cross on either table", () => {
  for (const tableId of ["mr-sung", "predator"]) {
    for (const rackHeight of ["high", "low"]) {
      const game = createGame({ ...DEFAULT_OPTIONS, tableId, rackHeight });
      const anchor = game.balls.find((ball) => ball.id === (rackHeight === "high" ? 9 : 1));
      assert.ok(Math.abs(anchor.z - FOOT_SPOT) < 0.000001);
      assert.equal(game.options.tableId, tableId);
    }
  }
  assert.ok(rackApex("high") > rackApex("low"));
});

test("all pocket cups remain inside each table frame", () => {
  for (const tableId of ["mr-sung", "predator"]) {
    const preset = TABLE_PRESETS[tableId];
    const centers = pocketCenters(tableId);
    assert.equal(centers.length, 6);
    for (const [index, center] of centers.entries()) {
      const radius = pocketRadius(tableId, index % 3 === 1);
      assert.ok(Math.abs(center.x) + radius < preset.outerWidth / 2);
      assert.ok(Math.abs(center.z) + radius < preset.outerLength / 2);
    }
  }
});

test("all six mouths accept a direct shot, with exactly one pocket sound event", () => {
  for (const tableId of ["mr-sung", "predator"]) {
    for (const side of [-1, 1]) {
      for (const end of [-1, 0, 1]) {
        const game = createGame({ ...DEFAULT_OPTIONS, tableId, rackHeight: "high" });
        game.balls = [game.balls[0]];
        const cue = game.balls[0];
        Object.assign(cue, { x: side * 0.35, z: end * 0.98 });
        const target = { x: side * TABLE.width / 2, z: end * TABLE.length / 2 };
        const angle = Math.atan2(target.x - cue.x, -(target.z - cue.z));
        const events = [];
        strike(game, angle, 45, { x: 0, y: 0 });
        for (let i = 0; i < 2400 && game.moving; i += 1) {
          stepPhysics(game, 1 / 240, (event) => events.push(event));
        }
        assert.equal(events.filter((event) => event.kind === "pocket").length, 1, `${tableId}: ${side}, ${end}`);
        assert.equal(game.moving, false);
      }
    }
  }
});

test("a soft ball drops into the side pocket at the cloth edge", () => {
  for (const tableId of Object.keys(TABLE_PRESETS)) {
    const game = createGame({ ...DEFAULT_OPTIONS, tableId });
    strike(game, 0, 20, { x: 0, y: 0 });
    const ball = game.balls.find(({ id }) => id === 1);
    game.balls = [game.balls[0], ball];
    Object.assign(ball, { x: TABLE.width / 2 - 0.045, z: 0.02, vx: 0.14, omegaZ: -0.14 / TABLE.radius });
    settle(game);
    assert.deepEqual(snapshot(game).pocketed, [1]);
    assert.ok(ball.x < TABLE.width / 2);
  }
});

test("shallow mouths accept playable off-center shots before the jaws bounce them out", () => {
  for (const tableId of Object.keys(TABLE_PRESETS)) {
    for (const middle of [true, false]) {
      const normal = middle ? { x: 1, z: 0 } : { x: Math.SQRT1_2, z: Math.SQRT1_2 };
      const inset = (TABLE_PRESETS[tableId].cornerMouth / Math.SQRT2 + POCKET_PROFILE.mouthRecess) / 2;
      const mouth = middle ? { x: TABLE.width / 2, z: 0 }
        : { x: TABLE.width / 2 - inset, z: TABLE.length / 2 - inset };
      for (const [degrees, offset] of [[-35, -0.02], [35, 0.02], [0, -0.03], [0, 0.03]]) {
        const angle = degrees * Math.PI / 180;
        const dx = normal.x * Math.cos(angle) - normal.z * Math.sin(angle);
        const dz = normal.z * Math.cos(angle) + normal.x * Math.sin(angle);
        const game = createGame({ ...DEFAULT_OPTIONS, tableId });
        const ball = game.balls[1];
        game.balls = [ball];
        game.moving = true;
        Object.assign(ball, {
          x: mouth.x - normal.z * offset - dx * 0.12,
          z: mouth.z + normal.x * offset - dz * 0.12,
          vx: dx * 1.8, vz: dz * 1.8,
          omegaX: dz * 1.8 / TABLE.radius, omegaZ: -dx * 1.8 / TABLE.radius,
        });
        const events = [];
        for (let i = 0; i < 55 && !ball.pocketed; i += 1) {
          stepPhysics(game, 1 / 240, (event) => events.push(event.kind));
        }
        assert.deepEqual(events, ["pocket"], `${tableId}, ${middle ? "side" : "corner"}, ${degrees}°, ${offset} m`);
      }
    }
  }
});

test("opening cue placement is restricted to the marked kitchen", () => {
  const game = createGame();
  game.ballInHand = true;
  assert.equal(placeCue(game, { x: 0, z: 0 }), false);
  assert.equal(placeCue(game, { x: 0.5, z: 0.9 }), true);
  assert.equal(placeCue(game, { x: 0.2, z: 0.9 }), true);
  game.shots = 1;
  assert.equal(placeCue(game, { x: -0.5, z: 0 }), true);
});

test("releasing the mouse with Space held fires exactly the chosen power", () => {
  let input = reduceShotInput(createShotInput(), { kind: "arm" });
  input = reduceShotInput(input, { kind: "down", pointerId: 7, x: 20, y: 40 });
  input = reduceShotInput(input, { kind: "move", pointerId: 7, x: 20, y: 40 + 50 * SHOT_DRAG_PIXELS_PER_PERCENT });
  assert.equal(input.power, 50);
  input = reduceShotInput(input, { kind: "up", pointerId: 7 });
  assert.equal(input.armed, false);
  assert.equal(input.firedPower, 50);
});

test("releasing Space, Escape, blur, and pointer cancellation disarm without firing", () => {
  let input = reduceShotInput(createShotInput(), { kind: "arm" });
  input = reduceShotInput(input, { kind: "down", pointerId: 1, x: 0, y: 0 });
  input = reduceShotInput(input, { kind: "move", pointerId: 1, x: 0, y: 100 * SHOT_DRAG_PIXELS_PER_PERCENT });
  assert.equal(input.power, 100);
  input = reduceShotInput(input, { kind: "cancel" });
  input = reduceShotInput(input, { kind: "up", pointerId: 1 });
  assert.equal(input.firedPower, null);
  assert.equal(input.armed, false);
  assert.equal(input.pull, null);
});

test("a click or a different pointer cannot fire a pulled shot", () => {
  let input = reduceShotInput(createShotInput(), { kind: "arm" });
  input = reduceShotInput(input, { kind: "down", pointerId: 1, x: 0, y: 0 });
  input = reduceShotInput(input, { kind: "up", pointerId: 1 });
  assert.equal(input.firedPower, null);
  input = reduceShotInput(input, { kind: "arm" });
  input = reduceShotInput(input, { kind: "down", pointerId: 1, x: 0, y: 0 });
  input = reduceShotInput(input, { kind: "move", pointerId: 1, x: 0, y: 220 });
  input = reduceShotInput(input, { kind: "up", pointerId: 2 });
  assert.equal(input.firedPower, null);
  assert.equal(input.armed, true);
});


test("three kitchen rectangles are equal and all accept the break ball", () => {
  const edges = [-TABLE.width / 2, -KITCHEN_DIVIDER_X, KITCHEN_DIVIDER_X, TABLE.width / 2];
  const game = createGame();
  game.ballInHand = true;
  for (let i = 0; i < 3; i += 1) {
    assert.ok(Math.abs(edges[i + 1] - edges[i] - TABLE.width / 3) < 1e-10);
    assert.equal(placeCue(game, { x: (edges[i] + edges[i + 1]) / 2, z: 0.95 }), true);
    assert.equal(placeCue(game, { x: (edges[i] + edges[i + 1]) / 2, z: HEAD_STRING }), true);
    assert.equal(placeCue(game, { x: (edges[i] + edges[i + 1]) / 2, z: HEAD_STRING - 0.000001 }), false);
  }
  assert.equal(placeCue(game, { x: 0, z: HEAD_STRING - 0.05 }), false);
});

test("pulling back up reaches zero even with horizontal pointer drift", () => {
  let input = reduceShotInput(createShotInput(), { kind: "arm" });
  input = reduceShotInput(input, { kind: "down", pointerId: 1, x: 100, y: 100 });
  input = reduceShotInput(input, { kind: "move", pointerId: 1, x: 125, y: 100 + 100 * SHOT_DRAG_PIXELS_PER_PERCENT });
  assert.equal(input.power, 100);
  input = reduceShotInput(input, { kind: "move", pointerId: 1, x: 150, y: 100 });
  assert.equal(input.power, 0);
  input = reduceShotInput(input, { kind: "up", pointerId: 1 });
  assert.equal(input.firedPower, null);
  assert.equal(input.armed, true);
  const game = createGame();
  assert.equal(strike(game, 0, 0, { x: 0, y: 0 }), false);
  assert.equal(game.shots, 0);
  assert.equal(game.moving, false);
  assert.equal(Math.hypot(game.balls[0].vx, game.balls[0].vz), 0);
});

test("cue pullback uses the configurable maximum with a true zero", () => {
  assert.equal(cuePullback(0), 0);
  assert.equal(cuePullback(100), CUE_PULLBACK_MAX);
  assert.equal(cuePullback(50), CUE_PULLBACK_MAX / 2);
  assert.equal(cuePullback(-100), 0);
  assert.equal(cuePullback(200), CUE_PULLBACK_MAX);
});

test("placement starts centered on the kitchen line and supports clicked points without overlap", () => {
  const game = createGame({ ...DEFAULT_OPTIONS, tableId: "predator", rackHeight: "low" });
  const cue = game.balls.find((ball) => ball.id === 0);
  assert.equal(cue.x, 0);
  assert.equal(cue.z, HEAD_STRING);
  game.ballInHand = true;
  assert.ok(placeCue(game, { x: 0.3, z: HEAD_STRING }));
  assert.equal(cue.x, 0.3);
  assert.ok(placeCueAtDefault(game));
  assert.deepEqual({ x: cue.x, z: cue.z }, { x: 0, z: HEAD_STRING });
  const target = game.balls.find((ball) => ball.id === 1);
  Object.assign(target, { x: 0, z: HEAD_STRING });
  assert.ok(placeCueAtDefault(game));
  assert.ok(Math.hypot(cue.x - target.x, cue.z - target.z) >= TABLE.radius * 2);
  assert.equal(placeCue(game, { x: target.x, z: target.z }), false);
  const reset = createGame(game.options);
  assert.deepEqual(reset.options, game.options);
  assert.equal(reset.shots, 0);
  assert.ok(reset.balls.every((ball) => !ball.pocketed && ball.vx === 0 && ball.vz === 0));
});

test("dragging past the kitchen line stops the cue ball at the line without changing click placement", () => {
  const game = createGame();
  game.ballInHand = true;
  const cue = game.balls[0];
  const point = { x: 0.28, z: HEAD_STRING - 0.2 };

  assert.equal(placeCue(game, point), false);
  assert.ok(placeCue(game, point, { clampToBounds: true }));
  assert.equal(cue.x, point.x);
  assert.equal(cue.z, HEAD_STRING);

  Object.assign(game.balls[1], { x: 0.1, z: HEAD_STRING });
  assert.equal(placeCue(game, { ...point, x: 0.1 }, { clampToBounds: true }), false);
  assert.equal(cue.x, point.x);
  assert.equal(cue.z, HEAD_STRING);
});

test("reduced shot power and cloth friction keep a slow isolated ball within its stopping distance", () => {
  const game = createGame();
  game.balls = [game.balls[0]];
  Object.assign(game.balls[0], { x: 0, z: 0 });
  strike(game, 0, 25, { x: 0, y: 0 });
  const speed = Math.hypot(game.balls[0].vx, game.balls[0].vz);
  // Sliding at μs until v = 5/7 v0, then rolling resistance at μr.
  const rolling = 5 / 7 * speed;
  const distance = (speed ** 2 - rolling ** 2) /
    (2 * PHYSICS_CONFIG.slidingFriction * PHYSICS_CONFIG.gravity) +
    rolling ** 2 / (2 * PHYSICS_CONFIG.rollingFriction * PHYSICS_CONFIG.gravity);
  assert.ok(speed < 1);
  let travel = 0;
  for (let i = 0; i < 2400 && game.moving; i += 1) {
    // A foul respots the cue when it stops, so sample its last rolling position.
    travel = Math.max(travel, -game.balls[0].z);
    stepPhysics(game, PHYSICS_CONFIG.stepSeconds);
  }
  assert.equal(game.moving, false);
  assert.ok(Math.abs(travel - distance) < 0.005);
  assert.ok(distance < TABLE.length / 2);
});


const contactBall = (id, vx, vz, omegaY = 0, omegaX = 0, omegaZ = 0) => ({
  id, x: id * 2 * BALL_RADIUS, y: 0, z: 0, vx, vy: 0, vz, omegaX, omegaY, omegaZ, pocketed: false,
});
// Declared as a function so earlier tests can use it before this line runs.
function kineticEnergy(ball) {
  return 0.5 * BALL_MASS_KG * (ball.vx ** 2 + (ball.vy ?? 0) ** 2 + ball.vz ** 2) +
    0.5 * BALL_INERTIA * (ball.omegaX ** 2 + ball.omegaY ** 2 + ball.omegaZ ** 2);
}

test("physical ball settings use 170 grams and a 57.2 mm diameter", () => {
  assert.equal(PHYSICS_CONFIG.ballMassGrams, 170);
  assert.equal(PHYSICS_CONFIG.ballDiameterMm, 57.2);
  assert.equal(BALL_MASS_KG, 0.17);
  assert.ok(Math.abs(TABLE.radius * 2000 - 57.2) < 1e-12);
  const game = createGame();
  strike(game, 0, 100, { x: 0, y: 0 });
  assert.ok(Math.abs(game.balls[0].vz + PHYSICS_CONFIG.maximumShotSpeed) < 1e-12);
});

test("glancing ball contact transfers tangential velocity and spin without losing momentum", () => {
  const a = contactBall(0, 2, 1);
  const b = contactBall(1, 0.2, -0.3);
  const beforeEnergy = kineticEnergy(a) + kineticEnergy(b);
  const beforeX = a.vx + b.vx;
  const beforeZ = a.vz + b.vz;
  resolveBallContact(a, b, { x: 1, z: 0 });
  assert.ok(a.vz < 1);
  assert.ok(b.vz > -0.3);
  assert.ok(Math.abs(a.omegaY) > 0);
  assert.ok(Math.abs(b.omegaY) > 0);
  assert.ok(Math.abs(a.vx + b.vx - beforeX) < 1e-12);
  assert.ok(Math.abs(a.vz + b.vz - beforeZ) < 1e-12);
  assert.ok(kineticEnergy(a) + kineticEnergy(b) <= beforeEnergy + 1e-12);
});

test("side spin throws the contacted ball through friction", () => {
  const a = contactBall(0, 2, 0, 40);
  const b = contactBall(1, 0, 0);
  const before = kineticEnergy(a) + kineticEnergy(b);
  resolveBallContact(a, b, { x: 1, z: 0 });
  assert.ok(a.vz > 0 && b.vz < 0);
  assert.ok(b.omegaY < 0);
  assert.ok(kineticEnergy(a) + kineticEnergy(b) <= before + 1e-12);
});

test("cushion friction reduces sliding and converts it to rotation", () => {
  const ball = contactBall(0, 2, 1);
  const before = kineticEnergy(ball);
  assert.equal(resolveCushionContact(ball, { x: -1, z: 0 }), 2);
  assert.ok(Math.abs(ball.vx + 2 * cushionRestitution(2)) < 1e-12);
  assert.ok(ball.vz > 0 && ball.vz < 1);
  assert.ok(Math.abs(ball.omegaY) > 0);
  assert.ok(kineticEnergy(ball) < before);
});

test("cushions bounce softer at speed and take topspin off a rolling ball", () => {
  assert.ok(cushionRestitution(0.5) > cushionRestitution(3));
  assert.ok(cushionRestitution(50) >= PHYSICS_CONFIG.cushionRestitutionMin);
  const speed = 1.5;
  const ball = contactBall(0, 0, -speed, 0, -speed / BALL_RADIUS);
  const before = kineticEnergy(ball);
  resolveCushionContact(ball, { x: 0, z: 1 });
  assert.ok(ball.vz > 0);
  // The nose sits above the equator, so forward roll is mostly removed.
  assert.ok(Math.abs(ball.omegaX) < 0.3 * speed / BALL_RADIUS);
  assert.ok(kineticEnergy(ball) < before);
});

test("contact friction never adds kinetic energy over varied side spins", () => {
  for (let i = -10; i <= 10; i += 1) {
    const normal = { x: Math.cos(i * 0.47), z: Math.sin(i * 0.47) };
    const tangent = { x: -normal.z, z: normal.x };
    const a = contactBall(0, 2 * normal.x + i * 0.1 * tangent.x, 2 * normal.z + i * 0.1 * tangent.z, i * 8, i * 6, -i * 4);
    const b = contactBall(1, 0.2 * normal.x - 0.3 * tangent.x, 0.2 * normal.z - 0.3 * tangent.z, -i * 3, i * 2, i * 5);
    const before = kineticEnergy(a) + kineticEnergy(b);
    resolveBallContact(a, b, normal);
    assert.ok(kineticEnergy(a) + kineticEnergy(b) <= before + 1e-12);
    const railBefore = kineticEnergy(a);
    if (a.vx > 0) resolveCushionContact(a, { x: -1, z: 0 });
    else resolveCushionContact(a, { x: 1, z: 0 });
    assert.ok(kineticEnergy(a) <= railBefore + 1e-12);
  }
});

test("the side jaws flare toward the well while the straight noses keep their position", () => {
  for (const tableId of ["mr-sung", "predator"]) {
    const preset = TABLE_PRESETS[tableId];
    const polygons = cushionPolygons(tableId);
    const long = polygons[3];
    assert.ok(Math.abs(long[0].x - TABLE.width / 2 - POCKET_PROFILE.mouthRecess) < 1e-12);
    assert.ok(Math.abs(long[1].x - TABLE.width / 2) < 1e-12);
    assert.ok(Math.abs(long[2].x - TABLE.width / 2) < 1e-12);
    assert.ok(Math.abs(long[1].z) < Math.abs(long[0].z) && Math.abs(long[0].z) < Math.abs(long[5].z));
    assert.ok(POCKET_PROFILE.throatScale < 1);
    for (const polygon of polygons) {
      let turn = 0;
      polygon.forEach((point, index) => {
        const b = polygon[(index + 1) % polygon.length];
        const c = polygon[(index + 2) % polygon.length];
        const cross = (b.x - point.x) * (c.z - b.z) - (b.z - point.z) * (c.x - b.x);
        if (Math.abs(cross) > 1e-12) {
          if (turn) assert.equal(Math.sign(cross), turn, "Cushion must stay convex for collision resolution");
          turn = Math.sign(cross);
        }
      });
    }
    assert.ok(preset.cornerMouth > PHYSICS_CONFIG.ballDiameterMm / 1000);
  }
});

test("shot prediction is read-only and leaves safe shots in the current camera", () => {
  const game = createGame();
  const before = JSON.stringify(game);
  assert.equal(predictShotLeavesView(game, 0, 1, { x: 0, y: 0 }, () => true), false);
  assert.equal(JSON.stringify(game), before);
  assert.equal(predictShotLeavesView(game, 0, 0, { x: 0, y: 0 }, () => false), false);
});

test("prediction detects the cue leaving view before a side-pocket scratch", () => {
  const game = createGame();
  assert.equal(predictShotLeavesView(game, Math.PI / 2, 45, { x: 0, y: 0 }, (point) => Math.abs(point.x) < 0.3), true);
});

test("prediction also detects the object ball leaving while the cue stays in view", () => {
  const game = createGame();
  game.balls = game.balls.slice(0, 2);
  Object.assign(game.balls[0], { x: 0, z: 0.2 });
  Object.assign(game.balls[1], { x: 0, z: 0 });
  assert.equal(predictShotLeavesView(game, 0, 25, { x: 0, y: 0 }, (point) => point.z > -0.08), true);
});

test("camera visibility considers ball radius and keeps a small real first-person shot", () => {
  const camera = new PerspectiveCamera(49, 1.45, 0.015, 30);
  camera.position.set(0, 0.58, 1.69);
  camera.lookAt(0, 0.005, 0.34);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  assert.equal(isBallInCameraView({ x: 0, z: 0.69 }, camera), true);
  assert.equal(isBallInCameraView({ x: 50, z: 0 }, camera), false);
  assert.equal(isBallInCameraView({ x: 0, z: 3 }, camera), false);
  assert.equal(predictShotLeavesView(createGame(), 0, 1, { x: 0, y: 0 }, (point) => isBallInCameraView(point, camera)), false);
});


test("pocket capture reaches the cloth but stays inside the curved openings", () => {
  for (const tableId of ["mr-sung", "predator"]) {
    const centers = pocketCenters(tableId);
    const w = TABLE.width / 2;
    assert.equal(isInPocket({ x: w - 0.018, z: 0 }, tableId), true);
    assert.equal(isInPocket({ x: w - 0.024, z: 0 }, tableId), false);
    assert.equal(isInPocket({ x: w, z: pocketRadius(tableId, true) }, tableId), false);
    centers.forEach((center) => assert.equal(isInPocket(center, tableId), true));
  }
});

test("the cue ball can be re-placed only before the break or after a foul", () => {
  const game = createGame();
  assert.equal(canPlaceCue(game), true);
  strike(game, 0, 40, { x: 0, y: 0 });
  assert.equal(game.cueInHand, false);
  game.shot.firstContact = 1;
  game.shot.railAfterContact = true;
  finishShot(game);
  assert.equal(canPlaceCue(game), false);
  strike(game, 0, 40, { x: 0, y: 0 });
  game.shot.firstContact = null;
  finishShot(game);
  assert.equal(game.ballInHand, true);
  assert.equal(canPlaceCue(game), true);
});

test("tuning writes live physics values, clamps them, and restores defaults", async () => {
  const { applyTuning, DEFAULT_TUNING, formatTuning, readTuning, TUNING_FIELDS } =
    await import("../src/app/billiard/_components/billiard-game/physics-tuning.ts");
  const { SHOT_INPUT_CONFIG } = await import("../src/app/billiard/_components/billiard-game/constants.ts");
  try {
    applyTuning({ maximumShotSpeed: 3, rollingFriction: -1, dragPixelsPerPercent: 5 });
    assert.equal(PHYSICS_CONFIG.maximumShotSpeed, 3);
    assert.ok(Math.abs(shotSpeed(100) - 3) < 1e-12);
    // Rolling friction can never reach zero, or a ball would never stop.
    assert.ok(PHYSICS_CONFIG.rollingFriction > 0);
    assert.equal(SHOT_INPUT_CONFIG.dragPixelsPerPercent, 5);
    const exported = JSON.parse(formatTuning(readTuning()));
    assert.deepEqual(Object.keys(exported).sort(), TUNING_FIELDS.map((field) => field.key).sort());
    for (const field of TUNING_FIELDS) {
      assert.ok(field.min <= DEFAULT_TUNING[field.key] && DEFAULT_TUNING[field.key] <= field.max, field.key);
    }
    applyTuning(DEFAULT_TUNING);
    assert.equal(PHYSICS_CONFIG.maximumShotSpeed, SHIPPED_PHYSICS.maximumShotSpeed);
    assert.equal(SHOT_INPUT_CONFIG.dragPixelsPerPercent, SHOT_DRAG_PIXELS_PER_PERCENT);
  } finally {
    Object.assign(PHYSICS_CONFIG, REFERENCE_PHYSICS);
    SHOT_INPUT_CONFIG.dragPixelsPerPercent = SHOT_DRAG_PIXELS_PER_PERCENT;
  }
});

test("the shipped play-tested coefficients still settle every shot on the table", () => {
  try {
    Object.assign(PHYSICS_CONFIG, SHIPPED_PHYSICS);
    const game = createGame();
    for (let i = 0; i < 12 && !game.won; i += 1) {
      game.ballInHand = false;
      strike(game, i === 0 ? 0 : i * 2.399, i === 0 ? 100 : 20 + i % 4 * 25, { x: 0.4, y: -0.5 });
      settle(game);
      game.balls.filter((ball) => !ball.pocketed).forEach((ball) => {
        assert.ok(Math.abs(ball.x) <= TABLE.width / 2 + 0.036);
        assert.ok(Math.abs(ball.z) <= TABLE.length / 2 + 0.036);
      });
    }
  } finally {
    Object.assign(PHYSICS_CONFIG, REFERENCE_PHYSICS);
  }
});

// --- Rules: 8, 9 and 10-ball, push-out -------------------------------------

const rackOf = (mode, rackHeight = "high", tableId = "mr-sung") =>
  createGame({ ...DEFAULT_OPTIONS, mode, rackHeight, tableId });
const ballById = (game, id) => game.balls.find((ball) => ball.id === id);
// Plays the stroke on paper: the outcome is written, then judged.
const judge = (game, outcome) => {
  assert.ok(strike(game, 0, 40, { x: 0, y: 0 }));
  Object.assign(game.shot, { railAfterContact: true }, outcome);
  for (const id of outcome.pocketed ?? []) ballById(game, id).pocketed = true;
  finishShot(game);
};

test("each rule racks its own balls, money ball in the middle, anchor on the cross", () => {
  const expected = { eight: 15, nine: 9, ten: 10 };
  for (const [mode, count] of Object.entries(expected)) {
    for (const rackHeight of ["high", "low"]) {
      const game = rackOf(mode, rackHeight);
      const ids = game.balls.map((ball) => ball.id).sort((a, b) => a - b);
      assert.deepEqual(ids, Array.from({ length: count + 1 }, (_, id) => id), mode);
      const money = RULES[mode].money;
      const anchor = ballById(game, rackHeight === "high" ? money : 1);
      assert.ok(Math.abs(anchor.z - FOOT_SPOT) < 1e-6, `${mode} ${rackHeight}`);
      assert.equal(ballById(game, money).x, 0);
      const objects = game.balls.filter((ball) => ball.id > 0);
      assert.equal(objects.reduce((a, b) => a.z > b.z ? a : b).id, 1);
      objects.forEach((a, i) => objects.slice(i + 1).forEach((b) => {
        assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= TABLE.radius * 2);
      }));
      const back = objects.filter((ball) => ball.z === Math.min(...objects.map((item) => item.z)));
      const corners = [back.reduce((a, b) => a.x < b.x ? a : b), back.reduce((a, b) => a.x > b.x ? a : b)];
      if (mode === "ten") assert.deepEqual(corners.map((ball) => ball.id).sort(), [2, 3]);
      if (mode === "eight") {
        assert.deepEqual(corners.map((ball) => ballGroup(ball.id)).sort(), ["solids", "stripes"]);
      }
    }
  }
});

test("a full break of every rack hits the 1 first and settles inside the table", () => {
  try {
    Object.assign(PHYSICS_CONFIG, SHIPPED_PHYSICS);
    for (const mode of ["eight", "ten"]) {
      const game = rackOf(mode);
      assert.ok(strike(game, 0, 100, { x: 0, y: 0 }, createStroke(STANDARD_CUES.break)));
      settle(game);
      assert.ok(game.balls.filter((ball) => !ball.pocketed).every((ball) =>
        Math.abs(ball.x) <= TABLE.width / 2 && Math.abs(ball.z) <= TABLE.length / 2));
    }
  } finally {
    Object.assign(PHYSICS_CONFIG, REFERENCE_PHYSICS);
  }
});

test("8-ball: the table is open after the break and the first legal pot picks the group", () => {
  const game = rackOf("eight");
  assert.deepEqual(legalTargets(game).length, 15);
  judge(game, { firstContact: 1, pocketed: [] });
  assert.equal(game.group, null);
  assert.ok(!legalTargets(game).includes(8));
  assert.equal(targetLabel(game), "bi bất kỳ trừ bi 8");
  // A pot on an open table assigns that group.
  judge(game, { firstContact: 11, pocketed: [11] });
  assert.equal(game.group, "stripes");
  assert.ok(legalTargets(game).every((id) => id > 8));
  // The other group first is now a foul.
  judge(game, { firstContact: 2, pocketed: [] });
  assert.equal(game.fouls, 1);
  assert.match(game.message, /Cần chạm bi sọc/);
});

test("8-ball: a mixed pot on an open table takes the group of the ball hit first", () => {
  const game = rackOf("eight");
  judge(game, { firstContact: 1, pocketed: [] });
  judge(game, { firstContact: 3, pocketed: [3, 12] });
  assert.equal(game.group, "solids");
});

test("8-ball: the 8 first on an open table is a foul", () => {
  const game = rackOf("eight");
  judge(game, { firstContact: 1, pocketed: [] });
  judge(game, { firstContact: 8, pocketed: [] });
  assert.equal(game.fouls, 1);
  assert.equal(game.ballInHand, true);
  assert.match(game.message, /không được chạm bi 8/);
});

test("8-ball: the 8 on the break is spotted, early it loses, after the group it wins", () => {
  const breakEight = rackOf("eight");
  judge(breakEight, { firstContact: 1, pocketed: [8] });
  assert.equal(breakEight.lost, false);
  assert.equal(ballById(breakEight, 8).pocketed, false);

  const early = rackOf("eight");
  judge(early, { firstContact: 1, pocketed: [] });
  judge(early, { firstContact: 2, pocketed: [2] });
  judge(early, { firstContact: 3, pocketed: [8] });
  assert.equal(early.lost, true);
  assert.equal(early.won, false);
  assert.equal(strike(early, 0, 40, { x: 0, y: 0 }), false);

  const cleared = rackOf("eight");
  judge(cleared, { firstContact: 1, pocketed: [] });
  judge(cleared, { firstContact: 1, pocketed: [1, 2, 3, 4, 5, 6, 7] });
  assert.equal(cleared.group, "solids");
  assert.deepEqual(legalTargets(cleared), [8]);
  assert.equal(targetLabel(cleared), "bi 8");
  judge(cleared, { firstContact: 8, pocketed: [8] });
  assert.equal(cleared.won, true);

  const scratch = rackOf("eight");
  judge(scratch, { firstContact: 1, pocketed: [] });
  judge(scratch, { firstContact: 9, pocketed: [9, 10, 11, 12, 13, 14, 15] });
  judge(scratch, { firstContact: 8, pocketed: [8, 0] });
  assert.equal(scratch.lost, true);
});

test("10-ball: the 10 on the break or early is spotted; as the last ball it wins", () => {
  const breakTen = rackOf("ten");
  judge(breakTen, { firstContact: 1, pocketed: [10] });
  assert.equal(breakTen.won, false);
  assert.equal(ballById(breakTen, 10).pocketed, false);

  const early = rackOf("ten");
  judge(early, { firstContact: 1, pocketed: [] });
  judge(early, { firstContact: 1, pocketed: [10] });
  assert.equal(early.won, false);
  assert.equal(ballById(early, 10).pocketed, false);

  const last = rackOf("ten");
  judge(last, { firstContact: 1, pocketed: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
  assert.deepEqual(legalTargets(last), [10]);
  judge(last, { firstContact: 10, pocketed: [10] });
  assert.equal(last.won, true);
});

test("a spotted ball goes behind the foot spot when the spot is taken", () => {
  const game = rackOf("ten");
  judge(game, { firstContact: 1, pocketed: [] });
  const blocker = ballById(game, 2);
  Object.assign(blocker, { x: 0, z: FOOT_SPOT });
  judge(game, { firstContact: 1, pocketed: [10] });
  const ten = ballById(game, 10);
  assert.equal(ten.pocketed, false);
  assert.ok(ten.z < FOOT_SPOT, "toward the foot rail");
  assert.ok(Math.hypot(ten.x - blocker.x, ten.z - blocker.z) >= TABLE.radius * 2);
});

test("push-out: offered once after a 9 or 10-ball break, never in 8-ball", () => {
  for (const mode of ["nine", "ten"]) {
    const game = rackOf(mode);
    assert.equal(game.pushOut, "none");
    judge(game, { firstContact: 1, pocketed: [] });
    assert.equal(game.pushOut, "offered", mode);
    assert.match(game.message, /đánh an toàn/);
    // Not declared: the offer lapses with the next stroke.
    judge(game, { firstContact: 1, pocketed: [] });
    assert.equal(game.pushOut, "none");
  }
  const eight = rackOf("eight");
  judge(eight, { firstContact: 1, pocketed: [] });
  assert.equal(eight.pushOut, "none");
  // A foul on the break still leaves the push-out to the next stroke.
  const foul = rackOf("nine");
  judge(foul, { firstContact: 1, pocketed: [0] });
  assert.equal(foul.ballInHand, true);
  assert.equal(foul.pushOut, "offered");
});

test("push-out: no contact or rail needed, a scratch fouls, the 9 is spotted", () => {
  const game = rackOf("nine");
  judge(game, { firstContact: 1, pocketed: [] });
  game.pushOut = "declared";
  judge(game, { firstContact: null, railAfterContact: false, pocketed: [] });
  assert.equal(game.fouls, 0);
  assert.equal(game.pushOut, "none");
  assert.match(game.message, /Đánh an toàn xong/);

  const nine = rackOf("nine");
  judge(nine, { firstContact: 1, pocketed: [] });
  nine.pushOut = "declared";
  judge(nine, { firstContact: 5, pocketed: [9, 4] });
  assert.equal(nine.won, false);
  assert.equal(ballById(nine, 9).pocketed, false);
  assert.equal(ballById(nine, 4).pocketed, true);

  const scratch = rackOf("ten");
  judge(scratch, { firstContact: 1, pocketed: [] });
  scratch.pushOut = "declared";
  judge(scratch, { firstContact: null, pocketed: [0] });
  assert.equal(scratch.fouls, 1);
  assert.equal(scratch.ballInHand, true);
});

test("the snapshot lists each rule's balls and the nearest legal ball is aimed at", () => {
  assert.equal(snapshot(rackOf("eight")).ballIds.length, 15);
  assert.equal(snapshot(rackOf("ten")).ballIds.length, 10);
  const nine = snapshot(rackOf("nine"));
  assert.equal(nine.target, 1);
  assert.equal(nine.breaking, true);
  assert.equal(nine.over, false);
  const game = rackOf("eight");
  judge(game, { firstContact: 1, pocketed: [] });
  Object.assign(ballById(game, 13), { x: 0.4, z: 0.3 });
  Object.assign(ballById(game, 0), { x: 0.4, z: 0.5 });
  assert.equal(aimTarget(game).id, 13);
});

// --- Cues -------------------------------------------------------------------

test("cue models are frozen, defaults are stable, and a slot accepts only its own type", () => {
  assert.deepEqual(Object.keys(STANDARD_CUES).sort(), ["break", "glide", "jump"]);
  for (const cue of CUE_CATALOG) {
    assert.ok(Object.isFrozen(cue));
    assert.equal(resolveCue(DEFAULT_LOADOUT, cue.type), STANDARD_CUES[cue.type]);
    assert.equal(resolveCue({ ...DEFAULT_LOADOUT, [cue.type]: cue.id }, cue.type), cue);
  }
  for (const type of ["break", "glide", "jump"]) {
    assert.equal(resolveCue(DEFAULT_LOADOUT, type).type, type);
    // A glide cue id placed in the jump slot falls back to the jump cue.
    assert.equal(resolveCue({ ...DEFAULT_LOADOUT, [type]: STANDARD_CUES.glide.id === DEFAULT_LOADOUT[type] ? STANDARD_CUES.jump.id : STANDARD_CUES.glide.id }, type).type, type);
  }
  assert.equal(strokeCueType(true, "jump"), "break");
  assert.equal(strokeCueType(false, "jump"), "jump");
  const { break: breaker, glide, jump } = STANDARD_CUES;
  assert.ok(breaker.length < glide.length && breaker.buttRadius > glide.buttRadius);
  assert.ok(breaker.speedScale > glide.speedScale);
  assert.ok(jump.length < glide.length && jump.length > breaker.length);
  assert.ok(jump.maxElevation > jump.minElevation && glide.maxElevation === 0);
  assert.ok(strokeSpread(createStroke(jump, jump.maxElevation)) > strokeSpread(createStroke(jump, jump.minElevation)));
  assert.equal(strokeSpread(createStroke(glide)), 0);
});

test("the break cue sends the cue ball faster than the playing cue", () => {
  const speedWith = (cue) => {
    const game = rackOf("nine");
    strike(game, 0, 80, { x: 0, y: 0 }, cue && createStroke(cue));
    return Math.hypot(game.balls[0].vx, game.balls[0].vz);
  };
  assert.ok(Math.abs(speedWith(STANDARD_CUES.break) / speedWith(undefined) - 1.2) < 1e-9);
  assert.ok(Math.abs(speedWith(STANDARD_CUES.glide) - speedWith(undefined)) < 1e-12);
});

test("a drill stroke is never a break, so it may use the jump cue", () => {
  const game = createDrill({ ...DEFAULT_OPTIONS, drill: "jump" }, 0);
  assert.equal(isBreakShot(game), false);
  assert.equal(strokeCueType(isBreakShot(game), "jump"), "jump");
  assert.equal(isBreakShot(rackOf("nine")), true);
});

test("a jump stroke flies, lands with a land event, and settles", () => {
  try {
    Object.assign(PHYSICS_CONFIG, SHIPPED_PHYSICS);
    const game = rackOf("nine");
    game.balls = [game.balls[0]];
    Object.assign(game.balls[0], { x: 0, z: 0.5 });
    assert.ok(strike(game, 0, 70, { x: 0, y: 0 }, createStroke(STANDARD_CUES.jump, 45)));
    assert.ok(game.balls[0].vy > 0);
    let peak = 0;
    const events = [];
    for (let i = 0; i < 240 * 30 && game.moving; i += 1) {
      stepPhysics(game, 1 / 240, (event) => events.push(event));
      peak = Math.max(peak, game.balls[0].y);
    }
    assert.equal(game.moving, false);
    assert.ok(peak > 0.02 && peak < 0.3, `peak ${peak}`);
    assert.ok(events.some((event) => event.kind === "land"));
    assert.equal(game.balls[0].y, 0);
  } finally {
    Object.assign(PHYSICS_CONFIG, REFERENCE_PHYSICS);
  }
});

test("a low shot rebounds but a jump can clear the rail and give ball in hand", () => {
  try {
    Object.assign(PHYSICS_CONFIG, SHIPPED_PHYSICS);
    for (const elevation of [0, 45]) {
      const game = rackOf("nine");
      game.balls = [game.balls[0]];
      Object.assign(game.balls[0], { x: 0.47, z: 0.35 });
      const stroke = elevation > 0 ? createStroke(STANDARD_CUES.jump, elevation) : undefined;
      assert.ok(strike(game, Math.PI / 2, 100, { x: 0, y: 0 }, stroke));
      const events = [];
      let leftTable = false;
      for (let i = 0; i < 2400 && game.moving; i += 1) {
        stepPhysics(game, 1 / 240, (event) => events.push(event));
        leftTable ||= game.shot?.offTable.includes(0) ?? false;
      }
      assert.equal(game.moving, false);
      assert.equal(leftTable || game.message.includes("Bi cái văng khỏi bàn"), elevation > 0);
      assert.equal(events.some((event) => event.kind === "rail"), elevation === 0);
      assert.equal(events.some((event) => event.kind === "pocket"), false);
      assert.equal(game.ballInHand, true);
      assert.equal(game.balls[0].pocketed, false);
    }
  } finally {
    Object.assign(PHYSICS_CONFIG, REFERENCE_PHYSICS);
  }
});

test("a near blocker needs a steep jump: cleared high, hit when the cue is low", () => {
  try {
    Object.assign(PHYSICS_CONFIG, SHIPPED_PHYSICS);
    const firstContact = (elevation) => {
      const game = rackOf("nine");
      game.balls = [game.balls[0], ballById(game, 1), ballById(game, 2)];
      Object.assign(game.balls[0], { x: 0, z: 0.5 });
      Object.assign(ballById(game, 2), { x: 0, z: 0.38 });
      Object.assign(ballById(game, 1), { x: 0, z: -0.1 });
      // A harder stroke flies over the target as well.
      strike(game, 0, 70, { x: 0, y: 0 }, createStroke(STANDARD_CUES.jump, elevation));
      let contact = null;
      for (let i = 0; i < 240 * 30 && game.moving; i += 1) {
        stepPhysics(game, 1 / 240);
        contact = game.shot?.firstContact ?? contact;
      }
      return contact;
    };
    assert.equal(firstContact(20), 2);
    assert.equal(firstContact(40), 2);
    assert.equal(firstContact(55), 1);
  } finally {
    Object.assign(PHYSICS_CONFIG, REFERENCE_PHYSICS);
  }
});

// --- Drills -----------------------------------------------------------------

// A stroke near each of these completes the drill with the shipped physics;
// the search around it tolerates small retunes.
// Centres of the widest aim windows at a natural power for the shipped
// physics; each window is 0.4° to 3° wide.
const DRILL_STROKES = {
  bank: [{ deg: 65.65, power: 45 }, { deg: 284.7, power: 50 }, { deg: 233.85, power: 45 }],
  kick: [{ deg: 25.4, power: 55 }, { deg: 14.2, power: 40 }, { deg: 39.55, power: 50 }],
  jump: [
    { deg: -45, power: 60, elevation: 45 },
    { deg: -45, power: 60, elevation: 55 },
    { deg: -45, power: 55, elevation: 50 },
  ],
  cut: [{ deg: 261, power: 50 }, { deg: 100.3, power: 50 }, { deg: 137.15, power: 45 }],
  position: [
    { deg: 32.15, power: 40, tipHeight: -0.1765 },
    { deg: 33, power: 50, tipHeight: -0.3529 },
    { deg: 307.2, power: 27, tipHeight: 0.3529 },
  ],
};

const playDrill = (id, variant, { deg, power, tipHeight = 0, elevation = 0 }) => {
  const game = createDrill({ ...DEFAULT_OPTIONS, drill: id }, variant);
  const stroke = elevation ? createStroke(STANDARD_CUES.jump, elevation) : undefined;
  // Keep the physical contact height when the selectable range changes.
  const cue = stroke?.cue ?? STANDARD_CUES.glide;
  const spinY = tipHeight * SPIN_MAX_OFFSET / cue.maxTipOffset;
  assert.ok(strike(game, deg * Math.PI / 180, power, { x: 0, y: spinY }, stroke));
  settle(game);
  return game;
};

test("every drill position can be completed by a real stroke", () => {
  try {
    Object.assign(PHYSICS_CONFIG, SHIPPED_PHYSICS);
    assert.deepEqual(Object.keys(DRILLS).sort(), [...DRILL_IDS].sort());
    for (const id of DRILL_IDS) {
      assert.equal(DRILLS[id].layouts.length, DRILL_STROKES[id].length, id);
      DRILL_STROKES[id].forEach((stroke, variant) => {
        let done = false;
        for (let step = 0; step <= 12 && !done; step += 1) {
          for (const sign of step === 0 ? [1] : [-1, 1]) {
            const game = playDrill(id, variant, { ...stroke, deg: stroke.deg + sign * step * 0.05 });
            if (game.drill.result?.success) done = true;
          }
        }
        assert.ok(done, `${id} #${variant + 1} has no working stroke near ${stroke.deg}°`);
      });
    }
  } finally {
    Object.assign(PHYSICS_CONFIG, REFERENCE_PHYSICS);
  }
});

test("drill layouts keep their balls apart and on the cloth", () => {
  for (const id of DRILL_IDS) {
    for (const layout of DRILLS[id].layouts) {
      assert.ok(layout.balls.some((ball) => ball.id === 0));
      assert.ok(layout.balls.some((ball) => ball.id === layout.target));
      layout.balls.forEach((a, i) => {
        assert.ok(Math.abs(a.x) < TABLE.width / 2 - TABLE.radius);
        assert.ok(Math.abs(a.z) < TABLE.length / 2 - TABLE.radius);
        layout.balls.slice(i + 1).forEach((b) => {
          assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > TABLE.radius * 2.5, `${id}`);
        });
      });
    }
  }
});

test("drill judges: a straight pot is not a bank, a direct hit is not a kick", () => {
  try {
    Object.assign(PHYSICS_CONFIG, SHIPPED_PHYSICS);
    const bank = createDrill({ ...DEFAULT_OPTIONS, drill: "bank" }, 0);
    strike(bank, 0, 40, { x: 0, y: 0 });
    Object.assign(bank.shot, { firstContact: 1, pocketed: [1], drops: { 1: { x: 0.65, z: -1.29 } }, rails: [] });
    finishShot(bank);
    assert.equal(bank.drill.result.success, false);
    assert.match(bank.drill.result.note, /chưa qua băng/);

    const kick = createDrill({ ...DEFAULT_OPTIONS, drill: "kick" }, 0);
    strike(kick, 0, 40, { x: 0, y: 0 });
    Object.assign(kick.shot, { firstContact: 1, rails: [{ ballId: 0, x: 0.6, z: 0, beforeContact: false }] });
    finishShot(kick);
    assert.equal(kick.drill.result.success, false);
    assert.match(kick.drill.result.note, /trước khi chạm băng/);

    const jump = createDrill({ ...DEFAULT_OPTIONS, drill: "jump" }, 0);
    strike(jump, 0, 40, { x: 0, y: 0 });
    Object.assign(jump.shot, { firstContact: 2 });
    finishShot(jump);
    assert.match(jump.drill.result.note, /chạm bi 2 trước bi 1/);
  } finally {
    Object.assign(PHYSICS_CONFIG, REFERENCE_PHYSICS);
  }
});

test("a drill attempt is one stroke; laying it out again keeps the score", () => {
  const game = createDrill({ ...DEFAULT_OPTIONS, drill: "cut" }, 0);
  assert.equal(game.cueInHand, false);
  assert.equal(canPlaceCue(game), false);
  strike(game, 0, 40, { x: 0, y: 0 });
  Object.assign(game.shot, { firstContact: 1, pocketed: [1], drops: { 1: { x: 0, z: 0 } } });
  finishShot(game);
  assert.equal(game.drill.result.success, true);
  assert.equal(isOver(game), true);
  assert.equal(strike(game, 0, 40, { x: 0, y: 0 }), false);
  const again = createDrill(game.options, game.drill.variant + 1, game.drill);
  assert.equal(again.drill.variant, 1);
  assert.deepEqual([again.drill.made, again.drill.attempts], [1, 1]);
  assert.equal(again.drill.result, null);
  assert.equal(createDrill(game.options, 3, game.drill).drill.variant, 0);
});
