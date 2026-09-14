// Sonidos sintetizados con WebAudio: sin archivos, cero peso.

let ctx: AudioContext | null = null;
let lastSizzle = 0;

export function unlockAudio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.18, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(filt).connect(g).connect(ctx.destination);
  src.start();
}

export const sfx = {
  jump: () => tone('sine', 220, 520, 0.22, 0.2),
  pad: () => tone('square', 180, 760, 0.3, 0.1),
  split: () => { tone('sine', 520, 180, 0.16, 0.18); tone('sine', 480, 160, 0.16, 0.12, 0.05); },
  merge: () => tone('sine', 300, 420, 0.1, 0.1),
  fall: () => tone('triangle', 500, 90, 0.5, 0.12),
  sizzle: () => {
    if (!ctx || ctx.currentTime - lastSizzle < 0.12) return;
    lastSizzle = ctx.currentTime;
    noise(0.35, 0.22, 2500);
  },
  win: () => [523, 659, 784, 1046].forEach((f, k) => tone('triangle', f, f, 0.22, 0.16, k * 0.12)),
  lose: () => [392, 330, 262].forEach((f, k) => tone('triangle', f, f * 0.97, 0.3, 0.14, k * 0.18)),
  click: () => tone('sine', 660, 880, 0.06, 0.08),
};
