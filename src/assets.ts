import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// importado como URL: Vite le pone hash al nombre, así nunca se sirve un modelo viejo de caché
import assetsUrl from './models/assets.glb?url';
// texturas de blender/build_textures.py: color + normales
const textureFiles = import.meta.glob('./textures/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

import { TEXTURE_PREFIX, type Biome } from './biomes';

export type TextureName = 'floor' | 'wall_top' | 'brick' | 'stone_side' | 'ice';
export type TextureKey = TextureName | `${TextureName}_n`;
/** Superficies que cambian con el tema (el hielo del suelo es igual en todos). */
const THEMED: Partial<Record<TextureName, string>> = { floor: 'floor', wall_top: 'wall_top', brick: 'brick', stone_side: 'side' };

/** Modelos hechos en Blender (blender/build_assets.py → src/models/assets.glb). */
export class Assets {
  private nodes = new Map<string, THREE.Object3D>();
  readonly textures = {} as Record<TextureKey, THREE.Texture>;
  /** texturas de los temas cargados: '<prefijo><nombre>' → textura */
  private themed = new Map<string, THREE.Texture>();
  private loadedBiome: Biome = 'stone';
  private anisotropy = 1;

  static async load(anisotropy: number, onProgress?: (p: number) => void): Promise<Assets> {
    const a = new Assets();
    const texLoader = new THREE.TextureLoader();
    const [gltf] = await Promise.all([
      new GLTFLoader().loadAsync(assetsUrl, (e) => { if (e.total) onProgress?.(e.loaded / e.total); }),
      // de salida solo la piedra y el hielo: los demás temas se cargan al jugar sus pisos
      ...Object.entries(textureFiles).filter(([path]) => !/\/(desert|frost|tech)_/.test(path)).map(async ([path, url]) => {
        const key = path.replace('./textures/', '').replace('.jpg', '') as TextureKey;
        a.textures[key] = await a.loadTexture(texLoader, url, key.endsWith('_n'));
      }),
    ]);
    gltf.scene.traverse((o) => a.nodes.set(o.name, o));
    a.anisotropy = anisotropy;
    return a;
  }

  private async loadTexture(loader: THREE.TextureLoader, url: string, normal: boolean) {
    const t = await loader.loadAsync(url);
    t.colorSpace = normal ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.anisotropy;
    return t;
  }

  /**
    Deja listas las texturas de un tema. Solo se guarda un tema además de la piedra: al cambiar,
    se liberan las del anterior (en el móvil cada tema ocupa bastante memoria de vídeo).
  */
  async loadBiome(biome: Biome) {
    if (biome === 'stone' || biome === this.loadedBiome) return;
    const prefix = TEXTURE_PREFIX[biome];
    const loader = new THREE.TextureLoader();
    const next = new Map<string, THREE.Texture>();
    await Promise.all(Object.entries(textureFiles).filter(([path]) => path.includes(`/${prefix}`)).map(async ([path, url]) => {
      const key = path.replace('./textures/', '').replace('.jpg', '');
      next.set(key, await this.loadTexture(loader, url, key.endsWith('_n')));
    }));
    for (const t of this.themed.values()) t.dispose();
    this.themed = next;
    this.loadedBiome = biome;
  }

  /** ¿Existe este objeto en assets.glb? */
  has(name: string): boolean {
    return this.nodes.has(name);
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

  /** Color y relieve de una superficie en un tema (si el tema no está cargado, la de piedra). */
  surface(name: TextureName, biome: Biome = 'stone') {
    const themed = THEMED[name];
    if (biome !== 'stone' && themed && biome === this.loadedBiome) {
      const color = this.themed.get(`${TEXTURE_PREFIX[biome]}${themed}`);
      const normal = this.themed.get(`${TEXTURE_PREFIX[biome]}${themed}_n`);
      if (color && normal) return { color, normal };
    }
    return { color: this.textures[name], normal: this.textures[`${name}_n`] };
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
        m.material = new THREE.MeshBasicMaterial({ color: mat.color, name: mat.name });
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
