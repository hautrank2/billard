import * as THREE from "three";

import { TABLE, TABLE_PRESETS } from "./config";
import { POCKET_PROFILE, RAIL_HEIGHT } from "./constants";
import { pocketCenters, pocketRadius, sidePocketJaw } from "./table-geometry";
import type { TableId, Vector2 } from "./type";

const edgeX = TABLE.width / 2 + POCKET_PROFILE.cushionDepth;
const edgeZ = TABLE.length / 2 + POCKET_PROFILE.cushionDepth;

const pocketArc = (tableId: TableId, center: Vector2) => {
  const side = Math.sign(center.x);
  const end = Math.sign(center.z);
  const radius = pocketRadius(tableId, end === 0);
  const spanZ = Math.sqrt(radius ** 2 - (edgeX - Math.abs(center.x)) ** 2);
  const spanX = end === 0 ? 0 : Math.sqrt(radius ** 2 - (edgeZ - Math.abs(center.z)) ** 2);
  const sidePoint = { x: side * edgeX, z: center.z - end * spanZ };
  const endPoint = { x: center.x - side * spanX, z: end * edgeZ };
  const entry = end === 0 ? { x: side * edgeX, z: side * spanZ }
    : side * end < 0 ? sidePoint : endPoint;
  const exit = end === 0 ? { x: side * edgeX, z: -side * spanZ }
    : side * end < 0 ? endPoint : sidePoint;
  const start = Math.atan2(entry.z - center.z, entry.x - center.x);
  const finish = Math.atan2(exit.z - center.z, exit.x - center.x);
  const positiveSweep = (finish - start + Math.PI * 2) % (Math.PI * 2);
  const midpoint = start + positiveSweep / 2;
  const inside = Math.abs(center.x + radius * Math.cos(midpoint)) < edgeX &&
    Math.abs(center.z + radius * Math.sin(midpoint)) < edgeZ;
  const outerSweep = inside ? positiveSweep - Math.PI * 2 : positiveSweep;
  const innerSweep = inside ? positiveSweep : positiveSweep - Math.PI * 2;
  return { entry, exit, side, end, radius, start, innerSweep, outerSweep };
};

// Both the cloth and the frame open onto the same well.
export const createPocketBoundary = (tableId: TableId, includePockets: boolean) => {
  const shape = new THREE.Shape();
  const centers = pocketCenters(tableId);
  for (const [order, index] of [4, 3, 0, 1, 2, 5].entries()) {
    const center = centers[index];
    const { entry, radius, start, innerSweep, outerSweep } = pocketArc(tableId, center);
    if (order === 0) shape.moveTo(entry.x, -entry.z);
    else shape.lineTo(entry.x, -entry.z);
    const sweep = includePockets ? outerSweep : innerSweep;
    shape.absarc(center.x, -center.z, radius, -start, -(start + sweep), sweep > 0);
  }
  shape.closePath();
  return shape;
};

// The pocket plates wrap around the well and reach the outside of the rail.
export const createPocketPlate = (tableId: TableId, center: Vector2) => {
  const { outerWidth, outerLength } = TABLE_PRESETS[tableId];
  const { entry, exit, side, end, radius, start, outerSweep } = pocketArc(tableId, center);
  const outsideX = side * (outerWidth / 2 - 0.004);
  const outsideZ = end * (outerLength / 2 - 0.004);
  const shape = new THREE.Shape();
  shape.moveTo(entry.x, -entry.z);
  shape.absarc(center.x, -center.z, radius, -start, -(start + outerSweep), outerSweep > 0);
  if (end === 0) {
    const halfWidth = radius + 0.017;
    shape.lineTo(outsideX, side * halfWidth);
    shape.lineTo(outsideX, -side * halfWidth);
  } else {
    const extend = (point: Vector2) => Math.abs(point.x) === edgeX
      ? { x: outsideX, z: point.z - end * 0.032 }
      : { x: point.x - side * 0.032, z: outsideZ };
    const afterExit = extend(exit);
    const beforeEntry = extend(entry);
    shape.lineTo(afterExit.x, -afterExit.z);
    shape.lineTo(outsideX, -outsideZ);
    shape.lineTo(beforeEntry.x, -beforeEntry.z);
  }
  shape.closePath();
  return shape;
};

// Fill the wedge between the rubber jaw and the well rim. The facing rises
// from cloth height at the nose to rail height where it meets the pocket plate.
export const createSidePocketFacing = (tableId: TableId, center: Vector2) => {
  const radius = pocketRadius(tableId, true);
  const centerX = Math.abs(center.x);
  const { nose, bevel, back } = sidePocketJaw(tableId);
  const start = Math.acos((nose.x - centerX) / radius);
  const finish = Math.acos((back.x - centerX) / radius);
  const shape = new THREE.Shape();
  shape.moveTo(nose.x, -nose.z);
  shape.lineTo(nose.x, -radius * Math.sin(start));
  shape.absarc(centerX, 0, radius, -start, -finish, false);
  // The facing slips just under the rubber and top plate to close their seams.
  shape.lineTo(back.x + 0.001, -radius * Math.sin(finish));
  shape.lineTo(back.x + 0.001, -back.z - 0.001);
  shape.lineTo(bevel.x, -bevel.z - 0.001);
  shape.lineTo(nose.x, -nose.z - 0.001);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape, 32);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i += 1) {
    const progress = (positions.getX(i) - nose.x) / POCKET_PROFILE.cushionDepth;
    positions.setY(i, 0.001 + Math.min(1, progress) * (RAIL_HEIGHT - 0.001));
  }
  geometry.computeVertexNormals();
  return geometry;
};
