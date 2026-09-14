import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './style.css';
import { Assets } from './assets';
import { CHAPTERS, PRACTICE, UPCOMING } from './level/campaign';
import { DEFAULT_KEEP_PCT, starsOf, type ChapterDef, type FloorResult, type LevelData } from './level/format';
import { World } from './world';
import { Slime } from './slime';
import { Input, type ControlMode } from './input';
import { Fx } from './fx';
import { LiquidGauge } from './hud-liquid';
import { setMuted, sfx, unlockAudio } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Vibración corta; el navegador solo la permite tras un toque del usuario. */
function buzz(pattern: number | number[]) {
  if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === false) return;
  navigator.vibrate?.(pattern);
}

// ------------------------------------------------------------------ render base

const lowQuality = matchMedia('(pointer: coarse)').matches;
const canvas = $<HTMLCanvasElement>('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowQuality, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Neutral conserva los colores saturados del estilo cartoon
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = skyTexture();
scene.fog = new THREE.Fog(0x191336, 18, 40);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
pmrem.dispose();

/** Fondo: degradado morado, pintado una vez en un canvas. */
function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3a2b78');
  grad.addColorStop(0.45, '#241a52');
  grad.addColorStop(1, '#0e0a22');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);

// luz de cielo fría + sol cálido con sombras + contraluz azul que recorta al limo y los muros
scene.add(new THREE.HemisphereLight(0xd2e2ff, 0x3d2d5c, 1.05));
const rim = new THREE.DirectionalLight(0x86a8ff, 0.85);
scene.add(rim, rim.target);
const sun = new THREE.DirectionalLight(0xffe4c0, 2.4);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -9;
sun.shadow.camera.right = sun.shadow.camera.top = 9;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
scene.add(sun, sun.target);

// ------------------------------------------------------------------ calidad adaptativa
// Si el móvil no llega a ~45 fps baja resolución y sombras; si va sobrado, las sube.

const QUALITY = [
  { ratio: 1.0, shadow: 0 },
  { ratio: 1.25, shadow: 512 },
  { ratio: 1.5, shadow: 1024 },
  { ratio: 2.0, shadow: 2048 },
] as const;
let quality = lowQuality ? 2 : 3;
let frameAvg = 1 / 60;
let qualityTimer = 0;
let fastTime = 0;

function applyQuality(level: number) {
  quality = level;
  const q = QUALITY[level];
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.ratio));
  resize();
  const shadows = q.shadow > 0;
  if (sun.castShadow !== shadows) sun.castShadow = shadows;
  if (shadows && sun.shadow.mapSize.x !== q.shadow) {
    sun.shadow.mapSize.setScalar(q.shadow);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
}

function watchQuality(dt: number) {
  frameAvg += (dt - frameAvg) * 0.05;
  qualityTimer += dt;
  fastTime = frameAvg < 1 / 55 ? fastTime + dt : 0;
  if (qualityTimer < 2) return;
  if (frameAvg > 1 / 45 && quality > 0) {
    applyQuality(quality - 1);
    qualityTimer = 0;
    frameAvg = 1 / 60;
  } else if (fastTime > 8 && quality < QUALITY.length - 1 && !(lowQuality && quality >= 2)) {
    applyQuality(quality + 1);
    qualityTimer = 0;
    fastTime = 0;
  }
}

// raíz inclinable (efecto visual tipo Mercury) → contenido del nivel dentro
const tiltRoot = new THREE.Group();
const content = new THREE.Group();
tiltRoot.add(content);
scene.add(tiltRoot);

const fx = new Fx();
content.add(fx.group);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
applyQuality(quality);

// ------------------------------------------------------------------ guardado

interface FloorSave { done: boolean; allCoins: boolean; kept: boolean; bestCoins: number; bestPct: number; bestTime: number }
interface Save { v: 2; control: ControlMode; sound: boolean; floors: Record<string, FloorSave> }

function loadSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem('blub-save') ?? '');
    if (s?.v === 2) return s;
    if (s?.control) return { v: 2, control: s.control, sound: true, floors: {} };
  } catch { /* primera vez */ }
  return { v: 2, control: 'joystick', sound: true, floors: {} };
}
const save = loadSave();
function writeSave() {
  try { localStorage.setItem('blub-save', JSON.stringify(save)); } catch { /* modo privado */ }
}
const floorSave = (id: string) => save.floors[id];
const floorStars = (id: string) => (save.floors[id] ? starsOf(save.floors[id]) : 0);
const floorUnlocked = (ch: ChapterDef, k: number) => k === 0 || !!floorSave(ch.floors[k - 1].id)?.done;
const chapterDone = (ch: ChapterDef) => ch.floors.every((f) => floorSave(f.id)?.done);

// ------------------------------------------------------------------ estado

const input = new Input();
const gauge = new LiquidGauge($<HTMLCanvasElement>('life-flask'));

type Mode = 'menu' | 'play' | 'pause' | 'winning' | 'result';
let mode: Mode = 'menu';
let assets: Assets | null = null;
let world: World | null = null;
let slime: Slime | null = null;
let chapter: ChapterDef | null = null;
let floorIndex = 0;
let elapsed = 0;
let tipIndex = 0;
let lastAlive = 0;
let winT = 0;
let acc = 0;
let menuAngle = 0;
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const tmpCenter = new THREE.Vector3();
const camWant = new THREE.Vector3();
let camZoom = 1;

// ------------------------------------------------------------------ iconos

const STAR_PATH = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';
const starSvg = (on: boolean) => `<svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
const starsHtml = (n: number) => `<span class="star-row" aria-label="${n} de 3 estrellas">${[0, 1, 2].map((k) => starSvg(k < n)).join('')}</span>`;
const coinSvg = '<svg class="ico coin-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>';
const lockSvg = '<svg class="ico lock-ico" viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const checkSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const crossSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
const fmtTime = (t: number) => { const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const coinsTotalOf = (lv: LevelData) => lv.tiles.join('').split('C').length - 1;

// ------------------------------------------------------------------ pantallas

const SCREENS = ['main', 'story', 'chapter', 'settings', 'pause', 'result', 'breakdown'] as const;
type ScreenId = (typeof SCREENS)[number];

function show(id: ScreenId | null) {
  for (const s of SCREENS) {
    const el = $(`screen-${s}`);
    const visible = s === id;
    if (visible && el.hidden) {
      el.classList.remove('enter');
      void el.offsetWidth; // reinicia la animación de entrada
      el.classList.add('enter');
    }
    el.hidden = !visible;
  }
  $('hud').hidden = !(mode === 'play' || mode === 'pause' || mode === 'winning');
}

document.querySelectorAll<HTMLButtonElement>('[data-back]').forEach((b) => {
  b.addEventListener('click', () => {
    sfx.click();
    const to = b.dataset.back as ScreenId;
    if (to === 'story') renderStory();
    show(to);
  });
});

function toast(text: string, ms = 3200) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout((toast as unknown as { h?: number }).h);
  (toast as unknown as { h?: number }).h = window.setTimeout(() => (t.hidden = true), ms);
}

function renderStory() {
  const list = $('chapter-list');
  list.innerHTML = '';
  for (const ch of CHAPTERS) {
    const stars = ch.floors.reduce((a, f) => a + floorStars(f.id), 0);
    const coins = ch.floors.reduce((a, f) => a + (floorSave(f.id)?.bestCoins ?? 0), 0);
    const coinsTotal = ch.floors.reduce((a, f) => a + coinsTotalOf(f), 0);
    const b = document.createElement('button');
    b.className = 'card chapter-card';
    b.innerHTML = `<span class="eyebrow">${ch.name}</span><span class="title">${ch.subtitle}</span>
      <span class="meta"><span class="m">${starSvg(true)} ${stars}/${ch.floors.length * 3}</span><span class="m">${coinSvg} ${coins}/${coinsTotal}</span></span>
      <span class="progress"><i style="width:${(stars / (ch.floors.length * 3)) * 100}%"></i></span>`;
    b.addEventListener('click', () => { sfx.click(); openChapter(ch); });
    list.appendChild(b);
  }
  for (const up of UPCOMING) {
    const b = document.createElement('button');
    b.className = 'card chapter-card locked';
    b.disabled = true;
    b.innerHTML = `${lockSvg}<span class="eyebrow">${up.name}</span><span class="title">${up.subtitle}</span>`;
    list.appendChild(b);
  }
}

function openChapter(ch: ChapterDef) {
  chapter = ch;
  $('chapter-title').textContent = ch.name;
  $('chapter-sub').textContent = ch.subtitle;
  const list = $('floor-list');
  list.innerHTML = '';
  ch.floors.forEach((f, k) => {
    const unlocked = floorUnlocked(ch, k);
    const s = floorSave(f.id);
    const b = document.createElement('button');
    b.className = `card floor-card${unlocked ? '' : ' locked'}`;
    b.disabled = !unlocked;
    b.innerHTML = `${unlocked ? '' : lockSvg}<span class="num">Piso ${k + 1}</span><span class="name">${unlocked ? f.name : 'Bloqueado'}</span>
      ${unlocked ? `<span class="meta">${starsHtml(floorStars(f.id))}<span class="m">${coinSvg} ${s?.bestCoins ?? 0}/${coinsTotalOf(f)}</span></span>` : ''}`;
    b.addEventListener('click', () => { sfx.click(); startFloor(ch, k); });
    list.appendChild(b);
  });
  $('btn-chapter-breakdown').hidden = !chapterDone(ch);
  show('chapter');
}

$('btn-chapter-breakdown').addEventListener('click', () => { sfx.click(); if (chapter) showBreakdown(chapter); });

// ------------------------------------------------------------------ ajustes

function setControl(m: ControlMode) {
  input.setMode(m);
  if (m === 'gyro') input.requestPermission();
  document.querySelectorAll<HTMLButtonElement>('.pick-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  save.control = m;
  writeSave();
}
document.querySelectorAll<HTMLButtonElement>('.pick-btn').forEach((b) => {
  b.addEventListener('click', () => { sfx.click(); setControl(b.dataset.mode as ControlMode); });
});
setControl(save.control);

function setSound(on: boolean) {
  save.sound = on;
  setMuted(!on);
  const b = $('btn-sound');
  b.textContent = on ? 'Activado' : 'Silenciado';
  b.setAttribute('aria-pressed', String(on));
  writeSave();
}
setSound(save.sound);

$('btn-sound').addEventListener('click', () => { setSound(!save.sound); sfx.click(); });
$('btn-calib').addEventListener('click', () => { input.calibrate(); sfx.click(); });
$('btn-pause-calib').addEventListener('click', () => { input.calibrate(); sfx.click(); });
$('btn-settings').addEventListener('click', () => { unlockAudio(); sfx.click(); show('settings'); });
$('btn-practice').addEventListener('click', () => { sfx.click(); startLevel(PRACTICE, null, 0); });
$('btn-story').addEventListener('click', () => {
  unlockAudio();
  sfx.click();
  if (input.mode === 'gyro') input.requestPermission();
  input.requestFullscreen();
  renderStory();
  show('story');
});

// ------------------------------------------------------------------ pausa

function pause() {
  if (mode !== 'play') return;
  mode = 'pause';
  input.reset();
  show('pause');
}
$('btn-pause').addEventListener('click', () => { sfx.click(); pause(); });
$('btn-resume').addEventListener('click', () => { sfx.click(); mode = 'play'; acc = 0; show(null); });
$('btn-restart').addEventListener('click', () => { sfx.click(); restart(); });
$('btn-quit').addEventListener('click', () => { sfx.click(); leaveLevel(); });
document.addEventListener('visibilitychange', () => {
  if (import.meta.env.DEV && (window as unknown as { __blubNoPause?: boolean }).__blubNoPause) return;
  if (document.hidden) pause();
});
matchMedia('(orientation: portrait) and (pointer: coarse)').addEventListener('change', (e) => { if (e.matches) pause(); });

// ------------------------------------------------------------------ niveles

function clearLevel() {
  if (world) { content.remove(world.group); world.dispose(); world = null; }
  if (slime) { content.remove(slime.group); slime.dispose(); slime = null; }
  fx.reset();
}

function loadLevel(def: LevelData) {
  clearLevel();
  world = new World(def, assets!);
  slime = new Slime(world, def.count, lowQuality, assets!);
  content.add(world.group, slime.group);
  camTarget.copy(world.start);
  camPos.set(0, 0, 0);
}

function startFloor(ch: ChapterDef, k: number) {
  startLevel(ch.floors[k], ch, k);
}

function startLevel(def: LevelData, ch: ChapterDef | null, k: number) {
  chapter = ch;
  floorIndex = k;
  loadLevel(def);
  elapsed = 0;
  tipIndex = 0;
  winT = 0;
  acc = 0;
  lastAlive = def.count;
  hudCache.alive = hudCache.seconds = hudCache.coins = -1;
  gauge.reset();
  $('level-name').textContent = ch ? `Piso ${k + 1} · ${def.name}` : def.name;
  $('hud-coins').hidden = world!.coinsTotal === 0;
  input.reset();
  if (input.mode === 'gyro') input.calibrate();
  mode = 'play';
  show(null);
  updateHud();
}

function restart() {
  if (world) startLevel(world.def, chapter, floorIndex);
}

function leaveLevel() {
  const ch = chapter;
  toMenuScene();
  if (ch) openChapter(ch);
  else show('settings');
}

/** Fondo del menú: el primer piso con el limo en reposo y la cámara girando despacio. */
function toMenuScene() {
  mode = 'menu';
  if (assets) loadLevel(CHAPTERS[0].floors[0]);
}

// ------------------------------------------------------------------ HUD

const hudCache = { alive: -1, seconds: -1, coins: -1 };
const hudEls = { pct: $('life-pct'), timer: $('timer'), coins: $('coins-count'), coinChip: $('hud-coins'), life: document.querySelector('.hud-chip.life') as HTMLElement };

/** Solo toca el DOM cuando cambia algo. */
function updateHud() {
  if (!slime || !world) return;
  const alive = slime.aliveCount;
  if (alive !== hudCache.alive) {
    hudCache.alive = alive;
    hudEls.pct.textContent = `${Math.round((alive / slime.n) * 100)}%`;
  }
  const s = Math.floor(elapsed);
  if (s !== hudCache.seconds) {
    hudCache.seconds = s;
    hudEls.timer.textContent = fmtTime(elapsed);
  }
  if (world.coinsCollected !== hudCache.coins) {
    if (hudCache.coins >= 0) bump(hudEls.coinChip, 'bump');
    hudCache.coins = world.coinsCollected;
    hudEls.coins.textContent = `${world.coinsCollected}/${world.coinsTotal}`;
  }
}

function bump(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// ------------------------------------------------------------------ resultado

function finish(win: boolean) {
  if (!slime || !world) return;
  mode = 'result';
  const def = world.def;
  const pct = slime.aliveCount / slime.n;
  const keepPct = def.keepPct ?? DEFAULT_KEEP_PCT;
  const r: FloorResult = {
    done: win,
    coins: world.coinsCollected,
    coinsTotal: world.coinsTotal,
    allCoins: win && world.coinsCollected === world.coinsTotal,
    pct,
    kept: win && pct >= keepPct,
    time: elapsed,
  };
  const earned = starsOf(r);

  if (win && chapter) {
    const prev = save.floors[def.id];
    save.floors[def.id] = {
      done: true,
      allCoins: r.allCoins || !!prev?.allCoins,
      kept: r.kept || !!prev?.kept,
      bestCoins: Math.max(prev?.bestCoins ?? 0, r.coins),
      bestPct: Math.max(prev?.bestPct ?? 0, pct),
      bestTime: prev?.done ? Math.min(prev.bestTime, elapsed) : elapsed,
    };
    writeSave();
  }

  $('result-title').textContent = win ? '¡Piso completado!' : 'El limo se ha deshecho';
  const starsEl = $('result-stars');
  starsEl.innerHTML = win ? [0, 1, 2].map(() => starSvg(false)).join('') : '';
  const goals = win
    ? [
      { ok: r.done, label: 'Llegar al tesoro', val: '' },
      { ok: r.allCoins, label: 'Todas las monedas', val: `${r.coins}/${r.coinsTotal}` },
      { ok: r.kept, label: `Conservar el ${Math.round(keepPct * 100)}% del limo`, val: `${Math.round(pct * 100)}%` },
    ]
    : [{ ok: false, label: `Necesitas al menos el ${Math.round(def.minPct * 100)}% del limo`, val: `${Math.round(pct * 100)}%` }];
  $('result-goals').innerHTML = goals.map((g, k) =>
    `<li class="${g.ok ? 'ok' : ''}" style="animation-delay:${150 + k * 120}ms"><span class="goal-mark">${g.ok ? checkSvg : crossSvg}</span>${g.label}<span class="val">${g.val}</span></li>`).join('');

  // estrellas una a una
  if (win) {
    [...starsEl.children].forEach((star, k) => {
      if (k >= earned) return;
      setTimeout(() => { star.classList.add('on'); sfx.star(k); buzz(20); }, 450 + k * 380);
    });
  }

  const last = !!chapter && floorIndex === chapter.floors.length - 1;
  const next = $<HTMLButtonElement>('btn-next');
  next.hidden = !win || !chapter;
  next.textContent = last ? 'Ver desglose del capítulo' : 'Siguiente piso';
  $('btn-result-back').textContent = chapter ? 'Capítulo' : 'Salir';
  if (!win) { sfx.lose(); buzz(200); }
  show('result');
}

$('btn-next').addEventListener('click', () => {
  sfx.click();
  if (!chapter) return;
  if (floorIndex === chapter.floors.length - 1) {
    toMenuScene();
    showBreakdown(chapter);
  } else startFloor(chapter, floorIndex + 1);
});
$('btn-retry').addEventListener('click', () => { sfx.click(); restart(); });
$('btn-result-back').addEventListener('click', () => { sfx.click(); leaveLevel(); });

// ------------------------------------------------------------------ desglose del capítulo

function showBreakdown(ch: ChapterDef) {
  chapter = ch;
  $('bd-title').textContent = chapterDone(ch) ? `${ch.name} completado` : `${ch.name} · progreso`;
  $('bd-sub').textContent = ch.subtitle;
  let stars = 0, coins = 0, coinsTotal = 0, pctSum = 0, time = 0;
  $('bd-rows').innerHTML = ch.floors.map((f, k) => {
    const s = floorSave(f.id);
    const st = floorStars(f.id);
    const total = coinsTotalOf(f);
    stars += st;
    coins += s?.bestCoins ?? 0;
    coinsTotal += total;
    pctSum += s?.bestPct ?? 0;
    time += s?.bestTime ?? 0;
    return `<tr style="animation-delay:${120 + k * 110}ms"><th>${k + 1}. ${f.name}</th><td>${starsHtml(st)}</td>
      <td>${s?.bestCoins ?? 0}/${total}</td><td>${s ? Math.round(s.bestPct * 100) + '%' : '—'}</td><td>${s ? fmtTime(s.bestTime) : '—'}</td></tr>`;
  }).join('');
  const maxStars = ch.floors.length * 3;
  countUp($('bd-stars'), stars, (v) => `${v}/${maxStars}`);
  countUp($('bd-coins'), coins, (v) => `${v}/${coinsTotal}`);
  countUp($('bd-pct'), Math.round((pctSum / ch.floors.length) * 100), (v) => `${v}%`);
  $('bd-time').textContent = fmtTime(time);
  const ratio = stars / maxStars;
  const [medal, label] = ratio >= 0.9 ? ['gold', 'Rango Oro'] : ratio >= 0.6 ? ['silver', 'Rango Plata'] : ['bronze', 'Rango Bronce'];
  $('bd-rank').innerHTML = `<span class="medal ${medal}" aria-hidden="true"></span>${label}`;
  show('breakdown');
  sfx.win();
}

function countUp(el: HTMLElement, target: number, fmt: (v: number) => string) {
  const start = performance.now();
  const dur = 900;
  let lastV = -1;
  const stepFn = (now: number) => {
    const k = Math.min(Math.max((now - start - 500) / dur, 0), 1);
    const v = Math.round(target * (1 - (1 - k) ** 3));
    if (v !== lastV) {
      el.textContent = fmt(v);
      if (lastV >= 0 && v > lastV) sfx.tick();
      lastV = v;
    }
    if (k < 1) requestAnimationFrame(stepFn);
  };
  el.textContent = fmt(0);
  requestAnimationFrame(stepFn);
}

$('btn-bd-chapter').addEventListener('click', () => { sfx.click(); if (chapter) openChapter(chapter); });
$('btn-bd-menu').addEventListener('click', () => { sfx.click(); show('main'); });

// ------------------------------------------------------------------ bucle

function tick(dt: number) {
  if (!world || !slime) return;
  input.update();
  slime.step(dt, input.tiltX, input.tiltZ);
  world.update(dt, slime.switchCounts);
  elapsed += dt;

  for (const e of slime.events) {
    switch (e.type) {
      case 'fall': sfx.fall(); break;
      case 'evaporate': sfx.sizzle(); fx.steam(e.x, e.y, e.z); break;
      case 'pad': sfx.pad(); fx.splat(e.x, e.y, e.z); break;
      case 'coin': sfx.coin(); fx.sparkle(e.x, e.y + 0.4, e.z); buzz(15); break;
      case 'cut': sfx.cut(); buzz(8); break;
    }
  }
  slime.events.length = 0;

  const alive = slime.aliveCount;
  if (alive < lastAlive) {
    buzz(30);
    gauge.splash(Math.min(2, (lastAlive - alive) * 0.5));
    bump(hudEls.life, 'hurt');
  }
  lastAlive = alive;

  const tips = world.def.tips ?? [];
  const lead = slime.groups[0];
  if (lead && tipIndex < tips.length && lead.cz < tips[tipIndex].z) {
    toast(tips[tipIndex].text);
    tipIndex++;
  }

  updateHud();
  if (slime.touchedTreasure) {
    // celebración: el cofre se abre, sale una lluvia de brillos y el limo sonríe
    mode = 'winning';
    winT = 0;
    slime.celebrate();
    sfx.win();
    const t = world.treasure;
    for (let k = 0; k < 3; k++) fx.sparkle(t.x, t.y + 0.6 + k * 0.2, t.z);
  } else if (world.def.minPct > 0 && alive / slime.n < world.def.minPct) finish(false);
}

function updateCamera(dt: number) {
  if (!slime || !world) return;
  if (slime.center(tmpCenter)) {
    const k = 1 - Math.exp(-dt * 4);
    camTarget.x += (tmpCenter.x - camTarget.x) * k;
    camTarget.y += (Math.max(tmpCenter.y, -2) - camTarget.y) * k;
    camTarget.z += (tmpCenter.z - camTarget.z) * k;
  }
  if (mode === 'menu') {
    // escaparate del menú: órbita lenta y cercana alrededor del limo
    menuAngle += dt * 0.12;
    camWant.set(camTarget.x + Math.sin(menuAngle) * 3.6, camTarget.y + 6.2, camTarget.z + Math.cos(menuAngle) * 3.6);
  } else {
    const dist = (camera.aspect < 1 ? 1.5 : 1) * camZoom;
    camWant.set(camTarget.x, camTarget.y + 8.6 * dist, camTarget.z + 4.6 * dist);
  }
  if (camPos.lengthSq() === 0) camPos.copy(camWant);
  else camPos.lerp(camWant, 1 - Math.exp(-dt * (mode === 'menu' ? 2 : 5)));
  camera.position.copy(camPos);
  camera.lookAt(camTarget.x, camTarget.y + (mode === 'menu' ? 0.3 : 0), camTarget.z - (mode === 'menu' ? 0 : 0.3));

  tiltRoot.position.copy(camTarget);
  content.position.copy(camTarget).negate();
  const rx = mode === 'play' ? input.tiltZ * 0.1 : 0;
  const rz = mode === 'play' ? -input.tiltX * 0.1 : 0;
  const tk = 1 - Math.exp(-dt * 12);
  tiltRoot.rotation.x += (rx - tiltRoot.rotation.x) * tk;
  tiltRoot.rotation.z += (rz - tiltRoot.rotation.z) * tk;

  sun.position.set(camTarget.x + 5, camTarget.y + 12, camTarget.z + 4);
  sun.target.position.copy(camTarget);
  rim.position.set(camTarget.x - 6, camTarget.y + 5, camTarget.z - 9);
  rim.target.position.copy(camTarget);
}

const clock = new THREE.Clock();
const FIXED = 1 / 60;

function frame(dt: number) {
  if (mode === 'play') {
    acc += dt;
    let steps = 0;
    while (acc >= FIXED && steps < 3) {
      tick(FIXED);
      acc -= FIXED;
      steps++;
      if (mode !== 'play') break;
    }
    if (steps === 3) acc = 0;
  } else if (mode === 'winning' && world && slime) {
    winT += dt;
    world.opening = Math.min(1, winT / 0.6);
    world.update(dt, slime.switchCounts);
    slime.step(FIXED, 0, 0);
    slime.events.length = 0;
    if (winT > 1.5) finish(true);
  } else if (mode === 'menu' && world && slime) {
    world.update(dt, slime.switchCounts);
    slime.step(FIXED, 0, 0);
    slime.events.length = 0;
  } else if (world) {
    world.update(dt * 0.3, slime?.switchCounts ?? { A: 0, B: 0 });
  }
  // fracción hacia el siguiente paso de física: dibujo suave a 90/120 Hz
  const alpha = mode === 'play' ? Math.min(acc / FIXED, 1) : 1;
  fx.update(dt);
  updateCamera(dt);
  slime?.render(dt, alpha, input.tiltX, input.tiltZ);
  if (!$('hud').hidden && slime && world) {
    const pct = slime.aliveCount / slime.n;
    gauge.update(dt, pct, input.tiltX, world.def.minPct > 0 && pct < world.def.minPct + 0.12);
  }
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  frame(dt);
  if (mode === 'play') watchQuality(dt);
});

if (import.meta.env.DEV) {
  // depuración: avanzar la simulación sin requestAnimationFrame
  Object.assign(window, {
    __blub: {
      advance(seconds: number) { for (let t = 0; t < seconds; t += FIXED) frame(FIXED); },
      start: (c: number, k: number) => startFloor(CHAPTERS[c], k),
      practice: () => startLevel(PRACTICE, null, 0),
      finish: (win: boolean) => finish(win),
      breakdown: () => showBreakdown(CHAPTERS[0]),
      zoom: (k: number) => { camZoom = k; camPos.set(0, 0, 0); },
      hurt: () => { const g = slime?.groups[0]; if (g) slime!.hurts.push({ x: g.cx, z: g.cz }); },
      quality: () => ({ quality, fps: Math.round(1 / frameAvg) }),
      slime: () => slime,
      state: () => ({ mode, alive: slime?.aliveCount, groups: slime?.groups.map((g) => g.ids.length), coins: world && `${world.coinsCollected}/${world.coinsTotal}`, lead: slime?.groups[0] && { x: slime.groups[0].cx.toFixed(2), y: slime.groups[0].cy.toFixed(2), z: slime.groups[0].cz.toFixed(2) } }),
    },
  });
}

// ------------------------------------------------------------------ arranque

show('main');
Assets.load(Math.min(4, renderer.capabilities.getMaxAnisotropy()), (p) => { $('load-hint').textContent = `Cargando… ${Math.round(p * 100)}%`; })
  .then((a) => {
    assets = a;
    toMenuScene();
    $('load-hint').textContent = 'Desliza, divide y reúne al limo';
    $<HTMLButtonElement>('btn-story').disabled = false;
  })
  .catch((err) => {
    console.error(err);
    $('load-hint').textContent = 'No se pudieron cargar los recursos. Reinicia el juego.';
  });
