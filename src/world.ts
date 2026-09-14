import * as THREE from 'three';
import { Assets } from './assets';
import { FireFx, type FireCell, type FireState } from './fire';
import { AO_E, AO_N, AO_NE, AO_NW, AO_S, AO_SE, AO_SW, AO_W, createBlockMaterial, createGlowMaterial } from './materials';
import { HEIGHT_STEP, TILE_BY_CHAR, TILES, type CellKind, type Channel, type LevelData } from './level/format';

export type { CellKind };

export interface Cell {
  kind: CellKind;
  base: number;
  top: number;
  channel?: Channel;
}

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
  private pads: THREE.Object3D[] = [];
  private fire: FireFx | null = null;
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
    this.build();
  }

  private parse(i: number, j: number): Cell {
    const tile = TILE_BY_CHAR.get(this.def.tiles[j][i]) ?? TILE_BY_CHAR.get('.')!;
    if (tile.kind === 'void') return { kind: 'void', base: 0, top: -Infinity };
    const base = Number(this.def.heights[j][i]) * HEIGHT_STEP;
    return { kind: tile.kind, base, top: base + (tile.raise ?? 0), channel: tile.channel };
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

  /** Fuego intermitente: 1.7 s encendido, apagado y aviso 0.45 s antes de volver. */
  private timedPhase(i: number, j: number): number {
    return (this.time + (i + j) * 0.25) % 3.2;
  }

  private fireState = (c: FireCell): FireState => {
    if (!c.timed) return 2;
    const p = this.timedPhase(c.i, c.j);
    return p < 1.7 ? 2 : p > 2.75 ? 1 : 0;
  };

  private add(name: string, x: number, y: number, z: number, opts?: { cloneMaterials?: boolean }): THREE.Object3D {
    const o = this.assets.clone(name, opts);
    o.position.set(x, y, z);
    this.group.add(o);
    return o;
  }

  private build() {
    const solids: { i: number; j: number; top: number; color: THREE.Color; wall: boolean }[] = [];
    const cFloorA = new THREE.Color(0xf6e6c2);
    const cFloorB = new THREE.Color(0xeddab0);
    const cWall = new THREE.Color(0x857db3);
    const cWallB = new THREE.Color(0x7c74a8);
    const cFire = new THREE.Color(0x6b2a2a);
    const cIce = new THREE.Color(0xbfeaff);
    const cJump = new THREE.Color(0xf9a8d4);
    const cSwitch = new THREE.Color(0x7b7394);
    const fireCells: FireCell[] = [];

    for (let j = 0; j < this.d; j++) {
      for (let i = 0; i < this.w; i++) {
        const c = this.cells[j * this.w + i];
        if (c.kind === 'void') continue;
        const checker = (i + j) % 2 === 0 ? cFloorA : cFloorB;
        const x = i + 0.5, z = j + 0.5;
        switch (c.kind) {
          case 'wall':
            solids.push({ i, j, top: c.top, color: (i + j) % 2 === 0 ? cWall : cWallB, wall: true });
            break;
          case 'fire': case 'firet':
            solids.push({ i, j, top: c.base, color: cFire, wall: false });
            fireCells.push({ i, j, base: c.base, timed: c.kind === 'firet' });
            this.add('fire_grate', x, c.base, z);
            break;
          case 'ice': solids.push({ i, j, top: c.base, color: cIce, wall: false }); break;
          case 'jump':
            solids.push({ i, j, top: c.base, color: cJump, wall: false });
            this.pads.push(this.add('jump_pad', x, c.base, z));
            break;
          case 'switch':
            solids.push({ i, j, top: c.base, color: cSwitch, wall: false });
            this.addSwitch(i, j, c);
            break;
          case 'door':
            solids.push({ i, j, top: c.base, color: checker, wall: false });
            this.addDoor(i, j, c);
            break;
          case 'start':
            solids.push({ i, j, top: c.base, color: checker, wall: false });
            this.start.set(x, c.base, z);
            break;
          case 'treasure':
            solids.push({ i, j, top: c.base, color: checker, wall: false });
            this.treasure.set(x, c.base, z);
            this.addChest(x, c.base, z);
            break;
          default: solids.push({ i, j, top: c.top, color: checker, wall: false });
        }
      }
    }

    this.buildBlocks(solids);

    if (fireCells.length) {
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
    Bloques en 4 draw calls: losas y columnas, separando suelos (textura de losas + oclusión
    junto a paredes) y muros (ladrillo). Solo proyectan sombra los muros y los suelos elevados.
  */
  private buildBlocks(solids: { i: number; j: number; top: number; color: THREE.Color; wall: boolean }[]) {
    const tex = this.assets.textures;
    const floorTopMat = createBlockMaterial({ top: tex.floor, side: tex.stone_side, ao: true });
    const floorColMat = createBlockMaterial({ top: tex.floor, side: tex.stone_side });
    const wallMat = createBlockMaterial({ top: tex.wall_top, side: tex.brick });
    this.ownedMaterials.push(floorTopMat, floorColMat, wallMat);
    const raised = solids.some((s) => !s.wall && s.top > 0);

    const make = (list: typeof solids, wall: boolean) => {
      if (!list.length) return;
      const topGeo = this.assets.geometry('block_top').clone();
      const ao = new Float32Array(list.length);
      const tops = new THREE.InstancedMesh(topGeo, wall ? wallMat : floorTopMat, list.length);
      const cols = new THREE.InstancedMesh(this.assets.geometry('block_column'), wall ? wallMat : floorColMat, list.length);
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
        cols.setColorAt(k, colColor.copy(s.color).multiplyScalar(0.85));
        if (!wall) ao[k] = this.aoMask(s.i, s.j, s.top);
      });
      topGeo.setAttribute('aAO', new THREE.InstancedBufferAttribute(ao, 1));
      this.ownedGeometries.push(topGeo);
      for (const im of [tops, cols]) {
        im.receiveShadow = true;
        im.castShadow = wall || raised;
        this.group.add(im);
      }
    };
    make(solids.filter((s) => !s.wall), false);
    make(solids.filter((s) => s.wall), true);
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

    for (const p of this.pads) {
      const s = 1 + Math.sin(this.time * 6 + p.position.x) * 0.04;
      p.scale.set(1, s, 1);
    }

    this.fire?.update(this.time, this.fireState);

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
