"use client";

type StopSound = () => void;

type BrowserWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const NOOP: StopSound = () => {};

let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;

  const AudioContextCtor =
    window.AudioContext ?? (window as BrowserWindow).webkitAudioContext;
  if (!AudioContextCtor) return null;

  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContextCtor();
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume().catch(() => {});
  }

  return audioContext;
}

function createNoiseBuffer(context: AudioContext, seconds: number) {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let last = 0;

  for (let i = 0; i < frameCount; i += 1) {
    const white = Math.random() * 2 - 1;
    last = last * 0.72 + white * 0.28;
    channel[i] = last;
  }

  return buffer;
}

function scheduleTone({
  context,
  destination,
  start,
  duration,
  from,
  to,
  type = "triangle",
  gain = 0.04,
}: {
  context: AudioContext;
  destination: AudioNode;
  start: number;
  duration: number;
  from: number;
  to: number;
  type?: OscillatorType;
  gain?: number;
}) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);

  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(envelope);
  envelope.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);

  oscillator.addEventListener("ended", () => {
    oscillator.disconnect();
    envelope.disconnect();
  });
}

function scheduleNoise({
  context,
  destination,
  start,
  duration,
  filterType = "bandpass",
  frequency = 1600,
  q = 3,
  gain = 0.025,
}: {
  context: AudioContext;
  destination: AudioNode;
  start: number;
  duration: number;
  filterType?: BiquadFilterType;
  frequency?: number;
  q?: number;
  gain?: number;
}) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();

  source.buffer = createNoiseBuffer(context, duration + 0.02);
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency, start);
  filter.Q.setValueAtTime(q, start);

  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.005);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(destination);
  source.start(start);
  source.stop(start + duration + 0.02);

  source.addEventListener("ended", () => {
    source.disconnect();
    filter.disconnect();
    envelope.disconnect();
  });
}

export function playButtonClick() {
  const context = getAudioContext();
  if (!context) return;

  const now = context.currentTime;
  scheduleTone({
    context,
    destination: context.destination,
    start: now,
    duration: 0.052,
    from: 520,
    to: 150,
    type: "square",
    gain: 0.035,
  });
  scheduleNoise({
    context,
    destination: context.destination,
    start: now,
    duration: 0.026,
    frequency: 2400,
    q: 6,
    gain: 0.018,
  });
}

export function playCutSound() {
  const context = getAudioContext();
  if (!context) return;

  const now = context.currentTime;
  scheduleNoise({
    context,
    destination: context.destination,
    start: now,
    duration: 0.105,
    filterType: "highpass",
    frequency: 1200,
    q: 0.8,
    gain: 0.06,
  });
  scheduleTone({
    context,
    destination: context.destination,
    start: now + 0.016,
    duration: 0.045,
    from: 980,
    to: 210,
    type: "sawtooth",
    gain: 0.035,
  });
  scheduleTone({
    context,
    destination: context.destination,
    start: now + 0.07,
    duration: 0.035,
    from: 340,
    to: 140,
    type: "square",
    gain: 0.022,
  });
}

export function startPrintingLoop(): StopSound {
  const context = getAudioContext();
  if (!context || typeof window === "undefined") return NOOP;

  const master = context.createGain();
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const start = context.currentTime;

  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.026, start + 0.04);

  source.buffer = createNoiseBuffer(context, 0.7);
  source.loop = true;

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(760, start);
  filter.Q.setValueAtTime(0.85, start);

  compressor.threshold.setValueAtTime(-32, start);
  compressor.knee.setValueAtTime(16, start);
  compressor.ratio.setValueAtTime(4, start);
  compressor.attack.setValueAtTime(0.004, start);
  compressor.release.setValueAtTime(0.08, start);

  source.connect(filter);
  filter.connect(compressor);
  compressor.connect(master);
  master.connect(context.destination);
  source.start(start);

  const tick = () => {
    const tickTime = context.currentTime;
    scheduleTone({
      context,
      destination: master,
      start: tickTime,
      duration: 0.032,
      from: 210,
      to: 95,
      type: "square",
      gain: 0.09,
    });
  };

  tick();
  const interval = window.setInterval(tick, 96);
  let stopped = false;

  return () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(interval);

    const stopAt = context.currentTime + 0.1;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), context.currentTime);
    master.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    try {
      source.stop(stopAt + 0.02);
    } catch {}

    window.setTimeout(() => {
      source.disconnect();
      filter.disconnect();
      compressor.disconnect();
      master.disconnect();
    }, 180);
  };
}
