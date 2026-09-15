/*
  Vida del limo como una barra: un tubo de cristal tumbado lleno de limo (canvas 2D, muy barato).
  - El frente del líquido retrocede suavemente cuando se pierde limo y ondula como un menisco.
  - La superficie se inclina con el control (muelle amortiguado) y hace olas.
  - Al recibir daño salpica; con poca vida el líquido se vuelve rojo, burbujea más y el tubo late.
*/

const CSS_W = 132;
const CSS_H = 30;
const X0 = 3, Y0 = 5, TW = 126, TH = 20;

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
  private top = '#7cc0ff';
  private bottom = '#1d6fe0';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = CSS_W * this.scale;
    canvas.height = CSS_H * this.scale;
    canvas.style.width = `${CSS_W}px`;
    canvas.style.height = `${CSS_H}px`;
    this.ctx = canvas.getContext('2d')!;
  }

  /** Colores del líquido (claro arriba, oscuro abajo): siguen al color del limo. */
  setColors(top: string, bottom: string) {
    this.top = top;
    this.bottom = bottom;
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
    const target = -input * 0.16;
    this.angleVel += ((target - this.angle) * 38 - this.angleVel * 5.5) * dt + kick * 0.2;
    this.angle += this.angleVel * dt;
    this.wave = Math.max(0.1, this.wave - dt * 0.9);

    const front = X0 + TW * this.level;
    if (Math.random() < dt * (danger ? 9 : 3.5) && this.level > 0.06) {
      this.bubbles.push({ x: X0 + 4 + Math.random() * Math.max(4, front - X0 - 10), y: Y0 + TH - 2, r: 0.8 + Math.random() * 1.6, v: 6 + Math.random() * 9 });
    }
    this.draw(dt, danger);
  }

  private draw(dt: number, danger: boolean) {
    const c = this.ctx;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.clearRect(0, 0, CSS_W, CSS_H);
    const ink = '#0f172a';
    const r = TH / 2;

    // tubo de cristal
    c.beginPath();
    c.roundRect(X0, Y0, TW, TH, r);
    c.fillStyle = 'rgba(15, 23, 42, 0.16)';
    c.fill();

    c.save();
    c.beginPath();
    c.roundRect(X0, Y0, TW, TH, r);
    c.clip();

    const front = X0 + TW * this.level + this.angle * -10;
    const amp = 0.8 + this.wave * 2.4;
    const surface = (x: number) => Y0 + 3.2 + (x - (X0 + TW / 2)) * Math.tan(this.angle) * 0.35
      + Math.sin(x * 0.22 + this.t * 5) * amp * 0.5 + Math.sin(x * 0.09 - this.t * 3.1) * amp * 0.4;

    if (this.level > 0.004) {
      const grad = c.createLinearGradient(0, Y0, 0, Y0 + TH);
      grad.addColorStop(0, danger ? '#fb7185' : this.top);
      grad.addColorStop(1, danger ? '#b91c1c' : this.bottom);
      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(X0 - 2, Y0 + TH + 2);
      c.lineTo(X0 - 2, surface(X0 - 2));
      for (let x = X0; x < front; x += 2) c.lineTo(x, surface(x));
      // frente del líquido: menisco redondeado que tiembla
      const fy = surface(front);
      for (let k = 0; k <= 8; k++) {
        const y = fy + ((Y0 + TH + 2 - fy) * k) / 8;
        const bulge = Math.sin((k / 8) * Math.PI) * 3;
        c.lineTo(front + bulge + Math.sin(y * 0.6 + this.t * 7) * amp * 0.5, y);
      }
      c.closePath();
      c.fill();

      // brillo de la superficie
      c.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(X0, surface(X0));
      for (let x = X0; x < front - 2; x += 2) c.lineTo(x, surface(x));
      c.stroke();

      // burbujas dentro del limo
      c.fillStyle = 'rgba(255, 255, 255, 0.65)';
      this.bubbles = this.bubbles.filter((b) => {
        b.y -= b.v * dt;
        b.x += Math.sin(this.t * 6 + b.r * 3) * 0.2;
        if (b.y < surface(b.x) + 1.5 || b.x > front - 2) return false;
        c.beginPath();
        c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        c.fill();
        return true;
      });
    } else this.bubbles.length = 0;

    // marcas de cuarto de vida
    c.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    c.lineWidth = 1.5;
    for (const q of [0.25, 0.5, 0.75]) {
      const x = X0 + TW * q;
      c.beginPath();
      c.moveTo(x, Y0 + TH - 5);
      c.lineTo(x, Y0 + TH);
      c.stroke();
    }
    c.restore();

    // reflejo del cristal y contorno (late en rojo con poca vida)
    c.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    c.lineWidth = 2.5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(X0 + r, Y0 + 4.5);
    c.lineTo(X0 + TW * 0.55, Y0 + 4.5);
    c.stroke();
    c.beginPath();
    c.moveTo(X0 + TW * 0.62, Y0 + 4.5);
    c.lineTo(X0 + TW * 0.68, Y0 + 4.5);
    c.stroke();
    const pulse = danger ? 0.5 + Math.sin(this.t * 9) * 0.5 : 0;
    c.strokeStyle = pulse > 0 ? `rgb(${Math.round(15 + 200 * pulse)}, ${Math.round(23 + 10 * pulse)}, ${Math.round(42 + 10 * pulse)})` : ink;
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(X0, Y0, TW, TH, r);
    c.stroke();
  }
}
