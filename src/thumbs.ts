import * as THREE from 'three';
import { Assets } from './assets';
import { BODY_COLORS, EYES_MIRRORED, EYES_PER_SIDE, type BodyColorId, type SlimeLook } from './look';

/**
  Miniaturas renderizadas con los modelos reales (para Mi limo y los avisos de premio):
  una parte de la cara sobre un círculo del color del limo, un limo entero con un color, o un modelo suelto.
  Se pintan una vez en un render target pequeño y se guardan como imagen (data URL) en caché.
*/

type FaceKind = 'eyes' | 'mouth' | 'cheeks';

const FRAME: Record<FaceKind, number> = { eyes: 0.36, mouth: 0.15, cheeks: 0.1 };

export class Thumbs {
  private readonly scene = new THREE.Scene();
  private readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  private readonly persp = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  private readonly target: THREE.WebGLRenderTarget;
  private readonly pixels: Uint8Array;
  private readonly canvas = document.createElement('canvas');
  private readonly cache = new Map<string, string>();

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly assets: Assets, env: THREE.Texture | null, private readonly size = 128) {
    this.target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace, samples: 4 });
    this.pixels = new Uint8Array(size * size * 4);
    this.canvas.width = this.canvas.height = size;
    this.scene.environment = env;
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x3d2d5c, 1.4));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
    key.position.set(-2, 3, 4);
    this.scene.add(key);
    this.ortho.position.set(0, 0, 2);
  }

  /** Una parte de la cara (ojos, boca o mofletes) sobre un círculo del color del limo. */
  face(kind: FaceKind, id: string, color: BodyColorId): string {
    const cacheKey = `face:${kind}:${id}:${color}`;
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;
    const group = new THREE.Group();
    const f = FRAME[kind];
    const disc = new THREE.Mesh(new THREE.CircleGeometry(f * 0.47, 48), new THREE.MeshBasicMaterial({ color: BODY_COLORS[color].color }));
    disc.position.z = -0.08;
    group.add(disc);
    const part = (name: string, x: number, y: number, mirror = false) => {
      if (!this.assets.has(name)) return; // p. ej. mofletes "none"
      const o = this.assets.clone(name, { unlit: true });
      o.position.set(x, y, 0);
      if (mirror) o.scale.x = -1;
      group.add(o);
    };
    if (kind === 'eyes') {
      const sided = EYES_PER_SIDE.has(id);
      part(sided ? `face_eye_${id}_l` : `face_eye_${id}`, -0.1, 0);
      part(sided ? `face_eye_${id}_r` : `face_eye_${id}`, 0.1, 0, EYES_MIRRORED.has(id));
    }
    else if (kind === 'mouth') part(`face_mouth_${id}`, 0, 0.004);
    else if (id !== 'none') part(`face_blush_${id}`, 0, 0);
    this.ortho.left = this.ortho.bottom = -f / 2;
    this.ortho.right = this.ortho.top = f / 2;
    this.ortho.updateProjectionMatrix();
    const url = this.shoot(group, this.ortho);
    disc.geometry.dispose();
    this.cache.set(cacheKey, url);
    return url;
  }

  /** Un limo entero (esfera con cara) de un color. */
  slime(color: BodyColorId, look?: Pick<SlimeLook, 'eyes' | 'mouth' | 'cheeks'>): string {
    const face = look ?? { eyes: 'round', mouth: 'cat', cheeks: 'lines' };
    const cacheKey = `slime:${color}:${face.eyes}:${face.mouth}:${face.cheeks}`;
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;
    const body = BODY_COLORS[color];
    const group = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32), new THREE.MeshStandardMaterial({
      color: body.color, emissive: body.emissive, emissiveIntensity: 0.3,
      metalness: 'metalness' in body ? body.metalness : 0, roughness: 'roughness' in body ? body.roughness : 0.14,
    }));
    ball.scale.set(1, 0.82, 1);
    group.add(ball);
    const faceRoot = new THREE.Group();
    faceRoot.position.set(0, 0.02, 0.5);
    faceRoot.scale.setScalar(1.55);
    const part = (name: string, x: number, y: number, mirror = false) => {
      if (!this.assets.has(name)) return;
      const o = this.assets.clone(name, { unlit: true });
      o.position.set(x, y, 0);
      if (mirror) o.scale.x = -1;
      faceRoot.add(o);
    };
    for (const side of [-1, 1]) {
      const eye = EYES_PER_SIDE.has(face.eyes) ? `face_eye_${face.eyes}_${side < 0 ? 'l' : 'r'}` : `face_eye_${face.eyes}`;
      part(eye, side * 0.1, 0.035, side > 0 && EYES_MIRRORED.has(face.eyes));
      if (face.cheeks !== 'none') part(`face_blush_${face.cheeks}`, side * 0.175, -0.035);
    }
    part(`face_mouth_${face.mouth}`, 0, -0.055);
    group.add(faceRoot);
    this.persp.position.set(0, 0.35, 2.6);
    this.persp.lookAt(0, -0.02, 0);
    const url = this.shoot(group, this.persp);
    ball.geometry.dispose();
    this.cache.set(cacheKey, url);
    return url;
  }

  /** Un modelo suelto (coleccionables), encuadrado automáticamente. */
  model(name: string): string {
    const cacheKey = `model:${name}`;
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;
    const obj = this.assets.clone(name);
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    obj.position.sub(center);
    obj.rotation.y = -0.5;
    this.persp.position.set(0, radius * 0.6, radius * 3.6);
    this.persp.lookAt(0, 0, 0);
    // materiales compartidos con la habitación: no se liberan
    const url = this.shoot(obj, this.persp, false);
    this.cache.set(cacheKey, url);
    return url;
  }

  /** disposeMaterials: los clones "unlit" de la cara llevan materiales propios que se liberan al acabar. */
  private shoot(obj: THREE.Object3D, camera: THREE.Camera, disposeMaterials = true): string {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    this.scene.add(obj);
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, camera);
    r.readRenderTargetPixels(this.target, 0, 0, this.size, this.size, this.pixels);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    this.scene.remove(obj);
    if (disposeMaterials) {
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        (m.material as THREE.Material).dispose();
      });
    }
    // las filas del render target van de abajo arriba
    const g = this.canvas.getContext('2d')!;
    const img = g.createImageData(this.size, this.size);
    const rowBytes = this.size * 4;
    for (let y = 0; y < this.size; y++) {
      const src = (this.size - 1 - y) * rowBytes;
      img.data.set(this.pixels.subarray(src, src + rowBytes), y * rowBytes);
    }
    g.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}
