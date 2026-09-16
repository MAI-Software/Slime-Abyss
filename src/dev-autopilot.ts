/*
  Solo en desarrollo: piloto automático para comprobar que los pisos se pueden pasar.
  Uso en la consola: await __auto.level(capítulo, piso, pasos)
    pasos: { to: [x, z], radius?, t? } ir hacia un punto · { dir: [x, z], t } empujar en una dirección
           { wait: s } esperar · { fire: [i, j] } esperar a que esa llama se apague · { squeeze: true/false }
*/
type Step = { to?: [number, number]; radius?: number; t?: number; dir?: [number, number]; wait?: number; fire?: [number, number]; squeeze?: boolean };

interface DevSlime {
  groups: { cx: number; cz: number }[];
  aliveCount: number;
}
interface DevApi {
  start(c: number, k: number): void;
  run(s: number): string;
  drive(fn: (() => [number, number]) | null): void;
  state(): { mode: string; groups?: number[]; coins?: string };
  slime(): DevSlime | null;
  world(): { def: { id: string }; fireActive(i: number, j: number): boolean };
  save(): { floors: Record<string, { done: boolean } | undefined> };
}

const api = () => (window as unknown as { __slime: DevApi }).__slime;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = (type: string, code: string) => window.dispatchEvent(new KeyboardEvent(type, { code, key: ' ', bubbles: true }));

function goTo(tx: number, tz: number, radius = 0.45, t = 8) {
  const S = api();
  S.drive(() => {
    const g = S.slime()?.groups[0];
    if (!g) return [0, 0];
    const dx = tx - g.cx, dz = tz - g.cz;
    const d = Math.hypot(dx, dz);
    return d < 0.12 ? [0, 0] : [dx / d, dz / d];
  });
  for (let s = 0; s < t && S.state().mode === 'play'; s += 0.05) {
    S.run(0.05);
    const g = S.slime()?.groups[0];
    if (g && Math.hypot(tx - g.cx, tz - g.cz) < radius) return;
  }
}

function waitFireOff(i: number, j: number, t = 8) {
  const S = api();
  S.drive(() => [0, 0]);
  let was = S.world().fireActive(i, j);
  for (let s = 0; s < t && S.state().mode === 'play'; s += 0.02) {
    S.run(0.02);
    const now = S.world().fireActive(i, j);
    if (was && !now) return;
    was = now;
  }
}

async function level(c: number, k: number, steps: Step[]) {
  const S = api();
  S.drive(null);
  S.start(c, k);
  await sleep(1200);
  S.drive(() => [0, 0]);
  S.run(0.8);
  for (const st of steps) {
    if (S.state().mode !== 'play') break;
    if (st.squeeze !== undefined) key(st.squeeze ? 'keydown' : 'keyup', 'Space');
    if (st.to) goTo(st.to[0], st.to[1], st.radius, st.t);
    if (st.dir) { const d = st.dir; S.drive(() => d); S.run(st.t ?? 1); }
    if (st.wait) { S.drive(() => [0, 0]); S.run(st.wait); }
    if (st.fire) waitFireOff(st.fire[0], st.fire[1]);
  }
  key('keyup', 'Space');
  for (let s = 0; s < 4 && S.state().mode === 'play'; s += 0.5) S.run(0.5);
  const st = S.state();
  S.drive(null);
  const ok = st.mode === 'winning' || !!S.save().floors[S.world().def.id]?.done;
  return `c${c + 1}f${k + 1} ${ok ? 'OK ' : 'MAL'}: mode=${st.mode} vivos=${S.slime()?.aliveCount} trozos=${st.groups} monedas=${st.coins}`;
}

Object.assign(window, { __auto: { level } });
export {};
