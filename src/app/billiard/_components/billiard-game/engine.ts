import {
  DEFAULT_OPTIONS, FOOT_SPOT, HEAD_STRING,
  rackApex, TABLE,
} from "./config";
import {
  advanceBall,
  isBallResting,
  resolveAirContact,
  resolveBallCluster,
  resolveBallContact,
  resolveCueStrike,
  stopBall,
} from "./contact-physics";
import {
  DRILL_NEXT_KEY, DRILL_RETRY_KEY, PHYSICS_CONFIG, PLACEMENT_BALL_SPACING, PLACEMENT_CLEARANCE,
  POCKET_PROFILE, RAIL_HEIGHT,
} from "./constants";
import { DRILLS } from "./drills";
import {
  BALL_GROUP_LABELS,
  ballGroup,
  isBreakShot,
  isOver,
  legalTargets,
  RULES,
  targetLabel,
} from "./rules";
import { bounceCushion, cushionPolygons, isInPocket } from "./table-geometry";
import type {
  Ball, BallContact, DrillState, GameOptions, GameSnapshot, GameState, PhysicsListener,
  Shot, Spin, Stroke, Vector2,
} from "./type";

export { TABLE } from "./config";
const CUSHIONS = {
  "mr-sung": cushionPolygons("mr-sung"),
  predator: cushionPolygons("predator"),
};
// Enough for any real shot; a ball rolling along a cushion stops adding.
const MAX_RAIL_TOUCHES = 120;
const RAIL_TOUCH_SPEED = 0.02;

const OPENING_MESSAGES = {
  eight: "Bàn 8 bi đã sẵn sàng. Khai cuộc; bàn để mở tới khi vào bi hợp lệ.",
  nine: "Bàn đã sẵn sàng. Ngắm bi số 1 và khai cuộc.",
  ten: "Bàn 10 bi đã sẵn sàng. Ngắm bi số 1 và khai cuộc.",
};

const atRest = () => ({
  y: 0, vx: 0, vy: 0, vz: 0, omegaX: 0, omegaY: 0, omegaZ: 0, pocketed: false,
});

const newGame = (options: GameOptions, balls: Ball[], message: string): GameState => ({
  options: { ...options },
  balls,
  moving: false,
  shots: 0,
  fouls: 0,
  won: false,
  lost: false,
  group: null,
  pushOut: "none",
  drill: null,
  ballInHand: false,
  // The breaker may place the cue ball in the kitchen before the break.
  cueInHand: true,
  message,
  shot: null,
});

// A drill attempt: the layout as drawn, and the score carried over.
export const createDrill = (
  options: GameOptions,
  variant = 0,
  previous: DrillState | null = null,
): GameState => {
  const spec = DRILLS[options.drill];
  const count = spec.layouts.length;
  const index = ((variant % count) + count) % count;
  const layout = spec.layouts[index];
  const game = newGame(
    { ...options, mode: "drill" },
    layout.balls.map((ball) => ({ ...ball, ...atRest() })),
    spec.goal,
  );
  game.cueInHand = false;
  game.drill = {
    id: spec.id,
    variant: index,
    target: layout.target,
    zone: layout.zone ? { ...layout.zone } : null,
    attempts: previous?.attempts ?? 0,
    made: previous?.made ?? 0,
    result: null,
  };
  return game;
};

export const createGame = (options: GameOptions = DEFAULT_OPTIONS): GameState => {
  if (options.mode === "drill") return createDrill(options);
  const balls: Ball[] = [{ id: 0, x: 0, z: HEAD_STRING, ...atRest() }];
  RULES[options.mode].rack.forEach((row, rowIndex) => row.forEach((id, column) => {
    balls.push({
      id,
      x: (column - (row.length - 1) / 2) * TABLE.radius * 2.005,
      z: rackApex(options.rackHeight) - rowIndex * TABLE.radius * Math.sqrt(3) * 1.003,
      ...atRest(),
    });
  }));
  return newGame(options, balls, OPENING_MESSAGES[options.mode]);
};

export const snapshot = (game: GameState): GameSnapshot => {
  const legal = legalTargets(game);
  const drill = game.drill;
  return {
    options: { ...game.options },
    moving: game.moving,
    shots: game.shots,
    fouls: game.fouls,
    won: game.won,
    lost: game.lost,
    group: game.group,
    pushOut: game.pushOut,
    drill: drill && {
      ...drill,
      zone: drill.zone && { ...drill.zone },
      result: drill.result && { ...drill.result },
    },
    ballInHand: game.ballInHand,
    cueInHand: game.cueInHand,
    message: game.message,
    ballIds: game.balls
      .filter((ball) => ball.id > 0)
      .map((ball) => ball.id)
      .sort((a, b) => a - b),
    pocketed: game.balls
      .filter((ball) => ball.id > 0 && ball.pocketed && !ball.offTable)
      .map((ball) => ball.id)
      .sort((a, b) => a - b),
    offTable: game.balls
      .filter((ball) => ball.id > 0 && ball.offTable)
      .map((ball) => ball.id),
    legal,
    target: legal[0] ?? 0,
    targetLabel: targetLabel(game),
    breaking: isBreakShot(game),
    over: isOver(game),
  };
};

// Re-placing the cue ball is a right earned by the opponent's foul (or the
// break), not a free reset; it lapses with the next stroke.
export const canPlaceCue = (game: GameState) =>
  game.cueInHand && !game.moving && !isOver(game);

export const cuePlacementBounds = (game: GameState) => {
  const margin = TABLE.radius + PLACEMENT_CLEARANCE;
  const maxX = TABLE.width / 2 - margin;
  const maxZ = TABLE.length / 2 - margin;
  return { minX: -maxX, maxX, minZ: isBreakShot(game) ? HEAD_STRING : -maxZ, maxZ };
};

export const placeCue = (game: GameState, point: Vector2, { clampToBounds = false } = {}) => {
  if (game.moving || !game.ballInHand) return false;
  const { minX, maxX, minZ, maxZ } = cuePlacementBounds(game);
  const x = clampToBounds ? Math.max(minX, Math.min(maxX, point.x)) : point.x;
  const z = clampToBounds ? Math.max(minZ, Math.min(maxZ, point.z)) : point.z;
  if (x < minX || x > maxX || z < minZ || z > maxZ ||
    isInPocket({ x, z }, game.options.tableId) ||
    game.balls.some((ball) => ball.id > 0 && !ball.pocketed &&
      Math.hypot(ball.x - x, ball.z - z) < TABLE.radius * PLACEMENT_BALL_SPACING)) return false;
  const cue = game.balls.find((ball) => ball.id === 0);
  if (!cue) return false;
  Object.assign(cue, { x, z, pocketed: false, offTable: false });
  stopBall(cue);
  return true;
};

export const placeCueAtDefault = (game: GameState) => {
  if (placeCue(game, { x: 0, z: HEAD_STRING })) return true;
  // Preserve collision constraints if an object ball occupies the default spot.
  const spacing = TABLE.radius * PLACEMENT_BALL_SPACING;
  for (let z = HEAD_STRING; z < TABLE.length / 2 - TABLE.radius - PLACEMENT_CLEARANCE; z += spacing) {
    for (let column = 0; column < Math.ceil(TABLE.width / spacing); column += 1) {
      const x = Math.ceil(column / 2) * spacing * (column % 2 === 0 ? 1 : -1);
      if (placeCue(game, { x, z })) return true;
    }
  }
  return false;
};

// Without a stroke the playing cue is used, level, as before cues existed.
export const strike = (
  game: GameState,
  angle: number,
  power: number,
  spin: Spin,
  stroke?: Stroke,
) => {
  if (game.moving || isOver(game) || game.ballInHand) return false;
  if (!Number.isFinite(power) || power <= 0) return false;
  const cue = game.balls.find((ball) => ball.id === 0);
  if (!cue || cue.pocketed) return false;
  resolveCueStrike(cue, { x: Math.sin(angle), z: -Math.cos(angle) }, power, spin, stroke);
  game.shot = {
    legal: legalTargets(game),
    opening: isBreakShot(game),
    pushOut: game.pushOut === "declared",
    firstContact: null,
    pocketed: [],
    offTable: [],
    drops: {},
    railAfterContact: false,
    rails: [],
    spin: { ...spin },
  };
  game.pushOut = "none";
  game.shots += 1;
  game.cueInHand = false;
  game.moving = true;
  game.message = "Bi đang lăn…";
  return true;
};

// A spotted ball goes on the foot spot, else as close behind it toward the
// foot rail as it fits, else in front of it.
const respot = (game: GameState, id: number) => {
  const ball = game.balls.find((item) => item.id === id);
  if (!ball) return;
  const step = TABLE.radius * 2.2;
  const blocked = (z: number) => game.balls.some((other) => other !== ball &&
    !other.pocketed && Math.hypot(other.x, other.z - z) < TABLE.radius * 2.1);
  let z = FOOT_SPOT;
  while (blocked(z) && z - step > -TABLE.length / 2 + TABLE.radius) z -= step;
  if (blocked(z)) {
    z = FOOT_SPOT;
    while (blocked(z)) z += step;
  }
  Object.assign(ball, { x: 0, z, pocketed: false, offTable: false });
  stopBall(ball);
};

const wrongContact = (game: GameState, shot: Shot) => {
  if (game.options.mode !== "eight" || shot.opening) {
    return `Cần chạm bi ${shot.legal[0]} trước`;
  }
  if (!game.group) return "Bàn mở: không được chạm bi 8 trước";
  return shot.legal[0] === 8
    ? "Cần chạm bi 8 trước"
    : `Cần chạm ${BALL_GROUP_LABELS[game.group]} trước`;
};

const contactFoul = (game: GameState, shot: Shot) => {
  if (shot.pocketed.includes(0)) return "Bi cái rơi lỗ";
  if (shot.offTable.includes(0)) return "Bi cái văng khỏi bàn";
  if (shot.offTable.length > 0) return `Bi ${shot.offTable.join(", ")} văng khỏi bàn`;
  if (shot.pushOut) return null;
  if (shot.firstContact === null) return "Bi cái chưa chạm bi mục tiêu";
  if (!shot.legal.includes(shot.firstContact)) return wrongContact(game, shot);
  const objectPotted = shot.pocketed.some((id) => id > 0);
  if (!objectPotted && !shot.railAfterContact) return "Không có bi chạm băng sau va chạm";
  return null;
};

const giveBallInHand = (game: GameState, foul: string) => {
  game.fouls += 1;
  game.ballInHand = true;
  game.cueInHand = true;
  placeCueAtDefault(game);
  game.message = `${foul}. Đặt lại bi cái ở góc nhìn từ trên.`;
};

// 9 and 10-ball: lowest ball first; the money ball ends the rack.
const finishRotation = (game: GameState, shot: Shot, rule: "nine" | "ten") => {
  const money = RULES[rule].money;
  const moneyIn = shot.pocketed.includes(money);
  const spotMoney = shot.offTable.includes(money);
  const foul = contactFoul(game, shot);
  // Practice has no called shots, so the 10 counts only when it was the
  // ball on; on the break or early it is spotted. The 9 wins from any legal
  // stroke but a push-out.
  const moneyWins = moneyIn && !foul && !shot.pushOut &&
    (rule === "nine" || (!shot.opening && shot.legal.includes(money)));
  game.pushOut = shot.opening && !moneyWins ? "offered" : "none";
  if (spotMoney || (moneyIn && !moneyWins)) respot(game, money);
  const offer = game.pushOut === "offered"
    ? " Cú tiếp theo được đánh an toàn (P)."
    : "";
  if (foul) {
    giveBallInHand(game, foul);
    game.message += offer;
    return;
  }
  if (moneyWins) {
    game.won = true;
    game.message = `Hoàn thành bàn! Bi ${money} vào lỗ hợp lệ sau ${game.shots} cú đánh.`;
    return;
  }
  const potted = shot.pocketed.filter((id) => id > 0 && id !== money);
  const spotted = moneyIn ? ` Bi ${money} được đặt lại ở điểm đích.` : "";
  const next = targetLabel(game);
  if (shot.pushOut) {
    game.message = `Đánh an toàn xong, bàn giữ nguyên.${spotted} Cú tiếp theo chạm ${next} trước.`;
  } else if (potted.length > 0) {
    game.message = `Vào bi ${potted.join(", ")}!${spotted} Tiếp tục với ${next}.${offer}`;
  } else {
    game.message = `Tiếp tục ngắm ${next}.${spotted}` +
      (offer || " Bạn có thể đổi góc để quan sát.");
  }
};

// 8-ball: the table is open until a ball is legally potted after the
// break; the 8 wins only once the group is cleared.
const finishEight = (game: GameState, shot: Shot) => {
  const eightIn = shot.pocketed.includes(8);
  const eightOut = shot.offTable.includes(8);
  const foul = contactFoul(game, shot);
  game.pushOut = "none";
  if (eightOut && !shot.opening) {
    game.lost = true;
    game.message = "Bi 8 văng khỏi bàn: thua ván.";
    return;
  }
  if (eightIn && !shot.opening) {
    const onEight = game.group !== null && shot.legal.length === 1 && shot.legal[0] === 8;
    if (onEight && !foul) {
      game.won = true;
      game.message = `Hoàn thành bàn! Bi 8 vào lỗ hợp lệ sau ${game.shots} cú đánh.`;
    } else {
      game.lost = true;
      game.message = foul
        ? `${foul} khi vào bi 8: thua ván.`
        : "Bi 8 vào lỗ trước khi hết nhóm bi: thua ván.";
    }
    return;
  }
  // The 8 on the break is spotted and the table stays open.
  if (eightIn || eightOut) respot(game, 8);
  const spotted = eightIn || eightOut ? " Bi 8 được đặt lại ở điểm đích." : "";
  if (foul) {
    giveBallInHand(game, foul);
    game.message += spotted;
    return;
  }
  const potted = shot.pocketed.filter((id) => id > 0 && id !== 8);
  if (!game.group && !shot.opening && potted.length > 0) {
    // Both groups in one stroke: the group of the ball hit first.
    const groups = new Set(potted.map(ballGroup));
    game.group = groups.size === 1
      ? ballGroup(potted[0])
      : ballGroup(shot.firstContact ?? potted[0]);
    if (game.group) {
      game.message = `Vào bi ${potted.join(", ")}! Bạn chơi ${BALL_GROUP_LABELS[game.group]}.`;
      return;
    }
  }
  const next = targetLabel(game);
  game.message = potted.length > 0
    ? `Vào bi ${potted.join(", ")}!${spotted} Tiếp tục với ${next}.`
    : `Tiếp tục ngắm ${next}.${spotted}`;
};

const finishDrill = (game: GameState, shot: Shot, drill: DrillState) => {
  const spec = DRILLS[drill.id];
  const result = spec.judge(game, shot, spec.layouts[drill.variant]);
  drill.attempts += 1;
  if (result.success) drill.made += 1;
  drill.result = result;
  game.message = `${result.success ? "Đạt" : "Chưa đạt"}: ${result.note} ${DRILL_RETRY_KEY} thử lại · ${DRILL_NEXT_KEY} vị trí khác.`;
};

export const finishShot = (game: GameState) => {
  const shot = game.shot;
  if (!shot) return;
  game.moving = false;
  game.shot = null;
  const { mode } = game.options;
  if (mode === "drill") {
    if (game.drill) finishDrill(game, shot, game.drill);
  } else if (mode === "eight") {
    finishEight(game, shot);
  } else {
    finishRotation(game, shot, mode);
  }
};

// The bed holds a ball resting on it; only a flying ball moves vertically.
const onCloth = (ball: Ball) => ball.y === 0 && ball.vy === 0;

// Rewinds an overlapping pair along its relative path to the instant the
// surfaces first touched, so cut angles do not depend on the step size.
const contactRewind = (a: Ball, b: Ball, maxTime: number) => {
  const px = b.x - a.x;
  const py = b.y - a.y;
  const pz = b.z - a.z;
  const wx = b.vx - a.vx;
  const wy = b.vy - a.vy;
  const wz = b.vz - a.vz;
  const w2 = wx * wx + wy * wy + wz * wz;
  if (w2 < 1e-12) return 0;
  const along = px * wx + py * wy + pz * wz;
  const gap = px * px + py * py + pz * pz - (TABLE.radius * 2) ** 2;
  const root = Math.sqrt(Math.max(0, along * along - w2 * gap));
  return Math.max(0, Math.min(maxTime, (along + root) / w2));
};

const moveBall = (ball: Ball, time: number) => {
  ball.x += ball.vx * time;
  ball.z += ball.vz * time;
  if (!onCloth(ball)) ball.y = Math.max(0, ball.y + ball.vy * time);
};

const gapBetween = (a: Ball, b: Ball) => ({
  x: b.x - a.x,
  y: b.y - a.y,
  z: b.z - a.z,
});

const separate = (a: Ball, b: Ball) => {
  const gap = gapBetween(a, b);
  const distance = Math.hypot(gap.x, gap.y, gap.z);
  const overlap = TABLE.radius * 2 - distance;
  if (overlap <= 0 || distance < 0.000001) return;
  const push = overlap / 2 + 0.000001;
  a.x -= gap.x / distance * push;
  a.z -= gap.z / distance * push;
  b.x += gap.x / distance * push;
  b.z += gap.z / distance * push;
  if (!onCloth(a)) a.y = Math.max(0, a.y - gap.y / distance * push);
  if (!onCloth(b)) b.y = Math.max(0, b.y + gap.y / distance * push);
};

const collideBalls = (game: GameState, dt: number, emit?: PhysicsListener) => {
  const shot = game.shot;
  const touching: [Ball, Ball][] = [];
  const flying: [Ball, Ball][] = [];
  const contactsPerBall = new Map<Ball, number>();
  for (let i = 0; i < game.balls.length; i += 1) {
    const a = game.balls[i];
    if (a.pocketed) continue;
    for (let j = i + 1; j < game.balls.length; j += 1) {
      const b = game.balls[j];
      if (b.pocketed) continue;
      const gap = gapBetween(a, b);
      if (Math.hypot(gap.x, gap.y, gap.z) >= TABLE.radius * 2) continue;
      // A ball in the air touches at most one other: it is solved alone.
      if (!onCloth(a) || !onCloth(b)) {
        flying.push([a, b]);
        continue;
      }
      touching.push([a, b]);
      contactsPerBall.set(a, (contactsPerBall.get(a) ?? 0) + 1);
      contactsPerBall.set(b, (contactsPerBall.get(b) ?? 0) + 1);
    }
  }
  const report = (a: Ball, b: Ball, speed: number) => {
    if (speed <= 0) return;
    if (speed > 0.03) {
      emit?.({ kind: "ball", speed, ballId: a.id, x: (a.x + b.x) / 2 });
    }
    if (shot && (a.id === 0 || b.id === 0) && shot.firstContact === null) {
      shot.firstContact = a.id === 0 ? b.id : a.id;
    }
  };
  // A lone pair is rewound to the instant of touch for an exact cut angle.
  const rewound = (a: Ball, b: Ball, resolve: () => number) => {
    const gap = gapBetween(a, b);
    const approaching = (a.vx - b.vx) * gap.x + (a.vy - b.vy) * gap.y +
      (a.vz - b.vz) * gap.z > 0;
    const rewind = approaching ? contactRewind(a, b, dt) : 0;
    moveBall(a, -rewind);
    moveBall(b, -rewind);
    const speed = resolve();
    moveBall(a, rewind);
    moveBall(b, rewind);
    report(a, b, speed);
  };
  const cluster: BallContact[] = [];
  for (const [a, b] of touching) {
    const normalTo = () => {
      const distance = Math.max(0.000001, Math.hypot(b.x - a.x, b.z - a.z));
      return { x: (b.x - a.x) / distance, z: (b.z - a.z) / distance };
    };
    if (contactsPerBall.get(a) === 1 && contactsPerBall.get(b) === 1) {
      rewound(a, b, () => resolveBallContact(a, b, normalTo()));
    } else {
      cluster.push({ a, b, normal: normalTo(), approach: 0, impulse: 0 });
    }
  }
  for (const [a, b] of flying) {
    rewound(a, b, () => {
      const gap = gapBetween(a, b);
      const distance = Math.max(0.000001, Math.hypot(gap.x, gap.y, gap.z));
      return resolveAirContact(a, b, {
        x: gap.x / distance,
        y: gap.y / distance,
        z: gap.z / distance,
      });
    });
  }
  if (cluster.length > 0) {
    resolveBallCluster(cluster);
    for (const contact of cluster) report(contact.a, contact.b, contact.approach);
  }
  for (const [a, b] of [...touching, ...flying]) separate(a, b);
};

const substep = (game: GameState, dt: number, emit?: PhysicsListener) => {
  const shot = game.shot;
  // Leave room for the curved mouths, which cut inward from the nose lines.
  const clearX = TABLE.width / 2 - TABLE.radius * 1.6;
  const clearZ = TABLE.length / 2 - TABLE.radius * 1.6;
  for (const ball of game.balls) {
    if (ball.pocketed) continue;
    const landing = advanceBall(ball, dt);
    if (landing > 0.25) emit?.({ kind: "land", speed: landing, ballId: ball.id, x: ball.x });
    if (Math.abs(ball.x) < clearX && Math.abs(ball.z) < clearZ) continue;
    const overPocket = isInPocket(ball, game.options.tableId);
    // Capture at the visible mouth before a jaw can push the ball back out.
    if (overPocket && ball.y < 0.01 && ball.vy <= 0) {
      emit?.({ kind: "pocket", speed: Math.hypot(ball.vx, ball.vz), ballId: ball.id, x: ball.x });
      ball.pocketed = true;
      if (shot) {
        shot.pocketed.push(ball.id);
        shot.drops[ball.id] = { x: ball.x, z: ball.z };
      }
      stopBall(ball);
      continue;
    }
    // A jump landing behind the cushion has left the playing surface.
    if (!overPocket && ball.y <= RAIL_HEIGHT && (
      Math.abs(ball.x) > TABLE.width / 2 + POCKET_PROFILE.cushionDepth ||
      Math.abs(ball.z) > TABLE.length / 2 + POCKET_PROFILE.cushionDepth
    )) {
      ball.pocketed = true;
      ball.offTable = true;
      shot?.offTable.push(ball.id);
      stopBall(ball);
      continue;
    }
    if (isBallResting(ball)) continue;
    for (const cushion of CUSHIONS[game.options.tableId]) {
      const speed = bounceCushion(ball, cushion);
      if (speed <= 0) continue;
      if (shot && shot.firstContact !== null) shot.railAfterContact = true;
      if (shot && speed > RAIL_TOUCH_SPEED && shot.rails.length < MAX_RAIL_TOUCHES) {
        shot.rails.push({
          ballId: ball.id, x: ball.x, z: ball.z, beforeContact: shot.firstContact === null,
        });
      }
      if (speed > 0.05) emit?.({ kind: "rail", speed, ballId: ball.id, x: ball.x });
    }
  }
  collideBalls(game, dt, emit);
};

export const stepPhysics = (game: GameState, dt: number, emit?: PhysicsListener) => {
  if (!game.moving) return;
  // Substeps keep the fastest ball from travelling more than a fraction of
  // its radius between contact checks.
  const fastest = game.balls.reduce((top, ball) => ball.pocketed
    ? top
    : Math.max(top, Math.hypot(ball.vx, ball.vy, ball.vz)), 0);
  const substeps = Math.min(
    PHYSICS_CONFIG.maxSubsteps,
    Math.max(1, Math.ceil(fastest * dt / PHYSICS_CONFIG.maxSubstepTravel)),
  );
  for (let i = 0; i < substeps; i += 1) substep(game, dt / substeps, emit);
  if (game.balls.every(isBallResting)) {
    game.balls.forEach(stopBall);
    finishShot(game);
  }
};
