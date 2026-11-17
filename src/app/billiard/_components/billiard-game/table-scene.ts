import * as THREE from "three";

import { FOOT_SPOT, HEAD_STRING, KITCHEN_DIVIDER_X, TABLE } from "./config";
import { POCKET_PROFILE, RAIL_HEIGHT, RAIL_SIGHT_RADIUS } from "./constants";
import { createPocketBoundary, createPocketPlate, createSidePocketFacing } from "./pocket-shapes";
import { cushionPolygons, pocketCenters, pocketRadius } from "./table-geometry";
import type { TablePreset, Vector2 } from "./type";

export const labelTexture = (text: string, color = "#e8dfc8", background?: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 512, 128);
    }
    ctx.fillStyle = color;
    ctx.font = "600 56px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export const disposeGroup = (root: THREE.Object3D) => {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      geometries.add(object.geometry);
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(mat);
        for (const value of Object.values(mat)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((mat) => mat.dispose());
};

const polygonShape = (points: Vector2[]) => {
  const shape = new THREE.Shape();
  points.forEach((point, i) => {
    if (i === 0) shape.moveTo(point.x, -point.z);
    else shape.lineTo(point.x, -point.z);
  });
  shape.closePath();
  return shape;
};

export const createTable = (preset: TablePreset) => {
  const group = new THREE.Group();
  group.name = `billiard-table-${preset.id}`;
  const w = TABLE.width / 2;
  const l = TABLE.length / 2;
  const ow = preset.outerWidth / 2;
  const ol = preset.outerLength / 2;
  const material = (color: string, metalness = 0, roughness = 0.6) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const body = material(preset.body, 0.15, 0.48);
  const trim = material(preset.trim, 0.7, 0.25);
  const cushion = material(preset.cushion, 0, 0.95);
  const cloth = material(preset.cloth, 0, 1);
  const pocketPlate = material(preset.id === "mr-sung" ? "#262829" : "#141a20", 0.1, 0.76);
  const pocketLiner = material("#34383a", 0, 0.95);
  pocketLiner.side = THREE.BackSide;
  const dark = new THREE.MeshBasicMaterial({ color: "#06080a", side: THREE.DoubleSide });
  const box = (width: number, height: number, depth: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const horizontal = (shape: THREE.Shape, y: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 32), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const well = createPocketBoundary(preset.id, true);

  const outer = () => polygonShape([
    { x: -ow, z: -ol }, { x: ow, z: -ol },
    { x: ow, z: ol }, { x: -ow, z: ol },
  ]);
  const railTop = outer();
  railTop.holes.push(well);
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(railTop, {
    depth: RAIL_HEIGHT + 0.205, bevelEnabled: false, curveSegments: 32,
  }), body);
  frame.rotation.x = -Math.PI / 2;
  frame.position.y = -0.205;
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  // The body is a frame, not a solid slab beneath the pocket mouths.
  for (const side of [-1, 1]) {
    box(0.008, 0.012, preset.outerLength, side * (ow - 0.004), 0.026, 0, trim);
    box(preset.outerWidth, 0.012, 0.008, 0, 0.026, side * (ol - 0.004), trim);
    for (const end of [-1, 1]) {
      const leg = box(preset.id === "predator" ? 0.23 : 0.16, 0.54, 0.24,
        side * 0.57, -0.5, end * 1.05, body);
      if (preset.id === "mr-sung") {
        leg.rotation.z = side * 0.16;
        leg.rotation.x = -end * 0.13;
      }
      box(0.19, 0.035, 0.27, side * 0.61, -0.775, end * 1.08, trim);
    }
  }
  if (preset.id === "mr-sung") {
    // Procedural grain keeps the grey wood finish independent of image assets.
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#c7c7c7";
      ctx.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 128; i += 1) {
        ctx.strokeStyle = `rgba(40,35,30,${0.06 + Math.sin(i * 43) ** 2 * 0.16})`;
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.bezierCurveTo(170, i + Math.sin(i) * 4, 350, i - 2, 512, i + 1);
        ctx.stroke();
      }
    }
    body.map = new THREE.CanvasTexture(canvas);
    body.map.colorSpace = THREE.SRGBColorSpace;
    body.needsUpdate = true;
  }

  const bed = createPocketBoundary(preset.id, false);
  horizontal(bed, 0, cloth);
  for (const polygon of cushionPolygons(preset.id)) {
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(polygonShape(polygon), {
      depth: RAIL_HEIGHT, bevelEnabled: false,
    }), cushion);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const [index, pocket] of pocketCenters(preset.id).entries()) {
    const radius = pocketRadius(preset.id, index % 3 === 1);
    const throat = radius * POCKET_PROFILE.throatScale;
    const { linerDepth, dropDepth } = POCKET_PROFILE;
    horizontal(createPocketPlate(preset.id, pocket), RAIL_HEIGHT + 0.0004, pocketPlate);
    if (pocket.z === 0) {
      const facing = createSidePocketFacing(preset.id, pocket);
      for (const end of [-1, 1]) {
        const mesh = new THREE.Mesh(facing, pocketPlate);
        mesh.scale.set(Math.sign(pocket.x), 1, end);
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }

    // The curved liner begins below the cloth and slopes straight into the well.
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(
      radius + 0.0015, throat, linerDepth, 96, 1, true,
    ), pocketLiner);
    liner.position.set(pocket.x, -linerDepth / 2 - 0.001, pocket.z);
    liner.receiveShadow = true;
    group.add(liner);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(
      throat, throat, dropDepth, 96, 1, true,
    ), dark);
    cup.position.set(pocket.x, -linerDepth - dropDepth / 2 - 0.001, pocket.z);
    group.add(cup);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(throat, 96), dark);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(pocket.x, -linerDepth - dropDepth - 0.001, pocket.z);
    group.add(floor);
  }

  const flatLabel = (text: string, x: number, z: number, width: number, depth: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({
      map: labelTexture(text), transparent: true, depthWrite: false,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.043, z);
    group.add(mesh);
  };
  const sightGeometry = new THREE.CircleGeometry(RAIL_SIGHT_RADIUS, 4);
  const sightMaterial = new THREE.MeshBasicMaterial({ color: preset.balls[0] });
  const sight = (x: number, z: number) => {
    const mesh = new THREE.Mesh(sightGeometry, sightMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.043, z);
    group.add(mesh);
  };
  for (const side of [-1, 1]) {
    for (let i = 1; i <= 7; i += 1) {
      if (i === 4) continue;
      const z = -l + i * TABLE.length / 8;
      sight(side * (w + 0.105), z);
    }
    for (let i = 1; i <= 3; i += 1) {
      sight(-w + i * TABLE.width / 4, side * (l + 0.11));
    }
  }
  flatLabel(preset.name.toUpperCase(), 0, -l - 0.115, 0.5, 0.055);
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.1), new THREE.MeshBasicMaterial({
    map: labelTexture(preset.name.toUpperCase(), preset.trim), transparent: true,
  }));
  brand.position.set(0, -0.11, ol + 0.001);
  group.add(brand);

  const markings = new THREE.LineBasicMaterial({ color: preset.id === "predator" ? "#164f70" : "#50595c", transparent: true, opacity: 0.5 });
  const line = (points: Vector2[]) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, 0.0015, p.z)));
    group.add(new THREE.Line(geometry, markings));
  };
  line([{ x: -w, z: HEAD_STRING }, { x: w, z: HEAD_STRING }]);
  for (const side of [-1, 1]) {
    line([{ x: side * KITCHEN_DIVIDER_X, z: HEAD_STRING }, { x: side * KITCHEN_DIVIDER_X, z: l }]);
  }
  line([{ x: -0.035, z: FOOT_SPOT }, { x: 0.035, z: FOOT_SPOT }]);
  line([{ x: 0, z: FOOT_SPOT - 0.035 }, { x: 0, z: FOOT_SPOT + 0.035 }]);
  return group;
};
