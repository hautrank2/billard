import * as THREE from "three";

import { TABLE, TABLE_PRESETS } from "./config";
import {
  AIM_CAMERA_DEFAULT_PITCH, CAMERA_BASE_DISTANCE, cuePullback, CUE_REST_GAP, JUMP_VIEW,
  PHYSICS_CONFIG, SHOT_CAMERA_SETTLE_DISTANCE,
} from "./constants";
import { cueContactPoint, elevationFraction, resolveCue, strokeCueType } from "./cues";
import { cuePlacementBounds, stepPhysics } from "./engine";
import { isBreakShot, isOver } from "./rules";
import { createShotCameraTransition } from "./shot-camera-transition";
import { isBallInCameraView, predictShotLeavesView } from "./shot-prediction";
import { pocketCenters, pocketRadius } from "./table-geometry";
import { createTable, disposeGroup, labelTexture } from "./table-scene";
import type {
  CueModel, GameState, PhysicsListener, SceneControls, SceneHandle, TablePreset,
} from "./type";

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

const INK = "#181e22";
const TIP_LENGTH = 0.013;

// The cue ball carries small marks so its spin can be seen: dots on the
// Black set, triangles on Arcos II.
const drawCueMark = (ctx: CanvasRenderingContext2D, x: number, preset: TablePreset) => {
  ctx.fillStyle = INK;
  ctx.beginPath();
  if (preset.cueMark === "triangle") {
    ctx.moveTo(x, 116);
    ctx.lineTo(x + 11, 136);
    ctx.lineTo(x - 11, 136);
    ctx.closePath();
  } else {
    ctx.arc(x, 128, 8, 0, Math.PI * 2);
  }
  ctx.fill();
};

const drawNumber = (ctx: CanvasRenderingContext2D, id: number, x: number, preset: TablePreset) => {
  ctx.beginPath();
  ctx.arc(x, 128, 42, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, 128, 35, 0, Math.PI * 2);
  ctx.fillStyle = preset.balls[0];
  ctx.fill();
  const ring = preset.numberStyle === "ring";
  if (ring) {
    // Arcos II: a thin ring around the number with four ticks across it.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, 128, 29, 0, Math.PI * 2);
    ctx.stroke();
    for (let quarter = 0; quarter < 4; quarter += 1) {
      const angle = quarter * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * 25, 128 + Math.sin(angle) * 25);
      ctx.lineTo(x + Math.cos(angle) * 34, 128 + Math.sin(angle) * 34);
      ctx.stroke();
    }
  }
  const size = (id >= 10 ? 44 : 54) - (ring ? 10 : 0);
  ctx.fillStyle = "#171b20";
  ctx.font = `bold ${size}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(id), x, 131);
};

// 1–8 are solid; 9–15 are a band of colour between two caps, which are
// black on the Black set and white on Arcos II.
const ballTexture = (id: number, preset: TablePreset) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const stripe = id >= 9;
    ctx.fillStyle = stripe ? preset.stripeCap : preset.balls[id];
    ctx.fillRect(0, 0, 512, 256);
    if (stripe) {
      ctx.fillStyle = preset.balls[id];
      ctx.fillRect(0, 65, 512, 126);
    }
    for (const x of [128, 384]) {
      if (id === 0) drawCueMark(ctx, x, preset);
      else drawNumber(ctx, id, x, preset);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export const createScene = (
  container: HTMLDivElement,
  getGame: () => GameState,
  getControls: () => SceneControls,
  onSettled: () => void,
  onPhysics: PhysicsListener,
): SceneHandle => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute("aria-label", "Bàn billiard 3D: kéo ngang để ngắm, đổi góc nhìn để quan sát");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101519");
  scene.fog = new THREE.Fog("#101519", 5, 12);
  const camera = new THREE.PerspectiveCamera(49, 1, 0.015, 30);
  scene.add(new THREE.HemisphereLight("#e6edff", "#33302b", 2.0));
  const overhead = new THREE.DirectionalLight("#fffaed", 3.5);
  overhead.position.set(0.4, 4, 0.5);
  overhead.castShadow = true;
  overhead.shadow.mapSize.set(2048, 2048);
  overhead.shadow.camera.left = -2;
  overhead.shadow.camera.right = 2;
  overhead.shadow.camera.top = 2;
  overhead.shadow.camera.bottom = -2;
  overhead.shadow.normalBias = 0.005;
  scene.add(overhead);
  const rim = new THREE.PointLight("#4b91c9", 8, 6);
  rim.position.set(-2, 1, -1.5);
  scene.add(rim);

  const material = (color: string, metalness = 0, roughness = 0.6) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(30, 0.04, 30), material("#151e24"));
  floor.position.y = -0.82;
  floor.receiveShadow = true;
  scene.add(floor);
  let tableId = getGame().options.tableId;
  let table = createTable(TABLE_PRESETS[tableId]);
  scene.add(table);
  const backSign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), new THREE.MeshBasicMaterial({
    map: labelTexture("B L A C K  /  N I N E", "#8d8b7d", "#151c21"),
  }));
  backSign.position.set(0, 0.55, -3.5);
  scene.add(backSign);

  const ballMeshes = new Map<number, THREE.Mesh>();
  const sphere = new THREE.SphereGeometry(TABLE.radius, 40, 28);
  // One mesh per ball of the largest set; a rack shows only its own balls.
  for (let id = 0; id <= 15; id += 1) {
    const mesh = new THREE.Mesh(sphere, new THREE.MeshPhysicalMaterial({
      map: ballTexture(id, TABLE_PRESETS[tableId]), roughness: 0.16, metalness: 0.04,
      clearcoat: 1, clearcoatRoughness: 0.1,
    }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.rotation.y = -Math.PI / 2;
    ballMeshes.set(id, mesh);
    scene.add(mesh);
  }
  // Yaw first, then the elevation about the cross axis of the cue.
  const cueGroup = new THREE.Group();
  cueGroup.rotation.order = "YXZ";
  const shaftMaterial = material("#a89675", 0.15, 0.32);
  const shaft = new THREE.Mesh(new THREE.BufferGeometry(), shaftMaterial);
  shaft.rotation.x = -Math.PI / 2;
  cueGroup.add(shaft);
  const tip = new THREE.Mesh(new THREE.BufferGeometry(), material("#709ca2"));
  tip.rotation.x = Math.PI / 2;
  cueGroup.add(tip);
  const contactMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.0018, 12, 8),
    new THREE.MeshBasicMaterial({ color: "#e5c575" }),
  );
  cueGroup.add(contactMarker);
  scene.add(cueGroup);
  let cueModel: CueModel | null = null;
  // Each cue has its own length, butt and tip; the meshes follow the cue.
  const fitCue = (model: CueModel) => {
    if (cueModel?.id === model.id) return;
    cueModel = model;
    shaft.geometry.dispose();
    shaft.geometry = new THREE.CylinderGeometry(model.tipRadius, model.buttRadius, model.length, 16);
    tip.geometry.dispose();
    tip.geometry = new THREE.CylinderGeometry(model.tipRadius * 1.04, model.tipRadius * 1.04, TIP_LENGTH, 16);
    shaftMaterial.color.set(model.color);
  };

  const guideGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const guide = new THREE.Line(guideGeometry, new THREE.LineDashedMaterial({
    color: "#f4edd9", dashSize: 0.025, gapSize: 0.025, transparent: true, opacity: 0.6,
  }));
  scene.add(guide);
  const ghost = new THREE.Mesh(new THREE.SphereGeometry(TABLE.radius, 24, 16), new THREE.MeshBasicMaterial({
    color: "#fff5d5", wireframe: true, transparent: true, opacity: 0.2,
  }));
  scene.add(ghost);
  // The target circle of a position drill, flat on the cloth.
  const zone = new THREE.Group();
  const zoneRing = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 48),
    new THREE.MeshBasicMaterial({
      color: "#f4edd9", transparent: true, opacity: 0.6, depthWrite: false,
    }),
  );
  const zoneFill = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 48),
    new THREE.MeshBasicMaterial({
      color: "#f4edd9", transparent: true, opacity: 0.08, depthWrite: false,
    }),
  );
  zone.add(zoneRing, zoneFill);
  zone.rotation.x = -Math.PI / 2;
  zone.visible = false;
  scene.add(zone);
  const placementArea = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: "#e5c575", transparent: true, opacity: 0.22, depthWrite: false }));
  placementArea.rotation.x = -Math.PI / 2;
  placementArea.visible = false;
  const placementRing = new THREE.Mesh(
    new THREE.RingGeometry(TABLE.radius * 1.24, TABLE.radius * 1.38, 48),
    new THREE.MeshBasicMaterial({ color: "#e5c575" }),
  );
  placementRing.rotation.x = -Math.PI / 2;
  placementRing.visible = false;
  scene.add(placementArea, placementRing);
  // The jump guide: dashed pieces that fade out, so a jump is aimed with
  // only the first stretch of its line.
  const jumpGuide = Array.from({ length: JUMP_VIEW.guidePieces }, (_, index) => {
    const piece = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({
        color: "#f4edd9",
        dashSize: 0.02,
        gapSize: 0.02,
        transparent: true,
        opacity: 0.6 * (1 - index / JUMP_VIEW.guidePieces) ** 1.5,
      }),
    );
    scene.add(piece);
    return piece;
  });

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  const cameraPosition = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  let initialized = false;
  let lastTime = 0;
  let accumulator = 0;
  let frame = 0;
  let previousGame = getGame();
  let previousView = getControls().view;
  let aimAnchor = { x: 0, z: 0 };
  const drops = new Map<number, number>();
  let cups = pocketCenters(tableId);
  const spinAxis = new THREE.Vector3();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shotCameraTransition = createShotCameraTransition();
  const placementRay = new THREE.Raycaster();
  const placementPointer = new THREE.Vector2();
  const placementPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  const placementPoint = new THREE.Vector3();
  const render = (time: number) => {
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time;
    const game = getGame();
    const controls = getControls();
    if (game !== previousGame) {
      onPhysics({ kind: "roll", speed: 0, ballId: 0, x: 0 });
      drops.clear();
      for (const mesh of ballMeshes.values()) {
        mesh.rotation.set(0, -Math.PI / 2, 0);
      }
      previousGame = game;
    }
    if (tableId !== game.options.tableId) {
      scene.remove(table);
      disposeGroup(table);
      tableId = game.options.tableId;
      cups = pocketCenters(tableId);
      table = createTable(TABLE_PRESETS[tableId]);
      scene.add(table);
      for (const [id, mesh] of ballMeshes) {
        const mat = mesh.material;
        if (mat instanceof THREE.MeshPhysicalMaterial) {
          mat.map?.dispose();
          mat.map = ballTexture(id, TABLE_PRESETS[tableId]);
          mat.needsUpdate = true;
        }
      }
    }
    const rig = controls.camera;
    const heading = controls.view === "aim" ? -controls.angle : rig.yaw;
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    rig.x = Math.max(-1.5, Math.min(1.5, rig.x +
      (controls.navigation.x * forwardZ + controls.navigation.z * forwardX) * dt * 0.8));
    rig.z = Math.max(-1.8, Math.min(1.8, rig.z +
      (-controls.navigation.x * forwardX + controls.navigation.z * forwardZ) * dt * 0.8));
    const wasMoving = game.moving;
    accumulator += dt;
    while (accumulator >= PHYSICS_CONFIG.stepSeconds) {
      stepPhysics(game, PHYSICS_CONFIG.stepSeconds, onPhysics);
      accumulator -= PHYSICS_CONFIG.stepSeconds;
    }
    if (wasMoving && !game.moving) onSettled();
    if (wasMoving) {
      // Rolling noise follows the summed speed, panned toward the loudest ball.
      let rolling = 0;
      let loudest = { speed: 0, ballId: 0, x: 0 };
      for (const ball of game.balls) {
        if (ball.pocketed) continue;
        const speed = Math.hypot(ball.vx, ball.vz);
        rolling += speed;
        if (speed > loudest.speed) loudest = { speed, ballId: ball.id, x: ball.x };
      }
      onPhysics({ kind: "roll", speed: game.moving ? rolling : 0, ballId: loudest.ballId, x: loudest.x });
    }
    for (const mesh of ballMeshes.values()) mesh.visible = false;
    for (const ball of game.balls) {
      const mesh = ballMeshes.get(ball.id);
      if (!mesh) continue;
      if (ball.offTable) continue;
      if (ball.pocketed) {
        const age = (drops.get(ball.id) ?? 0) + dt;
        drops.set(ball.id, age);
        mesh.visible = age < 0.25;
        if (!mesh.visible) continue;
        const cup = cups.find(({ x, z }, index) =>
          Math.hypot(ball.x - x, ball.z - z) <= pocketRadius(tableId, index % 3 === 1));
        const inward = Math.min(age / 0.14, 1);
        mesh.position.set(lerp(ball.x, cup?.x ?? ball.x, inward),
          TABLE.radius - 0.5 * PHYSICS_CONFIG.gravity * age ** 2,
          lerp(ball.z, cup?.z ?? ball.z, inward));
      } else {
        drops.delete(ball.id);
        mesh.visible = true;
        mesh.position.set(ball.x, TABLE.radius + ball.y, ball.z);
        mesh.scale.setScalar(1);
      }
      if (game.moving) {
        // Turn by the simulated angular velocity, so stun, draw and side
        // spin are visible instead of an assumed pure roll.
        spinAxis.set(ball.omegaX, ball.omegaY, ball.omegaZ);
        const rate = spinAxis.length();
        if (rate > 0) mesh.rotateOnWorldAxis(spinAxis.divideScalar(rate), rate * dt);
      }
    }
    const cue = game.balls.find((ball) => ball.id === 0);
    placementArea.visible = game.ballInHand && isBreakShot(game);
    if (placementArea.visible) {
      const { minX, maxX, minZ, maxZ } = cuePlacementBounds(game);
      placementArea.position.set(0, 0.001, (minZ + maxZ) / 2);
      placementArea.scale.set(maxX - minX, maxZ - minZ, 1);
    }
    placementRing.visible = game.ballInHand && Boolean(cue && !cue.pocketed);
    if (placementRing.visible && cue) placementRing.position.set(cue.x, 0.003, cue.z);
    const target = game.drill?.zone;
    zone.visible = Boolean(target);
    if (target) {
      zone.position.set(target.x, 0.002, target.z);
      zone.scale.setScalar(target.radius);
    }
    const activeCue = resolveCue(
      controls.loadout,
      strokeCueType(isBreakShot(game), controls.cueMode),
    );
    fitCue(activeCue);
    const jumping = activeCue.type === "jump";
    // 0 for the lowest jump elevation, 1 for the steepest.
    const reach = jumping ? elevationFraction(activeCue, controls.elevation) : 0;
    if (cue) {
      const dx = Math.sin(controls.angle);
      const dz = -Math.cos(controls.angle);
      cueGroup.visible = !game.moving && !isOver(game) && !game.ballInHand;
      cueGroup.position.set(cue.x, TABLE.radius + cue.y, cue.z);
      cueGroup.rotation.y = -controls.angle;
      cueGroup.rotation.x = jumping ? -THREE.MathUtils.degToRad(controls.elevation) : 0;
      const pullback = cuePullback(controls.cuePull);
      const contact = cueContactPoint(activeCue, controls.spin);
      const tipFront = contact.z + CUE_REST_GAP + pullback;
      contactMarker.position.set(contact.x, contact.y, contact.z);
      tip.position.set(contact.x, contact.y, tipFront + TIP_LENGTH / 2);
      shaft.position.set(contact.x, contact.y, tipFront + TIP_LENGTH + activeCue.length / 2);
      const showGuide = controls.guide && cueGroup.visible;
      guide.visible = showGuide && !jumping;
      ghost.visible = guide.visible;
      let distance = 3;
      for (const ball of game.balls) {
        if (ball.id === 0 || ball.pocketed) continue;
        const bx = ball.x - cue.x;
        const bz = ball.z - cue.z;
        const along = bx * dx + bz * dz;
        const across = bx * bx + bz * bz - along * along;
        if (along > 0 && across < (TABLE.radius * 2) ** 2) {
          distance = Math.min(distance, along - Math.sqrt((TABLE.radius * 2) ** 2 - Math.max(0, across)));
        }
      }
      if (Math.abs(dx) > 0.0001) distance = Math.min(distance, ((dx > 0 ? 1 : -1) * (TABLE.width / 2 - TABLE.radius) - cue.x) / dx);
      if (Math.abs(dz) > 0.0001) distance = Math.min(distance, ((dz > 0 ? 1 : -1) * (TABLE.length / 2 - TABLE.radius) - cue.z) / dz);
      distance = Math.max(0, distance);
      guideGeometry.setFromPoints([
        new THREE.Vector3(cue.x, TABLE.radius, cue.z),
        new THREE.Vector3(cue.x + dx * distance, TABLE.radius, cue.z + dz * distance),
      ]);
      guide.computeLineDistances();
      ghost.position.set(cue.x + dx * distance, TABLE.radius, cue.z + dz * distance);
      // A jump flies over balls, so its guide runs toward the rail, but only
      // its first stretch shows, and less of it the steeper the cue.
      let railDistance = 3;
      if (Math.abs(dx) > 0.0001) railDistance = Math.min(railDistance, ((dx > 0 ? 1 : -1) * (TABLE.width / 2 - TABLE.radius) - cue.x) / dx);
      if (Math.abs(dz) > 0.0001) railDistance = Math.min(railDistance, ((dz > 0 ? 1 : -1) * (TABLE.length / 2 - TABLE.radius) - cue.z) / dz);
      const fade = Math.min(Math.max(0, railDistance), lerp(JUMP_VIEW.guideFar, JUMP_VIEW.guideNear, reach));
      jumpGuide.forEach((piece, index) => {
        piece.visible = showGuide && jumping;
        if (!piece.visible) return;
        const from = fade * index / jumpGuide.length;
        const to = fade * (index + 1) / jumpGuide.length;
        piece.geometry.setFromPoints([
          new THREE.Vector3(cue.x + dx * from, TABLE.radius, cue.z + dz * from),
          new THREE.Vector3(cue.x + dx * to, TABLE.radius, cue.z + dz * to),
        ]);
        piece.computeLineDistances();
      });

      if (controls.view === "overhead") {
        const fovScale = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const preset = TABLE_PRESETS[tableId];
        const fit = Math.max(
          preset.outerLength * 1.12 / fovScale,
          preset.outerWidth * 1.12 / (fovScale * camera.aspect),
        );
        const radius = fit * rig.distance / CAMERA_BASE_DISTANCE;
        cameraPosition.set(
          rig.x + Math.sin(rig.yaw) * Math.cos(rig.pitch) * radius,
          Math.sin(rig.pitch) * radius,
          rig.z + Math.cos(rig.yaw) * Math.cos(rig.pitch) * radius,
        );
        cameraTarget.set(rig.x, 0, rig.z);
      } else if (controls.view === "spectator") {
        const framing = Math.max(1, 1.2 / camera.aspect);
        const radius = rig.distance * framing;
        cameraPosition.set(
          rig.x + Math.sin(rig.yaw) * Math.cos(rig.pitch) * radius,
          Math.sin(rig.pitch) * radius,
          rig.z + Math.cos(rig.yaw) * Math.cos(rig.pitch) * radius,
        );
        cameraTarget.set(rig.x, 0, rig.z);
      } else {
        if ((!game.moving && !game.ballInHand) || !initialized || previousView !== controls.view) {
          aimAnchor = { x: cue.x, z: cue.z };
        }
        const zoom = rig.distance / CAMERA_BASE_DISTANCE;
        const pitchOffset = rig.pitch - AIM_CAMERA_DEFAULT_PITCH;
        if (jumping) {
          // From above at 47 degrees, steepening and closing in as the cue
          // rises: a jump over a near ball sees little of the table beyond.
          const jumpPitch = THREE.MathUtils.degToRad(lerp(JUMP_VIEW.minPitch, JUMP_VIEW.maxPitch, reach));
          // Keep the close jump framing while allowing small vertical adjustments.
          const pitch = jumpPitch + pitchOffset * 0.28;
          const reachBack = lerp(JUMP_VIEW.maxDistance, JUMP_VIEW.minDistance, reach) * zoom;
          const ahead = lerp(JUMP_VIEW.maxLookAhead, JUMP_VIEW.minLookAhead, reach);
          cameraTarget.set(aimAnchor.x + dx * ahead + rig.x, 0.005, aimAnchor.z + dz * ahead + rig.z);
          cameraPosition.set(
            cameraTarget.x - dx * Math.cos(pitch) * reachBack,
            Math.sin(pitch) * reachBack,
            cameraTarget.z - dz * Math.cos(pitch) * reachBack,
          );
        } else {
          cameraTarget.set(aimAnchor.x + dx * 0.35 + rig.x, 0.005, aimAnchor.z + dz * 0.35 + rig.z);
          const back = zoom + 0.35;
          const rise = 0.58 * zoom - cameraTarget.y;
          const radius = Math.hypot(back, rise);
          const pitch = Math.atan2(rise, back) + pitchOffset;
          cameraPosition.set(
            cameraTarget.x - dx * Math.cos(pitch) * radius,
            cameraTarget.y + Math.sin(pitch) * radius,
            cameraTarget.z - dz * Math.cos(pitch) * radius,
          );
        }
      }
      const smoothCamera = initialized && !reducedMotion && !(game.ballInHand && previousView !== controls.view);
      camera.position.lerp(cameraPosition, smoothCamera ? 1 - Math.exp(-dt * 10) : 1);
      camera.lookAt(cameraTarget);
      initialized = true;
    }
    previousView = controls.view;
    renderer.render(scene, camera);
    shotCameraTransition.afterRender(controls.view === "overhead" &&
      camera.position.distanceToSquared(cameraPosition) <= SHOT_CAMERA_SETTLE_DISTANCE ** 2);
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);
  return {
    waitForShotCamera: shotCameraTransition.wait,
    cancelShotCamera: shotCameraTransition.cancel,
    predictShotCamera: (angle, power, spin, stroke) => {
      if (!initialized || getControls().view !== "aim") return false;
      camera.updateMatrixWorld(true);
      const shotCamera = camera.clone();
      shotCamera.updateMatrixWorld(true);
      return predictShotLeavesView(getGame(), angle, power, spin,
        (point) => isBallInCameraView(point, shotCamera), stroke);
    },
    isCueHit: (x, y) => {
      const cue = getGame().balls.find((ball) => ball.id === 0);
      if (!cue || cue.pocketed) return false;
      const rect = renderer.domElement.getBoundingClientRect();
      const position = new THREE.Vector3(cue.x, TABLE.radius, cue.z);
      const distance = camera.position.distanceTo(position);
      const projected = position.project(camera);
      if (projected.z < -1 || projected.z > 1) return false;
      const sx = rect.left + (projected.x + 1) / 2 * rect.width;
      const sy = rect.top + (1 - projected.y) / 2 * rect.height;
      const radius = TABLE.radius * rect.height /
        (distance * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      return Math.hypot(x - sx, y - sy) <= Math.max(12, radius + 4);
    },
    pointOnTable: (x, y, height = 0) => {
      if (!initialized) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      placementPointer.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
      placementRay.setFromCamera(placementPointer, camera);
      placementPlane.constant = -height;
      const point = placementRay.ray.intersectPlane(placementPlane, placementPoint);
      return point ? { x: point.x, z: point.z } : null;
    },
    dispose: () => {
      onPhysics({ kind: "roll", speed: 0, ballId: 0, x: 0 });
      shotCameraTransition.cancel();
      cancelAnimationFrame(frame);
      observer.disconnect();
      disposeGroup(scene);
      overhead.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};
