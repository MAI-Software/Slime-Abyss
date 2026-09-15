import * as THREE from 'three';
import { Assets } from './assets';
import { FireFx, type FireCell, type FireState } from './fire';
import { AO_E, AO_N, AO_NE, AO_NW, AO_S, AO_SE, AO_SW, AO_W, createBlockMaterial, createGlowMaterial } from './materials';
import { HEIGHT_STEP, TILE_BY_CHAR, TILES, traceRails, type CellKind, type Channel, type LevelData } from './level/format';

export type { CellKind };

export interface Cell {
  kind: CellKind;
  base: number;
  top: number;
  channel?: Channel;
  axis?: 'x' | 'z';
  dir?: 'n' | 's' | 'e' | 'w';
}

export type PickupType = 'coin' | 'gem' | 'oil';

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

/** Obstáculo que no ocupa toda la casilla (cuchillas, pinchos): caja para colisión y zona de corte. */
export interface Obstacle {
  kind: 'blade' | 'spike';
  axis?: 'x' | 'z';
  cx: number;
  cz: number;
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
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

type BlockSet = 'floor' | 'ice' | 'wall';
interface Solid { i: number; j: number; top: number; color: THREE.Color; set: BlockSet }

const DOOR_H = TILE_BY_CHAR.get('D')!.raise!;
const SLAB_H = 0.5;   // alto de la losa biselada (block_top)
const BOTTOM = -1.2;  // fondo de las columnas

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
  open: number;
  obj: THREE.Object3D;
}

const CHANNEL_COLOR: Record<Channel, number> = { A: 0xf59e0b, B: 0x22c55e };
const CHANNEL_CSS: Record<Channel, string> = { A: '#b45309', B: '#15803d' };

export class World {
  readonly w: number;
  readonly d: number;
  readonly cells: Cell[];
  readonly group = new THREE.Group();
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
  private breakables = new Map<number, Breakable>();
  private fans: { blades: THREE.Object3D; i: number; j: number; dir: 'n' | 's' | 'e' | 'w'; base: number }[] = [];
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

  constructor(readonly def: LevelData, private assets: Assets) {
    this.d = def.tiles.length;
    this.w = def.tiles[0].length;
    this.cells = [];
    for (let j = 0; j < this.d; j++) {
      for (let i = 0; i < this.w; i++) this.cells.push(this.parse(i, j));
    }
    this.obstacleAt = new Int32Array(this.w * this.d).fill(-1);
    this.windX = new Float32Array(this.w * this.d);
    this.windZ = new Float32Array(this.w * this.d);
    this.windBase = new Float32Array(this.w * this.d);
    this.build();
  }

  private parse(i: number, j: number): Cell {
    const tile = TILE_BY_CHAR.get(this.def.tiles[j][i]) ?? TILE_BY_CHAR.get('.')!;
    if (tile.kind === 'void') return { kind: 'void', base: 0, top: -Infinity };
    const base = Number(this.def.heights[j][i]) * HEIGHT_STEP;
    return { kind: tile.kind, base, top: base + (tile.raise ?? 0), channel: tile.channel, axis: tile.axis, dir: tile.dir };
  }

  cell(i: number, j: number): Cell | null {
    if (i < 0 || j < 0 || i >= this.w || j >= this.d) return null;
    return this.cells[j * this.w + i];
  }

  /** Altura superior de la columna o -Infinity si es vacío. */
  top(i: number, j: number): number {
    const c = this.cell(i, j);
    return c ? c.top : -Infinity;
  }

  fireActive(i: number, j: number): boolean {
    const c = this.cell(i, j);
    if (!c) return false;
    if (c.kind === 'fire') return true;
    return c.kind === 'firet' && this.timedPhase(i, j) < 1.7;
  }

  /**
    ¿Evapora el limo? El intermitente tarda 0.25 s en prender del todo: mientras sube solo empuja
    (ver respingo en slime.ts), así no se evapora de golpe un limo que estaba encima al encenderse.
  */
  fireLethal(i: number, j: number): boolean {
    const c = this.cell(i, j);
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

  obstacle(i: number, j: number): Obstacle | null {
    if (i < 0 || j < 0 || i >= this.w || j >= this.d) return null;
    const k = this.obstacleAt[j * this.w + i];
    return k < 0 ? null : this.obstacles[k];
  }

  /** Recoge lo que haya en la casilla (moneda, gema o aceite). Devuelve qué era, o null. */
  collectCoin(i: number, j: number): PickupType | null {
    const c = this.coinAt.get(j * this.w + i);
    if (!c || c.collected) return null;
    c.collected = true;
    c.t = 0;
    if (c.type === 'gem') this.gemsCollected++;
    else if (c.type === 'coin') this.coinsCollected++;
    return c.type;
  }

  /** ¿Hay plantas o hielo sin quemar en la casilla? */
  burnable(i: number, j: number): boolean {
    const b = this.breakables.get(j * this.w + i);
    return !!b && !b.broken;
  }

  /** El limo en llamas elimina el obstáculo. Devuelve qué era. */
  burn(i: number, j: number): 'plant' | 'iceblock' | null {
    const idx = j * this.w + i;
    const b = this.breakables.get(idx);
    if (!b || b.broken) return null;
    b.broken = true;
    b.t = 0;
    const c = this.cells[idx];
    c.top = c.base;
    c.kind = 'floor';
    return b.kind;
  }

  isCold(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.w && j < this.d && this.coldCells.includes(j * this.w + i);
  }

  /** Dispara la animación del muelle. Devuelve true si no se había disparado hace nada (para sonido). */
  triggerPad(i: number, j: number): boolean {
    const p = this.pads.get(j * this.w + i);
    if (!p) return false;
    const fresh = p.cooldown <= 0;
    if (fresh) {
      p.offset = -0.16;
      p.vel = 0;
      p.cooldown = 0.35;
    }
    return fresh;
  }

  coinPosition(i: number, j: number, out: THREE.Vector3): THREE.Vector3 {
    const c = this.coinAt.get(j * this.w + i);
    return c ? out.copy(c.obj.position) : out.set(i + 0.5, 0, j + 0.5);
  }

  private add(name: string, x: number, y: number, z: number, opts?: { cloneMaterials?: boolean }): THREE.Object3D {
    const o = this.assets.clone(name, opts);
    o.position.set(x, y, z);
    this.group.add(o);
    return o;
  }

  private build() {
    const solids: Solid[] = [];
    // las texturas ya llevan color: aquí solo tintes suaves
    const cFloorA = new THREE.Color(0xffffff);
    const cFloorB = new THREE.Color(0xf2ebe0);
    const cWall = new THREE.Color(0xffffff);
    const cWallB = new THREE.Color(0xeeebf5);
    const cFire = new THREE.Color(0x8a4a40);
    const cIce = new THREE.Color(0xffffff);
    const cJump = new THREE.Color(0xf2e9f4);
    const cSwitch = new THREE.Color(0xc4bed6);
    const fireCells: FireCell[] = [];

    for (let j = 0; j < this.d; j++) {
      for (let i = 0; i < this.w; i++) {
        const c = this.cells[j * this.w + i];
        if (c.kind === 'void') continue;
        const checker = (i + j) % 2 === 0 ? cFloorA : cFloorB;
        const x = i + 0.5, z = j + 0.5;
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
          case 'jump': {
            // suelo normal debajo; la tapa queda elevada sobre el muelle (la física usa c.top)
            solids.push({ i, j, top: c.base, color: cJump, set: 'floor' });
            const obj = this.add('jump_pad', x, c.top, z);
            this.pads.set(j * this.w + i, {
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
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.addDoor(i, j, c);
            break;
          case 'start':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.start.set(x, c.base, z);
            break;
          case 'treasure':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.treasure.set(x, c.base, z);
            this.addChest(x, c.base, z);
            break;
          case 'coin': case 'gem': case 'oil':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.addCoin(i, j, c.base, c.kind);
            break;
          case 'plant': case 'iceblock': {
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            const obj = this.add(c.kind === 'plant' ? 'plant_block' : 'ice_block', x, c.base, z);
            obj.rotation.y = ((i * 7 + j * 3) % 4) * (Math.PI / 2);
            this.breakables.set(j * this.w + i, { obj, kind: c.kind, broken: false, t: 0 });
            break;
          }
          case 'fan': {
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            const obj = this.add('fan', x, c.base, z);
            // el modelo sopla hacia +Z (hacia la cámara)
            obj.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[c.dir ?? 's'];
            this.fans.push({ blades: Assets.child(obj, 'fan_blades'), i, j, dir: c.dir ?? 's', base: c.base });
            break;
          }
          case 'coldjet':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.add('cold_vent', x, c.base, z);
            this.coldCells.push(j * this.w + i);
            break;
          case 'station':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            break;
          case 'rail':
            c.top = RAIL_FENCE; // no se dibuja bloque: la vía se monta en buildRails
            break;
          case 'blade': case 'spike':
            solids.push({ i, j, top: c.base, color: checker, set: 'floor' });
            this.addDivider(i, j, c);
            break;
          default: solids.push({ i, j, top: c.top, color: checker, set: 'floor' });
        }
      }
    }

    this.buildBlocks(solids);
    this.buildRails();
    this.buildWind();
    this.buildMist();

    if (fireCells.length) {
      const spots = new Map<string, { x: number; y: number; z: number; cells: FireCell[] }>();
      for (const c of fireCells) {
        const key = `${Math.floor(c.i / 3)},${Math.floor(c.j / 3)}`;
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

  /**
    Bloques en pocos draw calls (losa + columna por grupo): suelo con losas y oclusión junto a paredes,
    hielo brillante y muros de ladrillo. Solo proyectan sombra los muros y los suelos elevados.
  */
  private buildBlocks(solids: Solid[]) {
    const a = this.assets;
    const floorTop = createBlockMaterial({ top: a.surface('floor'), side: a.surface('stone_side'), ao: true, shininess: 28, specular: 0x6a5c4c });
    const floorCol = createBlockMaterial({ top: a.surface('floor'), side: a.surface('stone_side'), shininess: 18, specular: 0x3a3028 });
    const iceTop = createBlockMaterial({ top: a.surface('ice'), side: a.surface('ice'), ao: true, shininess: 110, specular: 0xd8f0ff, bump: 0.6 });
    const wallMat = createBlockMaterial({ top: a.surface('wall_top'), side: a.surface('brick'), shininess: 22, specular: 0x4a4658, bump: 1.2 });
    this.ownedMaterials.push(floorTop, floorCol, iceTop, wallMat);
    const raised = solids.some((s) => s.set !== 'wall' && s.top > 0);

    const make = (set: BlockSet, topMat: THREE.Material, colMat: THREE.Material) => {
      const list = solids.filter((s) => s.set === set);
      if (!list.length) return;
      const topGeo = a.geometry('block_top').clone();
      const ao = new Float32Array(list.length);
      const tops = new THREE.InstancedMesh(topGeo, topMat, list.length);
      const cols = new THREE.InstancedMesh(a.geometry('block_column'), colMat, list.length);
      const m = new THREE.Matrix4();
      const colColor = new THREE.Color();
      list.forEach((s, k) => {
        m.makeTranslation(s.i + 0.5, s.top, s.j + 0.5);
        tops.setMatrixAt(k, m);
        tops.setColorAt(k, s.color);
        const h = Math.max(0.01, s.top - SLAB_H - BOTTOM);
        m.makeScale(1, h, 1);
        m.setPosition(s.i + 0.5, s.top - SLAB_H, s.j + 0.5);
        cols.setMatrixAt(k, m);
        cols.setColorAt(k, colColor.copy(s.color).multiplyScalar(0.9));
        if (set !== 'wall') ao[k] = this.aoMask(s.i, s.j, s.top);
      });
      topGeo.setAttribute('aAO', new THREE.InstancedBufferAttribute(ao, 1));
      this.ownedGeometries.push(topGeo);
      for (const im of [tops, cols]) {
        im.receiveShadow = true;
        im.castShadow = set === 'wall' || raised;
        this.group.add(im);
      }
    };
    make('floor', floorTop, floorCol);
    make('ice', iceTop, floorCol);
    make('wall', wallMat, wallMat);
  }

  private addCoin(i: number, j: number, base: number, kind: string) {
    const type: PickupType = kind === 'gem' ? 'gem' : kind === 'oil' ? 'oil' : 'coin';
    const gem = type === 'gem';
    const y = base + (type === 'coin' ? 0.55 : type === 'oil' ? 0.12 : 0.35);
    const obj = this.add(type === 'coin' ? 'coin' : type === 'gem' ? 'gem' : 'oil_bottle', i + 0.5, y, j + 0.5);
    if (gem || type === 'oil') {
      // halo violeta bajo la gema para que se vea desde lejos
      const glowMat = createGlowMaterial(gem ? 0xa855f7 : 0xf5a524, this.timeUniform, 0.8);
      this.ownedMaterials.push(glowMat);
      const glow = new THREE.Mesh(this.assets.geometry('fire_glow'), glowMat);
      glow.position.set(i + 0.5, base + 0.02, j + 0.5);
      glow.scale.set(1.8, 1, 1.8);
      glow.renderOrder = 2;
      this.group.add(glow);
      obj.userData.glow = glow;
    }
    const coin: Coin = { type, i, j, obj, baseY: y, collected: false, t: 0 };
    this.coins.push(coin);
    this.coinAt.set(j * this.w + i, coin);
  }

  /** Corriente de cada ventilador: avanza por casillas (también sobre el vacío) hasta chocar con algo alto. */
  private buildRails() {
    const { paths } = traceRails(this.def);
    for (const [from, cellsPath] of paths) {
      const n = cellsPath.length;
      const xs = new Float32Array(n), zs = new Float32Array(n), ys = new Float32Array(n), dist = new Float32Array(n);
      cellsPath.forEach((idx, k) => {
        xs[k] = (idx % this.w) + 0.5;
        zs[k] = Math.floor(idx / this.w) + 0.5;
        if (k) dist[k] = dist[k - 1] + Math.hypot(xs[k] - xs[k - 1], zs[k] - zs[k - 1]);
      });
      const to = cellsPath[n - 1];
      const y0 = this.cells[from].base, y1 = this.cells[to].base;
      const total = dist[n - 1];
      for (let k = 0; k < n; k++) ys[k] = y0 + (y1 - y0) * (dist[k] / total);
      const ex = xs[n - 1] - xs[n - 2], ez = zs[n - 1] - zs[n - 2];
      const el = Math.hypot(ex, ez) || 1;
      this.rails.set(from, { from, to, xs, zs, ys, dist, total, exitX: ex / el, exitZ: ez / el });

      // estación: el arco queda de través a la vía
      const dx = xs[1] - xs[0], dz = zs[1] - zs[0];
      const st = this.add('rail_station', xs[0], y0, zs[0]);
      st.rotation.y = Math.atan2(-dx, -dz);
      if (from > to) continue; // cada vía se monta una sola vez
      for (let k = 0; k < n - 1; k++) {
        const ax = xs[k], az = zs[k], bx = xs[k + 1], bz = zs[k + 1];
        const hx = bx - ax, hz = bz - az, hy = ys[k + 1] - ys[k];
        const flat = Math.hypot(hx, hz);
        const piece = this.add('rail_piece', (ax + bx) / 2, (ys[k] + ys[k + 1]) / 2, (az + bz) / 2);
        piece.rotation.order = 'YZX';
        piece.rotation.set(0, Math.atan2(-hz, hx), Math.atan2(hy, flat));
        piece.scale.x = Math.hypot(flat, hy) + 0.02;
      }
    }
  }

  /** Vía que sale de la estación de esta casilla, si la hay. */
  railAt(i: number, j: number): RailPath | null {
    if (i < 0 || j < 0 || i >= this.w || j >= this.d) return null;
    return this.rails.get(j * this.w + i) ?? null;
  }

  private buildWind() {
    for (const f of this.fans) {
      const [dx, dz] = DIRS[f.dir];
      for (let k = 1; k <= WIND_LEN; k++) {
        const ci = f.i + dx * k, cj = f.j + dz * k;
        const cell = this.cell(ci, cj);
        if (!cell) break;
        if (cell.kind !== 'rail' && cell.top !== -Infinity && cell.top > f.base + 0.6) break;
        const idx = cj * this.w + ci;
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
        const ci = idx % this.w, cj = Math.floor(idx / this.w);
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

  private addDivider(i: number, j: number, c: Cell) {
    const x = i + 0.5, z = j + 0.5;
    let o: Obstacle;
    if (c.kind === 'blade') {
      const obj = this.add('blade', x, c.base, z);
      // el modelo corre a lo largo de Z; la variante 'x' se gira
      if (c.axis === 'x') obj.rotation.y = Math.PI / 2;
      const half = 0.47, thick = 0.05;
      o = c.axis === 'x'
        ? { kind: 'blade', axis: 'x', cx: x, cz: z, minX: x - half, maxX: x + half, minZ: z - thick, maxZ: z + thick, minY: c.base, maxY: c.base + 0.72, id: 0 }
        : { kind: 'blade', axis: 'z', cx: x, cz: z, minX: x - thick, maxX: x + thick, minZ: z - half, maxZ: z + half, minY: c.base, maxY: c.base + 0.72, id: 0 };
    } else {
      this.add('spike', x, c.base, z);
      o = { kind: 'spike', cx: x, cz: z, minX: x - 0.12, maxX: x + 0.12, minZ: z - 0.12, maxZ: z + 0.12, minY: c.base, maxY: c.base + 0.85, id: 0 };
    }
    o.id = j * this.w + i;
    this.obstacleAt[o.id] = this.obstacles.length;
    this.obstacles.push(o);
  }

  /** Bits de vecinos más altos que esta losa (oclusión ambiental). */
  private aoMask(i: number, j: number, top: number): number {
    const higher = (di: number, dj: number) => this.top(i + di, j + dj) > top + 0.2;
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

  private addDoor(i: number, j: number, c: Cell) {
    const ch = c.channel!;
    const obj = this.add('door', i + 0.5, c.base + DOOR_H, j + 0.5, { cloneMaterials: true });
    this.tint(Assets.child(obj, 'door_core'), CHANNEL_COLOR[ch]);
    this.doors.push({ channel: ch, i, j, open: 0, obj });
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
    this.group.add(glow);
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
    this.group.add(this.sparkles);
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
      const c = this.cell(door.i, door.j)!;
      c.top = c.base + DOOR_H * (1 - door.open);
      door.obj.position.y = c.top;
      door.obj.visible = door.open < 0.99;
    }

    for (const c of this.coins) {
      if (!c.obj.visible) continue;
      if (!c.collected) {
        c.obj.rotation.y = this.time * (c.type === 'coin' ? 2.6 : 1.4) + c.i * 0.7;
        c.obj.position.y = c.baseY + Math.sin(this.time * 3 + c.j) * (c.type === 'coin' ? 0.06 : 0.08);
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

    this.fire?.update(this.time, this.fireState);
    this.updateEffects(dt);

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
