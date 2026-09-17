/*
  Solo en desarrollo: piloto automático para comprobar que los pisos se pueden pasar.
  Consola:
    await __auto.level(capítulo, piso, pasos)   un piso con pasos a mano
    await __auto.all()                          todos los pisos con sus rutas (src/dev-routes.ts)
    await __auto.all(2)                         solo el capítulo 3 (índice desde 0)
  Un piso aprueba si llega al tesoro con todas las monedas y conserva más del 90 % del limo.
*/
import { ROUTES, type Step } from './dev-routes';

interface DevSlime {
  groups: { cx: number; cz: number; ids: number[] }[];
  riding: Uint8Array;
  flying: Uint8Array;
  aliveCount: number;
  n: number;
}
interface DevApi {
  start(c: number, k: number): void;
  run(s: number): string;
  drive(fn: (() => [number, number]) | null): void;
  state(): { mode: string; groups?: number[]; coins?: string };
  slime(): DevSlime | null;
  world(): { def: { id: string }; fireActive(i: number, j: number): boolean; coinsCollected: number; coinsTotal: number; gemsCollected: number; gemsTotal: number; relicsCollected: number; relicsTotal: number };
  save(): { floors: Record<string, { done: boolean } | undefined> };
  chapters(): { floors: { id: string }[] }[];
}

const api = () => (window as unknown as { __slime: DevApi }).__slime;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = (type: string, code: string) => window.dispatchEvent(new KeyboardEvent(type, { code, key: ' ', bubbles: true }));
const playing = () => api().state().mode === 'play';

/** Mayor número de limitos separados del trozo principal visto en la prueba (y dónde). */
let apart = { n: 0, x: 0, z: 0 };
function sampleApart() {
  const sl = api().slime();
  const lead = sl?.groups[0];
  if (!sl || !lead) return;
  const n = sl.aliveCount - lead.ids.length;
  if (n > apart.n) apart = { n, x: lead.cx, z: lead.cz };
}
/** Avanza la simulación en pasos cortos midiendo las separaciones. */
function advance(t: number) {
  const S = api();
  for (let s = 0; s < t - 1e-6 && playing(); s += 0.05) { S.run(Math.min(0.05, t - s)); sampleApart(); }
}

function goTo(tx: number, tz: number, radius = 0.45, t = 8, until?: () => boolean) {
  const S = api();
  S.drive(() => {
    const g = S.slime()?.groups[0];
    if (!g) return [0, 0];
    const dx = tx - g.cx, dz = tz - g.cz;
    const d = Math.hypot(dx, dz);
    // frena al llegar para no pasarse (las monedas y los bordes piden precisión)
    const k = Math.min(1, d / 0.6);
    return d < 0.05 ? [0, 0] : [(dx / d) * k, (dz / d) * k];
  });
  for (let s = 0; s < t && playing(); s += 0.05) {
    S.run(0.05);
    sampleApart();
    const g = S.slime()?.groups[0];
    if (g && Math.hypot(tx - g.cx, tz - g.cz) < radius) return;
    if (until?.()) return;
  }
}

/** Entra en el cañón, suelta el mando y espera a que el disparo aterrice. */
function shoot(tx: number, tz: number) {
  const S = api();
  const sl = S.slime()!;
  goTo(tx, tz, 0.05, 6, () => sl.riding.some((v) => v === 1));
  S.drive(() => [0, 0]);
  for (let s = 0; s < 6 && playing() && (sl.riding.some((v) => v === 1) || sl.flying.some((v) => v === 1)); s += 0.05) S.run(0.05);
  S.run(0.8);
}

function waitFireOff(i: number, j: number, t = 8) {
  const S = api();
  S.drive(() => [0, 0]);
  let was = S.world().fireActive(i, j);
  for (let s = 0; s < t && playing(); s += 0.02) {
    S.run(0.02);
    const now = S.world().fireActive(i, j);
    if (was && !now) return;
    was = now;
  }
}

export interface LevelReport { id: string; ok: boolean; line: string }

async function run(c: number, k: number, steps: Step[], trace?: string[]): Promise<LevelReport> {
  const S = api();
  S.drive(null);
  // lo ya ganado en la partida (o con el código de pruebas) no cuenta: se aparta y se devuelve al terminar
  const floorId = S.chapters()[c].floors[k].id;
  const saved = S.save().floors[floorId];
  delete S.save().floors[floorId];
  S.start(c, k);
  await sleep(1200);
  apart = { n: 0, x: 0, z: 0 };
  S.drive(() => [0, 0]);
  S.run(0.8);
  for (const st of steps) {
    if (!playing()) break;
    if (st.squeeze !== undefined) key(st.squeeze ? 'keydown' : 'keyup', 'Space');
    if (st.to) goTo(st.to[0], st.to[1], st.radius, st.t);
    if (st.cannon) shoot(st.cannon[0], st.cannon[1]);
    if (st.dir) { const d = st.dir; S.drive(() => d); advance(st.t ?? 1); }
    if (st.wait) { S.drive(() => [0, 0]); advance(st.wait); }
    if (st.fire) waitFireOff(st.fire[0], st.fire[1]);
    if (trace) {
      const w = S.world(), sl = S.slime();
      const groups = (sl?.groups ?? []).slice(0, 4).map((g) => `${(g as unknown as { ids: number[] }).ids.length}@${g.cx.toFixed(1)},${g.cz.toFixed(1)}`).join(' ');
      trace.push(`${trace.length} ${JSON.stringify(st)} → vivos ${sl?.aliveCount} monedas ${w.coinsCollected}/${w.coinsTotal} trozos ${groups} ${S.state().mode}`);
    }
  }
  key('keyup', 'Space');
  for (let s = 0; s < 4 && playing(); s += 0.5) S.run(0.5);
  const st = S.state();
  S.drive(null);
  const w = S.world();
  const sl = S.slime();
  const done = st.mode === 'winning' || !!S.save().floors[w.def.id]?.done;
  if (saved) S.save().floors[floorId] = saved;
  const pct = sl ? sl.aliveCount / sl.n : 0;
  const coins = w.coinsCollected === w.coinsTotal;
  const ok = done && coins && pct > 0.9;
  const line = `${ok ? 'OK ' : 'MAL'} c${c + 1}f${k + 1} ${w.def.id}: ${done ? 'tesoro' : 'SIN TESORO'} · limo ${Math.round(pct * 100)}% · monedas ${w.coinsCollected}/${w.coinsTotal}${w.gemsTotal ? ` · gema ${w.gemsCollected}/${w.gemsTotal}` : ''}${w.relicsTotal ? ` · coleccionable ${w.relicsCollected}/${w.relicsTotal}` : ''} · separado máx ${apart.n} en (${apart.x.toFixed(1)}, ${apart.z.toFixed(1)})`;
  return { id: w.def.id, ok, line };
}

async function level(c: number, k: number, steps?: Step[]) {
  const id = api().chapters()[c].floors[k].id;
  return (await run(c, k, steps ?? ROUTES[id] ?? [])).line;
}

/** Todos los pisos (o los de un capítulo) con sus rutas guardadas. */
async function all(chapter?: number) {
  const chapters = api().chapters();
  const out: string[] = [];
  for (let c = 0; c < chapters.length; c++) {
    if (chapter !== undefined && c !== chapter) continue;
    for (let k = 0; k < chapters[c].floors.length; k++) {
      const id = chapters[c].floors[k].id;
      if (!ROUTES[id]) { out.push(`MAL c${c + 1}f${k + 1} ${id}: sin ruta`); continue; }
      out.push((await run(c, k, ROUTES[id])).line);
    }
  }
  return out.join('\n');
}

/** Un piso paso a paso: estado tras cada paso (para depurar rutas). */
async function trace(c: number, k: number, steps?: Step[]) {
  const id = api().chapters()[c].floors[k].id;
  const lines: string[] = [];
  const r = await run(c, k, steps ?? ROUTES[id] ?? [], lines);
  return [...lines, r.line].join('\n');
}

Object.assign(window, { __auto: { level, all, trace } });
