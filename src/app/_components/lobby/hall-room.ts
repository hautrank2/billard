import * as THREE from "three";

const WIDTH = 25;
const DEPTH = 9.5;
const floorY = -0.18;
const cube = new THREE.BoxGeometry();
const tube = new THREE.CylinderGeometry(1, 1, 1, 14);
const ball = new THREE.SphereGeometry(1, 12, 8);

export const tablePositions = [
  ...[-8.25, -3.65, 0.95, 5.55].map((x) => ({ x, z: -2.35, rotated: true })),
  ...[-8.95, -5.75, -2.55, 0.65, 3.85, 7.05].map((x) => ({ x, z: 2.02, rotated: false })),
];

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
  const pocket = new THREE.MeshBasicMaterial({ color: "#080e13" });
  const bulb = new THREE.MeshBasicMaterial({ color: "#ffe4a5" });
  const cyan = new THREE.MeshBasicMaterial({ color: "#78e6dc" });
  const beige = paint("#dac69a");
  const feltColors = ["#335e79", "#687d7e"];
  const openFelt = paint("#478a7e");
  const liveFelt = paint("#c18e51");
  const ordinaryFelt = feltColors.map((color) => paint(color));
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

  box(room, wall, WIDTH, 2.1, .22, 0, 1.05, -4.75);
  box(room, edge, WIDTH + .2, .09, .34, 0, 2.13, -4.75);
  box(room, black, WIDTH, .18, .13, 0, .12, -4.61);
  box(room, wall, .22, 1.55, DEPTH, 12.48, .77, 0);
  box(room, edge, .33, .08, DEPTH + .2, 12.48, 1.565, 0);
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
    group.position.set(x, .01, z);
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
  [-10.6, -7.9, -3.35, 1.2, 5.75].forEach((x, index) => sofa(x, -4.22, false, index));
  [-10.25, -7.15, -3.95, -.75, 2.45, 5.65, 8.75].forEach((x, index) => sofa(x, 4.32, true, index + 1));

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
    round(counter, tube, metal, .16, .47, .16, -.95, .265, z);
    round(counter, tube, fabrics[0]!, .29, .13, .29, -.95, .54, z);
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
  plaque("BLACK / NINE", 0, 1.45, -4.45, 5.5);
  plaque("LỐI VÀO", -11.36, 1.85, .93, 1.7);
  plaque("QUẦY", 11.1, 1.5, -.59, 1.7);

  const tables = tablePositions.map(({ x, z, rotated }, index) => {
    const group = new THREE.Group();
    room.add(group);
    group.position.set(x, 0, z);
    if (rotated) group.rotation.y = Math.PI / 2;
    for (const side of [-1, 1]) {
      box(group, black, 1.19, .565, .22, 0, .295, side * .95);
      box(group, metal, 1.27, .075, .28, 0, .043, side * .95);
    }
    box(group, black, 1.65, .25, 2.92, 0, .665, 0);
    box(group, wood, 1.66, .13, 2.94, 0, .83, 0);
    box(group, edge, 1.63, .023, 2.9, 0, .906, 0, false);
    const felt = box(group, ordinaryFelt[index % 2]!, 1.46, .028, 2.74, 0, .93, 0, false);
    for (const side of [-1, 1]) {
      box(group, black, .085, .045, 2.75, side * .74, .958, 0);
      box(group, black, 1.48, .045, .085, 0, .958, side * 1.37);
      for (const corner of [-1.29, 0, 1.29]) {
        round(group, tube, pocket, .088, .012, .088, side * .689, .956, corner);
      }
    }
    for (const [id, bx, bz] of [[0, .17, .72], [1, -.14, -.35], [2, -.02, -.51], [3, .11, -.62], [4, -.04, -.7]] as const) {
      round(group, ball, ballColors[id]!, .045, .045, .045, bx, .987, bz);
    }
    const number = new THREE.Sprite(new THREE.SpriteMaterial({
      map: hallLabel(String(index + 1).padStart(2, "0"), "#ffe7aa"),
      transparent: true,
    }));
    number.position.set(.67, 1.12, 1.04);
    number.scale.set(.41, .34, 1);
    group.add(number);
    return felt;
  });

  return {
    room,
    updateTables: (states: ReadonlyMap<number, boolean>) => tables.forEach((felt, index) => {
      const state = states.get(index + 1);
      felt.material = state === undefined ? ordinaryFelt[index % 2]! : state ? liveFelt : openFelt;
    }),
    dispose: () => {
      const materials = new Set<THREE.Material>([openFelt, liveFelt, ...ordinaryFelt]);
      const labelGeometries = new Set<THREE.BufferGeometry>();
      room.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          if (object instanceof THREE.Mesh && ![cube, tube, ball].includes(object.geometry)) labelGeometries.add(object.geometry);
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
