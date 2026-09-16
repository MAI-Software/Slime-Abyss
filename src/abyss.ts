import * as THREE from 'three';
import type { BiomeLook } from './biomes';

/**
  Ambiente del abismo durante el juego: motas de luz que suben desde lo hondo y un resplandor
  lejano bajo el nivel que da sensación de profundidad. Todo sigue a la cámara (coste casi nulo).
*/
export class AbyssAmbience {
  readonly group = new THREE.Group();
  private readonly points: THREE.Points;
  private readonly glow: THREE.Mesh;
  private readonly base: Float32Array;
  private readonly speed: Float32Array;
  private readonly pos: Float32Array;
  private readonly textures: THREE.Texture[] = [];
  private t = 0;
  private static readonly BOX = new THREE.Vector3(24, 13, 24);

  constructor(count: number) {
    this.base = new Float32Array(count * 3);
    this.speed = new Float32Array(count);
    this.pos = new Float32Array(count * 3);
    const box = AbyssAmbience.BOX;
    for (let i = 0; i < count; i++) {
      this.base[i * 3] = Math.random() * box.x;
      this.base[i * 3 + 1] = Math.random() * box.y;
      this.base[i * 3 + 2] = Math.random() * box.z;
      this.speed[i] = 0.25 + Math.random() * 0.55;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const dot = radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(190,220,255,0.55)'], [1, 'rgba(160,200,255,0)']]);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      map: dot, color: 0xa8d4ff, size: 0.12, transparent: true, opacity: 0.75,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;

    const glowTex = radialTexture([[0, 'rgba(90,120,255,0.55)'], [0.45, 'rgba(80,60,200,0.22)'], [1, 'rgba(40,20,90,0)']]);
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.glow.renderOrder = -1;
    this.textures.push(dot, glowTex);
    this.group.add(this.glow, this.points);
  }

  /** Colores de las motas y del resplandor del tema. */
  setLook(look: BiomeLook) {
    (this.points.material as THREE.PointsMaterial).color.setHex(look.dots);
    const mat = this.glow.material as THREE.MeshBasicMaterial;
    const old = mat.map;
    mat.map = radialTexture([[0, look.glow[0]], [0.45, look.glow[1]], [1, look.glow[2]]]);
    this.textures.splice(this.textures.indexOf(old!), 1, mat.map);
    old?.dispose();
    mat.needsUpdate = true;
  }

  update(dt: number, center: THREE.Vector3) {
    this.t += dt;
    const box = AbyssAmbience.BOX;
    const n = this.speed.length;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      this.base[k + 1] += this.speed[i] * dt;
      const sway = Math.sin(this.t * 0.7 + i * 1.7) * 0.35;
      this.pos[k] = center.x - box.x / 2 + wrap(this.base[k] + sway - center.x, box.x);
      this.pos[k + 1] = center.y - 9 + wrap(this.base[k + 1] - center.y, box.y);
      this.pos[k + 2] = center.z - box.z / 2 + wrap(this.base[k + 2] - center.z, box.z);
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.glow.position.set(center.x, center.y - 16, center.z);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.85 + Math.sin(this.t * 0.6) * 0.15;
  }
}

function wrap(v: number, size: number) {
  return ((v % size) + size) % size;
}

function radialTexture(stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
