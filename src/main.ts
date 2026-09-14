import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './style.css';
import { Assets } from './assets';
import { CHAPTERS, MENU_STAGE, PRACTICE, UPCOMING } from './level/campaign';
import { DEFAULT_KEEP_PCT, starsOf, type ChapterDef, type FloorResult, type LevelData } from './level/format';
import { World } from './world';
import { Slime, type SlimeState } from './slime';
import { Input, type ControlMode } from './input';
import { Fx } from './fx';
import { LiquidGauge } from './hud-liquid';
import { setMuted, sfx, unlockAudio } from './audio';
import { LANGS, applyDom, detectLang, getLang, levelName, levelTip, setLang, t, type Lang } from './i18n';
import { loadSave, writeSave } from './save';
import { ACCESSORIES } from './cosmetics';
import { firebaseConfigured, signInWithGoogle, signOutPlayer, watchPlayer, type Player } from './firebase';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const save = loadSave();
const store = () => writeSave(save);

/** Vibración corta; el navegador solo la permite tras un toque del usuario. */
function buzz(pattern: number | number[]) {
  if (!save.vibration) return;
  if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === false) return;
  navigator.vibrate?.(pattern);
}

setLang(save.lang ?? detectLang());

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
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

// ------------------------------------------------------------------ progreso

const floorSave = (id: string) => save.floors[id];
const floorStars = (id: string) => (save.floors[id] ? starsOf(save.floors[id]) : 0);
const floorUnlocked = (ch: ChapterDef, k: number) => k === 0 || !!floorSave(ch.floors[k - 1].id)?.done;
const chapterDone = (ch: ChapterDef) => ch.floors.every((f) => floorSave(f.id)?.done);
const coinsTotalOf = (lv: LevelData) => lv.tiles.join('').split('C').length - 1;
const gemsTotalOf = (lv: LevelData) => lv.tiles.join('').split('G').length - 1;
/** 100 %: todas las estrellas y todos los secretos del capítulo. */
const chapterPerfect = (ch: ChapterDef) => ch.floors.every((f) => floorStars(f.id) === 3 && (gemsTotalOf(f) === 0 || !!floorSave(f.id)?.secret));
const coinsEarned = () => Object.values(save.floors).reduce((a, f) => a + f.bestCoins, 0);
const wallet = () => Math.max(0, coinsEarned() - save.spent);
const chapterTitle = (ch: ChapterDef) => t('story.chapter', { n: CHAPTERS.indexOf(ch) + 1 });
const chapterSubtitle = (ch: ChapterDef) => t(`chapters.${ch.id}`);

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
let menuZoom = 1;
let menuShift = 0;
let player: Player | null = null;
/** recompensa ganada en el último piso, pendiente de mostrar */
let pendingReward: { item: string; then: () => void } | null = null;
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const tmpCenter = new THREE.Vector3();
const tmpFx = new THREE.Vector3();
const camWant = new THREE.Vector3();
const lookAhead = new THREE.Vector2();
let camZoom = 1;

// ------------------------------------------------------------------ iconos

const STAR_PATH = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';
const starSvg = (on: boolean) => `<svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
const starsHtml = (n: number) => `<span class="star-row" role="img" aria-label="${t('common.stars', { n })}">${[0, 1, 2].map((k) => starSvg(k < n)).join('')}</span>`;
const coinSvg = '<svg class="ico coin-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>';
const gemSvg = '<svg class="gem-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/></svg>';
const lockSvg = '<svg class="ico lock-ico" viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const checkSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const crossSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
const STATE_ICONS: Record<Exclude<SlimeState, 'normal'>, string> = {
  oiled: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  burning: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  frozen: '<line x1="2" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/>',
};
const fmtTime = (sec: number) => { const s = Math.floor(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// ------------------------------------------------------------------ pantallas

const SCREENS = ['main', 'story', 'chapter', 'myslime', 'shop', 'profile', 'options', 'pause', 'result', 'breakdown', 'reward'] as const;
type ScreenId = (typeof SCREENS)[number];
let currentScreen: ScreenId | null = 'main';

function show(id: ScreenId | null) {
  currentScreen = id;
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
  // en Mi limo y Tienda la cámara del menú se acerca al limo
  menuZoom = id === 'myslime' || id === 'shop' ? 0.62 : 1;
}

function openScreen(id: ScreenId) {
  if (id === 'story') renderStory();
  if (id === 'shop') renderShop();
  if (id === 'myslime') renderMySlime();
  if (id === 'profile') renderProfile();
  if (id === 'options') renderOptions();
  show(id);
}

document.querySelectorAll<HTMLButtonElement>('[data-back]').forEach((b) => {
  b.addEventListener('click', () => { sfx.click(); openScreen(b.dataset.back as ScreenId); });
});
document.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => {
  b.addEventListener('click', () => { unlockAudio(); sfx.click(); openScreen(b.dataset.go as ScreenId); });
});

function toast(text: string, ms = 3200) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout((toast as unknown as { h?: number }).h);
  (toast as unknown as { h?: number }).h = window.setTimeout(() => (el.hidden = true), ms);
}

/** Vuelve a pintar la pantalla abierta (p. ej. al cambiar de idioma). */
function refreshScreen() {
  applyDom();
  if (currentScreen && !['pause', 'result', 'breakdown', 'reward'].includes(currentScreen)) openScreen(currentScreen);
  if (mode === 'menu') $('load-hint').textContent = assets ? t('menu.hint') : '';
}

// ------------------------------------------------------------------ historia

function renderStory() {
  const list = $('chapter-list');
  list.innerHTML = '';
  CHAPTERS.forEach((ch) => {
    const stars = ch.floors.reduce((a, f) => a + floorStars(f.id), 0);
    const coins = ch.floors.reduce((a, f) => a + (floorSave(f.id)?.bestCoins ?? 0), 0);
    const coinsTotal = ch.floors.reduce((a, f) => a + coinsTotalOf(f), 0);
    const b = document.createElement('button');
    b.className = 'card chapter-card';
    b.innerHTML = `<span class="eyebrow">${chapterTitle(ch)}</span><span class="title">${chapterSubtitle(ch)}</span>
      <span class="meta"><span class="m">${starSvg(true)} ${stars}/${ch.floors.length * 3}</span><span class="m">${coinSvg} ${coins}/${coinsTotal}</span></span>
      <span class="progress"><i style="width:${(stars / (ch.floors.length * 3)) * 100}%"></i></span>`;
    b.addEventListener('click', () => { sfx.click(); openChapter(ch); });
    list.appendChild(b);
  });
  UPCOMING.forEach((_, k) => {
    const b = document.createElement('button');
    b.className = 'card chapter-card locked';
    b.disabled = true;
    b.innerHTML = `${lockSvg}<span class="eyebrow">${t('story.chapter', { n: CHAPTERS.length + k + 1 })}</span><span class="title">${t('common.comingSoon')}</span>`;
    list.appendChild(b);
  });
}

function openChapter(ch: ChapterDef) {
  chapter = ch;
  $('chapter-title').textContent = chapterTitle(ch);
  $('chapter-sub').textContent = chapterSubtitle(ch);
  const rewardEl = $('chapter-reward');
  rewardEl.textContent = ch.reward
    ? save.rewards.includes(ch.id) ? t('story.rewardOwned') : t('story.reward', { item: t(`items.${ch.reward}`) })
    : '';
  const list = $('floor-list');
  list.innerHTML = '';
  ch.floors.forEach((f, k) => {
    const unlocked = floorUnlocked(ch, k);
    const s = floorSave(f.id);
    const b = document.createElement('button');
    b.className = `card floor-card${unlocked ? '' : ' locked'}`;
    b.disabled = !unlocked;
    const gem = gemsTotalOf(f) > 0 && s?.secret ? ` ${gemSvg}` : '';
    b.innerHTML = `${unlocked ? '' : lockSvg}<span class="num">${t('story.floor', { n: k + 1 })}</span><span class="name">${unlocked ? levelName(f) : t('common.locked')}</span>
      ${unlocked ? `<span class="meta">${starsHtml(floorStars(f.id))}<span class="m">${coinSvg} ${s?.bestCoins ?? 0}/${coinsTotalOf(f)}${gem}</span></span>` : ''}`;
    b.addEventListener('click', () => { sfx.click(); startFloor(ch, k); });
    list.appendChild(b);
  });
  $('btn-chapter-breakdown').hidden = !chapterDone(ch);
  show('chapter');
}

$('btn-chapter-breakdown').addEventListener('click', () => { sfx.click(); if (chapter) showBreakdown(chapter); });
$('btn-story').addEventListener('click', () => {
  unlockAudio();
  sfx.click();
  if (input.mode === 'gyro') input.requestPermission();
  input.requestFullscreen();
  openScreen('story');
});

// ------------------------------------------------------------------ tienda y Mi limo

function equip(id: string | null) {
  save.equipped = id;
  store();
  slime?.setHat(id);
}

function renderShop() {
  $('shop-wallet').textContent = t('shop.wallet', { n: wallet() });
  const list = $('shop-list');
  list.innerHTML = '';
  for (const item of ACCESSORIES) {
    const owned = save.owned.includes(item.id);
    const equipped = save.equipped === item.id;
    const b = document.createElement('button');
    b.className = `item-card${equipped ? ' equipped' : ''}`;
    let state: string;
    if (equipped) state = t('shop.equipped');
    else if (owned) state = t('shop.equip');
    else if (item.price === null) {
      const ch = CHAPTERS.find((c) => c.id === item.reward);
      state = t('shop.rewardOnly', { chapter: ch ? chapterTitle(ch) : '' });
      b.disabled = true;
    } else {
      state = t('shop.buy', { n: item.price });
      b.disabled = wallet() < item.price;
      if (b.disabled) state = `${state} · ${t('shop.notEnough')}`;
    }
    b.innerHTML = `<span class="item-name">${t(`items.${item.id}`)}</span><span class="item-state">${state}</span>`;
    b.addEventListener('click', () => {
      if (owned) { equip(equipped ? null : item.id); sfx.click(); }
      else if (item.price !== null && wallet() >= item.price) {
        save.spent += item.price;
        save.owned.push(item.id);
        equip(item.id);
        sfx.coin();
        buzz(20);
      }
      renderShop();
    });
    list.appendChild(b);
  }
}

function renderMySlime() {
  const list = $('myslime-list');
  list.innerHTML = '';
  const owned = ACCESSORIES.filter((a) => save.owned.includes(a.id));
  $('myslime-empty').hidden = owned.length > 0;
  const options: (string | null)[] = [null, ...owned.map((a) => a.id)];
  for (const id of options) {
    const equipped = save.equipped === id;
    const b = document.createElement('button');
    b.className = `item-card${equipped ? ' equipped' : ''}`;
    b.innerHTML = `<span class="item-name">${id ? t(`items.${id}`) : t('myslime.none')}</span><span class="item-state">${equipped ? t('shop.equipped') : t('shop.equip')}</span>`;
    b.addEventListener('click', () => { sfx.click(); equip(id); renderMySlime(); });
    list.appendChild(b);
  }
}

// ------------------------------------------------------------------ perfil

function renderProfile() {
  const status = $('profile-status');
  $('profile-name').textContent = player?.name ?? t('profile.guest');
  $('profile-email').textContent = player?.email ?? t('profile.cloudSoon');
  const avatar = $('profile-avatar');
  avatar.style.backgroundImage = player?.photo ? `url("${encodeURI(player.photo)}")` : '';
  const google = $<HTMLButtonElement>('btn-google');
  google.hidden = !!player;
  google.disabled = !firebaseConfigured;
  $('btn-signout').hidden = !player;
  if (!firebaseConfigured) status.textContent = t('profile.notConfigured');
  else if (!player) status.textContent = '';
  const allFloors = CHAPTERS.flatMap((c) => c.floors);
  const stats = [
    [t('profile.starsTotal'), `${allFloors.reduce((a, f) => a + floorStars(f.id), 0)}/${allFloors.length * 3}`],
    [t('profile.coinsTotal'), String(coinsEarned())],
    [t('profile.secretsTotal'), `${allFloors.filter((f) => floorSave(f.id)?.secret).length}/${allFloors.filter((f) => gemsTotalOf(f) > 0).length}`],
    [t('profile.chaptersDone'), `${CHAPTERS.filter(chapterPerfect).length}/${CHAPTERS.length}`],
    [t('profile.items'), `${save.owned.length}/${ACCESSORIES.length}`],
  ];
  $('profile-stats').innerHTML = stats.map(([label, value]) => `<div class="stat"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`).join('');
}

$('btn-google').addEventListener('click', async () => {
  unlockAudio();
  sfx.click();
  const status = $('profile-status');
  const btn = $<HTMLButtonElement>('btn-google');
  btn.disabled = true;
  status.textContent = t('profile.connecting');
  try {
    player = await signInWithGoogle();
    status.textContent = '';
  } catch (err) {
    console.warn(err);
    status.textContent = t('profile.error');
  }
  btn.disabled = !firebaseConfigured;
  renderProfile();
});
$('btn-signout').addEventListener('click', async () => {
  sfx.click();
  await signOutPlayer();
  player = null;
  renderProfile();
});
watchPlayer((p) => { player = p; if (currentScreen === 'profile') renderProfile(); }).catch(() => { /* sin Firebase */ });

// ------------------------------------------------------------------ opciones

function renderOptions() {
  const select = $<HTMLSelectElement>('lang-select');
  select.innerHTML = LANGS.map((l) => `<option value="${l}"${l === getLang() ? ' selected' : ''}>${t(`lang.${l}`)}</option>`).join('');
  const toggle = (id: string, on: boolean) => {
    const b = $(id);
    b.textContent = on ? t('options.on') : t('options.off');
    b.setAttribute('aria-pressed', String(on));
  };
  toggle('btn-sound', save.sound);
  toggle('btn-vibration', save.vibration);
}

$<HTMLSelectElement>('lang-select').addEventListener('change', (e) => {
  const lang = (e.target as HTMLSelectElement).value as Lang;
  save.lang = lang;
  store();
  setLang(lang);
  refreshScreen();
});

function setControl(m: ControlMode) {
  input.setMode(m);
  if (m === 'gyro') input.requestPermission();
  document.querySelectorAll<HTMLButtonElement>('.pick-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  save.control = m;
  store();
}
document.querySelectorAll<HTMLButtonElement>('.pick-btn').forEach((b) => {
  b.addEventListener('click', () => { sfx.click(); setControl(b.dataset.mode as ControlMode); });
});
setControl(save.control);
setMuted(!save.sound);

$('btn-sound').addEventListener('click', () => { save.sound = !save.sound; setMuted(!save.sound); store(); renderOptions(); sfx.click(); });
$('btn-vibration').addEventListener('click', () => { save.vibration = !save.vibration; store(); renderOptions(); sfx.click(); buzz(30); });
$('btn-calib').addEventListener('click', () => { input.calibrate(); sfx.click(); });
$('btn-pause-calib').addEventListener('click', () => { input.calibrate(); sfx.click(); });
$('btn-practice').addEventListener('click', () => { sfx.click(); startLevel(PRACTICE, null, 0); });

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
  if (import.meta.env.DEV && (window as unknown as { __slimeNoPause?: boolean }).__slimeNoPause) return;
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
  slime.setHat(save.equipped);
  content.add(world.group, slime.group);
  camTarget.copy(world.start);
  camPos.set(0, 0, 0);
  lookAhead.set(0, 0);
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
  hudCache.alive = hudCache.seconds = hudCache.coins = hudCache.stateSec = -1;
  hudCache.state = '';
  $('toast').hidden = true;
  gauge.reset();
  $('level-name').textContent = ch ? `${t('story.floor', { n: k + 1 })} · ${levelName(def)}` : levelName(def);
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
  else openScreen('options');
}

/** Fondo del menú: plataforma abierta con el limo en reposo. */
function toMenuScene() {
  mode = 'menu';
  if (assets) loadLevel(MENU_STAGE);
}

// ------------------------------------------------------------------ HUD

const hudCache = { alive: -1, seconds: -1, coins: -1, state: '', stateSec: -1 };
const hudEls = {
  pct: $('life-pct'), timer: $('timer'), coins: $('coins-count'), coinChip: $('hud-coins'),
  life: document.querySelector('.hud-chip.life') as HTMLElement,
  stateChip: $('hud-state'), stateIco: $('state-ico'), stateText: $('state-text'),
};

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
  const st = slime.state;
  const sec = Math.ceil(slime.stateT);
  if (st !== hudCache.state || sec !== hudCache.stateSec) {
    hudCache.state = st;
    hudCache.stateSec = sec;
    hudEls.stateChip.hidden = st === 'normal';
    if (st !== 'normal') {
      hudEls.stateChip.className = `hud-chip state ${st}`;
      hudEls.stateIco.innerHTML = STATE_ICONS[st];
      hudEls.stateText.textContent = st === 'oiled' ? t('hud.oiled') : t(`hud.${st}`, { s: `${sec}s` });
    }
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
  const gemsTotal = world.gemsTotal;
  const gotGem = win && world.gemsCollected > 0;

  if (win && chapter) {
    const prev = save.floors[def.id];
    save.floors[def.id] = {
      done: true,
      allCoins: r.allCoins || !!prev?.allCoins,
      kept: r.kept || !!prev?.kept,
      bestCoins: Math.max(prev?.bestCoins ?? 0, r.coins),
      bestPct: Math.max(prev?.bestPct ?? 0, pct),
      bestTime: prev?.done ? Math.min(prev.bestTime, elapsed) : elapsed,
      secret: gotGem || !!prev?.secret,
    };
    // capítulo al 100 % por primera vez: su accesorio
    if (chapter.reward && !save.rewards.includes(chapter.id) && chapterPerfect(chapter)) {
      save.rewards.push(chapter.id);
      if (!save.owned.includes(chapter.reward)) save.owned.push(chapter.reward);
      pendingReward = { item: chapter.reward, then: () => {} };
    }
    store();
  }

  $('result-title').textContent = win ? t('result.done') : t('result.failed');
  const starsEl = $('result-stars');
  starsEl.innerHTML = win ? [0, 1, 2].map(() => starSvg(false)).join('') : '';
  const goals: { ok: boolean; label: string; val: string; secret?: boolean }[] = win
    ? [
      { ok: r.done, label: t('result.goalTreasure'), val: '' },
      { ok: r.allCoins, label: t('result.goalCoins'), val: `${r.coins}/${r.coinsTotal}` },
      { ok: r.kept, label: t('result.goalKeep', { pct: Math.round(keepPct * 100) }), val: `${Math.round(pct * 100)}%` },
    ]
    : [{ ok: false, label: t('result.failInfo'), val: '0%' }];
  // el tesoro secreto no da estrella: solo se muestra si el piso tiene uno
  if (win && gemsTotal > 0) goals.push({ ok: gotGem, label: t('result.goalSecret'), val: gotGem ? t('result.found') : '', secret: true });
  $('result-goals').innerHTML = goals.map((g, k) =>
    `<li class="${g.ok ? 'ok' : ''}${g.secret ? ' secret' : ''}" style="animation-delay:${150 + k * 120}ms"><span class="goal-mark">${g.ok ? checkSvg : crossSvg}</span>${g.label}<span class="val">${g.val}</span></li>`).join('');

  if (win) {
    [...starsEl.children].forEach((star, k) => {
      if (k >= earned) return;
      setTimeout(() => { star.classList.add('on'); sfx.star(k); buzz(20); }, 450 + k * 380);
    });
  }

  const last = !!chapter && floorIndex === chapter.floors.length - 1;
  const next = $<HTMLButtonElement>('btn-next');
  next.hidden = !win || !chapter;
  next.textContent = last ? t('result.toBreakdown') : t('result.next');
  $('btn-result-back').textContent = chapter ? t('result.chapter') : t('result.exit');
  if (!win) { sfx.lose(); buzz(200); }
  show('result');
}

/** Si hay un accesorio recién ganado, lo enseña antes de seguir. */
function afterReward(then: () => void) {
  if (!pendingReward) { then(); return; }
  const item = pendingReward.item;
  pendingReward = { item, then };
  $('reward-title').textContent = t('toast.reward', { item: t(`items.${item}`) });
  sfx.win();
  buzz([30, 60, 30]);
  show('reward');
}
$('btn-reward-ok').addEventListener('click', () => {
  sfx.click();
  if (!pendingReward) return;
  const { item, then } = pendingReward;
  pendingReward = null;
  equip(item);
  then();
});

$('btn-next').addEventListener('click', () => {
  sfx.click();
  if (!chapter) return;
  const ch = chapter;
  afterReward(() => {
    if (floorIndex === ch.floors.length - 1) {
      toMenuScene();
      showBreakdown(ch);
    } else startFloor(ch, floorIndex + 1);
  });
});
$('btn-retry').addEventListener('click', () => { sfx.click(); afterReward(restart); });
$('btn-result-back').addEventListener('click', () => { sfx.click(); afterReward(leaveLevel); });

// ------------------------------------------------------------------ desglose del capítulo

function showBreakdown(ch: ChapterDef) {
  chapter = ch;
  $('bd-title').textContent = chapterDone(ch) ? t('breakdown.done', { chapter: chapterTitle(ch) }) : t('breakdown.progress', { chapter: chapterTitle(ch) });
  $('bd-sub').textContent = chapterSubtitle(ch);
  let stars = 0, coins = 0, coinsTotal = 0, pctSum = 0, time = 0, secrets = 0, secretsTotal = 0;
  $('bd-rows').innerHTML = ch.floors.map((f, k) => {
    const s = floorSave(f.id);
    const st = floorStars(f.id);
    const total = coinsTotalOf(f);
    stars += st;
    coins += s?.bestCoins ?? 0;
    coinsTotal += total;
    pctSum += s?.bestPct ?? 0;
    time += s?.bestTime ?? 0;
    const hasGem = gemsTotalOf(f) > 0;
    if (hasGem) { secretsTotal++; if (s?.secret) secrets++; }
    const secretCell = hasGem ? (s?.secret ? gemSvg : '—') : '';
    return `<tr style="animation-delay:${120 + k * 70}ms"><th>${k + 1}. ${levelName(f)}</th><td>${starsHtml(st)}</td>
      <td>${s?.bestCoins ?? 0}/${total}</td><td>${secretCell}</td><td>${s ? Math.round(s.bestPct * 100) + '%' : '—'}</td><td>${s ? fmtTime(s.bestTime) : '—'}</td></tr>`;
  }).join('');
  const maxStars = ch.floors.length * 3;
  countUp($('bd-stars'), stars, (v) => `${v}/${maxStars}`);
  countUp($('bd-coins'), coins, (v) => `${v}/${coinsTotal}`);
  countUp($('bd-pct'), Math.round((pctSum / ch.floors.length) * 100), (v) => `${v}%`);
  $('bd-time').textContent = fmtTime(time);
  $('bd-secrets').textContent = secretsTotal ? `${secrets}/${secretsTotal}` : '—';
  const ratio = stars / maxStars;
  const [medal, label] = ratio >= 0.9 ? ['gold', t('breakdown.gold')] : ratio >= 0.6 ? ['silver', t('breakdown.silver')] : ['bronze', t('breakdown.bronze')];
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

const STATE_TOASTS: Partial<Record<SlimeState, string>> = { oiled: 'toast.oil', burning: 'toast.ignite', frozen: 'toast.freeze' };

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
      case 'oil': sfx.pad(); fx.sparkle(e.x, e.y + 0.3, e.z, 0xf5a524); break;
      case 'gem':
        sfx.gem();
        for (let k = 0; k < 3; k++) fx.sparkle(e.x, e.y + 0.3 + k * 0.25, e.z, 0xc4b5fd);
        toast(t('toast.secret'));
        buzz([20, 40, 20]);
        break;
      case 'burn':
        sfx.sizzle();
        for (let k = 0; k < 3; k++) fx.steam(e.x, world.cell(Math.floor(e.x), Math.floor(e.z))!.base + 0.4 + k * 0.3, e.z);
        buzz(25);
        break;
      case 'state': {
        const key = STATE_TOASTS[e.to] ?? (e.from === 'frozen' ? 'toast.thaw' : e.from === 'burning' ? 'toast.extinguish' : null);
        if (key) toast(t(key), 2600);
        if (e.to === 'burning') { sfx.sizzle(); buzz([15, 30, 15]); }
        if (e.to === 'frozen') { sfx.gem(); buzz(40); }
        break;
      }
    }
  }
  slime.events.length = 0;

  // efectos continuos del estado
  if (slime.state === 'burning' && Math.random() < 0.7 && slime.randomParticle(tmpFx)) fx.flame(tmpFx.x, tmpFx.y, tmpFx.z);
  if (slime.state === 'frozen' && Math.random() < 0.15 && slime.randomParticle(tmpFx)) fx.frost(tmpFx.x, tmpFx.y + 0.1, tmpFx.z);

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
    toast(levelTip(world.def, tipIndex));
    tipIndex++;
  }

  updateHud();
  if (slime.touchedTreasure) {
    mode = 'winning';
    winT = 0;
    slime.celebrate();
    sfx.win();
    const tr = world.treasure;
    for (let k = 0; k < 3; k++) fx.sparkle(tr.x, tr.y + 0.6 + k * 0.2, tr.z);
  } else if (alive === 0) {
    // ya no hay mínimo para completar: solo se pierde si no queda nada de limo
    finish(false);
  }
}

function updateCamera(dt: number) {
  if (!slime || !world) return;
  if (slime.center(tmpCenter)) {
    const lead = slime.groups[0];
    const la = 1 - Math.exp(-dt * 2.5);
    lookAhead.x += ((mode === 'play' && lead ? lead.vx * 0.3 : 0) - lookAhead.x) * la;
    lookAhead.y += ((mode === 'play' && lead ? lead.vz * 0.38 : 0) - lookAhead.y) * la;
    lookAhead.clampLength(0, 2.2);
    tmpCenter.x += lookAhead.x;
    tmpCenter.z += lookAhead.y;
    const k = 1 - Math.exp(-dt * 4);
    camTarget.x += (tmpCenter.x - camTarget.x) * k;
    camTarget.y += (Math.max(tmpCenter.y, -2) - camTarget.y) * k;
    camTarget.z += (tmpCenter.z - camTarget.z) * k;
  }
  if (mode === 'menu') {
    // escaparate del menú: órbita lenta; en Mi limo y Tienda se para de frente, se acerca
    // y deja al limo a la izquierda para que el panel no lo tape
    const closeUp = menuZoom < 1;
    if (closeUp) menuAngle += (Math.round(menuAngle / (Math.PI * 2)) * Math.PI * 2 - menuAngle) * (1 - Math.exp(-dt * 3));
    else menuAngle += dt * 0.12;
    const r = 3.6 * menuZoom, hgt = 6.2 * menuZoom;
    menuShift += ((closeUp ? 1.15 : 0) - menuShift) * (1 - Math.exp(-dt * 4));
    camWant.set(camTarget.x + Math.sin(menuAngle) * r + menuShift, camTarget.y + hgt, camTarget.z + Math.cos(menuAngle) * r);
  } else {
    const dist = (camera.aspect < 1 ? 1.5 : 1) * camZoom;
    camWant.set(camTarget.x, camTarget.y + 8.6 * dist, camTarget.z + 4.6 * dist);
  }
  if (camPos.lengthSq() === 0) camPos.copy(camWant);
  else camPos.lerp(camWant, 1 - Math.exp(-dt * (mode === 'menu' ? 2 : 5)));
  camera.position.copy(camPos);
  camera.lookAt(camTarget.x + (mode === 'menu' ? menuShift : 0), camTarget.y + (mode === 'menu' ? 0.3 : 0), camTarget.z - (mode === 'menu' ? 0 : 0.3));

  // inclinación del escenario: suave con el mando a medias y muy marcada a fondo
  const mag2 = input.tiltX * input.tiltX + input.tiltZ * input.tiltZ;
  const sway = mode !== 'play' ? 0 : 0.04 + 0.3 * mag2;
  tiltRoot.position.copy(camTarget);
  content.position.copy(camTarget).negate();
  const tk = 1 - Math.exp(-dt * 7);
  tiltRoot.rotation.x += (input.tiltZ * sway - tiltRoot.rotation.x) * tk;
  tiltRoot.rotation.z += (-input.tiltX * sway - tiltRoot.rotation.z) * tk;

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
  const alpha = mode === 'play' ? Math.min(acc / FIXED, 1) : 1;
  fx.update(dt);
  updateCamera(dt);
  slime?.render(dt, alpha, input.tiltX, input.tiltZ);
  if (!$('hud').hidden && slime && world) {
    const pct = slime.aliveCount / slime.n;
    gauge.update(dt, pct, input.tiltX, pct < 0.25);
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
    __slime: {
      advance(seconds: number) { for (let s = 0; s < seconds; s += FIXED) frame(FIXED); },
      start: (c: number, k: number) => startFloor(CHAPTERS[c], k),
      practice: () => startLevel(PRACTICE, null, 0),
      finish: (win: boolean) => finish(win),
      breakdown: () => showBreakdown(CHAPTERS[0]),
      zoom: (k: number) => { camZoom = k; camPos.set(0, 0, 0); },
      hurt: () => { const g = slime?.groups[0]; if (g) slime!.hurts.push({ x: g.cx, z: g.cz }); },
      quality: () => ({ quality, fps: Math.round(1 / frameAvg) }),
      slime: () => slime,
      world: () => world,
      save: () => save,
      open: (id: ScreenId) => openScreen(id),
      state: () => ({ mode, alive: slime?.aliveCount, slimeState: slime?.state, groups: slime?.groups.map((g) => g.ids.length), coins: world && `${world.coinsCollected}/${world.coinsTotal}`, lead: slime?.groups[0] && { x: slime.groups[0].cx.toFixed(2), y: slime.groups[0].cy.toFixed(2), z: slime.groups[0].cz.toFixed(2) } }),
    },
  });
}

// ------------------------------------------------------------------ arranque

applyDom();
show('main');
$('load-hint').textContent = t('common.loading', { pct: 0 });
Assets.load(Math.min(4, renderer.capabilities.getMaxAnisotropy()), (p) => { $('load-hint').textContent = t('common.loading', { pct: Math.round(p * 100) }); })
  .then((a) => {
    assets = a;
    toMenuScene();
    $('load-hint').textContent = t('menu.hint');
    $<HTMLButtonElement>('btn-story').disabled = false;
  })
  .catch((err) => {
    console.error(err);
    $('load-hint').textContent = t('common.loadError');
  });

