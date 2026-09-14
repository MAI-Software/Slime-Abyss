import * as THREE from 'three';
import { Assets } from './assets';
import { createGlowMaterial } from './materials';

/*
  Fuego estilizado y barato para móvil:
  - llamas (modelo "flame" de Blender) con shader: degradado núcleo→punta, ruido que sube,
    ondulación y parpadeo; mezcla normal sin escribir profundidad (la aditiva quemaba a blanco)
  - resplandor radial sobre el brasero ("fire_glow")
  - chispas que suben (Points)
  Todo instanciado: 3 draw calls para todo el fuego del nivel.
*/

export interface FireCell { i: number; j: number; base: number; timed: boolean }
/** 0 apagado · 1 aviso (a punto de encenderse) · 2 encendido */
export type FireState = 0 | 1 | 2;

const NOISE = /* glsl */ `
float fireHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fireNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fireHash(i), fireHash(i + vec2(1.0, 0.0)), f.x),
             mix(fireHash(i + vec2(0.0, 1.0)), fireHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const FLAMES_PER_CELL = 3;
const EMBERS_PER_CELL = 4;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

function emberTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.4, 'rgba(255,160,60,0.8)');
  grad.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class FireFx {
  readonly group = new THREE.Group();
  private readonly uniforms = { uTime: { value: 0 } };
  private readonly flames: THREE.InstancedMesh;
  private readonly glows: THREE.InstancedMesh;
  private readonly embers: THREE.Points;
  private readonly emberPos: Float32Array;
  private readonly seeds: Float32Array;
  private readonly owned: { dispose(): void }[] = [];

  constructor(private readonly cells: FireCell[], assets: Assets) {
    const n = cells.length;
    this.seeds = new Float32Array(n);
    cells.forEach((c, k) => (this.seeds[k] = ((c.i * 73856093) ^ (c.j * 19349663)) % 1000 / 1000));

    // --- llamas
    // mezcla normal (no aditiva): sobre suelos claros la aditiva quemaba a blanco
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    flameMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.vertexShader = `uniform float uTime;\nvarying vec3 vFirePos;\nvarying float vSeed;\nvarying float vRim;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float fh = clamp((position.y - 0.05) / 0.75, 0.0, 1.0);
          #ifdef USE_INSTANCING
            vSeed = instanceMatrix[3].x * 3.17 + instanceMatrix[3].z * 1.93 + instanceMatrix[3].y * 5.1;
          #else
            vSeed = 0.0;
          #endif
          transformed.x += sin(uTime * 9.0 + position.y * 9.0 + vSeed) * 0.05 * fh;
          transformed.z += cos(uTime * 7.0 + position.y * 7.0 + vSeed * 1.3) * 0.05 * fh;
          transformed.y *= 1.0 + sin(uTime * 13.0 + vSeed) * 0.07;
          vFirePos = position;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vRim = abs(dot(normalize(normalMatrix * normal), normalize(-mvPosition.xyz)));`);
      shader.fragmentShader = `uniform float uTime;\nvarying vec3 vFirePos;\nvarying float vSeed;\nvarying float vRim;\n${NOISE}\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', `#include <color_fragment>
          float h = clamp((vFirePos.y - 0.05) / 0.75, 0.0, 1.0);
          float n = fireNoise(vec2(vFirePos.x * 9.0 + vSeed, vFirePos.y * 6.0 - uTime * 4.0)) * 0.65
                  + fireNoise(vec2(vFirePos.z * 14.0 - vSeed, vFirePos.y * 12.0 - uTime * 7.0)) * 0.35;
          float body = smoothstep(0.0, 0.3, (1.0 - h) * 1.2 - n * 0.6 + 0.08);
          vec3 fireCol = mix(vec3(1.0, 0.78, 0.18), vec3(1.0, 0.34, 0.03), smoothstep(0.05, 0.45, h));
          fireCol = mix(fireCol, vec3(0.72, 0.05, 0.02), smoothstep(0.45, 1.0, h));
          // borde de la llama algo más oscuro: se lee bien sobre cualquier suelo
          fireCol *= mix(0.72, 1.0, vRim);
          diffuseColor.rgb *= fireCol;
          diffuseColor.a *= clamp(body * 1.4, 0.0, 1.0) * mix(0.7, 1.0, vRim);`);
    };
    this.flames = new THREE.InstancedMesh(assets.geometry('flame'), flameMat, Math.max(1, n * FLAMES_PER_CELL));
    const tints = [new THREE.Color(1, 0.9, 0.85), new THREE.Color(1, 1, 0.75), new THREE.Color(1, 0.8, 0.7)];
    for (let k = 0; k < n * FLAMES_PER_CELL; k++) this.flames.setColorAt(k, tints[k % FLAMES_PER_CELL]);
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 3;

    // --- resplandor
    // luz falsa: el fuego ilumina las casillas de alrededor sin luces reales (caras en móvil)
    const glowMat = createGlowMaterial(0xff6a12, this.uniforms.uTime, 1);
    this.glows = new THREE.InstancedMesh(assets.geometry('fire_glow'), glowMat, Math.max(1, n));
    this.glows.frustumCulled = false;
    this.glows.renderOrder = 2;

    // --- chispas
    this.emberPos = new Float32Array(Math.max(1, n * EMBERS_PER_CELL) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3).setUsage(THREE.DynamicDrawUsage));
    const tex = emberTexture();
    const emberMat = new THREE.PointsMaterial({
      map: tex, size: 0.09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffb060,
    });
    this.embers = new THREE.Points(geo, emberMat);
    this.embers.frustumCulled = false;

    this.owned.push(flameMat, glowMat, emberMat, tex, geo);
    this.group.add(this.glows, this.flames, this.embers);
  }

  update(time: number, state: (c: FireCell) => FireState) {
    this.uniforms.uTime.value = time;
    const { cells, flames, glows, emberPos, seeds } = this;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      const st = state(c);
      const seed = seeds[k];
      const cx = c.i + 0.5, cz = c.j + 0.5;
      // aviso: llamitas que chisporrotean antes de encenderse
      const power = st === 2 ? 1 : st === 1 ? 0.28 + Math.abs(Math.sin(time * 25 + seed * 10)) * 0.12 : 0;

      for (let f = 0; f < FLAMES_PER_CELL; f++) {
        const s = power * (f === 0 ? 1.3 : f === 1 ? 0.75 : 0.8);
        const ang = seed * 6.28 + f * 2.1;
        const off = f === 2 ? 0.2 : 0;
        tmpP.set(cx + Math.cos(ang) * off, c.base + (f === 1 ? 0.06 : 0.02), cz + Math.sin(ang) * off);
        tmpS.set(s || 1e-4, s || 1e-4, s || 1e-4);
        tmpM.compose(tmpP, tmpQ, tmpS);
        flames.setMatrixAt(k * FLAMES_PER_CELL + f, tmpM);
      }

      const g = st === 2 ? 2.6 + Math.sin(time * 7 + seed * 9) * 0.12 : st === 1 ? 0.9 : 0.001;
      tmpP.set(cx, c.base, cz);
      tmpS.set(g, 1, g);
      tmpM.compose(tmpP, tmpQ, tmpS);
      glows.setMatrixAt(k, tmpM);

      for (let e = 0; e < EMBERS_PER_CELL; e++) {
        const w = (k * EMBERS_PER_CELL + e) * 3;
        const life = (time * (0.7 + seed * 0.3) + e / EMBERS_PER_CELL + seed) % 1;
        if (st !== 2) { emberPos[w + 1] = -100; continue; }
        const a = seed * 40 + e * 1.7;
        emberPos[w] = cx + Math.cos(a) * 0.25 + Math.sin(time * 3 + e) * 0.06 * life;
        emberPos[w + 1] = c.base + 0.2 + life * 1.3;
        emberPos[w + 2] = cz + Math.sin(a) * 0.25 + Math.cos(time * 2.5 + e) * 0.06 * life;
      }
    }
    flames.instanceMatrix.needsUpdate = true;
    glows.instanceMatrix.needsUpdate = true;
    (this.embers.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    for (const o of this.owned) o.dispose();
  }
}
