export const HALL_SCALE = 1.5;
export const AVATAR_SCALE = .85;
export const AVATAR_HIP_HEIGHT = .82;
export const HALL_BOUNDS = { x: 18.3, z: 6.82 };
export const SEAT_HEIGHT = .445;
const SOFA_FOOTPRINT = { x: 1.22, z: .46 };
const COFFEE_TABLE = { x: .45, z: .32, offset: .72, height: .44 };
export const sofaPositions = [
  ...[-10.6, -7.9, -3.35, 1.2, 5.75].map((x) => ({ x: x * HALL_SCALE, z: -4.22 * HALL_SCALE, turned: false })),
  // Keep the last sofa, including walking clearance, outside the restroom block.
  ...[-10.25, -7.15, -3.95, -.75, 2.45, 5.65, 8.5].map((x) => ({ x: x * HALL_SCALE, z: 4.32 * HALL_SCALE, turned: true })),
];
export const hallSeats = sofaPositions.flatMap((sofa) => [-.49, .49].map((offset) => ({
  x: sofa.x + offset, z: sofa.z + (sofa.turned ? -.02 : .02), yaw: sofa.turned ? 0 : -Math.PI, height: SEAT_HEIGHT,
})));
export const tablePositions = [
  ...[-8.25, -3.65, .95, 5.55].map((x) => ({ x: x * HALL_SCALE, z: -2.35 * HALL_SCALE, rotated: true })),
  ...[-8.95, -5.75, -2.55, .65, 3.85, 7.05].map((x) => ({ x: x * HALL_SCALE, z: 2.02 * HALL_SCALE, rotated: false })),
];
// Support includes the same avatar clearance as the horizontal collision.
// Otherwise an avatar can fall into the padding and become trapped below it.
export const seatAt = (x: number, z: number) => sofaPositions.find((seat) =>
  Math.abs(x - seat.x) < SOFA_FOOTPRINT.x && Math.abs(z - seat.z) < SOFA_FOOTPRINT.z);
const coffeeTableAt = (x: number, z: number) => sofaPositions.find((seat) =>
  Math.abs(x - seat.x) < COFFEE_TABLE.x &&
  Math.abs(z - (seat.z + (seat.turned ? -COFFEE_TABLE.offset : COFFEE_TABLE.offset))) < COFFEE_TABLE.z);
export const hallSurfaceHeight = (x: number, z: number) => {
  return seatAt(x, z) ? SEAT_HEIGHT : coffeeTableAt(x, z) ? COFFEE_TABLE.height : 0;
};
export const nearestHallSeat = (x: number, z: number) => hallSeats
  .filter((seat) => Math.hypot(x - seat.x, z - seat.z) < 1.2)
  .sort((a, b) => Math.hypot(x - a.x, z - a.z) - Math.hypot(x - b.x, z - b.z))[0];

export const isHallWalkable = (x: number, z: number, y = 0) => {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > HALL_BOUNDS.x || Math.abs(z) > HALL_BOUNDS.z) return false;
  if (x > 14.99 && z < -.5) return false;
  if (x > 14.1 && z > .9) return false;
  if (y < SEAT_HEIGHT - .001 && seatAt(x, z)) return false;
  // Backrests stay solid; coffee tables can be stood on after a jump.
  if (sofaPositions.some((seat) => Math.abs(x - seat.x) < 1.2 && Math.abs(z - (seat.z + (seat.turned ? .28 : -.28))) < .13)) return false;
  if (y < COFFEE_TABLE.height - .001 && coffeeTableAt(x, z)) return false;
  return !tablePositions.some((table) => Math.abs(x - table.x) < (table.rotated ? 1.45 : .825) + .18 &&
    Math.abs(z - table.z) < (table.rotated ? .825 : 1.45) + .18);
};
export const moveHallPosition = (x: number, z: number, dx: number, dz: number, y = 0) => {
  const nextX = isHallWalkable(x + dx, z, y) ? x + dx : x;
  const nextZ = isHallWalkable(nextX, z + dz, y) ? z + dz : z;
  return { x: nextX, z: nextZ };
};
