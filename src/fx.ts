import * as THREE from 'three';

interface Puff { sprite: THREE.Sprite; life: number; max: number; vy: number; vx: number; vz: number; grow: number; shrink: boolean }

function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Fx {
  readonly group = new THREE.Group();
  private pool: Puff[] = [];
  private tex = puffTexture();

  private spawn(x: number, y: number, z: number, color: number, size: number, life: number, vy: number, spread: number, glow = false, shrink = glow) {
    let p = this.pool.find((q) => q.life <= 0);
    if (!p) {
      if (this.pool.length > 160) return;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false }));
      this.group.add(sprite);
      p = { sprite, life: 0, max: 1, vy: 0, vx: 0, vz: 0, grow: 1, shrink: false };
      this.pool.push(p);
    }
    p.sprite.material.color.setHex(color);
    p.sprite.material.blending = glow ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.shrink = shrink;
    p.sprite.position.set(x, y, z);
    p.sprite.scale.setScalar(size);
    p.sprite.visible = true;
    p.life = p.max = life;
    p.vy = vy;
    p.vx = (Math.random() - 0.5) * spread;
    p.vz = (Math.random() - 0.5) * spread;
    p.grow = size * 1.8;
  }

  steam(x: number, y: number, z: number) {
    for (let k = 0; k < 3; k++) this.spawn(x, y + 0.1, z, 0xe8eef5, 0.35, 0.9, 1.4 + Math.random(), 0.8);
  }

  splat(x: number, y: number, z: number) {
    for (let k = 0; k < 4; k++) this.spawn(x, y, z, 0x7cc0ff, 0.22, 0.4, 2 + Math.random() * 2, 3);
  }

  /** Lengua de fuego sobre el limo en llamas: se encoge al subir (mezcla normal: el aditivo se lava en suelos claros). */
  flame(x: number, y: number, z: number) {
    const r = Math.random();
    this.spawn(x, y + 0.14, z, r < 0.4 ? 0xff4d0a : r < 0.8 ? 0xff8a1f : 0xffc54a, 0.34 + Math.random() * 0.18, 0.45 + Math.random() * 0.25, 1.5 + Math.random() * 1.4, 0.6, false, true);
  }

  /** Chispa que salta de una ascua del rastro. */
  spark(x: number, y: number, z: number) {
    this.spawn(x, y + 0.05, z, Math.random() < 0.5 ? 0xff7a1a : 0xffc34d, 0.07 + Math.random() * 0.05, 0.5 + Math.random() * 0.4, 0.8 + Math.random() * 1.2, 0.5, true);
  }

  /** Burbujitas del rastro de jabón: suben flojas y se hacen grandes antes de reventar. */
  bubble(x: number, y: number, z: number) {
    this.spawn(x, y + 0.06, z, 0xdff3ff, 0.07 + Math.random() * 0.07, 0.7 + Math.random() * 0.5,
      0.5 + Math.random() * 0.7, 0.35);
  }

  /** Escarcha sobre el limo congelado. */
  frost(x: number, y: number, z: number) {
    this.spawn(x, y + 0.05, z, 0xe8f8ff, 0.12, 0.6, 0.4 + Math.random() * 0.4, 0.4);
  }

  sparkle(x: number, y: number, z: number, color = 0xffd75e) {
    for (let k = 0; k < 7; k++) this.spawn(x, y, z, color, 0.16, 0.5 + Math.random() * 0.2, 1.5 + Math.random() * 2.5, 4);
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sprite.visible = false; continue; }
      const t = 1 - p.life / p.max;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      p.sprite.scale.setScalar(p.shrink ? p.grow * 0.6 * (1 - t * 0.7) : p.grow * (0.55 + t * 0.45));
      p.sprite.material.opacity = (1 - t) * 0.85;
    }
  }

  reset() {
    for (const p of this.pool) { p.life = 0; p.sprite.visible = false; }
  }
}
