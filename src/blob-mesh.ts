import * as THREE from 'three';
import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js';

/*
  Superficie de metaballs optimizada para móvil.
  A diferencia de MarchingCubes de three (que recorre la rejilla entera cada frame),
  aquí solo se evalúan las celdas que tocan alguna bola: el coste depende del número
  de limitos, no del tamaño de la rejilla. Así la rejilla puede ser grande y fina.
*/

const KERNEL_R = 0.42; // radio de influencia de cada bola (mundo)
const ISO = 0.5;       // umbral de la superficie

export class BlobMesh extends THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  private readonly res: number;
  private readonly cell: number;
  private readonly yd: number;
  private readonly zd: number;
  private readonly field: Float32Array;
  private readonly nCache: Float32Array;
  private readonly nStamp: Uint32Array;
  private readonly cStamp: Uint32Array;
  private readonly pos: Float32Array;
  private readonly nor: Float32Array;
  private readonly maxVerts: number;
  private frame = 1;
  private vertCount = 0;
  private ox = 0; private oy = 0; private oz = 0;
  // bolas del frame actual (índices de rejilla de su caja)
  private boxes: Int32Array;
  private balls = 0;
  private readonly vlist = new Float32Array(36);
  private readonly nlist = new Float32Array(36);

  constructor(res: number, cell: number, material: THREE.Material, maxBalls: number, maxTris = 20000) {
    const geometry = new THREE.BufferGeometry();
    const maxVerts = maxTris * 3;
    const pos = new Float32Array(maxVerts * 3);
    const nor = new Float32Array(maxVerts * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    super(geometry, material);
    this.frustumCulled = false;
    this.res = res;
    this.cell = cell;
    this.yd = res;
    this.zd = res * res;
    const total = res * res * res;
    this.field = new Float32Array(total);
    this.nCache = new Float32Array(total * 3);
    this.nStamp = new Uint32Array(total);
    this.cStamp = new Uint32Array(total);
    this.pos = pos;
    this.nor = nor;
    this.maxVerts = maxVerts;
    this.boxes = new Int32Array(maxBalls * 6);
  }

  /** Mundo cubierto por la rejilla (para saber qué bolas caben). */
  get span() { return (this.res - 6) * this.cell; }

  /** Empieza un frame centrando la rejilla en (x, y, z). */
  begin(x: number, y: number, z: number) {
    // borrar solo lo que se escribió el frame anterior
    const { res, field, boxes } = this;
    for (let b = 0; b < this.balls; b++) {
      const o = b * 6;
      for (let k = boxes[o + 2]; k <= boxes[o + 5]; k++) {
        for (let j = boxes[o + 1]; j <= boxes[o + 4]; j++) {
          const row = k * this.zd + j * this.yd;
          field.fill(0, row + boxes[o], row + boxes[o + 3] + 1);
        }
      }
    }
    this.balls = 0;
    this.frame++;
    if (this.frame > 4e9) { this.frame = 1; this.nStamp.fill(0); this.cStamp.fill(0); }
    const half = (res / 2) * this.cell;
    // anclar a la rejilla para que la superficie no "hierva" al moverse
    this.ox = Math.round(x / this.cell) * this.cell - half;
    this.oy = Math.round(y / this.cell) * this.cell - half;
    this.oz = Math.round(z / this.cell) * this.cell - half;
    this.position.set(this.ox, this.oy, this.oz);
  }

  /** Añade una bola en coordenadas de mundo. Devuelve false si queda fuera de la rejilla. */
  addBall(x: number, y: number, z: number, strength = 1): boolean {
    const { res, cell, field } = this;
    const gx = (x - this.ox) / cell, gy = (y - this.oy) / cell, gz = (z - this.oz) / cell;
    const rc = KERNEL_R / cell;
    const x0 = Math.ceil(gx - rc), x1 = Math.floor(gx + rc);
    const y0 = Math.ceil(gy - rc), y1 = Math.floor(gy + rc);
    const z0 = Math.ceil(gz - rc), z1 = Math.floor(gz + rc);
    if (x0 < 2 || y0 < 2 || z0 < 2 || x1 > res - 3 || y1 > res - 3 || z1 > res - 3) return false;
    if (this.balls * 6 >= this.boxes.length) return false;
    const r2 = KERNEL_R * KERNEL_R;
    for (let k = z0; k <= z1; k++) {
      const dz = k * cell + this.oz - z;
      const dz2 = dz * dz;
      for (let j = y0; j <= y1; j++) {
        const dy = j * cell + this.oy - y;
        const dyz = dz2 + dy * dy;
        if (dyz >= r2) continue;
        const row = k * this.zd + j * this.yd;
        for (let i = x0; i <= x1; i++) {
          const dx = i * cell + this.ox - x;
          const t = 1 - (dyz + dx * dx) / r2;
          if (t > 0) field[row + i] += strength * t * t * t;
        }
      }
    }
    const o = this.balls * 6;
    const b = this.boxes;
    b[o] = x0; b[o + 1] = y0; b[o + 2] = z0; b[o + 3] = x1; b[o + 4] = y1; b[o + 5] = z1;
    this.balls++;
    return true;
  }

  /** Genera la malla con las celdas tocadas. */
  end() {
    this.vertCount = 0;
    const { boxes, cStamp, frame, zd, yd } = this;
    for (let b = 0; b < this.balls; b++) {
      const o = b * 6;
      for (let k = boxes[o + 2] - 1; k <= boxes[o + 5]; k++) {
        for (let j = boxes[o + 1] - 1; j <= boxes[o + 4]; j++) {
          const row = k * zd + j * yd;
          for (let i = boxes[o] - 1; i <= boxes[o + 3]; i++) {
            const q = row + i;
            if (cStamp[q] === frame) continue;
            cStamp[q] = frame;
            this.polygonize(i, j, k, q);
            if (this.vertCount >= this.maxVerts) break;
          }
        }
      }
    }
    const g = this.geometry;
    g.setDrawRange(0, this.vertCount);
    const pa = g.getAttribute('position') as THREE.BufferAttribute;
    const na = g.getAttribute('normal') as THREE.BufferAttribute;
    pa.clearUpdateRanges();
    na.clearUpdateRanges();
    pa.addUpdateRange(0, this.vertCount * 3);
    na.addUpdateRange(0, this.vertCount * 3);
    pa.needsUpdate = true;
    na.needsUpdate = true;
    this.visible = this.vertCount > 0;
  }

  private normal(q: number) {
    if (this.nStamp[q] === this.frame) return;
    this.nStamp[q] = this.frame;
    const f = this.field, c = this.nCache, q3 = q * 3;
    c[q3] = f[q - 1] - f[q + 1];
    c[q3 + 1] = f[q - this.yd] - f[q + this.yd];
    c[q3 + 2] = f[q - this.zd] - f[q + this.zd];
  }

  private vert(offset: number, qa: number, qb: number, x: number, y: number, z: number, axis: number, va: number, vb: number) {
    const mu = (ISO - va) / (vb - va);
    const cell = this.cell;
    const vl = this.vlist, nl = this.nlist, nc = this.nCache;
    vl[offset] = (x + (axis === 0 ? mu : 0)) * cell;
    vl[offset + 1] = (y + (axis === 1 ? mu : 0)) * cell;
    vl[offset + 2] = (z + (axis === 2 ? mu : 0)) * cell;
    this.normal(qa);
    this.normal(qb);
    const a = qa * 3, b = qb * 3;
    nl[offset] = nc[a] + (nc[b] - nc[a]) * mu;
    nl[offset + 1] = nc[a + 1] + (nc[b + 1] - nc[a + 1]) * mu;
    nl[offset + 2] = nc[a + 2] + (nc[b + 2] - nc[a + 2]) * mu;
  }

  private polygonize(x: number, y: number, z: number, q: number) {
    const f = this.field, yd = this.yd, zd = this.zd;
    const q1 = q + 1, qy = q + yd, qz = q + zd, q1y = q1 + yd, q1z = q1 + zd, qyz = qy + zd, q1yz = q1y + zd;
    const f0 = f[q], f1 = f[q1], f2 = f[qy], f3 = f[q1y], f4 = f[qz], f5 = f[q1z], f6 = f[qyz], f7 = f[q1yz];
    let ci = 0;
    if (f0 < ISO) ci |= 1;
    if (f1 < ISO) ci |= 2;
    if (f3 < ISO) ci |= 4;
    if (f2 < ISO) ci |= 8;
    if (f4 < ISO) ci |= 16;
    if (f5 < ISO) ci |= 32;
    if (f7 < ISO) ci |= 64;
    if (f6 < ISO) ci |= 128;
    const bits = edgeTable[ci];
    if (bits === 0) return;

    if (bits & 1) this.vert(0, q, q1, x, y, z, 0, f0, f1);
    if (bits & 2) this.vert(3, q1, q1y, x + 1, y, z, 1, f1, f3);
    if (bits & 4) this.vert(6, qy, q1y, x, y + 1, z, 0, f2, f3);
    if (bits & 8) this.vert(9, q, qy, x, y, z, 1, f0, f2);
    if (bits & 16) this.vert(12, qz, q1z, x, y, z + 1, 0, f4, f5);
    if (bits & 32) this.vert(15, q1z, q1yz, x + 1, y, z + 1, 1, f5, f7);
    if (bits & 64) this.vert(18, qyz, q1yz, x, y + 1, z + 1, 0, f6, f7);
    if (bits & 128) this.vert(21, qz, qyz, x, y, z + 1, 1, f4, f6);
    if (bits & 256) this.vert(24, q, qz, x, y, z, 2, f0, f4);
    if (bits & 512) this.vert(27, q1, q1z, x + 1, y, z, 2, f1, f5);
    if (bits & 1024) this.vert(30, q1y, q1yz, x + 1, y + 1, z, 2, f3, f7);
    if (bits & 2048) this.vert(33, qy, qyz, x, y + 1, z, 2, f2, f6);

    const o = ci << 4;
    const pos = this.pos, nor = this.nor, vl = this.vlist, nl = this.nlist;
    for (let t = 0; triTable[o + t] !== -1; t++) {
      if (this.vertCount >= this.maxVerts) return;
      const e = triTable[o + t] * 3;
      const w = this.vertCount * 3;
      pos[w] = vl[e]; pos[w + 1] = vl[e + 1]; pos[w + 2] = vl[e + 2];
      const nx = nl[e], ny = nl[e + 1], nz = nl[e + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nor[w] = nx / len; nor[w + 1] = ny / len; nor[w + 2] = nz / len;
      this.vertCount++;
    }
  }
}
