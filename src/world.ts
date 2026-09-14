import * as THREE from 'three';
import type { Channel, LevelDef } from './levels';
import { Assets } from './assets';

export type CellKind =
  | 'void' | 'floor' | 'wall' | 'fire' | 'firet' | 'ice' | 'jump' | 'switch' | 'door' | 'start' | 'treasure';

export interface Cell {
  kind: CellKind;
  base: number;
  top: number;
  channel?: Channel;
}

const WALL_H = 1.5;
const DOOR_H = 1.5;
const SLAB_H = 0.5;   // alto de la losa biselada (block_top)
const BOTTOM = -1.2;  // fondo de las columnas

export const FRICTION: Partial<Record<CellKind, number>> = { ice: 0.25 };

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
  private flames: { mesh: THREE.InstancedMesh; cells: { i: number; j: number; base: number; timed: boolean }[] } | null = null;
  private chest: THREE.Object3D | null = null;
  private chestLid: THREE.Object3D | null = null;
  private sparkles: THREE.Points | null = null;
  private ownedMaterials: THREE.Material[] = [];
  private time = 0;
  opening = 0; // animación de cofre abierto (0..1)

  constructor(readonly def: LevelDef, private assets: Assets) {
    this.d = def.map.length;
    this.w = Math.max(...def.map.map((r) => r.length));
    this.cells = [];
    for (let j = 0; j < this.d; j++) {
      for (let i = 0; i < this.w; i++) this.cells.push(this.parse(i, j));
    }
    if (!def.h) this.raiseWalls();
    this.build();
  }

  private parse(i: number, j: number): Cell {
    const ch = this.def.map[j][i] ?? ' ';
    const hch = this.def.h?.[j]?.[i];
    const base = hch && hch >= '0' && hch <= '9' ? Number(hch) * 0.5 : 0;
    if (ch === ' ' || ch === '.') return { kind: 'void', base: 0, top: -Infinity };
    if (ch >= '0' && ch <= '9') {
      const h = this.def.h ? base : Number(ch) * 0.5;
      return { kind: 'floor', base: h, top: h };
    }
    switch (ch) {
      case '#': return { kind: 'wall', base, top: base + WALL_H };
      case 'P': return { kind: 'start', base, top: base };
      case 'T': return { kind: 'treasure', base, top: base };
      case 'F': return { kind: 'fire', base, top: base };
      case 'X': return { kind: 'firet', base, top: base };
      case 'I': return { kind: 'ice', base, top: base };
      case 'J': return { kind: 'jump', base, top: base };
      case 'S': return { kind: 'switch', base, top: base, channel: 'A' };
      case 's': return { kind: 'switch', base, top: base, channel: 'B' };
      case 'D': return { kind: 'door', base, top: base + DOOR_H, channel: 'A' };
      case 'd': return { kind: 'door', base, top: base + DOOR_H, channel: 'B' };
      default: return { kind: 'floor', base, top: base };
    }
  }

  /** Sin capa de alturas: cada muro se apoya en el suelo más alto que toca. */
  private raiseWalls() {
    for (let j = 0; j < this.d; j++) {
      for (let i = 0; i < this.w; i++) {
        const c = this.cells[j * this.w + i];
        if (c.kind !== 'wall') continue;
        let base = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const n = this.cell(i + di, j + dj);
            if (n && n.kind !== 'wall' && n.kind !== 'void') base = Math.max(base, n.base);
          }
        }
        c.base = base;
        c.top = base + WALL_H;
      }
    }
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
    return c.kind === 'firet' && this.timedFire(i, j);
  }

  private timedFire(i: number, j: number): boolean {
    return (this.time + (i + j) * 0.25) % 3.2 < 1.7;
  }

  private add(name: string, x: number, y: number, z: number, opts?: { cloneMaterials?: boolean }): THREE.Object3D {
    const o = this.assets.clone(name, opts);
    o.position.set(x, y, z);
    this.group.add(o);
    return o;
  }

  private build() {
    const solids: { i: number; j: number; top: number; color: THREE.Color }[] = [];
    const cFloorA = new THREE.Color(0xe9d7ad);
    const cFloorB = new THREE.Color(0xdcc594);
    const cWall = new THREE.Color(0x6f6798);
    const cWallB = new THREE.Color(0x675f8f);
    const cFire = new THREE.Color(0x6b2a2a);
    const cIce = new THREE.Color(0xbfeaff);
    const cJump = new THREE.Color(0xf9a8d4);
    const cSwitch = new THREE.Color(0x7b7394);
    const fireCells: { i: number; j: number; base: number; timed: boolean }[] = [];

    for (let j = 0; j < this.d; j++) {
      for (let i = 0; i < this.w; i++) {
        const c = this.cells[j * this.w + i];
        if (c.kind === 'void') continue;
        const checker = (i + j) % 2 === 0 ? cFloorA : cFloorB;
        const x = i + 0.5, z = j + 0.5;
        switch (c.kind) {
          case 'wall':
            solids.push({ i, j, top: c.top, color: (i + j) % 2 === 0 ? cWall : cWallB });
            break;
          case 'fire': case 'firet':
            solids.push({ i, j, top: c.base, color: cFire });
            fireCells.push({ i, j, base: c.base, timed: c.kind === 'firet' });
            this.add('fire_grate', x, c.base, z);
            break;
          case 'ice': solids.push({ i, j, top: c.base, color: cIce }); break;
          case 'jump':
            solids.push({ i, j, top: c.base, color: cJump });
            this.pads.push(this.add('jump_pad', x, c.base, z));
            break;
          case 'switch':
            solids.push({ i, j, top: c.base, color: cSwitch });
            this.addSwitch(i, j, c);
            break;
          case 'door':
            solids.push({ i, j, top: c.base, color: checker });
            this.addDoor(i, j, c);
            break;
          case 'start':
            solids.push({ i, j, top: c.base, color: checker });
            this.start.set(x, c.base, z);
            break;
          case 'treasure':
            solids.push({ i, j, top: c.base, color: checker });
            this.treasure.set(x, c.base, z);
            this.addChest(x, c.base, z);
            break;
          default: solids.push({ i, j, top: c.top, color: checker });
        }
      }
    }

    // bloques: losa biselada arriba + columna estirada debajo (2 draw calls para todo el nivel)
    const mat = new THREE.MeshLambertMaterial();
    this.ownedMaterials.push(mat);
    const tops = new THREE.InstancedMesh(this.assets.geometry('block_top'), mat, solids.length);
    const cols = new THREE.InstancedMesh(this.assets.geometry('block_column'), mat, solids.length);
    const m = new THREE.Matrix4();
    solids.forEach((s, k) => {
      m.makeTranslation(s.i + 0.5, s.top, s.j + 0.5);
      tops.setMatrixAt(k, m);
      tops.setColorAt(k, s.color);
      const h = Math.max(0.01, s.top - SLAB_H - BOTTOM);
      m.makeScale(1, h, 1);
      m.setPosition(s.i + 0.5, s.top - SLAB_H, s.j + 0.5);
      cols.setMatrixAt(k, m);
      cols.setColorAt(k, s.color.clone().multiplyScalar(0.82));
    });
    for (const im of [tops, cols]) {
      im.receiveShadow = true;
      im.castShadow = true;
      this.group.add(im);
    }

    if (fireCells.length) {
      const fireMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false });
      this.ownedMaterials.push(fireMat);
      const mesh = new THREE.InstancedMesh(this.assets.geometry('flame'), fireMat, fireCells.length * 3);
      const colors = [new THREE.Color(0xff5a1f), new THREE.Color(0xffb020), new THREE.Color(0xff7a1a)];
      for (let k = 0; k < fireCells.length * 3; k++) mesh.setColorAt(k, colors[k % 3]);
      mesh.frustumCulled = false;
      this.flames = { mesh, cells: fireCells };
      this.group.add(mesh);
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

    if (this.flames) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const p = new THREE.Vector3();
      let k = 0;
      for (const f of this.flames.cells) {
        const on = !f.timed || this.timedFire(f.i, f.j);
        for (let n = 0; n < 3; n++) {
          const flick = 0.75 + 0.35 * Math.sin(this.time * 14 + f.i * 3.1 + f.j * 1.7 + n * 2.2);
          const scale = on ? flick * (n === 0 ? 1 : 0.65) : 0.1;
          s.set(scale, scale * (n === 0 ? 1.15 : 1), scale);
          const ang = n * 2.1 + f.i;
          p.set(f.i + 0.5 + (n === 0 ? 0 : Math.cos(ang) * 0.22), f.base, f.j + 0.5 + (n === 0 ? 0 : Math.sin(ang) * 0.22));
          m.compose(p, q, s);
          this.flames.mesh.setMatrixAt(k++, m);
        }
      }
      this.flames.mesh.instanceMatrix.needsUpdate = true;
    }

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
  }
}
