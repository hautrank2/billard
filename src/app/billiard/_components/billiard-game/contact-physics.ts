import {
  BALL_INERTIA,
  BALL_MASS_KG,
  BALL_RADIUS,
  PHYSICS_CONFIG,
} from "./constants";
import { cueTipOffset, GLIDE_STROKE } from "./cues";
import type { Ball, BallContact, Spin, Stroke, Vector2, Vector3 } from "./type";

// Coefficients are read from PHYSICS_CONFIG on every call, so the tuning
// panel takes effect immediately; only the ball geometry is fixed here.
const R = BALL_RADIUS;
const G = PHYSICS_CONFIG.gravity;
const SLIP_EPSILON = 1e-6;
// A rebound slower than this stays on the cloth instead of hopping forever.
const SETTLE_SPEED = 0.12;

const cross = (a: Vector3, b: Vector3): Vector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const dot = (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z;

const spinOf = (ball: Ball): Vector3 => ({
  x: ball.omegaX,
  y: ball.omegaY,
  z: ball.omegaZ,
});

const addSpin = (ball: Ball, torque: Vector3) => {
  ball.omegaX += torque.x / BALL_INERTIA;
  ball.omegaY += torque.y / BALL_INERTIA;
  ball.omegaZ += torque.z / BALL_INERTIA;
};

// The part of a contact velocity that slides across the touching surfaces.
const tangential = (velocity: Vector3, normal: Vector3) => {
  const along = dot(velocity, normal);
  const slip = {
    x: velocity.x - along * normal.x,
    y: velocity.y - along * normal.y,
    z: velocity.z - along * normal.z,
  };
  return { slip, speed: Math.hypot(slip.x, slip.y, slip.z) };
};

const rollFromVelocity = (ball: Ball) => {
  ball.omegaX = ball.vz / R;
  ball.omegaZ = -ball.vx / R;
};

export const stopBall = (ball: Ball) => {
  ball.y = 0;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.omegaX = 0;
  ball.omegaY = 0;
  ball.omegaZ = 0;
};

// Velocity of the cloth contact point; zero means pure rolling.
export const clothSlip = (ball: Ball): Vector2 => ({
  x: ball.vx + R * ball.omegaZ,
  z: ball.vz - R * ball.omegaX,
});

// Side spin alone does not move the ball, so it does not delay the shot.
export const isBallResting = (ball: Ball) => ball.pocketed || (
  ball.vx === 0 && ball.vz === 0 && ball.omegaX === 0 && ball.omegaZ === 0 &&
  ball.y === 0 && ball.vy === 0
);

export const isAirborne = (ball: Ball) => ball.y > 0 || ball.vy > 0;

// A ball hitting the slate at `impact` m/s: the cloth friction of that
// short, hard contact acts on the slip like a sliding phase squeezed into
// one impulse, and the ball rebounds if it keeps enough vertical speed.
const bounceOnCloth = (ball: Ball, impact: number) => {
  const restitution = PHYSICS_CONFIG.tableRestitution;
  const slip = clothSlip(ball);
  const slipSpeed = Math.hypot(slip.x, slip.z);
  if (slipSpeed > SLIP_EPSILON) {
    const change = Math.min(
      PHYSICS_CONFIG.slidingFriction * (1 + restitution) * impact,
      slipSpeed / 3.5,
    );
    const dvx = -change * slip.x / slipSpeed;
    const dvz = -change * slip.z / slipSpeed;
    ball.vx += dvx;
    ball.vz += dvz;
    ball.omegaX -= 2.5 * dvz / R;
    ball.omegaZ += 2.5 * dvx / R;
  }
  const rebound = restitution * impact;
  ball.y = 0;
  ball.vy = rebound > SETTLE_SPEED ? rebound : 0;
};

// Integrates one substep exactly. In the air the ball follows a parabola
// and keeps its spin; on the cloth, sliding friction drives the contact
// slip to zero (a stun or draw ball), then constant rolling resistance
// decelerates it until it stops. Returns the speed of a landing, if any.
export const advanceBall = (ball: Ball, dt: number): number => {
  if (isAirborne(ball)) {
    const landing = (ball.vy + Math.sqrt(ball.vy ** 2 + 2 * G * ball.y)) / G;
    const time = Math.min(dt, landing);
    ball.x += ball.vx * time;
    ball.z += ball.vz * time;
    ball.y += ball.vy * time - 0.5 * G * time ** 2;
    ball.vy -= G * time;
    if (time < landing) return 0;
    const impact = -ball.vy;
    bounceOnCloth(ball, impact);
    if (dt - time > 0) advanceBall(ball, dt - time);
    return impact;
  }
  rollOnCloth(ball, dt);
  return 0;
};

const rollOnCloth = (ball: Ball, dt: number) => {
  const spinDrop = 2.5 * PHYSICS_CONFIG.spinningFriction * G / R * dt;
  ball.omegaY = Math.abs(ball.omegaY) <= spinDrop
    ? 0
    : ball.omegaY - Math.sign(ball.omegaY) * spinDrop;

  let remaining = dt;
  const slip = clothSlip(ball);
  const slipSpeed = Math.hypot(slip.x, slip.z);
  if (slipSpeed > SLIP_EPSILON) {
    const friction = PHYSICS_CONFIG.slidingFriction * G;
    // A solid sphere's slip shrinks 7/2 times faster than its velocity.
    const time = Math.min(dt, slipSpeed / (3.5 * friction));
    const ax = -friction * slip.x / slipSpeed;
    const az = -friction * slip.z / slipSpeed;
    ball.x += ball.vx * time + 0.5 * ax * time ** 2;
    ball.z += ball.vz * time + 0.5 * az * time ** 2;
    ball.vx += ax * time;
    ball.vz += az * time;
    ball.omegaX -= 2.5 * az * time / R;
    ball.omegaZ += 2.5 * ax * time / R;
    remaining -= time;
    if (remaining <= 0) return;
  }

  rollFromVelocity(ball);
  const speed = Math.hypot(ball.vx, ball.vz);
  if (speed === 0) return;
  const deceleration = PHYSICS_CONFIG.rollingFriction * G;
  const stopTime = speed / deceleration;
  const time = Math.min(remaining, stopTime);
  const travel = speed * time - 0.5 * deceleration * time ** 2;
  const next = time >= stopTime ? 0 : speed - deceleration * time;
  ball.x += ball.vx / speed * travel;
  ball.z += ball.vz / speed * travel;
  ball.vx *= next / speed;
  ball.vz *= next / speed;
  rollFromVelocity(ball);
};

export const shotSpeed = (power: number) => {
  const amount = Math.max(0, Math.min(100, power)) / 100;
  // Tuned values may cross; the curve still rises from the lower one.
  const low = Math.min(PHYSICS_CONFIG.minimumShotSpeed, PHYSICS_CONFIG.maximumShotSpeed);
  const high = Math.max(PHYSICS_CONFIG.minimumShotSpeed, PHYSICS_CONFIG.maximumShotSpeed);
  // Rolling distance grows with speed squared, so a plain power curve
  // leaves the bottom of the bar nearly flat. The lift adds speed there and
  // fades out before the top: 0% and 100% keep their configured speeds.
  const lift = PHYSICS_CONFIG.lowPowerLift * amount * (1 - amount) ** 4;
  return low + (high - low) * (amount ** PHYSICS_CONFIG.powerCurve + lift);
};

// A level cue impulse through the tip offset (side, height) sets both the
// launch speed and the spin: 0.4 R above centre is natural roll, below
// centre is draw, and an off-centre hit trades speed for spin.
// An elevated cue drives the ball down into the slate as well: its level
// part sets the ball rolling out, the downward part bounces off the bed and
// throws the ball up, while the bed's friction takes some level speed.
export const resolveCueStrike = (
  ball: Ball,
  direction: Vector2,
  power: number,
  spin: Spin,
  stroke: Stroke = GLIDE_STROKE,
) => {
  const { cue } = stroke;
  const { x: side, y: height } = cueTipOffset(cue, spin);
  const massRatio = PHYSICS_CONFIG.ballMassGrams / cue.massGrams;
  const speed = shotSpeed(power) * cue.speedScale * (1 + massRatio) /
    (1 + massRatio + 2.5 * (side ** 2 + height ** 2));
  const elevation = Math.max(0, Math.min(89, stroke.elevation)) * Math.PI / 180;
  const level = speed * Math.cos(elevation);
  const right = { x: -direction.z, z: direction.x };
  const spinRate = 2.5 * level / R;
  ball.y = 0;
  ball.vy = 0;
  ball.vx = direction.x * level;
  ball.vz = direction.z * level;
  ball.omegaX = -spinRate * height * right.x;
  ball.omegaY = spinRate * side;
  ball.omegaZ = -spinRate * height * right.z;
  const down = speed * Math.sin(elevation);
  if (down > 0) bounceOnCloth(ball, down);
};

// Alciatore's measured ball–ball friction falls as the surfaces slide faster.
const ballFriction = (slipSpeed: number) => PHYSICS_CONFIG.ballFrictionMin +
  PHYSICS_CONFIG.ballFrictionRange *
  Math.exp(-PHYSICS_CONFIG.ballFrictionDecay * slipSpeed);

const pushApart = (a: Ball, b: Ball, normal: Vector2, impulse: number) => {
  a.vx -= impulse * normal.x / BALL_MASS_KG;
  a.vz -= impulse * normal.z / BALL_MASS_KG;
  b.vx += impulse * normal.x / BALL_MASS_KG;
  b.vz += impulse * normal.z / BALL_MASS_KG;
};

// Coulomb friction impulse on b (a receives the opposite one), bounded by
// the normal impulse the contact carried.
const ballFrictionImpulse = (
  a: Ball,
  b: Ball,
  normal: Vector2,
  normalImpulse: number,
): Vector3 => {
  const n: Vector3 = { x: normal.x, y: 0, z: normal.z };
  // Surface slip includes every spin axis: side spin throws the object
  // ball, while top or bottom spin slides vertically at the contact.
  const surface = cross({
    x: a.omegaX + b.omegaX,
    y: a.omegaY + b.omegaY,
    z: a.omegaZ + b.omegaZ,
  }, n);
  const { slip, speed } = tangential({
    x: a.vx - b.vx + R * surface.x,
    y: R * surface.y,
    z: a.vz - b.vz + R * surface.z,
  }, n);
  if (speed <= SLIP_EPSILON || normalImpulse <= 0) return { x: 0, y: 0, z: 0 };
  const stickImpulse = speed /
    (2 / BALL_MASS_KG + 2 * R ** 2 / BALL_INERTIA);
  const friction = Math.min(stickImpulse, ballFriction(speed) * normalImpulse);
  return {
    x: slip.x * friction / speed,
    y: slip.y * friction / speed,
    z: slip.z * friction / speed,
  };
};

// The vertical part only turns the balls: the bed stops vertical motion.
const applyBallFriction = (
  a: Ball,
  b: Ball,
  normal: Vector2,
  impulse: Vector3,
) => {
  a.vx -= impulse.x / BALL_MASS_KG;
  a.vz -= impulse.z / BALL_MASS_KG;
  b.vx += impulse.x / BALL_MASS_KG;
  b.vz += impulse.z / BALL_MASS_KG;
  const arm = cross({ x: normal.x, y: 0, z: normal.z }, impulse);
  const torque = { x: -R * arm.x, y: -R * arm.y, z: -R * arm.z };
  addSpin(a, torque);
  addSpin(b, torque);
};

const approachSpeed = (a: Ball, b: Ball, normal: Vector2) =>
  (a.vx - b.vx) * normal.x + (a.vz - b.vz) * normal.z;

export const resolveBallContact = (a: Ball, b: Ball, normal: Vector2) => {
  const incoming = approachSpeed(a, b, normal);
  if (incoming <= 0) return 0;
  const normalImpulse = (1 + PHYSICS_CONFIG.ballRestitution) * incoming *
    BALL_MASS_KG / 2;
  applyBallFriction(a, b, normal, ballFrictionImpulse(a, b, normal, normalImpulse));
  pushApart(a, b, normal, normalImpulse);
  return incoming;
};

// Balls touching several others at once (the rack on the break) need their
// impulses solved together: resolving pairs one after another would hand
// the whole impact to whichever pair came first and could add energy.
// Projected Gauss–Seidel with alternating sweeps converges to the
// symmetric solution that meets every contact's restitution target.
export const resolveBallCluster = (contacts: BallContact[]) => {
  for (const contact of contacts) {
    contact.approach = Math.max(0, approachSpeed(contact.a, contact.b, contact.normal));
    contact.impulse = 0;
  }
  for (let sweep = 0; sweep < 64; sweep += 1) {
    let largest = 0;
    for (let k = 0; k < contacts.length; k += 1) {
      const contact = contacts[sweep % 2 === 0 ? k : contacts.length - 1 - k];
      const { a, b, normal } = contact;
      const target = -PHYSICS_CONFIG.ballRestitution * contact.approach;
      const total = Math.max(0, contact.impulse +
        (approachSpeed(a, b, normal) - target) * BALL_MASS_KG / 2);
      const change = total - contact.impulse;
      contact.impulse = total;
      pushApart(a, b, normal, change);
      largest = Math.max(largest, Math.abs(change));
    }
    if (largest < 1e-9) break;
  }
  // Friction is evaluated from one shared state and applied together, so a
  // ball touching two others gets equal and opposite throw from both.
  const friction = contacts.map((contact) =>
    ballFrictionImpulse(contact.a, contact.b, contact.normal, contact.impulse));
  contacts.forEach((contact, index) => {
    applyBallFriction(contact.a, contact.b, contact.normal, friction[index]);
  });
};

// Contact while one ball is in the air: the normal leans out of the
// table plane, so it can lift the ball or push the other into the bed,
// which takes any push downward.
export const resolveAirContact = (a: Ball, b: Ball, normal: Vector3) => {
  const approach = (a.vx - b.vx) * normal.x + (a.vy - b.vy) * normal.y +
    (a.vz - b.vz) * normal.z;
  if (approach <= 0) return 0;
  const change = (1 + PHYSICS_CONFIG.ballRestitution) * approach / 2;
  a.vx -= change * normal.x;
  a.vy -= change * normal.y;
  a.vz -= change * normal.z;
  b.vx += change * normal.x;
  b.vy += change * normal.y;
  b.vz += change * normal.z;
  for (const ball of [a, b]) {
    if (ball.y <= 0 && ball.vy < 0) ball.vy = 0;
  }
  return approach;
};

export const cushionRestitution = (speed: number) => Math.max(
  PHYSICS_CONFIG.cushionRestitutionMin,
  PHYSICS_CONFIG.cushionRestitution -
    PHYSICS_CONFIG.cushionRestitutionLoss * speed,
);

export const resolveCushionContact = (ball: Ball, normal: Vector2) => {
  const incoming = ball.vx * normal.x + ball.vz * normal.z;
  if (incoming >= 0) return 0;
  const speed = -incoming;
  const normalImpulse = (1 + cushionRestitution(speed)) * speed * BALL_MASS_KG;
  // The nose is above the equator, so its friction also bites into roll:
  // a rolling ball loses topspin and a sliding one leaves with some.
  const noseSin = 2 * PHYSICS_CONFIG.cushionHeightRatio - 1;
  const noseCos = Math.sqrt(1 - noseSin ** 2);
  const contactNormal = {
    x: -noseCos * normal.x,
    y: noseSin,
    z: -noseCos * normal.z,
  };
  const arm = {
    x: R * contactNormal.x,
    y: R * contactNormal.y,
    z: R * contactNormal.z,
  };
  const spinVelocity = cross(spinOf(ball), arm);
  const { slip, speed: slipSpeed } = tangential({
    x: ball.vx + spinVelocity.x,
    y: spinVelocity.y,
    z: ball.vz + spinVelocity.z,
  }, contactNormal);
  ball.vx += normalImpulse * normal.x / BALL_MASS_KG;
  ball.vz += normalImpulse * normal.z / BALL_MASS_KG;
  if (slipSpeed <= SLIP_EPSILON) return speed;

  const stickImpulse = slipSpeed / (1 / BALL_MASS_KG + R ** 2 / BALL_INERTIA);
  const friction = Math.min(
    stickImpulse,
    PHYSICS_CONFIG.cushionFriction * normalImpulse,
  );
  const impulse = {
    x: -slip.x * friction / slipSpeed,
    y: -slip.y * friction / slipSpeed,
    z: -slip.z * friction / slipSpeed,
  };
  // Only the component along the rail moves the ball; the cushion and bed
  // absorb the rest, which still turns the ball through the contact arm.
  const tangent = { x: -normal.z, z: normal.x };
  const alongRail = impulse.x * tangent.x + impulse.z * tangent.z;
  ball.vx += alongRail * tangent.x / BALL_MASS_KG;
  ball.vz += alongRail * tangent.z / BALL_MASS_KG;
  addSpin(ball, cross(arm, impulse));
  return speed;
};
