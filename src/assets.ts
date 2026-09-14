import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// importado como URL: Vite le pone hash al nombre, así nunca se sirve un modelo viejo de caché
import assetsUrl from './models/assets.glb?url';
import floorUrl from './textures/floor.png?url';
import wallTopUrl from './textures/wall_top.png?url';
import brickUrl from './textures/brick.png?url';
import stoneSideUrl from './textures/stone_side.png?url';

export type TextureName = 'floor' | 'wall_top' | 'brick' | 'stone_side';
const TEXTURE_URLS: Record<TextureName, string> = {
  floor: floorUrl, wall_top: wallTopUrl, brick: brickUrl, stone_side: stoneSideUrl,
};

/** Modelos hechos en Blender (blender/build_assets.py → src/models/assets.glb). */
export class Assets {
  private nodes = new Map<string, THREE.Object3D>();
  readonly textures = {} as Record<TextureName, THREE.Texture>;

  static async load(anisotropy: number, onProgress?: (p: number) => void): Promise<Assets> {
    const a = new Assets();
    const texLoader = new THREE.TextureLoader();
    const [gltf] = await Promise.all([
      new GLTFLoader().loadAsync(assetsUrl, (e) => { if (e.total) onProgress?.(e.loaded / e.total); }),
      ...(Object.keys(TEXTURE_URLS) as TextureName[]).map(async (name) => {
        const t = await texLoader.loadAsync(TEXTURE_URLS[name]);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = anisotropy;
        a.textures[name] = t;
      }),
    ]);
    gltf.scene.traverse((o) => a.nodes.set(o.name, o));
    return a;
  }

  private node(name: string): THREE.Object3D {
    const n = this.nodes.get(name);
    if (!n) throw new Error(`Falta el modelo "${name}" en assets.glb`);
    return n;
  }

  /** Geometría de un objeto de una sola malla (para InstancedMesh). */
  geometry(name: string): THREE.BufferGeometry {
    const n = this.node(name) as THREE.Mesh;
    if (!n.isMesh) throw new Error(`"${name}" no es una malla`);
    return n.geometry;
  }

  /** Copia independiente de un objeto con sus hijos, en el origen. */
  clone(name: string, options: { unlit?: boolean; cloneMaterials?: boolean } = {}): THREE.Object3D {
    const src = this.node(name);
    const copy = src.clone(true);
    copy.position.set(0, 0, 0);
    copy.rotation.set(0, 0, 0);
    copy.scale.set(1, 1, 1);
    copy.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (options.unlit) {
        m.material = new THREE.MeshBasicMaterial({ color: mat.color });
      } else if (options.cloneMaterials) {
        m.material = mat.clone();
      }
      m.castShadow = !options.unlit;
      m.receiveShadow = !options.unlit;
    });
    return copy;
  }

  /** Busca un hijo por nombre dentro de un clon. */
  static child<T extends THREE.Object3D = THREE.Mesh>(root: THREE.Object3D, name: string): T {
    const c = root.getObjectByName(name);
    if (!c) throw new Error(`Falta "${name}"`);
    return c as T;
  }
}
