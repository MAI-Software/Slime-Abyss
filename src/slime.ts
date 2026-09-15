import * as THREE from 'three';
import { BlobMesh } from './blob-mesh';
import { World } from './world';
import type { Channel } from './level/format';
import { Assets } from './assets';
import { createContactShadowTexture } from './materials';
import { BODY_COLORS, DEFAULT_LOOK, type BodyColor, type SlimeLook } from './look';

// --- física ---
// El limo grande es un montón de limitos pequeños unidos por cohesión.
const R = 0.16;           // radio de colisión de cada limito
const REST = 0.24;        // distancia de reposo entre vecinos
const LINK = 0.58;        // alcance de la cohesión
const GROUP_LINK = 0.48;  // distancia para considerar mismo grupo
const K_REP = 330;
const K_ATT = 34;          // cohesión suave: se comporta como líquido, no como gelatina
// Borde: un limito que asoma sobre el vacío apenas se agarra al resto y se descuelga.
const OVERHANG_GRIP = 0.1;
const VISC = 2.2;
const GRAVITY = 20;
const MAX_V = 11;
const MAX_A = 140;
const JUMP_V = 7.6;
const PAD_V = 12.5;
const DRAG = 0.15;
// Control: el mando fija una velocidad objetivo y cada limito se acerca a ella.
// Arranca y frena rápido en suelo normal; en hielo apenas agarra; en el aire casi nada.
const MAX_SPEED = 4.6;
// El mando empuja sobre todo al CONJUNTO (velocidad media del trozo): por dentro el líquido
// sigue moviéndose, se agita al frenar y se desparrama. Un poco de empuje individual mantiene
// controlables las gotas sueltas.
const DRIVE_GROUP = 9;
const DRIVE_SELF = 2.2;
const DRIVE_ICE = 0.9;
const DRIVE_AIR = 1.0;
const FLOOR_FRICTION = 1.1;
// Inclinación: con el mando a fondo el suelo "se inclina" y el líquido corre hacia el lado bajo.
const SLOPE_ACC = 7;
// Esquinas de muro: la gota que roza la arista se frena y se suelta un momento.
const CORNER_LOOSE_T = 0.32;
const CORNER_GRIP = 0.12;
const WALL_DRAG = 5;
// Radio alrededor de la plataforma dentro del que el trozo sale lanzado entero:
// solo las gotas que van muy separadas se quedan atrás.
const PAD_REACH = 1.3;
const DIE_TIME = 0.35;
const SUBSTEPS = 3;
const STEP_UP = 0.56;       // escalón que el limo sube solo (0.5 de altura de losa)
const CUT_COOLDOWN = 0.7;   // tiempo sin cohesión entre mitades tras pasar por un divisor
const CUT_TAG_BASE = 1_000_000;

// --- render ---
const FACE_GROUPS = 4;
const FACE_MIN_SIZE = 8;
/** Inclinación de cámara por defecto (rad sobre la horizontal); la cara se orienta según ella. */
export const DEFAULT_PITCH = 1.08;
// Recoger objetos: las gotitas sueltas (sin cara) solo pisan interruptores y saltan en plataformas.
// Para el tesoro hace falta además un trozo con buena parte del limo, así una gota no acaba el piso.
const PICKUP_MIN = FACE_MIN_SIZE;
const TREASURE_SHARE = 0.3;
// Contorno: trazo de tinta alrededor del limo y silueta clara cuando un muro lo tapa.
const OUTLINE_WIDTH = 0.026;
const XRAY_LIFT = 0.2;

export type SlimeEvent =
  | { type: 'fall' | 'evaporate' | 'pad'; x: number; y: number; z: number }
  | { type: 'coin' | 'gem' | 'oil'; x: number; y: number; z: number }
  | { type: 'cut'; x: number; z: number }
  | { type: 'burn'; x: number; z: number; what: 'plant' | 'iceblock' }
  | { type: 'state'; from: SlimeState; to: SlimeState };

/**
  Reacciones del limo (todo el limo a la vez):
    normal  --aceite-->  oiled   --fuego-->  burning (quema plantas y hielo, no le daña el fuego)
    burning --fin o aire frío--> normal
    cualquiera --aire frío--> frozen (30 s: rígido, no gotea, viaja sobre las corrientes de aire)
    frozen  --fuego--> normal (se derrite sin daño)
*/
export type SlimeState = 'normal' | 'oiled' | 'burning' | 'frozen';
export const BURN_TIME = 12;
export const FREEZE_TIME = 30;
const WIND_ACC = 42;          // empuje del ventilador sobre el limo normal (lo deshace)
const WIND_SCATTER = 38;
const WIND_GRIP = 0.04;
const WIND_SINK = 30;
const WIND_FROZEN_ACC = 9;    // congelado: la corriente lo transporta entero
const HOVER_HEIGHT = 0.8;

const STATE_LOOK: Record<SlimeState, { color: number; emissive: number; rim: [number, number, number]; wobble: number }> = {
  normal: { color: 0x2f8cff, emissive: 0x0b3a8c, rim: [0.45, 0.8, 1.0], wobble: 1 },
  oiled: { color: 0xd49a1c, emissive: 0x5a3500, rim: [1.0, 0.85, 0.45], wobble: 0.8 },
  burning: { color: 0xff6a1a, emissive: 0xd23a00, rim: [1.0, 0.75, 0.2], wobble: 1.3 },
  frozen: { color: 0xbfe9ff, emissive: 0x3f8fc2, rim: [0.85, 0.97, 1.0], wobble: 0 },
};

export interface Group {
  ids: number[];
  cx: number; cy: number; cz: number;
  maxY: number; maxZ: number;
  vx: number; vz: number;
}

const tmpMatrix = new THREE.Matrix4();

export class Slime {
  readonly n: number;
  readonly px: Float32Array; readonly py: Float32Array; readonly pz: Float32Array;
  readonly vx: Float32Array; readonly vy: Float32Array; readonly vz: Float32Array;
  // posición al inicio del paso de física (para interpolar el dibujo entre pasos)
  private ox: Float32Array; private oy: Float32Array; private oz: Float32Array;
  private ax: Float32Array; private ay: Float32Array; private az: Float32Array;
  readonly alive: Uint8Array;
  readonly dying: Float32Array;
  private air: Float32Array;          // tiempo desde último contacto con suelo
  private groundCell: Int32Array;
  private tag: Uint32Array;
  private noAttr: Float32Array;
  private parent: Int32Array;
  private gid: Int32Array;
  private rootGroup: Int32Array;
  private padFlags: Uint8Array;
  private fell: Uint8Array;
  /** agarre de cada limito a sus vecinos (1 normal, OVERHANG_GRIP si asoma al vacío) */
  private grip: Float32Array;
  private loose: Float32Array;
  private gvx: Float32Array; private gvz: Float32Array; private gcnt: Float32Array;
  private padX: Float32Array; private padZ: Float32Array; private padTop: Float32Array;
  private lastCutEvent = -1;
  private time = 0;
  private readonly uniforms = { uTime: { value: 0 }, uWobble: { value: 1 }, uRim: { value: new THREE.Vector3(0.45, 0.8, 1.0) } };
  state: SlimeState = 'normal';
  stateT = 0;
  private material!: THREE.MeshStandardMaterial;
  private body: BodyColor = BODY_COLORS.blue;
  private readonly xrayColor = { value: new THREE.Color(0.6, 0.85, 1.0) };
  private outlineMaterials: THREE.Material[] = [];
  private sphereOutlines: THREE.InstancedMesh[] = [];
  /** orientación de la cámara (la pone el juego): la cara del limo mira hacia ella */
  camYaw = 0;
  camPitch = DEFAULT_PITCH;
  private burnHits: number[] = [];
  private tmpColor = new THREE.Color();
  private tmpRim = new THREE.Vector3();
  private tmpCoin = new THREE.Vector3();

  groups: Group[] = [];
  private groupPool: Group[] = [];
  events: SlimeEvent[] = [];
  /** posiciones (x, z) donde el limo ha recibido daño este frame */
  hurts: { x: number; z: number }[] = [];
  switchCounts: Record<Channel, number> = { A: 0, B: 0 };
  touchedTreasure = false;

  readonly group = new THREE.Group();
  private blob: BlobMesh;
  private spheres: THREE.InstancedMesh;
  private faces: Face[] = [];
  private contactShadows: THREE.Mesh[] = [];
  private shadowTex = createContactShadowTexture();

  constructor(private world: World, count: number, lowQuality: boolean, private assets: Assets, look: SlimeLook = DEFAULT_LOOK) {
    const n = (this.n = count);
    const f = () => new Float32Array(n);
    this.px = f(); this.py = f(); this.pz = f();
    this.ox = f(); this.oy = f(); this.oz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.ax = f(); this.ay = f(); this.az = f();
    this.dying = f(); this.air = f(); this.noAttr = f();
    this.alive = new Uint8Array(n).fill(1);
    this.groundCell = new Int32Array(n).fill(-1);
    this.tag = new Uint32Array(n);
    this.parent = new Int32Array(n);
    this.gid = new Int32Array(n).fill(-1);
    this.rootGroup = new Int32Array(n);
    this.padFlags = new Uint8Array(n);
    this.fell = new Uint8Array(n);
    this.grip = new Float32Array(n).fill(1);
    this.loose = new Float32Array(n);
    this.gvx = new Float32Array(n); this.gvz = new Float32Array(n); this.gcnt = new Float32Array(n);
    this.padX = new Float32Array(n); this.padZ = new Float32Array(n); this.padTop = new Float32Array(n);
    for (let k = 0; k < n; k++) this.groupPool.push({ ids: [], cx: 0, cy: 0, cz: 0, maxY: 0, maxZ: 0, vx: 0, vz: 0 });

    // aparición: espiral compacta en 3 capas, sin salirse a casillas de otra altura (muros, vacío)
    const s = world.start;
    const startTop = world.top(Math.floor(s.x), Math.floor(s.z));
    for (let k = 0; k < n; k++) {
      const a = k * 2.39996;
      const layer = k % 3;
      const rr = 0.13 * Math.sqrt(k / 3 + 0.5);
      let x = s.x + Math.cos(a) * rr;
      let z = s.z + Math.sin(a) * rr;
      if (world.top(Math.floor(x), Math.floor(z)) !== startTop) {
        x = Math.min(Math.max(x, Math.floor(s.x) + R), Math.floor(s.x) + 1 - R);
        z = Math.min(Math.max(z, Math.floor(s.z) + R), Math.floor(s.z) + 1 - R);
      }
      this.px[k] = this.ox[k] = x;
      this.pz[k] = this.oz[k] = z;
      this.py[k] = this.oy[k] = s.y + R + 0.05 + layer * REST;
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0x2f8cff,
      roughness: 0.14,
      metalness: 0,
      emissive: 0x0b3a8c,
      emissiveIntensity: 0.3,
    });
    // borde brillante: da aspecto de gelatina sin coste de transparencia
    material.envMapIntensity = 1.4;
    this.material = material;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uWobble = this.uniforms.uWobble;
      shader.uniforms.uRim = this.uniforms.uRim;
      // superficie viva: ondula suavemente y el interior brilla con vetas que se mueven
      shader.vertexShader = `uniform float uTime;\nuniform float uWobble;\nvarying vec3 vSlimePos;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
        float wob = sin(uTime * 5.0 + wp.x * 4.0 + wp.z * 3.0) * 0.5 + sin(uTime * 3.3 - wp.z * 5.0 + wp.y * 6.0) * 0.5;
        transformed += objectNormal * wob * 0.022 * uWobble;
        vSlimePos = wp;`,
      );
      shader.fragmentShader = `uniform float uTime;\nuniform vec3 uRim;\nvarying vec3 vSlimePos;\n${shader.fragmentShader}`.replace(
        '#include <opaque_fragment>',
        `float slimeRim = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0);
        float veins = sin(vSlimePos.x * 7.0 + uTime * 1.7) * sin(vSlimePos.z * 6.0 - uTime * 1.3) * sin(vSlimePos.y * 9.0 + uTime * 2.1);
        outgoingLight += uRim * pow(slimeRim, 2.2) * 0.6;
        outgoingLight += vec3(0.25, 0.55, 1.0) * smoothstep(0.35, 0.9, veins) * 0.12;
        #include <opaque_fragment>`,
      );
    };

    this.blob = lowQuality
      ? new BlobMesh(64, 0.17, material, n, 16000)
      : new BlobMesh(72, 0.15, material, n, 24000);
    this.blob.castShadow = true;
    this.group.add(this.blob);
    const hull = this.createHullMaterial();
    const xray = this.createXrayMaterial();
    this.outlineMaterials.push(hull, xray);
    // hijos del mallador: comparten geometría, posición y visibilidad
    for (const m of [hull, xray]) {
      const o = new THREE.Mesh(this.blob.geometry, m);
      o.frustumCulled = false;
      o.renderOrder = m === xray ? 20 : 0;
      this.blob.add(o);
    }

    const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false });
    for (let k = 0; k < FACE_GROUPS; k++) {
      const face = new Face(assets);
      this.faces.push(face);
      this.group.add(face.root);
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.renderOrder = 1;
      shadow.visible = false;
      this.contactShadows.push(shadow);
      this.group.add(shadow);
    }
    this.spheres = new THREE.InstancedMesh(new THREE.SphereGeometry(0.25, 12, 9), material, n);
    this.spheres.castShadow = true;
    this.spheres.frustumCulled = false;
    this.spheres.count = 0;
    this.group.add(this.spheres);
    for (const m of [hull, xray]) {
      const o = new THREE.InstancedMesh(this.spheres.geometry, m, n);
      o.instanceMatrix = this.spheres.instanceMatrix;
      o.frustumCulled = false;
      o.count = 0;
      o.renderOrder = m === xray ? 20 : 0;
      this.spheres.add(o);
      this.sphereOutlines.push(o);
    }

    this.computeGroups();
    this.setLook(look);
  }

  /** Color y cara elegidos en Mi limo. */
  setLook(look: SlimeLook) {
    this.body = BODY_COLORS[look.color];
    if (this.state === 'normal') {
      this.material.color.setHex(this.body.color);
      this.material.emissive.setHex(this.body.emissive);
      this.uniforms.uRim.value.set(...this.body.rim);
    }
    for (const f of this.faces) f.setLook(look);
  }

  /** Trazo de tinta: la cara trasera inflada un poco (con la misma ondulación que el cuerpo). */
  private createHullMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uWobble: this.uniforms.uWobble, uWidth: { value: OUTLINE_WIDTH } },
      side: THREE.BackSide,
      vertexShader: `
        #include <common>
        uniform float uTime; uniform float uWobble; uniform float uWidth;
        void main() {
          vec3 objectNormal = normal;
          vec3 transformed = position;
          #ifdef USE_INSTANCING
            vec3 wp = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
          #else
            vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          #endif
          float wob = sin(uTime * 5.0 + wp.x * 4.0 + wp.z * 3.0) * 0.5 + sin(uTime * 3.3 - wp.z * 5.0 + wp.y * 6.0) * 0.5;
          transformed += objectNormal * (wob * 0.022 * uWobble + uWidth);
          #include <project_vertex>
        }`,
      fragmentShader: `void main() { gl_FragColor = vec4(0.055, 0.07, 0.16, 1.0); }`,
    });
  }

  /** Silueta cuando algo lo tapa: solo se pinta donde hay algo delante (profundidad mayor). */
  private createXrayMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: this.xrayColor },
      transparent: true,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      vertexShader: `
        #include <common>
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec3 transformed = position;
          #include <project_vertex>
          // un poco hacia la cámara: el propio limo y el suelo que pisa no cuentan como obstáculo
          mvPosition.xyz += normalize(-mvPosition.xyz) * ${XRAY_LIFT.toFixed(3)};
          gl_Position = projectionMatrix * mvPosition;
          #ifdef USE_INSTANCING
            vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          #else
            vN = normalize(normalMatrix * normal);
          #endif
          vV = normalize(-mvPosition.xyz);
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float rim = 1.0 - max(dot(normalize(vN), vV), 0.0);
          float a = mix(0.22, 0.95, smoothstep(0.35, 0.85, rim));
          gl_FragColor = vec4(mix(uColor, vec3(1.0), rim * 0.4), a);
        }`,
    });
  }

  /** Centro de masa de los trozos visibles (para la cámara). */
  center(out: THREE.Vector3): boolean {
    let c = 0, x = 0, y = 0, z = 0;
    for (const g of this.groups) {
      const k = g.ids.length;
      if (k < FACE_MIN_SIZE && this.groups.length > 1) continue;
      x += g.cx * k; y += g.cy * k; z += g.cz * k; c += k;
    }
    if (!c) return false;
    out.set(x / c, y / c, z / c);
    return true;
  }

  get aliveCount(): number {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.alive[i] && this.dying[i] === 0) c++;
    return c;
  }

  // ---------------------------------------------------------------- reacciones

  celebrate() { for (const f of this.faces) f.cheer(10); }
  /** Rebote de la cara (al cambiarle el aspecto). */
  poke() { for (const f of this.faces) f.poke(); }

  private setState(to: SlimeState) {
    if (to === this.state && to !== 'frozen' && to !== 'burning') return;
    const from = this.state;
    this.state = to;
    this.stateT = to === 'burning' ? BURN_TIME : to === 'frozen' ? FREEZE_TIME : 0;
    if (from !== to) this.events.push({ type: 'state', from, to });
  }

  /** Un limito al azar (para que el juego ponga llamas o escarcha encima). */
  randomParticle(out: THREE.Vector3): boolean {
    for (let tries = 0; tries < 6; tries++) {
      const i = Math.floor(Math.random() * this.n);
      if (this.alive[i] && this.dying[i] === 0) { out.set(this.px[i], this.py[i], this.pz[i]); return true; }
    }
    return false;
  }

  // ---------------------------------------------------------------- simulación

  /** tiltX/tiltZ: dirección del mando en [-1, 1] (x derecha, z hacia la cámara). */
  step(dt: number, tiltX: number, tiltZ: number) {
    this.ox.set(this.px);
    this.oy.set(this.py);
    this.oz.set(this.pz);
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      this.time += h;
      this.substep(h, tiltX, tiltZ);
    }
    this.postStep(dt);
    this.computeGroups();
  }

  private substep(h: number, tiltX: number, tiltZ: number) {
    const { n, px, py, pz, vx, vy, vz, ax, ay, az, alive, tag, noAttr, time, grip } = this;
    const link2 = LINK * LINK;
    const frozen = this.state === 'frozen';
    const kAttr = frozen ? K_ATT * 5 : K_ATT;
    const kVisc = frozen ? VISC * 6 : VISC;
    const w = this.world;
    for (let i = 0; i < n; i++) {
      ax[i] = 0;
      ay[i] = -GRAVITY;
      az[i] = 0;
      if (!alive[i]) continue;
      // corriente de un ventilador
      const ci = Math.floor(px[i]), cj = Math.floor(pz[i]);
      if (ci < 0 || cj < 0 || ci >= w.w || cj >= w.d) continue;
      const idx = cj * w.w + ci;
      const wx = w.windX[idx], wz = w.windZ[idx];
      if (wx === 0 && wz === 0 || py[i] > w.windBase[idx] + 2.2) continue;
      const pow = Math.hypot(wx, wz);
      if (frozen) {
        // flota a media altura y se deja llevar entero
        ax[i] += wx * WIND_FROZEN_ACC;
        az[i] += wz * WIND_FROZEN_ACC;
        ay[i] += GRAVITY + (w.windBase[idx] + HOVER_HEIGHT - py[i]) * 30 - vy[i] * 7;
      } else {
        // lo empuja y lo esparce: se deshace. Sobre el vacío no hay colchón de aire que lo sostenga:
        // la turbulencia lo hunde (solo el limo congelado es capaz de flotar en la corriente)
        ax[i] += wx * WIND_ACC + (Math.random() - 0.5) * WIND_SCATTER * pow;
        az[i] += wz * WIND_ACC + (Math.random() - 0.5) * WIND_SCATTER * pow;
        ay[i] += w.cells[idx].top === -Infinity ? -WIND_SINK * pow : 5 * pow;
      }
    }

    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const pxi = px[i], pyi = py[i], pzi = pz[i];
      for (let j = i + 1; j < n; j++) {
        if (!alive[j]) continue;
        const dx = px[j] - pxi;
        const dy = py[j] - pyi;
        const dz = pz[j] - pzi;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= link2 || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d, nz = dz / d;
        // tras DIVIDIR, las mitades solo se empujan: sin cohesión ni viscosidad
        const bonded = tag[i] === tag[j] || (time > noAttr[i] && time > noAttr[j]);
        let f = 0;
        if (d < REST) {
          f = -K_REP * (REST - d);
        } else if (bonded) {
          const t = (d - REST) / (LINK - REST);
          f = kAttr * (d - REST) * (1 - t * t) * Math.min(grip[i], grip[j]);
        }
        if (bonded) {
          const rv = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny + (vz[j] - vz[i]) * nz;
          f += kVisc * rv * Math.min(grip[i], grip[j]);
        }
        const fx = nx * f, fy = ny * f, fz = nz * f;
        ax[i] += fx; ay[i] += fy; az[i] += fz;
        ax[j] -= fx; ay[j] -= fy; az[j] -= fz;
      }
    }

    const dragK = 1 - DRAG * h;
    const cells = this.world.cells;
    const tvx = tiltX * MAX_SPEED, tvz = tiltZ * MAX_SPEED;
    const kGroup = 1 - Math.exp(-DRIVE_GROUP * h);
    const kSelf = 1 - Math.exp(-DRIVE_SELF * h);
    const kIce = 1 - Math.exp(-DRIVE_ICE * h);
    const kAir = 1 - Math.exp(-DRIVE_AIR * h);
    const fric = 1 - FLOOR_FRICTION * h;
    const mag2 = tiltX * tiltX + tiltZ * tiltZ;
    const slopeX = tiltX * mag2 * SLOPE_ACC, slopeZ = tiltZ * mag2 * SLOPE_ACC;

    // velocidad media de cada trozo (agrupación del último paso)
    const { gid, gvx, gvz, gcnt } = this;
    gvx.fill(0); gvz.fill(0); gcnt.fill(0);
    for (let i = 0; i < n; i++) {
      const g = gid[i];
      if (!alive[i] || g < 0) continue;
      gvx[g] += vx[i]; gvz[g] += vz[i]; gcnt[g]++;
    }
    for (let g = 0; g < n; g++) if (gcnt[g] > 0) { gvx[g] /= gcnt[g]; gvz[g] /= gcnt[g]; }

    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const a2 = ax[i] * ax[i] + ay[i] * ay[i] + az[i] * az[i];
      if (a2 > MAX_A * MAX_A) {
        const k = MAX_A / Math.sqrt(a2);
        ax[i] *= k; ay[i] *= k; az[i] *= k;
      }
      const onGround = this.air[i] < 0.08;
      if (onGround) { ax[i] += slopeX; az[i] += slopeZ; }
      if (frozen) {
        // hielo: todo el trozo se mueve como un bloque
        const g = gid[i];
        if (g >= 0 && gcnt[g] > 0) {
          vx[i] += (gvx[g] - vx[i]) * 0.3;
          vz[i] += (gvz[g] - vz[i]) * 0.3;
        }
      }
      vx[i] = (vx[i] + ax[i] * h) * dragK;
      vy[i] = (vy[i] + ay[i] * h) * dragK;
      vz[i] = (vz[i] + az[i] * h) * dragK;
      const sp2 = vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i];
      if (sp2 > MAX_V * MAX_V) {
        const k = MAX_V / Math.sqrt(sp2);
        vx[i] *= k; vy[i] *= k; vz[i] *= k;
      }
      px[i] += vx[i] * h;
      py[i] += vy[i] * h;
      pz[i] += vz[i] * h;
      this.air[i] += h;
      this.collide(i);
      const cell = this.groundCell[i];
      const g = gid[i];
      const avx = g >= 0 && gcnt[g] > 0 ? gvx[g] : vx[i];
      const avz = g >= 0 && gcnt[g] > 0 ? gvz[g] : vz[i];
      if (this.air[i] > 0.08) {
        vx[i] += (tvx - vx[i]) * kAir;
        vz[i] += (tvz - vz[i]) * kAir;
      } else if (cell >= 0 && cells[cell].kind === 'ice') {
        vx[i] += (tvx - avx) * kIce;
        vz[i] += (tvz - avz) * kIce;
      } else {
        // la gota suelta (esquina, borde) apenas recibe el empuje del conjunto: se queda atrás
        const gk = kGroup * grip[i];
        vx[i] = (vx[i] + (tvx - avx) * gk + (tvx - vx[i]) * kSelf) * fric;
        vz[i] = (vz[i] + (tvz - avz) * gk + (tvz - vz[i]) * kSelf) * fric;
      }
    }
  }

  private collide(i: number) {
    const w = this.world;
    let x = this.px[i], y = this.py[i], z = this.pz[i];
    const i0 = Math.floor(x - R), i1 = Math.floor(x + R);
    const j0 = Math.floor(z - R), j1 = Math.floor(z + R);
    for (let cj = j0; cj <= j1; cj++) {
      for (let ci = i0; ci <= i1; ci++) {
        const top = w.top(ci, cj);
        if (top === -Infinity || y - R >= top) continue;
        const qx = Math.min(Math.max(x, ci), ci + 1);
        const qy = Math.min(y, top);
        const qz = Math.min(Math.max(z, cj), cj + 1);
        const dx = x - qx, dy = y - qy, dz = z - qz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= R * R) continue;
        // escalón bajo: el limo lo trepa en vez de chocar
        const climb = top - (y - R);
        if (climb > 0.02 && climb <= STEP_UP && dy <= 0 && top - this.world.top(Math.floor(x), Math.floor(z)) <= STEP_UP + 0.01) {
          y = top + R;
          if (this.vy[i] < 0) this.vy[i] = 0;
          this.air[i] = 0;
          this.groundCell[i] = cj * w.w + ci;
          continue;
        }
        let nx: number, ny: number, nz: number, pen: number;
        if (d2 < 1e-9) {
          // centro dentro del bloque: salir por la cara más cercana
          const up = top - y;
          const l = x - ci, r = ci + 1 - x, b = z - cj, f = cj + 1 - z;
          const m = Math.min(up, l, r, b, f);
          if (m === up) { nx = 0; ny = 1; nz = 0; }
          else if (m === l) { nx = -1; ny = 0; nz = 0; }
          else if (m === r) { nx = 1; ny = 0; nz = 0; }
          else if (m === b) { nx = 0; ny = 0; nz = -1; }
          else { nx = 0; ny = 0; nz = 1; }
          pen = m + R;
        } else {
          const d = Math.sqrt(d2);
          nx = dx / d; ny = dy / d; nz = dz / d;
          pen = R - d;
        }
        x += nx * pen; y += ny * pen; z += nz * pen;
        const vn = this.vx[i] * nx + this.vy[i] * ny + this.vz[i] * nz;
        if (vn < 0) {
          this.vx[i] -= nx * vn;
          this.vy[i] -= ny * vn;
          this.vz[i] -= nz * vn;
        }
        if (ny < 0.5 && this.state === 'burning' && w.burnable(ci, cj)) this.burnHits.push(cj * w.w + ci);
        if (ny < 0.5 && this.state !== 'frozen') {
          // contra un muro: el líquido se pega un poco; en la arista vertical, se suelta una gota
          const drag = 1 - WALL_DRAG / 180;
          this.vx[i] *= drag;
          this.vz[i] *= drag;
          if (qx !== x - nx * pen && qz !== z - nz * pen && y < top) {
            if (this.loose[i] <= 0) { this.vx[i] *= 0.55; this.vz[i] *= 0.55; }
            this.loose[i] = CORNER_LOOSE_T;
          }
        }
        if (ny > 0.5) {
          this.air[i] = 0;
          this.groundCell[i] = cj * w.w + ci;
        }
      }
    }
    // cuchillas y pinchos: cajas finas dentro de la casilla
    for (let cj = j0; cj <= j1; cj++) {
      for (let ci = i0; ci <= i1; ci++) {
        const o = w.obstacle(ci, cj);
        if (!o || y - R >= o.maxY) continue;
        const qx = Math.min(Math.max(x, o.minX), o.maxX);
        const qy = Math.min(Math.max(y, o.minY), o.maxY);
        const qz = Math.min(Math.max(z, o.minZ), o.maxZ);
        const dx = x - qx, dy = y - qy, dz = z - qz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= R * R) continue;
        let nx: number, ny: number, nz: number, pen: number;
        if (d2 < 1e-9) {
          // dentro de la hoja: expulsar hacia el lado más cercano del eje de corte
          if (o.axis === 'x') { nx = 0; ny = 0; nz = z < o.cz ? -1 : 1; pen = R + (o.maxZ - o.minZ) / 2 - Math.abs(z - o.cz); }
          else { nx = x < o.cx ? -1 : 1; ny = 0; nz = 0; pen = R + (o.maxX - o.minX) / 2 - Math.abs(x - o.cx); }
        } else {
          const d = Math.sqrt(d2);
          nx = dx / d; ny = dy / d; nz = dz / d;
          pen = R - d;
        }
        x += nx * pen; y += ny * pen; z += nz * pen;
        const vn = this.vx[i] * nx + this.vy[i] * ny + this.vz[i] * nz;
        if (vn < 0) {
          this.vx[i] -= nx * vn;
          this.vy[i] -= ny * vn;
          this.vz[i] -= nz * vn;
        }
      }
    }
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
  }

  /**
    Divisores: los limitos que pasan cerca del filo quedan etiquetados según el lado.
    Mientras dura el enfriamiento, las dos mitades no se atraen y se separan solas.
  */
  private applyDividers(i: number) {
    const w = this.world;
    const x = this.px[i], z = this.pz[i];
    const ci = Math.floor(x), cj = Math.floor(z);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const o = w.obstacle(ci + di, cj + dj);
        if (!o || this.py[i] > o.maxY + 0.25) continue;
        let side: number;
        if (o.kind === 'blade') {
          const across = o.axis === 'x' ? z - o.cz : x - o.cx;
          const along = o.axis === 'x' ? x - o.cx : z - o.cz;
          if (Math.abs(across) > 0.34 || Math.abs(along) > 0.6) continue;
          side = across < 0 ? 0 : 1;
        } else {
          const rx = x - o.cx, rz = z - o.cz;
          if (rx * rx + rz * rz > 0.5 * 0.5) continue;
          // lado respecto a la dirección en que avanza este limito
          side = this.vx[i] * rz - this.vz[i] * rx < 0 ? 0 : 1;
        }
        const tag = CUT_TAG_BASE + o.id * 2 + side;
        if (this.tag[i] !== tag && this.lastCutEvent !== o.id) {
          this.lastCutEvent = o.id;
          this.events.push({ type: 'cut', x: o.cx, z: o.cz });
        }
        this.tag[i] = tag;
        this.noAttr[i] = this.time + CUT_COOLDOWN;
        return;
      }
    }
  }

  /**
    ¿Asoma este limito por un borde? Su centro está sobre vacío y a la altura del suelo
    de al lado (no vale si va volando por encima, p. ej. tras una plataforma de salto).
  */
  private overhanging(x: number, y: number, z: number): boolean {
    const w = this.world;
    const ci = Math.floor(x), cj = Math.floor(z);
    if (w.top(ci, cj) !== -Infinity) return false;
    let edge = -Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) edge = Math.max(edge, w.top(ci + di, cj + dj));
    return edge !== -Infinity && y < edge + R + 0.35;
  }

  private postStep(dt: number) {
    const w = this.world;
    if (this.lastCutEvent >= 0 && Math.random() < dt * 2) this.lastCutEvent = -1;
    // temporizadores de estado y obstáculos quemados
    if (this.stateT > 0) {
      this.stateT -= dt;
      if (this.stateT <= 0) this.setState('normal');
    }
    for (const idx of this.burnHits) {
      const ci = idx % w.w, cj = Math.floor(idx / w.w);
      const what = w.burn(ci, cj);
      if (what) this.events.push({ type: 'burn', x: ci + 0.5, z: cj + 0.5, what });
    }
    this.burnHits.length = 0;
    this.switchCounts.A = 0;
    this.switchCounts.B = 0;
    this.touchedTreasure = false;
    const t = w.treasure;
    const largest = this.groups[0]?.ids.length ?? 0;
    const pickMin = Math.min(largest, PICKUP_MIN);
    const treasureMin = Math.min(largest, Math.max(PICKUP_MIN, this.aliveCount * TREASURE_SHARE));
    const pad = this.padFlags;
    pad.fill(0);
    let anyPad = false;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      const x = this.px[i], y = this.py[i], z = this.pz[i];

      if (this.dying[i] > 0) {
        this.dying[i] += dt;
        this.vx[i] *= 0.9; this.vz[i] *= 0.9;
        if (this.dying[i] >= DIE_TIME) {
          this.alive[i] = 0;
          this.events.push({ type: 'evaporate', x, y, z });
        }
        continue;
      }

      if (y < -6) {
        this.alive[i] = 0;
        this.events.push({ type: 'fall', x, y, z });
        continue;
      }

      this.applyDividers(i);
      this.loose[i] = Math.max(0, this.loose[i] - dt);
      const ci = Math.floor(x), cj = Math.floor(z);
      const under = w.cell(ci, cj);
      const idx = under ? cj * w.w + ci : -1;
      const inWind = idx >= 0 && (w.windX[idx] !== 0 || w.windZ[idx] !== 0) && y < w.windBase[idx] + 2.2;
      if (this.state === 'frozen') this.grip[i] = 1;
      else if (inWind) this.grip[i] = WIND_GRIP;
      else this.grip[i] = this.overhanging(x, y, z) ? OVERHANG_GRIP : this.loose[i] > 0 ? CORNER_GRIP : 1;

      const chunk = this.gid[i] >= 0 ? this.groups[this.gid[i]].ids.length : 0;
      if (under && (under.kind === 'coin' || under.kind === 'gem' || under.kind === 'oil') && y < under.base + 1.3 && chunk >= pickMin) {
        const got = w.collectCoin(ci, cj);
        if (got) {
          const c = w.coinPosition(ci, cj, this.tmpCoin);
          this.events.push({ type: got, x: c.x, y: c.y, z: c.z });
          if (got === 'oil') { if (this.state !== 'burning') this.setState('oiled'); }
          else for (const f of this.faces) f.cheer(got === 'gem' ? 1.2 : 0.5);
        }
      }
      // aire frío: congela (o apaga las llamas)
      if (under && w.isCold(ci, cj) && y < under.base + 1.6) {
        if (this.state === 'burning') this.setState('normal');
        else if (this.state !== 'frozen' || this.stateT < FREEZE_TIME - 0.5) this.setState('frozen');
      }
      if (under && w.fireActive(ci, cj) && y < under.base + 0.8) {
        if (this.state === 'oiled') this.setState('burning');
        else if (this.state === 'frozen') this.setState('normal');
        else if (this.state !== 'burning') {
          this.dying[i] = 1e-4;
          this.hurts.push({ x, z });
          continue;
        }
      }
      if (!this.fell[i] && y < -0.8) {
        this.fell[i] = 1;
        this.hurts.push({ x, z });
      }

      // plataforma de salto: si un limito pisa la tapa, se lanza su trozo (ver abajo)
      if (under && under.kind === 'jump' && this.air[i] < 0.06 && this.vy[i] < PAD_V * 0.5 && this.gid[i] >= 0) {
        const fx = x - ci, fz = z - cj;
        if (Math.abs(fx - 0.5) < 0.4 && Math.abs(fz - 0.5) < 0.4) {
          const g = this.gid[i];
          if (!pad[g]) {
            pad[g] = 1;
            this.padX[g] = ci + 0.5;
            this.padZ[g] = cj + 0.5;
            this.padTop[g] = under.top;
          }
          anyPad = true;
          if (w.triggerPad(ci, cj)) this.events.push({ type: 'pad', x, y, z });
        }
      }
      if (this.air[i] < 0.06 && this.groundCell[i] >= 0) {
        const gc = w.cells[this.groundCell[i]];
        if (gc.kind === 'switch' && gc.channel) this.switchCounts[gc.channel]++;
      }

      const dx = x - t.x, dz = z - t.z;
      if (dx * dx + dz * dz < 0.55 && y < t.y + 1.2 && chunk >= treasureMin) this.touchedTreasure = true;
    }
    if (!anyPad) return;
    // sale lanzado todo el trozo que está sobre la plataforma o pegado a ella;
    // solo las gotas que van lejos (cola larga, restos sueltos) se quedan
    const reach2 = PAD_REACH * PAD_REACH;
    for (let k = 0; k < this.groups.length; k++) {
      if (!pad[k]) continue;
      for (const i of this.groups[k].ids) {
        const dx = this.px[i] - this.padX[k], dz = this.pz[i] - this.padZ[k];
        if (dx * dx + dz * dz > reach2 || this.py[i] > this.padTop[k] + 1.6 || this.vy[i] >= PAD_V * 0.5) continue;
        this.vy[i] = PAD_V;
        this.air[i] = 1;
      }
    }
  }

  private find(i: number): number {
    const p = this.parent;
    while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; }
    return i;
  }

  private static bySize = (a: Group, b: Group) => b.ids.length - a.ids.length;

  /** Agrupa limitos conectados. Reutiliza objetos: sin basura por frame. */
  private computeGroups() {
    const { n, px, py, pz, alive, parent, rootGroup } = this;
    for (let i = 0; i < n; i++) parent[i] = i;
    const l2 = GROUP_LINK * GROUP_LINK;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!alive[j]) continue;
        const dx = px[j] - px[i], dy = py[j] - py[i], dz = pz[j] - pz[i];
        if (dx * dx + dy * dy + dz * dz < l2) {
          const a = this.find(i), b = this.find(j);
          if (a !== b) parent[a] = b;
        }
      }
    }
    rootGroup.fill(-1);
    const groups = this.groups;
    groups.length = 0;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const root = this.find(i);
      let k = rootGroup[root];
      if (k < 0) {
        k = rootGroup[root] = groups.length;
        const g = this.groupPool[k];
        g.ids.length = 0;
        g.cx = g.cy = g.cz = g.vx = g.vz = 0;
        g.maxY = g.maxZ = -Infinity;
        groups.push(g);
      }
      const g = groups[k];
      g.ids.push(i);
      g.cx += px[i]; g.cy += py[i]; g.cz += pz[i];
      g.vx += this.vx[i]; g.vz += this.vz[i];
      if (py[i] > g.maxY) g.maxY = py[i];
      if (pz[i] > g.maxZ) g.maxZ = pz[i];
    }
    groups.sort(Slime.bySize);
    this.gid.fill(-1);
    for (let k = 0; k < groups.length; k++) {
      const g = groups[k];
      const c = g.ids.length;
      g.cx /= c; g.cy /= c; g.cz /= c; g.vx /= c; g.vz /= c;
      for (const i of g.ids) this.gid[i] = k;
    }
  }

  // ---------------------------------------------------------------- render

  /** alpha: fracción entre el paso de física anterior y el actual (0..1). */
  render(dt: number, alpha: number, lookX: number, lookZ: number) {
    this.uniforms.uTime.value += dt;
    const look = this.state === 'normal' ? this.body : STATE_LOOK[this.state];
    const k = 1 - Math.exp(-dt * 6);
    this.material.color.lerp(this.tmpColor.setHex(look.color), k);
    this.material.emissive.lerp(this.tmpColor.setHex(look.emissive), k);
    const flicker = this.state === 'burning' ? 0.5 + Math.sin(this.uniforms.uTime.value * 23) * 0.15 + Math.random() * 0.1 : 0.3;
    this.material.emissiveIntensity += (flicker - this.material.emissiveIntensity) * k;
    this.material.roughness += ((this.state === 'frozen' ? 0.05 : 0.14) - this.material.roughness) * k;
    this.uniforms.uWobble.value += (STATE_LOOK[this.state].wobble - this.uniforms.uWobble.value) * k;
    this.uniforms.uRim.value.lerp(this.tmpRim.set(...look.rim), k);
    this.xrayColor.value.setRGB(...look.rim);
    for (const f of this.faces) f.frozen = this.state === 'frozen';
    const { n, px, py, pz, ox, oy, oz, alive, dying } = this;
    const lead = this.groups[0];
    let used = 0;

    if (lead) {
      this.blob.begin(lead.cx, lead.cy, lead.cz);
      const spheres = this.spheres;
      for (let i = 0; i < n; i++) {
        if (!alive[i]) continue;
        const x = ox[i] + (px[i] - ox[i]) * alpha;
        const y = oy[i] + (py[i] - oy[i]) * alpha;
        const z = oz[i] + (pz[i] - oz[i]) * alpha;
        const life = dying[i] > 0 ? Math.max(1 - dying[i] / DIE_TIME, 0.05) : 1;
        if (this.blob.addBall(x, y, z, life)) continue;
        // fuera de la rejilla (muy lejos o cayendo): esfera simple
        tmpMatrix.makeScale(life, life * 0.85, life);
        tmpMatrix.setPosition(x, y - 0.03, z);
        spheres.setMatrixAt(used++, tmpMatrix);
      }
      this.blob.end();
    } else {
      this.blob.visible = false;
    }
    this.spheres.count = used;
    for (const o of this.sphereOutlines) o.count = used;
    if (used) this.spheres.instanceMatrix.needsUpdate = true;

    for (let k = 0; k < FACE_GROUPS; k++) {
      const g = this.groups[k];
      const face = this.faces[k];
      const shadow = this.contactShadows[k];
      if (!g || g.ids.length < FACE_MIN_SIZE) { face.hide(); shadow.visible = false; continue; }
      // sombra de contacto sobre la casilla de debajo (se desvanece al alejarse del suelo)
      const floorY = this.world.top(Math.floor(g.cx), Math.floor(g.cz));
      const above = g.cy - floorY;
      shadow.visible = floorY !== -Infinity && above < 3;
      if (shadow.visible) {
        const size = (1.1 + g.ids.length / 28) * (1 - Math.min(above, 3) / 4.5);
        shadow.position.set(g.cx, floorY + 0.015, g.cz + 0.05);
        shadow.scale.set(size, 1, size * 0.9);
      }
      let airborne = 0;
      for (const i of g.ids) if (this.air[i] > 0.15) airborne++;
      face.update(g, dt, lookX, lookZ, airborne / g.ids.length, this.camYaw, this.camPitch);
    }

    // daño → cara de dolor en el trozo más cercano
    for (const h of this.hurts) {
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < FACE_GROUPS; k++) {
        const g = this.groups[k];
        if (!g || !this.faces[k].root.visible) continue;
        const d = (g.cx - h.x) ** 2 + (g.cz - h.z) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      this.faces[best].hurt();
    }
    this.hurts.length = 0;
  }

  dispose() {
    this.blob.geometry.dispose();
    this.contactShadows[0]?.geometry.dispose();
    (this.contactShadows[0]?.material as THREE.Material | undefined)?.dispose();
    this.shadowTex.dispose();
    this.spheres.geometry.dispose();
    (this.spheres.material as THREE.Material).dispose();
    for (const f of this.faces) f.dispose();
    for (const m of this.outlineMaterials) m.dispose();
  }
}

// ------------------------------------------------------------------ cara

type Expr = 'idle' | 'wee' | 'air' | 'happy' | 'pain' | 'dizzy' | 'frozen';

/**
  Cara kawaii modelada en Blender (face_*). Ojos, boca en reposo y mofletes se eligen en Mi limo (setLook);
  las demás expresiones son comunes.
  Expresiones: idle (sonrisa + parpadeo), wee (deslizándose rápido), air (en el aire),
  happy (salto / tesoro) y pain (daño: > <, lágrimas y gota de sudor).
*/
class Face {
  readonly root = new THREE.Group();
  private eyes: THREE.Object3D[] = [];
  private looks: THREE.Object3D[] = [];
  private eyesPain: THREE.Object3D[] = [];
  private eyesHappy: THREE.Object3D[] = [];
  private eyesDizzy: THREE.Object3D[] = [];
  private mouths: Record<'open' | 'o' | 'pain', THREE.Object3D>;
  private idleMouth: THREE.Object3D | null = null;
  private blush: THREE.Object3D[] = [];
  private tears: THREE.Object3D[] = [];
  private sweat: THREE.Object3D;
  private materials: THREE.Material[] = [];
  private pos = new THREE.Vector3();
  private initialized = false;
  private blinkT = 2 + Math.random() * 2;
  private painT = 0;
  // mareo: se acumula con los cambios bruscos de velocidad y se va pasando solo
  private dizzyT = 0;
  frozen = false;
  private agitation = 0;
  private prevVx = 0;
  private prevVz = 0;
  private prevSize = 0;
  private lastDirX = 0;
  private lastDirZ = 0;
  private happyT = 0;
  private scale = 1;
  private bounce = 0;
  private t = 0;

  constructor(private assets: Assets) {
    const part = this.part.bind(this);
    for (const side of [-1, 1]) {
      this.eyesPain.push(part('face_eye_pain', side * 0.1, 0.035, 0.01, side > 0));
      this.eyesHappy.push(part('face_eye_happy', side * 0.1, 0.045, 0.01));
      this.eyesDizzy.push(part('face_eye_dizzy', side * 0.1, 0.035, 0.012, side > 0));
      this.tears.push(part('face_tear', side * 0.155, 0.0, 0.01));
    }
    this.mouths = {
      open: part('face_mouth_open', 0, -0.05, 0.005),
      o: part('face_mouth_o', 0, -0.065, 0.005),
      pain: part('face_mouth_pain', 0, -0.065, 0.01),
    };
    this.sweat = part('face_sweat', 0.2, 0.13, 0.01);
    this.root.rotation.order = 'YXZ';
    this.root.visible = false;
    this.setLook(DEFAULT_LOOK);
  }

  private part(name: string, x: number, y: number, z: number, mirror = false) {
    const o = this.assets.clone(name, { unlit: true });
    o.position.set(x, y, z);
    if (mirror) o.scale.x = -1;
    o.userData.rest = o.position.clone();
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      this.materials.push(m.material as THREE.Material);
      m.renderOrder = 5;
    });
    this.root.add(o);
    return o;
  }

  private removePart(o: THREE.Object3D) {
    this.root.remove(o);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      mat.dispose();
      this.materials.splice(this.materials.indexOf(mat), 1);
    });
  }

  setLook(look: SlimeLook) {
    for (const o of [...this.eyes, ...this.blush]) this.removePart(o);
    if (this.idleMouth) this.removePart(this.idleMouth);
    this.eyes = [];
    this.looks = [];
    this.blush = [];
    for (const side of [-1, 1]) {
      const eye = this.part(`face_eye_${look.eyes}`, side * 0.1, 0.035, 0);
      const lookAt = eye.getObjectByName(`face_eye_${look.eyes}_look`) ?? eye;
      lookAt.userData.rest = lookAt.position.clone();
      this.eyes.push(eye);
      this.looks.push(lookAt);
      if (look.cheeks !== 'none') this.blush.push(this.part(`face_blush_${look.cheeks}`, side * 0.175, -0.035, -0.005));
    }
    this.idleMouth = this.part(`face_mouth_${look.mouth}`, 0, -0.055, 0.01);
  }

  poke() { this.bounce = 1; }
  hurt() { this.painT = 0.9; this.happyT = 0; this.bounce = 1; }
  cheer(t: number) {
    if (this.painT > 0) return;
    if (this.happyT <= 0) this.bounce = 1;
    this.happyT = Math.max(this.happyT, t);
  }

  update(g: Group, dt: number, lookX: number, lookZ: number, airFrac: number, yaw: number, pitch: number) {
    this.t += dt;
    this.painT -= dt;
    this.happyT -= dt;
    this.dizzyT -= dt;
    this.bounce = Math.max(0, this.bounce - dt * 4);

    // agitación: aceleración del trozo (ignora cambios de trozo, que dan saltos falsos)
    const size = g.ids.length;
    if (Math.abs(size - this.prevSize) <= Math.max(3, this.prevSize * 0.2)) {
      const accel = Math.hypot(g.vx - this.prevVx, g.vz - this.prevVz) / Math.max(dt, 1e-3);
      if (accel > 14) this.agitation += (accel - 14) * dt * 0.04;
    }
    this.prevVx = g.vx;
    this.prevVz = g.vz;
    this.prevSize = size;
    // lo que de verdad marea: que el jugador invierta el mando una y otra vez (agitar)
    const im = Math.hypot(lookX, lookZ);
    if (im > 0.55) {
      const nx = lookX / im, nz = lookZ / im;
      if (this.lastDirX * nx + this.lastDirZ * nz < -0.3) this.agitation += 0.4;
      this.lastDirX = nx;
      this.lastDirZ = nz;
    }
    this.agitation = Math.max(0, this.agitation - dt * 0.7);
    if (this.agitation > 1.1 && this.painT <= 0) {
      if (this.dizzyT <= 0) this.bounce = 1;
      this.dizzyT = 2;
      this.agitation = 0.8;
    }

    // arriba y en el lado del trozo que da a la cámara, inclinada hacia ella
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const out = Math.max(0.2, g.maxZ - g.cz) + 0.24;
    const tx = g.cx + sy * out;
    const ty = g.maxY * 0.6 + g.cy * 0.4 + 0.16;
    const tz = g.cz + cy * out;
    // velocidad vista desde la cámara (x: derecha de la pantalla, z: hacia la cámara)
    const svx = g.vx * cy - g.vz * sy;
    const svz = g.vx * sy + g.vz * cy;
    const k = 1 - Math.exp(-dt * 18);
    if (!this.initialized) { this.pos.set(tx, ty, tz); this.initialized = true; }
    else {
      this.pos.x += (tx - this.pos.x) * k;
      this.pos.y += (ty - this.pos.y) * k;
      this.pos.z += (tz - this.pos.z) * k;
    }

    const speed = Math.hypot(g.vx, g.vz);
    let expr: Expr = 'idle';
    if (this.painT > 0) expr = 'pain';
    else if (this.happyT > 0) expr = 'happy';
    else if (this.frozen) expr = 'frozen';
    else if (this.dizzyT > 0) expr = 'dizzy';
    else if (airFrac > 0.6) expr = 'air';
    else if (speed > 4.4) expr = 'wee';

    const want = Math.min(2.6, Math.max(1.0, 0.9 + g.ids.length / 32));
    this.scale += (want - this.scale) * k;

    this.blinkT -= dt;
    let open = 1;
    if (this.blinkT < 0) {
      open = 0.12;
      if (this.blinkT < -0.1) this.blinkT = 2 + Math.random() * 3;
    }

    const normalEyes = expr === 'idle' || expr === 'wee' || expr === 'air' || expr === 'frozen';
    // mirada: el iris se desplaza dentro del blanco hacia donde va el limo
    const lx = Math.max(-1, Math.min(1, svx * 0.2 + lookX * 0.5)) * 0.016;
    const ly = (expr === 'air' ? 1 : Math.max(-1, Math.min(1, -svz * 0.12 - lookZ * 0.3))) * 0.022;
    const eyeScale = expr === 'air' ? 1.25 : expr === 'wee' ? 0.9 : 1;
    for (const l of this.looks) {
      const r = l.userData.rest as THREE.Vector3;
      l.position.set(r.x + lx, r.y + ly, r.z);
    }
    for (const e of this.eyes) {
      e.visible = normalEyes;
      const sx = e.scale.x < 0 ? -1 : 1;
      e.scale.set(sx * eyeScale, eyeScale * (expr === 'idle' ? open : expr === 'frozen' ? 0.55 : 1), eyeScale);
    }
    for (const e of this.eyesPain) e.visible = expr === 'pain';
    for (const e of this.eyesHappy) e.visible = expr === 'happy';
    this.eyesDizzy.forEach((e, k) => {
      e.visible = expr === 'dizzy';
      e.rotation.z = this.t * (k === 0 ? 7 : -7);
    });
    if (this.idleMouth) this.idleMouth.visible = expr === 'idle';
    this.mouths.open.visible = expr === 'wee' || expr === 'happy';
    this.mouths.o.visible = expr === 'air' || expr === 'frozen';
    this.mouths.pain.visible = expr === 'pain' || expr === 'dizzy';
    this.sweat.visible = expr === 'pain';
    for (const b of this.blush) {
      b.visible = expr !== 'air';
      const s = expr === 'happy' || expr === 'pain' ? 1.2 : 1;
      b.scale.set(s, s, s);
    }

    // lágrimas que caen y se reinician durante el dolor
    const tearT = (this.t * 1.6) % 1;
    this.tears.forEach((tear, i) => {
      tear.visible = expr === 'pain';
      const r = tear.userData.rest as THREE.Vector3;
      const tt = (tearT + i * 0.5) % 1;
      tear.position.set(r.x + Math.sign(r.x) * tt * 0.02, r.y - tt * 0.09, r.z);
      tear.scale.setScalar(1 - tt * 0.5);
    });

    // gracia: rebote al cambiar de cara, balanceo al moverse, tembleque con dolor
    let wobble = expr === 'frozen' ? 0 : Math.sin(this.t * 9) * Math.min(speed, 4) * 0.015;
    let shakeX = 0;
    if (expr === 'pain') {
      shakeX = Math.sin(this.t * 70) * 0.02;
      wobble = Math.sin(this.t * 30) * 0.08;
    } else if (expr === 'dizzy') {
      // balanceo lento y amplio, como quien ha dado vueltas
      shakeX = Math.sin(this.t * 3.2) * 0.05;
      wobble = Math.sin(this.t * 3.2 + 1) * 0.22;
    }
    this.mouths.open.scale.set(1, 1 + Math.sin(this.t * (expr === 'wee' ? 20 : 10)) * 0.12, 1);
    this.sweat.position.y = 0.13 - ((this.t * 0.5) % 0.08);
    const pop = 1 + Math.sin(this.bounce * Math.PI) * 0.18;

    this.root.position.set(this.pos.x + shakeX, this.pos.y, this.pos.z);
    this.root.rotation.set(-0.75 * (pitch / DEFAULT_PITCH), yaw, wobble);
    this.root.scale.set(this.scale * pop, this.scale * (2 - pop), this.scale);
    this.root.visible = true;
  }

  hide() {
    this.root.visible = false;
    this.initialized = false;
  }

  dispose() {
    for (const m of this.materials) m.dispose();
  }
}
