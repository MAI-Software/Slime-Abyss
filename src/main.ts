import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './style.css';
import { Assets } from './assets';
import { CAMPAIGN as LEVELS } from './level/campaign';
import { World } from './world';
import { Slime } from './slime';
import { Input, type ControlMode } from './input';
import { Fx } from './fx';
import { sfx, unlockAudio } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ render base

const lowQuality = matchMedia('(pointer: coarse)').matches;
const canvas = $<HTMLCanvasElement>('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowQuality, powerPreference: 'high-performance' });

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d1640);
scene.fog = new THREE.Fog(0x1d1640, 16, 34);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);

scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x4a3b6b, 0.9));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.9);
sun.castShadow = true;

sun.shadow.camera.left = sun.shadow.camera.bottom = -9;
sun.shadow.camera.right = sun.shadow.camera.top = 9;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
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
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
applyQuality(quality);

// ------------------------------------------------------------------ estado

const input = new Input();

type Mode = 'menu' | 'play' | 'pause' | 'winning' | 'result';
let mode: Mode = 'menu';
let levelIndex = 0;
let world: World | null = null;
let slime: Slime | null = null;
let elapsed = 0;
let tipIndex = 0;
let lastAlive = 0;
let winT = 0;
let acc = 0;
let assets: Assets | null = null;
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const tmpCenter = new THREE.Vector3();
const camWant = new THREE.Vector3();
let camZoom = 1;

interface Save { unlocked: number; stars: number[]; best: number[]; control?: ControlMode }
function loadSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem('blub-save') ?? '');
    if (s && Array.isArray(s.stars)) return s;
  } catch { /* primera vez */ }
  return { unlocked: 2, stars: [], best: [] };
}
const save = loadSave();
function writeSave() {
  try { localStorage.setItem('blub-save', JSON.stringify(save)); } catch { /* modo privado */ }
}

// ------------------------------------------------------------------ pantallas

const screens = ['screen-title', 'screen-levels', 'screen-pause', 'screen-result'];
function show(id: string | null) {
  for (const s of screens) $(s).hidden = s !== id;
  $('hud').hidden = !(mode === 'play' || mode === 'pause' || mode === 'winning');
}

function renderLevelList() {
  const list = $('level-list');
  list.innerHTML = '';
  LEVELS.forEach((lv, k) => {
    const b = document.createElement('button');
    b.className = 'level-card';
    const locked = k >= save.unlocked && !lv.practice;
    if (lv.practice) b.classList.add('practice');
    b.disabled = locked;
    const stars = save.stars[k] ?? 0;
    b.innerHTML = `<span class="num">${lv.practice ? 'PRUEBA' : k}</span><span class="name">${locked ? 'Bloqueado' : lv.name}</span>` +
      `<span class="stars" aria-label="${stars} estrellas">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
    b.addEventListener('click', () => { sfx.click(); startLevel(k); });
    list.appendChild(b);
  });
}

function toast(text: string, ms = 3200) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout((toast as unknown as { h?: number }).h);
  (toast as unknown as { h?: number }).h = window.setTimeout(() => (t.hidden = true), ms);
}

$('btn-start').addEventListener('click', () => {
  unlockAudio();
  sfx.click();
  if (input.mode === 'gyro') input.requestPermission();
  input.requestFullscreen();
  renderLevelList();
  show('screen-levels');
});
function setControl(mode: ControlMode) {
  input.setMode(mode);
  if (mode === 'gyro') input.requestPermission();
  document.querySelectorAll<HTMLButtonElement>('.pick-btn').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  });
  save.control = mode;
  writeSave();
}
document.querySelectorAll<HTMLButtonElement>('.pick-btn').forEach((b) => {
  b.addEventListener('click', () => { sfx.click(); setControl(b.dataset.mode as ControlMode); });
});
setControl(save.control ?? 'joystick');

$('btn-calib-menu').addEventListener('click', () => { input.calibrate(); sfx.click(); toast('Posición actual = plano'); });
$('btn-pause').addEventListener('click', () => { if (mode === 'play') { mode = 'pause'; show('screen-pause'); } });
$('btn-resume').addEventListener('click', () => { mode = 'play'; input.clearQueued(); show(null); });
$('btn-calib').addEventListener('click', () => { input.calibrate(); sfx.click(); toast('Posición actual = plano'); });
$('btn-restart').addEventListener('click', () => startLevel(levelIndex));
$('btn-menu').addEventListener('click', () => toMenu());
$('btn-retry').addEventListener('click', () => startLevel(levelIndex));
$('btn-result-menu').addEventListener('click', () => toMenu());
$('btn-next').addEventListener('click', () => {
  if (levelIndex + 1 < LEVELS.length) startLevel(levelIndex + 1);
  else toMenu();
});
document.addEventListener('visibilitychange', () => {
  if (import.meta.env.DEV && (window as unknown as { __blubNoPause?: boolean }).__blubNoPause) return;
  if (document.hidden && mode === 'play') { mode = 'pause'; show('screen-pause'); }
});

function toMenu() {
  mode = 'menu';
  renderLevelList();
  show('screen-levels');
}

// ------------------------------------------------------------------ nivel

function clearLevel() {
  if (world) { content.remove(world.group); world.dispose(); world = null; }
  if (slime) { content.remove(slime.group); slime.dispose(); slime = null; }
  fx.reset();
}

function startLevel(k: number) {
  clearLevel();
  levelIndex = k;
  const def = LEVELS[k];
  world = new World(def, assets!);
  slime = new Slime(world, def.count, lowQuality, assets!);
  content.add(world.group, slime.group);
  elapsed = 0;
  tipIndex = 0;
  lastAlive = def.count;
  camTarget.copy(world.start);
  camPos.set(0, 0, 0);
  $('level-name').textContent = def.practice ? def.name : `${k}. ${def.name}`;
  $('life-min').hidden = def.minPct <= 0;
  winT = 0;
  $('life-min').style.left = `${def.minPct * 100}%`;
  input.clearQueued();
  if (input.mode === 'gyro') input.calibrate();
  hudCache.alive = hudCache.seconds = -1;
  acc = 0;
  mode = 'play';
  show(null);
  updateHud();
}

const hudCache = { alive: -1, seconds: -1 };
const hudEls = {
  fill: $('life-fill'),
  pct: $('life-pct'),
  timer: $('timer'),
};

/** Solo toca el DOM cuando cambia algo (evita recalcular estilos 60 veces por segundo). */
function updateHud() {
  if (!slime || !world) return;
  const alive = slime.aliveCount;
  if (alive !== hudCache.alive) {
    hudCache.alive = alive;
    const pct = alive / slime.n;
    hudEls.fill.style.transform = `scaleX(${pct})`;
    hudEls.fill.style.background = pct < world.def.minPct + 0.1 ? 'var(--danger)' : 'var(--slime)';
    hudEls.pct.textContent = `${Math.round(pct * 100)}%`;
  }
  const s = Math.floor(elapsed);
  if (s !== hudCache.seconds) {
    hudCache.seconds = s;
    hudEls.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}

function finish(win: boolean) {
  if (!slime) return;
  mode = 'result';
  const pct = slime.aliveCount / slime.n;
  const stars = win ? (pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1) : 0;
  $('result-title').textContent = win ? '¡Tesoro conseguido!' : 'El limo se ha deshecho';
  mode = 'result';
  $('result-stars').innerHTML = win
    ? `${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span>`
    : '';
  $('result-info').textContent = win
    ? `Limo restante: ${Math.round(pct * 100)}% · Tiempo ${$('timer').textContent}`
    : `Necesitas conservar al menos el ${Math.round((world?.def.minPct ?? 0) * 100)}%`;
  const next = $('btn-next');
  next.hidden = !win;
  next.textContent = levelIndex + 1 < LEVELS.length ? 'Siguiente' : 'Menú';
  if (win) {
    save.stars[levelIndex] = Math.max(save.stars[levelIndex] ?? 0, stars);
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, levelIndex + 2));
    writeSave();
    navigator.vibrate?.([30, 60, 30]);
  } else {
    sfx.lose();
    navigator.vibrate?.(200);
  }
  show('screen-result');
}

// ------------------------------------------------------------------ bucle

function tick(dt: number) {
  if (!world || !slime) return;
  input.update();
  if (input.consumeJump()) { if (slime.jump()) navigator.vibrate?.(10); }
  if (input.consumeSplit()) slime.split();

  slime.step(dt, input.tiltX, input.tiltZ, input.mergeHeld);
  world.update(dt, slime.switchCounts);
  elapsed += dt;

  for (const e of slime.events) {
    switch (e.type) {
      case 'fall': sfx.fall(); break;
      case 'evaporate': sfx.sizzle(); fx.steam(e.x, e.y, e.z); break;
      case 'pad': sfx.pad(); fx.splat(e.x, e.y, e.z); break;
      case 'jump': sfx.jump(); break;
      case 'split': sfx.split(); navigator.vibrate?.(25); break;
    }
  }
  slime.events.length = 0;

  const alive = slime.aliveCount;
  if (alive < lastAlive) navigator.vibrate?.(30);
  lastAlive = alive;

  // pistas por avance
  const tips = world.def.tips ?? [];
  const lead = slime.groups[0];
  if (lead && tipIndex < tips.length && lead.cz < tips[tipIndex].z) {
    toast(tips[tipIndex].text);
    tipIndex++;
  }

  updateHud();
  if (slime.touchedTreasure) {
    // pequeña celebración: el cofre se abre y el limo sonríe antes del resultado
    mode = 'winning';
    winT = 0;
    slime.celebrate();
    sfx.win();
  } else if (alive / slime.n < world.def.minPct) finish(false);
}

function updateCamera(dt: number) {
  if (!slime || !world) return;
  if (slime.center(tmpCenter)) {
    const k = 1 - Math.exp(-dt * 4);
    camTarget.x += (tmpCenter.x - camTarget.x) * k;
    camTarget.y += (Math.max(tmpCenter.y, -2) - camTarget.y) * k;
    camTarget.z += (tmpCenter.z - camTarget.z) * k;
  }
  const portrait = camera.aspect < 1;
  const dist = (portrait ? 1.5 : 1) * camZoom;
  camWant.set(camTarget.x, camTarget.y + 8.6 * dist, camTarget.z + 4.6 * dist);
  if (camPos.lengthSq() === 0) camPos.copy(camWant);
  else camPos.lerp(camWant, 1 - Math.exp(-dt * 5));
  camera.position.copy(camPos);
  camera.lookAt(camTarget.x, camTarget.y, camTarget.z - 0.3);

  // inclinación visual del escenario alrededor del limo
  tiltRoot.position.copy(camTarget);
  content.position.copy(camTarget).negate();
  const rx = input.tiltZ * 0.1, rz = -input.tiltX * 0.1;
  const tk = 1 - Math.exp(-dt * 12);
  tiltRoot.rotation.x += (rx - tiltRoot.rotation.x) * tk;
  tiltRoot.rotation.z += (rz - tiltRoot.rotation.z) * tk;

  sun.position.set(camTarget.x + 5, camTarget.y + 12, camTarget.z + 4);
  sun.target.position.copy(camTarget);
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
  }
  // fracción hacia el siguiente paso de física: dibujo suave a 90/120 Hz y con frames irregulares
  const alpha = mode === 'play' ? Math.min(acc / FIXED, 1) : 1;
  if (mode === 'winning' && world && slime) {
    winT += dt;
    world.opening = Math.min(1, winT / 0.6);
    world.update(dt, slime.switchCounts);
    slime.step(dt, 0, 0, false);
    slime.events.length = 0;
    if (winT > 1.4) finish(true);
  } else if (world && mode !== 'play') world.update(dt * 0.3, slime?.switchCounts ?? { A: 0, B: 0 });
  fx.update(dt);
  updateCamera(dt);
  slime?.render(dt, alpha, input.tiltX, input.tiltZ);
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
      start: (k: number) => startLevel(k),
      hurt: () => { const g = slime?.groups[0]; if (g) slime!.hurts.push({ x: g.cx, z: g.cz }); },
      zoom: (k: number) => { camZoom = k; camPos.set(0, 0, 0); },
      quality: () => ({ quality, fps: Math.round(1 / frameAvg) }),
      state: () => ({ mode, alive: slime?.aliveCount, groups: slime?.groups.map((g) => g.ids.length), lead: slime?.groups[0] && { x: slime.groups[0].cx.toFixed(2), y: slime.groups[0].cy.toFixed(2), z: slime.groups[0].cz.toFixed(2) } }),
    },
  });
}

// arranque: cargar modelos de Blender y dejar un nivel de fondo en el menú
show('screen-title');
Assets.load((p) => { $('load-hint').textContent = `Cargando modelos… ${Math.round(p * 100)}%`; })
  .then((a) => {
    assets = a;
    startLevel(1);
    mode = 'menu';
    show('screen-title');
    $('load-hint').textContent = 'Desliza, divide y reúne al limo hasta el tesoro';
    $<HTMLButtonElement>('btn-start').disabled = false;
  })
  .catch((err) => {
    console.error(err);
    $('load-hint').textContent = 'No se pudieron cargar los modelos. Reinicia el juego.';
  });
