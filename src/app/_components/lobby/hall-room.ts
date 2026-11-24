import * as THREE from "three";

import { createTable } from "../../billiard/_components/billiard-game/table-scene";
import { TABLE_PRESETS } from "../../billiard/_components/billiard-game/config";
import { HALL_SCALE, sofaPositions, tablePositions } from "./hall-layout";
import { instanceStaticMeshes } from "./static-meshes";
export { tablePositions } from "./hall-layout";

const WIDTH = 25;
const DEPTH = 9.5;
const floorY = -0.18;
const cube = new THREE.BoxGeometry();
const tube = new THREE.CylinderGeometry(1, 1, 1, 14);
const ball = new THREE.SphereGeometry(1, 12, 8);

export function hallLabel(text: string, color = "#fff0ce", background = "#0c151cea") {
  const canvas = document.createElement("canvas");
  canvas.width = /^\d{2}$/.test(text) ? 116 : 384;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(3, 6, canvas.width - 6, 84, 23);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = "bold 43px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, 49, canvas.width - 28);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

export function createHallRoom() {
  const room = new THREE.Group();
  room.scale.set(HALL_SCALE, 1, HALL_SCALE);
  const paint = (color: string, metalness = 0, roughness = 0.72) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const box = (parent: THREE.Group, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, shadow = true) => {
    const mesh = new THREE.Mesh(cube, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const round = (parent: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    parent.add(mesh);
  };
  const black = paint("#141b1e", 0.35);
  const metal = paint("#927652", 0.68, 0.35);
  const wood = paint("#52382c");
  const slate = paint("#25363d", 0.14);
  const wall = paint("#26323b");
  const edge = paint("#c69355", 0.42);
  const bulb = new THREE.MeshBasicMaterial({ color: "#ffe4a5" });
  const cyan = new THREE.MeshBasicMaterial({ color: "#78e6dc" });
  const beige = paint("#dac69a");
  const plank = ["#594132", "#513a2d", "#624735", "#584134", "#634a39"].map((color) => paint(color));
  const ballColors = ["#f8eac9", "#ffcb56", "#d6694f", "#4e82cb", "#22252d"].map((color) => paint(color, 0, 0.27));
  const fabrics = [paint("#3c5754"), paint("#654738")];

  box(room, black, WIDTH + 0.5, 0.48, DEPTH + 0.5, 0, floorY - 0.15, 0);
  box(room, edge, WIDTH + 0.39, 0.065, DEPTH + 0.39, 0, -0.044, 0);
  for (let row = 0; row < 19; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const width = WIDTH / 6;
      box(room, plank[(column * 7 + row * 3 + Math.floor(row / 3)) % plank.length]!,
        width - 0.024, .05, .477, -WIDTH / 2 + width * (column + .5), -.025, -4.5 + row * .5, false);
    }
  }

  // A complete interior; only the overview removes the near walls and roof.
  const cutaway = new THREE.Group();
  room.add(cutaway);
  const height = 3.65;
  const ceiling = paint("#343d42");
  box(room, wall, WIDTH + .24, height, .24, 0, height / 2, -4.75);
  box(room, wall, .24, height, DEPTH, 12.48, height / 2, 0);
  box(cutaway, wall, WIDTH + .24, height, .24, 0, height / 2, 4.75);
  box(cutaway, wall, .24, height, DEPTH, -12.48, height / 2, 0);
  box(cutaway, ceiling, WIDTH + .5, .22, DEPTH + .5, 0, height + .11, 0);
  for (const z of [-4.59, 4.59]) {
    const parent = z > 0 ? cutaway : room;
    box(parent, wood, WIDTH - .2, .82, .065, 0, .43, z);
    box(parent, edge, WIDTH - .2, .045, .09, 0, .87, z);
    box(parent, black, WIDTH - .2, .16, .09, 0, .09, z);
    box(parent, metal, WIDTH - .2, .09, .12, 0, 3.48, z);
    for (let x = -12; x < 12; x += .65) {
      box(parent, edge, .022, .69, .025, x, .43, z + (z > 0 ? -.04 : .04), false);
    }
  }
  for (const x of [-12.32, 12.32]) {
    const parent = x < 0 ? cutaway : room;
    box(parent, wood, .06, .82, DEPTH - .2, x, .43, 0);
    box(parent, edge, .09, .045, DEPTH - .2, x, .87, 0);
    box(parent, black, .09, .16, DEPTH - .2, x, .09, 0);
    box(parent, metal, .12, .09, DEPTH - .2, x, 3.48, 0);
  }
  // Glazed entrance and framed windows sit inside the solid wall shell.
  const glass = paint("#42616c", .42, .22);
  box(cutaway, black, .075, 2.65, 2.85, -12.29, 1.34, 0);
  box(cutaway, glass, .08, 2.4, 2.55, -12.24, 1.36, 0);
  box(cutaway, metal, .10, 2.55, .055, -12.18, 1.34, 0);
  for (const z of [-.16, .16]) box(cutaway, edge, .14, .36, .045, -12.13, 1.15, z);
  for (const x of [-8.4, -2.8, 2.8, 8.4]) {
    box(cutaway, black, 3.55, 1.65, .09, x, 2.15, 4.57);
    box(cutaway, glass, 3.35, 1.45, .1, x, 2.15, 4.51);
    box(cutaway, metal, .055, 1.5, .12, x, 2.15, 4.44);
  }
  for (const x of [-10.5, -5.25, 0, 5.25, 10.5]) {
    box(cutaway, black, .14, .17, DEPTH, x, 3.53, 0);
  }
  for (const x of [-10.2, -6, -1.8, 2.4, 6.6, 10.8]) {
    box(room, slate, 3.3, 1.1, .075, x, 1.42, -4.6);
    box(room, metal, 3.42, .055, .12, x, .85, -4.57);
  }
  for (const x of [-10, -5.9, -1.7, 2.5, 6.7, 10.9]) {
    box(room, bulb, .07, .49, .07, x, 1.73, -4.47, false);
    box(room, metal, .17, .08, .13, x, 1.43, -4.48);
  }

  const sofa = (x: number, z: number, turned: boolean, index: number) => {
    const group = new THREE.Group();
    group.position.set(x / HALL_SCALE, .01, z / HALL_SCALE);
    group.scale.set(1 / HALL_SCALE, 1, 1 / HALL_SCALE);
    group.rotation.y = turned ? Math.PI : 0;
    room.add(group);
    box(group, wood, 2.15, .23, .68, 0, .14, 0);
    for (const corner of [-1, 1]) {
      box(group, fabrics[index % fabrics.length]!, .97, .19, .62, corner * .49, .34, .02);
      box(group, fabrics[index % fabrics.length]!, .97, .38, .18, corner * .49, .52, -.28);
    }
    box(group, wood, .62, .08, .39, 0, .39, .72);
    box(group, black, .13, .35, .14, 0, .18, .72);
  };
  sofaPositions.forEach(({ x, z, turned }, index) => sofa(x, z, turned, index));

  const entrance = new THREE.Group();
  entrance.position.set(-11.35, 0, 0);
  entrance.rotation.y = Math.PI / 2;
  room.add(entrance);
  box(entrance, slate, 2.7, .035, 1.55, 0, .022, 0);
  for (const x of [-1.36, 1.36]) {
    box(entrance, black, .15, 1.8, .15, x, .9, -.7);
    box(entrance, cyan, .035, 1.62, .04, x, .92, -.6, false);
  }
  box(entrance, black, 2.85, .27, .19, 0, 1.87, -.7);

  const counter = new THREE.Group();
  counter.position.set(10.75, 0, -2.3);
  room.add(counter);
  box(counter, black, 1.05, .91, 3.35, 0, .46, 0);
  box(counter, wood, 1.24, .14, 3.51, 0, 1.02, 0);
  box(counter, cyan, .027, .035, 3.28, -.55, .83, 0, false);
  box(counter, black, .83, .87, 3.8, 1.15, .442, .12);
  box(counter, slate, .91, .1, 3.88, 1.15, .94, .12);
  box(counter, black, .14, .36, .47, -.12, 1.23, -1.02);
  box(counter, cyan, .024, .24, .35, -.205, 1.25, -1.02, false);
  for (let i = 0; i < 5; i += 1) {
    const z = -1.32 + i * .55;
    round(counter, tube, ballColors[i]!, .09, .23, .09, 1.08, 1.12, z);
  }
  for (const z of [1.7, 3.45]) {
    box(room, slate, 2.38, .075, 1.66, 11.13, .037, z);
    box(room, wall, .12, .95, 1.65, 9.9, .46, z);
    box(room, wall, 2.52, .95, .12, 11.15, .46, z + .87);
    round(room, tube, beige, .28, .35, .32, 11.66, .22, z);
  }

  const plaque = (text: string, x: number, y: number, z: number, width: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({
      map: hallLabel(text), transparent: true, depthWrite: false,
    }));
    mesh.position.set(x, y, z);
    room.add(mesh);
  };
  const brandTexture = new THREE.TextureLoader().load("/brand/rollnine-3d.png");
  brandTexture.colorSpace = THREE.SRGBColorSpace;
  const brandSign = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5 * HALL_SCALE / 3), new THREE.MeshBasicMaterial({
    map: brandTexture, transparent: true, alphaTest: .02, depthWrite: false, toneMapped: false,
  }));
  brandSign.position.set(0, 1.8, -4.44);
  room.add(brandSign);
  plaque("LỐI VÀO", -11.36, 1.85, .93, 1.7);
  plaque("QUẦY", 11.1, 1.5, -.59, 1.7);

  // Clones share GPU resources; build each detailed table preset only once.
  const prototypes = [createTable(TABLE_PRESETS.predator), createTable(TABLE_PRESETS["mr-sung"])];
  const tables = tablePositions.map(({ x, z, rotated }, index) => {
    const group = new THREE.Group();
    room.add(group);
    group.position.set(x / HALL_SCALE, 0, z / HALL_SCALE);
    if (rotated) group.rotation.y = Math.PI / 2;
    group.scale.set(1 / HALL_SCALE, 1, 1 / HALL_SCALE);
    const table = prototypes[index % 2]!.clone();
    table.position.y = .8;
    group.add(table);
    for (const [id, bx, bz] of [[0, .17, .72], [1, -.14, -.35], [2, -.02, -.51], [3, .11, -.62], [4, -.04, -.7]] as const) {
      round(group, ball, ballColors[id]!, .0286, .0286, .0286, bx, .829, bz);
    }
    const number = new THREE.Sprite(new THREE.SpriteMaterial({
      map: hallLabel(String(index + 1).padStart(2, "0"), "#ffe7aa"),
      transparent: true,
    }));
    number.position.set(.67, 1.12, 1.04);
    number.scale.set(.41, .34, 1);
    group.add(number);
    return number.material;
  });

  // Suspended shades and warm practical lighting make the roofed room readable.
  for (const { x, z, rotated } of tablePositions) {
    const fixture = new THREE.Group();
    fixture.position.set(x / HALL_SCALE, 0, z / HALL_SCALE);
    fixture.scale.set(1 / HALL_SCALE, 1, 1 / HALL_SCALE);
    if (rotated) fixture.rotation.y = Math.PI / 2;
    cutaway.add(fixture);
    for (const side of [-1, 1]) {
      box(fixture, metal, .025, .48, .025, 0, 3.27, side * .65, false);
    }
    box(fixture, black, .62, .17, 1.95, 0, 2.96, 0, false);
    box(fixture, bulb, .51, .025, 1.82, 0, 2.865, 0, false);
  }

  // A pair of broad fills avoids evaluating ten point lights for every fragment.
  for (const x of [-6, 6]) {
    const light = new THREE.PointLight("#ffe2b3", 35, 22, 2);
    light.position.set(x, 2.72, 0);
    cutaway.add(light);
  }
  instanceStaticMeshes(room, cutaway);
  instanceStaticMeshes(cutaway);

  return {
    room,
    setOverview: (enabled: boolean) => { cutaway.visible = !enabled; },
    updateTables: (states: ReadonlyMap<number, boolean>) => tables.forEach((label, index) => {
      const state = states.get(index + 1);
      label.color.set(state === undefined ? "#ffffff" : state ? "#ffbf73" : "#79f5c1");
    }),
    dispose: () => {
      const materials = new Set<THREE.Material>();
      const labelGeometries = new Set<THREE.BufferGeometry>();
      room.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line) {
          if ((object instanceof THREE.Mesh || object instanceof THREE.Line) && ![cube, tube, ball].includes(object.geometry)) labelGeometries.add(object.geometry);
          if (!Array.isArray(object.material)) materials.add(object.material);
        }
      });
      for (const material of materials) {
        if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
        material.dispose();
      }
      for (const geometry of labelGeometries) geometry.dispose();
    },
  };
}
