/*
  Sonidos sintetizados con WebAudio: sin archivos, cero peso.
  Todo lo que le pasa al limo suena a líquido:
    - blup: burbuja (seno cuyo tono sube rápido al cerrarse, como una burbuja real al reventar)
    - chapoteo: ruido filtrado en banda que baja de tono + gotitas
    - chisporroteo: siseo agudo con chasquidos y burbujas de ebullición
  Salida: compresor suave + reverberación corta de cueva (el abismo) para que no suene "a pitido".
*/

let ctx: AudioContext | null = null;
let muted = false;
let master: GainNode | null = null;
let wet: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const last: Record<string, number> = {};

export function setMuted(m: boolean) { muted = m; }

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    // reverberación de cueva: respuesta generada (ruido que se apaga), 1.4 s
    const verb = ctx.createConvolver();
    verb.buffer = caveImpulse(ctx, 1.4);
    wet = ctx.createGain();
    wet.gain.value = 0.22;
    wet.connect(verb).connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function caveImpulse(ac: AudioContext, seconds: number) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 80 ? i / 80 : 1);
    }
  }
  return buf;
}

/** Evita que el mismo sonido se amontone (p. ej. 30 limitos evaporándose a la vez). */
function throttle(key: string, gap: number) {
  if (!ctx) return false;
  if (ctx.currentTime - (last[key] ?? -1) < gap) return false;
  last[key] = ctx.currentTime;
  return true;
}

function out(node: AudioNode, reverb = 1) {
  node.connect(master!);
  if (reverb > 0) {
    const send = ctx!.createGain();
    send.gain.value = reverb;
    node.connect(send).connect(wet!);
  }
}

/** Burbuja: el tono sube al cerrarse. f = tono inicial, rise = cuánto sube, dur en segundos. */
function blup(f: number, dur: number, vol: number, delay = 0, rise = 2.1, reverb = 1) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * rise, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(9000, f * 6);
  o.connect(g).connect(lp);
  out(lp, reverb);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** Tono que cae (gorgoteo al hundirse). */
function gulp(f0: number, f1: number, dur: number, vol: number, delay = 0, reverb = 1) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  // vibrato rápido: sensación de líquido que se agita
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 22;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = f0 * 0.06;
  lfo.connect(lfoGain).connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  out(g, reverb);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.03);
  lfo.stop(t + dur + 0.03);
}

/** Ruido filtrado con envolvente: chapoteos, siseos y viento. */
function wash(opts: { dur: number; vol: number; type: BiquadFilterType; f0: number; f1: number; q?: number; delay?: number; attack?: number; reverb?: number }) {
  if (!ctx || muted || !noiseBuf) return;
  const { dur, vol, type, f0, f1, q = 1, delay = 0, attack = 0.005, reverb = 1 } = opts;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const offset = Math.random() * (noiseBuf.duration - dur - 0.05);
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.Q.value = q;
  filt.frequency.setValueAtTime(f0, t);
  filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g);
  out(g, reverb);
  src.start(t, Math.max(0, offset), dur + 0.05);
}

function bubbles(n: number, spread: number, fLow: number, fHigh: number, vol: number, delay = 0) {
  for (let k = 0; k < n; k++) {
    const f = fLow * Math.pow(fHigh / fLow, Math.random());
    blup(f, 0.05 + Math.random() * 0.07, vol * (0.5 + Math.random() * 0.5), delay + Math.random() * spread, 1.8 + Math.random() * 0.8);
  }
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.18, delay = 0, reverb = 0.6) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  out(g, reverb);
  o.start(t);
  o.stop(t + dur + 0.03);
}

export const sfx = {
  /** muelle: rebote elástico + chapoteo del limo al despegar */
  pad: () => {
    if (!throttle('pad', 0.12)) return;
    tone('sine', 150, 520, 0.22, 0.12, 0, 0.4);
    wash({ dur: 0.22, vol: 0.22, type: 'bandpass', f0: 1800, f1: 500, q: 1.2 });
    bubbles(3, 0.12, 500, 1400, 0.1, 0.03);
  },
  /** se hace bola en la estación: sorbo gordo */
  board: () => {
    if (!throttle('board', 0.2)) return;
    gulp(420, 180, 0.28, 0.16);
    blup(260, 0.16, 0.14, 0.05, 2.6);
    wash({ dur: 0.18, vol: 0.12, type: 'lowpass', f0: 1400, f1: 300, q: 0.7 });
  },
  /** vuelve a ser limo: plaf */
  unboard: () => {
    if (!throttle('unboard', 0.2)) return;
    wash({ dur: 0.3, vol: 0.26, type: 'bandpass', f0: 1500, f1: 350, q: 1 });
    bubbles(5, 0.18, 350, 1200, 0.1);
  },
  /** trozos que caen al vacío: gorgoteo que se aleja hacia abajo */
  fall: () => {
    if (!throttle('fall', 0.18)) return;
    gulp(620, 110, 0.7, 0.1, 0, 1.6);
    bubbles(2, 0.25, 300, 700, 0.05, 0.1);
  },
  /** el fuego evapora limo: siseo de vapor con burbujas de ebullición y chasquidos */
  sizzle: () => {
    if (!throttle('sizzle', 0.11)) return;
    wash({ dur: 0.45, vol: 0.2, type: 'highpass', f0: 3200, f1: 6500, q: 0.6, attack: 0.015, reverb: 0.5 });
    wash({ dur: 0.12, vol: 0.14, type: 'bandpass', f0: 5000, f1: 2500, q: 3, delay: Math.random() * 0.08, reverb: 0.3 });
    bubbles(6, 0.3, 900, 2600, 0.07);
  },
  /** pinchos: pinchazo seco y la gota que revienta */
  pop: () => {
    if (!throttle('pop', 0.07)) return;
    wash({ dur: 0.05, vol: 0.2, type: 'highpass', f0: 5200, f1: 3000, q: 0.7, reverb: 0.3 });
    blup(700 + Math.random() * 300, 0.07, 0.14, 0.005, 2.8);
    wash({ dur: 0.14, vol: 0.12, type: 'bandpass', f0: 1800, f1: 600, q: 1.2, delay: 0.02 });
  },
  /** cuchilla: el limo se parte con un "chof" húmedo */
  cut: () => {
    if (!throttle('cut', 0.2)) return;
    wash({ dur: 0.16, vol: 0.24, type: 'bandpass', f0: 2600, f1: 700, q: 1.6 });
    blup(340, 0.1, 0.16, 0.01, 2.4);
    blup(520, 0.08, 0.1, 0.07, 2.2);
    wash({ dur: 0.08, vol: 0.08, type: 'highpass', f0: 6000, f1: 8000, reverb: 0.2 });
  },
  /** trozos que se vuelven a unir */
  merge: () => {
    if (!throttle('merge', 0.3)) return;
    blup(300, 0.12, 0.1, 0, 1.6);
    blup(460, 0.09, 0.07, 0.05, 1.7);
  },
  /** apretar: esfuerzo líquido, gorgoteos cortos mientras se mantiene */
  squeeze: () => {
    if (!throttle('squeeze', 0.22)) return;
    gulp(260 + Math.random() * 60, 200, 0.18, 0.06, 0, 0.5);
    bubbles(2, 0.15, 400, 900, 0.05);
  },
  /** aterrizaje tras una caída o un salto */
  land: () => {
    if (!throttle('land', 0.25)) return;
    wash({ dur: 0.26, vol: 0.22, type: 'lowpass', f0: 1600, f1: 250, q: 0.8 });
    bubbles(4, 0.14, 300, 900, 0.08, 0.02);
  },
  /** botella de aceite: glu glu */
  oil: () => {
    [0, 0.13, 0.26].forEach((d, k) => gulp(330 - k * 40, 180, 0.12, 0.12, d));
  },
  /** se prende: fogonazo + chisporroteo */
  ignite: () => {
    wash({ dur: 0.5, vol: 0.28, type: 'lowpass', f0: 400, f1: 2400, q: 0.7, attack: 0.03 });
    sfx.sizzle();
  },
  /** congelado: crujido de hielo cristalino */
  freeze: () => {
    [0, 0.05, 0.11, 0.18].forEach((d, k) => tone('triangle', 2400 + k * 380, 1800 + k * 300, 0.12, 0.05, d, 1));
    wash({ dur: 0.35, vol: 0.12, type: 'highpass', f0: 5000, f1: 9000, q: 0.5 });
  },
  /** se descongela: goteo */
  thaw: () => {
    [0, 0.18, 0.4].forEach((d) => blup(900 + Math.random() * 500, 0.08, 0.1, d, 2.5, 1.4));
  },
  /** moneda: campanita con una gota */
  coin: () => {
    tone('sine', 1319, 1319, 0.14, 0.07, 0, 1);
    tone('sine', 1760, 1760, 0.26, 0.06, 0.06, 1);
    blup(700, 0.06, 0.06, 0.02, 2.6, 0.6);
  },
  star: (k: number) => {
    tone('triangle', 660 * 2 ** ((k * 4) / 12), 880 * 2 ** ((k * 4) / 12), 0.25, 0.12, 0, 1);
    blup(500 + k * 120, 0.08, 0.06, 0.02);
  },
  gem: () => {
    [784, 988, 1175, 1568].forEach((f, k) => tone('sine', f, f * 1.01, 0.3, 0.08, k * 0.07, 1.2));
    bubbles(6, 0.35, 900, 2400, 0.05, 0.05);
  },
  tick: () => tone('sine', 1200, 1200, 0.03, 0.035, 0, 0.2),
  win: () => {
    [523, 659, 784, 1046].forEach((f, k) => tone('triangle', f, f, 0.24, 0.13, k * 0.12, 1));
    bubbles(8, 0.6, 500, 1800, 0.06, 0.1);
  },
  lose: () => {
    [392, 330, 262].forEach((f, k) => tone('triangle', f, f * 0.97, 0.3, 0.12, k * 0.18, 1));
    gulp(500, 90, 0.9, 0.08, 0.25, 1.6);
  },
  /** botones de la interfaz: burbujita */
  click: () => blup(520, 0.07, 0.09, 0, 1.9, 0.3),
};
