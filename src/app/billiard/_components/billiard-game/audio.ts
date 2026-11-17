import { TABLE } from "./config";
import type {
  AudioBus,
  AudioController,
  ClipName,
  ImpactVoice,
  PhysicsEvent,
  RollingVoice,
  SampleClip,
  SampleFile,
  VoicePlayback,
} from "./type";

const SAMPLE_ROOT = "/sounds/billiard/";

// Cuts from the recordings in public/sounds/billiard, located by onset and
// spectrum analysis. The cue tip is a low "tock" with most energy under
// 600 Hz; a ball contact is a bright clack peaking at 2–3.5 kHz that
// follows it by 0.1–0.35 s, sooner on harder strokes.
// - hit: soft stroke, then the cue ball meeting an object ball, then a knock.
// - hit_strong, hit_strong_2: hard stroke, hard contact, later light knocks.
// - break: hard stroke, the rack scattering, the rails, two late knocks.
// - hole: a ball dropping into a pocket. setup: racking, ending in a thump.
const CLIPS: Record<ClipName, SampleClip[]> = {
  cueSoft: [{ file: "hit", start: 0.025, end: 0.2 }],
  cueStrong: [
    { file: "hit_strong", start: 0.075, end: 0.252 },
    { file: "hit_strong_2", start: 0.245, end: 0.425 },
    { file: "break", start: 0.393, end: 0.476 },
  ],
  clackLight: [
    { file: "hit_strong", start: 1.095, end: 1.18 },
    { file: "hit_strong", start: 1.415, end: 1.49 },
    { file: "break", start: 1.495, end: 1.6 },
  ],
  clackSoft: [
    { file: "hit", start: 0.355, end: 0.53 },
    { file: "hit", start: 0.535, end: 0.66 },
    { file: "break", start: 1.145, end: 1.24 },
  ],
  clackStrong: [
    { file: "hit_strong", start: 0.255, end: 0.47 },
    { file: "hit_strong_2", start: 0.425, end: 0.65 },
  ],
  rackBurst: [{ file: "break", start: 0.476, end: 0.86 }],
  pocket: [{ file: "hole", start: 0.165, end: 0.55 }],
  rack: [{ file: "setup", start: 0.04, end: 1.36 }],
};

// Ball contacts at or above these speeds (m/s) use the harder recordings.
const SOFT_CLACK_SPEED = 0.6;
const STRONG_CLACK_SPEED = 2.4;
const STRONG_STROKE_POWER = 55;
// The break's first contact plays the recorded rack instead of single
// clacks, which that recording already contains for a moment.
const BREAK_BURST_SPEED = 2;
const BREAK_WINDOW = 1.5;
const BREAK_BURST_COVER = 0.3;
// A rack sound asked for before the files decoded is dropped if late.
const RACK_DEADLINE_MS = 700;
const MAX_CLIP_RUN = 40;
// Every clip is scaled to this RMS over its loudest 50 ms (-14 dBFS),
// unless that would push its peak past CLIP_PEAK.
const CLIP_LOUDNESS = 0.2;
const CLIP_PEAK = 0.95;

// Three recordings were clipped flat at full scale, which turns each clack
// into a buzz. A flat run is redrawn from the cubic through the two samples
// on either side of it, never below the clipped level.
export const declip = (data: Float32Array) => {
  let peak = 0;
  for (const value of data) peak = Math.max(peak, Math.abs(value));
  const out = Float32Array.from(data);
  if (peak < 0.99) return out;
  const limit = peak * 0.98;
  for (let i = 2; i < data.length - 2; i += 1) {
    if (Math.abs(data[i]) < limit) continue;
    const sign = Math.sign(data[i]);
    let end = i;
    while (
      end + 1 < data.length - 2 &&
      Math.abs(data[end + 1]) >= limit &&
      Math.sign(data[end + 1]) === sign
    ) {
      end += 1;
    }
    if (end - i < MAX_CLIP_RUN) {
      const xs = [i - 2, i - 1, end + 1, end + 2];
      for (let k = i; k <= end; k += 1) {
        let estimate = 0;
        xs.forEach((x, a) => {
          let weight = 1;
          xs.forEach((other, b) => {
            if (b !== a) weight *= (k - other) / (x - other);
          });
          estimate += weight * data[x];
        });
        const magnitude = Math.max(Math.abs(data[k]), sign * estimate);
        out[k] = sign * Math.min(4 * peak, magnitude);
      }
    }
    i = end;
  }
  return out;
};

// Loudness of the loudest 50 ms, as an RMS amplitude.
const loudestWindow = (source: Float32Array, start: number, length: number, rate: number) => {
  const window = Math.max(1, Math.min(length, Math.round(0.05 * rate)));
  const hop = Math.max(1, Math.round(0.005 * rate));
  let loudest = 0;
  for (let from = 0; from + window <= length; from += hop) {
    let sum = 0;
    for (let i = from; i < from + window; i += 1) sum += (source[start + i] ?? 0) ** 2;
    loudest = Math.max(loudest, sum / window);
  }
  return Math.sqrt(loudest);
};

// One clip with short fades so a cut never clicks. Clips are matched on
// loudness rather than peak: the recordings range from a dry knock to a
// clack ringing for 100 ms, which at one peak level sounds 12 dB louder.
export const cutClip = (
  context: BaseAudioContext,
  source: Float32Array,
  rate: number,
  clip: SampleClip,
) => {
  const start = Math.max(0, Math.round(clip.start * rate));
  const end = Math.min(source.length, Math.round(clip.end * rate));
  const length = Math.max(1, end - start);
  const buffer = context.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    peak = Math.max(peak, Math.abs(source[start + i] ?? 0));
  }
  const loudness = loudestWindow(source, start, length, rate);
  const scale = peak > 0 && loudness > 0
    ? Math.min(CLIP_PEAK / peak, CLIP_LOUDNESS / loudness)
    : 0;
  const fadeIn = Math.max(1, Math.round(0.002 * rate));
  const fadeOut = Math.max(1, Math.round(Math.min(0.04, 0.3 * length / rate) * rate));
  for (let i = 0; i < length; i += 1) {
    const edge = Math.min(1, i / fadeIn, (length - 1 - i) / fadeOut);
    data[i] = (source[start + i] ?? 0) * scale * edge;
  }
  return buffer;
};

const pickOne = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

// Synthesized stand-ins play the cushions, which have no recording, and
// cover the others until the files decode or if they fail to load.
// Impacts are modal syntheses: a sub-millisecond contact transient that
// rings a few inharmonic, fast-decaying resonances.
const VOICES = {
  // Phenolic resin against phenolic resin: the bright, dry "clack".
  ball: {
    modes: [
      { frequency: 2240, decay: 0.012, gain: 0.35 },
      { frequency: 3420, decay: 0.018, gain: 0.9 },
      { frequency: 4910, decay: 0.011, gain: 0.55 },
      { frequency: 6780, decay: 0.007, gain: 0.32 },
      { frequency: 9240, decay: 0.004, gain: 0.18 },
    ],
    attack: 0.00015,
    click: 0.85,
    clickDecay: 0.0012,
    clickTone: 0.65,
    detune: 0.05,
    duration: 0.11,
  },
  // Leather tip on the cue ball: shorter and woodier than a ball contact.
  cue: {
    modes: [
      { frequency: 740, decay: 0.014, gain: 0.4 },
      { frequency: 1620, decay: 0.01, gain: 0.8 },
      { frequency: 2710, decay: 0.006, gain: 0.45 },
      { frequency: 4180, decay: 0.0035, gain: 0.22 },
    ],
    attack: 0.0004,
    click: 0.6,
    clickDecay: 0.0016,
    clickTone: 0.35,
    detune: 0.04,
    duration: 0.08,
  },
  // Rubber cushion backed by a wooden rail: a dull, low thump.
  rail: {
    modes: [
      { frequency: 122, decay: 0.05, gain: 0.85 },
      { frequency: 214, decay: 0.036, gain: 0.6 },
      { frequency: 630, decay: 0.017, gain: 0.24 },
      { frequency: 1480, decay: 0.006, gain: 0.12 },
    ],
    attack: 0.0016,
    click: 0.32,
    clickDecay: 0.003,
    clickTone: 0.12,
    detune: 0.06,
    duration: 0.24,
  },
  // Ball striking the pocket liner, then the drop into the pocket.
  pocket: {
    modes: [
      { frequency: 168, decay: 0.07, gain: 0.8 },
      { frequency: 342, decay: 0.045, gain: 0.5 },
      { frequency: 910, decay: 0.02, gain: 0.22 },
    ],
    attack: 0.001,
    click: 0.4,
    clickDecay: 0.0025,
    clickTone: 0.18,
    detune: 0.08,
    duration: 0.32,
  },
} satisfies Record<string, ImpactVoice>;

type VoiceName = keyof typeof VOICES;

const VARIANTS = 6;
const MAX_VOICES = 36;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const synthesize = (context: BaseAudioContext, voice: ImpactVoice) => {
  const rate = context.sampleRate;
  const length = Math.ceil(voice.duration * rate);
  const buffer = context.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const modes = voice.modes.map((mode) => ({
    step: 2 * Math.PI * mode.frequency *
      (1 + (Math.random() - 0.5) * voice.detune) / rate,
    phase: Math.random() * Math.PI * 2,
    envelope: mode.gain,
    fade: Math.exp(-1 / (mode.decay * rate)),
  }));
  const clickFade = Math.exp(-1 / (voice.clickDecay * rate));
  let click = voice.click;
  let noise = 0;
  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    let sample = 0;
    for (const mode of modes) {
      sample += mode.envelope * Math.sin(mode.phase + mode.step * i);
      mode.envelope *= mode.fade;
    }
    // One-pole low-passed noise is the contact transient itself.
    noise += (Math.random() * 2 - 1 - noise) * voice.clickTone;
    sample += click * noise;
    click *= clickFade;
    sample *= Math.min(1, i / (voice.attack * rate));
    data[i] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  if (peak > 0) {
    for (let i = 0; i < length; i += 1) data[i] *= 0.9 / peak;
  }
  return buffer;
};

// A short, dark room response so impacts sit in a space instead of in the
// listener's head; billiard halls are small and soft-furnished.
const roomResponse = (context: BaseAudioContext) => {
  const rate = context.sampleRate;
  const length = Math.ceil(0.55 * rate);
  const buffer = context.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let tone = 0;
    for (let i = 0; i < length; i += 1) {
      const time = i / rate;
      tone += (Math.random() * 2 - 1 - tone) * 0.35;
      data[i] = time < 0.006 ? 0 : tone * Math.exp(-time / 0.11);
    }
  }
  return buffer;
};

// Brown noise for the low rumble of balls rolling across the cloth.
const rollingNoise = (context: BaseAudioContext) => {
  const rate = context.sampleRate;
  const length = Math.ceil(2 * rate);
  const buffer = context.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let level = 0;
  for (let i = 0; i < length; i += 1) {
    level = (level + (Math.random() * 2 - 1) * 0.02) * 0.995;
    data[i] = level * 4;
  }
  return buffer;
};

// Decodes every recording once, repairs clipping, and cuts the clips. A
// file that fails to load leaves its clips to the synthesized stand-ins.
const loadClips = async (context: AudioContext) => {
  const clips = new Map<ClipName, AudioBuffer[]>();
  if (typeof fetch !== "function" || typeof context.decodeAudioData !== "function") {
    return clips;
  }
  const files = [...new Set(Object.values(CLIPS).flat().map((clip) => clip.file))];
  const decoded = new Map<SampleFile, { data: Float32Array; rate: number }>();
  await Promise.allSettled(files.map(async (file) => {
    const response = await fetch(`${SAMPLE_ROOT}${file}.mp3`);
    if (!response.ok) return;
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    decoded.set(file, { data: declip(buffer.getChannelData(0)), rate: buffer.sampleRate });
  }));
  for (const name of Object.keys(CLIPS) as ClipName[]) {
    const cuts = CLIPS[name].flatMap((clip) => {
      const source = decoded.get(clip.file);
      return source ? [cutClip(context, source.data, source.rate, clip)] : [];
    });
    if (cuts.length > 0) clips.set(name, cuts);
  }
  return clips;
};

// One context per mounted game; it is created only by a user gesture.
export const createBilliardAudio = (): AudioController => {
  let context: AudioContext | null = null;
  let bus: AudioBus | null = null;
  let rolling: RollingVoice | null = null;
  let loading: Promise<void> | null = null;
  let muted = false;
  let breakUntil = 0;
  let burstUntil = 0;
  const lastImpact: Partial<Record<PhysicsEvent["kind"], number>> = {};
  const banks = new Map<VoiceName, AudioBuffer[]>();
  const clips = new Map<ClipName, AudioBuffer[]>();
  const sources = new Set<AudioScheduledSourceNode>();

  const stop = () => {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
      source.disconnect();
    }
    sources.clear();
    rolling = null;
  };

  const output = (active: AudioContext) => {
    if (bus) return bus;
    const compressor = active.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.12;
    compressor.connect(active.destination);
    const room = active.createConvolver();
    room.buffer = roomResponse(active);
    const wet = active.createGain();
    wet.gain.value = 0.16;
    room.connect(wet).connect(compressor);
    bus = { dry: compressor, wet: room };
    return bus;
  };

  // Synthesis and decoding take a moment, so both start on the first
  // gesture rather than on the first collision in the middle of a shot.
  const prepare = (active: AudioContext) => {
    output(active);
    for (const name of Object.keys(VOICES) as VoiceName[]) {
      if (!banks.has(name)) {
        banks.set(name, Array.from({ length: VARIANTS }, () => synthesize(active, VOICES[name])));
      }
    }
    loading ??= loadClips(active)
      .then((loaded) => {
        // A game disposed while decoding keeps nothing.
        if (context !== active) return;
        loaded.forEach((buffers, name) => clips.set(name, buffers));
      })
      .catch(() => {
        // The synthesized stand-ins keep playing.
      });
  };

  const unlock = () => {
    if (muted || document.hidden) return;
    try {
      context ??= new AudioContext();
      prepare(context);
      if (context.state === "suspended") void context.resume().catch(() => {});
    } catch {
      // Sound is optional when the browser or device has no audio output.
    }
  };

  const audible = (active: AudioContext | null): active is AudioContext =>
    !muted && !document.hidden && active?.state === "running";

  const track = (source: AudioScheduledSourceNode, nodes: AudioNode[]) => {
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
      nodes.forEach((node) => node.disconnect());
    };
  };

  const playBuffer = (buffer: AudioBuffer, options: VoicePlayback) => {
    if (!context || sources.size > MAX_VOICES) return;
    const { dry, wet } = output(context);
    const start = context.currentTime + (options.delay ?? 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = (options.rate ?? 1) * (0.97 + Math.random() * 0.06);
    // Softer impacts last longer at the contact, which removes the highs.
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = options.brightness;
    filter.Q.value = 0.5;
    const level = context.createGain();
    level.gain.value = options.gain;
    const stereo = context.createStereoPanner();
    stereo.pan.value = clamp(options.pan, -0.8, 0.8);
    source.connect(filter).connect(level).connect(stereo);
    stereo.connect(dry);
    stereo.connect(wet);
    track(source, [filter, level, stereo]);
    source.start(start);
  };

  const playVoice = (name: VoiceName, options: VoicePlayback) => {
    const bank = banks.get(name);
    if (bank) playBuffer(pickOne(bank), options);
  };

  // A recording when its clips have decoded, otherwise the stand-in.
  const playSound = (name: ClipName, fallback: VoiceName | null, options: VoicePlayback) => {
    const recorded = clips.get(name);
    if (recorded) playBuffer(pickOne(recorded), options);
    else if (fallback) playVoice(fallback, options);
  };

  const roll = (event: PhysicsEvent) => {
    if (!context) return;
    const now = context.currentTime;
    const target = event.speed > 0.02
      ? Math.min(0.09, 0.022 * event.speed ** 1.1)
      : 0;
    if (!rolling) {
      if (target === 0) return;
      const source = context.createBufferSource();
      source.buffer = rollingNoise(context);
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 320;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(output(context).dry);
      track(source, [filter, gain]);
      source.start(now);
      rolling = { source, gain };
    }
    rolling.gain.gain.setTargetAtTime(target, now, 0.08);
    if (target === 0) {
      rolling.source.stop(now + 0.5);
      rolling = null;
    }
  };

  const ballContact = (event: PhysicsEvent, now: number, pan: number) => {
    if (breakUntil > now && event.speed >= BREAK_BURST_SPEED && clips.has("rackBurst")) {
      breakUntil = 0;
      burstUntil = now + BREAK_BURST_COVER;
      playSound("rackBurst", null, {
        gain: 0.95 * clamp(event.speed / 6, 0.45, 1),
        brightness: 16000,
        pan,
      });
      return;
    }
    if (now < burstUntil && clips.has("rackBurst")) return;
    const strength = clamp(event.speed / 4, 0, 1);
    const clip = event.speed >= STRONG_CLACK_SPEED
      ? "clackStrong"
      : event.speed >= SOFT_CLACK_SPEED ? "clackSoft" : "clackLight";
    playSound(clip, "ball", {
      gain: 0.95 * strength ** 0.85,
      brightness: 2400 + 12000 * strength ** 0.6,
      pan,
    });
  };

  const pocket = (event: PhysicsEvent, pan: number) => {
    const strength = clamp(0.25 + event.speed / 3, 0, 1);
    if (clips.has("pocket")) {
      playSound("pocket", null, { gain: 0.85 * strength, brightness: 9000, pan });
      return;
    }
    playVoice("pocket", { gain: 0.7 * strength, brightness: 2600, pan });
    // The ball then drops onto the pocket floor, a beat later and deeper.
    playVoice("pocket", {
      gain: 0.38 * strength,
      brightness: 1500,
      pan,
      delay: 0.1 + Math.random() * 0.05,
      rate: 0.8,
    });
  };

  const play = (event: PhysicsEvent) => {
    if (!audible(context)) return;
    if (event.kind === "roll") {
      roll(event);
      return;
    }
    const now = context.currentTime;
    // Many contacts land in one frame on the break; keep the first of each.
    if (now - (lastImpact[event.kind] ?? -1) < 0.003) return;
    lastImpact[event.kind] = now;
    const pan = event.x / (TABLE.width / 2) * 0.6;
    if (event.kind === "ball") {
      ballContact(event, now, pan);
    } else if (event.kind === "rail") {
      const strength = clamp(event.speed / 4, 0, 1);
      playVoice("rail", {
        gain: 0.9 * strength ** 0.8,
        brightness: 700 + 3800 * strength ** 0.7,
        pan,
      });
    } else if (event.kind === "land") {
      // A flying ball coming down on the slate: a dull knock.
      const strength = clamp(event.speed / 3, 0, 1);
      playVoice("rail", { gain: 0.6 * strength, brightness: 1200 + 2400 * strength, pan });
    } else {
      pocket(event, pan);
    }
  };

  const onVisibility = () => {
    if (document.hidden) {
      stop();
      void context?.suspend().catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    unlock,
    play,
    cue: (power, opening = false) => {
      unlock();
      if (!audible(context)) return;
      const strength = clamp(power / 100, 0, 1);
      playSound(power >= STRONG_STROKE_POWER ? "cueStrong" : "cueSoft", "cue", {
        gain: 0.18 + 0.62 * strength ** 0.8,
        brightness: 2600 + 7000 * strength,
        pan: 0,
      });
      breakUntil = opening ? context.currentTime + BREAK_WINDOW : 0;
    },
    rack: () => {
      unlock();
      const asked = performance.now();
      void loading?.then(() => {
        if (!audible(context) || performance.now() - asked > RACK_DEADLINE_MS) return;
        playSound("rack", null, { gain: 0.55, brightness: 16000, pan: 0 });
      });
    },
    setMuted: (value) => {
      muted = value;
      if (muted) stop();
      else unlock();
    },
    dispose: () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
      void context?.close().catch(() => {});
      context = null;
      bus = null;
      loading = null;
      banks.clear();
      clips.clear();
    },
  };
};
