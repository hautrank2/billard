import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import * as THREE from "three";

registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes("/src/") && specifier.startsWith(".") && !specifier.endsWith(".ts")) return next(`${specifier}.ts`, context);
  return next(specifier, context);
} });
const { instanceStaticMeshes } = await import("../src/app/_components/lobby/static-meshes.ts");
const { createHallRoom } = await import("../src/app/_components/lobby/hall-room.ts");

test("static batches preserve nested world transforms, bounds and independent visibility", () => {
  const root = new THREE.Group();
  root.scale.set(1.5, 1, 1.5);
  const hidden = new THREE.Group();
  root.add(hidden);
  const material = new THREE.MeshStandardMaterial();
  const geometry = new THREE.BoxGeometry();
  for (let i = 0; i < 8; i++) {
    const parent = new THREE.Group();
    parent.position.set(i, .8, -i);
    parent.rotation.y = i * .2;
    parent.scale.set(.7, 1, 1.4);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(.5, .6, .7);
    parent.add(mesh);
    (i < 6 ? root : hidden).add(parent);
  }
  const before = new THREE.Box3().setFromObject(root);
  instanceStaticMeshes(root, hidden);
  assert.equal(hidden.children[0].children[0].isMesh, true);
  instanceStaticMeshes(hidden);
  const after = new THREE.Box3().setFromObject(root);
  assert.ok(before.min.distanceTo(after.min) < 1e-5);
  assert.ok(before.max.distanceTo(after.max) < 1e-5);
  assert.equal(root.children.filter((child) => child.isInstancedMesh).length, 1);
  assert.equal(hidden.children.filter((child) => child.isInstancedMesh).length, 1);
  root.traverse((object) => { if (object.isInstancedMesh) object.dispose(); });
  geometry.dispose();
  material.dispose();
});

test("hall batches repeated furniture and tables and releases instance buffers", (t) => {
  const previous = globalThis.document;
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  // Canvas textures and image loading need a DOM, but scene construction needs no GPU.
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => null }),
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(value) {} }),
  };
  const hall = createHallRoom();
  let draws = 0;
  let unbatchedDraws = 0;
  let lights = 0;
  const batches = [];
  hall.room.traverse((object) => {
    if (object.isMesh || object.isLine || object.isSprite) {
      draws++;
      unbatchedDraws += object.isInstancedMesh ? object.count : 1;
    }
    if (object.isPointLight) lights++;
    if (object.isInstancedMesh) batches.push(object);
  });
  t.diagnostic(`Room draw submissions: ${unbatchedDraws} → ${draws}; point lights: ${lights}`);
  assert.ok(draws < unbatchedDraws * .4, "reduce room submissions by at least 60%");
  assert.equal(lights, 2);
  let released = 0;
  for (const batch of batches) batch.addEventListener("dispose", () => released++);
  hall.setOverview(true);
  hall.updateTables(new Map([[1, true], [2, false]]));
  hall.dispose();
  assert.equal(released, batches.length);
});
