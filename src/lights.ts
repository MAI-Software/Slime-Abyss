import * as THREE from 'three';

/**
  Luces puntuales reutilizables (velas, fuego, limo en llamas).
  Siempre existen las mismas y las que sobran se quedan a intensidad 0: si cambiara el número de luces,
  three recompilaría todos los materiales y el juego daría tirones. Sin sombras (serían 6 pasadas por luz).
*/
export class LightPool {
  private readonly lights: THREE.PointLight[] = [];
  private used = 0;

  constructor(count: number, parent: THREE.Object3D) {
    for (let k = 0; k < count; k++) {
      const light = new THREE.PointLight(0xffffff, 0, 5, 2);
      parent.add(light);
      this.lights.push(light);
    }
  }

  begin() {
    this.used = 0;
  }

  /** Coloca la siguiente luz libre. Devuelve false si ya no quedan. */
  add(x: number, y: number, z: number, color: number, intensity: number, distance: number): boolean {
    const light = this.lights[this.used];
    if (!light) return false;
    this.used++;
    light.position.set(x, y, z);
    light.color.setHex(color);
    light.intensity = intensity;
    light.distance = distance;
    return true;
  }

  end() {
    for (let k = this.used; k < this.lights.length; k++) this.lights[k].intensity = 0;
  }
}

/** Parpadeo suave de llama (0.75..1.1) con fase propia. */
export function flicker(t: number, seed: number) {
  return 0.9 + Math.sin(t * 11 + seed * 7) * 0.1 + Math.sin(t * 23.7 + seed * 3) * 0.06 + Math.sin(t * 5.3 + seed) * 0.04;
}
