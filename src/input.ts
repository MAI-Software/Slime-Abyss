/*
  Dirección normalizada en [-1, 1]:
    x > 0  → deslizar a la derecha de la pantalla
    z < 0  → deslizar hacia el fondo (lejos de la cámara)
  Modos: joystick virtual (por defecto) o giroscopio.
  Sin botones de acción: dividir y reunir lo hace el propio escenario.
  En ordenador, para pruebas: flechas/WASD.
*/

export type ControlMode = 'joystick' | 'gyro';

const RANGE_DEG = 22;
const GYRO_DEAD = 0.06;
const JOY_DEAD = 0.1;
const JOY_RADIUS = 64; // px de recorrido del mando
const JOY_CURVE = 1.35; // >1: más precisión con desplazamientos pequeños

type Pair = { roll: number; pitch: number };

export class Input {
  tiltX = 0;
  tiltZ = 0;
  hasGyro = false;
  mode: ControlMode = 'joystick';

  private raw: Pair | null = null;
  private neutral: Pair | null = null;
  private keys = new Set<string>();

  private joyX = 0;
  private joyY = 0;
  private joyPointer: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private zone = document.getElementById('joy-zone')!;
  private base = document.getElementById('joy-base')!;
  private knob = document.getElementById('joy-knob')!;

  constructor() {
    window.addEventListener('deviceorientation', (e) => this.onOrientation(e));
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.bindJoystick();
  }

  setMode(mode: ControlMode) {
    this.mode = mode;
    document.body.dataset.control = mode;
    this.releaseJoystick();
    if (mode === 'gyro') this.calibrate();
  }

  // ---------------------------------------------------------------- joystick flotante

  private bindJoystick() {
    this.zone.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'joystick' || this.joyPointer !== null) return;
      e.preventDefault();
      this.zone.setPointerCapture(e.pointerId);
      this.joyPointer = e.pointerId;
      const r = this.zone.getBoundingClientRect();
      // el mando aparece donde pones el dedo (sin salirse de la zona)
      const x = Math.min(Math.max(e.clientX - r.left, JOY_RADIUS + 12), r.width - JOY_RADIUS - 12);
      const y = Math.min(Math.max(e.clientY - r.top, JOY_RADIUS + 12), r.height - JOY_RADIUS - 12);
      this.joyOrigin = { x: r.left + x, y: r.top + y };
      this.base.style.left = `${x}px`;
      this.base.style.top = `${y}px`;
      this.base.classList.add('active');
      this.moveJoystick(e.clientX, e.clientY);
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyPointer) this.moveJoystick(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.joyPointer) this.releaseJoystick();
    };
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
    this.zone.addEventListener('lostpointercapture', end);
  }

  private moveJoystick(cx: number, cy: number) {
    let dx = cx - this.joyOrigin.x;
    let dy = cy - this.joyOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) {
      // la base sigue al dedo: nunca se "choca" con el borde del mando
      const excess = len - JOY_RADIUS;
      this.joyOrigin.x += (dx / len) * excess;
      this.joyOrigin.y += (dy / len) * excess;
      const r = this.zone.getBoundingClientRect();
      this.base.style.left = `${this.joyOrigin.x - r.left}px`;
      this.base.style.top = `${this.joyOrigin.y - r.top}px`;
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.joyX = dx / JOY_RADIUS;
    this.joyY = dy / JOY_RADIUS;
  }

  private releaseJoystick() {
    this.joyPointer = null;
    this.joyX = 0;
    this.joyY = 0;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.base.classList.remove('active');
    this.base.style.left = '';
    this.base.style.top = '';
  }

  // ---------------------------------------------------------------- giroscopio

  /** iOS exige pedir permiso tras un toque del usuario. No bloquea. */
  requestPermission() {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
      .DeviceOrientationEvent;
    DOE?.requestPermission?.().catch(() => { /* sin giroscopio */ });
  }

  requestFullscreen() {
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

  // ---------------------------------------------------------------- por frame

  update() {
    let x = 0, z = 0;
    if (this.mode === 'gyro' && this.raw && this.neutral) {
      x = shape(wrap(this.raw.roll - this.neutral.roll) / RANGE_DEG, GYRO_DEAD);
      z = shape(wrap(this.raw.pitch - this.neutral.pitch) / RANGE_DEG, GYRO_DEAD);
    } else if (this.mode === 'joystick') {
      const len = Math.hypot(this.joyX, this.joyY);
      if (len > JOY_DEAD) {
        const mag = Math.min(1, (len - JOY_DEAD) / (1 - JOY_DEAD)) ** JOY_CURVE;
        x = (this.joyX / len) * mag;
        z = (this.joyY / len) * mag;
      }
    }
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x = -1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x = 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) z = -1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) z = 1;

    // suavizado: quita temblor del sensor y da algo de inercia al joystick
    const smooth = this.mode === 'gyro' ? 0.35 : 0.65;
    this.tiltX += (x - this.tiltX) * smooth;
    this.tiltZ += (z - this.tiltZ) * smooth;
  }

  reset() { this.keys.clear(); this.releaseJoystick(); this.tiltX = this.tiltZ = 0; }
}

function wrap(deg: number): number {
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

function shape(v: number, dead: number): number {
  v = Math.max(-1, Math.min(1, v));
  const a = Math.abs(v);
  if (a < dead) return 0;
  return Math.sign(v) * ((a - dead) / (1 - dead));
}
