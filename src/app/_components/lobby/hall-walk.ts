import * as THREE from "three";

import { isHallWalkable, moveHallPosition } from "./hall-layout";
import type { HallMotion } from "./hall-types";

export type WalkCommand = "forward" | "back" | "left" | "right" | "jump" | "sit" | "hit" | "wave";

export const createHallWalk = (canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera,
  publish: (motion: HallMotion) => void, onLock: (locked: boolean) => void) => {
  const motion: HallMotion = { x: -10, z: 0, y: 0, yaw: -Math.PI / 2, pitch: 0, sitting: false, action: "idle" };
  let identity: string | undefined;
  let obstacles: { x: number; z: number }[] = [];
  const keys = new Set<string>();
  let enabled = true;
  let paused = false;
  let velocity = 0;
  let actionUntil = 0;
  let sentAt = -Infinity;
  let signature = "";
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const turn = (dx: number, dy: number) => {
    motion.yaw = THREE.MathUtils.euclideanModulo(motion.yaw - dx * .003 + Math.PI, Math.PI * 2) - Math.PI;
    motion.pitch = THREE.MathUtils.clamp(motion.pitch - dy * .003, -1.35, 1.35);
  };
  const command = (action: WalkCommand, pressed = true) => {
    if (!enabled || paused) return;
    if (["forward", "back", "left", "right"].includes(action)) {
      if (pressed) keys.add(action); else keys.delete(action);
    } else if (pressed) {
      if (action === "jump" && !motion.sitting && motion.y === 0) velocity = 4.5;
      if (action === "sit" && motion.y === 0) { motion.sitting = !motion.sitting; keys.clear(); }
      if (action === "hit" || action === "wave") { motion.action = action; actionUntil = performance.now() + 1100; }
    }
  };
  const mapping: Record<string, WalkCommand> = {
    KeyW: "forward", ArrowUp: "forward", KeyS: "back", ArrowDown: "back", KeyA: "left", KeyD: "right",
    Space: "jump", KeyC: "sit", KeyF: "hit", KeyE: "wave",
  };
  const typing = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable=true], [role=dialog]"));
  const keydown = (event: KeyboardEvent) => {
    if (!enabled || paused || typing(event.target)) return;
    if (event.code === "Space" && event.target instanceof HTMLElement && event.target.closest("button, a")) return;
    const action = mapping[event.code];
    if (action) { event.preventDefault(); if (!event.repeat) command(action); }
    if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      event.preventDefault(); keys.add(event.code);
    }
  };
  const keyup = (event: KeyboardEvent) => { keys.delete(mapping[event.code] ?? event.code); };
  const reset = () => { keys.clear(); dragging = false; };
  const endDrag = () => { dragging = false; };
  const lockchange = () => { reset(); onLock(document.pointerLockElement === canvas); };
  const mousemove = (event: MouseEvent) => {
    if (enabled && !paused && document.pointerLockElement === canvas) turn(event.movementX, event.movementY);
  };
  const pointerdown = (event: PointerEvent) => {
    if (!enabled || paused) return;
    if (document.pointerLockElement === canvas) { command("hit"); return; }
    dragging = true; lastX = event.clientX; lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  };
  const pointermove = (event: PointerEvent) => {
    if (!dragging || document.pointerLockElement === canvas) return;
    turn(event.clientX - lastX, event.clientY - lastY); lastX = event.clientX; lastY = event.clientY;
  };
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", reset);
  document.addEventListener("pointerlockchange", lockchange);
  document.addEventListener("mousemove", mousemove);
  canvas.addEventListener("pointerdown", pointerdown);
  canvas.addEventListener("pointermove", pointermove);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  return {
    motion, command,
    place: (id: string | undefined, saved: HallMotion | undefined, others: { x: number; z: number }[]) => {
      obstacles = others;
      if (!id || identity === id) return;
      identity = id;
      if (saved && isHallWalkable(saved.x, saved.z) && others.every((other) => Math.hypot(other.x - saved.x, other.z - saved.z) > .8)) {
        Object.assign(motion, saved, { y: 0, action: "idle" }); return;
      }
      const spots = [-10, -6.1, -1.6, 2.8, 6.6, 8.8];
      const offset = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % spots.length;
      const x = spots.map((_, index) => spots[(index + offset) % spots.length] ?? -10)
        .find((value) => others.every((other) => Math.hypot(other.x - value, other.z) > .9));
      motion.x = x ?? -11.7;
      motion.yaw = motion.x > 0 ? Math.PI / 2 : -Math.PI / 2;
    },
    lock: async () => {
      if (enabled && !paused && canvas.requestPointerLock) {
        try { await canvas.requestPointerLock(); } catch { onLock(false); }
      }
    },
    setEnabled: (value: boolean, blocked: boolean) => {
      enabled = value; paused = blocked;
      if (!enabled || paused) { reset(); if (document.pointerLockElement === canvas) document.exitPointerLock(); }
    },
    step: (elapsed: number, now: number) => {
      const dt = Math.min(elapsed, .05);
      if (enabled && !paused) {
        if (keys.has("ArrowLeft")) turn(-dt * 600, 0);
        if (keys.has("ArrowRight")) turn(dt * 600, 0);
        const forward = Number(keys.has("forward")) - Number(keys.has("back"));
        const side = Number(keys.has("right")) - Number(keys.has("left"));
        const speed = (motion.sitting ? 0 : 2.7) * dt / Math.max(1, Math.hypot(forward, side));
        const next = moveHallPosition(motion.x, motion.z,
          (-Math.sin(motion.yaw) * forward + Math.cos(motion.yaw) * side) * speed,
          (-Math.cos(motion.yaw) * forward - Math.sin(motion.yaw) * side) * speed);
        if (obstacles.every((other) => Math.hypot(next.x - other.x, next.z - other.z) >= .58 ||
          Math.hypot(next.x - other.x, next.z - other.z) > Math.hypot(motion.x - other.x, motion.z - other.z))) Object.assign(motion, next);
      }
      velocity -= 12 * dt;
      motion.y = Math.max(0, motion.y + velocity * dt);
      if (motion.y === 0) velocity = 0;
      if (now > actionUntil) motion.action = "idle";
      camera.position.set(motion.x, (motion.sitting ? .93 : 1.57) + motion.y, motion.z);
      camera.rotation.set(motion.pitch, motion.yaw, 0, "YXZ");
      const nextSignature = JSON.stringify(motion);
      if ((nextSignature !== signature || now - sentAt > 3000) && now - sentAt > 250) {
        signature = nextSignature; sentAt = now; publish({ ...motion });
      }
    },
    dispose: () => {
      reset();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", reset);
      document.removeEventListener("pointerlockchange", lockchange); document.removeEventListener("mousemove", mousemove);
      canvas.removeEventListener("pointerdown", pointerdown); canvas.removeEventListener("pointermove", pointermove);
      canvas.removeEventListener("pointerup", endDrag); canvas.removeEventListener("pointercancel", endDrag);
    },
  };
};
