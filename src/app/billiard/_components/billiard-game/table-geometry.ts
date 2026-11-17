import { TABLE, TABLE_PRESETS } from "./config";
import { resolveCushionContact } from "./contact-physics";
import { POCKET_PROFILE, RAIL_HEIGHT } from "./constants";
import type { Ball, CushionPolygon, TableId, Vector2 } from "./type";

// The side-pocket jaw on the positive side of both table axes, nose to rail.
export const sidePocketJaw = (tableId: TableId) => {
  const w = TABLE.width / 2;
  const half = TABLE_PRESETS[tableId].sideMouth / 2;
  const { mouthRecess, cushionDepth } = POCKET_PROFILE;
  return {
    nose: { x: w, z: half + 0.009 },
    bevel: { x: w + mouthRecess, z: half + mouthRecess },
    back: { x: w + cushionDepth, z: half + 0.022 },
  };
};

// The rendered cushion noses and physics use the same tapered polygons.
export const cushionPolygons = (tableId: TableId): CushionPolygon[] => {
  const preset = TABLE_PRESETS[tableId];
  const w = TABLE.width / 2;
  const l = TABLE.length / 2;
  const cut = preset.cornerMouth / Math.sqrt(2);
  const depth = POCKET_PROFILE.cushionDepth;
  const recess = POCKET_PROFILE.mouthRecess;
  const { nose, bevel, back } = sidePocketJaw(tableId);
  const polygons: CushionPolygon[] = [];
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      polygons.push([
        { x: side * bevel.x, z: end * bevel.z },
        { x: side * nose.x, z: end * nose.z },
        { x: side * w, z: end * (l - cut - recess) },
        { x: side * (w + recess), z: end * (l - cut + recess) },
        { x: side * (w + depth), z: end * (l - cut + depth) },
        { x: side * back.x, z: end * back.z },
      ]);
    }
    polygons.push([
      { x: -w + cut - recess, z: side * (l + recess) },
      { x: -w + cut + recess, z: side * l },
      { x: w - cut - recess, z: side * l },
      { x: w - cut + recess, z: side * (l + recess) },
      { x: w - cut + depth, z: side * (l + depth) },
      { x: -w + cut - depth, z: side * (l + depth) },
    ]);
  }
  return polygons;
};

const sideOffset = (tableId: TableId) => TABLE_PRESETS[tableId].sideMouth / 2 - POCKET_PROFILE.sideCutIn;
const cornerOffset = POCKET_PROFILE.cornerCenterOffset;

export const pocketCenters = (tableId: TableId): Vector2[] => {
  return [-1, 1].flatMap((side) => [-1, 0, 1].map((end) => ({
    x: side * (TABLE.width / 2 + (end === 0 ? sideOffset(tableId) : cornerOffset)),
    z: end * (TABLE.length / 2 + cornerOffset),
  })));
};

export const pocketRadius = (tableId: TableId, middle: boolean) => middle
  ? TABLE_PRESETS[tableId].sideMouth / 2
  : TABLE_PRESETS[tableId].cornerMouth / 2 + POCKET_PROFILE.cornerRadiusExtra;

export const isInPocket = (point: Vector2, tableId: TableId) => {
  const w = TABLE.width / 2;
  const l = TABLE.length / 2;
  const x = Math.abs(point.x);
  const z = Math.abs(point.z);
  return Math.hypot(x - w - sideOffset(tableId), z) < pocketRadius(tableId, true) ||
    Math.hypot(x - w - cornerOffset, z - l - cornerOffset) < pocketRadius(tableId, false);
};

const closestPoint = (point: Vector2, a: Vector2, b: Vector2) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1,
    ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz),
  ));
  return { x: a.x + dx * t, z: a.z + dz * t };
};

export const bounceCushion = (ball: Ball, polygon: CushionPolygon) => {
  if (ball.y >= RAIL_HEIGHT) return 0;
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    area += a.x * b.z - b.x * a.z;
  }
  let inside = true;
  let distance = Infinity;
  let nearest = { x: 0, z: 0 };
  let normal = { x: 0, z: 0 };
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const outward = {
      x: Math.sign(area) * (b.z - a.z) / length,
      z: -Math.sign(area) * (b.x - a.x) / length,
    };
    if ((ball.x - a.x) * outward.x + (ball.z - a.z) * outward.z > 0) inside = false;
    const point = closestPoint(ball, a, b);
    const d = Math.hypot(ball.x - point.x, ball.z - point.z);
    if (d < distance) {
      distance = d;
      nearest = point;
      normal = outward;
    }
  }
  if (!inside && distance >= TABLE.radius) return 0;
  if (!inside && distance > 0.000001) {
    normal = { x: (ball.x - nearest.x) / distance, z: (ball.z - nearest.z) / distance };
  }
  ball.x = nearest.x + normal.x * (TABLE.radius + 0.00001);
  ball.z = nearest.z + normal.z * (TABLE.radius + 0.00001);
  return resolveCushionContact(ball, normal);
};
