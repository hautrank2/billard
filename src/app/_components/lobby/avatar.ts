import * as THREE from "three";

import type { Gender } from "./hall-types";

const ovalGeometry = new THREE.SphereGeometry(1, 20, 14);
type Point = [number, number, number];

export function createAvatar(gender: Gender) {
  const figure = new THREE.Group();
  const female = gender === "female";
  const paint = (color: string, roughness = 0.72) => new THREE.MeshStandardMaterial({ color, roughness });
  const skin = paint(female ? "#efad81" : "#dea17b");
  const blush = paint("#ce785f");
  const hair = paint(female ? "#602c20" : "#292825", 0.42);
  const shine = paint(female ? "#82482d" : "#403d30", 0.5);
  const shirt = paint(female ? "#77a9b6" : "#62734b");
  const trim = paint(female ? "#a5c8c9" : "#bd8546");
  const denim = paint(female ? "#324961" : "#353b37");
  const white = paint("#f1eddf");
  const iris = paint(female ? "#834c28" : "#456d94");
  const dark = paint("#171b20");

  const oval = (material: THREE.Material, position: Point, scale: Point, tilt = 0) => {
    // Each figure owns its geometries so removing one leaves the others intact.
    const mesh = new THREE.Mesh(ovalGeometry.clone(), material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.rotation.z = tilt;
    figure.add(mesh);
    return mesh;
  };

  for (const sign of [-1, 1]) {
    oval(denim, [sign * 0.13, 0.38, 0], [0.124, 0.34, 0.125], -sign * 0.06);
    oval(skin, [sign * 0.15, 0.13, 0], [0.087, 0.12, 0.092]);
    oval(shirt, [sign * 0.15, 0.08, 0.045], [0.117, 0.08, 0.174]);
    oval(white, [sign * 0.15, 0.05, 0.13], [0.109, 0.047, 0.103]);
    oval(skin, [sign * 0.335, 0.72, 0.03], [0.063, 0.12, 0.064], sign * 0.15);
    oval(shirt, [sign * 0.267, female ? 0.96 : 0.9, 0], [0.095, female ? 0.14 : 0.22, 0.095], sign * 0.24);
    oval(female ? skin : trim, [sign * 0.318, 0.805, 0.016], [0.072, 0.13, 0.067], sign * 0.25);
  }

  oval(denim, [0, 0.62, 0], [0.234, 0.15, 0.14]);
  oval(shirt, [0, 0.87, 0], [0.256, 0.264, 0.156]);
  oval(female ? denim : trim, [0, 0.697, 0.006], [0.224, 0.088, 0.148]);
  if (female) {
    oval(denim, [0, 0.848, 0.119], [0.174, 0.208, 0.068]);
    for (const sign of [-1, 1]) {
      oval(denim, [sign * 0.128, 0.984, 0.097], [0.037, 0.143, 0.058]);
      oval(white, [sign * 0.119, 0.951, 0.167], [0.027, 0.028, 0.012]);
    }
    oval(paint("#435f7e"), [0, 0.835, 0.175], [0.091, 0.071, 0.013]);
  } else {
    oval(trim, [0, 1.072, -0.048], [0.204, 0.121, 0.129]);
    oval(paint("#76855c"), [0, 0.797, 0.137], [0.169, 0.091, 0.028]);
    for (const sign of [-1, 1]) oval(dark, [sign * 0.044, 0.977, 0.153], [0.008, 0.085, 0.008], sign * 0.06);
  }

  oval(skin, [0, 1.109, 0], [0.09, 0.12, 0.091]);
  if (female) oval(hair, [0, 1.329, -0.027], [0.31, 0.326, 0.214]);
  oval(skin, [0, 1.367, 0.032], [0.252, 0.267, 0.218]);
  oval(hair, [0, 1.504, -0.017], [0.274, 0.185, 0.216]);
  for (const sign of [-1, 1]) {
    oval(skin, [sign * 0.25, 1.355, 0.02], [0.052, 0.072, 0.052]);
    oval(hair, [sign * 0.229, female ? 1.366 : 1.495, 0.062],
      [0.072, female ? 0.212 : 0.126, 0.117], -sign * 0.19);
    oval(white, [sign * 0.104, 1.405, 0.226], [0.058, 0.055, 0.026], sign * 0.06);
    oval(iris, [sign * 0.102, 1.405, 0.248], [0.033, 0.038, 0.011]);
    oval(dark, [sign * 0.102, 1.405, 0.256], [0.018, 0.025, 0.007]);
    oval(white, [sign * 0.102 - 0.009, 1.418, 0.26], [0.008, 0.01, 0.006]);
    oval(hair, [sign * 0.103, 1.472, 0.215], [0.064, 0.013, 0.015], -sign * 0.1);
    oval(blush, [sign * 0.155, 1.342, 0.211], [0.04, 0.021, 0.009]);
  }
  oval(skin, [0, 1.358, 0.251], [0.047, 0.044, 0.04]);
  oval(paint("#843e31"), [0, 1.295, 0.241], [0.048, 0.012, 0.008]);

  if (female) {
    for (let i = -3; i <= 3; i += 1) {
      oval(i % 2 ? shine : hair, [i * 0.047, 1.545 + Math.abs(i) * 0.01, 0.184 - Math.abs(i) * 0.01],
        [0.047, 0.071, 0.066], i * -0.065);
    }
  } else {
    for (let i = -1; i <= 2; i += 1) {
      oval(i % 2 ? shine : hair, [i * 0.061 - 0.034, 1.567 + i * 0.015, 0.127],
        [0.097, 0.099, 0.108], -0.52 + i * 0.17);
    }
  }
  return figure;
}
