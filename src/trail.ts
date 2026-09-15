import * as THREE from 'three';

/*
  Rastro del limo en el suelo (manchas planas instanciadas, sin texturas):
  - aceite: charcos pringosos marrón amarillento con brillo, que se secan despacio
  - fuego: quemadura oscura + ascuas que brillan, parpadean y se apagan
  Cada casilla de una rejilla fina solo guarda una mancha de cada tipo: al volver a pasar se renueva.
*/

const GRID = 0.3;

interface LayerDef {
  capacity: number;
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
  capacity: 280,
  life: 14,
  size: [0.55, 0.9],
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
  capacity: 220,
  life: 11,
  size: [0.42, 0.7],
  blending: THREE.NormalBlending,
  fragment: `${SHAPE}
    float body = smoothstep(edge, edge - 0.32, r);
    if (body < 0.01) discard;
    gl_FragColor = vec4(vec3(0.07, 0.05, 0.045), body * 0.55 * vFade);`,
};

const EMBER: LayerDef = {
  capacity: 220,
  life: 4,
  size: [0.32, 0.5],
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
  private readonly fade: THREE.InstancedBufferAttribute;
  private readonly seed: THREE.InstancedBufferAttribute;
  private readonly age: Float32Array;
  private readonly keys: (string | null)[];
  private readonly index = new Map<string, number>();
  private next = 0;
  private live = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private static readonly UP = new THREE.Vector3(0, 1, 0);

  constructor(private readonly def: LayerDef, time: { value: number }, order: number) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(def.capacity), 1).setUsage(THREE.DynamicDrawUsage);
    this.seed = new THREE.InstancedBufferAttribute(new Float32Array(def.capacity), 1);
    geo.setAttribute('aFade', this.fade);
    geo.setAttribute('aSeed', this.seed);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: time },
      transparent: true,
      depthWrite: false,
      blending: def.blending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: `
        #include <common>
        attribute float aFade;
        attribute float aSeed;
        varying vec2 vUv;
        varying float vFade;
        varying float vSeed;
        void main() {
          vUv = uv;
          vFade = aFade;
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
    this.age = new Float32Array(def.capacity).fill(Infinity);
    this.keys = new Array(def.capacity).fill(null);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < def.capacity; i++) this.mesh.setMatrixAt(i, this.m);
    this.mesh.count = 0;
  }

  stamp(x: number, y: number, z: number, key: string) {
    const existing = this.index.get(key);
    if (existing !== undefined) {
      this.age[existing] = Math.min(this.age[existing], this.def.life * 0.15);
      return;
    }
    const i = this.next;
    this.next = (this.next + 1) % this.def.capacity;
    const old = this.keys[i];
    if (old) this.index.delete(old);
    this.keys[i] = key;
    this.index.set(key, i);
    this.age[i] = 0;
    const [a, b] = this.def.size;
    this.q.setFromAxisAngle(Layer.UP, Math.random() * Math.PI * 2);
    this.s.setScalar(a + Math.random() * (b - a));
    this.m.compose(this.v.set(x + (Math.random() - 0.5) * 0.1, y + 0.012, z + (Math.random() - 0.5) * 0.1), this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.seed.setX(i, Math.random());
    this.seed.needsUpdate = true;
    this.live = Math.max(this.live, i + 1);
    this.mesh.count = this.live;
  }

  update(dt: number) {
    const life = this.def.life;
    for (let i = 0; i < this.live; i++) {
      if (this.age[i] === Infinity) continue;
      this.age[i] += dt;
      const left = 1 - this.age[i] / life;
      if (left <= 0) {
        this.age[i] = Infinity;
        this.fade.setX(i, 0);
        const key = this.keys[i];
        if (key) this.index.delete(key);
        this.keys[i] = null;
        continue;
      }
      // aparece rápido y se desvanece al final de su vida
      this.fade.setX(i, Math.min(1, this.age[i] * 8) * Math.min(1, left * 3.5));
    }
    this.fade.needsUpdate = true;
  }

  /** Una mancha viva al azar (para soltar chispas desde las ascuas). */
  random(out: THREE.Vector3): boolean {
    if (!this.live) return false;
    for (let t = 0; t < 4; t++) {
      const i = (Math.random() * this.live) | 0;
      if (this.age[i] === Infinity || this.age[i] > this.def.life * 0.7) continue;
      this.mesh.getMatrixAt(i, this.m);
      out.setFromMatrixPosition(this.m);
      return true;
    }
    return false;
  }

  reset() {
    this.age.fill(Infinity);
    this.fade.array.fill(0);
    this.fade.needsUpdate = true;
    this.keys.fill(null);
    this.index.clear();
    this.next = this.live = 0;
    this.mesh.count = 0;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export class Trail {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly oil = new Layer(OIL, this.time, 2);
  private readonly scorch = new Layer(SCORCH, this.time, 2);
  private readonly ember = new Layer(EMBER, this.time, 3);

  constructor() {
    this.group.add(this.oil.mesh, this.scorch.mesh, this.ember.mesh);
  }

  /** Mancha de aceite o quemadura con ascuas en (x, z) sobre un suelo a altura y. */
  stamp(kind: 'oil' | 'fire', x: number, y: number, z: number) {
    const key = `${Math.round(x / GRID)},${Math.round(y * 2)},${Math.round(z / GRID)}`;
    if (kind === 'oil') this.oil.stamp(x, y, z, key);
    else {
      this.scorch.stamp(x, y, z, key);
      this.ember.stamp(x, y + 0.004, z, key);
    }
  }

  randomEmber(out: THREE.Vector3) {
    return this.ember.random(out);
  }

  update(dt: number) {
    this.time.value += dt;
    this.oil.update(dt);
    this.scorch.update(dt);
    this.ember.update(dt);
  }

  reset() {
    this.oil.reset();
    this.scorch.reset();
    this.ember.reset();
  }
}
