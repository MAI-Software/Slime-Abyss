/*
  Dirección normalizada en [-1, 1]:
    x > 0  → deslizar a la derecha de la pantalla
    z < 0  → deslizar hacia el fondo (lejos de la cámara)
  Modos: joystick virtual (por defecto) o giroscopio.
  Joystick derecho (solo en modo joystick): gira la cámara (camX) y la sube o baja (camY).
  Sin botones de acción: dividir y reunir lo hace el propio escenario.
  Botón "apretar" (mantener): los trozos del limo se juntan poco a poco. Funciona con joystick y giroscopio.
  En ordenador, para pruebas: flechas/WASD mueven, Q/E giran la cámara, R/F la inclinan y Espacio aprieta.
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

  /** botón de apretar pulsado (o Espacio) */
  squeeze = false;
  private squeezeHeld = false;
  /** joystick derecho: cámara, en [-1, 1] */
  camX = 0;
  camY = 0;
  private move = new Stick('joy-zone', 'joy-base', 'joy-knob');
  private look = new Stick('cam-zone', 'cam-base', 'cam-knob');

  constructor() {
    window.addEventListener('deviceorientation', (e) => this.onOrientation(e));
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    const enabled = () => this.mode === 'joystick';
    this.move.bind(enabled);
    this.look.bind(enabled);
    this.bindSqueeze();
  }

  private bindSqueeze() {
    const btn = document.getElementById('btn-squeeze');
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      this.squeezeHeld = true;
      btn.classList.add('held');
    });
    const end = () => { this.squeezeHeld = false; btn.classList.remove('held'); };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('lostpointercapture', end);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Joysticks fijos: la base no se mueve al dedo (se arrastra desde su sitio). */
  setFixed(fixed: boolean) {
    this.move.fixed = this.look.fixed = fixed;
    document.body.dataset.joy = fixed ? 'fixed' : 'floating';
    this.move.release();
    this.look.release();
  }

  setMode(mode: ControlMode) {
    this.mode = mode;
    document.body.dataset.control = mode;
    this.move.release();
    this.look.release();
    if (mode === 'gyro') this.calibrate();
  }

  // ---------------------------------------------------------------- giroscopio

  /** iOS exige pedir permiso tras un toque del usuario. No bloquea. */
  requestPermission() {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
      .DeviceOrientationEvent;
    DOE?.requestPermission?.().catch(() => { /* sin giroscopio */ });
  }

  requestFullscreen() {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
    if (fullscreenActive()) return;
    const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    if (!req) return;
    Promise.resolve(req())
      .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => { /* sin soporte o rechazado */ });
  }

  exitFullscreen() {
    const d = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
    if (!fullscreenActive()) return;
    Promise.resolve((d.exitFullscreen?.bind(d) ?? d.webkitExitFullscreen?.bind(d))?.()).catch(() => { /* ya fuera */ });
  }

  calibrate() {
    this.neutral = this.raw ? { ...this.raw } : null;
  }

  /*
    Con el móvil en horizontal, beta/gamma saltan 180° al acercarse a la vertical (gamma solo va de -90 a 90):
    con ángulos sueltos el control se quedaba clavado a fondo. Por eso se usa la dirección "arriba" del mundo
    vista desde el móvil (un vector, sin saltos) y de ella se sacan inclinación lateral y frontal.
  */
  private onOrientation(e: DeviceOrientationEvent) {
    if (e.beta == null || e.gamma == null) return;
    this.hasGyro = true;
    const b = (e.beta * Math.PI) / 180, g = (e.gamma * Math.PI) / 180;
    // "arriba" en ejes del dispositivo (x: borde derecho, y: borde superior, z: sale de la pantalla), orden Z-X'-Y''
    const ux = -Math.cos(b) * Math.sin(g), uy = Math.sin(b), uz = Math.cos(b) * Math.cos(g);
    // a ejes de la pantalla según cómo esté girada
    const raw = screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
    const angle = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
    let sx: number, sy: number;
    if (angle === 90) { sx = -uy; sy = ux; }
    else if (angle === 270) { sx = uy; sy = -ux; }
    else if (angle === 180) { sx = -ux; sy = -uy; }
    else { sx = ux; sy = uy; }
    // roll: + inclina a la derecha de la pantalla; pitch: + borde superior hacia ti
    const roll = (Math.asin(Math.max(-1, Math.min(1, -sx))) * 180) / Math.PI;
    const pitch = (Math.atan2(sy, uz) * 180) / Math.PI;
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
      [x, z] = this.move.read();
    }
    let [cx, cy] = this.mode === 'joystick' ? this.look.read() : [0, 0];
    if (this.keys.has('KeyQ')) cx = -1;
    if (this.keys.has('KeyE')) cx = 1;
    if (this.keys.has('KeyR')) cy = -1;
    if (this.keys.has('KeyF')) cy = 1;
    this.camX = cx;
    this.camY = cy;
    this.squeeze = this.squeezeHeld || this.keys.has('Space');
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x = -1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x = 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) z = -1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) z = 1;

    // suavizado: quita temblor del sensor y da algo de inercia al joystick
    const smooth = this.mode === 'gyro' ? 0.35 : 0.65;
    this.tiltX += (x - this.tiltX) * smooth;
    this.tiltZ += (z - this.tiltZ) * smooth;
  }

  reset() {
    this.keys.clear();
    this.move.release();
    this.look.release();
    this.tiltX = this.tiltZ = this.camX = this.camY = 0;
    this.squeezeHeld = this.squeeze = false;
    document.getElementById('btn-squeeze')?.classList.remove('held');
  }
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

/**
  Joystick de pantalla. Flotante (por defecto): aparece donde se pone el dedo y la base sigue al dedo.
  Fijo: la base se queda en su sitio y el mando se arrastra desde ella.
*/
class Stick {
  fixed = false;
  private x = 0;
  private y = 0;
  private pointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private readonly zone: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;

  constructor(zone: string, base: string, knob: string) {
    this.zone = document.getElementById(zone)!;
    this.base = document.getElementById(base)!;
    this.knob = document.getElementById(knob)!;
  }

  bind(enabled: () => boolean) {
    this.zone.addEventListener('pointerdown', (e) => {
      if (!enabled() || this.pointer !== null) return;
      e.preventDefault();
      this.zone.setPointerCapture(e.pointerId);
      this.pointer = e.pointerId;
      if (this.fixed) {
        const b = this.base.getBoundingClientRect();
        this.origin = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        this.base.classList.add('active');
        this.moveTo(e.clientX, e.clientY);
        return;
      }
      const r = this.zone.getBoundingClientRect();
      // el mando aparece donde pones el dedo (sin salirse de la zona)
      const x = Math.min(Math.max(e.clientX - r.left, JOY_RADIUS + 12), r.width - JOY_RADIUS - 12);
      const y = Math.min(Math.max(e.clientY - r.top, JOY_RADIUS + 12), r.height - JOY_RADIUS - 12);
      this.origin = { x: r.left + x, y: r.top + y };
      this.base.style.left = `${x}px`;
      this.base.style.top = `${y}px`;
      this.base.classList.add('active');
      this.moveTo(e.clientX, e.clientY);
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointer) this.moveTo(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.pointer) this.release();
    };
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
    this.zone.addEventListener('lostpointercapture', end);
  }

  private moveTo(cx: number, cy: number) {
    let dx = cx - this.origin.x;
    let dy = cy - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS && this.fixed) {
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    } else if (len > JOY_RADIUS) {
      // la base sigue al dedo: nunca se "choca" con el borde del mando
      const excess = len - JOY_RADIUS;
      this.origin.x += (dx / len) * excess;
      this.origin.y += (dy / len) * excess;
      const r = this.zone.getBoundingClientRect();
      this.base.style.left = `${this.origin.x - r.left}px`;
      this.base.style.top = `${this.origin.y - r.top}px`;
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.x = dx / JOY_RADIUS;
    this.y = dy / JOY_RADIUS;
  }

  release() {
    this.pointer = null;
    this.x = 0;
    this.y = 0;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.base.classList.remove('active');
    this.base.style.left = '';
    this.base.style.top = '';
  }

  /** Dirección con zona muerta y curva de precisión. */
  read(): [number, number] {
    const len = Math.hypot(this.x, this.y);
    if (len <= JOY_DEAD) return [0, 0];
    const mag = Math.min(1, (len - JOY_DEAD) / (1 - JOY_DEAD)) ** JOY_CURVE;
    return [(this.x / len) * mag, (this.y / len) * mag];
  }
}

/** ¿Hay pantalla completa (API del navegador o app instalada en la pantalla de inicio)? */
export function fullscreenActive() {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement) || installedApp();
}

/** Abierto desde el icono de la pantalla de inicio (ya ocupa toda la pantalla). */
export function installedApp() {
  return matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** El navegador deja poner la página a pantalla completa (el Safari de iPhone no: solo instalándola). */
export function fullscreenSupported() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown };
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}
