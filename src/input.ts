/*
  Inclinación normalizada en [-1, 1]:
    x > 0  → deslizar a la derecha de la pantalla
    z < 0  → deslizar hacia el fondo (lejos de la cámara)
  Fuente principal: DeviceOrientationEvent (giroscopio). Respaldo para
  pruebas en ordenador: flechas/WASD, espacio, Q/E.
*/

const RANGE_DEG = 22;
const DEAD = 0.06;

type Pair = { roll: number; pitch: number };

export class Input {
  tiltX = 0;
  tiltZ = 0;
  mergeHeld = false;
  hasGyro = false;

  private raw: Pair | null = null;
  private neutral: Pair | null = null;
  private keys = new Set<string>();
  private mergeBtn = false;
  private jumpQueued = false;
  private splitQueued = false;

  constructor() {
    window.addEventListener('deviceorientation', (e) => this.onOrientation(e));
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpQueued = true;
      if (e.code === 'KeyQ') this.splitQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.bindButton('btn-jump', () => (this.jumpQueued = true));
    this.bindButton('btn-split', () => (this.splitQueued = true));
    const merge = document.getElementById('btn-merge')!;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      merge.setPointerCapture(e.pointerId);
      this.mergeBtn = true;
      merge.classList.add('held');
    };
    const up = () => {
      this.mergeBtn = false;
      merge.classList.remove('held');
    };
    merge.addEventListener('pointerdown', down);
    merge.addEventListener('pointerup', up);
    merge.addEventListener('pointercancel', up);
    merge.addEventListener('lostpointercapture', up);
  }

  private bindButton(id: string, fn: () => void) {
    const el = document.getElementById(id)!;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
      navigator.vibrate?.(12);
    });
  }

  /** iOS exige pedir permiso tras un toque del usuario. No bloquea: nada de esto es obligatorio. */
  requestPermission() {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
      .DeviceOrientationEvent;
    DOE?.requestPermission?.().catch(() => { /* sin giroscopio */ });
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen()
        .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
        .catch(() => { /* navegador de escritorio o sin soporte */ });
    }
  }

  calibrate() {
    this.neutral = this.raw ? { ...this.raw } : null;
  }

  private onOrientation(e: DeviceOrientationEvent) {
    if (e.beta == null || e.gamma == null) return;
    this.hasGyro = true;
    const angle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
    const b = e.beta, g = e.gamma;
    let roll: number, pitch: number;
    // roll: + inclina a la derecha de la pantalla; pitch: + borde superior hacia ti
    if (angle === 90) { roll = b; pitch = -g; }
    else if (angle === 270 || angle === -90) { roll = -b; pitch = g; }
    else { roll = g; pitch = b; }
    this.raw = { roll, pitch };
    if (!this.neutral) this.calibrate();
  }

  update() {
    let x = 0, z = 0;
    if (this.raw && this.neutral) {
      x = wrap(this.raw.roll - this.neutral.roll) / RANGE_DEG;
      z = wrap(this.raw.pitch - this.neutral.pitch) / RANGE_DEG;
    }
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x = -1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x = 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) z = -1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) z = 1;
    this.mergeHeld = this.mergeBtn || this.keys.has('KeyE');

    x = shape(x);
    z = shape(z);
    // suavizado ligero para quitar temblor del sensor
    this.tiltX += (x - this.tiltX) * 0.35;
    this.tiltZ += (z - this.tiltZ) * 0.35;
  }

  consumeJump() { const v = this.jumpQueued; this.jumpQueued = false; return v; }
  consumeSplit() { const v = this.splitQueued; this.splitQueued = false; return v; }
  clearQueued() { this.jumpQueued = false; this.splitQueued = false; }
}

function wrap(deg: number): number {
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

function shape(v: number): number {
  v = Math.max(-1, Math.min(1, v));
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  return Math.sign(v) * ((a - DEAD) / (1 - DEAD));
}
