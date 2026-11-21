"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { disposeGroup } from "../../billiard/_components/billiard-game/table-scene";
import { createAvatar } from "./avatar";
import { createHallRoom, hallLabel, tablePositions } from "./hall-room";
import { createHallWalk } from "./hall-walk";
import type { WalkCommand } from "./hall-walk";
import type { Gender, HallMotion, HallPlayer, HallTable } from "./hall-types";

function rendererFor(container: HTMLElement) {
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.26;
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    return renderer;
  } catch {
    return null;
  }
}

function lights(scene: THREE.Scene) {
  const key = new THREE.DirectionalLight("#ffdfb4", 3.1);
  key.position.set(-6, 12, 6);
  const rim = new THREE.DirectionalLight("#8bcbdc", 1.45);
  rim.position.set(4, 6, -6);
  scene.add(new THREE.HemisphereLight("#c6e1ea", "#806151", 1.5), key, rim);
  return key;
}

type SceneInput = {
  people: readonly HallPlayer[];
  tables: readonly HallTable[];
  selfId?: string;
  overhead: boolean;
  paused: boolean;
  onMotion: (motion: HallMotion) => void;
};

const waitingSpots = [
  [-10.9, 0.35], [-7.2, -.27], [-4.7, .01], [-1.2, -.4], [2.1, .05], [5.85, -.15],
  [8.7, -.55], [-9.82, -1.6], [-7.9, 3.49], [-4.3, 3.42], [1.85, 3.4], [7.9, 3.43],
];

function nameSprite(name: string, isSelf: boolean) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: hallLabel(name, isSelf ? "#ffdb88" : "#effaff"),
    transparent: true,
    depthWrite: false,
  }));
  sprite.scale.set(2.2, .55, 1);
  sprite.position.y = 1.87;
  return sprite;
}

function removeAvatar(avatar: THREE.Group) {
  avatar.removeFromParent();
  const tag = avatar.children.find((object) => object instanceof THREE.Sprite);
  if (tag) {
    tag.material.map?.dispose();
    tag.material.dispose();
  }
  disposeGroup(avatar);
}

export const LobbyScene = ({ people, tables, selfId, overhead, paused, onMotion }: SceneInput) => {
  const host = useRef<HTMLDivElement>(null);
  const update = useRef<(input: SceneInput) => void>(null);
  const controls = useRef<ReturnType<typeof createHallWalk>>(null);
  const publish = useRef(onMotion);
  const [locked, setLocked] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => { publish.current = onMotion; }, [onMotion]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const renderer = rendererFor(container);
    if (!renderer) { setUnavailable(true); return; }

    const scene = new THREE.Scene();
    const overviewCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 160);
    const firstPerson = new THREE.PerspectiveCamera(72, 1, .045, 90);
    const walk = createHallWalk(renderer.domElement, firstPerson, (motion) => publish.current(motion), setLocked);
    controls.current = walk;
    const handMaterial = new THREE.MeshStandardMaterial({ color: "#bc9368", roughness: .8 });
    const hand = new THREE.Mesh(new THREE.CapsuleGeometry(.045, .13, 5, 10), handMaterial);
    hand.rotation.x = Math.PI / 3;
    hand.position.set(.24, -.28, -.42);
    firstPerson.add(hand);
    scene.add(firstPerson);
    const key = lights(scene);
    scene.background = new THREE.Color("#172a2d");
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -16;
    key.shadow.camera.right = key.shadow.camera.top = 16;
    key.shadow.camera.far = 38;
    key.shadow.normalBias = .04;
    const { room, updateTables, dispose } = createHallRoom();
    scene.add(room);
    let topDown = false;
    let ownId: string | undefined;
    let signature = "";
    const avatars = new Map<string, { tag: string; model: THREE.Group; target: THREE.Vector3; motion?: HallMotion }>();

    const draw = () => {
      const { clientWidth: width, clientHeight: height } = container;
      if (!width || !height) return;
      const aspect = width / height;
      overviewCamera.position.set(...(topDown ? [0, 36, .001] : aspect < .84 ? [21, 31, 12] : [7, 24, 20]) as [number, number, number]);
      overviewCamera.lookAt(0, .6, 0);
      overviewCamera.updateMatrixWorld();
      let extentX = 0;
      let extentY = 0;
      for (const x of [-12.8, 12.8]) {
        for (const z of [-5, 5]) {
          for (const y of [-.45, 2.15]) {
            const point = new THREE.Vector3(x, y, z).applyMatrix4(overviewCamera.matrixWorldInverse);
            extentX = Math.max(extentX, Math.abs(point.x));
            extentY = Math.max(extentY, Math.abs(point.y));
          }
        }
      }
      const scale = Math.max(extentX / aspect / .92, extentY / (aspect < .84 ? .64 : .68));
      const offset = scale * (aspect < .84 ? .285 : topDown ? .065 : .13);
      overviewCamera.left = -scale * aspect;
      overviewCamera.right = scale * aspect;
      overviewCamera.top = scale - offset;
      overviewCamera.bottom = -scale - offset;
      overviewCamera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      firstPerson.aspect = aspect;
      firstPerson.updateProjectionMatrix();
    };

    update.current = ({ people: current, tables: entries, selfId: me, overhead: angle, paused: blocked }) => {
      const nextSignature = JSON.stringify([current, blocked, entries.map(({ hostId, slot, playing }) => [hostId, slot, playing]), me, angle]);
      if (signature === nextSignature) return;
      signature = nextSignature;
      topDown = angle;
      ownId = me;
      walk.setEnabled(!angle, blocked);
      updateTables(new Map(entries.map(({ slot, playing }) => [slot, playing])));
      const visible = current;
      const shown = new Set(visible.map(({ id }) => id));
      for (const [id, avatar] of avatars) {
        if (shown.has(id)) continue;
        removeAvatar(avatar.model);
        avatars.delete(id);
      }
      visible.forEach(({ id, name, gender, motion }, index) => {
        const tag = `${gender}:${name}:${id === me}:${motion?.action}:${motion?.sitting}`;
        let avatar = avatars.get(id);
        if (avatar?.tag !== tag) {
          if (avatar) removeAvatar(avatar.model);
          const model = createAvatar(gender);
          model.add(nameSprite(`${name}${motion?.action === "hit" ? " · Đánh" : motion?.action === "wave" ? " · Chào!" : motion?.sitting ? " · Đang ngồi" : ""}`, id === me));
          scene.add(model);
          avatar = { model, tag, target: new THREE.Vector3() };
          avatars.set(id, avatar);
        }
        const slot = entries.find((entry) => !entry.playing && entry.hostId === id)?.slot;
        const table = slot ? tablePositions[slot - 1] : undefined;
        const [x = -11, z = 0] = waitingSpots[index % waitingSpots.length] ?? [];
        const offset = Math.floor(index / waitingSpots.length) * .46;
        avatar.motion = motion;
        avatar.target.set(motion?.x ?? (table ? table.x + (table.rotated ? 1.8 : 1.18) : x), motion?.y ?? .02,
          motion?.z ?? (table ? table.z + (table.rotated ? .65 : -.66) : z + offset));
        if (avatar.model.position.lengthSq() === 0) avatar.model.position.copy(avatar.target);
        avatar.model.rotation.y = motion ? motion.yaw + Math.PI : .31;

      });
      walk.place(me, current.find((person) => person.id === me)?.motion,
        [...avatars].filter(([id]) => id !== me).map(([, avatar]) => ({ x: avatar.target.x, z: avatar.target.z })));
      draw();
    };

    const observer = new ResizeObserver(draw);
    observer.observe(container);
    draw();
    let last = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, .05);
      last = now;
      walk.step(dt, now);
      hand.visible = !topDown;
      const punch = walk.motion.action === "hit" ? Math.max(0, Math.sin(now * .018)) : 0;
      hand.position.set(.24 - punch * .12, -.28 + punch * .12, -.42 - punch * .25);
      for (const [id, avatar] of avatars) {
        const local = id === ownId;
        avatar.model.visible = !local || topDown;
        if (local) {
          avatar.model.position.set(walk.motion.x, walk.motion.y, walk.motion.z);
          avatar.model.rotation.y = walk.motion.yaw + Math.PI;
        } else avatar.model.position.lerp(avatar.target, 1 - Math.exp(-dt * 10));
        const pose = local ? walk.motion : avatar.motion;
        avatar.model.scale.y = pose?.sitting ? .64 : 1;
        for (const child of avatar.model.children) {
          if (!(child instanceof THREE.Mesh) || Math.abs(child.position.x) < .26 || child.position.y > 1.1) continue;
          child.rotation.x = pose?.action === "hit" ? -.9 + Math.sin(now * .018) * .65 : pose?.action === "wave" ? -2 + Math.sin(now * .012) * .3 : 0;
        }
      }
      renderer.render(scene, topDown ? overviewCamera : firstPerson);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      walk.dispose();
      controls.current = null;
      update.current = null;
      observer.disconnect();
      for (const { model } of avatars.values()) removeAvatar(model);
      dispose();
      hand.geometry.dispose();
      handMaterial.dispose();
      key.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    update.current?.({ people, tables, selfId, overhead, paused, onMotion });
  }, [people, tables, selfId, overhead, paused, onMotion]);

  const press = (command: WalkCommand, down: boolean) => controls.current?.command(command, down);
  return <>
    <div className="hall-scene" ref={host} aria-label="Phòng chờ 3D, kéo để nhìn xung quanh">
      <div className="hall-scene-fallback">{tablePositions.map((_, index) => <span key={index}>{String(index + 1).padStart(2, "0")}</span>)}</div>
    </div>
    {!overhead && !paused && <div className="hall-walk-hud">
      <div className="hall-crosshair" aria-hidden="true">+</div>
      <div className="hall-glass hall-walk-help">
        <button type="button" onClick={() => void controls.current?.lock()}>{locked ? "Esc để thả chuột" : "Bấm để điều khiển chuột"}</button>
        <p>WASD: đi · Chuột: nhìn / ngước · Space: nhảy · C: ngồi · F: đánh · E: chào</p>
        <p className="hall-touch-help">Kéo trên phòng để nhìn, dùng các nút bên dưới để di chuyển.</p>
      </div>
      <div className="hall-walk-actions hall-glass" aria-label="Động tác trong sảnh">
        {([['jump', 'Nhảy'], ['sit', 'Ngồi / đứng'], ['hit', 'Đánh'], ['wave', 'Chào']] as const).map(([command, label]) =>
          <button type="button" key={command} onClick={() => press(command, true)}>{label}</button>)}
      </div>
      <div className="hall-walk-pad hall-glass" aria-label="Di chuyển">
        {([['forward', '↑', 'Đi tới'], ['left', '←', 'Sang trái'], ['back', '↓', 'Đi lùi'], ['right', '→', 'Sang phải']] as const).map(([command, label, title]) =>
          <button type="button" key={command} aria-label={title} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); press(command, true); }}
            onPointerUp={() => press(command, false)} onPointerCancel={() => press(command, false)} onLostPointerCapture={() => press(command, false)}>{label}</button>)}
      </div>
    </div>}
    {unavailable && <p className="hall-glass hall-webgl-error" role="status">Trình duyệt chưa hỗ trợ WebGL. Bạn vẫn có thể xem bàn và vào trận từ menu.</p>}
  </>;
};

export function AvatarPreview({ gender }: { gender: Gender }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const renderer = rendererFor(container);
    if (!renderer) return;
    const scene = new THREE.Scene();
    lights(scene);
    const camera = new THREE.PerspectiveCamera(35, 1, .05, 20);
    camera.position.set(.6, 1.35, 3.05);
    camera.lookAt(0, .86, 0);
    const avatar = createAvatar(gender);
    avatar.rotation.y = .09;
    scene.add(avatar);
    const metal = new THREE.MeshStandardMaterial({ color: "#354348", roughness: .4, metalness: .42 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.48, .54, .105, 64), metal);
    base.position.y = -.055;
    scene.add(base);
    const draw = () => {
      const { clientWidth: width, clientHeight: height } = container;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    draw();
    return () => {
      observer.disconnect();
      disposeGroup(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [gender]);

  return <div className="login-avatar" ref={host} aria-hidden="true" />;
}
