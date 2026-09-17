import { MAX_STORIES, TILE_BY_CHAR, TILES, replaceAt, type LevelData, type StoryGrid, type TileDef } from './level/format';

/*
  Creador de niveles: cuadrícula 2D vista desde arriba (fila 0 = fondo, como en el juego).
  Herramientas: pintar una casilla, subir o bajar su altura y mover la vista.
  Pisos: con un piso elegido, lo que se pinta queda a esa altura y el resto se ve apagado (para montar salas
  a distintas alturas unidas por rampas, agujeros o raíles). La vista 3D la pone el juego (main.ts).
  Ratón: clic pinta, rueda acerca, botón derecho o central mueve. Táctil: un dedo pinta, dos dedos mueven y acercan.
*/

export type EditorTool = 'paint' | 'raise' | 'lower' | 'pan';

export const EDITOR_LIMITS = { minW: 5, maxW: 48, minD: 5, maxD: 64 } as const;

/** Nombre estable de cada casilla (para traducir su etiqueta: creator.tiles.<id>). */
export const TILE_IDS: Record<string, string> = {
  '.': 'void', '0': 'floor', '#': 'wall', P: 'start', T: 'treasure', F: 'fire', X: 'firet', I: 'ice', J: 'jump',
  S: 'switchA', s: 'switchB', D: 'doorA', d: 'doorB', C: 'coin', K: 'bladeZ', k: 'bladeX', Y: 'spike', G: 'gem',
  O: 'oil', W: 'plant', Z: 'iceblock', '^': 'fanN', v: 'fanS', '>': 'fanE', '<': 'fanW', Q: 'coldjet',
  R: 'station', '=': 'rail', B: 'crack', V: 'sawD1', A: 'sawD2',
  n: 'rampN', u: 'rampS', e: 'rampE', o: 'rampW', q: 'slabNW', p: 'slabNE', z: 'slabSW', m: 'slabSE', H: 'hole', U: 'exit', '@': 'railLoop', '%': 'railSpiral', E: 'spinner', N: 'cannon', x: 'target',
};

/** Orden de la paleta: lo básico primero. */
export const PALETTE: string[] = ['0', '.', '#', 'P', 'T', 'C', 'G', 'n', 'u', 'e', 'o', 'q', 'p', 'z', 'm', 'H', 'U',
  'B', 'I', 'Z', 'W', 'O', 'F', 'X', 'Y', 'K', 'k', 'V', 'A', 'J', 'S', 'D', 's', 'd', 'R', '=', '@', '%', 'E', 'N', 'x', '^', 'v', '<', '>', 'Q'];

const UNDO_MAX = 60;

export class LevelEditor {
  level!: LevelData;
  tool: EditorTool = 'paint';
  brush = '0';
  /** altura a la que se pinta (0-9) o null para respetar la altura de cada casilla */
  floor: number | null = null;
  /** planta que se edita (0 = la de abajo) */
  story = 0;
  /** se llama tras cada cambio del nivel (para guardar) */
  onChange: (() => void) | null = null;

  private readonly ctx: CanvasRenderingContext2D;
  private cell = 32;
  private offX = 0;
  private offY = 0;
  private undoStack: string[] = [];
  private pointers = new Map<number, { x: number; y: number }>();
  private stroke: { mode: 'paint' | 'pan' | 'pinch'; last: string; dist: number; cx: number; cy: number } | null = null;
  private dirty = false;
  /** casilla bajo el ratón (se resalta) */
  private hover: [number, number] | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    // si se encajó con el lienzo aún sin tamaño (pantalla recién abierta), se vuelve a encajar al tenerlo
    let sized = false;
    new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      if (!sized && r.width > 0 && this.level) { sized = true; this.fit(); }
      else this.draw();
    }).observe(canvas);
  }

  get width() { return this.level.tiles[0].length; }
  get depth() { return this.level.tiles.length; }

  load(level: LevelData) {
    this.level = structuredClone(level);
    this.undoStack = [];
    this.story = 0;
    this.fit();
  }

  get stories() { return 1 + (this.level.stories?.length ?? 0); }

  /** Casillas y alturas de una planta (por defecto, la que se edita). */
  grid(s = this.story): StoryGrid {
    return s === 0 ? this.level : this.level.stories![s - 1];
  }

  /** Añade una planta vacía encima de todas y pasa a ella. Devuelve false si ya hay el máximo. */
  addStory(): boolean {
    if (this.stories >= MAX_STORIES) return false;
    this.snapshot();
    const empty = { tiles: this.level.tiles.map((r) => '.'.repeat(r.length)), heights: this.level.heights.map((r) => '0'.repeat(r.length)) };
    this.level.stories = [...(this.level.stories ?? []), empty];
    this.story = this.stories - 1;
    this.draw();
    this.onChange?.();
    return true;
  }

  /** Quita la planta que se edita (nunca la de abajo). */
  removeStory() {
    if (this.story === 0 || !this.level.stories) return;
    this.snapshot();
    this.level.stories.splice(this.story - 1, 1);
    if (!this.level.stories.length) delete this.level.stories;
    this.story = Math.min(this.story, this.stories - 1);
    this.draw();
    this.onChange?.();
  }

  /** Encaja la cuadrícula entera en el lienzo. */
  fit() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !this.level) return;
    const pad = 16;
    this.cell = Math.max(8, Math.min(48, Math.floor(Math.min((r.width - pad * 2) / this.width, (r.height - pad * 2) / this.depth))));
    this.offX = (r.width - this.cell * this.width) / 2;
    this.offY = (r.height - this.cell * this.depth) / 2;
    this.draw();
  }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    const { tiles, heights, stories } = JSON.parse(snap) as Pick<LevelData, 'tiles' | 'heights' | 'stories'>;
    this.level.tiles = tiles;
    this.level.heights = heights;
    if (stories) this.level.stories = stories;
    else delete this.level.stories;
    this.story = Math.min(this.story, this.stories - 1);
    this.draw();
    this.onChange?.();
    return true;
  }

  get canUndo() { return this.undoStack.length > 0; }

  private snapshot() {
    this.undoStack.push(JSON.stringify({ tiles: this.level.tiles, heights: this.level.heights, stories: this.level.stories }));
    if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
  }

  /** Cambia el tamaño añadiendo o quitando columnas por la derecha y filas por abajo. */
  resize(dw: number, dd: number) {
    const w = Math.max(EDITOR_LIMITS.minW, Math.min(EDITOR_LIMITS.maxW, this.width + dw));
    const d = Math.max(EDITOR_LIMITS.minD, Math.min(EDITOR_LIMITS.maxD, this.depth + dd));
    if (w === this.width && d === this.depth) return;
    this.snapshot();
    const fitRow = (row: string, fill: string) => (row.length >= w ? row.slice(0, w) : row + fill.repeat(w - row.length));
    // todas las plantas miden lo mismo
    for (let s = 0; s < this.stories; s++) {
      const g = this.grid(s);
      let tiles = g.tiles.map((r) => fitRow(r, '.'));
      let heights = g.heights.map((r) => fitRow(r, '0'));
      while (tiles.length < d) { tiles.push('.'.repeat(w)); heights.push('0'.repeat(w)); }
      tiles = tiles.slice(0, d);
      heights = heights.slice(0, d);
      g.tiles = tiles;
      g.heights = heights;
    }
    this.fit();
    this.onChange?.();
  }

  // ---------------------------------------------------------------- entrada

  private cellAt(x: number, y: number): [number, number] | null {
    const i = Math.floor((x - this.offX) / this.cell);
    const j = Math.floor((y - this.offY) / this.cell);
    return i >= 0 && j >= 0 && i < this.width && j < this.depth ? [i, j] : null;
  }

  private local(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent) {
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      // segundo dedo: deshace el trazo recién empezado y pasa a mover/acercar
      if (this.stroke?.mode === 'paint') {
        if (this.dirty) this.undo();
        else this.undoStack.pop();
      }
      const [a, b] = [...this.pointers.values()];
      this.stroke = { mode: 'pinch', last: '', dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    if (this.pointers.size > 2) return;
    if (this.tool === 'pan' || e.button === 1 || e.button === 2) {
      this.stroke = { mode: 'pan', last: '', dist: 0, cx: p.x, cy: p.y };
      return;
    }
    this.snapshot();
    this.dirty = false;
    this.stroke = { mode: 'paint', last: '', dist: 0, cx: p.x, cy: p.y };
    this.applyAt(p.x, p.y);
  }

  private move(e: PointerEvent) {
    if (e.pointerType === 'mouse') {
      const hp = this.local(e);
      const c = this.cellAt(hp.x, hp.y);
      if (c?.[0] !== this.hover?.[0] || c?.[1] !== this.hover?.[1]) { this.hover = c; if (!this.stroke) this.draw(); }
    }
    if (!this.pointers.has(e.pointerId) || !this.stroke) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    const s = this.stroke;
    if (s.mode === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      this.offX += cx - s.cx;
      this.offY += cy - s.cy;
      if (s.dist > 10) this.zoomAt(cx, cy, dist / s.dist, false);
      s.dist = dist; s.cx = cx; s.cy = cy;
      this.draw();
    } else if (s.mode === 'pan') {
      this.offX += p.x - s.cx;
      this.offY += p.y - s.cy;
      s.cx = p.x; s.cy = p.y;
      this.draw();
    } else if (s.mode === 'paint') {
      this.applyAt(p.x, p.y);
    }
  }

  private up(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.stroke?.mode === 'paint') {
      if (!this.dirty) this.undoStack.pop();
      else this.onChange?.();
    }
    if (this.pointers.size === 0) this.stroke = null;
  }

  private zoomAt(x: number, y: number, k: number, redraw = true) {
    const cell = Math.max(8, Math.min(72, this.cell * k));
    const real = cell / this.cell;
    this.offX = x - (x - this.offX) * real;
    this.offY = y - (y - this.offY) * real;
    this.cell = cell;
    if (redraw) this.draw();
  }

  private applyAt(x: number, y: number) {
    const c = this.cellAt(x, y);
    if (!c || !this.stroke) return;
    const key = `${c[0]},${c[1]}`;
    if (key === this.stroke.last) return;
    this.stroke.last = key;
    if (this.edit(c[0], c[1])) {
      this.dirty = true;
      this.draw();
    }
  }

  private edit(i: number, j: number): boolean {
    const L = this.grid();
    const cur = L.tiles[j][i];
    if (this.tool === 'paint') {
      // con un piso elegido, lo pintado queda a su altura (el vacío no tiene altura)
      const h = this.floor !== null && this.brush !== '.' ? String(this.floor) : L.heights[j][i];
      if (cur === this.brush && h === L.heights[j][i]) return false;
      if (cur !== this.brush && TILE_BY_CHAR.get(this.brush)?.unique) {
        // solo una salida y un tesoro en todo el nivel: el anterior (de cualquier planta) pasa a ser suelo
        for (let s = 0; s < this.stories; s++) {
          const g = this.grid(s);
          g.tiles = g.tiles.map((row) => row.split(this.brush).join('0'));
        }
      }
      L.tiles[j] = replaceAt(L.tiles[j], i, this.brush);
      L.heights[j] = replaceAt(L.heights[j], i, h);
      return true;
    }
    if (cur === '.' || cur === '=') return false;
    const h = Number(L.heights[j][i]);
    const next = Math.max(0, Math.min(9, h + (this.tool === 'raise' ? 1 : -1)));
    if (next === h) return false;
    L.heights[j] = replaceAt(L.heights[j], i, String(next));
    return true;
  }

  // ---------------------------------------------------------------- dibujo

  draw() {
    if (!this.level) return;
    const cv = this.canvas;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0c0920';
    g.fillRect(0, 0, r.width, r.height);
    const s = this.cell;
    const i0 = Math.max(0, Math.floor(-this.offX / s)), i1 = Math.min(this.width - 1, Math.floor((r.width - this.offX) / s));
    const j0 = Math.max(0, Math.floor(-this.offY / s)), j1 = Math.min(this.depth - 1, Math.floor((r.height - this.offY) / s));
    const cur = this.grid();
    const below = this.story > 0 ? this.grid(this.story - 1) : null;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = this.offX + i * s, y = this.offY + j * s;
        const ch = cur.tiles[j][i];
        const h = Number(cur.heights[j][i]);
        if (ch === '.' && below && below.tiles[j][i] !== '.') {
          // hueco de esta planta: se ve la de abajo, apagada
          drawCell(g, below.tiles[j][i], Number(below.heights[j][i]), x, y, s, this.neighbourRails(i, j, this.story - 1));
          g.fillStyle = 'rgba(12,9,32,0.7)';
          g.fillRect(x, y, s, s);
          continue;
        }
        drawCell(g, ch, h, x, y, s, this.neighbourRails(i, j));
        // otro piso: apagado
        if (this.floor !== null && ch !== '.' && h !== this.floor) {
          g.fillStyle = 'rgba(12,9,32,0.62)';
          g.fillRect(x, y, s, s);
        }
      }
    }
    // cuadrícula: línea fina en cada casilla y marcada cada 5
    const LW = this.width * s, LD = this.depth * s;
    g.lineWidth = 1;
    for (let k = 0; k <= Math.max(this.width, this.depth); k++) {
      const major = k % 5 === 0;
      if (!major && s < 12) continue;
      g.strokeStyle = major ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.08)';
      g.beginPath();
      if (k <= this.width) { const x = Math.round(this.offX + k * s) + 0.5; g.moveTo(x, this.offY); g.lineTo(x, this.offY + LD); }
      if (k <= this.depth) { const y = Math.round(this.offY + k * s) + 0.5; g.moveTo(this.offX, y); g.lineTo(this.offX + LW, y); }
      g.stroke();
    }
    // numeración cada 5 casillas por fuera del borde
    if (s >= 10) {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = '700 11px Nunito, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      for (let i = 0; i <= this.width; i += 5) g.fillText(String(i), this.offX + i * s, this.offY - 3);
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (let j = 0; j <= this.depth; j += 5) g.fillText(String(j), this.offX - 5, this.offY + j * s);
    }
    // borde del nivel
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 2;
    g.strokeRect(this.offX, this.offY, LW, LD);
    // casilla bajo el ratón
    if (this.hover) {
      g.strokeStyle = '#fde68a';
      g.lineWidth = 2;
      g.strokeRect(this.offX + this.hover[0] * s + 1, this.offY + this.hover[1] * s + 1, s - 2, s - 2);
    }
  }

  /** Vías vecinas (para dibujar la vía unida): bits n=1, e=2, s=4, w=8. */
  private neighbourRails(i: number, j: number, story = this.story) {
    const t = this.grid(story).tiles;
    const rail = (a: number, b: number) => { const c = t[b]?.[a]; return c === '=' || c === '@' || c === '%' || c === 'R'; };
    return (rail(i, j - 1) ? 1 : 0) | (rail(i + 1, j) ? 2 : 0) | (rail(i, j + 1) ? 4 : 0) | (rail(i - 1, j) ? 8 : 0);
  }
}

/** Una casilla vista desde arriba. También dibuja los botones de la paleta. */
export function drawCell(g: CanvasRenderingContext2D, ch: string, height: number, x: number, y: number, s: number, rails = 0) {
  const tile: TileDef = TILE_BY_CHAR.get(ch) ?? TILES[0];
  const cx = x + s / 2, cy = y + s / 2;
  const u = s / 32;
  if (tile.kind === 'void' || tile.kind === 'rail' || tile.kind === 'slab') {
    g.fillStyle = '#140f2b';
    g.fillRect(x, y, s, s);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(cx - u, cy - u, 2 * u, 2 * u);
  } else {
    // suelo: más claro cuanto más alto
    const l = 70 + Math.min(9, height) * 2.4;
    g.fillStyle = `hsl(40 38% ${l}%)`;
    g.fillRect(x, y, s, s);
  }
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);

  const disc = (r: number, fill: string, stroke = '#0f172a') => {
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
    g.lineWidth = Math.max(1, 2 * u); g.strokeStyle = stroke; g.stroke();
  };
  const inset = (pad: number, fill: string) => { g.fillStyle = fill; g.fillRect(x + pad, y + pad, s - pad * 2, s - pad * 2); };
  const arrow = (dx: number, dy: number) => {
    g.save(); g.translate(cx, cy); g.rotate(Math.atan2(dy, dx));
    g.beginPath(); g.moveTo(9 * u, 0); g.lineTo(-5 * u, -7 * u); g.lineTo(-5 * u, 7 * u); g.closePath();
    g.fillStyle = '#e6f4ff'; g.fill(); g.restore();
  };

  switch (tile.kind) {
    case 'wall':
      inset(0, '#6f6798');
      g.strokeStyle = 'rgba(15,23,42,0.35)'; g.lineWidth = Math.max(1, u);
      for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(x, y + (s * k) / 3); g.lineTo(x + s, y + (s * k) / 3); g.stroke(); }
      break;
    case 'start': disc(10 * u, '#2f8cff'); break;
    case 'treasure':
      g.fillStyle = '#f5b301'; g.fillRect(cx - 10 * u, cy - 7 * u, 20 * u, 14 * u);
      g.strokeStyle = '#7c4a03'; g.lineWidth = Math.max(1, 2 * u); g.strokeRect(cx - 10 * u, cy - 7 * u, 20 * u, 14 * u);
      break;
    case 'fire': case 'firet':
      inset(3 * u, tile.kind === 'fire' ? '#7a2e1a' : '#6b3a22');
      g.beginPath(); g.moveTo(cx, cy - 11 * u); g.quadraticCurveTo(cx + 10 * u, cy + 2 * u, cx, cy + 10 * u); g.quadraticCurveTo(cx - 10 * u, cy + 2 * u, cx, cy - 11 * u);
      g.fillStyle = tile.color; g.fill();
      if (tile.kind === 'firet') { g.setLineDash([3 * u, 3 * u]); g.strokeStyle = '#fde68a'; g.lineWidth = Math.max(1, 2 * u); g.strokeRect(x + 4 * u, y + 4 * u, s - 8 * u, s - 8 * u); g.setLineDash([]); }
      break;
    case 'ice':
      inset(0, '#bfeaff');
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = Math.max(1, 2 * u);
      g.beginPath(); g.moveTo(x + 6 * u, y + 20 * u); g.lineTo(x + 20 * u, y + 6 * u); g.stroke();
      break;
    case 'crack':
      inset(0, '#b3a797');
      g.strokeStyle = '#2b2420'; g.lineWidth = Math.max(1, 1.6 * u);
      g.beginPath(); g.moveTo(x + 3 * u, y + 14 * u); g.lineTo(x + 12 * u, y + 17 * u); g.lineTo(x + 17 * u, y + 11 * u); g.lineTo(x + 29 * u, y + 15 * u);
      g.moveTo(x + 17 * u, y + 11 * u); g.lineTo(x + 20 * u, y + 3 * u); g.moveTo(x + 12 * u, y + 17 * u); g.lineTo(x + 10 * u, y + 29 * u); g.stroke();
      break;
    case 'jump': disc(10 * u, '#ec4899'); disc(4 * u, '#fbcfe8'); break;
    case 'switch': disc(9 * u, tile.color); break;
    case 'door':
      inset(3 * u, tile.color);
      g.fillStyle = 'rgba(15,23,42,0.35)';
      for (let k = 0; k < 3; k++) g.fillRect(x + (7 + k * 8) * u, y + 5 * u, 3 * u, s - 10 * u);
      break;
    case 'coin': disc(7 * u, '#ffc53d', '#92400e'); break;
    case 'gem':
      g.beginPath(); g.moveTo(cx, cy - 10 * u); g.lineTo(cx + 9 * u, cy); g.lineTo(cx, cy + 10 * u); g.lineTo(cx - 9 * u, cy); g.closePath();
      g.fillStyle = '#8b5cf6'; g.fill(); g.strokeStyle = '#0f172a'; g.lineWidth = Math.max(1, 2 * u); g.stroke();
      break;
    case 'oil':
      g.fillStyle = '#e0a526'; g.fillRect(cx - 6 * u, cy - 6 * u, 12 * u, 15 * u); g.fillRect(cx - 3 * u, cy - 11 * u, 6 * u, 6 * u);
      break;
    case 'blade':
      g.strokeStyle = '#e2e8f0'; g.lineWidth = Math.max(2, 4 * u);
      g.beginPath();
      if (tile.axis === 'z') { g.moveTo(cx, y + 3 * u); g.lineTo(cx, y + s - 3 * u); }
      else if (tile.axis === 'x') { g.moveTo(x + 3 * u, cy); g.lineTo(x + s - 3 * u, cy); }
      else if (tile.axis === 'd1') { g.moveTo(x + 3 * u, y + 3 * u); g.lineTo(x + s - 3 * u, y + s - 3 * u); }
      else { g.moveTo(x + s - 3 * u, y + 3 * u); g.lineTo(x + 3 * u, y + s - 3 * u); }
      g.stroke();
      g.beginPath(); g.arc(cx, cy, 6 * u, 0, Math.PI * 2); g.fillStyle = '#94a3b8'; g.fill();
      g.stroke();
      break;
    case 'spike':
      g.fillStyle = '#64748b';
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        const px = x + (8 + a * 16) * u, py = y + (8 + b * 16) * u;
        g.beginPath(); g.moveTo(px, py - 6 * u); g.lineTo(px + 5 * u, py + 5 * u); g.lineTo(px - 5 * u, py + 5 * u); g.closePath(); g.fill();
      }
      break;
    case 'plant':
      inset(0, '#2f6e2f');
      g.fillStyle = '#5cb84a';
      for (const [a, b] of [[8, 9], [20, 7], [14, 18], [25, 22], [7, 25]]) { g.beginPath(); g.arc(x + a * u, y + b * u, 4 * u, 0, Math.PI * 2); g.fill(); }
      break;
    case 'iceblock':
      inset(2 * u, '#a9e4ff');
      g.strokeStyle = '#3aa0d8'; g.lineWidth = Math.max(1, 2 * u); g.strokeRect(x + 3 * u, y + 3 * u, s - 6 * u, s - 6 * u);
      break;
    case 'fan': {
      inset(3 * u, '#3d4a66');
      const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[tile.dir ?? 's'];
      arrow(d[0], d[1]);
      break;
    }
    case 'coldjet':
      g.strokeStyle = '#7fd8ff'; g.lineWidth = Math.max(1, 2.5 * u);
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3;
        g.beginPath(); g.moveTo(cx - Math.cos(a) * 10 * u, cy - Math.sin(a) * 10 * u); g.lineTo(cx + Math.cos(a) * 10 * u, cy + Math.sin(a) * 10 * u); g.stroke();
      }
      break;
    case 'station': disc(10 * u, '#7dd3fc'); disc(4 * u, '#0f172a', '#0f172a'); break;
    case 'ramp': {
      // más claro en el lado alto y flechas hacia arriba de la rampa
      const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[tile.rise ?? 'n'];
      const grad = g.createLinearGradient(cx - d[0] * s / 2, cy - d[1] * s / 2, cx + d[0] * s / 2, cy + d[1] * s / 2);
      grad.addColorStop(0, 'rgba(0,0,0,0.18)');
      grad.addColorStop(1, 'rgba(255,255,255,0.35)');
      g.fillStyle = grad;
      g.fillRect(x, y, s, s);
      g.strokeStyle = '#7c5e2a'; g.lineWidth = Math.max(1.5, 2.5 * u);
      for (const k of [-5, 4]) {
        g.save(); g.translate(cx + d[0] * k * u, cy + d[1] * k * u); g.rotate(Math.atan2(d[1], d[0]));
        g.beginPath(); g.moveTo(-4 * u, -7 * u); g.lineTo(3 * u, 0); g.lineTo(-4 * u, 7 * u); g.stroke(); g.restore();
      }
      break;
    }
    case 'slab': {
      const l = 70 + Math.min(9, height) * 2.4;
      g.fillStyle = `hsl(40 38% ${l}%)`;
      g.beginPath();
      const pts = { nw: [[x, y], [x + s, y], [x, y + s]], ne: [[x, y], [x + s, y], [x + s, y + s]], sw: [[x, y], [x + s, y + s], [x, y + s]], se: [[x + s, y], [x + s, y + s], [x, y + s]] }[tile.corner ?? 'nw'];
      g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.lineTo(pts[2][0], pts[2][1]); g.closePath(); g.fill();
      break;
    }
    case 'hole':
      disc(11.5 * u, '#07050f', '#3b3552');
      break;
    case 'spinner':
      for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 13 * u, (k / 8) * Math.PI * 2, ((k + 1) / 8) * Math.PI * 2); g.fillStyle = k % 2 ? '#f5d0fe' : '#c026d3'; g.fill(); }
      disc(3.5 * u, '#fdf4ff', '#701a75');
      break;
    case 'cannon':
      disc(12 * u, '#323a4a', '#c28b2c');
      disc(6.5 * u, '#07060c', '#c28b2c');
      break;
    case 'target':
      disc(11 * u, '#e2e8f0', '#b91c1c');
      disc(6.5 * u, '#b91c1c', '#e2e8f0');
      disc(2.5 * u, '#e2e8f0', '#e2e8f0');
      break;
    case 'exit':
      g.beginPath(); g.arc(cx, cy, 11 * u, 0, Math.PI * 2);
      g.lineWidth = Math.max(2, 3.5 * u); g.strokeStyle = '#5b4b8a'; g.setLineDash([4 * u, 3 * u]); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(cx, cy - 6 * u); g.lineTo(cx, cy + 5 * u); g.moveTo(cx - 4 * u, cy + 1 * u); g.lineTo(cx, cy + 5 * u); g.lineTo(cx + 4 * u, cy + 1 * u); g.stroke();
      break;
    case 'rail': {
      g.strokeStyle = '#9aa3b5'; g.lineWidth = Math.max(2, 3 * u);
      g.beginPath();
      const bits = rails || 0;
      const ends: [number, number][] = [];
      if (bits & 1) ends.push([cx, y]);
      if (bits & 2) ends.push([x + s, cy]);
      if (bits & 4) ends.push([cx, y + s]);
      if (bits & 8) ends.push([x, cy]);
      if (!ends.length) { g.moveTo(x + 4 * u, cy); g.lineTo(x + s - 4 * u, cy); }
      for (const [ex, ey] of ends) { g.moveTo(cx, cy); g.lineTo(ex, ey); }
      g.stroke();
      if (tile.shape === 'loop') { g.beginPath(); g.arc(cx, cy, 8 * u, 0, Math.PI * 2); g.strokeStyle = '#a5b4fc'; g.stroke(); }
      if (tile.shape === 'spiral') {
        g.beginPath();
        for (let q = 0; q <= 40; q++) { const a = (q / 40) * Math.PI * 4; const r = (3 + (q / 40) * 8) * u; if (q) g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        g.strokeStyle = '#a5b4fc'; g.stroke();
      }
      break;
    }
    default: break;
  }

  // altura (las casillas que se pisan)
  if (height > 0 && tile.kind !== 'void' && tile.kind !== 'rail' && s >= 18) {
    g.font = `800 ${Math.round(10 * u + 2)}px Nunito, system-ui, sans-serif`;
    g.textAlign = 'right';
    g.textBaseline = 'bottom';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(15,23,42,0.85)';
    g.strokeText(String(height), x + s - 2 * u, y + s - 1 * u);
    g.fillStyle = '#fff';
    g.fillText(String(height), x + s - 2 * u, y + s - 1 * u);
  }
}
