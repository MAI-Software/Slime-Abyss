/*
  Vida del limo como líquido dentro de un frasco (canvas 2D, muy barato).
  - El nivel baja suavemente cuando se pierde limo.
  - La superficie se inclina con el control (muelle amortiguado) y ondula.
  - Al recibir daño salpica; con poca vida el líquido se vuelve rojo y burbujea más.
*/

const CSS_SIZE = 64;

interface Bubble { x: number; y: number; r: number; v: number }

export class LiquidGauge {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scale: number;
  private level = 1;
  private angle = 0;
  private angleVel = 0;
  private wave = 0;
  private t = 0;
  private bubbles: Bubble[] = [];
  private lastInput = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = CSS_SIZE * this.scale;
    canvas.height = CSS_SIZE * this.scale;
    canvas.style.width = `${CSS_SIZE}px`;
    canvas.style.height = `${CSS_SIZE}px`;
    this.ctx = canvas.getContext('2d')!;
  }

  reset() {
    this.level = 1;
    this.angle = this.angleVel = this.wave = 0;
    this.bubbles.length = 0;
  }

  splash(strength = 1) {
    this.wave = Math.min(1.2, this.wave + 0.55 * strength);
    this.angleVel += (Math.random() - 0.5) * 3 * strength;
  }

  update(dt: number, pct: number, input: number, danger: boolean) {
    this.t += dt;
    this.level += (pct - this.level) * Math.min(1, dt * 4);

    // muelle: la superficie tiende a inclinarse contra el movimiento
    const kick = (input - this.lastInput) * 6;
    this.lastInput = input;
    const target = -input * 0.38;
    this.angleVel += ((target - this.angle) * 38 - this.angleVel * 5.5) * dt + kick * 0.35;
    this.angle += this.angleVel * dt;
    this.wave = Math.max(0.08, this.wave - dt * 0.9);

    if (Math.random() < dt * (danger ? 7 : 2.5) && this.level > 0.05) {
      this.bubbles.push({ x: 22 + Math.random() * 20, y: 54, r: 1.2 + Math.random() * 2, v: 10 + Math.random() * 14 });
    }
    this.draw(danger);
  }

  private draw(danger: boolean) {
    const c = this.ctx;
    const s = this.scale;
    c.setTransform(s, 0, 0, s, 0, 0);
    c.clearRect(0, 0, CSS_SIZE, CSS_SIZE);

    const cx = 32, cy = 38, r = 22;
    const ink = '#0f172a';

    // cuello y tapón
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.strokeStyle = ink;
    c.lineWidth = 3;
    roundRect(c, cx - 7, 8, 14, 12, 3);
    c.fill();
    c.stroke();
    c.fillStyle = '#b07a4a';
    roundRect(c, cx - 9, 3, 18, 7, 3);
    c.fill();
    c.stroke();

    // cuerpo del frasco
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = 'rgba(253,242,248,0.9)';
    c.fill();
    c.clip();

    // líquido: plano inclinado con dos ondas
    const surfaceY = cy + r - this.level * r * 2;
    const top = danger ? '#fb7185' : '#7cc0ff';
    const bottom = danger ? '#dc2626' : '#1d6fe0';
    const grad = c.createLinearGradient(0, surfaceY - 4, 0, cy + r);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    c.fillStyle = grad;
    c.beginPath();
    const amp = 1.2 + this.wave * 4;
    for (let x = cx - r - 2; x <= cx + r + 2; x += 2) {
      const tilt = (x - cx) * Math.tan(this.angle);
      const y = surfaceY + tilt
        + Math.sin(x * 0.28 + this.t * 5) * amp * 0.6
        + Math.sin(x * 0.13 - this.t * 3.4) * amp * 0.4;
      if (x === cx - r - 2) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.lineTo(cx + r + 2, cy + r + 2);
    c.lineTo(cx - r - 2, cy + r + 2);
    c.closePath();
    c.fill();

    // espuma clara en la superficie
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 2;
    c.stroke();

    // burbujas
    c.fillStyle = 'rgba(255,255,255,0.7)';
    const dt = 1 / 60;
    this.bubbles = this.bubbles.filter((b) => {
      b.y -= b.v * dt;
      b.x += Math.sin(this.t * 6 + b.r * 3) * 0.3;
      if (b.y < surfaceY + 2) return false;
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      c.fill();
      return true;
    });
    c.restore();

    // brillo del cristal y contorno
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(cx, cy, r - 6, Math.PI * 1.1, Math.PI * 1.45);
    c.stroke();
    c.strokeStyle = ink;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}
