import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/billiard/") && specifier.startsWith("./") && !specifier.endsWith(".ts")) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { createBilliardAudio, cutClip, declip } = await import("../src/app/billiard/_components/billiard-game/audio.ts");

test("audio starts after a gesture, respects mute/visibility, and cleans up", () => {
  const previousDocument = globalThis.document;
  const previousContext = globalThis.AudioContext;
  const counts = { contexts: 0, sources: 0, stopped: 0, closed: 0, suspended: 0 };
  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    setTargetAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({
    frequency: parameter(),
    gain: parameter(),
    pan: parameter(),
    Q: parameter(),
    playbackRate: parameter(),
    threshold: parameter(),
    knee: parameter(),
    ratio: parameter(),
    attack: parameter(),
    release: parameter(),
    connect(target) { return target; },
    disconnect() {},
    start() { counts.sources += 1; },
    stop() {
      counts.stopped += 1;
      this.onended?.();
    },
  });
  class TestDocument extends EventTarget {
    hidden = false;
  }
  class TestAudioContext {
    state = "running";
    currentTime = 1;
    sampleRate = 1000;
    destination = node();
    constructor() { counts.contexts += 1; }
    createOscillator() { return node(); }
    createGain() { return node(); }
    createStereoPanner() { return node(); }
    createBufferSource() { return node(); }
    createBiquadFilter() { return node(); }
    createDynamicsCompressor() { return node(); }
    createConvolver() { return node(); }
    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }
    resume() { this.state = "running"; return Promise.resolve(); }
    suspend() { counts.suspended += 1; this.state = "suspended"; return Promise.resolve(); }
    close() { counts.closed += 1; this.state = "closed"; return Promise.resolve(); }
  }
  globalThis.document = new TestDocument();
  globalThis.AudioContext = TestAudioContext;
  try {
    const audio = createBilliardAudio();
    const collision = { kind: "ball", speed: 2, ballId: 1, x: 0 };
    assert.equal(counts.contexts, 0);
    audio.play(collision);
    assert.equal(counts.sources, 0);
    audio.unlock();
    audio.unlock();
    assert.equal(counts.contexts, 1);
    audio.play(collision);
    const afterCollision = counts.sources;
    assert.ok(afterCollision > 0);
    audio.play({ ...collision, kind: "pocket" });
    assert.ok(counts.sources > afterCollision);
    const beforeRoll = counts.sources;
    const stoppedBeforeRoll = counts.stopped;
    audio.play({ kind: "roll", speed: 1.5, ballId: 0, x: 0 });
    audio.play({ kind: "roll", speed: 1.2, ballId: 0, x: 0 });
    // One looping rumble is reused while balls keep rolling ...
    assert.equal(counts.sources, beforeRoll + 1);
    audio.play({ kind: "roll", speed: 0, ballId: 0, x: 0 });
    // ... and released once everything has stopped.
    assert.equal(counts.stopped, stoppedBeforeRoll + 1);
    audio.setMuted(true);
    const afterMute = counts.sources;
    audio.play({ ...collision, kind: "pocket" });
    audio.cue(100);
    assert.equal(counts.sources, afterMute);
    audio.setMuted(false);
    document.hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    assert.ok(counts.suspended > 0);
    audio.play({ ...collision, kind: "pocket" });
    assert.equal(counts.sources, afterMute);
    document.hidden = false;
    audio.unlock();
    audio.cue(50);
    assert.ok(counts.sources > afterMute);
    audio.dispose();
    assert.equal(counts.closed, 1);
    const suspended = counts.suspended;
    document.hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(counts.suspended, suspended);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previousContext;
  }
});

test("declipping redraws flat tops from the surrounding waveform", () => {
  const rate = 44100;
  const truth = Float32Array.from({ length: 2000 }, (_, i) => 2 * Math.sin(2 * Math.PI * 3000 * i / rate));
  const clipped = truth.map((value) => Math.max(-1, Math.min(1, value)));
  const repaired = declip(clipped);
  const error = (data) => data.reduce((sum, value, i) => sum + (value - truth[i]) ** 2, 0);
  assert.ok(Math.max(...repaired.map(Math.abs)) > 1.5);
  assert.ok(error(repaired) < error(clipped) / 4);
  // A clean recording passes through untouched.
  const quiet = truth.map((value) => value * 0.3);
  assert.deepEqual(declip(quiet), quiet);
});

test("clips are matched on loudness, capped in peak, and fade without a click", () => {
  const context = {
    createBuffer: (channels, length, sampleRate) => {
      const data = new Float32Array(length);
      return { length, sampleRate, getChannelData: () => data };
    },
  };
  const rms = (data) => Math.sqrt(data.reduce((sum, value) => sum + value ** 2, 0) / data.length);
  const peak = (data) => Math.max(...data.map(Math.abs));
  // A steady tone and a ringing one end up equally loud, whatever their level.
  const tone = Float32Array.from({ length: 1000 }, (_, i) => 0.4 * Math.sin(i / 3));
  const clip = cutClip(context, tone, 1000, { file: "hit", start: 0.1, end: 0.4 });
  const data = clip.getChannelData(0);
  assert.equal(clip.length, 300);
  assert.ok(Math.abs(rms(data.slice(100, 150)) - 0.2) < 0.01);
  assert.equal(data[0], 0);
  assert.equal(data[data.length - 1], 0);
  // A single spike cannot be raised past the peak cap.
  const spike = new Float32Array(1000);
  spike[500] = 0.01;
  assert.ok(peak(cutClip(context, spike, 1000, { file: "hit", start: 0.4, end: 0.6 }).getChannelData(0)) <= 0.95 + 1e-6);
});

test("recordings replace the synthesized hits once decoded, with the break and rack", async () => {
  const saved = {
    document: globalThis.document,
    AudioContext: globalThis.AudioContext,
    fetch: globalThis.fetch,
  };
  const played = [];
  const parameter = () => ({ value: 0, setTargetAtTime() {} });
  const node = () => ({
    frequency: parameter(),
    gain: parameter(),
    pan: parameter(),
    Q: parameter(),
    playbackRate: parameter(),
    threshold: parameter(),
    knee: parameter(),
    ratio: parameter(),
    attack: parameter(),
    release: parameter(),
    connect(target) { return target; },
    disconnect() {},
    start() { played.push(this.buffer); },
    stop() { this.onended?.(); },
  });
  const buffer = (length, sampleRate, tag) => {
    const data = new Float32Array(length);
    return { length, sampleRate, tag, getChannelData: () => data };
  };
  let clock = 1;
  class TestAudioContext {
    state = "running";
    sampleRate = 1000;
    destination = node();
    get currentTime() { return clock; }
    createGain() { return node(); }
    createStereoPanner() { return node(); }
    createBufferSource() { return node(); }
    createBiquadFilter() { return node(); }
    createDynamicsCompressor() { return node(); }
    createConvolver() { return node(); }
    createBuffer(channels, length, sampleRate) { return buffer(length, sampleRate, "made"); }
    decodeAudioData() {
      const decoded = buffer(2200, 1000, "file");
      decoded.getChannelData(0).forEach((_, i, data) => { data[i] = Math.sin(i / 2) * 0.5; });
      return Promise.resolve(decoded);
    }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  const requested = [];
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  globalThis.AudioContext = TestAudioContext;
  globalThis.fetch = (url) => {
    requested.push(url);
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  };
  try {
    const audio = createBilliardAudio();
    audio.unlock();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(
      [...new Set(requested)].sort(),
      ["break", "hit", "hit_strong", "hit_strong_2", "hole", "setup"].map((name) => `/sounds/billiard/${name}.mp3`),
    );
    // Clip lengths at 1 kHz identify which recording played; the clock
    // moves on so the same-kind 3 ms guard does not drop an event.
    const last = () => played[played.length - 1].length;
    const contact = (speed) => {
      clock += 0.01;
      audio.play({ kind: "ball", speed, ballId: 1, x: 0 });
      return last();
    };
    assert.ok([85, 75, 105].includes(contact(0.3)));
    assert.ok([175, 125, 95].includes(contact(1.2)));
    assert.ok([215, 225].includes(contact(3.5)));
    audio.cue(30);
    assert.equal(last(), 175);
    audio.cue(90, true);
    assert.ok([177, 180, 83].includes(last()));
    // The break's first hard contact plays the scattering rack ...
    assert.equal(contact(6), 384);
    const before = played.length;
    // ... which also covers the next contacts of the same moment.
    contact(5);
    assert.equal(played.length, before);
    // Later contacts are single clacks again.
    clock += 0.3;
    assert.ok([215, 225].includes(contact(3.5)));
    audio.play({ kind: "pocket", speed: 1, ballId: 3, x: 0 });
    assert.equal(last(), 385);
    audio.rack();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(last(), 1320);
    audio.dispose();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
