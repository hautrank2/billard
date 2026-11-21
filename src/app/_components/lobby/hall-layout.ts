export const tablePositions = [
  ...[-8.25, -3.65, 0.95, 5.55].map((x) => ({ x, z: -2.35, rotated: true })),
  ...[-8.95, -5.75, -2.55, 0.65, 3.85, 7.05].map((x) => ({ x, z: 2.02, rotated: false })),
];

export const isHallWalkable = (x: number, z: number) => {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 12 || Math.abs(z) > 4.3) return false;
  if (x > 9.25 && z < -.25) return false;
  if (x > 9.4 && z > .6) return false;
  return !tablePositions.some((table) => Math.abs(x - table.x) < (table.rotated ? 1.47 : .83) + .22 &&
    Math.abs(z - table.z) < (table.rotated ? .83 : 1.47) + .22);
};

export const moveHallPosition = (x: number, z: number, dx: number, dz: number) => {
  const nextX = isHallWalkable(x + dx, z) ? x + dx : x;
  const nextZ = isHallWalkable(nextX, z + dz) ? z + dz : z;
  return { x: nextX, z: nextZ };
};
