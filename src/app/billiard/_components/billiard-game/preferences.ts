// Per-viewer conveniences kept in browser storage. Storage may be missing
// or blocked, so every read and write falls back to the default.
// v2: the automatic switch became opt-in, so an older "on" is not kept.
const AUTO_OVERHEAD_KEY = "billiard-auto-overhead-v2";
const AUTO_OVERHEAD_DEFAULT = false;

const listeners = new Set<() => void>();
let autoOverhead: boolean | null = null;

const readStoredAutoOverhead = () => {
  try {
    const stored = window.localStorage.getItem(AUTO_OVERHEAD_KEY);
    return stored === null ? AUTO_OVERHEAD_DEFAULT : stored === "on";
  } catch {
    return AUTO_OVERHEAD_DEFAULT;
  }
};

// Whether a shot from the aim view switches to view 2 when the prediction
// says a ball will leave the frame.
export const getAutoOverhead = () => {
  autoOverhead ??= readStoredAutoOverhead();
  return autoOverhead;
};

// The server render cannot read storage, so it starts from the default.
export const getServerAutoOverhead = () => AUTO_OVERHEAD_DEFAULT;

export const setAutoOverhead = (enabled: boolean) => {
  autoOverhead = enabled;
  try {
    window.localStorage.setItem(AUTO_OVERHEAD_KEY, enabled ? "on" : "off");
  } catch {
    // The choice still holds for this visit.
  }
  listeners.forEach((listener) => listener());
};

export const subscribeAutoOverhead = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const TUTORIAL_KEY = "rollnine-game-tutorial-v1";
let tutorialSeenThisVisit = false;

export const hasSeenGameTutorial = () => {
  if (tutorialSeenThisVisit) return true;
  try { return window.localStorage.getItem(TUTORIAL_KEY) === "seen"; }
  catch { return false; }
};

export const completeGameTutorial = () => {
  tutorialSeenThisVisit = true;
  try { window.localStorage.setItem(TUTORIAL_KEY, "seen"); }
  catch { /* Dismissing the tutorial still lasts for this visit. */ }
};
