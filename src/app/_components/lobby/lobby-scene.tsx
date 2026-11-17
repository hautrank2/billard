"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import { disposeGroup } from "../../billiard/_components/billiard-game/table-scene";
import { createAvatar } from "./avatar";
import { createHallRoom, hallLabel, tablePositions } from "./hall-room";
import type { Gender, HallPlayer, HallTable } from "./hall-types";

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

export function LobbyScene({ people, tables, selfId, overhead }: SceneInput) {
  const host = useRef<HTMLDivElement>(null);
  const update = useRef<(input: SceneInput) => void>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const renderer = rendererFor(container);
    if (!renderer) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 160);
    const key = lights(scene);
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
    let signature = "";
    const avatars = new Map<string, { tag: string; model: THREE.Group }>();

    const draw = () => {
      const { clientWidth: width, clientHeight: height } = container;
      if (!width || !height) return;
      const aspect = width / height;
      camera.position.set(...(topDown ? [0, 36, .001] : aspect < .84 ? [21, 31, 12] : [7, 24, 20]) as [number, number, number]);
      camera.lookAt(0, .6, 0);
      camera.updateMatrixWorld();
      let extentX = 0;
      let extentY = 0;
      for (const x of [-12.8, 12.8]) {
        for (const z of [-5, 5]) {
          for (const y of [-.45, 2.15]) {
            const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
            extentX = Math.max(extentX, Math.abs(point.x));
            extentY = Math.max(extentY, Math.abs(point.y));
          }
        }
      }
      const scale = Math.max(extentX / aspect / .92, extentY / (aspect < .84 ? .64 : .68));
      const offset = scale * (aspect < .84 ? .285 : topDown ? .065 : .13);
      camera.left = -scale * aspect;
      camera.right = scale * aspect;
      camera.top = scale - offset;
      camera.bottom = -scale - offset;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.render(scene, camera);
    };

    update.current = ({ people: current, tables: entries, selfId: me, overhead: angle }) => {
      const nextSignature = JSON.stringify([current, entries.map(({ hostId, slot, playing }) => [hostId, slot, playing]), me, angle]);
      if (signature === nextSignature) return;
      signature = nextSignature;
      topDown = angle;
      updateTables(new Map(entries.map(({ slot, playing }) => [slot, playing])));
      const visible = current;
      const shown = new Set(visible.map(({ id }) => id));
      for (const [id, avatar] of avatars) {
        if (shown.has(id)) continue;
        removeAvatar(avatar.model);
        avatars.delete(id);
      }
      visible.forEach(({ id, name, gender }, index) => {
        const tag = `${gender}:${name}:${id === me}`;
        let avatar = avatars.get(id);
        if (avatar?.tag !== tag) {
          if (avatar) removeAvatar(avatar.model);
          const model = createAvatar(gender);
          model.add(nameSprite(name, id === me));
          scene.add(model);
          avatar = { model, tag };
          avatars.set(id, avatar);
        }
        const slot = entries.find((entry) => !entry.playing && entry.hostId === id)?.slot;
        const table = slot ? tablePositions[slot - 1] : undefined;
        const [x, z] = waitingSpots[index % waitingSpots.length]!;
        const offset = Math.floor(index / waitingSpots.length) * .46;
        avatar.model.position.set(table ? table.x + (table.rotated ? 1.8 : 1.18) : x!, .02,
          table ? table.z + (table.rotated ? .65 : -.66) : z! + offset);
        avatar.model.rotation.y = .31 + (index % 3 - 1) * .48;
      });
      draw();
    };

    const observer = new ResizeObserver(draw);
    observer.observe(container);
    draw();

    return () => {
      update.current = null;
      observer.disconnect();
      for (const { model } of avatars.values()) removeAvatar(model);
      dispose();
      key.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    update.current?.({ people, tables, selfId, overhead });
  }, [people, tables, selfId, overhead]);

  return <div className="hall-scene" ref={host} aria-hidden="true">
    <div className="hall-scene-fallback">{tablePositions.map((_, index) => <span key={index}>{String(index + 1).padStart(2, "0")}</span>)}</div>
  </div>;
}

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
