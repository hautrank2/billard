import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { createBilliardAudio } from "./audio";
import { defaultCamera, DEFAULT_OPTIONS, HEAD_STRING, TABLE } from "./config";
import {
  AIM_CAMERA_PITCH_STEP,
  AIM_KEY_FINE_SPEED,
  AIM_KEY_FINE_TAP,
  AIM_KEY_HOLD_DELAY,
  AIM_KEY_MAX_SPEED,
  AIM_KEY_MIN_SPEED,
  AIM_KEY_RAMP_SECONDS,
  AIM_KEY_TAP,
  CUE_PLACEMENT_KEY,
  DRILL_NEXT_KEY,
  DRILL_RETRY_KEY,
  ELEVATION_DOWN_KEY,
  ELEVATION_STEP,
  ELEVATION_UP_KEY,
  JUMP_TOGGLE_KEY,
  PUSH_OUT_KEY,
  SPIN_ARROW_STEP,
  SPIN_MAX_OFFSET,
  SPIN_PER_POINTER_PIXEL,
} from "./constants";
import {
  clampElevation,
  createStroke,
  DEFAULT_LOADOUT,
  resolveCue,
  STANDARD_CUES,
  strokeCueType,
  strokeSpread,
} from "./cues";
import { DRILLS } from "./drills";
import {
  canPlaceCue,
  createDrill,
  createGame,
  placeCue,
  placeCueAtDefault,
  snapshot,
  strike,
} from "./engine";
import { replayShot } from "./match-play";
import { applyTuning, DEFAULT_TUNING, loadSavedTuning } from "./physics-tuning";
import {
  getAutoOverhead,
  getServerAutoOverhead,
  setAutoOverhead,
  subscribeAutoOverhead,
} from "./preferences";
import { aimTarget, isBreakShot, isOver, targetLabel } from "./rules";
import { createShotInput, reduceShotInput } from "./shot-input";
import type {
  AimDrag, AimTurn, AudioController, BilliardGameProps, CameraView, CueDrag, CueMode, GameOptions,
  GameState, PlacementOrigin, SceneControls, SceneHandle, ShotInputAction, Spin, Vector2,
} from "./type";

const initialControls = (view: CameraView): SceneControls => ({
  angle: 0,
  power: 0,
  cuePull: 0,
  spin: { x: 0, y: 0 },
  view,
  guide: true,
  camera: defaultCamera(view),
  navigation: { x: 0, z: 0 },
  cueMode: "glide",
  elevation: STANDARD_CUES.jump.defaultElevation,
  loadout: { ...DEFAULT_LOADOUT },
});

const placementHint = (game: GameState) => isBreakShot(game)
  ? "Bấm vùng sáng hoặc kéo bi cái để chọn vị trí."
  : "Bấm chỗ trống hoặc kéo bi cái để chọn vị trí.";

const createRackForPlay = (options: GameOptions) => {
  const game = createGame(options);
  if (!game.drill) {
    game.ballInHand = true;
    game.message = placementHint(game);
  }
  return game;
};

// Turned toward the nearest ball the next stroke may hit first.
const aimAngle = (game: GameState) => {
  const cue = game.balls.find((ball) => ball.id === 0);
  const target = aimTarget(game);
  return cue && target ? Math.atan2(target.x - cue.x, -(target.z - cue.z)) : 0;
};

// A drill starts with its own cue; a rack starts with the playing cue.
const startingCue = (game: GameState): CueMode =>
  game.drill ? DRILLS[game.drill.id].cue : "glide";

// Roughly normal noise with a standard deviation of one.
const gaussian = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;

const isEditing = (target: EventTarget | null) => target instanceof Element &&
  Boolean(target.closest("input, textarea, select, [contenteditable=true], [role=combobox], [role=option]"));

export const useBilliardGame = ({ match, loadout, onShot, onComputer, matchBusy, matchError }: BilliardGameProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [initialGame] = useState(() => match ? structuredClone(match.game) : createRackForPlay(DEFAULT_OPTIONS));
  const [controls, setControls] = useState(() => ({
    ...initialControls(initialGame.ballInHand ? "overhead" : "aim"),
    angle: aimAngle(initialGame),
    loadout: loadout ?? { ...DEFAULT_LOADOUT },
  }));
  const gameRef = useRef(initialGame);
  const matchVersion = useRef(match?.version);
  const matchState = useRef(match?.game);
  const afterReplay = useRef<GameState | null>(null);
  const submitting = useRef(false);
  const controlsRef = useRef<SceneControls>(controls);
  const sceneRef = useRef<SceneHandle | null>(null);
  const audioRef = useRef<AudioController | null>(null);
  const dragRef = useRef<AimDrag | null>(null);
  const cueDragRef = useRef<CueDrag | null>(null);
  const placementOriginRef = useRef<PlacementOrigin | null>(null);
  const inputRef = useRef(createShotInput());
  const pressedRef = useRef(new Set<string>());
  const spaceRef = useRef(false);
  const preparingShotRef = useRef(false);
  const aimTurnRef = useRef<AimTurn | null>(null);
  const [game, setGame] = useState(() => snapshot(initialGame));
  const [shotInput, setShotInput] = useState(createShotInput);
  const [draftOptions, setDraftOptions] = useState<GameOptions>({ ...DEFAULT_OPTIONS });
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [preparingShot, setPreparingShot] = useState(false);
  const [help, setHelpOpen] = useState(false);
  const [screen, setScreen] = useState<"play" | "setup">("play");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [shotPower, setShotPower] = useState(65);
  const managed = Boolean(match);
  const myTurn = !match || (!match.result && match.seat === match.turn);
  const autoOverhead = useSyncExternalStore(
    subscribeAutoOverhead,
    getAutoOverhead,
    getServerAutoOverhead,
  );

  const updateControls = (patch: Partial<SceneControls>) => {
    controlsRef.current = { ...controlsRef.current, ...patch };
    setControls(controlsRef.current);
  };
  const sync = () => setGame(snapshot(gameRef.current));
  const dispatchInput = (action: ShotInputAction) => {
    inputRef.current = reduceShotInput(inputRef.current, action);
    setShotInput(inputRef.current);
    return inputRef.current;
  };
  const cancelDrag = () => {
    dragRef.current = null;
    cueDragRef.current = null;
    dispatchInput({ kind: "cancel" });
  };

  useEffect(() => {
    // Values from an earlier tuning session apply before the first stroke.
    applyTuning(DEFAULT_TUNING);
    if (!managed) loadSavedTuning();
  }, [managed]);

  const applyEquipment = useEffectEvent(() => {
    if (loadout) updateControls({ loadout });
  });

  useEffect(() => {
    applyEquipment();
  }, [loadout]);

  const showMatchUpdate = useEffectEvent(() => {
    if (!match || match.version === matchVersion.current) return;
    const previous = matchState.current;
    const animate = ready && !gameRef.current.moving && previous && match.replay &&
      matchVersion.current === match.version - 1;
    matchState.current = match.game;
    matchVersion.current = match.version;
    cancelDrag();
    spaceRef.current = false;
    pressedRef.current.clear();
    const next = structuredClone(match.game);
    afterReplay.current = null;
    placementOriginRef.current = null;
    if (animate && previous && match.replay) {
      const replay = structuredClone(previous);
      if (replayShot(replay, match.replay)) {
        gameRef.current = replay;
        afterReplay.current = next;
        audioRef.current?.cue(match.replay.power, isBreakShot(previous));
      } else {
        gameRef.current = next;
      }
    } else {
      gameRef.current = next;
    }
    const view = gameRef.current.moving || next.ballInHand ? "overhead" : "aim";
    updateControls({
      ...initialControls(view), guide: controlsRef.current.guide,
      loadout: loadout ?? controlsRef.current.loadout, angle: aimAngle(gameRef.current),
    });
    sync();
  });

  useEffect(() => {
    showMatchUpdate();
  }, [match, ready]);

  const requestComputer = useEffectEvent(() => onComputer?.());
  const botTurn = match?.kind === "ai" && match.turn === 1 && !match.result;

  useEffect(() => {
    if (!botTurn || game.moving || matchBusy || matchError) return;
    const delay = window.setTimeout(() => requestComputer(), 800);
    return () => window.clearTimeout(delay);
  }, [botTurn, game.moving, matchBusy, matchError, match?.version]);

  useEffect(() => () => {
    if (aimTurnRef.current) cancelAnimationFrame(aimTurnRef.current.frame);
  }, []);

  useEffect(() => {
    const audio = createBilliardAudio();
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (screen !== "play") return;
    let cancelled = false;
    let activeScene: SceneHandle | null = null;
    import("./scene").then(({ createScene }) => {
      if (cancelled || !containerRef.current) return;
      activeScene = createScene(
        containerRef.current,
        () => gameRef.current,
        () => inputRef.current.pull
          ? { ...controlsRef.current, power: inputRef.current.power, cuePull: inputRef.current.power }
          : controlsRef.current,
        () => {
          if (afterReplay.current) {
            gameRef.current = afterReplay.current;
            afterReplay.current = null;
            if (!gameRef.current.ballInHand) {
              controlsRef.current = { ...controlsRef.current, view: "aim", camera: defaultCamera("aim") };
            }
          }
          const current = gameRef.current;
          const cue = current.balls.find((ball) => ball.id === 0);
          if (current.ballInHand) {
            if (cue) placementOriginRef.current = {
              point: { x: cue.x, z: cue.z }, view: controlsRef.current.view,
            };
            pressedRef.current.clear();
            controlsRef.current = { ...controlsRef.current, view: "overhead", navigation: { x: 0, z: 0 } };
          }
          if (cue && aimTarget(current) && !isOver(current)) {
            controlsRef.current = {
              ...controlsRef.current,
              camera: current.ballInHand || controlsRef.current.view === "aim"
                ? defaultCamera(controlsRef.current.view) : controlsRef.current.camera,
              angle: aimAngle(current),
            };
          }
          // The jump cue goes back in the rack once its stroke has settled.
          controlsRef.current = { ...controlsRef.current, cueMode: "glide" };
          setControls(controlsRef.current);
          setGame(snapshot(current));
        },
        (event) => audioRef.current?.play(event),
      );
      sceneRef.current = activeScene;
      setReady(true);
    }).catch(() => {
      if (!cancelled) {
        setError("Không thể mở bàn 3D. Hãy bật tăng tốc đồ họa / WebGL trong trình duyệt rồi tải lại trang.");
      }
    });
    return () => {
      cancelled = true;
      activeScene?.dispose();
      sceneRef.current = null;
    };
  }, [screen]);

  const performShot = async (power = controlsRef.current.power) => {
    if (preparingShotRef.current || !canShoot() || !Number.isFinite(power) || power <= 0) return;
    const current = controlsRef.current;
    const scene = sceneRef.current;
    const shotGame = gameRef.current;
    audioRef.current?.unlock();
    const stroke = currentStroke();
    if (match && onShot) {
      const cue = shotGame.balls.find((ball) => ball.id === 0);
      submitting.current = true;
      setPreparingShot(true);
      cancelDrag();
      try {
        await onShot({
          angle: current.angle, power, spin: current.spin, mode: current.cueMode,
          elevation: stroke.elevation, pushOut: shotGame.pushOut === "declared",
          placement: cue && shotGame.cueInHand ? { x: cue.x, z: cue.z } : undefined,
        });
      } finally {
        submitting.current = false;
        setPreparingShot(false);
      }
      return;
    }
    // Read at fire time; with the setting off the prediction is skipped too.
    const overhead = current.view === "aim" && getAutoOverhead() &&
      scene?.predictShotCamera(current.angle, power, current.spin, stroke);
    if (overhead && scene) {
      preparingShotRef.current = true;
      setPreparingShot(true);
      cancelDrag();
      pressedRef.current.clear();
      updateControls({
        power, cuePull: 0, view: "overhead", camera: defaultCamera("overhead"),
        navigation: { x: 0, z: 0 },
      });
      shotGame.message = "Đang chuyển sang góc 2 trước cú đánh…";
      sync();
      const cameraReady = await scene.waitForShotCamera();
      preparingShotRef.current = false;
      setPreparingShot(false);
      if (!cameraReady || gameRef.current !== shotGame) {
        if (gameRef.current === shotGame) {
          shotGame.message = "Đã hủy cú đánh khi chuyển góc.";
          sync();
        }
        return;
      }
    }
    // The break is the first stroke of a rack; strike counts it.
    const opening = isBreakShot(shotGame);
    // A raised cue is less accurate; the error is drawn as the stroke is played.
    const angle = current.angle + gaussian() * strokeSpread(stroke);
    if (strike(shotGame, angle, power, current.spin, stroke)) {
      if (overhead) shotGame.message = "Góc 2 theo bi: dự đoán bi ra khỏi góc ngắm.";
      audioRef.current?.cue(power, opening);
      cancelDrag();
      updateControls({
        power,
        spin: { x: 0, y: 0 },
      });
      sync();
    }
  };
  const canInteract = () => myTurn && !matchBusy && !submitting.current && match?.version === matchVersion.current;
  const canShoot = () => canInteract() && ready && !preparingShotRef.current && !error && !gameRef.current.moving &&
    !isOver(gameRef.current) && !gameRef.current.ballInHand && screen === "play" && !help;

  const setSpin = (spin: Spin) => {
    if (preparingShotRef.current || gameRef.current.moving || inputRef.current.armed) return;
    const scale = Math.max(1, Math.hypot(spin.x, spin.y) / SPIN_MAX_OFFSET);
    updateControls({ spin: { x: spin.x / scale, y: spin.y / scale } });
  };
  const updateNavigation = () => {
    const keys = pressedRef.current;
    const panWithLetters = controlsRef.current.view !== "aim";
    const pan = (arrow: string, letter: string) =>
      Number(keys.has(arrow) || (panWithLetters && keys.has(letter)));
    controlsRef.current.navigation = {
      x: pan("ArrowRight", "KeyD") - pan("ArrowLeft", "KeyA"),
      z: pan("ArrowDown", "KeyS") - pan("ArrowUp", "KeyW"),
    };
  };
  const setView = (view: CameraView) => {
    if (preparingShotRef.current) return;
    cancelDrag();
    pressedRef.current.clear();
    updateControls({ view, camera: defaultCamera(view), navigation: { x: 0, z: 0 } });
  };
  const confirmPosition = () => {
    if (!canInteract() || !gameRef.current.ballInHand) return;
    cueDragRef.current = null;
    placementOriginRef.current = null;
    gameRef.current.ballInHand = false;
    gameRef.current.message = `Bi cái đã được đặt. Ngắm ${targetLabel(gameRef.current)} trước.`;
    setView("aim");
    updateControls({ angle: aimAngle(gameRef.current) });
    containerRef.current?.focus({ preventScroll: true });
    sync();
  };
  const cancelPlacement = () => {
    if (!canInteract() || !gameRef.current.ballInHand) return;
    const origin = placementOriginRef.current;
    const cue = gameRef.current.balls.find((ball) => ball.id === 0);
    if (cue) {
      if (origin) Object.assign(cue, origin.point);
      else if (managed) placeCueAtDefault(gameRef.current);
      else Object.assign(cue, { x: 0, z: HEAD_STRING });
    }
    gameRef.current.ballInHand = false;
    gameRef.current.message = "Đã thoát đặt bi. Chọn Đặt lại bi cái để bắt đầu lại.";
    placementOriginRef.current = null;
    setView(origin?.view ?? "aim");
    updateControls({ angle: aimAngle(gameRef.current) });
    containerRef.current?.focus({ preventScroll: true });
    sync();
  };
  const beginPlacement = () => {
    const current = gameRef.current;
    if (!canInteract() || !ready || preparingShotRef.current || current.ballInHand) return;
    if (!canPlaceCue(current)) {
      if (!current.moving && !current.won) {
        current.message = "Chỉ được đặt lại bi cái sau một cú đánh lỗi.";
        sync();
      }
      return;
    }
    const cue = current.balls.find((ball) => ball.id === 0);
    if (!cue) return;
    placementOriginRef.current = {
      point: { x: cue.x, z: cue.z }, view: controlsRef.current.view,
    };
    current.ballInHand = true;
    placeCueAtDefault(current);
    current.message = placementHint(current);
    setView("overhead");
    containerRef.current?.focus({ preventScroll: true });
    sync();
  };
  const activeCue = () => resolveCue(
    controlsRef.current.loadout,
    strokeCueType(isBreakShot(gameRef.current), controlsRef.current.cueMode),
  );
  const currentStroke = () => {
    const cue = activeCue();
    return createStroke(cue, cue.type === "jump" ? controlsRef.current.elevation : 0);
  };
  const toggleJump = () => {
    if (!canShoot() || inputRef.current.armed) return;
    if (isBreakShot(gameRef.current)) {
      gameRef.current.message = "Cú phá luôn dùng gậy phá.";
      sync();
      return;
    }
    const jump = controlsRef.current.cueMode !== "jump";
    updateControls({ cueMode: jump ? "jump" : "glide" });
    gameRef.current.message = jump
      ? `Gậy nhảy: ${ELEVATION_DOWN_KEY} hạ, ${ELEVATION_UP_KEY} nâng góc cơ. Đánh mạnh sát băng có thể làm bi văng khỏi bàn.`
      : "Đã về gậy lướt.";
    sync();
  };
  const setElevation = (elevation: number) => {
    if (inputRef.current.armed || gameRef.current.moving) return;
    updateControls({ elevation: clampElevation(STANDARD_CUES.jump, elevation) });
  };
  // 9 and 10-ball: declared before the first stroke after the break.
  const togglePushOut = () => {
    const current = gameRef.current;
    if (!canShoot() || inputRef.current.armed || current.pushOut === "none") return;
    current.pushOut = current.pushOut === "declared" ? "offered" : "declared";
    current.message = current.pushOut === "declared"
      ? "Đánh an toàn: được bỏ qua bi nhỏ nhất và băng. Bi cái rơi lỗ hoặc bi văng khỏi bàn vẫn là lỗi."
      : "Đã hủy đánh an toàn.";
    sync();
  };
  // Lays a drill out again (step 0) or moves to its next position.
  const restartDrill = (step: number) => {
    const current = gameRef.current;
    if (!current.drill || current.moving || preparingShotRef.current) return;
    sceneRef.current?.cancelShotCamera();
    cancelDrag();
    spaceRef.current = false;
    pressedRef.current.clear();
    const next = createDrill(current.options, current.drill.variant + step, current.drill);
    gameRef.current = next;
    updateControls({
      angle: aimAngle(next),
      power: 0,
      cuePull: 0,
      spin: { x: 0, y: 0 },
      cueMode: startingCue(next),
      navigation: { x: 0, z: 0 },
      camera: controlsRef.current.view === "aim"
        ? defaultCamera("aim")
        : controlsRef.current.camera,
    });
    sync();
  };
  const canAimByKey = () => canShoot() && !inputRef.current.armed &&
    controlsRef.current.view === "aim";
  const turnAim = (delta: number) => {
    const angle = controlsRef.current.angle + delta;
    // Only the scene reads the angle, so a held key skips React renders.
    controlsRef.current = {
      ...controlsRef.current,
      angle: Math.atan2(Math.sin(angle), Math.cos(angle)),
    };
  };
  const aimDirection = () => {
    const keys = pressedRef.current;
    return Number(keys.has("KeyD") || keys.has("KeyX")) -
      Number(keys.has("KeyA") || keys.has("KeyZ"));
  };
  const stepAimTurn = (time: number) => {
    const turn = aimTurnRef.current;
    if (!turn) return;
    const direction = aimDirection();
    if (direction === 0 || !canAimByKey()) {
      aimTurnRef.current = null;
      setControls(controlsRef.current);
      return;
    }
    const dt = Math.min(0.05, Math.max(0, time - turn.last) / 1000);
    const held = (time - turn.start) / 1000 - AIM_KEY_HOLD_DELAY;
    turn.last = time;
    if (held > 0) {
      // A tap nudges by a hair; holding sweeps faster the longer it is held.
      const ramp = Math.min(1, held / AIM_KEY_RAMP_SECONDS) ** 2;
      const speed = turn.fine
        ? AIM_KEY_FINE_SPEED
        : AIM_KEY_MIN_SPEED + (AIM_KEY_MAX_SPEED - AIM_KEY_MIN_SPEED) * ramp;
      turnAim(direction * speed * dt);
    }
    turn.frame = requestAnimationFrame(stepAimTurn);
  };
  const startAimTurn = (fine: boolean) => {
    turnAim(aimDirection() * (fine ? AIM_KEY_FINE_TAP : AIM_KEY_TAP));
    const now = performance.now();
    if (aimTurnRef.current) {
      Object.assign(aimTurnRef.current, { start: now, fine });
      return;
    }
    aimTurnRef.current = {
      frame: requestAnimationFrame(stepAimTurn), start: now, last: now, fine,
    };
  };

  const onKeyDown = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (screen !== "play" || help || preparingShotRef.current || isEditing(event.target)) return;
    if (event.code === "Space" && event.target instanceof Element && event.target.closest("button, a")) return;
    const views: Record<string, CameraView> = {
      Digit1: "aim", Digit2: "overhead", Digit3: "spectator",
      Numpad1: "aim", Numpad2: "overhead", Numpad3: "spectator",
    };
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (aimTurnRef.current) aimTurnRef.current.fine = event.shiftKey;
    if (views[event.code]) {
      event.preventDefault();
      setView(views[event.code]);
      return;
    }
    if (event.code === `Key${CUE_PLACEMENT_KEY}`) {
      if (!inputRef.current.armed && !event.repeat) {
        event.preventDefault();
        beginPlacement();
      }
      return;
    }
    if (event.code === `Key${JUMP_TOGGLE_KEY}`) {
      if (!event.repeat) {
        event.preventDefault();
        toggleJump();
      }
      return;
    }
    if (event.code === `Key${PUSH_OUT_KEY}`) {
      if (!event.repeat && gameRef.current.pushOut !== "none") {
        event.preventDefault();
        togglePushOut();
      }
      return;
    }
    if (event.code === `Key${DRILL_RETRY_KEY}` || event.code === `Key${DRILL_NEXT_KEY}`) {
      if (!event.repeat && gameRef.current.drill && !inputRef.current.armed) {
        event.preventDefault();
        restartDrill(event.code === `Key${DRILL_NEXT_KEY}` ? 1 : 0);
      }
      return;
    }
    if ((event.code === `Key${ELEVATION_DOWN_KEY}` || event.code === `Key${ELEVATION_UP_KEY}`) &&
      controlsRef.current.cueMode === "jump") {
      event.preventDefault();
      if (!canShoot()) return;
      const step = (event.shiftKey ? ELEVATION_STEP / 4 : ELEVATION_STEP) *
        (event.code === `Key${ELEVATION_UP_KEY}` ? 1 : -1);
      setElevation(controlsRef.current.elevation + step);
      return;
    }
    if (controlsRef.current.view === "aim" &&
      ["KeyA", "KeyD", "KeyZ", "KeyX"].includes(event.code)) {
      if (!canAimByKey()) return;
      event.preventDefault();
      if (event.repeat) return;
      pressedRef.current.add(event.code);
      startAimTurn(event.shiftKey);
      return;
    }
    if (controlsRef.current.view === "aim" && (event.code === "KeyW" || event.code === "KeyS")) {
      event.preventDefault();
      const camera = controlsRef.current.camera;
      const delta = event.code === "KeyW" ? -AIM_CAMERA_PITCH_STEP : AIM_CAMERA_PITCH_STEP;
      const pitch = Math.max(0.19, Math.min(0.95, camera.pitch + delta));
      if (pitch !== camera.pitch) updateControls({ camera: { ...camera, pitch } });
      return;
    }
    if (event.code === "Backquote") {
      if (canShoot() && !inputRef.current.armed) {
        event.preventDefault();
        setSpin({ x: 0, y: 0 });
      }
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      if (canInteract() && gameRef.current.ballInHand && !event.repeat) {
        spaceRef.current = true;
        confirmPosition();
        return;
      }
      if (!canShoot() || event.repeat || spaceRef.current) return;
      spaceRef.current = true;
      audioRef.current?.unlock();
      dragRef.current = null;
      dispatchInput({ kind: "arm" });
      return;
    }
    if (["KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
      event.preventDefault();
      if (cueDragRef.current) return;
      pressedRef.current.add(event.code);
      updateNavigation();
    }
    if (event.code === "Escape") {
      if (gameRef.current.ballInHand) cancelPlacement();
      else if (inputRef.current.armed) cancelDrag();
      else setIsFullscreen(false);
    }
  });
  const onKeyUp = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (aimTurnRef.current) aimTurnRef.current.fine = event.shiftKey;
    if (event.code === "Space") {
      if (spaceRef.current) event.preventDefault();
      spaceRef.current = false;
      cancelDrag();
    }
    pressedRef.current.delete(event.code);
    updateNavigation();
  });
  const clearInput = useEffectEvent(() => {
    sceneRef.current?.cancelShotCamera();
    spaceRef.current = false;
    pressedRef.current.clear();
    updateNavigation();
    cancelDrag();
  });
  const onWheel = useEffectEvent((event: WheelEvent) => {
    if (screen !== "play" || help || preparingShotRef.current) return;
    event.preventDefault();
    if (cueDragRef.current) return;
    const camera = controlsRef.current.camera;
    updateControls({ camera: {
      ...camera,
      distance: Math.max(1.8, Math.min(7, camera.distance * Math.exp(event.deltaY * 0.001))),
    } });
  });
  useEffect(() => {
    const down = (event: globalThis.KeyboardEvent) => onKeyDown(event);
    const up = (event: globalThis.KeyboardEvent) => onKeyUp(event);
    const blur = () => clearInput();
    const visibility = () => { if (document.hidden) clearInput(); };
    const wheel = (event: WheelEvent) => onWheel(event);
    const container = containerRef.current;
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    container?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      container?.removeEventListener("wheel", wheel);
    };
  }, [screen]);

  const setAngle = (angle: number) => {
    if (!gameRef.current.moving) {
      updateControls({ angle: Math.atan2(Math.sin(angle), Math.cos(angle)) });
    }
  };
  const spinPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (gameRef.current.moving || inputRef.current.armed || (event.type === "pointermove" && event.buttons !== 1)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = SPIN_MAX_OFFSET / activeCue().maxTipOffset;
    event.currentTarget.setPointerCapture(event.pointerId);
    audioRef.current?.unlock();
    setSpin({
      x: ((event.clientX - rect.left) / rect.width * 2 - 1) * scale,
      y: (1 - (event.clientY - rect.top) / rect.height * 2) * scale,
    });
  };
  const spinKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (gameRef.current.moving || inputRef.current.armed) return;
    const spin = controlsRef.current.spin;
    if (event.key === "ArrowLeft") setSpin({ ...spin, x: spin.x - SPIN_ARROW_STEP });
    else if (event.key === "ArrowRight") setSpin({ ...spin, x: spin.x + SPIN_ARROW_STEP });
    else if (event.key === "ArrowUp") setSpin({ ...spin, y: spin.y + SPIN_ARROW_STEP });
    else if (event.key === "ArrowDown") setSpin({ ...spin, y: spin.y - SPIN_ARROW_STEP });
    else if (event.key === "Home") setSpin({ x: 0, y: 0 });
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const updatePlacement = (point: Vector2, dragging: boolean) => {
    if (!canInteract()) return;
    const current = gameRef.current;
    const valid = placeCue(current, point, { clampToBounds: dragging });
    const message = valid ? "Vị trí hợp lệ. Có thể chốt hoặc chỉnh tiếp."
      : isBreakShot(current) ? "Chọn chỗ trống trong vùng bếp được tô sáng."
        : "Chọn chỗ trống trên nỉ, cách lỗ và các bi khác.";
    if (current.message !== message) {
      current.message = message;
      sync();
    }
  };
  const moveCueDrag = (event: PointerEvent<HTMLDivElement>, drag: CueDrag) => {
    if (event.clientX === drag.clientX && event.clientY === drag.clientY) return;
    drag.clientX = event.clientX;
    drag.clientY = event.clientY;
    const point = sceneRef.current?.pointOnTable(event.clientX, event.clientY, drag.height);
    if (point) updatePlacement({ x: point.x - drag.offset.x, z: point.z - drag.offset.z }, true);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (preparingShotRef.current) return;
    if (!event.isPrimary || event.button !== 0) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    audioRef.current?.unlock();
    if (gameRef.current.ballInHand && canInteract()) {
      const scene = sceneRef.current;
      const cue = gameRef.current.balls.find((ball) => ball.id === 0);
      if (scene && cue) {
        const hitCue = scene.isCueHit(event.clientX, event.clientY);
        const height = hitCue ? TABLE.radius : 0;
        const point = scene.pointOnTable(event.clientX, event.clientY, height);
        if (!point) return;
        pressedRef.current.clear();
        updateNavigation();
        cueDragRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          height,
          offset: hitCue ? { x: point.x - cue.x, z: point.z - cue.z } : { x: 0, z: 0 },
        };
        if (!hitCue) updatePlacement(point, false);
      }
      return;
    }
    if (inputRef.current.armed && spaceRef.current && canShoot()) {
      dispatchInput({ kind: "down", x: event.clientX, y: event.clientY, pointerId: event.pointerId });
      return;
    }
    if (gameRef.current.moving && controlsRef.current.view === "aim") return;
    dragRef.current = {
      x: event.clientX, y: event.clientY, angle: controlsRef.current.angle,
      yaw: controlsRef.current.camera.yaw, pitch: controlsRef.current.camera.pitch,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const cueDrag = cueDragRef.current;
    if (cueDrag && cueDrag.pointerId === event.pointerId) {
      moveCueDrag(event, cueDrag);
      return;
    }
    if (inputRef.current.pull) {
      dispatchInput({ kind: "move", x: event.clientX, y: event.clientY, pointerId: event.pointerId });
      return;
    }
    const start = dragRef.current;
    if (event.pointerType === "mouse" && event.shiftKey && controlsRef.current.view === "aim" &&
      !inputRef.current.armed && canShoot()) {
      const { angle, spin } = controlsRef.current;
      setSpin({
        x: spin.x + event.movementX * SPIN_PER_POINTER_PIXEL,
        y: spin.y - event.movementY * SPIN_PER_POINTER_PIXEL,
      });
      if (start) Object.assign(start, { x: event.clientX, angle });
      return;
    }
    if (!start) return;
    if (controlsRef.current.view !== "aim") {
      updateControls({ camera: {
        ...controlsRef.current.camera,
        yaw: start.yaw - (event.clientX - start.x) * 0.007,
        pitch: Math.max(controlsRef.current.view === "overhead" ? 0.65 : 0.18,
          Math.min(controlsRef.current.view === "overhead" ? Math.PI / 2 - 0.01 : 1.42,
            start.pitch + (event.clientY - start.y) * 0.005)),
      } });
    } else if (!gameRef.current.moving && !gameRef.current.ballInHand) {
      setAngle(start.angle + (event.clientX - start.x) * 0.003);
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const cueDrag = cueDragRef.current;
    if (cueDrag?.pointerId === event.pointerId) {
      moveCueDrag(event, cueDrag);
      cueDragRef.current = null;
      return;
    }
    if (inputRef.current.pull) {
      dispatchInput({ kind: "move", x: event.clientX, y: event.clientY, pointerId: event.pointerId });
      const result = dispatchInput({ kind: "up", pointerId: event.pointerId });
      if (spaceRef.current && result.firedPower !== null) performShot(result.firedPower);
      return;
    }
    dragRef.current = null;
  };
  const openSetup = () => {
    if (managed || preparingShotRef.current || gameRef.current.moving) return;
    cancelDrag();
    spaceRef.current = false;
    pressedRef.current.clear();
    controlsRef.current.navigation = { x: 0, z: 0 };
    setDraftOptions({ ...gameRef.current.options });
    setReady(false);
    setScreen("setup");
  };
  const resetGame = (options: GameOptions) => {
    if (preparingShotRef.current || gameRef.current.moving) return;
    cancelDrag();
    spaceRef.current = false;
    pressedRef.current.clear();
    const next = createRackForPlay(options);
    gameRef.current = next;
    updateControls({
      ...initialControls(next.ballInHand ? "overhead" : "aim"),
      loadout: loadout ?? { ...DEFAULT_LOADOUT },
      angle: aimAngle(next),
      cueMode: startingCue(next),
    });
    placementOriginRef.current = null;
    if (!next.drill) audioRef.current?.rack();
    sync();
  };
  const radians = Math.atan2(controls.spin.x, controls.spin.y);
  const clock = Math.round((radians / (Math.PI * 2) * 12 + 12) % 12) || 12;
  const spinLabel = Math.hypot(controls.spin.x, controls.spin.y) < 0.08 ? "Tâm bi" : `${clock} giờ`;

  return {
    containerRef, game, controls, error, ready, preparingShot, help, screen, isFullscreen,
    setHelp: (open: boolean) => {
      if (open) {
        sceneRef.current?.cancelShotCamera();
        cancelDrag();
        spaceRef.current = false;
        pressedRef.current.clear();
        updateNavigation();
      }
      setHelpOpen(open);
    },
    openSetup,
    resetBalls: () => {
      if (gameRef.current.drill) restartDrill(0);
      else resetGame(gameRef.current.options);
    },
    cancelSetup: () => setScreen("play"),
    toggleFullscreen: () => setIsFullscreen(!isFullscreen),
    setView, spinLabel, spinPointer, spinKey,
    myTurn, shotPower, setShotPower, fire: () => performShot(shotPower),
    onPointerDown, onPointerMove, onPointerUp, cancelDrag,
    confirmPosition, cancelPlacement, beginPlacement,
    shotInput, draftOptions, setDraftOptions,
    applyOptions: () => {
      resetGame(draftOptions);
      setError("");
      setScreen("play");
    },
    resetCamera: () => {
      if (!preparingShotRef.current) updateControls({ camera: defaultCamera(controlsRef.current.view) });
    },
    toggleGuide: () => updateControls({ guide: !controls.guide }),
    tuning,
    toggleTuning: () => setTuning(!tuning),
    closeTuning: () => setTuning(false),
    cueMode: controls.cueMode,
    elevation: controls.elevation,
    activeCue: resolveCue(controls.loadout, strokeCueType(game.breaking, controls.cueMode)),
    toggleJump,
    setElevation,
    togglePushOut,
    retryDrill: () => restartDrill(0),
    nextDrill: () => restartDrill(1),
    autoOverhead,
    toggleAutoOverhead: () => setAutoOverhead(!getAutoOverhead()),
    muted,
    toggleSound: () => {
      audioRef.current?.setMuted(!muted);
      setMuted(!muted);
    },
  };
};
