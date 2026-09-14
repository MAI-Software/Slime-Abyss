import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Modelos hechos en Blender (blender/build_assets.py → public/models/assets.glb). */
export class Assets {
  private nodes = new Map<string, THREE.Object3D>();

  static async load(onProgress?: (p: number) => void): Promise<Assets> {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/assets.glb`, (e) => {
      if (e.total) onProgress?.(e.loaded / e.total);
    });
    const a = new Assets();
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
