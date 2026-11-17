import type { CameraShotResolver } from "./type";

// Wait for a settled camera frame to be displayed before allowing the shot.
export const createShotCameraTransition = () => {
  let resolvePending: CameraShotResolver | null = null;
  let settledFrame = false;
  const cancel = () => {
    resolvePending?.(false);
    resolvePending = null;
    settledFrame = false;
  };
  return {
    wait: () => {
      cancel();
      return new Promise<boolean>((resolve) => { resolvePending = resolve; });
    },
    afterRender: (cameraSettled: boolean) => {
      if (!resolvePending) return;
      if (cameraSettled && settledFrame) {
        resolvePending(true);
        resolvePending = null;
      }
      settledFrame = cameraSettled;
    },
    cancel,
  };
};
