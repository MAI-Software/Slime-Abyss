import * as THREE from 'three';
import { Assets } from './assets';
import { GEM_LOOK, GEM_OF_BIOME, type Biome } from './biomes';
import { COLLECTIBLES } from './collectibles';
import { FireFx, type FireCell, type FireState } from './fire';
import { AO_E, AO_N, AO_NE, AO_NW, AO_S, AO_SE, AO_SW, AO_W, createBlockMaterial, createGlowMaterial } from './materials';
import { cannonTargets, HEIGHT_STEP, RAMP_RISE, STORY_H, storyGrids, TILE_BY_CHAR, TILES, traceRails, type CellKind, type Channel, type LevelData, type StoryGrid } from './level/format';

export type { CellKind };

export interface Cell {
  kind: CellKind;
  base: number;
  top: number;
  /** cara de abajo del bloque: -Infinity en la planta 0 (columna hasta el abismo); en las de arriba, la losa */
  bottom: number;
  story: number;
  channel?: Channel;
  axis?: 'x' | 'z' | 'd1' | 'd2';
  dir?: 'n' | 's' | 'e' | 'w';
  rise?: 'n' | 's' | 'e' | 'w';
  corner?: 'nw' | 'ne' | 'sw' | 'se';
  shape?: 'loop' | 'spiral';
}

/** Plataforma giratoria: radio del disco y velocidad de giro (rad/s, en sentido antihorario visto desde arriba). */
export const SPINNER_R = 1.35;
export const SPINNER_W = 5.2;

/** radio del agujero redondo (la casilla mide 1) */
export const HOLE_R = 0.36;
/** por debajo de esto, lo que cae por un agujero sale por su salida */
export const HOLE_DROP = 0.9;

export type PickupType = 'coin' | 'gem' | 'oil' | 'relic';

/** Cañón: su casilla, la diana a la que apunta (NaN si no tiene) y el tubo dibujado. */
export interface Cannon {
  idx: number;
  x: number; z: number; top: number;
  tx: number; ty: number; tz: number;
  pivot: THREE.Object3D;
  barrel: THREE.Object3D;
  /** retroceso tras disparar (1 → 0) */
  kick: number;
  /** con limo dentro: tiembla hasta disparar */
  loaded: boolean;
}
/** inclinación del tubo del cañón hacia su diana */
const CANNON_TILT = 0.55;
const CANNON_LEN = 0.62;

/** Talla brillante: mesa octogonal, corona, cintura y pabellón en punta; las caras planas destellan al girar. */
function gemGeometry(): THREE.BufferGeometry {
  const N = 8, R = 0.3, TABLE = 0.17, CROWN = 0.13, PAVILION = 0.34;
  const p: number[] = [];
  const at = (r: number, y: number, a: number) => [Math.cos((a / N) * Math.PI * 2) * r, y, Math.sin((a / N) * Math.PI * 2) * r];
  const tri = (a: number[], b: number[], c: number[]) => {
    // hacia fuera: la figura es convexa y contiene el origen
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const out = nx * (a[0] + b[0] + c[0]) + ny * (a[1] + b[1] + c[1]) + nz * (a[2] + b[2] + c[2]) >= 0;
    p.push(...a, ...(out ? b : c), ...(out ? c : b));
  };
  const top = [0, CROWN, 0], tip = [0, -PAVILION, 0];
  for (let k = 0; k < N; k++) {
    const g0 = at(R, 0, k), g1 = at(R, 0, k + 1), t0 = at(TABLE, CROWN, k + 0.5), t1 = at(TABLE, CROWN, k + 1.5);
    tri(top, t0, t1);
    tri(g0, g1, t0);
    tri(t0, g1, t1);
    tri(g0, g1, tip);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Plantas o bloque de hielo que el limo en llamas elimina. */
interface Breakable {
  obj: THREE.Object3D;
  kind: 'plant' | 'iceblock';
  broken: boolean;
  t: number;
}

const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;
/** altura de colisión de la vía: valla invisible para el limo a pie */
const RAIL_FENCE = 50;

/** Recorrido de una vía desde una estación hasta la del otro extremo (centros de casilla). */
export interface RailPath {
  from: number;
  to: number;
  xs: Float32Array;
  zs: Float32Array;
  ys: Float32Array;
  /** distancia acumulada hasta cada punto */
  dist: Float32Array;
  total: number;
  /** dirección con la que se sale de la estación de llegada */
  exitX: number;
  exitZ: number;
}
const WIND_LEN = 9;

/** Obstáculo que no ocupa toda la casilla (sierras): hoja fina con dirección, para colisión y zona de corte. */
export interface Obstacle {
  kind: 'blade' | 'wedge';
  cx: number;
  cz: number;
  /** dirección de la hoja (unitaria) y normal (hacia el "lado 1") */
  tx: number; tz: number;
  nx: number; nz: number;
  /** media longitud y medio grosor */
  half: number;
  thick: number;
  minY: number; maxY: number;
  /** identificador estable para las etiquetas de corte del limo */
  id: number;
}

/** Plataforma de salto: tapa y muelle animados con un muelle amortiguado. */
interface Pad {
  plate: THREE.Object3D;
  spring: THREE.Object3D;
  offset: number;
  vel: number;
  cooldown: number;
}

interface Coin {
  type: PickupType;
  i: number;
  j: number;
  obj: THREE.Object3D;
  baseY: number;
  collected: boolean;
  t: number;
}

type BlockSet = 'floor' | 'ice' | 'wall' | 'crack';

/** Bloques de un tipo dibujados con dos InstancedMesh (losa y columna); índice de casilla → instancia. */
interface BlockBatch { tops: THREE.InstancedMesh; cols: THREE.InstancedMesh; index: Map<number, number>; list: Solid[] }

/**
  Suelo que se hunde: la roca agrietada al pisarla y el hielo al pisarlo el limo en llamas.
  Tiembla COLLAPSE_DELAY segundos (tiempo para salir) y después cae al vacío.
*/
export const COLLAPSE_DELAY = 1.3;
const FALL_TIME = 1.0;
interface Collapse { set: BlockSet; k: number; t: number; fallen: boolean; done: boolean; overlay: THREE.Object3D | null }
export type WorldEvent = { type: 'crack' | 'melt' | 'collapse'; x: number; y: number; z: number; melt: boolean };
/** balancín: tabla sobre un eje; se inclina hacia donde pesa el limo */
export interface Seesaw {
  cells: number[];
  axis: 'x' | 'z';
  base: number;
  /** centro (eje) de la tabla */
  px: number; pz: number;
  len: number;
  /** pendiente actual (altura por casilla) y su velocidad */
  tilt: number; vel: number;
  /** peso y momento acumulados en el paso de física */
  load: number; torque: number;
  obj: THREE.Object3D | null;
}

/** foot: dónde acaba la columna por abajo (el fondo en la planta 0; en las de arriba, el grosor de la losa) */
interface Solid { i: number; j: number; s: number; top: number; foot: number; color: THREE.Color; set: BlockSet }

const DOOR_H = TILE_BY_CHAR.get('D')!.raise!;
const SLAB_H = 0.5;   // alto de la losa biselada (block_top)
/** balancín: pendiente máxima (altura por casilla), fuerza del muelle y frenado */
/** Separación entre traviesas de la vía. */
const TIE_STEP = 0.42;
const SEESAW_MAX = 0.32;
const SEESAW_SPRING = 14;
const SEESAW_DAMP = 3.2;
const BOTTOM = -1.2;  // fondo de las columnas
const SHOWCASE_STRETCH = new THREE.Vector3(1, 1 / SLAB_H, 1);
/** grosor de los suelos de las plantas de arriba (por debajo se puede pasar) */
const UPPER_SLAB = SLAB_H;

export const FRICTION: Partial<Record<CellKind, number>> = Object.fromEntries(
  TILES.filter((t) => t.friction !== undefined).map((t) => [t.kind, t.friction]),
);

function drawLabel(c: HTMLCanvasElement, text: string, color: string) {
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#fdf2f8';
  g.strokeStyle = '#0f172a';
  g.lineWidth = 10;
  g.beginPath();
  g.roundRect(8, 8, 240, 112, 40);
  g.fill();
  g.stroke();
  g.fillStyle = color;
  g.font = '700 64px Fredoka, Nunito, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 68);
}

interface SwitchState {
  channel: Channel;
  need: number;
  latch: boolean;
  count: number;
  pressed: boolean;
  label: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  lastText: string;
  buttons: THREE.Object3D[];
}

interface DoorState {
  channel: Channel;
  i: number;
  j: number;
  s: number;
  open: number;
  obj: THREE.Object3D;
}

const CHANNEL_COLOR: Record<Channel, number> = { A: 0xf59e0b, B: 0x22c55e };
const CHANNEL_CSS: Record<Channel, string> = { A: '#b45309', B: '#15803d' };

export class World {
  readonly w: number;
  readonly d: number;
  /** plantas (1 si el nivel no tiene de encima) y casillas por planta */
  readonly stories: number;
  readonly layer: number;
  readonly cells: Cell[];
  readonly group = new THREE.Group();
  /** lo de cada planta (se ocultan las de encima de la del limo para verlo) */
  readonly storyGroups: THREE.Group[] = [];
  private buildStory = 0;
  /** índice absoluto de la salida del limo */
  startIdx = 0;
  start = new THREE.Vector3();
  treasure = new THREE.Vector3();
  private switches = new Map<Channel, SwitchState>();
  private doors: DoorState[] = [];
  private pads = new Map<number, Pad>();
  private coins: Coin[] = [];
  private coinAt = new Map<number, Coin>();
  readonly obstacles: Obstacle[] = [];
  /** índice de casilla → obstáculo (-1 si no hay) */
  private obstacleAt: Int32Array;
  coinsCollected = 0;
  gemsCollected = 0;
  get coinsTotal() { return this.coins.filter((c) => c.type === 'coin').length; }
  get gemsTotal() { return this.coins.filter((c) => c.type === 'gem').length; }
  relicsCollected = 0;
  get relicsTotal() { return this.coins.filter((c) => c.type === 'relic').length; }
  private breakables = new Map<number, Breakable>();
  private batches = new Map<string, BlockBatch>();
  private collapses = new Map<number, Collapse>();
  private crackOverlays = new Map<number, THREE.Object3D>();
  /** avisos para sonido y efectos (los consume main.ts) */
  readonly events: WorldEvent[] = [];
  private fans: { blades: THREE.Object3D; i: number; j: number; s: number; dir: 'n' | 's' | 'e' | 'w'; base: number }[] = [];
  private saws: THREE.Object3D[] = [];
  private shapes: { i: number; j: number; c: Cell }[] = [];
  private holeExits = new Map<number, THREE.Vector3>();
  readonly cannons: Cannon[] = [];
  private cannonByIdx = new Map<number, Cannon>();
  private gemMesh: { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial } | null = null;
  private floorTopMat: THREE.Material | null = null;
  /** plataformas giratorias: centro, altura y disco dibujado */
  readonly spinners: { x: number; z: number; y: number; disc: THREE.Object3D }[] = [];
  /** balancines: tablas que se inclinan hacia donde pesa el limo (idx de sus casillas -> tabla) */
  readonly seesaws: Seesaw[] = [];
  private seesawAt = new Map<number, Seesaw>();
  private coldCells: number[] = [];
  /** corriente de aire por casilla: dirección × fuerza y altura del ventilador */
  readonly windX: Float32Array;
  readonly windZ: Float32Array;
  readonly windBase: Float32Array;
  private windFx: THREE.Points | null = null;
  private windCells: { i: number; j: number; dx: number; dz: number; base: number; pow: number }[] = [];
  private mistFx: THREE.Points | null = null;
  private fire: FireFx | null = null;
  /** vías por estación de salida (índice de casilla) */
  readonly rails = new Map<number, RailPath>();
  /** focos de fuego para iluminar: grupos de casillas de fuego cercanas (bloques de 3x3) */
  readonly fireSpots: { x: number; y: number; z: number; cells: FireCell[] }[] = [];
  private chest: THREE.Object3D | null = null;
  private chestLid: THREE.Object3D | null = null;
  private sparkles: THREE.Points | null = null;
  private ownedMaterials: THREE.Material[] = [];
  private ownedGeometries: THREE.BufferGeometry[] = [];
  private timeUniform = { value: 0 };
  private time = 0;
  opening = 0; // animación de cofre abierto (0..1)

  /** showcase: un bloque suelto del creador, como un cubo de una pieza de 1 de alto (sin columna hasta el fondo) */
  constructor(readonly def: LevelData, private assets: Assets, readonly biome: Biome = 'stone', readonly showcase = false) {
    this.d = def.tiles.length;
    this.w = def.tiles[0].length;
    this.layer = this.w * this.d;
    const grids = storyGrids(def);
    this.stories = grids.length;
    this.cells = [];
    grids.forEach((g, s) => {
      for (let j = 0; j < this.d; j++) {
        for (let i = 0; i < this.w; i++) this.cells.push(this.parse(i, j, s, g));
      }
      const sg = new THREE.Group();
      this.storyGroups.push(sg);
      this.group.add(sg);
    });
    const total = this.layer * this.stories;
    this.obstacleAt = new Int32Array(total).fill(-1);
    this.windX = new Float32Array(total);
    this.windZ = new Float32Array(total);
    this.windBase = new Float32Array(total);
    this.build();
    // bloque suelto: la rampa es una cuña que sube de la arista de abajo a la de arriba, del tamaño de un cubo
    if (showcase && this.cells.some((c) => c.kind === 'ramp')) this.group.scale.y = 1 / RAMP_RISE;
  }

  private parse(i: number, j: number, s: number, g: StoryGrid): Cell {
    const tile = TILE_BY_CHAR.get(g.tiles[j]?.[i] ?? '.') ?? TILE_BY_CHAR.get('.')!;
    const floor = s * STORY_H;
    if (tile.kind === 'void') return { kind: 'void', base: floor, top: -Infinity, bottom: -Infinity, story: s };
    const base = floor + Number(g.heights[j]?.[i] ?? 0) * HEIGHT_STEP;
    const top = base + (tile.kind === 'ramp' ? RAMP_RISE : tile.raise ?? 0);
    return {
      kind: tile.kind, base, top, bottom: s === 0 ? -Infinity : base - UPPER_SLAB, story: s,
      channel: tile.channel, axis: tile.axis, dir: tile.dir, rise: tile.rise, corner: tile.corner, shape: tile.shape,
    };
  }

  /** Índice absoluto de una casilla de una planta. */
  index(i: number, j: number, s = 0) {
    return s * this.layer + j * this.w + i;
  }
  /** Columna, fila y planta de un índice absoluto. */
  colOf(idx: number) { return (idx % this.layer) % this.w; }
  rowOf(idx: number) { return Math.floor((idx % this.layer) / this.w); }
  storyOf(idx: number) { return Math.floor(idx / this.layer); }

  cell(i: number, j: number, s = 0): Cell | null {
    if (i < 0 || j < 0 || i >= this.w || j >= this.d || s < 0 || s >= this.stories) return null;
    return this.cells[this.index(i, j, s)];
  }

  /**
    Planta de lo que hay en (i, j) a la altura y: la más alta con suelo cuya losa no queda por encima.
    Con una sola planta siempre es 0.
  */
  storyAt(i: number, j: number, y: number): number {
    if (this.stories === 1 || i < 0 || j < 0 || i >= this.w || j >= this.d) return 0;
    for (let s = this.stories - 1; s > 0; s--) {
      const c = this.cells[this.index(i, j, s)];
      if (c.kind !== 'void' && y >= c.bottom - 0.25) return s;
    }
    return 0;
  }

  /** Planta cuya franja de altura contiene y (aunque ahí no haya suelo). */
  bandAt(y: number): number {
    return Math.max(0, Math.min(this.stories - 1, Math.floor((y + UPPER_SLAB + 0.5) / STORY_H)));
  }

  /** Oculta las plantas de encima de s (para ver al limo dentro); -1 las muestra todas. */
  setViewStory(s: number) {
    this.storyGroups.forEach((g, k) => { g.visible = s < 0 || k <= s; });
  }

  /**
    Altura del suelo de una casilla en un punto (x, z) de dentro de ella: igual que top() salvo en las rampas,
    que suben de base a base + RAMP_RISE.
  */
  topAt(c: Cell, ci: number, cj: number, x: number, z: number): number {
    if (c.kind === 'wedge') {
      // el pico ocupa media casilla: por fuera de la diagonal se pisa el suelo normal
      const fx = Math.min(1, Math.max(0, x - ci)), fz = Math.min(1, Math.max(0, z - cj));
      const [sx, sz] = World.slabClamp(c.corner, fx, fz);
      return Math.abs(sx - fx) < 1e-6 && Math.abs(sz - fz) < 1e-6 ? c.top : c.base;
    }
    if (c.kind === 'seesaw') {
      const see = this.seesawAt.get(this.index(ci, cj, c.story));
      return see ? this.seesawTop(see, x, z) : c.base;
    }
    if (c.kind !== 'ramp') return c.top;
    const fx = Math.min(1, Math.max(0, x - ci)), fz = Math.min(1, Math.max(0, z - cj));
    const f = c.rise === 'n' ? 1 - fz : c.rise === 's' ? fz : c.rise === 'e' ? fx : 1 - fx;
    return c.base + RAMP_RISE * f;
  }

  /** Punto de la media casilla diagonal más cercano a (x, z) (fx, fz relativos a la casilla, ya dentro de ella). */
  static slabClamp(corner: Cell['corner'], fx: number, fz: number): [number, number] {
    // la media casilla es la caja recortada por la diagonal que no pasa por su esquina
    const nw = corner === 'nw', se = corner === 'se', ne = corner === 'ne';
    let s: number, inside: boolean;
    if (nw || se) { s = fx + fz; inside = nw ? s <= 1 : s >= 1; }
    else { s = fx - fz; inside = ne ? s >= 0 : s <= 0; }
    if (inside) return [fx, fz];
    if (nw || se) { const k = (fx + fz - 1) / 2; return [Math.min(1, Math.max(0, fx - k)), Math.min(1, Math.max(0, fz - k))]; }
    const k = (fx - fz) / 2;
    return [Math.min(1, Math.max(0, fx - k)), Math.min(1, Math.max(0, fz + k))];
  }

  /** Salida del agujero de esta casilla (centro del suelo), si la hay. */
  holeExit(idx: number): THREE.Vector3 | null {
    return this.holeExits.get(idx) ?? null;
  }

  /** Altura superior de la columna o -Infinity si es vacío. */
  top(i: number, j: number, s = 0): number {
    const c = this.cell(i, j, s);
    return c ? c.top : -Infinity;
  }

  fireActive(i: number, j: number, s = 0): boolean {
    const c = this.cell(i, j, s);
    if (!c) return false;
    if (c.kind === 'fire') return true;
    return c.kind === 'firet' && this.timedPhase(i, j) < 1.7;
  }

  /**
    ¿Evapora el limo? El intermitente tarda 0.25 s en prender del todo: mientras sube solo empuja
    (ver respingo en slime.ts), así no se evapora de golpe un limo que estaba encima al encenderse.
  */
  fireLethal(i: number, j: number, s = 0): boolean {
    const c = this.cell(i, j, s);
    if (!c) return false;
    if (c.kind === 'fire') return true;
    if (c.kind !== 'firet') return false;
    const p = this.timedPhase(i, j);
    return p >= 0.25 && p < 1.7;
  }

  /** Fuego intermitente: 1.7 s encendido, apagado y aviso 0.45 s antes de volver. */
  private timedPhase(i: number, j: number): number {
    return (this.time + (i + j) * 0.25) % 3.2;
  }

  /** Cuánto alumbra un foco ahora mismo (0 apagado … 1 todo encendido; el aviso da un poco). */
  fireSpotLevel(spot: { cells: FireCell[] }): number {
    let sum = 0;
    for (const c of spot.cells) {
      const st = this.fireState(c);
      sum += st === 2 ? 1 : st === 1 ? 0.25 : 0;
    }
    return sum / spot.cells.length;
  }

  private fireState = (c: FireCell): FireState => {
    if (!c.timed) return 2;
    const p = this.timedPhase(c.i, c.j);
    return p < 1.7 ? 2 : p > 2.75 ? 1 : 0;
  };

  obstacle(i: number, j: number, s = 0): Obstacle | null {
    if (i < 0 || j < 0 || i >= this.w || j >= this.d) return null;
    const k = this.obstacleAt[this.index(i, j, s)];
    return k < 0 ? null : this.obstacles[k];
  }

  /** Recoge lo que haya en la casilla (moneda, gema o aceite). Devuelve qué era, o null. */
  collectCoin(i: number, j: number, s = 0): PickupType | null {
    const c = this.coinAt.get(this.index(i, j, s));
    if (!c || c.collected) return null;
    c.collected = true;
    c.t = 0;
    if (c.type === 'gem') this.gemsCollected++;
    else if (c.type === 'relic') this.relicsCollected++;
    else if (c.type === 'coin') this.coinsCollected++;
    return c.type;
  }

  /** ¿Hay plantas o hielo sin quemar en la casilla? */
  burnable(i: number, j: number, s = 0): boolean {
    const b = this.breakables.get(this.index(i, j, s));
    return !!b && !b.broken;
  }

  /** El limo en llamas elimina el obstáculo (índice absoluto). Devuelve qué era. */
  burn(idx: number): 'plant' | 'iceblock' | null {
    const b = this.breakables.get(idx);
    if (!b || b.broken) return null;
    b.broken = true;
    b.t = 0;
    const c = this.cells[idx];
    c.top = c.base;
    c.kind = 'floor';
    return b.kind;
  }

  /** El limo pisa roca agrietada: empieza a romperse. */
  crumble(i: number, j: number, s = 0) {
    const c = this.cell(i, j, s);
    if (c?.kind === 'crack') this.startCollapse(i, j, s, 'crack');
  }

  /** El limo en llamas pisa hielo: empieza a derretirse. */
  melt(i: number, j: number, s = 0) {
    const c = this.cell(i, j, s);
    if (c?.kind === 'ice') this.startCollapse(i, j, s, 'ice');
  }

  private startCollapse(i: number, j: number, s: number, set: BlockSet) {
    const idx = this.index(i, j, s);
    if (this.collapses.has(idx)) return;
    const k = this.batches.get(`${set}:${s}`)?.index.get(idx);
    if (k === undefined) return;
    this.collapses.set(idx, { set, k, t: 0, fallen: false, done: false, overlay: this.crackOverlays.get(idx) ?? null });
    this.events.push({ type: set === 'ice' ? 'melt' : 'crack', x: i + 0.5, y: this.cells[idx].base, z: j + 0.5, melt: set === 'ice' });
  }

  /** Tiembla, cae y desaparece; al caer la casilla pasa a ser vacío. */
  private updateCollapses(dt: number) {
    if (!this.collapses.size) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const touched = new Set<BlockBatch>();
    for (const [idx, c] of this.collapses) {
      if (c.done) continue;
      c.t += dt;
      const cell = this.cells[idx];
      const batch = this.batches.get(`${c.set}:${cell.story}`)!;
      const s = batch.list[c.k];
      let dx = 0, dy = 0, dz = 0, tilt = 0, shrink = 1;
      if (c.t < COLLAPSE_DELAY) {
        // temblor que va a más (el hielo además se hunde un poco al derretirse)
        const a = c.t / COLLAPSE_DELAY;
        dx = Math.sin(c.t * 55 + idx) * 0.025 * a;
        dz = Math.cos(c.t * 47 + idx * 1.7) * 0.025 * a;
        if (c.set === 'ice') { dy = -0.12 * a; shrink = 1 - 0.25 * a; }
      } else {
        if (!c.fallen) {
          c.fallen = true;
          cell.kind = 'void';
          cell.top = -Infinity;
          this.events.push({ type: 'collapse', x: s.i + 0.5, y: s.top, z: s.j + 0.5, melt: c.set === 'ice' });
        }
        const f = c.t - COLLAPSE_DELAY;
        dy = -9 * f * f - (c.set === 'ice' ? 0.12 : 0);
        tilt = f * (idx % 2 ? 1.4 : -1.2);
        shrink = c.set === 'ice' ? Math.max(0, 0.75 - f) : 1;
        if (f > FALL_TIME) {
          c.done = true;
          shrink = 0;
        }
      }
      const hide = shrink <= 0.001;
      e.set(tilt * 0.5, 0, tilt);
      q.setFromEuler(e);
      pos.set(s.i + 0.5 + dx, s.top + dy, s.j + 0.5 + dz);
      scl.set(hide ? 0 : shrink, hide ? 0 : 1, hide ? 0 : shrink);
      m.compose(pos, q, scl);
      batch.tops.setMatrixAt(c.k, m);
      const h = Math.max(0.01, s.top - SLAB_H - s.foot);
      pos.set(s.i + 0.5 + dx, s.top - SLAB_H + dy, s.j + 0.5 + dz);
      scl.set(hide ? 0 : shrink, hide ? 0 : h, hide ? 0 : shrink);
      m.compose(pos, q, scl);
      batch.cols.setMatrixAt(c.k, m);
      touched.add(batch);
      if (c.overlay) {
        c.overlay.position.set(s.i + 0.5 + dx, s.top + dy, s.j + 0.5 + dz);
        c.overlay.rotation.set(tilt * 0.5, c.overlay.rotation.y, tilt);
        c.overlay.visible = !hide;
      }
    }
    for (const b of touched) {
      b.tops.instanceMatrix.needsUpdate = true;
      b.cols.instanceMatrix.needsUpdate = true;
    }
  }

  isCold(i: number, j: number, s = 0): boolean {
    return i >= 0 && j >= 0 && i < this.w && j < this.d && this.coldCells.includes(this.index(i, j, s));
  }

  /** Dispara la animación del muelle. Devuelve true si no se había disparado hace nada (para sonido). */
  triggerPad(i: number, j: number, s = 0): boolean {
    const p = this.pads.get(this.index(i, j, s));
    if (!p) return false;
    const fresh = p.cooldown <= 0;
    if (fresh) {
      p.offset = -0.16;
      p.vel = 0;
      p.cooldown = 0.35;
    }
    return fresh;
  }

  coinPosition(i: number, j: number, out: THREE.Vector3, s = 0): THREE.Vector3 {
    const c = this.coinAt.get(this.index(i, j, s));
    return c ? out.copy(c.obj.position) : out.set(i + 0.5, 0, j + 0.5);
  }

  /** Pone un modelo en la planta que se está construyendo. */
  private add(name: string, x: number, y: number, z: number, opts?: { cloneMaterials?: boolean }): THREE.Object3D {
    const o = this.assets.clone(name, opts);
    o.position.set(x, y, z);
    this.storyGroups[this.buildStory].add(o);
    return o;
  }

  private build() {
    const solidList: Solid[] = [];
    // las texturas ya llevan color: aquí solo tintes suaves
    const cFloorA = new THREE.Color(0xffffff);
    const cFloorB = new THREE.Color(0xf2ebe0);
    const cWall = new THREE.Color(0xffffff);
    const cWallB = new THREE.Color(0xeeebf5);
    const cFire = new THREE.Color(0x8a4a40);
    const cIce = new THREE.Color(0xffffff);
    const cJump = new THREE.Color(0xf2e9f4);
    const cSwitch = new THREE.Color(0xc4bed6);
    const cCrackA = new THREE.Color(0xb9ada0);
    const cCrackB = new THREE.Color(0xaa9e92);
    const fireCells: FireCell[] = [];

    for (let s = 0; s < this.stories; s++) for (let j = 0; j < this.d; j++) {
      for (let i = 0; i < this.w; i++) {
        this.buildStory = s;
        const idx = this.index(i, j, s);
        const c = this.cells[idx];
        if (c.kind === 'void') continue;
        const checker = (i + j + s) % 2 === 0 ? cFloorA : cFloorB;
        const x = i + 0.5, z = j + 0.5;
        const foot = s === 0 ? BOTTOM : c.bottom;
        // casilla de suelo o muro de esta planta (con su columna hasta abajo o solo la losa)
        const solids = { push: (o: { i: number; j: number; top: number; color: THREE.Color; set: BlockSet }) => solidList.push({ ...o, s, foot: this.showcase ? o.top - SLAB_H : foot }) };
        switch (c.kind) {
          case 'wall':
            solids.push({ i, j, top: c.top, color: (i + j) % 2 === 0 ? cWall : cWallB, set: 'wall' });
            break;
          case 'fire': case 'firet':
            solids.push({ i, j, top: c.base, color: cFire, set: 'floor' });
            fireCells.push({ i, j, base: c.base, timed: c.kind === 'firet' });
            this.add('fire_grate', x, c.base, z);
            break;
          case 'ice': solids.push({ i, j, top: c.base, color: cIce, set: 'ice' }); break;
          case 'wedge':
            // muro en diagonal: parte al limo que lo embiste de frente (ver buildShapes y addWedge)
            this.shapes.push({ i, j, c });
            this.addWedge(idx, i, j, c);
            break;
          case 'ramp': case 'slab': case 'hole':
            // geometría propia (rampa, media casilla, losa con agujero): ver buildShapes
            this.shapes.push({ i, j, c });
            break;
          case 'exit':
            // no se marca: el limo que cae por un agujero se ve caer desde arriba (en el creador sí, para distinguirla)
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            if (this.showcase) this.addMark(x, c.base, z, 'exit');
            break;
          case 'seesaw':
            // la tabla se monta aparte (buildSeesaws); la casilla no lleva bloque
            break;
          case 'spinner':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.addSpinner(x, c.base, z);
            break;
          case 'cannon':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.addCannon(i, j, c);
            break;
          case 'target':
            // como las salidas de agujero, no se marca: se ve adónde apunta el cañón (en el creador sí)
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            if (this.showcase) this.addMark(x, c.base, z, 'target');
            break;
          case 'crack': {
            // losa de roca más gris con grietas oscuras encima
            solids.push({ i, j, top: c.base, color: (i + j) % 2 === 0 ? cCrackA : cCrackB, set: 'crack' });
            const lines = this.add('crack_lines', x, c.base, z);
            lines.rotation.y = ((i * 3 + j * 5) % 4) * (Math.PI / 2);
            this.crackOverlays.set(idx, lines);
            break;
          }
          case 'jump': {
            // suelo normal debajo; la tapa queda elevada sobre el muelle (la física usa c.top)
            solids.push({ i, j, top: c.base, color: cJump, set: 'floor' });
            const obj = this.add('jump_pad', x, c.top, z);
            this.pads.set(idx, {
              plate: Assets.child(obj, 'jump_pad_plate'),
              spring: Assets.child(obj, 'jump_pad_spring'),
              offset: 0, vel: 0, cooldown: 0,
            });
            break;
          }
          case 'switch':
            solids.push({ i, j, top: c.base, color: cSwitch, set: 'floor' });
            this.addSwitch(i, j, c);
            break;
          case 'door':
            // suelto, la puerta es el bloque (sin suelo debajo)
            if (!this.showcase) solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.addDoor(i, j, s, c);
            break;
          case 'start':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.start.set(x, c.base, z);
            this.startIdx = idx;
            break;
          case 'treasure':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.treasure.set(x, c.base, z);
            this.addChest(x, c.base, z);
            break;
          case 'coin': case 'gem': case 'oil': case 'relic':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.addCoin(idx, i, j, c.base, c.kind);
            break;
          case 'plant': case 'iceblock': {
            if (!this.showcase) solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            const obj = this.add(c.kind === 'plant' ? 'plant_block' : 'ice_block', x, c.base, z);
            obj.rotation.y = ((i * 7 + j * 3) % 4) * (Math.PI / 2);
            this.breakables.set(idx, { obj, kind: c.kind, broken: false, t: 0 });
            break;
          }
          case 'fan': {
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            const obj = this.add('fan', x, c.base, z);
            // el modelo sopla hacia +Z (hacia la cámara)
            obj.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[c.dir ?? 's'];
            this.fans.push({ blades: Assets.child(obj, 'fan_blades'), i, j, s, dir: c.dir ?? 's', base: c.base });
            break;
          }
          case 'coldjet':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.add('cold_vent', x, c.base, z);
            this.coldCells.push(idx);
            break;
          case 'station':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            break;
          case 'rail':
            c.top = RAIL_FENCE; // no se dibuja bloque: la vía se monta en buildRails
            break;
          case 'spike': {
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            const bed = this.add('spike_bed', x, c.base, z);
            bed.rotation.y = ((i * 5 + j * 3) % 4) * (Math.PI / 2);
            break;
          }
          default: solids.push({ i, j, top: c.top, color: checker, set: 'floor' });
        }
      }
    }

    this.buildStory = 0;
    this.buildBlocks(solidList);
    this.buildShapes();
    this.buildSeesaws();
    this.linkHoles();
    this.buildRails();
    this.linkCannons();
    this.buildWind();
    this.buildMist();

    if (fireCells.length) {
      const spots = new Map<string, { x: number; y: number; z: number; cells: FireCell[] }>();
      for (const c of fireCells) {
        const key = `${Math.floor(c.i / 3)},${Math.floor(c.j / 3)},${Math.floor(c.base / STORY_H)}`;
        let spot = spots.get(key);
        if (!spot) spots.set(key, (spot = { x: 0, y: 0, z: 0, cells: [] }));
        spot.cells.push(c);
        spot.x += c.i + 0.5; spot.y += c.base; spot.z += c.j + 0.5;
      }
      for (const spot of spots.values()) {
        const k = spot.cells.length;
        spot.x /= k; spot.y /= k; spot.z /= k;
        this.fireSpots.push(spot);
      }
      this.fire = new FireFx(fireCells, this.assets);
      this.group.add(this.fire.group);
    }

    for (const [ch, sw] of this.switches) {
      sw.need = this.def.need?.[ch] ?? 1;
      sw.latch = !!this.def.latch?.[ch];
      const cx = sw.buttons.reduce((a, p) => a + p.parent!.position.x, 0) / sw.buttons.length;
      const cz = sw.buttons.reduce((a, p) => a + p.parent!.position.z, 0) / sw.buttons.length;
      sw.label.position.set(cx, sw.buttons[0].parent!.position.y + 1.6, cz);
      this.updateLabel(sw);
    }
  }

  /** Solo en el creador (bloque suelto): marca encima de la salida de agujero (anillo) y de la diana, que en el juego no se ven. */
  private addMark(x: number, y: number, z: number, kind: 'exit' | 'target') {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const rings: [number, string][] = kind === 'target'
      ? [[56, '#dc2626'], [42, '#fff7ed'], [28, '#dc2626'], [14, '#fff7ed'], [6, '#dc2626']]
      : [[54, '#7c3aed'], [42, '#1e1b4b'], [22, '#a78bfa']];
    for (const [r, color] of rings) {
      g.fillStyle = color;
      g.beginPath();
      g.arc(64, 64, r, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const geo = new THREE.PlaneGeometry(0.78, 0.78);
    const mark = new THREE.Mesh(geo, mat);
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(x, y + 0.01, z);
    mark.renderOrder = 2;
    this.ownedMaterials.push(mat);
    this.ownedGeometries.push(geo);
    this.group.add(mark);
  }

  /**
    Bloques en pocos draw calls (losa + columna por grupo): suelo con losas y oclusión junto a paredes,
    hielo brillante y muros de ladrillo. Solo proyectan sombra los muros y los suelos elevados.
  */
  private buildBlocks(solids: Solid[]) {
    const a = this.assets;
    const b = this.biome;
    // el metal brilla más; la arena y la nieve, menos
    const shine = b === 'tech' ? 2.2 : b === 'desert' ? 0.7 : 1;
    const floorTop = createBlockMaterial({ top: a.surface('floor', b), side: a.surface('stone_side', b), ao: true, shininess: 28 * shine, specular: 0x6a5c4c });
    const floorCol = createBlockMaterial({ top: a.surface('floor', b), side: a.surface('stone_side', b), shininess: 18 * shine, specular: 0x3a3028 });
    const iceTop = createBlockMaterial({ top: a.surface('ice'), side: a.surface('ice'), ao: true, shininess: 110, specular: 0xd8f0ff, bump: 0.6 });
    const wallMat = createBlockMaterial({ top: a.surface('wall_top', b), side: a.surface('brick', b), shininess: 22 * shine, specular: 0x4a4658, bump: 1.2 });
    this.ownedMaterials.push(floorTop, floorCol, iceTop, wallMat);
    const raised = solids.some((s) => s.set !== 'wall' && s.top > 0);

    const make = (set: BlockSet, story: number, topMat: THREE.Material, colMat: THREE.Material) => {
      const list = solids.filter((s) => s.set === set && s.s === story);
      if (!list.length) return;
      const topGeo = a.geometry('block_top').clone();
      const ao = new Float32Array(list.length);
      const tops = new THREE.InstancedMesh(topGeo, topMat, list.length);
      const cols = new THREE.InstancedMesh(a.geometry('block_column'), colMat, list.length);
      const m = new THREE.Matrix4();
      const colColor = new THREE.Color();
      list.forEach((s, k) => {
        m.makeTranslation(s.i + 0.5, s.top, s.j + 0.5);
        // bloque suelto: la losa estirada hace todo el cubo, sin la junta con la columna
        if (this.showcase) m.scale(SHOWCASE_STRETCH);
        tops.setMatrixAt(k, m);
        tops.setColorAt(k, s.color);
        // en las plantas de arriba el suelo es solo la losa (la columna no llega a nada)
        const h = Math.max(0.001, s.top - SLAB_H - s.foot);
        m.makeScale(1, h, 1);
        m.setPosition(s.i + 0.5, s.top - SLAB_H, s.j + 0.5);
        cols.setMatrixAt(k, m);
        cols.setColorAt(k, colColor.copy(s.color).multiplyScalar(0.9));
        if (set !== 'wall') ao[k] = this.aoMask(s.i, s.j, s.top, story);
      });
      topGeo.setAttribute('aAO', new THREE.InstancedBufferAttribute(ao, 1));
      this.ownedGeometries.push(topGeo);
      const index = new Map<number, number>();
      list.forEach((s, k) => index.set(this.index(s.i, s.j, story), k));
      this.batches.set(`${set}:${story}`, { tops, cols, index, list });
      for (const im of [tops, cols]) {
        im.receiveShadow = true;
        im.castShadow = set === 'wall' || raised || story > 0;
        // las losas que caen salen de la caja calculada al construir
        if (set === 'ice' || set === 'crack') im.frustumCulled = false;
        this.storyGroups[story].add(im);
      }
    };
    this.floorTopMat = floorTop;
    for (let story = 0; story < this.stories; story++) {
      make('floor', story, floorTop, floorCol);
      make('ice', story, iceTop, floorCol);
      make('crack', story, floorTop, floorCol);
      make('wall', story, wallMat, wallMat);
    }
  }

  /**
    Rampas, medias casillas diagonales y losas con agujero: una sola malla con posiciones del mundo y el mismo
    material que el suelo (texturas por posición: la cara de arriba usa la del suelo y los lados la de piedra).
  */
  private buildShapes() {
    for (let story = 0; story < this.stories; story++) this.buildShapesOf(story);
  }

  private buildShapesOf(story: number) {
    const shapes = this.shapes.filter((sh) => sh.c.story === story);
    if (!shapes.length || !this.floorTopMat) return;
    const BOTTOM = story === 0 ? -1.2 : 0;
    const pos: number[] = [];
    const nor: number[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
    type P = [number, number, number];
    const tri = (p0: P, p1: P, p2: P, hint: P) => {
      a.set(...p0); b.set(...p1); c.set(...p2);
      n.copy(b).sub(a).cross(e.copy(c).sub(a)).normalize();
      if (n.x * hint[0] + n.y * hint[1] + n.z * hint[2] < 0) { const t = b.clone(); b.copy(c); c.copy(t); n.negate(); }
      for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); }
    };
    const quad = (p0: P, p1: P, p2: P, p3: P, hint: P) => { tri(p0, p1, p2, hint); tri(p0, p2, p3, hint); };
    let foot = BOTTOM;
    const wall = (x0: number, z0: number, y0: number, x1: number, z1: number, y1: number, hint: P) =>
      quad([x0, y0, z0], [x1, y1, z1], [x1, foot, z1], [x0, foot, z0], hint);

    for (const { i, j, c: cell } of shapes) {
      // planta 0: hasta el fondo; de arriba: solo el grosor de la losa
      foot = this.showcase ? (cell.kind === 'ramp' ? cell.base : cell.base - 1) : story === 0 ? BOTTOM : cell.bottom;
      const x0 = i, x1 = i + 1, z0 = j, z1 = j + 1;
      if (cell.kind === 'ramp') {
        const h = (x: number, z: number) => this.topAt(cell, i, j, x, z);
        const A: P = [x0, h(x0, z0), z0], B: P = [x1, h(x1, z0), z0], C: P = [x1, h(x1, z1), z1], D: P = [x0, h(x0, z1), z1];
        quad(A, B, C, D, [0, 1, 0]);
        wall(x0, z0, A[1], x1, z0, B[1], [0, 0, -1]);
        wall(x1, z1, C[1], x0, z1, D[1], [0, 0, 1]);
        wall(x0, z1, D[1], x0, z0, A[1], [-1, 0, 0]);
        wall(x1, z0, B[1], x1, z1, C[1], [1, 0, 0]);
      } else if (cell.kind === 'wedge') {
        // suelo de la casilla y, encima, media casilla de muro cortada por la diagonal
        const y = cell.base, h = cell.top;
        quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0]);
        const A: P = [x0, h, z0], B: P = [x1, h, z0], C: P = [x1, h, z1], D: P = [x0, h, z1];
        const keep = cell.corner;
        const face = (px0: number, pz0: number, px1: number, pz1: number, hint: P) => {
          quad([px0, h, pz0], [px1, h, pz1], [px1, y, pz1], [px0, y, pz0], hint);
        };
        if (keep === 'nw') { tri(A, B, D, [0, 1, 0]); face(x0, z0, x1, z0, [0, 0, -1]); face(x0, z1, x0, z0, [-1, 0, 0]); face(x1, z0, x0, z1, [1, 0, 1]); }
        if (keep === 'ne') { tri(A, B, C, [0, 1, 0]); face(x0, z0, x1, z0, [0, 0, -1]); face(x1, z0, x1, z1, [1, 0, 0]); face(x0, z0, x1, z1, [-1, 0, 1]); }
        if (keep === 'sw') { tri(A, C, D, [0, 1, 0]); face(x0, z1, x0, z0, [-1, 0, 0]); face(x1, z1, x0, z1, [0, 0, 1]); face(x0, z0, x1, z1, [1, 0, -1]); }
        if (keep === 'se') { tri(B, C, D, [0, 1, 0]); face(x1, z0, x1, z1, [1, 0, 0]); face(x1, z1, x0, z1, [0, 0, 1]); face(x1, z0, x0, z1, [-1, 0, -1]); }
      } else if (cell.kind === 'slab') {
        const y = cell.base;
        const A: P = [x0, y, z0], B: P = [x1, y, z0], C: P = [x1, y, z1], D: P = [x0, y, z1];
        const corner = cell.corner;
        if (corner === 'nw') { tri(A, B, D, [0, 1, 0]); wall(x0, z0, y, x1, z0, y, [0, 0, -1]); wall(x0, z1, y, x0, z0, y, [-1, 0, 0]); wall(x1, z0, y, x0, z1, y, [1, 0, 1]); }
        if (corner === 'ne') { tri(A, B, C, [0, 1, 0]); wall(x0, z0, y, x1, z0, y, [0, 0, -1]); wall(x1, z0, y, x1, z1, y, [1, 0, 0]); wall(x0, z0, y, x1, z1, y, [-1, 0, 1]); }
        if (corner === 'sw') { tri(A, C, D, [0, 1, 0]); wall(x0, z1, y, x0, z0, y, [-1, 0, 0]); wall(x1, z1, y, x0, z1, y, [0, 0, 1]); wall(x0, z0, y, x1, z1, y, [1, 0, -1]); }
        if (corner === 'se') { tri(B, C, D, [0, 1, 0]); wall(x1, z0, y, x1, z1, y, [1, 0, 0]); wall(x1, z1, y, x0, z1, y, [0, 0, 1]); wall(x1, z0, y, x0, z1, y, [-1, 0, -1]); }
      } else {
        // losa con agujero redondo: anillo de arriba, cuatro lados y el tubo interior hacia abajo
        const y = cell.base, cx = i + 0.5, cz = j + 0.5, N = 24;
        for (let k = 0; k < N; k++) {
          const t0 = (k / N) * Math.PI * 2, t1 = ((k + 1) / N) * Math.PI * 2;
          const r0 = 0.5 / Math.max(Math.abs(Math.cos(t0)), Math.abs(Math.sin(t0)));
          const r1 = 0.5 / Math.max(Math.abs(Math.cos(t1)), Math.abs(Math.sin(t1)));
          const p0: P = [cx + Math.cos(t0) * HOLE_R, y, cz + Math.sin(t0) * HOLE_R];
          const p1: P = [cx + Math.cos(t1) * HOLE_R, y, cz + Math.sin(t1) * HOLE_R];
          quad(p0, p1, [cx + Math.cos(t1) * r1, y, cz + Math.sin(t1) * r1], [cx + Math.cos(t0) * r0, y, cz + Math.sin(t0) * r0], [0, 1, 0]);
          quad(p0, p1, [p1[0], foot, p1[2]], [p0[0], foot, p0[2]], [cx - (p0[0] + p1[0]) / 2, 0, cz - (p0[2] + p1[2]) / 2]);
        }
        wall(x0, z0, y, x1, z0, y, [0, 0, -1]);
        wall(x1, z1, y, x0, z1, y, [0, 0, 1]);
        wall(x0, z1, y, x0, z0, y, [-1, 0, 0]);
        wall(x1, z0, y, x1, z1, y, [1, 0, 0]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('aAO', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
    this.ownedGeometries.push(geo);
    const mesh = new THREE.Mesh(geo, this.floorTopMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.storyGroups[story].add(mesh);
  }

  /** Cada agujero lleva a la salida más cercana, prefiriendo las que están más abajo. */
  private linkHoles() {
    const holes: number[] = [], exits: number[] = [];
    this.cells.forEach((c, idx) => { if (c.kind === 'hole') holes.push(idx); else if (c.kind === 'exit') exits.push(idx); });
    if (!holes.length || !exits.length) return;
    for (const h of holes) {
      const hx = this.colOf(h), hz = this.rowOf(h), hb = this.cells[h].base;
      let best = -1, bestScore = Infinity;
      for (const x of exits) {
        const d = Math.hypot(this.colOf(x) - hx, this.rowOf(x) - hz);
        const score = d + (this.cells[x].base < hb ? 0 : 1000);
        if (score < bestScore) { bestScore = score; best = x; }
      }
      this.holeExits.set(h, new THREE.Vector3(this.colOf(best) + 0.5, this.cells[best].base, this.rowOf(best) + 0.5));
    }
  }

  /** Plataforma giratoria: disco con gajos de colores y borde, un poco por encima del suelo. */
  private addCannon(i: number, j: number, c: Cell) {
    const iron = new THREE.MeshStandardMaterial({ color: 0x323a4a, metalness: 0.55, roughness: 0.42, side: THREE.DoubleSide });
    const bronze = new THREE.MeshStandardMaterial({ color: 0xc28b2c, metalness: 0.7, roughness: 0.3 });
    const base = new THREE.CylinderGeometry(0.44, 0.5, 0.3, 24).translate(0, 0.15, 0);
    const tube = new THREE.CylinderGeometry(0.3, 0.37, CANNON_LEN, 24, 1, true).translate(0, CANNON_LEN / 2, 0);
    const ring = new THREE.TorusGeometry(0.31, 0.055, 8, 24).rotateX(Math.PI / 2).translate(0, CANNON_LEN, 0);
    const band = new THREE.TorusGeometry(0.46, 0.04, 8, 24).rotateX(Math.PI / 2).translate(0, 0.3, 0);
    this.ownedMaterials.push(iron, bronze);
    this.ownedGeometries.push(base, tube, ring, band);
    const x = i + 0.5, z = j + 0.5;
    const root = new THREE.Group();
    root.position.set(x, c.base, z);
    root.add(new THREE.Mesh(base, iron), new THREE.Mesh(band, bronze));
    const pivot = new THREE.Group();
    pivot.position.y = 0.3;
    const tilt = new THREE.Group();
    tilt.rotation.x = CANNON_TILT;
    const barrel = new THREE.Group();
    barrel.add(new THREE.Mesh(tube, iron), new THREE.Mesh(ring, bronze));
    tilt.add(barrel);
    pivot.add(tilt);
    root.add(pivot);
    root.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.storyGroups[c.story].add(root);
    const cannon: Cannon = { idx: this.index(i, j, c.story), x, z, top: c.top, tx: NaN, ty: NaN, tz: NaN, pivot, barrel, kick: 0, loaded: false };
    this.cannons.push(cannon);
    this.cannonByIdx.set(cannon.idx, cannon);
  }

  private linkCannons() {
    if (!this.cannons.length) return;
    const targets = cannonTargets(this.def);
    for (const c of this.cannons) {
      const t = targets.get(c.idx) ?? -1;
      if (t < 0) continue;
      c.tx = this.colOf(t) + 0.5;
      c.tz = this.rowOf(t) + 0.5;
      c.ty = this.cells[t].top;
      c.pivot.rotation.y = Math.atan2(c.tx - c.x, c.tz - c.z);
    }
  }

  /** Cañón de la casilla, si lo hay. */
  cannonAt(i: number, j: number, s = 0): Cannon | null {
    if (i < 0 || j < 0 || i >= this.w || j >= this.d) return null;
    return this.cannonByIdx.get(this.index(i, j, s)) ?? null;
  }

  /** Boca del tubo: donde asoma el limo cargado y desde donde sale disparado. */
  cannonMuzzle(c: Cannon, out: THREE.Vector3): THREE.Vector3 {
    const yaw = c.pivot.rotation.y;
    const reach = Math.sin(CANNON_TILT) * CANNON_LEN;
    return out.set(c.x + Math.sin(yaw) * reach, c.top + Math.cos(CANNON_TILT) * CANNON_LEN, c.z + Math.cos(yaw) * reach);
  }

  private addGem(x: number, y: number, z: number): THREE.Object3D {
    if (!this.gemMesh) {
      const look = GEM_LOOK[GEM_OF_BIOME[this.biome]];
      const geo = gemGeometry();
      const mat = new THREE.MeshStandardMaterial({ color: look.color, emissive: look.emissive, emissiveIntensity: 0.8, metalness: 0.25, roughness: 0.06, flatShading: true });
      mat.envMapIntensity = 2.2;
      this.ownedGeometries.push(geo);
      this.ownedMaterials.push(mat);
      this.gemMesh = { geo, mat };
    }
    const m = new THREE.Mesh(this.gemMesh.geo, this.gemMesh.mat);
    m.castShadow = true;
    m.position.set(x, y, z);
    this.storyGroups[this.buildStory].add(m);
    return m;
  }

  /**
    Balancines: cada fila (o columna) seguida de casillas de balancín es una tabla sobre su eje central.
    La tabla se inclina hacia donde pesa el limo y, cuanto más inclinada, más resbala hacia el lado bajo.
  */
  private buildSeesaws() {
    for (let st = 0; st < this.stories; st++) {
      const seen = new Set<number>();
      for (let j = 0; j < this.d; j++) {
        for (let i = 0; i < this.w; i++) {
          const idx = this.index(i, j, st);
          const c = this.cells[idx];
          if (c.kind !== 'seesaw' || seen.has(idx)) continue;
          // todas las casillas de balancín pegadas entre sí (con el mismo eje y altura) son una sola tabla
          const axis: 'x' | 'z' = c.axis === 'z' ? 'z' : 'x';
          const cells: number[] = [];
          const queue = [[i, j]];
          seen.add(idx);
          let i0 = i, i1 = i, j0 = j, j1 = j;
          while (queue.length) {
            const [qi, qj] = queue.shift()!;
            cells.push(this.index(qi, qj, st));
            i0 = Math.min(i0, qi); i1 = Math.max(i1, qi);
            j0 = Math.min(j0, qj); j1 = Math.max(j1, qj);
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const ni = qi + di, nj = qj + dj;
              const n = this.cell(ni, nj, st);
              if (!n || n.kind !== 'seesaw' || n.base !== c.base) continue;
              const nAxis = n.axis === 'z' ? 'z' : 'x';
              if (nAxis !== axis) continue;
              const nIdx = this.index(ni, nj, st);
              if (seen.has(nIdx)) continue;
              seen.add(nIdx);
              queue.push([ni, nj]);
            }
          }
          const len = (axis === 'x' ? i1 - i0 : j1 - j0) + 1;
          const wide = (axis === 'x' ? j1 - j0 : i1 - i0) + 1;
          const px = (i0 + i1) / 2 + 0.5, pz = (j0 + j1) / 2 + 0.5;
          const see: Seesaw = { cells, axis, base: c.base, px, pz, len, tilt: 0, vel: 0, load: 0, torque: 0, obj: null };
          const plank = this.add('seesaw_plank', px, c.base, pz);
          plank.rotation.order = 'YZX';
          plank.rotation.y = axis === 'z' ? Math.PI / 2 : 0;
          plank.scale.set(len, 1, wide);
          see.obj = plank;
          // un caballete por cada casilla de ancho, bajo el eje
          for (let k = 0; k < wide; k++) {
            const ox = axis === 'x' ? 0 : k - (wide - 1) / 2;
            const oz = axis === 'x' ? k - (wide - 1) / 2 : 0;
            this.add('seesaw_pivot', px + ox, c.base, pz + oz).rotation.y = plank.rotation.y;
          }
          for (const k of cells) {
            this.seesawAt.set(k, see);
            // la casilla llega como mucho a lo alto de la tabla: así el limo choca con ella y no la atraviesa
            this.cells[k].top = c.base + SEESAW_MAX * (len / 2);
          }
          this.seesaws.push(see);
        }
      }
    }
  }

  /** Altura de la tabla en un punto (y su pendiente): sube o baja según lo inclinada que esté. */
  private seesawTop(see: Seesaw, x: number, z: number) {
    const off = see.axis === 'x' ? x - see.px : z - see.pz;
    return see.base + see.tilt * off;
  }

  /** El limo se apoya en un balancín: pesa en ese punto (y luego resbala hacia el lado bajo). */
  pressSeesaw(idx: number, x: number, z: number, w = 1) {
    const see = this.seesawAt.get(idx);
    if (!see) return;
    see.load += w;
    see.torque += w * (see.axis === 'x' ? x - see.px : z - see.pz);
  }

  /** Pendiente del balancín de esta casilla (hacia dónde resbala el limo), o null. */
  seesawSlope(idx: number): [number, number] | null {
    const see = this.seesawAt.get(idx);
    if (!see) return null;
    return see.axis === 'x' ? [see.tilt, 0] : [0, see.tilt];
  }

  private updateSeesaws(dt: number) {
    for (const see of this.seesaws) {
      // el peso del limo la empuja; sin nadie encima vuelve despacio a su sitio
      const arm = see.len / 2;
      // el lado donde pesa el limo baja
      const want = see.load > 0 ? -Math.max(-1, Math.min(1, see.torque / (arm * Math.max(1, see.load)))) * SEESAW_MAX : 0;
      const k = see.load > 0 ? SEESAW_SPRING : SEESAW_SPRING * 0.45;
      see.vel += (want - see.tilt) * k * dt;
      see.vel *= Math.exp(-SEESAW_DAMP * dt);
      see.tilt = Math.max(-SEESAW_MAX, Math.min(SEESAW_MAX, see.tilt + see.vel * dt));
      see.load = 0;
      see.torque = 0;
      if (!see.obj) continue;
      // la tabla se dibuja inclinada: el lado con más peso baja
      see.obj.rotation.z = (see.axis === 'x' ? 1 : -1) * Math.atan(see.tilt);
    }
  }

  private addSpinner(x: number, y: number, z: number) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    for (let k = 0; k < 12; k++) {
      g.beginPath();
      g.moveTo(128, 128);
      g.arc(128, 128, 128, (k / 12) * Math.PI * 2, ((k + 1) / 12) * Math.PI * 2);
      g.fillStyle = k % 2 ? '#f5d0fe' : '#c026d3';
      g.fill();
    }
    g.beginPath(); g.arc(128, 128, 30, 0, Math.PI * 2); g.fillStyle = '#fdf4ff'; g.fill();
    g.lineWidth = 10; g.strokeStyle = '#701a75'; g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
    const side = new THREE.MeshStandardMaterial({ color: 0x701a75, roughness: 0.6 });
    const geo = new THREE.CylinderGeometry(SPINNER_R, SPINNER_R, 0.1, 48);
    this.ownedMaterials.push(top, side);
    this.ownedGeometries.push(geo);
    const disc = new THREE.Mesh(geo, [side, top, side]);
    disc.position.set(x, y + 0.03, z);
    disc.receiveShadow = true;
    this.storyGroups[this.buildStory].add(disc);
    this.spinners.push({ x, z, y, disc });
  }

  /** Plataforma giratoria bajo el punto (x, z), si lo hay. */
  spinnerAt(x: number, z: number, y: number) {
    for (const s of this.spinners) {
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < SPINNER_R * SPINNER_R && Math.abs(y - s.y) < 0.6) return s;
    }
    return null;
  }

  private addCoin(idx: number, i: number, j: number, base: number, kind: string) {
    const type: PickupType = kind === 'gem' ? 'gem' : kind === 'oil' ? 'oil' : kind === 'relic' ? 'relic' : 'coin';
    const gem = type === 'gem';
    const relic = type === 'relic';
    const y = base + (type === 'coin' ? 0.55 : type === 'oil' ? 0.12 : relic ? 0.3 : 0.62);
    const obj = gem ? this.addGem(i + 0.5, y, j + 0.5) : relic ? this.addRelic(i + 0.5, y, j + 0.5)
      : this.add(type === 'coin' ? 'coin' : 'oil_bottle', i + 0.5, y, j + 0.5);
    if (gem || relic || type === 'oil') {
      // halo del color de la gema (rosa el coleccionable) bajo ella para que se vea desde lejos
      const color = gem ? GEM_LOOK[GEM_OF_BIOME[this.biome]].glow : relic ? 0xf472b6 : 0xf5a524;
      const glowMat = createGlowMaterial(color, this.timeUniform, gem || relic ? 1 : 0.8);
      this.ownedMaterials.push(glowMat);
      const glow = new THREE.Mesh(this.assets.geometry('fire_glow'), glowMat);
      glow.position.set(i + 0.5, base + 0.02, j + 0.5);
      const size = gem ? 2.4 : relic ? 2.6 : 1.8;
      glow.scale.set(size, 1, size);
      glow.renderOrder = 2;
      this.storyGroups[this.buildStory].add(glow);
      obj.userData.glow = glow;
    }
    const coin: Coin = { type, i, j, obj, baseY: y, collected: false, t: 0 };
    this.coins.push(coin);
    this.coinAt.set(idx, coin);
  }

  /** El coleccionable de este piso (su modelo del salón, encogido para caber en la casilla); sin dueño, un orbe. */
  private addRelic(x: number, y: number, z: number): THREE.Object3D {
    const found = COLLECTIBLES.find((c) => c.unlock.kind === 'found' && c.unlock.floor === this.def.id);
    const model = this.assets.clone(found && this.assets.has(found.id) ? found.id : 'col_blue_orb');
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const mid = box.getCenter(new THREE.Vector3());
    const scale = 0.62 / Math.max(size.x, size.y, size.z, 1e-3);
    model.scale.setScalar(scale);
    model.position.set(-mid.x * scale, -box.min.y * scale, -mid.z * scale);
    const holder = new THREE.Group();
    holder.add(model);
    holder.position.set(x, y, z);
    this.storyGroups[this.buildStory].add(holder);
    return holder;
  }

  /** Corriente de cada ventilador: avanza por casillas (también sobre el vacío) hasta chocar con algo alto. */
  /**
    Puntos del recorrido de una vía (de la estación a hacia b): centros de casilla y, en los tramos con forma,
    un bucle vertical (lift = altura extra) o una espiral de dos vueltas alrededor de la casilla.
  */
  private railPoints(cellsPath: number[]) {
    const xs: number[] = [], zs: number[] = [], lift: number[] = [];
    const center = (idx: number): [number, number] => [this.colOf(idx) + 0.5, this.rowOf(idx) + 0.5];
    cellsPath.forEach((idx, k) => {
      const [cx, cz] = center(idx);
      const shape = this.cells[idx].shape;
      const ends = k === 0 || k === cellsPath.length - 1;
      if (!shape && !ends) {
        const [px, pz] = center(cellsPath[k - 1]);
        const [nx, nz] = center(cellsPath[k + 1]);
        const inx = Math.sign(cx - px), inz = Math.sign(cz - pz);
        const outx = Math.sign(nx - cx), outz = Math.sign(nz - cz);
        if (inx !== outx || inz !== outz) {
          // codo: en vez de una esquina en pico, un cuarto de vuelta de media casilla que entra y sale por el medio de la arista
          const ax = cx - inx * 0.5 + outx * 0.5, az = cz - inz * 0.5 + outz * 0.5;
          const a0 = Math.atan2((cz - inz * 0.5) - az, (cx - inx * 0.5) - ax);
          let a1 = Math.atan2((cz + outz * 0.5) - az, (cx + outx * 0.5) - ax);
          while (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
          while (a1 - a0 < -Math.PI) a1 += Math.PI * 2;
          const N = 6;
          for (let q = 0; q <= N; q++) {
            const a = a0 + (a1 - a0) * (q / N);
            xs.push(ax + Math.cos(a) * 0.5);
            zs.push(az + Math.sin(a) * 0.5);
            lift.push(0);
          }
          return;
        }
      }
      if (!shape || ends) { xs.push(cx); zs.push(cz); lift.push(0); return; }
      const [px, pz] = center(cellsPath[k - 1]);
      const [nx, nz] = center(cellsPath[k + 1]);
      if (shape === 'loop') {
        // bucle vertical grande en la dirección de avance (cabe la vagoneta), desplazado a un lado lo justo
        // para que la entrada y la salida no se pisen con la vía ancha
        const dx = nx - px, dz = nz - pz, dl = Math.hypot(dx, dz) || 1;
        const fx = dx / dl, fz = dz / dl, sx = -fz, sz = fx;
        const LR = 1.15, N = 40;
        for (let q = 0; q <= N; q++) {
          const t = (q / N) * Math.PI * 2;
          const side = (q / N - 0.5) * 0.9;
          xs.push(cx + fx * LR * Math.sin(t) + sx * side);
          zs.push(cz + fz * LR * Math.sin(t) + sz * side);
          lift.push(LR * (1 - Math.cos(t)));
        }
      } else {
        // espiral: entra por el lado de la casilla anterior y sale por el de la siguiente tras dos vueltas
        const SR = 0.75, TURNS = 2, N = 44;
        const a0 = Math.atan2(pz - cz, px - cx);
        let a1 = Math.atan2(nz - cz, nx - cx);
        while (a1 <= a0) a1 += Math.PI * 2;
        const sweep = a1 - a0 + TURNS * Math.PI * 2;
        for (let q = 0; q <= N; q++) {
          const a = a0 + (q / N) * sweep;
          xs.push(cx + Math.cos(a) * SR);
          zs.push(cz + Math.sin(a) * SR);
          lift.push(0);
        }
      }
    });
    return { xs, zs, lift };
  }

  private buildRails() {
    const { paths, lifts } = traceRails(this.def);
    const shapes = new Map<string, { xs: number[]; zs: number[]; lift: number[] }>();
    this.buildLifts(lifts);
    for (const [from, cellsPath] of paths) {
      this.buildStory = this.storyOf(from);
      const to0 = cellsPath[cellsPath.length - 1];
      // mismo recorrido en los dos sentidos: se calcula de la estación menor a la mayor y la otra lo usa al revés
      const key = `${Math.min(from, to0)}-${Math.max(from, to0)}`;
      let pts = shapes.get(key);
      if (!pts) {
        pts = this.railPoints(from < to0 ? cellsPath : [...cellsPath].reverse());
        shapes.set(key, pts);
      }
      const order = from < to0 ? pts : { xs: [...pts.xs].reverse(), zs: [...pts.zs].reverse(), lift: [...pts.lift].reverse() };
      const n = order.xs.length;
      const xs = Float32Array.from(order.xs), zs = Float32Array.from(order.zs), ys = new Float32Array(n), dist = new Float32Array(n);
      for (let k = 1; k < n; k++) dist[k] = dist[k - 1] + Math.hypot(xs[k] - xs[k - 1], zs[k] - zs[k - 1], order.lift[k] - order.lift[k - 1]);
      const to = to0;
      const y0 = this.cells[from].base, y1 = this.cells[to].base;
      const total = dist[n - 1];
      for (let k = 0; k < n; k++) ys[k] = y0 + (y1 - y0) * (dist[k] / total) + order.lift[k];
      const ex = xs[n - 1] - xs[n - 2], ez = zs[n - 1] - zs[n - 2];
      const el = Math.hypot(ex, ez) || 1;
      this.rails.set(from, { from, to, xs, zs, ys, dist, total, exitX: ex / el, exitZ: ez / el });

      // estación: el arco queda de través a la vía
      const dx = xs[1] - xs[0], dz = zs[1] - zs[0];
      const st = this.add('rail_station', xs[0], y0, zs[0]);
      st.rotation.y = Math.atan2(-dx, -dz);
      if (from > to) continue; // cada vía se monta una sola vez
      this.addTrack(xs, zs, ys);
    }
    this.buildStory = 0;
  }

  /** Tramos de vía a lo largo de un recorrido. */
  private addTrack(xs: ArrayLike<number>, zs: ArrayLike<number>, ys: ArrayLike<number>) {
    // las traviesas van repartidas por la longitud de la vía, no por tramo: en las curvas los tramos son cortos
    let toTie = TIE_STEP / 2;
    for (let k = 0; k < xs.length - 1; k++) {
      const ax = xs[k], az = zs[k], bx = xs[k + 1], bz = zs[k + 1];
      const hx = bx - ax, hz = bz - az, hy = ys[k + 1] - ys[k];
      const flat = Math.hypot(hx, hz);
      const len = Math.hypot(flat, hy);
      const yaw = Math.atan2(-hz, hx), pitch = Math.atan2(hy, flat);
      const piece = this.add('rail_piece', (ax + bx) / 2, (ys[k] + ys[k + 1]) / 2, (az + bz) / 2);
      piece.rotation.order = 'YZX';
      piece.rotation.set(0, yaw, pitch);
      piece.scale.x = len + 0.02;
      for (let t = toTie; t < len; t += TIE_STEP) {
        const f = t / len;
        const tie = this.add('rail_tie', ax + hx * f, ys[k] + hy * f, az + hz * f);
        tie.rotation.order = 'YZX';
        tie.rotation.set(0, yaw, pitch);
      }
      toTie = len > 0 ? ((toTie - len) % TIE_STEP + TIE_STEP) % TIE_STEP : toTie;
    }
  }

  /**
    Ascensores entre plantas: dos estaciones una encima de otra. La bola sube (o baja) en espiral alrededor
    de la casilla y sale por el lado por el que entró.
  */
  private buildLifts(lifts: [number, number][]) {
    for (const [lo, hi] of lifts) {
      const cx = this.colOf(lo) + 0.5, cz = this.rowOf(lo) + 0.5;
      const y0 = this.cells[lo].base, y1 = this.cells[hi].base;
      const turns = Math.max(1, Math.round((y1 - y0) / 1.6));
      const RADIUS = 0.36, N = turns * 24;
      const xs: number[] = [cx], zs: number[] = [cz], ys: number[] = [y0];
      for (let q = 0; q <= N; q++) {
        const a = (q / N) * turns * Math.PI * 2 - Math.PI / 2;
        xs.push(cx + Math.cos(a) * RADIUS);
        zs.push(cz + Math.sin(a) * RADIUS);
        ys.push(y0 + (y1 - y0) * (q / N));
      }
      xs.push(cx); zs.push(cz); ys.push(y1);
      const make = (from: number, to: number, px: number[], pz: number[], py: number[]) => {
        const n = px.length;
        const dist = new Float32Array(n);
        for (let k = 1; k < n; k++) dist[k] = dist[k - 1] + Math.hypot(px[k] - px[k - 1], pz[k] - pz[k - 1], py[k] - py[k - 1]);
        // sale hacia la cámara (hacia +Z): el lado desde el que se suele llegar
        this.rails.set(from, { from, to, xs: Float32Array.from(px), zs: Float32Array.from(pz), ys: Float32Array.from(py), dist, total: dist[n - 1], exitX: 0, exitZ: 1 });
      };
      make(lo, hi, xs, zs, ys);
      make(hi, lo, [...xs].reverse(), [...zs].reverse(), [...ys].reverse());
      this.buildStory = this.storyOf(lo);
      this.add('rail_station', cx, y0, cz);
      this.addTrack(xs.slice(1, -1), zs.slice(1, -1), ys.slice(1, -1));
      this.buildStory = this.storyOf(hi);
      this.add('rail_station', cx, y1, cz);
    }
  }

  /** Vía que sale de la estación de esta casilla, si la hay. */
  railAt(i: number, j: number, s = 0): RailPath | null {
    if (i < 0 || j < 0 || i >= this.w || j >= this.d) return null;
    return this.rails.get(this.index(i, j, s)) ?? null;
  }

  private buildWind() {
    for (const f of this.fans) {
      const [dx, dz] = DIRS[f.dir];
      for (let k = 1; k <= WIND_LEN; k++) {
        const ci = f.i + dx * k, cj = f.j + dz * k;
        const cell = this.cell(ci, cj, f.s);
        if (!cell) break;
        if (cell.kind !== 'rail' && cell.top !== -Infinity && cell.top > f.base + 0.6) break;
        const idx = this.index(ci, cj, f.s);
        const pow = 1 - (k - 1) / (WIND_LEN + 1);
        this.windX[idx] += dx * pow;
        this.windZ[idx] += dz * pow;
        this.windBase[idx] = f.base;
        this.windCells.push({ i: ci, j: cj, dx, dz, base: f.base, pow });
      }
    }
    if (!this.windCells.length) return;
    const per = 3;
    const pos = new Float32Array(this.windCells.length * per * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({ color: 0xe6f4ff, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false });
    this.ownedMaterials.push(mat);
    this.ownedGeometries.push(geo);
    this.windFx = new THREE.Points(geo, mat);
    this.windFx.frustumCulled = false;
    this.group.add(this.windFx);
  }

  private buildMist() {
    if (!this.coldCells.length) return;
    const pos = new Float32Array(this.coldCells.length * 8 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({ color: 0xd9f6ff, size: 0.16, transparent: true, opacity: 0.6, depthWrite: false });
    this.ownedMaterials.push(mat);
    this.ownedGeometries.push(geo);
    this.mistFx = new THREE.Points(geo, mat);
    this.mistFx.frustumCulled = false;
    this.group.add(this.mistFx);
  }

  private updateEffects(dt: number) {
    for (const f of this.fans) f.blades.rotation.z += dt * 16;
    for (const s of this.saws) s.rotation.x -= dt * 14;
    for (const s of this.spinners) s.disc.rotation.y += dt * SPINNER_W;
    if (this.windFx) {
      const pos = (this.windFx.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      let w = 0;
      for (let k = 0; k < this.windCells.length; k++) {
        const c = this.windCells[k];
        for (let p = 0; p < 3; p++) {
          const phase = (this.time * (1.6 + c.pow) + p / 3 + (c.i * 0.37 + c.j * 0.61)) % 1;
          const side = (p - 1) * 0.28;
          pos[w++] = c.i + 0.5 + c.dx * (phase - 0.5) + (c.dz !== 0 ? side : 0);
          pos[w++] = c.base + 0.35 + p * 0.22 + Math.sin(this.time * 6 + p + k) * 0.04;
          pos[w++] = c.j + 0.5 + c.dz * (phase - 0.5) + (c.dx !== 0 ? side : 0);
        }
      }
      (this.windFx.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.mistFx) {
      const pos = (this.mistFx.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      let w = 0;
      for (const idx of this.coldCells) {
        const ci = this.colOf(idx), cj = this.rowOf(idx);
        const base = this.cells[idx].base;
        for (let p = 0; p < 8; p++) {
          const life = (this.time * 0.8 + p / 8) % 1;
          const a = p * 2.4 + this.time * 0.6;
          pos[w++] = ci + 0.5 + Math.cos(a) * 0.25 * (1 - life * 0.5);
          pos[w++] = base + 0.1 + life * 1.4;
          pos[w++] = cj + 0.5 + Math.sin(a) * 0.25 * (1 - life * 0.5);
        }
      }
      (this.mistFx.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    for (const b of this.breakables.values()) {
      if (!b.broken || !b.obj.visible) continue;
      b.t += dt;
      const k = Math.min(b.t / (b.kind === 'plant' ? 0.6 : 0.9), 1);
      if (b.kind === 'plant') {
        b.obj.scale.setScalar(Math.max(0.01, 1 - k));
        b.obj.rotation.y += dt * 3;
      } else {
        b.obj.scale.set(Math.max(0.01, 1 - k * 0.4), Math.max(0.01, 1 - k), Math.max(0.01, 1 - k * 0.4));
      }
      if (k >= 1) b.obj.visible = false;
    }
  }

  /** Esquina en pico: el vértice parte en dos al limo que lo embiste. */
  private addWedge(idx: number, i: number, j: number, c: Cell) {
    const nx = c.corner === 'nw' || c.corner === 'sw' ? 0 : 1;
    const nz = c.corner === 'nw' || c.corner === 'ne' ? 0 : 1;
    const o: Obstacle = {
      kind: 'wedge', cx: i + nx, cz: j + nz, tx: 1, tz: 0, nx: 0, nz: 1,
      half: 0.5, thick: 0.5, minY: c.base, maxY: c.top, id: idx,
    };
    this.obstacleAt[idx] = this.obstacles.length;
    this.obstacles.push(o);
  }

  private addDivider(idx: number, i: number, j: number, c: Cell) {
    const x = i + 0.5, z = j + 0.5;
    const obj = this.add('saw', x, c.base, z);
    // el modelo corta a lo largo de Z: 'x' gira 90°, las diagonales 45° (y su disco es más grande: cruza la casilla de esquina a esquina)
    const angle = { z: 0, x: Math.PI / 2, d1: Math.PI / 4, d2: -Math.PI / 4 }[c.axis ?? 'z'];
    obj.rotation.y = angle;
    const diag = c.axis === 'd1' || c.axis === 'd2';
    const disc = Assets.child<THREE.Object3D>(obj, 'saw_disc');
    if (diag) {
      // la ranura se alarga; el disco crece igual en su plano (si no, al girar se deformaría)
      for (const part of ['saw_housing', 'saw_slot']) Assets.child<THREE.Object3D>(obj, part).scale.z = Math.SQRT2;
      disc.scale.set(1, 1.3, 1.3);
    }
    this.saws.push(disc);
    const tx = Math.sin(angle), tz = Math.cos(angle);
    const o: Obstacle = {
      kind: 'blade', cx: x, cz: z, tx, tz, nx: tz, nz: -tx,
      half: diag ? 0.68 : 0.47, thick: 0.05, minY: c.base, maxY: c.base + (diag ? 0.72 : 0.64), id: 0,
    };
    o.id = idx;
    this.obstacleAt[idx] = this.obstacles.length;
    this.obstacles.push(o);
  }

  /** Bits de vecinos más altos que esta losa (oclusión ambiental). */
  private aoMask(i: number, j: number, top: number, story = 0): number {
    const higher = (di: number, dj: number) => this.top(i + di, j + dj, story) > top + 0.2;
    const w = higher(-1, 0), e = higher(1, 0), n = higher(0, -1), s = higher(0, 1);
    let m = 0;
    if (w) m |= AO_W;
    if (e) m |= AO_E;
    if (n) m |= AO_N;
    if (s) m |= AO_S;
    if (!w && !n && higher(-1, -1)) m |= AO_NW;
    if (!e && !n && higher(1, -1)) m |= AO_NE;
    if (!w && !s && higher(-1, 1)) m |= AO_SW;
    if (!e && !s && higher(1, 1)) m |= AO_SE;
    return m;
  }

  private addSwitch(i: number, j: number, c: Cell) {
    const ch = c.channel!;
    let sw = this.switches.get(ch);
    if (!sw) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
      this.ownedMaterials.push(spriteMat);
      const label = new THREE.Sprite(spriteMat);
      label.scale.set(1.2, 0.6, 1);
      label.renderOrder = 10;
      this.group.add(label);
      sw = { channel: ch, need: 1, latch: false, count: 0, pressed: false, label, labelCanvas: canvas, lastText: '', buttons: [] };
      this.switches.set(ch, sw);
    }
    const obj = this.add('switch', i + 0.5, c.base, j + 0.5, { cloneMaterials: true });
    const button = Assets.child(obj, 'switch_button');
    this.tint(button, CHANNEL_COLOR[ch]);
    button.userData.restY = button.position.y;
    sw.buttons.push(button);
  }

  private addDoor(i: number, j: number, s: number, c: Cell) {
    const ch = c.channel!;
    const obj = this.add('door', i + 0.5, c.base + DOOR_H, j + 0.5, { cloneMaterials: true });
    this.tint(Assets.child(obj, 'door_core'), CHANNEL_COLOR[ch]);
    this.doors.push({ channel: ch, i, j, s, open: 0, obj });
  }

  private tint(o: THREE.Object3D, color: number) {
    const mesh = o as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(color);
    mat.emissive?.setHex(color);
    mat.emissiveIntensity = 0.12;
    this.ownedMaterials.push(mat);
  }

  private addChest(x: number, y: number, z: number) {
    this.chest = this.add('chest', x, y, z);
    const glowMat = createGlowMaterial(0xffc23a, this.timeUniform, 0.6);
    this.ownedMaterials.push(glowMat);
    const glow = new THREE.Mesh(this.assets.geometry('fire_glow'), glowMat);
    glow.position.set(x, y + 0.01, z);
    glow.scale.set(2.2, 1, 2.2);
    glow.renderOrder = 2;
    this.storyGroups[this.buildStory].add(glow);
    this.chestLid = Assets.child(this.chest, 'chest_lid');
    const n = 24;
    const pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      pos[k * 3] = (Math.random() - 0.5) * 1.2;
      pos[k * 3 + 1] = Math.random() * 1.6;
      pos[k * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: 0xffe27a, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false });
    this.ownedMaterials.push(pm);
    this.sparkles = new THREE.Points(geo, pm);
    this.sparkles.position.set(x, y, z);
    this.storyGroups[this.buildStory].add(this.sparkles);
  }

  private updateLabel(sw: SwitchState) {
    const text = sw.pressed && sw.latch ? 'OK' : `${Math.min(sw.count, sw.need)}/${sw.need}`;
    if (text === sw.lastText) return;
    sw.lastText = text;
    drawLabel(sw.labelCanvas, text, sw.pressed ? '#15803d' : CHANNEL_CSS[sw.channel]);
    (sw.label.material.map as THREE.Texture).needsUpdate = true;
  }

  /** counts: limitos apoyados en interruptores por canal este frame */
  update(dt: number, counts: Record<Channel, number>) {
    this.time += dt;
    this.timeUniform.value = this.time;
    if (this.seesaws.length) this.updateSeesaws(dt);

    for (const sw of this.switches.values()) {
      sw.count = counts[sw.channel];
      const now = sw.count >= sw.need;
      sw.pressed = sw.latch ? sw.pressed || now : now;
      for (const b of sw.buttons) {
        const target = b.userData.restY - (sw.pressed ? 0.07 : Math.min(sw.count / sw.need, 1) * 0.03);
        b.position.y += (target - b.position.y) * Math.min(1, dt * 12);
      }
      this.updateLabel(sw);
    }

    for (const door of this.doors) {
      const pressed = this.switches.get(door.channel)?.pressed ?? false;
      const target = pressed ? 1 : 0;
      door.open += Math.sign(target - door.open) * Math.min(Math.abs(target - door.open), dt * 2.5);
      const c = this.cell(door.i, door.j, door.s)!;
      c.top = c.base + DOOR_H * (1 - door.open);
      door.obj.position.y = c.top;
      door.obj.visible = door.open < 0.99;
    }

    for (const c of this.coins) {
      if (!c.obj.visible) continue;
      if (!c.collected && c.type === 'gem') {
        // gira sobre sí misma, se balancea y destella de vez en cuando
        c.obj.rotation.y = this.time * 2.2 + c.i * 0.7;
        // inclinada hacia la cámara para que se vean las facetas y no solo la mesa
        c.obj.rotation.x = 0.55;
        c.obj.rotation.z = Math.sin(this.time * 1.6 + c.j) * 0.22;
        c.obj.position.y = c.baseY + Math.sin(this.time * 2.4 + c.j) * 0.1;
        if (this.gemMesh) this.gemMesh.mat.emissiveIntensity = 0.7 + Math.pow(Math.max(0, Math.sin(this.time * 2.7)), 8) * 1.4;
      } else if (!c.collected) {
        c.obj.rotation.y = this.time * (c.type === 'coin' ? 2.6 : c.type === 'relic' ? 1 : 1.4) + c.i * 0.7;
        c.obj.position.y = c.baseY + Math.sin(this.time * (c.type === 'relic' ? 2 : 3) + c.j) * (c.type === 'coin' ? 0.06 : 0.08);
      } else {
        // recogida: salta, gira rápido, crece y se desvanece
        c.t += dt;
        const k = Math.min(c.t / 0.45, 1);
        c.obj.rotation.y += dt * 22;
        c.obj.position.y = c.baseY + k * 1.1;
        c.obj.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.6 - k * 0.6);
        if (k >= 1) {
          c.obj.visible = false;
          if (c.obj.userData.glow) (c.obj.userData.glow as THREE.Object3D).visible = false;
        }
      }
    }

    for (const p of this.pads.values()) {
      // muelle amortiguado: la tapa rebota tras cada lanzamiento
      p.vel += (-p.offset * 180 - p.vel * 9) * dt;
      p.offset += p.vel * dt;
      p.cooldown = Math.max(0, p.cooldown - dt);
      const y = p.offset + Math.sin(this.time * 5) * 0.006;
      p.plate.position.y = y;
      p.spring.scale.y = Math.max(0.3, 1 + y / 0.32);
    }

    for (const c of this.cannons) {
      // retrocede al disparar y tiembla con el limo dentro
      c.kick = Math.max(0, c.kick - dt * 2.5);
      c.barrel.position.y = -c.kick * c.kick * 0.18;
      c.pivot.rotation.z = c.loaded ? Math.sin(this.time * 45) * 0.035 : 0;
    }

    this.fire?.update(this.time, this.fireState);
    this.updateEffects(dt);
    this.updateCollapses(dt);

    if (this.chest && this.chestLid && this.sparkles) {
      const idle = 1 - this.opening;
      this.chest.rotation.y = Math.sin(this.time * 1.5) * 0.25 * idle;
      this.chest.position.y = this.treasure.y + Math.abs(Math.sin(this.time * 3)) * 0.08 * idle;
      this.chestLid.rotation.x = -this.opening * 1.9;
      this.sparkles.rotation.y += dt * (0.8 + this.opening * 4);
      this.sparkles.scale.setScalar(1 + this.opening * 0.8);
    }
  }

  dispose() {
    // las geometrías de assets.glb se comparten entre niveles: solo liberar lo propio
    for (const m of this.ownedMaterials) {
      (m as THREE.SpriteMaterial).map?.dispose();
      m.dispose();
    }
    this.sparkles?.geometry.dispose();
    for (const g of this.ownedGeometries) g.dispose();
    this.fire?.dispose();
  }
}
