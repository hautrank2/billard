import * as THREE from "three";

import { AVATAR_SCALE, HALL_BOUNDS, hallSurfaceHeight, nearestHallSeat, isHallWalkable, moveHallPosition } from "./hall-layout";
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
  let dragDistance = 0;
  let pointerType = "mouse";
  const turn = (dx: number, dy: number) => {
    motion.yaw = THREE.MathUtils.euclideanModulo(motion.yaw - dx * .003 + Math.PI, Math.PI * 2) - Math.PI;
    motion.pitch = THREE.MathUtils.clamp(motion.pitch - dy * .003, -1.35, 1.35);
  };
  const command = (action: WalkCommand, pressed = true) => {
    if (!enabled || paused) return;
    if (["forward", "back", "left", "right"].includes(action)) {
      if (pressed) keys.add(action); else keys.delete(action);
    } else if (pressed) {
      if (action === "jump" && !motion.sitting && Math.abs(motion.y - hallSurfaceHeight(motion.x, motion.z)) < .02) velocity = 4.1;
      if (action === "sit") {
        if (motion.sitting) { motion.sitting = false; keys.clear(); }
        else {
          const seat = nearestHallSeat(motion.x, motion.z);
          if (seat && Math.abs(motion.y - hallSurfaceHeight(motion.x, motion.z)) < .02 &&
            obstacles.every((other) => Math.hypot(other.x - seat.x, other.z - seat.z) > .5)) {
            Object.assign(motion, { x: seat.x, z: seat.z, y: seat.height, yaw: seat.yaw, sitting: true });
            velocity = 0; keys.clear();
          }
        }
      }
      if (action === "hit" || action === "wave") { motion.action = action; actionUntil = performance.now() + (action === "hit" ? 650 : 1100); }
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
  const endDrag = (event: PointerEvent) => {
    if (dragging && dragDistance < 6 && pointerType === "mouse" && event.button === 0) command("hit");
    dragging = false;
  };
  const cancelDrag = () => { dragging = false; };
  const lockchange = () => { reset(); onLock(document.pointerLockElement === canvas); };
  const mousemove = (event: MouseEvent) => {
    if (enabled && !paused && document.pointerLockElement === canvas) turn(event.movementX, event.movementY);
  };
  const pointerdown = (event: PointerEvent) => {
    if (!enabled || paused || event.button !== 0) return;
    if (document.pointerLockElement === canvas) { command("hit"); return; }
    dragDistance = 0; pointerType = event.pointerType;
    dragging = true; lastX = event.clientX; lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  };
  const pointermove = (event: PointerEvent) => {
    if (!dragging || document.pointerLockElement === canvas) return;
    dragDistance += Math.hypot(event.clientX - lastX, event.clientY - lastY);
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
  canvas.addEventListener("pointercancel", cancelDrag);

  return {
    motion, command,
    place: (id: string | undefined, saved: HallMotion | undefined, others: { x: number; z: number }[]) => {
      obstacles = others;
      if (!id || identity === id) return;
      identity = id;
      if (saved && isHallWalkable(saved.x, saved.z, saved.y) && others.every((other) => Math.hypot(other.x - saved.x, other.z - saved.z) > .8)) {
        const seat = nearestHallSeat(saved.x, saved.z);
        const sitting = saved.sitting && Boolean(seat && Math.hypot(seat.x - saved.x, seat.z - saved.z) < .05);
        Object.assign(motion, saved, { y: hallSurfaceHeight(saved.x, saved.z), sitting, action: "idle" }); return;
      }
      const spots = [-15, -9.15, -2.4, 4.2, 9.9, 13.2];
      const offset = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % spots.length;
      const x = spots.map((_, index) => spots[(index + offset) % spots.length] ?? -10)
        .find((value) => others.every((other) => Math.hypot(other.x - value, other.z) > .9));
      motion.x = x ?? -17.5;
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
          (-Math.cos(motion.yaw) * forward - Math.sin(motion.yaw) * side) * speed, motion.y);
        if (obstacles.every((other) => Math.hypot(next.x - other.x, next.z - other.z) >= .58 ||
          Math.hypot(next.x - other.x, next.z - other.z) > Math.hypot(motion.x - other.x, motion.z - other.z))) Object.assign(motion, next);
      }
      if (!motion.sitting) {
        velocity -= 11 * dt;
        const surface = hallSurfaceHeight(motion.x, motion.z);
        const nextY = motion.y + velocity * dt;
        // Also recover old positions already below a support surface.
        if (velocity <= 0 && nextY <= surface) {
          motion.y = surface; velocity = 0;
        } else motion.y = Math.max(0, nextY);
        if (motion.y === 0) velocity = 0;
      }
      if (now > actionUntil) motion.action = "idle";
      // Orbit behind the shoulders, shortening the boom before walls or ceiling.
      // View seated players from the room so the wall behind a sofa cannot
      // squeeze the camera into the character's head.
      camera.rotation.set(motion.sitting ? -.16 : motion.pitch - .12, motion.yaw + (motion.sitting ? Math.PI : 0), 0, "YXZ");
      const target = new THREE.Vector3(motion.x, (motion.sitting ? .68 : 1.25) * AVATAR_SCALE + motion.y, motion.z);
      const boom = new THREE.Vector3(0, 0, 2.35).applyEuler(camera.rotation);
      const fitBoom = (offset: THREE.Vector3) => {
        let fraction = 1;
        for (const [axis, low, high] of [["x", -HALL_BOUNDS.x, HALL_BOUNDS.x], ["y", .25, 3.35], ["z", -HALL_BOUNDS.z, HALL_BOUNDS.z]] as const) {
          if (offset[axis] > 0) fraction = Math.min(fraction, (high - target[axis]) / offset[axis]);
          else if (offset[axis] < 0) fraction = Math.min(fraction, (low - target[axis]) / offset[axis]);
        }
        return fraction;
      };
      let fraction = fitBoom(boom);
      if (fraction < .6) {
        const opposite = new THREE.Vector3(-boom.x, boom.y, -boom.z);
        const available = fitBoom(opposite);
        if (available > fraction) {
          boom.copy(opposite); fraction = available; camera.rotation.y += Math.PI;
        }
      }
      camera.position.copy(target).addScaledVector(boom, Math.max(.05, fraction));
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
      canvas.removeEventListener("pointerup", endDrag); canvas.removeEventListener("pointercancel", cancelDrag);
    },
  };
};
