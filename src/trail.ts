import * as THREE from 'three';

/*
  Rastro del limo en el suelo (manchas planas instanciadas, sin texturas):
  - aceite: charcos pringosos marrón amarillento con brillo
  - fuego: quemadura oscura + ascuas que brillan y parpadean
  Barato: cada mancha guarda solo su momento de nacimiento; aparecer, desvanecerse y desaparecer
  lo calcula la GPU con el tiempo actual, así que por frame no hay bucles ni subida de datos.
  Cada casilla de una rejilla solo guarda una mancha de cada tipo: al volver a pasar se renueva.
*/

const GRID = 0.4;

interface LayerDef {
  capacity: number;
  /** segundos de vida (el último tercio se desvanece) */
  life: number;
  /** tamaño mínimo y máximo */
  size: [number, number];
  blending: THREE.Blending;
  fragment: string;
}

const HASH = `
  float trailHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

const SHAPE = `
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float edge = 0.8 + 0.07 * sin(a * 2.0 + vSeed * 6.28) + 0.05 * sin(a * 5.0 + vSeed * 17.0);
`;

const OIL: LayerDef = {
  capacity: 110,
  life: 4.5,
  size: [0.6, 0.95],
  blending: THREE.NormalBlending,
  fragment: `${SHAPE}
    float body = smoothstep(edge, edge - 0.3, r);
    if (body < 0.01) discard;
    vec3 col = mix(vec3(0.36, 0.24, 0.05), vec3(0.6, 0.43, 0.14), smoothstep(edge, 0.0, r) * 0.7);
    float shine = smoothstep(0.3, 0.0, length(p - vec2(-0.2, 0.25)));
    col += vec3(1.0, 0.92, 0.65) * shine * 0.3;
    gl_FragColor = vec4(col, body * 0.62 * vFade);`,
};

const SCORCH: LayerDef = {
  capacity: 90,
  life: 3.5,
  size: [0.5, 0.8],
  blending: THREE.NormalBlending,
  fragment: `${SHAPE}
    float body = smoothstep(edge, edge - 0.32, r);
    if (body < 0.01) discard;
    gl_FragColor = vec4(vec3(0.07, 0.05, 0.045), body * 0.55 * vFade);`,
};

const EMBER: LayerDef = {
  capacity: 90,
  life: 2,
  size: [0.38, 0.56],
  blending: THREE.AdditiveBlending,
  fragment: `
    vec2 g = vUv * 3.0;
    vec2 id = floor(g);
    vec2 f = fract(g);
    float h = trailHash(id + vSeed * 13.0);
    vec2 c = vec2(trailHash(id + 1.3 + vSeed), trailHash(id + 7.1 + vSeed)) * 0.6 + 0.2;
    float spot = smoothstep(0.24, 0.0, length(f - c)) * step(0.42, h);
    float flick = 0.55 + 0.45 * sin(uTime * (5.0 + h * 9.0) + h * 40.0);
    float mask = smoothstep(1.0, 0.55, length(vUv * 2.0 - 1.0));
    float glow = spot * flick * mask * vFade;
    if (glow < 0.01) discard;
    vec3 col = mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.82, 0.35), spot * flick);
    gl_FragColor = vec4(col * glow * 1.7, 1.0);`,
};

class Layer {
  readonly mesh: THREE.InstancedMesh;
  private readonly birth: THREE.InstancedBufferAttribute;
  private readonly seed: THREE.InstancedBufferAttribute;
  private readonly keys: Float64Array;
  private readonly index = new Map<number, number>();
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private static readonly UP = new THREE.Vector3(0, 1, 0);

  constructor(private readonly def: LayerDef, private readonly time: { value: number }, order: number) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.birth = new THREE.InstancedBufferAttribute(new Float32Array(def.capacity).fill(-1e6), 1);
    this.seed = new THREE.InstancedBufferAttribute(new Float32Array(def.capacity), 1);
    geo.setAttribute('aBirth', this.birth);
    geo.setAttribute('aSeed', this.seed);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uLife: { value: def.life } },
      transparent: true,
      depthWrite: false,
      blending: def.blending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: `
        #include <common>
        uniform float uTime;
        uniform float uLife;
        attribute float aBirth;
        attribute float aSeed;
        varying vec2 vUv;
        varying float vFade;
        varying float vSeed;
        void main() {
          float age = uTime - aBirth;
          if (age > uLife) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } // caducada: fuera de pantalla
          vUv = uv;
          vFade = min(1.0, age * 8.0) * min(1.0, (uLife - age) / uLife * 3.0);
          vSeed = aSeed;
          vec3 transformed = position;
          #include <project_vertex>
        }`,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vFade;
        varying float vSeed;
        ${HASH}
        void main() {${def.fragment}
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, def.capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.keys = new Float64Array(def.capacity).fill(NaN);
    this.mesh.count = 0;
  }

  private alive(i: number) {
    return this.time.value - this.birth.getX(i) < this.def.life;
  }

  stamp(x: number, y: number, z: number, key: number) {
    const now = this.time.value;
    const existing = this.index.get(key);
    if (existing !== undefined && this.alive(existing)) {
      // se renueva sin crear otra (solo si ya ha perdido algo de vida, para no subir datos a cada paso)
      if (now - this.birth.getX(existing) > this.def.life * 0.3) {
        this.birth.setX(existing, now - 0.2);
        this.birth.addUpdateRange(existing, 1);
        this.birth.needsUpdate = true;
      }
      return;
    }
    const i = this.next;
    this.next = (this.next + 1) % this.def.capacity;
    const old = this.keys[i];
    if (!Number.isNaN(old) && this.index.get(old) === i) this.index.delete(old);
    this.keys[i] = key;
    this.index.set(key, i);
    const [a, b] = this.def.size;
    this.q.setFromAxisAngle(Layer.UP, Math.random() * Math.PI * 2);
    this.s.setScalar(a + Math.random() * (b - a));
    this.m.compose(this.v.set(x + (Math.random() - 0.5) * 0.12, y + 0.012, z + (Math.random() - 0.5) * 0.12), this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.addUpdateRange(i * 16, 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.birth.setX(i, now);
    this.birth.addUpdateRange(i, 1);
    this.birth.needsUpdate = true;
    this.seed.setX(i, Math.random());
    this.seed.addUpdateRange(i, 1);
    this.seed.needsUpdate = true;
    if (this.mesh.count < i + 1) this.mesh.count = i + 1;
  }

  /** Una mancha joven al azar (para soltar chispas desde las ascuas). */
  random(out: THREE.Vector3): boolean {
    const count = this.mesh.count;
    if (!count) return false;
    for (let t = 0; t < 3; t++) {
      const i = (Math.random() * count) | 0;
      if (this.time.value - this.birth.getX(i) > this.def.life * 0.6) continue;
      this.mesh.getMatrixAt(i, this.m);
      out.setFromMatrixPosition(this.m);
      return true;
    }
    return false;
  }

  reset() {
    (this.birth.array as Float32Array).fill(-1e6);
    this.birth.clearUpdateRanges();
    this.birth.needsUpdate = true;
    this.keys.fill(NaN);
    this.index.clear();
    this.next = 0;
    this.mesh.count = 0;
  }
}

export class Trail {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly oil = new Layer(OIL, this.time, 2);
  private readonly scorch = new Layer(SCORCH, this.time, 2);
  private readonly ember = new Layer(EMBER, this.time, 3);
  private lastFire = -1e6;

  constructor() {
    this.group.add(this.oil.mesh, this.scorch.mesh, this.ember.mesh);
  }

  /** Mancha de aceite o quemadura con ascuas en (x, z) sobre un suelo a altura y. */
  stamp(kind: 'oil' | 'fire', x: number, y: number, z: number) {
    const ix = Math.round(x / GRID), iy = Math.round(y * 2), iz = Math.round(z / GRID);
    const key = (ix * 73856093) ^ (iy * 83492791) ^ (iz * 19349663);
    if (kind === 'oil') this.oil.stamp(x, y, z, key);
    else {
      this.scorch.stamp(x, y, z, key);
      this.ember.stamp(x, y + 0.004, z, key);
      this.lastFire = this.time.value;
    }
  }

  /** Posición de una ascua viva (solo si hay fuego reciente). */
  randomEmber(out: THREE.Vector3) {
    return this.time.value - this.lastFire < EMBER.life && this.ember.random(out);
  }

  update(dt: number) {
    this.time.value += dt;
  }

  reset() {
    this.oil.reset();
    this.scorch.reset();
    this.ember.reset();
    this.lastFire = -1e6;
  }
}
