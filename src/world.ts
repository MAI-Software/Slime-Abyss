import * as THREE from 'three';
import type { Channel, LevelDef } from './levels';

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

export const FRICTION: Partial<Record<CellKind, number>> = { ice: 0.25 };

function blockTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.10)';
  g.fillRect(0, 0, 64, 4);
  g.fillRect(0, 60, 64, 4);
  g.fillRect(0, 0, 4, 64);
  g.fillRect(60, 0, 4, 64);
  g.fillStyle = 'rgba(255,255,255,0.0)';
  g.strokeStyle = 'rgba(0,0,0,0.05)';
  g.lineWidth = 2;
  g.strokeRect(10, 10, 44, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

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
  plates: THREE.Mesh[];
}

interface DoorState {
  channel: Channel;
  i: number;
  j: number;
  open: number;
  mesh: THREE.Mesh;
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
  private flames: { mesh: THREE.InstancedMesh; cells: { i: number; j: number; base: number; timed: boolean }[] } | null = null;
  private chest!: THREE.Group;
  private sparkles!: THREE.Points;
  private time = 0;

  constructor(readonly def: LevelDef) {
    this.d = def.map.length;
    this.w = Math.max(...def.map.map((r) => r.length));
    this.cells = [];
    for (let j = 0; j < this.d; j++) {
      for (let i = 0; i < this.w; i++) {
        this.cells.push(this.parse(i, j));
      }
    }
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
    if (c.kind !== 'firet') return false;
    return this.timedFire(i, j);
  }

  private timedFire(i: number, j: number): boolean {
    const phase = (this.time + (i + j) * 0.25) % 3.2;
    return phase < 1.7;
  }

  private build() {
    const tex = blockTexture();
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, -0.5, 0); // origen en la cara superior

    const solids: { i: number; j: number; top: number; color: THREE.Color }[] = [];
    const cFloorA = new THREE.Color(0xe9d7ad);
    const cFloorB = new THREE.Color(0xdcc594);
    const cWall = new THREE.Color(0x6f6798);
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
        switch (c.kind) {
          case 'wall': solids.push({ i, j, top: c.top, color: cWall }); break;
          case 'fire': case 'firet':
            solids.push({ i, j, top: c.base, color: cFire });
            fireCells.push({ i, j, base: c.base, timed: c.kind === 'firet' });
            break;
          case 'ice': solids.push({ i, j, top: c.base, color: cIce }); break;
          case 'jump':
            solids.push({ i, j, top: c.base, color: cJump });
            this.addJumpPad(i, j, c.base);
            break;
          case 'switch':
            solids.push({ i, j, top: c.base, color: cSwitch });
            this.addSwitchPlate(i, j, c);
            break;
          case 'door':
            solids.push({ i, j, top: c.base, color: checker });
            this.addDoor(i, j, c);
            break;
          case 'start':
            solids.push({ i, j, top: c.base, color: checker });
            this.start.set(i + 0.5, c.base, j + 0.5);
            break;
          case 'treasure':
            solids.push({ i, j, top: c.base, color: checker });
            this.treasure.set(i + 0.5, c.base, j + 0.5);
            this.addChest(i, j, c.base);
            break;
          default: solids.push({ i, j, top: c.top, color: checker });
        }
      }
    }

    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const inst = new THREE.InstancedMesh(boxGeo, mat, solids.length);
    const m = new THREE.Matrix4();
    solids.forEach((s, k) => {
      const height = s.top + 1.2;
      m.makeScale(1, height, 1);
      m.setPosition(s.i + 0.5, s.top, s.j + 0.5);
      inst.setMatrixAt(k, m);
      inst.setColorAt(k, s.color);
    });
    inst.receiveShadow = true;
    inst.castShadow = true;
    this.group.add(inst);

    if (fireCells.length) {
      const coneGeo = new THREE.ConeGeometry(0.22, 0.7, 6, 1, true);
      coneGeo.translate(0, 0.35, 0);
      const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9, depthWrite: false });
      const perCell = 3;
      const mesh = new THREE.InstancedMesh(coneGeo, fireMat, fireCells.length * perCell);
      const colors = [new THREE.Color(0xff5a1f), new THREE.Color(0xffb020), new THREE.Color(0xff7a1a)];
      for (let k = 0; k < fireCells.length * perCell; k++) mesh.setColorAt(k, colors[k % 3]);
      this.flames = { mesh, cells: fireCells };
      this.group.add(mesh);
    }

    // interruptores: etiqueta con peso necesario
    for (const [ch, sw] of this.switches) {
      const need = this.def.need?.[ch] ?? 1;
      sw.need = need;
      sw.latch = !!this.def.latch?.[ch];
      const cx = sw.plates.reduce((a, p) => a + p.position.x, 0) / sw.plates.length;
      const cz = sw.plates.reduce((a, p) => a + p.position.z, 0) / sw.plates.length;
      const y = sw.plates[0].position.y;
      sw.label.position.set(cx, y + 1.6, cz);
      this.updateLabel(sw);
    }
  }

  private addJumpPad(i: number, j: number, base: number) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.4, 0.12, 12),
      new THREE.MeshLambertMaterial({ color: 0xec4899, emissive: 0x5a0f35 }),
    );
    pad.position.set(i + 0.5, base + 0.06, j + 0.5);
    this.group.add(pad);
  }

  private addSwitchPlate(i: number, j: number, c: Cell) {
    const ch = c.channel!;
    let sw = this.switches.get(ch);
    if (!sw) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      label.scale.set(1.2, 0.6, 1);
      label.renderOrder = 10;
      this.group.add(label);
      sw = { channel: ch, need: 1, latch: false, count: 0, pressed: false, label, labelCanvas: canvas, lastText: '', plates: [] };
      this.switches.set(ch, sw);
    }
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.1, 0.86),
      new THREE.MeshLambertMaterial({ color: CHANNEL_COLOR[ch], emissive: CHANNEL_COLOR[ch], emissiveIntensity: 0.15 }),
    );
    plate.position.set(i + 0.5, c.base + 0.05, j + 0.5);
    plate.receiveShadow = true;
    sw.plates.push(plate);
    this.group.add(plate);
  }

  private addDoor(i: number, j: number, c: Cell) {
    const ch = c.channel!;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.98, DOOR_H, 0.98),
      new THREE.MeshLambertMaterial({ color: CHANNEL_COLOR[ch], emissive: CHANNEL_COLOR[ch], emissiveIntensity: 0.1 }),
    );
    mesh.geometry.translate(0, -DOOR_H / 2, 0);
    mesh.position.set(i + 0.5, c.base + DOOR_H, j + 0.5);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.doors.push({ channel: ch, i, j, open: 0, mesh });
  }

  private addChest(i: number, j: number, base: number) {
    const g = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x9a5b2e });
    const gold = new THREE.MeshLambertMaterial({ color: 0xf5b301, emissive: 0x7a4a00, emissiveIntensity: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.5), wood);
    body.position.y = 0.21;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.7, 12, 1, false, 0, Math.PI), wood);
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 0.42;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.52), gold);
    band.position.y = 0.36;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.06), gold);
    lock.position.set(0, 0.34, 0.27);
    for (const part of [body, lid, band, lock]) { part.castShadow = true; g.add(part); }
    g.position.set(i + 0.5, base, j + 0.5);
    this.chest = g;
    this.group.add(g);

    const n = 24;
    const pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      pos[k * 3] = (Math.random() - 0.5) * 1.2;
      pos[k * 3 + 1] = Math.random() * 1.6;
      pos[k * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparkles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffe27a, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }));
    this.sparkles.position.copy(g.position);
    this.group.add(this.sparkles);
  }

  private updateLabel(sw: SwitchState) {
    const text = sw.pressed && sw.latch ? 'OK' : `${Math.min(sw.count, sw.need)}/${sw.need}`;
    if (text === sw.lastText) return;
    sw.lastText = text;
    drawLabel(sw.labelCanvas, text, sw.pressed ? '#15803d' : CHANNEL_CSS[sw.channel]);
    (sw.label.material.map as THREE.Texture).needsUpdate = true;
  }

  /** counts: partículas apoyadas en interruptores por canal este frame */
  update(dt: number, counts: Record<Channel, number>) {
    this.time += dt;

    for (const sw of this.switches.values()) {
      sw.count = counts[sw.channel];
      const now = sw.count >= sw.need;
      if (sw.latch) sw.pressed = sw.pressed || now;
      else sw.pressed = now;
      for (const p of sw.plates) p.scale.y = sw.pressed ? 0.3 : 1;
      this.updateLabel(sw);
    }

    for (const door of this.doors) {
      const pressed = this.switches.get(door.channel)?.pressed ?? false;
      const target = pressed ? 1 : 0;
      door.open += Math.sign(target - door.open) * Math.min(Math.abs(target - door.open), dt * 2.5);
      const c = this.cell(door.i, door.j)!;
      c.top = c.base + DOOR_H * (1 - door.open);
      door.mesh.position.y = c.top;
      door.mesh.visible = door.open < 0.99;
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
          const scale = on ? flick * (n === 0 ? 1 : 0.7) : 0.12;
          s.set(scale, scale * (n === 0 ? 1.2 : 1), scale);
          const ang = n * 2.1 + f.i;
          p.set(f.i + 0.5 + (n === 0 ? 0 : Math.cos(ang) * 0.2), f.base, f.j + 0.5 + (n === 0 ? 0 : Math.sin(ang) * 0.2));
          m.compose(p, q, s);
          this.flames.mesh.setMatrixAt(k++, m);
        }
      }
      this.flames.mesh.instanceMatrix.needsUpdate = true;
    }

    if (this.chest) {
      this.chest.rotation.y = Math.sin(this.time * 1.5) * 0.25;
      this.chest.position.y = this.treasure.y + Math.abs(Math.sin(this.time * 3)) * 0.08;
      this.sparkles.rotation.y += dt * 0.8;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) {
        const map = (mat as THREE.MeshBasicMaterial).map;
        if (map) map.dispose();
        mat.dispose();
      }
    });
  }
}
