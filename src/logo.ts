/*
  Título "Slime Abyss": letras Fredoka con relieve de tinta, degradado de limo, brillo y goterones.
  El SVG del menú (index.html) trae las capas; aquí se colocan las gotas bajo las letras cuando la fuente
  ya ha cargado (sus posiciones dependen de la forma real de cada letra) y se ajusta el encuadre.
  drawLogo() pinta lo mismo en un canvas (imagen para compartir el enlace).
*/

const SVG_NS = 'http://www.w3.org/2000/svg';

/** gotas bajo "Slime": [letra, posición dentro de la letra (0..1), largo] */
const DRIPS: [number, number, number][] = [[0, 0.4, 20], [1, 0.5, 36], [3, 0.14, 22], [3, 0.87, 44], [4, 0.52, 16]];
const DRIP_W = 10.5;

function dripPath(x: number, y0: number, len: number, w = DRIP_W) {
  const b = y0 + len;
  return `M ${x - w} ${y0} L ${x - w * 0.78} ${y0 + len * 0.55} C ${x - w * 1.4} ${b - w * 0.2} ${x - w * 1.1} ${b + w * 1.15} ${x} ${b + w * 1.15}`
    + ` C ${x + w * 1.1} ${b + w * 1.15} ${x + w * 1.4} ${b - w * 0.2} ${x + w * 0.78} ${y0 + len * 0.55} L ${x + w} ${y0} Z`;
}

export function decorateLogo(svg: SVGSVGElement) {
  const place = () => {
    const text = svg.querySelector<SVGTextElement>('.logo-fill[data-word="slime"]');
    const groups = [...svg.querySelectorAll('.logo-drips-outline, .logo-drips-fill')];
    if (!text || !groups.length) return;
    for (const g of groups) g.replaceChildren();
    const baseline = Number(text.getAttribute('y'));
    for (const [i, frac, len] of DRIPS) {
      if (i >= text.getNumberOfChars()) continue;
      const box = text.getExtentOfChar(i);
      const d = dripPath(box.x + box.width * frac, baseline - 16, len);
      for (const group of groups) {
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', d);
        group.appendChild(p);
      }
    }
    // encuadre justo (con margen para el contorno y el relieve)
    const bb = svg.getBBox();
    svg.setAttribute('viewBox', `${bb.x - 12} ${bb.y - 10} ${bb.width + 24} ${bb.height + 26}`);
  };
  place();
  document.fonts?.ready.then(place).catch(() => { /* sin API de fuentes: se queda como está */ });
}

const INK = '#0f172a';
const SLIME_STOPS: [number, string][] = [[0, '#e2f7ff'], [0.38, '#7fd0ff'], [0.7, '#2f8cff'], [1, '#1846b8']];
const ABYSS_STOPS: [number, string][] = [[0, '#f3e8ff'], [0.38, '#b9a0ff'], [0.72, '#7c4dff'], [1, '#3b1f99']];

/** Pinta el título en un canvas 2D. (x, y) = esquina superior izquierda; size = cuerpo de "Slime". */
export function drawLogo(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const words: { text: string; size: number; base: number; stops: [number, string][]; drips: boolean }[] = [
    { text: 'Slime', size, base: y + size * 0.86, stops: SLIME_STOPS, drips: true },
    { text: 'Abyss', size: size * 0.9, base: y + size * 1.78, stops: ABYSS_STOPS, drips: false },
  ];
  const k = size / 156;
  for (const w of words) {
    g.font = `700 ${w.size}px Fredoka, Nunito, sans-serif`;
    g.textBaseline = 'alphabetic';
    const grad = g.createLinearGradient(0, w.base - w.size * 0.85, 0, w.base + (w.drips ? 40 * k : 8 * k));
    for (const [o, c] of w.stops) grad.addColorStop(o, c);
    const drips = new Path2D();
    if (w.drips) {
      for (const [i, frac, len] of DRIPS) {
        const left = g.measureText(w.text.slice(0, i)).width;
        const width = g.measureText(w.text[i]).width;
        drips.addPath(new Path2D(dripPath(x + left + width * frac, w.base - 16 * k, len * k, DRIP_W * k)));
      }
    }
    g.lineJoin = 'round';
    g.lineWidth = 16 * k;
    // relieve
    g.save();
    g.translate(0, 10 * k);
    g.fillStyle = g.strokeStyle = INK;
    g.stroke(drips);
    g.strokeText(w.text, x, w.base);
    g.fill(drips);
    g.fillText(w.text, x, w.base);
    g.restore();
    // contorno y relleno
    g.strokeStyle = INK;
    g.stroke(drips);
    g.strokeText(w.text, x, w.base);
    g.fillStyle = grad;
    g.fill(drips);
    g.fillText(w.text, x, w.base);
    // brillo en la parte alta de las letras
    g.save();
    g.beginPath();
    g.rect(x - 20 * k, w.base - w.size * 0.78, g.measureText(w.text).width + 40 * k, w.size * 0.34);
    g.clip();
    const gloss = g.createLinearGradient(0, w.base - w.size * 0.78, 0, w.base - w.size * 0.44);
    gloss.addColorStop(0, 'rgba(255,255,255,0.85)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gloss;
    g.globalCompositeOperation = 'source-atop';
    g.fillText(w.text, x, w.base);
    g.restore();
  }
}
