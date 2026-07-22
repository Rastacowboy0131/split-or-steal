// WebAudio sound engine. All sounds synthesized, no audio files.
// Audio context is created lazily on first user gesture.

let ctx = null;
let muted = false;
let loaded = false;

function loadPref() {
  if (loaded) return;
  loaded = true;
  try {
    muted = localStorage.getItem("sos-muted") === "1";
  } catch {}
}

export function isMuted() {
  loadPref();
  return muted;
}

export function setMuted(m) {
  muted = m;
  try {
    localStorage.setItem("sos-muted", m ? "1" : "0");
  } catch {}
}

// Call on first user interaction to satisfy autoplay policies.
export function initAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

function ready() {
  loadPref();
  if (muted || !ctx || ctx.state !== "running") return false;
  return true;
}

function env(gainNode, t0, attack, peak, decay) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(peak, t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone(freq, type, attack, peak, decay, when = 0) {
  if (!ready()) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  env(g, t0, attack, peak, decay);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + attack + decay + 0.05);
}

function noise(duration, peak, filterFreq, when = 0) {
  if (!ready()) return;
  const t0 = ctx.currentTime + when;
  const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
}

// Soft tick for each timer second.
export function tick() {
  tone(1100, "square", 0.002, 0.04, 0.05);
}

// Heartbeat-ish urgent tick under 10 seconds.
export function heartbeat() {
  tone(150, "sine", 0.005, 0.22, 0.12);
  tone(110, "sine", 0.005, 0.18, 0.14, 0.14);
}

// Dramatic sting on reveal.
export function sting() {
  tone(220, "sawtooth", 0.01, 0.12, 0.5);
  tone(233, "sawtooth", 0.01, 0.12, 0.5);
  tone(440, "triangle", 0.01, 0.1, 0.7, 0.15);
}

// Cartoon gunshot.
export function gunshot() {
  noise(0.25, 0.5, 3500);
  tone(90, "square", 0.001, 0.3, 0.15);
}

// Cheerful chime for a hug.
export function chime() {
  tone(523, "sine", 0.01, 0.15, 0.4);
  tone(659, "sine", 0.01, 0.15, 0.4, 0.12);
  tone(784, "sine", 0.01, 0.15, 0.5, 0.24);
  tone(1047, "sine", 0.01, 0.12, 0.7, 0.36);
}

// Snore for AFK collapse.
export function snore() {
  tone(80, "sawtooth", 0.15, 0.12, 0.4);
  tone(70, "sawtooth", 0.15, 0.1, 0.5, 0.7);
  tone(85, "sawtooth", 0.15, 0.1, 0.45, 1.4);
}

// Countdown beep, higher pitch for the final beat.
export function beep(final = false) {
  tone(final ? 880 : 440, "square", 0.005, 0.1, 0.15);
}
