import { SHOT_DRAG_DEAD_ZONE, SHOT_INPUT_CONFIG } from "./constants";
import type { ShotInput, ShotInputAction } from "./type";

export const createShotInput = (): ShotInput => ({
  armed: false, pull: null, power: 0, firedPower: null,
});

export const reduceShotInput = (state: ShotInput, action: ShotInputAction): ShotInput => {
  if (action.kind === "cancel") return createShotInput();
  if (action.kind === "arm") return state.armed ? state : { ...createShotInput(), armed: true };
  if (!state.armed) return state;
  if (action.kind === "down") {
    return { ...state, pull: action, power: 0 };
  }
  if (!state.pull || state.pull.pointerId !== action.pointerId) return state;
  if (action.kind === "move") {
    const distance = Math.max(0, action.y - state.pull.y);
    const power = distance <= SHOT_DRAG_DEAD_ZONE
      ? 0 : Math.min(100, Math.round(distance / SHOT_INPUT_CONFIG.dragPixelsPerPercent));
    return { ...state, power };
  }
  return {
    armed: state.power === 0, pull: null, power: state.power,
    firedPower: state.power > 0 ? state.power : null,
  };
};
