import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import { AVATAR_HIP_HEIGHT } from "./hall-layout";
import type { Gender } from "./hall-types";

type Point = [number, number, number];
type Ring = [number, number, number, number?];

export function createAvatar(gender: Gender) {
  const figure = new THREE.Group();
  figure.name = `street-player-${gender}`;
  const female = gender === "female";
  const paint = (color: string, roughness = .72) => new THREE.MeshStandardMaterial({ color, roughness });
  const skin = new THREE.MeshPhysicalMaterial({ color: female ? "#cd9b7d" : "#b98565", roughness: .7, clearcoat: .035 });
  const skinShadow = paint(female ? "#ae775f" : "#956348");
  const lips = paint(female ? "#9e605b" : "#8a5850", .8);
  const hair = paint(female ? "#30251f" : "#201e1c", .88);
  const hairLight = paint(female ? "#514035" : "#38312b", .85);
  const jacket = paint(female ? "#536e71" : "#343d35", .9);
  const jacketShadow = paint(female ? "#32494c" : "#242d27", .94);
  const seam = paint(female ? "#88a2a0" : "#67705b", .9);
  const denim = paint(female ? "#242e39" : "#303331", .96);
  const denimLight = paint(female ? "#3f4b55" : "#4a4b43", .95);
  const white = paint("#ddd9ce", .85);
  const rubber = paint("#b6b6ac", .95);
  const dark = paint("#151b20", .8);
  const leatherMat = paint("#34302a", .88);
  const silver = new THREE.MeshStandardMaterial({ color: "#aeb5b4", metalness: .8, roughness: .35 });
  const gold = new THREE.MeshStandardMaterial({ color: "#ad9060", metalness: .75, roughness: .4 });
  // Geometry is owned by each figure; removing a player cannot dispose another's mesh.
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  const add = (parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, pos: Point) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const oval = (parent: THREE.Group, material: THREE.Material, pos: Point, size: Point, tilt = 0) => {
    const mesh = add(parent, sphere, material, pos);
    mesh.scale.set(...size); mesh.rotation.z = tilt; return mesh;
  };
  const box = (parent: THREE.Group, material: THREE.Material, pos: Point, size: Point, radius = .007) =>
    add(parent, new RoundedBoxGeometry(...size, 2, radius), material, pos);
  const line = (parent: THREE.Group, material: THREE.Material, points: Point[], radius = .002, segments = 12) =>
    add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), segments, radius, 5, false), material, [0, 0, 0]);
  const loft = (parent: THREE.Group, material: THREE.Material, rings: Ring[], pos: Point, segments = 28) => {
    const vertices: number[] = []; const indices: number[] = [];
    rings.forEach(([y, xRadius, zRadius, zOffset = 0], row) => {
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2;
        vertices.push(Math.cos(angle) * xRadius, y, Math.sin(angle) * zRadius + zOffset);
        if (row && i < segments) {
          const a = row * (segments + 1) + i, b = a - segments - 1;
          indices.push(b, a, b + 1, b + 1, a, a + 1);
        }
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return add(parent, geometry, material, pos);
  };
  const joints: Record<string, THREE.Group> = {};
  const joint = (name: string, parent: THREE.Group, pos: Point) => {
    const pivot = new THREE.Group(); pivot.position.set(...pos);
    parent.add(pivot); joints[name] = pivot; return pivot;
  };
  const hipHeight = AVATAR_HIP_HEIGHT;
  for (const sign of [-1, 1]) {
    const side = sign < 0 ? "left" : "right";
    const hip = joint(`${side}Hip`, figure, [sign * .105, hipHeight, 0]);
    loft(hip, denim, [[-.39, .061, .065], [-.32, .069, .074], [-.15, .085, .089], [0, .087, .089]], [0, 0, 0]);
    line(hip, denimLight, [[sign * .077, -.04, .01], [sign * .078, -.18, .015], [sign * .061, -.37, .01]], .002);
    const pocket = box(hip, denim, [sign * .073, -.19, .025], [.025, .13, .103]);
    pocket.rotation.z = sign * .035;
    box(hip, denimLight, [sign * .087, -.14, .028], [.009, .025, .104], .002);
    const knee = joint(`${side}Knee`, hip, [0, -.38, 0]);
    loft(knee, denim, [[-.34, .047, .048], [-.29, .049, .052], [-.12, .062, .06], [0, .063, .067]], [0, 0, 0]);
    for (let i = 0; i < 3; i++) {
      line(knee, denimLight, [[-.046, -.025 - i * .017, .045], [0, -.032 - i * .017, .065], [.043, -.015 - i * .017, .043]], .0015);
    }
    box(knee, jacketShadow, [0, -.35, 0], [.105, .035, .108], .008);
    const shoe = new THREE.Group();
    shoe.position.y = -.04;
    knee.add(shoe);
    // Layered sneaker soles, toe panels, heel tabs and individual laces.
    box(shoe, dark, [0, -.388, .034], [.126, .026, .247], .014);
    box(shoe, white, [0, -.369, .034], [.13, .026, .25], .014);
    box(shoe, rubber, [0, -.35, .037], [.12, .019, .238], .01);
    oval(shoe, white, [0, -.321, .05], [.059, .041, .115]);
    oval(shoe, jacketShadow, [0, -.312, .004], [.055, .052, .067]);
    box(shoe, white, [0, -.287, .019], [.058, .02, .063], .005);
    box(shoe, leatherMat, [0, -.307, -.07], [.074, .05, .016], .004);
    for (let i = 0; i < 5; i++) {
      const z = .023 + i * .011;
      line(shoe, white, [[-.031, -.278 + i * -.003, z], [0, -.274 + i * -.003, z + .005], [.031, -.278 + i * -.003, z]], .0022, 5);
    }
    const shoulder = joint(`${side}Shoulder`, figure, [sign * (female ? .19 : .215), 1.31, 0]);
    oval(shoulder, jacket, [sign * .018, -.04, 0], [.074, .09, .08]);
    loft(shoulder, jacket, [[-.245, .05, .052], [-.19, .059, .061], [-.07, .073, .075], [0, .063, .067]], [sign * .018, 0, 0]);
    line(shoulder, seam, [[sign * .079, -.045, .004], [sign * .074, -.12, .01], [sign * .063, -.22, .006]], .002);
    const elbow = joint(`${side}Elbow`, shoulder, [sign * .02, -.24, 0]);
    loft(elbow, jacket, [[-.19, .037, .041], [-.13, .043, .049], [-.02, .05, .053], [0, .049, .052]], [0, 0, 0]);
    box(elbow, jacketShadow, [0, -.19, 0], [.08, .037, .085], .012);
    for (const x of [-.025, -.01, .01, .025]) line(elbow, seam, [[x, -.177, .043], [x, -.205, .039]], .0012, 3);
    oval(elbow, skin, [0, -.235, .004], [.034, .05, .021]);
    // Four separate fingers and an angled thumb, with knuckle and nail details.
    for (let i = 0; i < 4; i++) {
      const x = -.024 + i * .015;
      oval(elbow, skin, [x, -.284 + Math.abs(i - 1.5) * .004, .012], [.008, .03 - Math.abs(i - 1.5) * .003, .009]);
      oval(elbow, skinShadow, [x, -.267, .019], [.006, .004, .002]);
      oval(elbow, white, [x, -.300 + Math.abs(i - 1.5) * .006, .019], [.004, .006, .001]);
    }
    oval(elbow, skin, [sign * .036, -.251, .023], [.012, .027, .013], sign * .45);
    if (sign < 0) {
      box(elbow, leatherMat, [0, -.205, 0], [.086, .028, .086], .009);
      box(elbow, silver, [0, -.205, .046], [.041, .032, .008], .004);
      box(elbow, dark, [0, -.205, .052], [.032, .025, .003], .003);
      line(elbow, white, [[0, -.205, .055], [0, -.196, .055]], .0015, 2);
    }
  }
  // Tailored torso silhouette, rather than stacked spheres.
  loft(figure, denim, [[.75, .18, .092], [.81, .182, .105], [.89, .165, .096]], [0, 0, 0]);
  loft(figure, white, [[.87, .12, .07], [1.13, .12, .07], [1.32, .11, .06], [1.37, .055, .05]], [0, 0, .005]);
  loft(figure, jacket, [[.88, .166, .11], [.94, .17, .115], [1.12, female ? .173 : .195, .116], [1.29, female ? .19 : .213, .109], [1.35, .115, .078]], [0, 0, -.012]);
  box(figure, jacketShadow, [0, .899, -.005], [.334, .045, .22], .016);
  // Open jacket panels, visible tee and metal zipper teeth.
  box(figure, white, [0, 1.121, .11], [.084, .37, .015], .006);
  for (const sign of [-1, 1]) {
    const edge = line(figure, jacketShadow, [[sign * .11, 1.34, .056], [sign * .055, 1.27, .113], [sign * .048, 1.1, .121], [sign * .046, .92, .116]], .012);
    edge.name = "jacket-lapel";
    for (let i = 0; i < 17; i++) box(figure, silver, [sign * .045, .95 + i * .017, .13], [.008, .006, .005], .001);
    box(figure, jacketShadow, [sign * .118, 1.005, .105], [.092, .018, .014], .004).rotation.z = sign * .3;
    line(figure, seam, [[sign * .078, .98, .112], [sign * .155, 1.02, .104]], .0018);
    for (let i = 0; i < 7; i++) line(figure, seam, [[sign * (.075 + i * .012), .886, .106], [sign * (.075 + i * .012), .914, .108]], .0012, 2);
    box(figure, leatherMat, [sign * .09, .854, .096], [.017, .05, .017], .002);
    box(figure, denimLight, [sign * .11, .784, -.099], [.085, .089, .01], .005);
    line(figure, seam, [[sign * .07, .82, -.106], [sign * .11, .798, -.109], [sign * .15, .82, -.106]], .0018);
  }
  box(figure, leatherMat, [0, .855, .001], [.335, .034, .205], .009);
  box(figure, silver, [0, .855, .108], [.039, .029, .009], .003);
  box(figure, dark, [0, .855, .114], [.025, .018, .004], .002);
  box(figure, dark, [female ? -.111 : .113, 1.238, .101], [.058, .041, .009], .003);
  for (let i = 0; i < 3; i++) box(figure, white, [(female ? -.13 : .093) + i * .017, 1.24, .108], [.009, .019 - i * .003, .002], .001);
  oval(figure, skin, [0, 1.395, 0], [.055, .075, .055]);
  // Collar and a thin necklace frame the neck without oversized cartoon features.
  for (const sign of [-1, 1]) {
    box(figure, jacketShadow, [sign * .067, 1.358, -.005], [.069, .06, .116], .01).rotation.z = sign * .32;
  }
  line(figure, gold, [[-.048, 1.391, .033], [-.04, 1.326, .09], [0, 1.294, .116], [.04, 1.326, .09], [.048, 1.391, .033]], .0021, 16);
  box(figure, silver, [0, 1.288, .119], [.016, .026, .004], .002);
  const faceY = female ? 1.548 : 1.557;
  loft(figure, skin, [[-.142, .025, .036, .018], [-.121, female ? .052 : .06, .058, .017], [-.077, female ? .08 : .086, .079, .008], [-.02, female ? .098 : .103, .087], [.045, female ? .1 : .105, .088], [.107, .09, .078], [.14, .06, .049], [.15, .002, .002]], [0, faceY, .005], 36);
  for (const sign of [-1, 1]) {
    oval(figure, skin, [sign * .106, faceY - .015, 0], [.018, .034, .015]);
    oval(figure, skinShadow, [sign * .117, faceY - .014, .008], [.006, .02, .006]);
    oval(figure, skinShadow, [sign * .043, faceY + .022, .085], [.027, .014, .008], sign * .08);
    oval(figure, white, [sign * .043, faceY + .021, .091], [.021, female ? .0105 : .009, .006], sign * .07);
    oval(figure, paint(female ? "#514335" : "#4c5347"), [sign * .042, faceY + .02, .097], [.007, .008, .003]);
    oval(figure, dark, [sign * .042, faceY + .02, .100], [.0033, .005, .001]);
    oval(figure, white, [sign * .042 - .002, faceY + .023, .101], [.0015, .0018, .001]);
    line(figure, hair, [[sign * .023, faceY + .052, .087], [sign * .045, faceY + .057, .085], [sign * .068, faceY + .049, .077]], female ? .003 : .004, 8);
    line(figure, skinShadow, [[sign * .024, faceY + .012, .092], [sign * .044, faceY + .01, .096], [sign * .063, faceY + .014, .087]], .0015, 7);
    oval(figure, skinShadow, [sign * .012, faceY - .027, .104], [.006, .003, .004]);
    if (female) {
      line(figure, hair, [[sign * .023, faceY + .024, .096], [sign * .043, faceY + .03, .097], [sign * .065, faceY + .026, .087]], .0018, 8);
      const hoop = add(figure, new THREE.TorusGeometry(.013, .002, 5, 16), gold, [sign * .113, faceY - .045, .003]);
      hoop.rotation.y = sign * .4;
    }
  }
  oval(figure, skin, [0, faceY, .09], [.012, .039, .017]);
  oval(figure, skin, [0, faceY - .022, .108], [.017, .012, .013]);
  oval(figure, lips, [0, faceY - .065, .087], [.025, female ? .0065 : .005, .006]);
  oval(figure, lips, [0, faceY - .074, .086], [.022, female ? .0075 : .006, .006]);
  line(figure, skinShadow, [[-.022, faceY - .068, .092], [0, faceY - .069, .094], [.022, faceY - .068, .092]], .0012, 8);
  oval(figure, skin, [0, faceY - .103, .061], [.035, .02, .024]);
  // Fitted hair cap plus sculpted locks and fine swept strands.
  const cap = add(figure, new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * .56), hair, [0, faceY + .074, -.009]);
  cap.scale.set(.11, .09, .094);
  if (female) {
    for (const sign of [-1, 1]) oval(figure, hair, [sign * .096, faceY + .033, -.016], [.021, .071, .072]);
    oval(figure, dark, [.018, faceY + .09, -.109], [.04, .03, .028]);
    for (let i = 0; i < 7; i++) {
      const x = .018 + (i - 3) * .008;
      line(figure, i % 2 ? hairLight : hair, [[x, faceY + .1, -.116], [x + .015, faceY + .025, -.15], [x + .01, faceY - .09, -.137], [x - .01, faceY - .19, -.095]], .009, 16);
    }
    for (let i = 0; i < 13; i++) {
      const x = -.088 + i * .014;
      line(figure, i % 3 ? hair : hairLight, [[x, faceY + .075, .069], [x * .8, faceY + .157 - Math.abs(x) * .45, -.005], [.018, faceY + .092, -.107]], .0032, 14);
    }
    for (let i = 0; i < 4; i++) {
      line(figure, i % 2 ? hairLight : hair, [[.025 + i * .009, faceY + .148, .02], [-.035, faceY + .119 - i * .004, .075], [-.088, faceY + .065 - i * .009, .054]], .004, 14);
    }
    line(figure, hairLight, [[-.065, faceY + .11, .066], [-.091, faceY + .065, .068], [-.09, faceY - .03, .045]], .005, 12);
  } else {
    for (const sign of [-1, 1]) oval(figure, hair, [sign * .097, faceY + .035, -.026], [.013, .052, .061]);
    for (let i = 0; i < 9; i++) {
      const x = -.082 + i * .019;
      oval(figure, i % 3 ? hair : hairLight, [x, faceY + .126 + i * .002, .022], [.022, .047, .06], -.4);
      line(figure, hairLight, [[x - .01, faceY + .104, .066], [x + .006, faceY + .164, .022], [x + .016, faceY + .13, -.04]], .0022, 10);
    }
  }
  // Long cue case with contrast piping, accessory pockets and a shoulder sling.
  // The avatar faces +Z, so the case sits against the back at -Z.
  const cueCase = new THREE.Group();
  cueCase.position.set(.035, 1.03, -.19);
  cueCase.rotation.z = -.17;
  figure.add(cueCase);
  const leather = paint("#18232d", .86);
  const blue = paint("#397cba", .68);
  const piping = paint("#e1e5df", .65);
  const buckle = new THREE.MeshStandardMaterial({ color: "#adb8bc", metalness: .75, roughness: .3 });
  const capsule = (material: THREE.Material, radius: number, length: number, x: number, y: number, z: number, depth = 1) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), material);
    mesh.position.set(x, y, z);
    mesh.scale.z = depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    cueCase.add(mesh);
    return mesh;
  };
  capsule(piping, .115, 1.14, 0, 0, 0, .78);
  capsule(leather, .105, 1.14, 0, 0, -.014, .83);
  capsule(blue, .079, 1.13, 0, 0, -.069, .46);
  capsule(leather, .092, .49, 0, -.2, -.104, .47);
  capsule(blue, .079, .49, 0, -.2, -.116, .43);
  capsule(leather, .091, .12, 0, .32, -.103, .49);
  capsule(blue, .077, .12, 0, .32, -.117, .42);
  const detail = (material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    cueCase.add(mesh);
  };
  for (const y of [-.62, .62]) detail(leather, .21, .07, .17, 0, y, 0);
  detail(leather, .07, .15, .025, 0, .53, -.099);
  detail(buckle, .052, .046, .028, 0, .52, -.12);
  for (const y of [.37, -.02]) detail(buckle, .014, .047, .018, .076, y, -.16);
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.1, -.2, 0), new THREE.Vector3(.19, -.14, 0),
    new THREE.Vector3(.19, .11, 0), new THREE.Vector3(.1, .17, 0),
  ]);
  cueCase.add(new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 16, .018, 6, false), leather));
  const slingCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.16, 1.39, -.16), new THREE.Vector3(.215, 1.32, .045),
    new THREE.Vector3(.02, 1.12, .143), new THREE.Vector3(-.19, .91, .1),
    new THREE.Vector3(-.16, .52, -.17),
  ]);
  figure.add(new THREE.Mesh(new THREE.TubeGeometry(slingCurve, 28, .025, 6, false), leather));
  const body = new THREE.Group();
  body.position.y = hipHeight;
  figure.add(body);
  figure.updateMatrixWorld(true);
  for (const child of [...figure.children]) {
    if (child !== body && child !== joints.leftHip && child !== joints.rightHip) body.attach(child);
  }
  // Batch fixed details by material inside each joint. The fingers, seams and
  // hair keep their shape while a crowded hall avoids hundreds of calls per person.
  const originals = new Set<THREE.BufferGeometry>();
  const groups: THREE.Group[] = [];
  figure.traverse((node) => { if (node instanceof THREE.Group) groups.push(node); });
  for (const parent of groups) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
      const batch = batches.get(child.material) ?? [];
      batch.push(child); batches.set(child.material, batch);
    }
    for (const [material, meshes] of batches) {
      const parts = meshes.map((mesh) => {
        mesh.updateMatrix(); originals.add(mesh.geometry);
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        geometry.deleteAttribute("uv"); geometry.applyMatrix4(mesh.matrix);
        return geometry;
      });
      const merged = mergeGeometries(parts, false);
      if (merged) {
        for (const mesh of meshes) mesh.removeFromParent();
        const batch = new THREE.Mesh(merged, material);
        batch.castShadow = true; batch.receiveShadow = true; parent.add(batch);
      }
      for (const part of parts) part.dispose();
    }
  }
  for (const geometry of originals) geometry.dispose();
  figure.userData.rig = { ...joints, body };
  return figure;
}
