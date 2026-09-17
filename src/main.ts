import * as THREE from 'three';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './style.css';
import { Assets } from './assets';
import { CHAPTERS, MENU_STAGE, PRACTICE, UPCOMING } from './level/campaign';
import { DEFAULT_KEEP_PCT, createEmptyLevel, starsOf, traceRails, type ChapterDef, type FloorResult, type LevelData } from './level/format';
import { BLOCK_GROUPS, EDITOR_LIMITS, LevelEditor, TILE_IDS, blockStage, type EditorTool } from './editor';
import { World } from './world';
import { BURN_TIME, DEFAULT_PITCH, FREEZE_TIME, Slime, type SlimeState } from './slime';
import { BODY_COLORS, CHEEKS, EYES, GEMS_PER_KIND, IRIS_COLORS, IRIS_EYES, LOOK_GEM_PRICES, LOOK_PRICES, LOOK_SOON, LOOK_UNLOCKS, MOUTHS, lookOptionUnlocked, type SlimeLook } from './look';
import { ACHIEVEMENTS, drawPatchIcon, type Achievement, type AchievementContext } from './achievements';
import { BLOCK_CLIP, Thumbs, blockBounds, meshBounds, voidCube } from './thumbs';
import { Input, fullscreenActive, fullscreenSupported, installedApp, type ControlMode } from './input';
import { Fx } from './fx';
import { LiquidGauge } from './hud-liquid';
import { AbyssAmbience } from './abyss';
import { BIOMES, GEM_KINDS, GEM_OF_BIOME, type Biome, type GemKind } from './biomes';
import { Trail } from './trail';
import { LightPool, flicker } from './lights';
import { decorateLogo, drawLogo } from './logo';
import { setMuted, sfx, unlockAudio } from './audio';
import { LANGS, applyDom, detectLang, getLang, levelName, levelTip, setLang, t, type Lang } from './i18n';
import { CREATOR_SLOTS, loadSave, writeSave } from './save';
import { COLLECTIBLES, altWorldUnlocked, type Collectible } from './collectibles';
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

setLang(save.lang && LANGS.includes(save.lang) ? save.lang : detectLang());

// ------------------------------------------------------------------ render base

const lowQuality = matchMedia('(pointer: coarse)').matches;
const canvas = $<HTMLCanvasElement>('game');
// antialias también en móvil: sin él los bordes del limo, su contorno y la cara se ven dentados
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Neutral conserva los colores saturados del estilo cartoon
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = skyTexture();
scene.fog = new THREE.Fog(0x191336, 18, 40);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(abyssEnvironment(), 0.02).texture;
scene.environmentIntensity = 0.5;
pmrem.dispose();

/**
  Entorno para los reflejos: cielo en degradado del abismo con dos focos redondos.
  (El entorno "habitación" de three tiene paneles rectangulares que dejaban reflejos cuadrados en el limo.)
*/
function abyssEnvironment(): THREE.Scene {
  const env = new THREE.Scene();
  const sky = new THREE.SphereGeometry(10, 32, 16);
  const pos = sky.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0xdfe9ff), mid = new THREE.Color(0x7a6bc4), low = new THREE.Color(0x140f2b), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    if (y > 0) c.copy(mid).lerp(top, Math.pow(y, 0.8));
    else c.copy(mid).lerp(low, Math.min(1, -y * 1.6));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  sky.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, toneMapped: false })));
  const lamp = (x: number, y: number, z: number, r: number, color: number, power: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), toneMapped: false }));
    m.position.set(x, y, z);
    env.add(m);
  };
  lamp(-4, 6.5, 5, 1.5, 0xfff1dc, 7);
  lamp(5.5, 3, 4, 0.8, 0xbcd4ff, 3);
  return env;
}

/** Fondo: degradado morado, pintado una vez en un canvas. */
function skyTexture(stops: [string, string, string] = BIOMES.stone.sky): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, stops[0]);
  grad.addColorStop(0.45, stops[1]);
  grad.addColorStop(1, stops[2]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);

// luz de cielo fría + sol cálido con sombras + contraluz azul que recorta al limo y los muros
// (en la habitación del menú se atenúan y mandan las velas y la ventana: ver LIGHTING)
const hemi = new THREE.HemisphereLight(0xd2e2ff, 0x3d2d5c, 1.05);
scene.add(hemi);
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
sun.shadow.radius = 4;
scene.add(sun, sun.target);

/** Ambiente de cada modo: en el menú la habitación es cálida y en penumbra; en el juego, luz de día del abismo. */
const LIGHTING = {
  menu: { hemi: 0.5, sun: 1.25, rim: 0.3, env: 0.3, sunOffset: new THREE.Vector3(-4, 10, 7) },
  play: { hemi: 0.95, sun: 2.4, rim: 0.85, env: 0.5, sunOffset: new THREE.Vector3(5, 12, 4) },
};
const sunOffset = LIGHTING.play.sunOffset.clone();
const sunRight = new THREE.Vector3();
const sunUp = new THREE.Vector3();
const sunDir = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ calidad adaptativa
// Si el móvil no llega a ~45 fps baja resolución y sombras; si va sobrado, las sube.

const QUALITY = [
  { ratio: 1.0, shadow: 0 },
  { ratio: 1.25, shadow: 512 },
  { ratio: 1.5, shadow: 1024 },
  { ratio: 2.0, shadow: 2048 },
] as const;
/*
  En ordenador el coste no venía de la potencia sino de la pantalla: monitores de 120-240 Hz dibujaban (y en el menú
  simulaban) hasta 4 veces más que un móvil, y los monitores 2K/4K pintaban millones de píxeles de más.
  Por eso: como mucho 60 imágenes por segundo, un tope de píxeles y la simulación siempre a paso fijo.
*/
// ~2K: en una tele o monitor 4K el 3D se dibuja a esta resolución y se escala (la interfaz sigue nítida)
const PIXEL_BUDGET = 2048 * 1152;
// Chrome sin aceleración por hardware dibuja con el procesador (SwiftShader): todo al mínimo y se avisa
const gpuName = (() => {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
})();
// WARP (Microsoft Basic Render Driver) es lo que usa Chrome en Windows con la aceleración desactivada
const softwareGpu = /swiftshader|llvmpipe|software|basic render|warp/i.test(gpuName);
let quality = softwareGpu ? 0 : lowQuality ? 2 : 3;
let frameAvg = 1 / 60;
let qualityTimer = 0;
let fastTime = 0;

function applyQuality(level: number) {
  quality = level;
  const q = QUALITY[level];
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
const trail = new Trail();
const lightPool = new LightPool(lowQuality ? 3 : 4, content);
let lightT = 0;
let fireOrderT = 0;
const fireOrder: number[] = [];
const tmpLight = new THREE.Vector3();
/** halo luminoso alrededor de la llama de cada vela */
const candleHalos: THREE.Sprite[] = [];
function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,230,170,1)');
  grad.addColorStop(0.25, 'rgba(255,180,90,0.55)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Velas y ventana en el menú; en el juego, el limo en llamas y los fuegos más cercanos a la cámara. */
function updateLights(dt: number) {
  lightT += dt;
  lightPool.begin();
  if (mode === 'menu' && room) {
    const o = room.position;
    for (const [k, name] of ['light_candle_l', 'light_candle_r'].entries()) {
      const p = room.getObjectByName(name)?.position;
      // un poco separada de la pared para que no queme un punto blanco en el papel
      const f = flicker(lightT, k);
      // sin ventana, las velas son toda la luz del salón
      if (p) lightPool.add(o.x + p.x, o.y + p.y, o.z + p.z + 0.3, 0xffb25c, 5.6 * f, 8.5);
      const halo = candleHalos[k];
      if (halo) { halo.material.opacity = 0.55 * f; halo.scale.setScalar(0.62 * (0.92 + f * 0.08)); }
    }
    // el parche elegido tiene su propia luz
    const lit = achFocus ? patches.get(achFocus) : null;
    if (lit && lit.glow > 0.01) {
      const b = lit.basePos;
      lightPool.add(o.x + b.x - Math.sign(b.x) * 0.7, o.y + b.y + 0.1, o.z + b.z, 0xfff1c4, 3.2 * lit.glow, 2.4);
    }

  } else if (world && slime) {
    if (slime.state === 'burning' && slime.center(tmpLight)) {
      lightPool.add(tmpLight.x, tmpLight.y + 0.8, tmpLight.z, 0xff7a24, 5 * flicker(lightT, 9), 5.5);
    }
    const spots = world.fireSpots;
    if (spots.length) {
      fireOrderT -= dt;
      if (fireOrderT <= 0 || fireOrder.length !== spots.length) {
        fireOrderT = 0.4;
        fireOrder.length = 0;
        spots.forEach((_, k) => fireOrder.push(k));
        const d2 = (k: number) => (spots[k].x - camTarget.x) ** 2 + (spots[k].z - camTarget.z) ** 2;
        fireOrder.sort((a, b) => d2(a) - d2(b));
      }
      for (const k of fireOrder) {
        const spot = spots[k];
        const level = world.fireSpotLevel(spot);
        if (level < 0.02) continue;
        const size = Math.sqrt(spot.cells.length);
        if (!lightPool.add(spot.x, spot.y + 0.75, spot.z, 0xff8a2e, 3.2 * size * level * flicker(lightT, k), 4 + size)) break;
      }
    }
  }
  lightPool.end();
}
content.add(trail.group);
/** tiempo acumulado para dejar manchas de rastro a ritmo fijo */
let trailT = 0;

function resize() {
  // resolución de la calidad actual, sin pasar del tope de píxeles (pantallas 2K/4K)
  // sin tarjeta gráfica el procesador pinta cada píxel: resolución muy baja para que siga siendo jugable
  const pixels = softwareGpu ? 960 * 540 : PIXEL_BUDGET;
  const budget = Math.sqrt(pixels / Math.max(1, innerWidth * innerHeight));
  renderer.setPixelRatio(Math.max(softwareGpu ? 0.3 : 0.75, Math.min(devicePixelRatio, QUALITY[quality].ratio, budget)));
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
// cuentan todas las plantas del piso
const tilesOfAll = (lv: LevelData) => [lv.tiles, ...(lv.stories ?? []).map((s) => s.tiles)].map((rows) => rows.join('')).join('');
const coinsTotalOf = (lv: LevelData) => tilesOfAll(lv).split('C').length - 1;
const gemsTotalOf = (lv: LevelData) => tilesOfAll(lv).split('G').length - 1;
/** 100 %: todas las estrellas y todos los secretos del capítulo. */
const chapterPerfect = (ch: ChapterDef) => ch.floors.every((f) => floorStars(f.id) === 3 && (gemsTotalOf(f) === 0 || !!floorSave(f.id)?.secret));
const coinsEarned = () => Object.values(save.floors).reduce((a, f) => a + f.bestCoins, 0);
/** Saldo del monedero: la mejor marca de monedas de cada piso (no se farmea) menos lo gastado. */
const coinWallet = () => Math.max(0, coinsEarned() - save.coinsSpent);
const chapterTitle = (ch: ChapterDef) => t('story.chapter', { n: CHAPTERS.indexOf(ch) + 1 });
const chapterSubtitle = (ch: ChapterDef) => t(`chapters.${ch.id}`);

// ------------------------------------------------------------------ estado

const input = new Input();
const gauge = new LiquidGauge($<HTMLCanvasElement>('life-bar'));
const abyss = new AbyssAmbience(lowQuality ? 70 : 140);
scene.add(abyss.group);

/** preview: vista 3D del nivel del creador (sin jugar, cámara girable) */
type Mode = 'menu' | 'play' | 'pause' | 'winning' | 'result' | 'preview';
let mode: Mode = 'menu';
let assets: Assets | null = null;
/** miniaturas de rasgos, limos y coleccionables (se crean al cargar los modelos) */
let thumbs: Thumbs | null = null;
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
let menuT = 0;
/** coleccionable que enfoca la cámara en la pantalla Colección */
let menuFocus: string | null = null;
/** habitación del menú con las estanterías y vitrinas */
let room: THREE.Object3D | null = null;
const showcase: THREE.Object3D[] = [];
const menuLook = new THREE.Vector3();
let player: Player | null = null;
/** coleccionables ganados en el último piso, pendientes de enseñar */
const pendingRewards: { kind: 'collectible' | 'achievement' | 'look'; id: string }[] = [];
/** logro que enfoca la cámara en la pantalla Logros */
let achFocus: string | null = null;
/** parches cosidos en el tablón de la habitación */
const patches = new Map<string, { root: THREE.Object3D; fabric: THREE.MeshStandardMaterial[]; thread: THREE.MeshStandardMaterial[]; decal: THREE.CanvasTexture; unlocked: boolean | null; glow: number; basePos: THREE.Vector3; baseScale: THREE.Vector3 }>();
/** brillo detrás del parche elegido */
let patchHalo: THREE.Sprite | null = null;
let rewardThen: (() => void) | null = null;
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const tmpCenter = new THREE.Vector3();
const tmpFx = new THREE.Vector3();
const camWant = new THREE.Vector3();
// viaje de la cámara del menú entre planos
let menuShot = '';
let shotT = 0, shotDur = 0;
const shotFromPos = new THREE.Vector3(), shotFromLook = new THREE.Vector3();
const viewDir = new THREE.Vector3();
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
/** Planos interiores de la habitación del menú (coordenadas del salón). */
const ROOM_BACK_Z = -3.5, ROOM_FRONT_Z = 5, ROOM_SIDE_X = 4.5;
/** Desde dónde se mira de frente un hueco: se aleja de las paredes que tiene cerca (fondo y laterales). */
function slotView(p: THREE.Vector3, out: THREE.Vector3) {
  const back = Math.max(0.05, p.z - ROOM_BACK_Z), left = Math.max(0.05, p.x + ROOM_SIDE_X), right = Math.max(0.05, ROOM_SIDE_X - p.x);
  return out.set(1 / left ** 2 - 1 / right ** 2, 0, 1 / back ** 2).normalize();
}
const lookAhead = new THREE.Vector2();
let camZoom = 1;
// cámara de juego: el joystick derecho la gira (yaw) y la inclina (pitch); en giroscopio vuelve sola a su sitio
const CAM_DIST = Math.hypot(8.6, 4.6);
/** vista 3D del creador: giro, inclinación (de lado a desde arriba) y acercamiento */
const preview = { yaw: 0.7, pitch: 0.5, zoom: 1, dist: 12 };
const CAM_YAW_SPEED = 2.3;
const CAM_PITCH_SPEED = 1.1;
const CAM_PITCH_MIN = 0.5;
const CAM_PITCH_MAX = 1.4;
let camYaw = 0;
let camPitch = DEFAULT_PITCH;
/** dirección del mando pasada a ejes del mundo según hacia dónde mira la cámara */
let moveX = 0;
let moveZ = 0;
/** depuración: piloto automático que sustituye al mando (ejes de pantalla) */
let devDrive: (() => [number, number]) | null = null;

// ------------------------------------------------------------------ iconos

const STAR_PATH = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';
const starSvg = (on: boolean) => `<svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
const starsHtml = (n: number) => `<span class="star-row" role="img" aria-label="${t('common.stars', { n })}">${[0, 1, 2].map((k) => starSvg(k < n)).join('')}</span>`;
const coinSvg = '<svg class="ico coin-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>';
/** Icono de gema del color de su tipo (rubí, zafiro, esmeralda o diamante). */
const gemIco = (kind: GemKind) => `<svg class="gem-ico gem-${kind}" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/></svg>`;
const gemOfChapter = (ch: ChapterDef) => GEM_OF_BIOME[ch.biome ?? 'stone'];
/** Gemas secretas encontradas de un tipo y cuántas hay: cada tres capítulos esconden las suyas. */
function gemsOf(kind: GemKind) {
  let n = 0, total = 0;
  for (const ch of CHAPTERS) {
    if (gemOfChapter(ch) !== kind) continue;
    for (const f of ch.floors) {
      if (gemsTotalOf(f) === 0) continue;
      total++;
      if (floorSave(f.id)?.secret) n++;
    }
  }
  return { n, total };
}
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

const SCREENS = ['main', 'story', 'chapter', 'collection', 'achievements', 'myslime', 'profile', 'options', 'pause', 'result', 'breakdown', 'reward', 'creator', 'editor', 'blocks'] as const;
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
  if (id !== 'collection') menuFocus = null;
  if (id !== 'achievements') achFocus = null;
}

function openScreen(id: ScreenId) {
  if (id === 'story') renderStory();
  if (id === 'collection') renderCollection();
  if (id === 'myslime') renderMySlime();
  if (id === 'achievements') renderAchievements();
  if (id === 'profile') renderProfile();
  if (id === 'options') renderOptions();
  if (id === 'creator') renderCreator();
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
  if (mode === 'menu' && assets) $('load-hint').textContent = '';
}

// ------------------------------------------------------------------ historia

function renderStory() {
  const list = $('chapter-list');
  list.innerHTML = '';
  CHAPTERS.forEach((ch, idx) => {
    // cada capítulo se abre al terminar el anterior
    const prev = CHAPTERS[idx - 1];
    if (prev && !chapterDone(prev)) {
      const b = document.createElement('button');
      b.className = 'card chapter-card locked';
      b.disabled = true;
      b.innerHTML = `${lockSvg}<span class="eyebrow">${chapterTitle(ch)}</span><span class="title">${chapterSubtitle(ch)}</span>
        <span class="meta"><span class="m">${t('story.unlockHint', { chapter: chapterTitle(prev) })}</span></span>`;
      list.appendChild(b);
      return;
    }
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
  const cols = collectiblesOf(ch);
  $('chapter-reward').textContent = cols.length
    ? t('story.collectibles', { n: cols.filter((c) => save.collectibles.includes(c.id)).length, total: cols.length })
    : '';
  const list = $('floor-list');
  list.innerHTML = '';
  ch.floors.forEach((f, k) => {
    const unlocked = floorUnlocked(ch, k);
    const s = floorSave(f.id);
    const b = document.createElement('button');
    b.className = `card floor-card${unlocked ? '' : ' locked'}`;
    b.disabled = !unlocked;
    const gem = gemsTotalOf(f) > 0 && s?.secret ? ` ${gemIco(gemOfChapter(ch))}` : '';
    b.innerHTML = `${unlocked ? '' : lockSvg}<span class="num">${t('story.floor', { n: k + 1 })}</span><span class="name">${unlocked ? levelName(f) : t('common.locked')}</span>
      ${unlocked ? `<span class="meta">${starsHtml(floorStars(f.id))}<span class="m">${coinSvg} ${s?.bestCoins ?? 0}/${coinsTotalOf(f)}${gem}</span></span>` : ''}`;
    b.addEventListener('click', () => { sfx.click(); startFloor(ch, k); });
    list.appendChild(b);
  });
  $('btn-chapter-breakdown').hidden = !chapterDone(ch);
  show('chapter');
}

// ------------------------------------------------------------------ pantalla completa

/*
  Nunca se entra sola: la pide el jugador con el botón del menú o el de la pausa, y el mismo botón la quita.
  El Safari de iPhone no tiene pantalla completa para páginas: el botón explica cómo instalarla.
*/
function syncFullscreenButtons() {
  const on = fullscreenActive();
  const label = t(on ? 'common.exitFullscreen' : 'common.fullscreen');
  // instalada desde la pantalla de inicio ya ocupa todo: sin botones
  for (const id of ['btn-fullscreen', 'btn-pause-fullscreen']) {
    $(id).hidden = installedApp();
    $(id).setAttribute('aria-pressed', String(on));
  }
  $('btn-fullscreen').setAttribute('aria-label', label);
  $('btn-fullscreen').title = label;
  $('btn-pause-fullscreen').querySelector('.fs-label')!.textContent = label;
}
function toggleFullscreen() {
  sfx.click();
  if (!fullscreenSupported()) { toast(t('common.iosFullscreen'), 5000); return; }
  if (fullscreenActive()) input.exitFullscreen();
  else input.requestFullscreen();
}
$('btn-fullscreen').addEventListener('click', toggleFullscreen);
$('btn-pause-fullscreen').addEventListener('click', toggleFullscreen);
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, syncFullscreenButtons);
syncFullscreenButtons();

$('btn-chapter-breakdown').addEventListener('click', () => { sfx.click(); if (chapter) showBreakdown(chapter); });
$('btn-story').addEventListener('click', () => {
  unlockAudio();
  sfx.click();
  if (input.mode === 'gyro') input.requestPermission();
  openScreen('story');
});

// ------------------------------------------------------------------ coleccionables

const collectiblesOf = (ch: ChapterDef) => COLLECTIBLES.filter((c) => c.chapter === ch.id);

const chapterAllStars = (ch: ChapterDef) => ch.floors.every((f) => floorStars(f.id) === 3);

function isUnlocked(c: Collectible): boolean {
  if (c.unlock.kind === 'achievement') return save.achievements.includes(c.unlock.id);
  if (c.unlock.kind === 'legend') return altWorldUnlocked(CHAPTERS, save.floors);
  if (c.unlock.kind === 'secret') return !!floorSave(c.unlock.floor)?.secret;
  const ch = CHAPTERS.find((x) => x.id === c.chapter);
  if (!ch) return false;
  switch (c.unlock.kind) {
    case 'chapterDone': return chapterDone(ch);
    case 'allCoins': return ch.floors.every((f) => coinsTotalOf(f) === 0 || !!floorSave(f.id)?.allCoins);
    case 'allStars': return chapterAllStars(ch);
  }
}

/** Entrega logros y coleccionables conseguidos fuera de un piso (creador, Mi limo...), los enseña y vuelve a la pantalla. */
function rewardsNow(back: ScreenId) {
  const achievements = grantAchievements();
  pendingRewards.push(...grantCollectibles().map((id) => ({ kind: 'collectible' as const, id })),
    ...achievements.map((id) => ({ kind: 'achievement' as const, id })));
  if (pendingRewards.length) afterReward(() => openScreen(back));
}

/** Entrega los coleccionables cuya condición ya se cumple y devuelve los nuevos. */
function grantCollectibles(): string[] {
  const fresh = COLLECTIBLES.filter((c) => !save.collectibles.includes(c.id) && isUnlocked(c)).map((c) => c.id);
  if (fresh.length) {
    save.collectibles.push(...fresh);
    store();
  }
  return fresh;
}

// ------------------------------------------------------------------ logros

function achievementContext(): AchievementContext {
  const allFloors = CHAPTERS.flatMap((c) => c.floors);
  return {
    floorsDone: allFloors.filter((f) => floorSave(f.id)?.done).length,
    stars: allFloors.reduce((a, f) => a + floorStars(f.id), 0),
    coins: coinsEarned(),
    secrets: allFloors.filter((f) => floorSave(f.id)?.secret).length,
    fullSlime: allFloors.some((f) => (floorSave(f.id)?.bestPct ?? 0) >= 0.999),
    fullSlimeFloors: allFloors.filter((f) => (floorSave(f.id)?.bestPct ?? 0) >= 0.999).length,
    secretFound: (id) => !!floorSave(id)?.secret,
    chapterDone: (id) => { const ch = CHAPTERS.find((c) => c.id === id); return !!ch && chapterDone(ch); },
    chapterAllCoins: (id) => { const ch = CHAPTERS.find((c) => c.id === id); return !!ch && ch.floors.every((f) => coinsTotalOf(f) === 0 || !!floorSave(f.id)?.allCoins); },
    chapterAllStars: (id) => { const ch = CHAPTERS.find((c) => c.id === id); return !!ch && chapterAllStars(ch); },
    gems: (kind) => gemsOf(kind).n,
    collectibles: save.collectibles.length,
    creations: save.creations.filter(Boolean).length,
    fastest: Math.min(...allFloors.map((f) => (floorSave(f.id)?.done ? floorSave(f.id)!.bestTime : Infinity))),
    stats: save.stats,
  };
}

/** Entrega los logros cumplidos y devuelve los nuevos. */
function grantAchievements(): string[] {
  const ctx = achievementContext();
  const fresh = ACHIEVEMENTS.filter((a) => {
    if (save.achievements.includes(a.id)) return false;
    const [v, goal] = a.progress(ctx);
    return v >= goal;
  }).map((a) => a.id);
  if (fresh.length) {
    save.achievements.push(...fresh);
    store();
  }
  return fresh;
}

/** Opciones de Mi limo que regala un logro: [apartado, opción][]. */
function achievementRewardOptions(id: string): [LookKey, string][] {
  return Object.entries(LOOK_UNLOCKS).filter(([, ach]) => ach === id).map(([k]) => k.split(':') as [LookKey, string]);
}

/** Opciones de Mi limo que regala un logro (texto "Ojos: Estrellados, Ojos: Brillantes"), o null. */
function achievementRewardText(id: string): string | null {
  const options = achievementRewardOptions(id);
  if (!options.length) return null;
  return options.map(([key, opt]) => `${t(`myslime.${key}`)}: ${t(`myslime.${key}Opt.${opt}`)}`).join(', ');
}

/** Vista previa de una opción de Mi limo (limo del color, o la parte de la cara sobre el color actual). */
function lookPreview(key: LookKey, opt: string): string | null {
  if (!thumbs) return null;
  if (key === 'color') return thumbs.slime(opt as SlimeLook['color'], save.look);
  if (key === 'iris') return null;
  return thumbs.face(key, opt, save.look.color, save.look.iris);
}

/** Insignia del parche de un logro (tela con forma y bordado). */
function patchBadge(a: Achievement, got: boolean, big = false) {
  const badge = document.createElement('span');
  badge.className = `ach-badge ${a.patch}${big ? ' big' : ''}`;
  badge.style.setProperty('--patch', got ? hexCss(a.color) : '#3b3552');
  badge.appendChild(patchCanvas(a, big ? 160 : 96, got));
  return badge;
}

const achName = (a: Achievement) => t(`achievements.names.${a.id}`);

function patchCanvas(a: Achievement, size: number, unlocked: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawPatchIcon(c.getContext('2d')!, a.icon, size, !unlocked);
  return c;
}

/** El parche elegido se ilumina y se adelanta un poco del tablón. */
function updatePatchGlow(dt: number) {
  if (!room) return;
  const k = 1 - Math.exp(-dt * 8);
  let lit: (typeof patches extends Map<string, infer P> ? P : never) | null = null;
  for (const [id, p] of patches) {
    const want = id === achFocus && currentScreen === 'achievements' ? 1 : 0;
    if (want === 0 && p.glow < 1e-3) continue;
    p.glow += (want - p.glow) * k;
    if (p.glow < 1e-3) p.glow = 0;
    const a = ACHIEVEMENTS.find((x) => x.id === id)!;
    const pulse = 0.75 + 0.25 * Math.sin(menuT * 4);
    for (const m of p.fabric) m.emissive.setHex(p.unlocked ? a.color : 0x8d82b8).multiplyScalar(0.45 * p.glow * pulse);
    for (const m of p.thread) m.emissive.setHex(0xfff4d6).multiplyScalar(0.35 * p.glow * pulse);
    p.root.scale.copy(p.baseScale).multiplyScalar(1 + 0.16 * p.glow);
    // sale hacia el centro de la habitación
    p.root.position.copy(p.basePos).x -= Math.sign(p.basePos.x) * 0.08 * p.glow;
    if (p.glow > 0.01) { lit = p; markBusy(250); }
  }
  if (!patchHalo) {
    patchHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: 0xfff1c4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    patchHalo.renderOrder = 1;
    room.add(patchHalo);
  }
  patchHalo.visible = !!lit;
  if (lit) {
    patchHalo.position.copy(lit.basePos).x -= Math.sign(lit.basePos.x) * 0.05;
    patchHalo.scale.setScalar(0.95 * (0.9 + 0.1 * Math.sin(menuT * 4)));
    patchHalo.material.opacity = 0.8 * lit.glow;
  }
}

/** Ficha del logro elegido (junto a su parche): estado, qué pide, cuánto falta, premio y dónde está cosido. */
function renderAchDetail(ctx: AchievementContext) {
  const box = $('ach-detail');
  const k = ACHIEVEMENTS.findIndex((a) => a.id === achFocus);
  if (k < 0) { box.hidden = true; box.innerHTML = ''; return; }
  const a = ACHIEVEMENTS[k];
  const got = save.achievements.includes(a.id);
  const [v, goal] = a.progress(ctx);
  const shown = got ? goal : Math.min(v, goal);
  const pct = Math.round((shown / goal) * 100);
  const reward = achievementRewardText(a.id);
  const slot = k % 30;
  const where = t(k >= 30 ? 'achievements.boardLeft' : 'achievements.boardRight', { row: Math.floor(slot / 6) + 1, col: (slot % 6) + 1 });
  box.innerHTML = `
    <button class="icon-btn ach-detail-close" type="button" aria-label="${escapeHtml(t('common.close'))}"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    <div class="ach-detail-head">
      <span class="ach-detail-patch"></span>
      <div class="ach-detail-title">
        <span class="ach-detail-state${got ? ' got' : ''}">${got ? checkSvg : ''}${escapeHtml(got ? t('achievements.done') : t('achievements.inProgress'))}</span>
        <h3>${escapeHtml(achName(a))}</h3>
      </div>
    </div>
    <p class="ach-detail-desc">${escapeHtml(t(`achievements.descs.${a.id}`))}</p>
    <div class="ach-detail-progress">
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${shown}"><i style="width:${pct}%"></i></div>
      <span>${shown}/${goal}</span>
    </div>
    <dl class="ach-detail-facts">
      <div><dt>${escapeHtml(t('achievements.rewardLabel'))}</dt><dd>${escapeHtml(reward ?? t('achievements.noReward'))}</dd></div>
      <div><dt>${escapeHtml(t('achievements.whereLabel'))}</dt><dd>${escapeHtml(where)}</dd></div>
    </dl>`;
  box.querySelector('.ach-detail-patch')!.appendChild(patchCanvas(a, 128, got));
  box.querySelector('.ach-detail-close')!.addEventListener('click', () => {
    sfx.click();
    achFocus = null;
    renderAchievements();
  });
  box.hidden = false;
}

function renderAchievements() {
  const ctx = achievementContext();
  renderAchDetail(ctx);
  $('achievements-count').textContent = `${save.achievements.length}/${ACHIEVEMENTS.length}`;
  const list = $('achievements-list');
  list.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const got = save.achievements.includes(a.id);
    const [v, goal] = a.progress(ctx);
    const b = document.createElement('button');
    const focused = achFocus === a.id;
    b.className = `ach-card${got ? ' got' : ''}${focused ? ' focused' : ''}`;
    b.setAttribute('aria-pressed', String(focused));
    const badge = patchBadge(a, got);
    const reward = achievementRewardText(a.id);
    const pct = Math.min(1, v / goal);
    const body = document.createElement('span');
    body.className = 'ach-body';
    body.innerHTML = `<span class="item-name">${escapeHtml(achName(a))}</span>
      <span class="ach-desc">${escapeHtml(t(`achievements.descs.${a.id}`))}</span>
      ${got ? `<span class="item-state">${t('achievements.done')}</span>` : `<span class="progress"><i style="width:${pct * 100}%"></i></span><span class="ach-num">${Math.min(v, goal)}/${goal}</span>`}
      <span class="ach-reward">${escapeHtml(reward ? t('achievements.reward', { item: reward }) : t('achievements.noReward'))}</span>`;
    b.append(badge, body);
    b.addEventListener('click', () => {
      sfx.click();
      achFocus = focused ? null : a.id;
      renderAchievements();
    });
    list.appendChild(b);
  }
}

/** Parches del tablón: tela del color del logro con su icono bordado; los que faltan, apagados. */
function refreshPatches() {
  if (!room || !assets) return;
  ACHIEVEMENTS.forEach((a, k) => {
    let p = patches.get(a.id);
    if (!p) {
      const slot = room!.getObjectByName(`ach_slot_${k}`);
      if (!slot) return;
      const obj = assets!.clone(`patch_${a.patch}`, { cloneMaterials: true });
      obj.position.copy(slot.position);
      obj.quaternion.copy(slot.quaternion);
      obj.scale.copy(slot.scale);
      obj.rotateZ(((k * 37) % 13 - 6) * 0.012);
      obj.userData.achId = a.id;
      const fabric: THREE.MeshStandardMaterial[] = [];
      const thread: THREE.MeshStandardMaterial[] = [];
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.name === 'PatchFabric') fabric.push(mat);
        if (mat.name === 'PatchThread') thread.push(mat);
      });
      const decal = new THREE.CanvasTexture(document.createElement('canvas'));
      decal.colorSpace = THREE.SRGBColorSpace;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44), new THREE.MeshStandardMaterial({ map: decal, transparent: true, roughness: 0.9, depthWrite: false }));
      plane.position.z = 0.036;
      plane.renderOrder = 2;
      obj.add(plane);
      room!.add(obj);
      p = { root: obj, fabric, thread, decal, unlocked: null, glow: 0, basePos: obj.position.clone(), baseScale: obj.scale.clone() };
      patches.set(a.id, p);
    }
    const got = save.achievements.includes(a.id);
    if (p.unlocked === got) return;
    p.unlocked = got;
    for (const m of p.fabric) m.color.setHex(got ? a.color : 0x3b3552);
    for (const m of p.thread) m.color.setHex(got ? 0xfdf6e3 : 0x6b6485);
    p.decal.image = patchCanvas(a, 256, got);
    p.decal.needsUpdate = true;
  });
}

function howToGet(c: Collectible): string {
  if (c.unlock.kind === 'legend') return t('collection.howLegend');
  if (c.unlock.kind === 'achievement') {
    const id = c.unlock.id;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    return t('collection.howAchievement', { name: a ? achName(a) : id });
  }
  const ch = CHAPTERS.find((x) => x.id === c.chapter)!;
  const title = chapterTitle(ch);
  switch (c.unlock.kind) {
    case 'secret': {
      const floor = c.unlock.floor;
      return t('collection.howSecret', { n: ch.floors.findIndex((f) => f.id === floor) + 1, chapter: title });
    }
    case 'chapterDone': return t('collection.howDone', { chapter: title });
    case 'allCoins': return t('collection.howCoins', { chapter: title });
    case 'allStars': return t('collection.howStars', { chapter: title });
  }
}

function renderCollection() {
  $('collection-count').textContent = `${save.collectibles.length}/${COLLECTIBLES.length}`;
  const list = $('collection-list');
  list.innerHTML = '';
  for (const c of COLLECTIBLES) {
    const got = save.collectibles.includes(c.id);
    const focused = menuFocus === c.id;
    const b = document.createElement('button');
    b.className = `item-card${got ? ' got' : ' missing'}${focused ? ' focused' : ''}`;
    b.setAttribute('aria-pressed', String(focused));
    b.innerHTML = `<span class="item-name">${got ? '' : lockSvg}${t(`collectibles.${c.id}`)}</span><span class="item-state">${got ? t('collection.got') : howToGet(c)}</span>`;
    b.addEventListener('click', () => {
      sfx.click();
      menuFocus = focused ? null : c.id;
      renderCollection();
    });
    list.appendChild(b);
  }
}

/** Monedas por el suelo del salón (tantas como monedas conseguidas) y, con el limo de oro comprado, el cofre rebosante. */
let roomCoins: THREE.InstancedMesh | null = null;
let goldChest: THREE.Object3D | null = null;
function refreshTreasure() {
  if (!room || !assets) return;
  const hasGold = save.bought.includes('color:gold');
  const floorCount = Math.min(360, coinsEarned());
  const chestCount = hasGold ? 110 : 0;
  const total = floorCount + chestCount;
  const spot = room.getObjectByName('room_gold_chest')?.position ?? new THREE.Vector3(-2.1, 0, -0.6);
  // de cara a la alfombra
  const yaw = Math.atan2(-spot.x, -spot.z);
  if (hasGold && !goldChest) {
    goldChest = assets.clone('gold_chest');
    goldChest.position.copy(spot);
    goldChest.rotation.y = yaw;
    Assets.child(goldChest, 'gold_chest_lid').rotation.x = -1.9;
    room.add(goldChest);
  } else if (!hasGold && goldChest) {
    room.remove(goldChest);
    goldChest = null;
  }
  if (roomCoins?.userData.total === total) return;
  if (roomCoins) { room.remove(roomCoins); roomCoins.dispose(); roomCoins = null; }
  if (!total) return;
  const material = (assets.clone('coin') as THREE.Mesh).material;
  const coins = new THREE.InstancedMesh(assets.geometry('coin'), material, total);
  coins.userData.total = total;
  coins.receiveShadow = true;
  // posiciones siempre iguales: cada moneda nueva se suma a los montones sin mover las que ya había
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), scale = new THREE.Vector3(0.6, 0.6, 0.6);
  // en coordenadas del salón (x a la derecha, z hacia la cámara): lejos de la alfombra, las vitrinas, las estanterías y lo expuesto
  // junto al cofre el oro se desborda hasta el borde de la alfombra
  const nearChest = (x: number, z: number, r: number) => hasGold && Math.hypot(x - spot.x, z - spot.z) < r;
  const blocked = (x: number, z: number) =>
    (Math.hypot(x, z) < 1.8 && !nearChest(x, z, 1.1)) || Math.abs(x) > 4.15 || z < -3.3 || z > 4.6
    || (Math.abs(x) < 1.2 && z < -2.5) || (Math.abs(x) > 3.2 && z > -2.2 && z < 0.4) || (Math.abs(x) > 1.3 && z < -2.75)
    || [[-3.75, 1.9], [3.75, 1.9], [-3.75, -2.4], [3.75, -2.4]].some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 0.55)
    || nearChest(x, z, 0.56);
  // el primer montón, delante del cofre (como si se hubiera desbordado)
  const piles: [number, number][] = [[spot.x + Math.sin(yaw) * 0.72, spot.z + Math.cos(yaw) * 0.72], [2.7, 2.7], [-1.4, 2.9], [3.3, 0.9], [-3.3, 0.9], [-2.2, -2.2], [2.9, -1.0], [0.9, 2.9]];
  let k = 0;
  for (; k < floorCount; k++) {
    const [cx, cz] = piles[k % piles.length];
    const spread = 0.2 + 0.06 * Math.sqrt(k / piles.length);
    let x = cx, z = cz;
    for (let tries = 0; tries < 10; tries++) {
      const a = rnd() * Math.PI * 2, r = spread * Math.sqrt(rnd());
      x = cx + Math.cos(a) * r;
      z = cz + Math.sin(a) * r;
      if (!blocked(x, z)) break;
    }
    // montón: más alto en el centro
    const d = Math.hypot(x - cx, z - cz);
    p.set(x, 0.02 + Math.max(0, spread - d) * 0.45, z);
    e.set(-Math.PI / 2 + (rnd() - 0.5) * 0.35, 0, rnd() * Math.PI * 2, 'XZY');
    m.compose(p, q.setFromEuler(e), scale);
    coins.setMatrixAt(k, m);
  }
  // cofre: montaña de monedas que rebosa por encima del borde
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  scale.setScalar(0.45);
  // sobre el montón de oro del modelo (media elipse de 0.4 x 0.25 y 0.1 de alto encima de la caja, a 0.5)
  for (let c = 0; c < chestCount; c++, k++) {
    const lx = (rnd() - 0.5) * 0.74, lz = (rnd() - 0.5) * 0.44;
    const dome = Math.sqrt(Math.max(0, 1 - (lx / 0.4) ** 2 - (lz / 0.25) ** 2));
    p.set(spot.x + lx * cos + lz * sin, spot.y + 0.5 + dome * 0.1 + 0.012 + rnd() * 0.012, spot.z - lx * sin + lz * cos);
    e.set(-Math.PI / 2 + (rnd() - 0.5) * 0.6, 0, rnd() * Math.PI * 2, 'XZY');
    m.compose(p, q.setFromEuler(e), scale);
    coins.setMatrixAt(k, m);
  }
  coins.instanceMatrix.needsUpdate = true;
  roomCoins = coins;
  room.add(coins);
}

/** Tocar la habitación: un parche abre su logro y una pieza expuesta, su ficha de la colección. */
const picker = new THREE.Raycaster();
const pickNdc = new THREE.Vector2();
function pickInRoom(e: MouseEvent) {
  if (mode !== 'menu' || !room) return;
  const el = e.target as HTMLElement;
  if (el !== canvas && !el.classList.contains('screen')) return;
  if (currentScreen !== 'main' && currentScreen !== 'achievements' && currentScreen !== 'collection') return;
  const r = canvas.getBoundingClientRect();
  pickNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  picker.setFromCamera(pickNdc, camera);
  const hits = picker.intersectObjects([...[...patches.values()].map((p) => p.root), ...showcase], true);
  let o: THREE.Object3D | null = hits[0]?.object ?? null;
  while (o && !o.userData.achId && !o.userData.colId) o = o.parent;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveal = (list: string) => $(list).querySelector('.focused')?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  if (o?.userData.achId) {
    sfx.click();
    if (currentScreen !== 'achievements') openScreen('achievements');
    achFocus = o.userData.achId as string;
    renderAchievements();
    reveal('achievements-list');
  } else if (o?.userData.colId) {
    sfx.click();
    if (currentScreen !== 'collection') openScreen('collection');
    menuFocus = o.userData.colId as string;
    renderCollection();
    reveal('collection-list');
  } else if (currentScreen === 'achievements' && achFocus) {
    achFocus = null;
    renderAchievements();
  } else if (currentScreen === 'collection' && menuFocus) {
    menuFocus = null;
    renderCollection();
  }
}
document.addEventListener('click', pickInRoom);

/** Habitación del menú (se crea una vez) con los coleccionables conseguidos en su sitio. */
function refreshRoom() {
  if (!assets) return;
  if (!room) {
    room = assets.clone('menu_room', { cloneMaterials: true });
    room.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // la habitación está cerrada, pero la luz del sol entra igual: ni techo ni pared delantera dan sombra
      if (/^room_(ceiling|front_wall|door)/.test(m.name) || /^room_(ceiling|front_wall|door)/.test(m.parent?.name ?? '')) m.castShadow = false;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.name === 'Glass') {
        mat.transparent = true;
        mat.opacity = 0.16;
        mat.depthWrite = false;
        m.castShadow = false;
        m.renderOrder = 3;
      }
    });
    content.add(room);
    const haloTex = haloTexture();
    for (const name of ['light_candle_l', 'light_candle_r']) {
      const spot = room.getObjectByName(name);
      if (!spot) continue;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.copy(spot.position).y -= 0.06;
      halo.renderOrder = 4;
      room.add(halo);
      candleHalos.push(halo);
    }
  }
  refreshPatches();
  refreshTreasure();
  for (const o of showcase) room.remove(o);
  showcase.length = 0;
  for (const id of save.collectibles) {
    const slot = room.getObjectByName(`slot_${id}`);
    const def = COLLECTIBLES.find((c) => c.id === id);
    if (!slot || !def) continue;
    const item = assets.clone(id);
    item.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // el cristal de los botes y las bolas deja ver lo de dentro
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.name === 'GlassCollectible') {
        mat.transparent = true;
        mat.opacity = 0.28;
        mat.depthWrite = false;
        m.renderOrder = 3;
      }
    });
    const holder = new THREE.Group();
    holder.position.copy(slot.position);
    const box = meshBounds(item);
    const size = box.getSize(new THREE.Vector3());
    const mid = box.getCenter(new THREE.Vector3());
    // en estanterías y vitrinas giran despacio (salvo lo plano); lo colgado en la pared y lo del suelo se queda quieto
    const spin = (def.place === 'shelf' || def.place === 'vitrina') && !def.flat;
    let scale = slot.scale.x;
    const fit = FIT[def.place === 'vitrina' && slot.position.y > 1.2 ? 'vitrinaTop' : def.place];
    if (fit) {
      // cada pieza llena su hueco igual que las demás, centrada sobre él (girando no toca los lados)
      const across = spin ? Math.hypot(size.x, size.z) : size.x;
      scale = Math.min(fit.h / size.y, fit.w / Math.max(across, 1e-3));
      item.position.set(-mid.x * scale, -box.min.y * scale, -mid.z * scale);
    }
    item.scale.setScalar(scale);
    if (def.flat && fit) holder.rotation.y = Math.atan2(slotView(slot.position, viewDir).x, viewDir.z);
    holder.add(item);
    holder.userData.phase = showcase.length * 1.3;
    holder.userData.colId = id;
    holder.userData.spin = spin;
    // para la cámara de la colección: centro y tamaño de lo que se ve
    holder.userData.center = fit ? slot.position.clone().setY(slot.position.y + (size.y * scale) / 2) : mid.multiplyScalar(scale).add(slot.position);
    holder.userData.radius = (size.length() * scale) / 2;
    room.add(holder);
    showcase.push(holder);
  }
}

/** Hueco de cada sitio de exposición (ancho y alto que puede ocupar una pieza); pared y suelo usan la escala del hueco. */
const FIT: Record<string, { w: number; h: number } | undefined> = {
  shelf: { w: 0.44, h: 0.56 },
  vitrina: { w: 0.5, h: 0.5 },
  vitrinaTop: { w: 0.62, h: 0.6 },
};

// ------------------------------------------------------------------ Mi limo

type LookKey = keyof SlimeLook;
const LOOK_OPTIONS: { key: LookKey; options: readonly string[] }[] = [
  { key: 'color', options: Object.keys(BODY_COLORS) },
  { key: 'eyes', options: EYES },
  // subopción: color del iris, solo para los ojos con iris normal
  { key: 'iris', options: Object.keys(IRIS_COLORS) },
  { key: 'mouth', options: MOUTHS },
  { key: 'cheeks', options: CHEEKS },
];
const hexCss = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Opción de pago pulsada una vez: la segunda pulsación (en pocos segundos) la compra. */
let buyArmed: { id: string; until: number } | null = null;

function renderMySlime() {
  const root = $('myslime-options');
  root.innerHTML = '';
  const gemCounts = GEM_KINDS.map((kind) => ({ kind, ...gemsOf(kind) })).filter((g) => g.total > 0);
  $('myslime-wallet').innerHTML = `${coinSvg}<span>${coinWallet()}</span>${gemCounts.map((g) => `${gemIco(g.kind)}<span>${g.n}</span>`).join('')}`;
  $('myslime-wallet').setAttribute('aria-label', [t('myslime.wallet', { n: coinWallet() }),
    ...gemCounts.map((g) => t('myslime.gemWallet', { gem: t(`myslime.gems.${g.kind}`), n: g.n, total: g.total }))].join(' · '));
  for (const { key, options } of LOOK_OPTIONS) {
    if (key === 'iris' && !IRIS_EYES.has(save.look.eyes)) continue;
    const label = document.createElement('p');
    label.className = 'panel-label';
    label.textContent = t(`myslime.${key}`);
    const row = document.createElement('div');
    row.className = key === 'color' || key === 'iris' ? `swatch-row${key === 'iris' ? ' iris-row' : ''}` : 'chip-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', label.textContent);
    for (const opt of options) {
      const b = document.createElement('button');
      const name = t(`myslime.${key}Opt.${opt}`);
      const id = `${key}:${opt}`;
      const open = lookOptionUnlocked(key, opt, save.achievements, save.bought, save.unlockAll);
      const needed = ACHIEVEMENTS.find((a) => a.id === LOOK_UNLOCKS[id]);
      const price = LOOK_PRICES[id];
      const gemPrice = LOOK_GEM_PRICES[id];
      const gemName = gemPrice ? t(`myslime.gems.${gemPrice}`) : '';
      const soon = LOOK_SOON.has(id);
      b.setAttribute('aria-pressed', String(save.look[key] === opt));
      if (key === 'color' || key === 'iris') {
        const body = key === 'color' ? BODY_COLORS[opt as keyof typeof BODY_COLORS] : { color: IRIS_COLORS[opt as keyof typeof IRIS_COLORS] };
        b.className = `swatch${'metalness' in body ? ' metallic' : ''}${'opacity' in body ? ' water' : ''}${'sparkle' in body ? ' gem-swatch' : ''}${open ? '' : ' locked'}${(price || gemPrice) && !open ? ' priced' : ''}`;
        b.style.setProperty('--swatch', hexCss(body.color));
        b.setAttribute('aria-label', open ? name : soon ? `${name} · ${t('myslime.soon')}` : price ? `${name} · ${price}` : gemPrice ? `${name} · ${GEMS_PER_KIND} ${gemName}` : `${name} · ${t('achievements.locked')}`);
        b.title = name;
        if (!open) {
          b.innerHTML = price ? `${lockSvg}<span class="price-tag">${coinSvg}${price}</span>`
            : gemPrice ? `${lockSvg}<span class="price-tag">${gemIco(gemPrice)}${GEMS_PER_KIND}</span>` : lockSvg;
        }
      } else {
        // se elige viendo el rasgo, no leyendo su nombre ('none': solo el círculo del color)
        b.className = `chip thumb-chip${open ? '' : ' locked'}`;
        b.setAttribute('aria-label', open ? name : `${name} · ${t(soon ? 'myslime.soon' : 'achievements.locked')}`);
        b.title = name;
        const src = lookPreview(key, opt);
        b.innerHTML = `${src ? `<img src="${src}" alt="" draggable="false">` : escapeHtml(name)}${open ? '' : lockSvg}`;
      }
      b.addEventListener('click', () => {
        if (!open && gemPrice) {
          // se consigue con todas las gemas secretas de su tipo (no se gastan)
          sfx.click();
          const have = gemsOf(gemPrice).n;
          if (have < GEMS_PER_KIND) { toast(t('myslime.needGems', { name, price: GEMS_PER_KIND, gem: gemName, n: GEMS_PER_KIND - have }), 3000); return; }
          if (!buyArmed || buyArmed.id !== id || performance.now() > buyArmed.until) {
            buyArmed = { id, until: performance.now() + 4000 };
            toast(t('myslime.buyGemsConfirm', { name, price: GEMS_PER_KIND, gem: gemName }), 3800);
            return;
          }
          buyArmed = null;
          save.bought.push(id);
          (save.look as unknown as Record<string, string>)[key] = opt;
          store();
          applyLook();
          sfx.gem();
          pendingRewards.push({ kind: 'look', id });
          afterReward(() => show('myslime'));
          return;
        }
        if (!open && price) {
          sfx.click();
          const wallet = coinWallet();
          if (wallet < price) { toast(t('myslime.needCoins', { name, price, n: price - wallet }), 2800); return; }
          if (!buyArmed || buyArmed.id !== id || performance.now() > buyArmed.until) {
            buyArmed = { id, until: performance.now() + 4000 };
            toast(t('myslime.buyConfirm', { name, price }), 3800);
            return;
          }
          buyArmed = null;
          save.coinsSpent += price;
          save.bought.push(id);
          (save.look as unknown as Record<string, string>)[key] = opt;
          store();
          applyLook();
          // el oro llena el salón: aparece el cofre rebosante
          refreshRoom();
          sfx.coin();
          pendingRewards.push({ kind: 'look', id });
          afterReward(() => show('myslime'));
          return;
        }
        if (!open) {
          sfx.click();
          if (soon) toast(t('myslime.soon'), 2200);
          else if (needed) toast(t('achievements.unlockHint', { name: achName(needed) }), 2600);
          return;
        }
        sfx.click();
        if (save.look[key] !== opt) save.stats.looks++;
        (save.look as unknown as Record<string, string>)[key] = opt;
        store();
        applyLook();
        slime?.poke();
        renderMySlime();
        rewardsNow('myslime');
      });
      row.appendChild(b);
    }
    root.append(label, row);
  }
}

/** Aplica el aspecto guardado al limo y a la barra de vida. */
function applyLook() {
  slime?.setLook(save.look);
  updateGaugeColors();
}

/** Líquido de la barra de vida: color del limo, o el de su estado (aceite, llamas, congelado). */
const STATE_GAUGE: Record<Exclude<SlimeState, 'normal'>, [string, string]> = {
  oiled: ['#e0b45a', '#8a5a14'],
  burning: ['#ffb15c', '#e0461a'],
  frozen: ['#e6f8ff', '#6cc4ec'],
};
function updateGaugeColors() {
  const st = slime?.state ?? 'normal';
  if (st !== 'normal') { gauge.setColors(...STATE_GAUGE[st]); return; }
  const c = new THREE.Color(BODY_COLORS[save.look.color].color);
  gauge.setColors(c.clone().offsetHSL(0, 0, 0.16).getStyle(), c.clone().offsetHSL(0, 0.05, -0.12).getStyle());
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
    [t('profile.collectibles'), `${save.collectibles.length}/${COLLECTIBLES.length}`],
    [t('profile.achievementsTotal'), `${save.achievements.length}/${ACHIEVEMENTS.length}`],
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
  if (!LANGS.includes(lang)) return;
  save.lang = lang;
  store();
  setLang(lang);
  syncFullscreenButtons();
  refreshScreen();
});

function setControl(m: ControlMode) {
  input.setMode(m);
  if (m === 'gyro') input.requestPermission();
  document.querySelectorAll<HTMLButtonElement>('.pick-btn[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  save.control = m;
  store();
}
document.querySelectorAll<HTMLButtonElement>('.pick-btn[data-mode]').forEach((b) => {
  b.addEventListener('click', () => { sfx.click(); setControl(b.dataset.mode as ControlMode); });
});
setControl(save.control);

function setJoyFixed(fixed: boolean) {
  input.setFixed(fixed);
  document.querySelectorAll<HTMLButtonElement>('.joy-pick').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.joy === 'fixed') === fixed)));
  save.joyFixed = fixed;
  store();
}
document.querySelectorAll<HTMLButtonElement>('.joy-pick').forEach((b) => {
  b.addEventListener('click', () => { sfx.click(); setJoyFixed(b.dataset.joy === 'fixed'); });
});
setJoyFixed(save.joyFixed);
setMuted(!save.sound);

$('btn-sound').addEventListener('click', () => { save.sound = !save.sound; setMuted(!save.sound); store(); renderOptions(); sfx.click(); });
$('btn-vibration').addEventListener('click', () => { save.vibration = !save.vibration; store(); renderOptions(); sfx.click(); buzz(30); });
$('btn-calib').addEventListener('click', () => { input.calibrate(); sfx.click(); });
$('btn-pause-calib').addEventListener('click', () => { input.calibrate(); sfx.click(); });
$('btn-practice').addEventListener('click', () => { sfx.click(); startLevel(PRACTICE, null, 0); });

// ------------------------------------------------------------------ códigos

/** SHA-256 del código en mayúsculas → lo que da (así los códigos no se leen en el código del juego). */
const CODES: Record<string, 'unlockAll'> = {
  '3b2968a87902e57baf70b507398ea451c58eddf89f2f1165e3518db670159d2e': 'unlockAll',
};

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Código de pruebas: todos los pisos con sus estrellas y gemas, logros, coleccionables y todo Mi limo. */
function unlockEverything() {
  for (const f of CHAPTERS.flatMap((c) => c.floors)) {
    const prev = save.floors[f.id];
    save.floors[f.id] = {
      done: true, allCoins: true, kept: true,
      bestCoins: coinsTotalOf(f), bestPct: Math.max(prev?.bestPct ?? 0, 1), bestTime: prev?.bestTime ?? 0,
      secret: gemsTotalOf(f) > 0 || !!prev?.secret,
    };
  }
  save.achievements = ACHIEVEMENTS.map((a) => a.id);
  save.collectibles = COLLECTIBLES.map((c) => c.id);
  save.bought = [...new Set([...save.bought, ...Object.keys(LOOK_PRICES), ...Object.keys(LOOK_GEM_PRICES)])];
  save.unlockAll = true;
  store();
  applyLook();
  refreshRoom();
}

$<HTMLFormElement>('code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('code-input');
  const msg = $('code-msg');
  const code = input.value.trim().toUpperCase();
  if (!code) { input.focus(); return; }
  sfx.click();
  const reward = CODES[await sha256Hex(code)];
  msg.classList.toggle('ok', !!reward);
  msg.classList.toggle('error', !reward);
  if (!reward) {
    msg.textContent = t('options.codeInvalid');
    input.select();
    return;
  }
  unlockEverything();
  msg.textContent = t('options.codeUnlockAll');
  input.value = '';
  sfx.coin();
});

// ------------------------------------------------------------------ pausa

function pause() {
  if (mode !== 'play') return;
  mode = 'pause';
  input.reset();
  $('pause-goals').innerHTML = starGoalsHtml(true);
  $('goals-card').hidden = true;
  show('pause');
}

/** Lo que da cada estrella del piso; live: con lo conseguido hasta ahora (en la pausa). */
function starGoalsHtml(live: boolean): string {
  if (!world || !slime) return '';
  const keep = Math.round((world.def.keepPct ?? DEFAULT_KEEP_PCT) * 100);
  const pct = Math.round((slime.aliveCount / slime.n) * 100);
  const star = '<svg class="goal-star" viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>';
  const goals = [
    { ok: false, label: t('result.goalTreasure'), val: '' },
    { ok: live && world.coinsCollected === world.coinsTotal, label: t('result.goalCoins'), val: world.coinsTotal ? `${live ? world.coinsCollected : 0}/${world.coinsTotal}` : '' },
    { ok: live && pct >= keep, label: t('result.goalKeep', { pct: keep }), val: live ? `${pct}%` : '' },
  ];
  return goals.map((g, k) =>
    `<li class="${g.ok ? 'ok' : ''}" style="animation-delay:${60 + k * 60}ms"><span class="goal-mark">${star}</span>${escapeHtml(g.label)}<span class="val">${g.val}</span></li>`).join('');
}

/** Al empezar un piso: tarjeta con sus estrellas que se va sola a los pocos segundos. */
let goalsTimer = 0;
function showGoalsCard() {
  const card = $('goals-card');
  $('goals-start').innerHTML = starGoalsHtml(false);
  card.classList.remove('leaving');
  card.hidden = false;
  clearTimeout(goalsTimer);
  goalsTimer = window.setTimeout(() => {
    card.classList.add('leaving');
    goalsTimer = window.setTimeout(() => { card.hidden = true; }, 200);
  }, 4200);
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
  trail.reset();
}

/** Tema aplicado ahora mismo a cielo, niebla, luces y abismo. */
let currentBiome: Biome = 'stone';
function applyBiome(biome: Biome) {
  if (biome === currentBiome) return;
  currentBiome = biome;
  const look = BIOMES[biome];
  (scene.background as THREE.Texture | null)?.dispose();
  scene.background = skyTexture(look.sky);
  (scene.fog as THREE.Fog).color.setHex(look.fog);
  hemi.color.setHex(look.hemiSky);
  hemi.groundColor.setHex(look.hemiGround);
  sun.color.setHex(look.sun);
  rim.color.setHex(look.rim);
  abyss.setLook(look);
}

function loadLevel(def: LevelData, biome: Biome = 'stone', showcase = false) {
  clearLevel();
  applyBiome(biome);
  world = new World(def, assets!, biome, showcase);
  slime = new Slime(world, def.count, lowQuality, assets!, save.look);
  content.add(world.group, slime.group);
  camTarget.copy(world.start);
  camPos.set(0, 0, 0);
  lookAhead.set(0, 0);
}

function startFloor(ch: ChapterDef, k: number) {
  testingCreation = null;
  startLevel(ch.floors[k], ch, k);
}

function startLevel(def: LevelData, ch: ChapterDef | null, k: number) {
  const biome = ch?.biome ?? 'stone';
  if (!assets) return;
  // las texturas del tema se cargan la primera vez que se entra en uno de sus pisos
  void assets.loadBiome(biome).then(() => startLevelNow(def, ch, k, biome));
}

function startLevelNow(def: LevelData, ch: ChapterDef | null, k: number, biome: Biome) {
  chapter = ch;
  floorIndex = k;
  loadLevel(def, biome);
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
  camYaw = 0;
  camPitch = DEFAULT_PITCH;
  moveX = moveZ = 0;
  if (input.mode === 'joystick' && !save.cameraHint) {
    save.cameraHint = true;
    store();
    setTimeout(() => { if (mode === 'play') toast(t('toast.camera')); }, 4200);
  }
  if (room) room.visible = false;
  world!.group.visible = true;
  mode = 'play';
  show(null);
  updateHud();
  showGoalsCard();
}

function restart() {
  if (world) startLevel(world.def, chapter, floorIndex);
}

function leaveLevel() {
  const ch = chapter;
  toMenuScene();
  if (testingCreation !== null) openEditor(testingCreation, false);
  else if (ch) openChapter(ch);
  else openScreen('options');
}

// ------------------------------------------------------------------ creador de niveles

/** Hueco del nivel que se está probando desde el editor (al salir se vuelve a él). */
let testingCreation: number | null = null;
let editingSlot = 0;
let editor: LevelEditor | null = null;
/** borrar pide una segunda pulsación */
let deleteArmed: { slot: number; until: number } | null = null;

const creationName = (l: LevelData, k: number) => l.name.trim() || t('creator.defaultName', { n: k + 1 });

/** Lo que impide jugar un nivel del creador (vacío si se puede). */
function creationProblems(level: LevelData): string[] {
  const all = [level.tiles, ...(level.stories ?? []).map((s) => s.tiles)].map((rows) => rows.join('')).join('');
  const count = (ch: string) => all.split(ch).length - 1;
  const out: string[] = [];
  if (count('P') !== 1) out.push(t('creator.needStart'));
  if (count('T') !== 1) out.push(t('creator.needTreasure'));
  if ((count('D') && !count('S')) || (count('d') && !count('s'))) out.push(t('creator.doorNoSwitch'));
  if (traceRails(level).errors.length) out.push(t('creator.badRails'));
  return out;
}

function renderCreator() {
  const list = $('creator-slots');
  list.innerHTML = '';
  $('creator-count').textContent = `${save.creations.filter(Boolean).length}/${CREATOR_SLOTS}`;
  save.creations.forEach((level, k) => {
    const card = document.createElement('div');
    card.className = `creator-slot${level ? '' : ' empty'}`;
    if (!level) {
      card.innerHTML = `<span class="eyebrow">${t('creator.slot', { n: k + 1 })}</span>`;
      const b = document.createElement('button');
      b.className = 'small-btn';
      b.textContent = t('creator.new');
      b.addEventListener('click', () => {
        sfx.click();
        const fresh = createEmptyLevel(11, 15, '');
        fresh.id = `custom-${Date.now().toString(36)}-${k}`;
        save.creations[k] = fresh;
        store();
        openEditor(k, true);
      });
      card.appendChild(b);
      list.appendChild(card);
      return;
    }
    const w = level.tiles[0].length, d = level.tiles.length;
    card.innerHTML = `<span class="eyebrow">${t('creator.slot', { n: k + 1 })}</span><span class="title">${escapeHtml(creationName(level, k))}</span><span class="meta">${t('creator.size', { w, d })}</span>`;
    const actions = document.createElement('div');
    actions.className = 'slot-actions';
    const play = document.createElement('button');
    play.className = 'small-btn';
    play.textContent = t('creator.play');
    play.addEventListener('click', () => { sfx.click(); playCreation(k); });
    const editBtn = document.createElement('button');
    editBtn.className = 'small-btn';
    editBtn.textContent = t('creator.edit');
    editBtn.addEventListener('click', () => { sfx.click(); openEditor(k, true); });
    const del = document.createElement('button');
    del.className = `icon-btn${deleteArmed?.slot === k && performance.now() < deleteArmed.until ? ' danger-armed' : ''}`;
    del.setAttribute('aria-label', t('creator.delete'));
    del.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
    del.addEventListener('click', () => {
      sfx.click();
      if (!deleteArmed || deleteArmed.slot !== k || performance.now() > deleteArmed.until) {
        deleteArmed = { slot: k, until: performance.now() + 4000 };
        toast(t('creator.deleteConfirm', { name: creationName(level, k) }), 3800);
        renderCreator();
        return;
      }
      deleteArmed = null;
      save.creations[k] = null;
      store();
      toast(t('creator.deleted'), 2000);
      renderCreator();
    });
    actions.append(play, editBtn, del);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

function playCreation(k: number) {
  const level = save.creations[k];
  if (!level) return;
  const problems = creationProblems(level);
  if (problems.length) { toast(problems[0], 3200); return; }
  closePreview3d(false);
  testingCreation = k;
  save.stats.tests++;
  store();
  // copia: jugar no puede tocar lo guardado; sin capítulo, no cuenta para monedas, estrellas ni logros de piso
  startLevel({ ...structuredClone(level), name: creationName(level, k) }, null, 0);
}

function openEditor(k: number, reload: boolean) {
  const level = save.creations[k];
  if (!level) { openScreen('creator'); return; }
  editingSlot = k;
  testingCreation = null;
  show('editor');
  if (!editor) setupEditor();
  if (reload || editor!.level?.id !== level.id) editor!.load(level);
  // al abrir la pantalla el lienzo aún no tiene tamaño: se encaja en el siguiente fotograma
  requestAnimationFrame(() => editor!.fit());
  ($('editor-name') as HTMLInputElement).value = level.name;
  ($('editor-name') as HTMLInputElement).placeholder = t('creator.defaultName', { n: k + 1 });
  syncEditorUi();
}

function saveEditor() {
  if (!editor) return;
  const name = ($('editor-name') as HTMLInputElement).value.slice(0, 24);
  save.creations[editingSlot] = { ...structuredClone(editor.level), name };
  store();
}

// ------------------------------------------------------------------ bloques del creador (en 3D)

/** Últimos bloques usados, para cambiar rápido sin abrir el selector. */
let recentBlocks: string[] = ['0', '#', '.', 'C', 'P', 'T', 'n', 'F'];
const RECENT_MAX = 8;
let blockSpinPause = 0;
const blockCenter = new THREE.Vector3(2.5, 0.25, 2.5);
let blockPanelW = 420;
let previewBefore: typeof preview | null = null;
const blockName = (ch: string) => t(`creator.tiles.${TILE_IDS[ch]}`);

/** Miniatura 3D de un bloque (la salida se enseña con el propio limo). */
function blockThumb(ch: string): string | null {
  if (!thumbs) return null;
  return ch === 'P' ? thumbs.slime(save.look.color, save.look) : thumbs.tile(ch, blockStage(ch));
}

/** Rellena las miniaturas poco a poco (unos milisegundos por fotograma) para no congelar la pantalla. */
function fillBlockThumbs(queue: [HTMLImageElement, string][]) {
  let k = 0;
  const step = () => {
    const end = performance.now() + 12;
    while (k < queue.length && performance.now() < end) {
      const [img, ch] = queue[k++];
      const src = blockThumb(ch);
      if (!src) continue;
      img.src = src;
      img.parentElement?.classList.remove('loading');
    }
    if (k < queue.length) setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

function blockChip(ch: string, queue: [HTMLImageElement, string][], onPick: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip thumb-chip loading';
  b.dataset.tile = ch;
  b.setAttribute('aria-label', blockName(ch));
  b.title = blockName(ch);
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  b.appendChild(img);
  queue.push([img, ch]);
  b.addEventListener('click', onPick);
  return b;
}

function addRecent(ch: string) {
  recentBlocks = [ch, ...recentBlocks.filter((c) => c !== ch)].slice(0, RECENT_MAX);
}

/** Lado del editor: el bloque con el que se pinta y los recientes. */
function renderEditorBlocks() {
  const row = $('editor-recent');
  row.innerHTML = '';
  const queue: [HTMLImageElement, string][] = [];
  for (const ch of recentBlocks) {
    row.appendChild(blockChip(ch, queue, () => {
      sfx.click();
      editor!.brush = ch;
      editor!.tool = 'paint';
      syncEditorUi();
    }));
  }
  fillBlockThumbs(queue);
}

function syncEditorBlocks() {
  if (!editor) return;
  if ($('editor-recent').childElementCount !== recentBlocks.length) renderEditorBlocks();
  const img = $<HTMLImageElement>('editor-block-img');
  if (img.dataset.tile !== editor.brush) {
    const src = blockThumb(editor.brush);
    if (src) { img.src = src; img.dataset.tile = editor.brush; }
  }
  $('btn-editor-blocks').setAttribute('aria-label', `${t('creator.blocks')}: ${blockName(editor.brush)}`);
  $('editor-recent').querySelectorAll<HTMLButtonElement>('[data-tile]').forEach((b) =>
    b.setAttribute('aria-pressed', String(editor!.tool === 'paint' && b.dataset.tile === editor!.brush)));
}

/** Selector de bloques por tipos, con el bloque elegido girando en 3D (como los rasgos de Mi limo). */
function openBlockPicker() {
  if (!editor || !assets) return;
  saveEditor();
  void assets.loadBiome('stone').then(() => {
    if (currentScreen !== 'editor') return;
    if (mode === 'preview') closePreview3d(false);
    previewBefore = { ...preview };
    renderBlockPicker();
    show('blocks');
    blockPanelW = document.querySelector('#screen-blocks .side-panel')!.getBoundingClientRect().width;
    showBlock(editor!.brush);
    $('blocks-options').querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'center' });
  });
}

function renderBlockPicker() {
  const root = $('blocks-options');
  root.innerHTML = '';
  const queue: [HTMLImageElement, string][] = [];
  for (const g of BLOCK_GROUPS) {
    const label = document.createElement('p');
    label.className = 'panel-label';
    label.textContent = t(`creator.groups.${g.id}`);
    const row = document.createElement('div');
    row.className = 'chip-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', label.textContent);
    for (const ch of g.tiles) {
      const b = blockChip(ch, queue, () => {
        sfx.click();
        editor!.brush = ch;
        editor!.tool = 'paint';
        addRecent(ch);
        root.querySelectorAll<HTMLButtonElement>('[data-tile]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tile === ch)));
        showBlock(ch);
      });
      b.setAttribute('aria-pressed', String(ch === editor!.brush));
      row.appendChild(b);
    }
    root.append(label, row);
  }
  fillBlockThumbs(queue);
}

/** Pone el bloque en su escenario pequeño y la cámara a girar a su alrededor. */
function showBlock(ch: string) {
  // un solo cubo, como en su miniatura
  loadLevel(blockStage(ch), 'stone', true);
  mode = 'preview';
  if (room) room.visible = false;
  world!.group.visible = true;
  if (ch === '.') world!.group.add(voidCube());
  // solo la salida enseña el limo
  slime!.group.visible = ch === 'P';
  renderer.clippingPlanes = BLOCK_CLIP;
  const box = blockBounds(world!.group);
  if (ch === 'P') box.max.y += 0.7;
  box.getCenter(blockCenter);
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  preview.dist = THREE.MathUtils.clamp(radius * 3.6, 3, 8);
  preview.zoom = 1;
  preview.pitch = 0.55;
  camPos.set(0, 0, 0);
  const group = BLOCK_GROUPS.find((g) => g.tiles.includes(ch));
  $('block-group').textContent = group ? t(`creator.groups.${group.id}`) : '';
  $('block-name').textContent = blockName(ch);
}

function closeBlockPicker() {
  if (currentScreen !== 'blocks') return;
  if (previewBefore) Object.assign(preview, previewBefore);
  previewBefore = null;
  renderer.clippingPlanes = [];
  addRecent(editor!.brush);
  toMenuScene();
  show('editor');
  renderEditorBlocks();
  syncEditorUi();
  requestAnimationFrame(() => editor!.fit());
}

/** Vista 3D del nivel que se está creando: el nivel de verdad, sin jugar, girando la cámara alrededor. */
function openPreview3d() {
  if (!editor || !assets) return;
  saveEditor();
  const level = structuredClone(editor.level);
  void assets.loadBiome('stone').then(() => {
    if (currentScreen !== 'editor') return;
    loadLevel(level);
    mode = 'preview';
    if (room) room.visible = false;
    world!.group.visible = true;
    let top = 0;
    for (const c of world!.cells) if (c.top !== -Infinity && c.kind !== 'wall' && c.kind !== 'rail') top = Math.max(top, c.base);
    camTarget.set(editor!.width / 2, top / 2, editor!.depth / 2);
    preview.dist = Math.max(8, Math.max(editor!.width, editor!.depth) * 0.95);
    camPos.set(0, 0, 0);
    $('screen-editor').classList.add('view3d');
    $('editor-3d').hidden = false;
    $('btn-editor-3d').setAttribute('aria-pressed', 'true');
  });
}

/** Vuelve al plano (restore: vuelve también la habitación del menú detrás del editor). */
function closePreview3d(restore = true) {
  if (mode !== 'preview') return;
  $('screen-editor').classList.remove('view3d');
  $('editor-3d').hidden = true;
  $('btn-editor-3d').setAttribute('aria-pressed', 'false');
  if (restore) toMenuScene();
}

function syncEditorUi() {
  if (!editor) return;
  $('editor-floor').textContent = editor.floor === null ? t('creator.allFloors') : String(editor.floor);
  $('editor-story').textContent = `${editor.story + 1}/${editor.stories}`;
  $('btn-editor-remove-story').hidden = editor.story === 0;
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === editor!.tool)));
  syncEditorBlocks();
  $('editor-w').textContent = String(editor.width);
  $('editor-d').textContent = String(editor.depth);
  ($('btn-editor-undo') as HTMLButtonElement).disabled = !editor.canUndo;
}

function setupEditor() {
  editor = new LevelEditor($('editor-canvas') as HTMLCanvasElement);
  editor.onChange = () => { saveEditor(); syncEditorUi(); };
  $('btn-editor-blocks').addEventListener('click', () => { sfx.click(); openBlockPicker(); });
  $('btn-blocks-back').addEventListener('click', () => { sfx.click(); closeBlockPicker(); });
  $('btn-block-use').addEventListener('click', () => { sfx.click(); closeBlockPicker(); });
  // arrastrar sobre la escena gira el bloque
  {
    const scr = $('screen-blocks');
    let drag: { id: number; x: number } | null = null;
    scr.addEventListener('pointerdown', (e) => {
      if (e.target !== scr) return;
      drag = { id: e.pointerId, x: e.clientX };
      scr.setPointerCapture(e.pointerId);
      blockSpinPause = performance.now() + 2500;
    });
    scr.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      preview.yaw -= (e.clientX - drag.x) * 0.012;
      drag.x = e.clientX;
      blockSpinPause = performance.now() + 2500;
      markBusy();
    });
    const end = () => { drag = null; };
    scr.addEventListener('pointerup', end);
    scr.addEventListener('pointercancel', end);
  }
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.addEventListener('click', () => {
    sfx.click();
    editor!.tool = b.dataset.tool as EditorTool;
    syncEditorUi();
  }));
  // tamaño: un toque cambia 1; manteniendo pulsado sigue cambiando cada vez más deprisa
  document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((b) => {
    const [axis, sign] = [b.dataset.size![0], b.dataset.size![1] === '+' ? 1 : -1];
    const step = () => { editor!.resize(axis === 'w' ? sign : 0, axis === 'd' ? sign : 0); syncEditorUi(); };
    let timer = 0;
    const stop = () => { clearTimeout(timer); timer = 0; };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sfx.click();
      step();
      let delay = 380;
      const again = () => { step(); delay = Math.max(50, delay * 0.8); timer = window.setTimeout(again, delay); };
      timer = window.setTimeout(again, delay);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) b.addEventListener(ev, stop);
    // teclado
    b.addEventListener('click', (e) => { if (e.detail === 0) { sfx.click(); step(); } });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach((b) => b.addEventListener('click', () => {
    sfx.click();
    // orden: Todos, 0, 1 ... 9
    const cur = editor!.floor === null ? -1 : editor!.floor;
    const next = Math.max(-1, Math.min(9, cur + (b.dataset.floor === '+' ? 1 : -1)));
    editor!.floor = next < 0 ? null : next;
    editor!.draw();
    syncEditorUi();
  }));
  // plantas: subir más allá de la última añade una nueva (hasta 3)
  let removeArmed = 0;
  document.querySelectorAll<HTMLButtonElement>('[data-story]').forEach((b) => b.addEventListener('click', () => {
    sfx.click();
    const up = b.dataset.story === '+';
    if (up && editor!.story === editor!.stories - 1) {
      if (editor!.addStory()) toast(t('creator.storyAdded', { n: editor!.story + 1 }), 2200);
      else toast(t('creator.storyMax'), 2200);
    } else {
      editor!.story = Math.max(0, Math.min(editor!.stories - 1, editor!.story + (up ? 1 : -1)));
      editor!.draw();
    }
    syncEditorUi();
  }));
  $('btn-editor-remove-story').addEventListener('click', () => {
    sfx.click();
    if (performance.now() > removeArmed) {
      removeArmed = performance.now() + 3500;
      toast(t('creator.storyRemoveConfirm', { n: editor!.story + 1 }), 3200);
      return;
    }
    removeArmed = 0;
    editor!.removeStory();
    syncEditorUi();
  });
  $('btn-editor-3d').addEventListener('click', () => {
    sfx.click();
    if (mode === 'preview') closePreview3d();
    else openPreview3d();
  });
  // vista 3D: arrastrar gira e inclina; rueda o pellizco acerca
  {
    const layer = $('editor-3d');
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    layer.addEventListener('pointerdown', (e) => { layer.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
    layer.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [c, d] = [...pts.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y), after = Math.hypot(c.x - d.x, c.y - d.y);
        if (pinch && before > 10) preview.zoom = Math.max(0.3, Math.min(2.5, preview.zoom * (before / after)));
        pinch = 1;
        return;
      }
      preview.yaw -= (e.clientX - p.x) * 0.008;
      preview.pitch = Math.max(0.1, Math.min(1.5, preview.pitch + (e.clientY - p.y) * 0.006));
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    for (const ev of ['pointerup', 'pointercancel'] as const) layer.addEventListener(ev, (e) => pts.delete(e.pointerId));
    layer.addEventListener('wheel', (e) => { e.preventDefault(); preview.zoom = Math.max(0.3, Math.min(2.5, preview.zoom * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); }, { passive: false });
  }
  $('btn-editor-undo').addEventListener('click', () => { sfx.click(); editor!.undo(); syncEditorUi(); });
  $('btn-editor-fit').addEventListener('click', () => { sfx.click(); editor!.fit(); });
  $('editor-name').addEventListener('input', () => saveEditor());
  $('btn-editor-back').addEventListener('click', () => { sfx.click(); saveEditor(); closePreview3d(); openScreen('creator'); rewardsNow('creator'); });
  $('btn-editor-test').addEventListener('click', () => { sfx.click(); saveEditor(); playCreation(editingSlot); });
  addEventListener('keydown', (e) => {
    if (currentScreen !== 'editor' || document.activeElement === $('editor-name')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); editor!.undo(); syncEditorUi(); }
  });
  void EDITOR_LIMITS;
}

/** Fondo del menú: el limo en su habitación, rodeado de sus coleccionables. */
function toMenuScene() {
  mode = 'menu';
  store(); // contadores de la partida
  if (!assets) return;
  loadLevel(MENU_STAGE);
  world!.group.visible = false; // el suelo lo pone la habitación; el nivel solo sostiene al limo
  refreshRoom();
  room!.visible = true;
  room!.position.copy(world!.start);
  camTarget.copy(world!.start);
}

// ------------------------------------------------------------------ HUD

const hudCache = { alive: -1, seconds: -1, coins: -1, state: '', stateSec: -1 };
const hudEls = {
  pct: $('life-pct'), timer: $('timer'), coins: $('coins-count'), coinChip: $('hud-coins'),
  life: document.querySelector('.hud-chip.life') as HTMLElement,
  stateChip: $('hud-state'), stateIco: $('state-ico'), stateSec: $('state-sec'),
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
    const changed = st !== hudCache.state;
    hudCache.state = st;
    hudCache.stateSec = sec;
    hudEls.stateChip.hidden = st === 'normal';
    if (changed) updateGaugeColors();
    if (st !== 'normal') {
      const chip = hudEls.stateChip;
      chip.className = `state-badge ${st}`;
      if (changed) bump(chip, 'bump');
      hudEls.stateIco.innerHTML = STATE_ICONS[st];
      const total = st === 'burning' ? BURN_TIME : st === 'frozen' ? FREEZE_TIME : 0;
      chip.style.setProperty('--p', total ? String(Math.max(0, slime.stateT / total)) : '1');
      hudEls.stateSec.textContent = total ? String(sec) : '';
      chip.setAttribute('aria-label', st === 'oiled' ? t('hud.oiled') : t(`hud.${st}`, { s: `${sec}s` }));
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
    store();
  }
  if (!win) { save.stats.fails++; store(); }
  {
    // primero los logros: algunos coleccionables se consiguen con ellos
    const achievements = grantAchievements();
    pendingRewards.push(...grantCollectibles().map((id) => ({ kind: 'collectible' as const, id })));
    pendingRewards.push(...achievements.map((id) => ({ kind: 'achievement' as const, id })));
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
  $('btn-result-back').textContent = testingCreation !== null ? t('creator.backToEditor') : chapter ? t('result.chapter') : t('result.exit');
  if (!win) { sfx.lose(); buzz(200); }
  show('result');
}

/** Enseña uno a uno los coleccionables y logros recién ganados antes de seguir. */
function afterReward(then: () => void) {
  const item = pendingRewards.shift();
  if (!item) { then(); return; }
  rewardThen = then;
  const visual = $('reward-visual');
  visual.replaceChildren();
  const image = (src: string | null, cls: string) => {
    if (!src) return;
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.className = cls;
    visual.appendChild(img);
  };
  if (item.kind === 'look') {
    const [key, opt] = item.id.split(':') as [LookKey, string];
    $('reward-label').textContent = t('myslime.bought');
    $('reward-title').textContent = `${t(`myslime.${key}`)}: ${t(`myslime.${key}Opt.${opt}`)}`;
    $('reward-note').textContent = t('myslime.boughtNote');
    image(lookPreview(key, opt), `reward-look ${key}`);
  } else if (item.kind === 'collectible') {
    $('reward-label').textContent = t('collection.new');
    $('reward-title').textContent = t(`collectibles.${item.id}`);
    $('reward-note').textContent = t('collection.place');
    image(thumbs?.model(item.id) ?? null, 'reward-model');
  } else {
    const a = ACHIEVEMENTS.find((x) => x.id === item.id)!;
    const reward = achievementRewardText(a.id);
    $('reward-label').textContent = t('achievements.new');
    $('reward-title').textContent = achName(a);
    $('reward-note').textContent = reward ? t('achievements.reward', { item: reward }) : t('achievements.noReward');
    visual.appendChild(patchBadge(a, true, true));
    const options = achievementRewardOptions(a.id);
    if (options.length) {
      const plus = document.createElement('span');
      plus.className = 'reward-plus';
      plus.textContent = '+';
      visual.appendChild(plus);
      for (const [key, opt] of options) image(lookPreview(key, opt), `reward-look ${key}${options.length > 1 ? ' small' : ''}`);
    }
  }
  sfx.win();
  buzz([30, 60, 30]);
  show('reward');
}
$('btn-reward-ok').addEventListener('click', () => {
  sfx.click();
  const then = rewardThen;
  rewardThen = null;
  if (then) afterReward(then);
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
    const secretCell = hasGem ? (s?.secret ? gemIco(gemOfChapter(ch)) : '—') : '';
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
  if (import.meta.env.DEV && devDrive) [input.tiltX, input.tiltZ] = devDrive();
  // el mando va en ejes de pantalla: se gira con la cámara para que "arriba" sea siempre "hacia el fondo"
  const cs = Math.cos(camYaw), sn = Math.sin(camYaw);
  moveX = input.tiltX * cs + input.tiltZ * sn;
  moveZ = -input.tiltX * sn + input.tiltZ * cs;
  slime.step(dt, moveX, moveZ, input.squeeze);
  world.update(dt, slime.switchCounts);
  for (const e of world.events) {
    if (e.type === 'collapse') { sfx.crumble(); buzz(30); fx.splat(e.x, e.y, e.z); }
    else if (e.melt) { sfx.sizzle(); fx.steam(e.x, e.y + 0.3, e.z); }
    else { sfx.crack(); buzz(12); }
  }
  world.events.length = 0;
  elapsed += dt;

  for (const e of slime.events) {
    switch (e.type) {
      case 'fall': sfx.fall(); break;
      case 'evaporate': sfx.sizzle(); fx.steam(e.x, e.y, e.z); break;
      case 'pop': sfx.pop(); fx.splat(e.x, e.y, e.z); buzz(12); break;
      case 'pad': sfx.pad(); fx.splat(e.x, e.y, e.z); save.stats.jumps++; break;
      case 'board': sfx.board(); fx.splat(e.x, e.y, e.z); buzz(20); save.stats.rides++; break;
      case 'unboard': sfx.unboard(); fx.splat(e.x, e.y, e.z); buzz(15); break;
      case 'load': sfx.board(); fx.splat(e.x, e.y, e.z); buzz(20); break;
      case 'shoot': sfx.cannon(); fx.splat(e.x, e.y, e.z); buzz(45); save.stats.shots++; break;
      case 'land': sfx.land(); buzz(10); break;
      case 'merge': sfx.merge(); if (input.squeeze) save.stats.squeezes++; break;
      case 'dizzy': sfx.dizzy(); buzz([20, 40, 20]); save.stats.dizzy++; break;
      case 'hole': save.stats.holes++; break;
      case 'coin': sfx.coin(); fx.sparkle(e.x, e.y + 0.4, e.z); buzz(15); break;
      case 'cut': sfx.cut(); buzz(8); break;
      case 'oil': sfx.oil(); fx.sparkle(e.x, e.y + 0.3, e.z, 0xf5a524); break;
      case 'gem':
        sfx.gem();
        for (let k = 0; k < 3; k++) fx.sparkle(e.x, e.y + 0.3 + k * 0.25, e.z, 0xc4b5fd);
        toast(t('toast.secret'));
        buzz([20, 40, 20]);
        break;
      case 'burn':
        save.stats.burns++;
        sfx.sizzle();
        for (let k = 0; k < 3; k++) {
          const ex = Math.floor(e.x), ez = Math.floor(e.z);
          fx.steam(e.x, world.cell(ex, ez, world.storyAt(ex, ez, slime.groups[0]?.cy ?? 0))!.base + 0.4 + k * 0.3, e.z);
        }
        buzz(25);
        break;
      case 'state': {
        const key = STATE_TOASTS[e.to] ?? (e.from === 'frozen' ? 'toast.thaw' : e.from === 'burning' ? 'toast.extinguish' : null);
        if (key) toast(t(key), 2600);
        if (e.to === 'burning') { sfx.ignite(); buzz([15, 30, 15]); }
        if (e.to === 'frozen') { sfx.freeze(); buzz(40); save.stats.freezes++; }
        if (e.from === 'frozen' && e.to === 'normal') sfx.thaw();
        break;
      }
    }
  }
  slime.events.length = 0;
  if (input.squeeze && slime.groups.length > 1) sfx.squeeze();

  // efectos continuos del estado
  if (slime.state === 'burning') {
    for (let k = 0; k < 2; k++) if (Math.random() < 0.8 && slime.randomParticle(tmpFx)) fx.flame(tmpFx.x, tmpFx.y, tmpFx.z);
  }
  // rastro: el aceite lo pringa todo; en llamas deja quemaduras con ascuas
  if (slime.state === 'oiled' || slime.state === 'burning') {
    trailT += dt;
    for (; trailT > 0.045; trailT -= 0.045) {
      if (slime.randomGrounded(tmpFx)) trail.stamp(slime.state === 'oiled' ? 'oil' : 'fire', tmpFx.x, tmpFx.y, tmpFx.z);
    }
  } else trailT = 0;
  if (Math.random() < dt * 7 && trail.randomEmber(tmpFx)) fx.spark(tmpFx.x, tmpFx.y, tmpFx.z);
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
  if (mode !== 'menu' && slime.center(tmpCenter)) {
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
  if (mode === 'menu' && room) {
    // habitación: plano fijo de frente con un vaivén suave; en Colección se va hacia las estanterías
    // y, al elegir una pieza, se acerca dejándola a la izquierda para que el panel no la tape
    menuT += dt;
    const o = room.position;
    const slot = menuFocus ? room.getObjectByName(`slot_${menuFocus}`) : null;
    if (slot) {
      const place = COLLECTIBLES.find((c) => c.id === menuFocus)?.place;
      const shown = showcase.find((s) => s.userData.colId === menuFocus);
      // de frente a la pieza, alejándose de las paredes que tiene cerca (las de los lados se miran desde el centro),
      // a la distancia justa para su tamaño y algo por encima
      slotView(slot.position, viewDir);
      const radius: number = shown?.userData.radius ?? 0.4;
      const dist = THREE.MathUtils.clamp(radius * (place === 'wall' || place === 'floor' ? 3.2 : 3.6), 1, 3.2);
      menuLook.copy(shown?.userData.center ?? slot.position).add(o);
      camWant.set(menuLook.x + viewDir.x * dist, menuLook.y + dist * 0.32, menuLook.z + viewDir.z * dist);
      camWant.x = o.x + THREE.MathUtils.clamp(camWant.x - o.x, -ROOM_SIDE_X + 0.4, ROOM_SIDE_X - 0.4);
      camWant.z = o.z + THREE.MathUtils.clamp(camWant.z - o.z, ROOM_BACK_Z + 0.4, ROOM_FRONT_Z - 0.4);
      // la pieza queda en el centro del hueco libre a la izquierda del panel
      const panel = Math.min(420, innerWidth) / Math.max(1, innerWidth);
      const shift = panel * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * dist;
      menuLook.x += viewDir.z * shift;
      menuLook.z -= viewDir.x * shift;
    } else if (currentScreen === 'achievements') {
      // gira hacia un tablón (derecho: logros 0-29, izquierdo: 30-59); al elegir un logro se acerca a su parche
      const k = ACHIEVEMENTS.findIndex((a) => a.id === achFocus);
      const left = k >= 30;
      const target = room.getObjectByName(k >= 0 ? `ach_slot_${k}` : 'board_view_right');
      const p = target ? target.position : menuLook.set(4.4, 2.4, 0.2);
      const near = k >= 0;
      const side = left ? -1 : 1;
      // de lejos, todo el tablón ocupa la mitad izquierda de la pantalla (mirada paralela, desplazada a la derecha)
      // de cerca, el parche arriba a la izquierda y su ficha debajo
      menuLook.set(o.x + p.x, o.y + p.y - (near ? 0.3 : 0), o.z + p.z + (near ? 0.5 * side : 2.35));
      camWant.set(o.x + p.x - side * (near ? 1.9 : 4.45), o.y + p.y + 0.05, o.z + p.z + (near ? 0.5 * side : 2.35));
    } else if (currentScreen === 'myslime') {
      // de cerca y de frente, con el limo a la izquierda del panel
      menuLook.set(o.x + 0.8, o.y + 0.45, o.z);
      camWant.set(o.x + 0.15, o.y + 1.3, o.z + 2.6);
    } else if (currentScreen === 'collection') {
      menuLook.set(o.x + 1.5, o.y + 0.9, o.z - 1.6);
      camWant.set(o.x + 0.4 + Math.sin(menuT * 0.2) * 0.3, o.y + 2.4, o.z + 3.4);
    } else {
      // el limo abajo a la izquierda, fuera de los botones (derecha) y del logo (arriba a la izquierda)
      menuLook.set(o.x + 1.35, o.y + 0.8, o.z - 0.6);
      camWant.set(o.x + 0.75 + Math.sin(menuT * 0.25) * 0.2, o.y + 2.4, o.z + 3.9);
    }
    // plano nuevo (otra pantalla u otra pieza): viaje con arranque y frenada suaves, algo en arco
    const shot = `${currentScreen}|${menuFocus ?? ''}|${achFocus ?? ''}`;
    if (shot !== menuShot) {
      menuShot = shot;
      if (camPos.lengthSq() > 0) {
        shotFromPos.copy(camPos);
        shotFromLook.copy(camTarget);
        shotT = 0;
        shotDur = THREE.MathUtils.clamp(camPos.distanceTo(camWant) / 2.2, 0.9, 1.8);
      }
    }
    if (shotT >= shotDur) camTarget.lerp(menuLook, 1 - Math.exp(-dt * 3));
  } else {
    if (mode === 'play') {
      if (input.mode === 'gyro') {
        // giroscopio: la cámara sigue al limo desde su posición de siempre
        camYaw = Math.atan2(Math.sin(camYaw), Math.cos(camYaw));
        const back = 1 - Math.exp(-dt * 2);
        camYaw -= camYaw * back;
        camPitch += (DEFAULT_PITCH - camPitch) * back;
      } else {
        camYaw -= input.camX * CAM_YAW_SPEED * dt;
        camPitch = Math.min(CAM_PITCH_MAX, Math.max(CAM_PITCH_MIN, camPitch + input.camY * CAM_PITCH_SPEED * dt));
      }
    }
    if (mode === 'preview') {
      if (currentScreen === 'blocks') {
        if (performance.now() > blockSpinPause && !matchMedia('(prefers-reduced-motion: reduce)').matches) preview.yaw += dt * 0.35;
        // el bloque queda en el hueco libre a la izquierda del panel (y algo alto, por encima de su ficha)
        const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * preview.dist * camera.aspect;
        const shift = (blockPanelW / Math.max(1, innerWidth)) * half;
        camTarget.set(blockCenter.x + Math.cos(preview.yaw) * shift, blockCenter.y - preview.dist * 0.1, blockCenter.z - Math.sin(preview.yaw) * shift);
        markBusy(250);
      }
      camYaw = preview.yaw;
      camPitch = preview.pitch;
    }
    const dist = mode === 'preview' ? preview.dist * preview.zoom : (camera.aspect < 1 ? 1.5 : 1) * camZoom * CAM_DIST;
    const flat = Math.cos(camPitch) * dist;
    camWant.set(camTarget.x + Math.sin(camYaw) * flat, camTarget.y + Math.sin(camPitch) * dist, camTarget.z + Math.cos(camYaw) * flat);
  }
  if (camPos.lengthSq() === 0) camPos.copy(camWant);
  else if (mode === 'menu' && shotT < shotDur) {
    shotT = Math.min(shotDur, shotT + dt);
    const e = easeInOutCubic(shotT / shotDur);
    camPos.lerpVectors(shotFromPos, camWant, e);
    camPos.y += Math.sin(Math.PI * e) * Math.min(0.5, shotFromPos.distanceTo(camWant) * 0.08);
    camTarget.lerpVectors(shotFromLook, menuLook, e);
    markBusy(250);
  } else camPos.lerp(camWant, 1 - Math.exp(-dt * (mode === 'menu' ? 2 : 5)));
  // la cámara del menú aún viaja (a los logros, a Mi limo...): movimiento fluido
  if (camPos.distanceToSquared(camWant) > 4e-4) markBusy(250);
  camera.position.copy(camPos);
  const lead = mode === 'menu' ? 0 : 0.3;
  camera.lookAt(camTarget.x - Math.sin(camYaw) * lead, camTarget.y, camTarget.z - Math.cos(camYaw) * lead);
  // la cara del limo se orienta hacia donde está de verdad la cámara
  const offX = camPos.x - camTarget.x, offZ = camPos.z - camTarget.z;
  slime.camYaw = mode === 'menu' ? 0 : Math.atan2(offX, offZ);
  slime.camPitch = mode === 'menu' ? DEFAULT_PITCH : Math.atan2(camPos.y - camTarget.y, Math.hypot(offX, offZ));

  // inclinación del escenario: suave con el mando a medias y muy marcada a fondo
  const mag2 = input.tiltX * input.tiltX + input.tiltZ * input.tiltZ;
  const sway = mode !== 'play' ? 0 : 0.04 + 0.3 * mag2;
  tiltRoot.position.copy(camTarget);
  content.position.copy(camTarget).negate();
  const tk = 1 - Math.exp(-dt * 7);
  tiltRoot.rotation.x += (moveZ * sway - tiltRoot.rotation.x) * tk;
  tiltRoot.rotation.z += (-moveX * sway - tiltRoot.rotation.z) * tk;

  // ambiente del modo (transición suave al entrar o salir del menú)
  const look = mode === 'menu' ? LIGHTING.menu : LIGHTING.play;
  const lk = 1 - Math.exp(-dt * 3);
  hemi.intensity += (look.hemi - hemi.intensity) * lk;
  sun.intensity += (look.sun - sun.intensity) * lk;
  rim.intensity += (look.rim - rim.intensity) * lk;
  scene.environmentIntensity += (look.env - scene.environmentIntensity) * lk;
  sunOffset.lerp(look.sunOffset, lk);
  // el foco de sombras avanza a saltos de un texel: los bordes de las sombras no tiemblan al mover la cámara
  sunDir.copy(sunOffset).normalize();
  sunRight.crossVectors(WORLD_UP, sunDir).normalize();
  sunUp.crossVectors(sunDir, sunRight);
  const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
  const sa = Math.round(camTarget.dot(sunRight) / texel) * texel;
  const sb = Math.round(camTarget.dot(sunUp) / texel) * texel;
  sun.target.position.copy(sunRight).multiplyScalar(sa).addScaledVector(sunUp, sb).addScaledVector(sunDir, camTarget.dot(sunDir));
  sun.position.copy(sun.target.position).add(sunOffset);
  rim.position.set(camTarget.x - 6, camTarget.y + 5, camTarget.z - 9);
  rim.target.position.copy(camTarget);
}

const clock = new THREE.Clock();
const FIXED = 1 / 60;

/** Limo sin mando (menú, victoria): también a paso fijo, antes daba un paso por imagen dibujada. */
function stepIdle(dt: number) {
  acc += dt;
  let steps = 0;
  while (acc >= FIXED && steps < 3) {
    slime!.step(FIXED, 0, 0);
    acc -= FIXED;
    steps++;
  }
  if (steps === 3) acc = 0;
  slime!.events.length = 0;
}

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
    stepIdle(dt);
    if (winT > 1.5) finish(true);
  } else if (mode === 'preview' && world) {
    world.update(dt, { A: 0, B: 0 });
  } else if (mode === 'menu' && world && slime) {
    for (const item of showcase) if (item.userData.spin) item.rotation.y = menuT * 0.7 + item.userData.phase;
    updatePatchGlow(dt);
    world.update(dt, slime.switchCounts);
    stepIdle(dt);
  } else if (world) {
    world.update(dt * 0.3, slime?.switchCounts ?? { A: 0, B: 0 });
  }
  const alpha = mode === 'play' || mode === 'menu' || mode === 'winning' ? Math.min(acc / FIXED, 1) : 1;
  fx.update(dt);
  trail.update(mode === 'play' || mode === 'winning' ? dt : dt * 0.3);
  updateCamera(dt);
  // varias plantas: jugando se ocultan las de encima de la del limo (en la vista 3D del creador se ven todas)
  if (world && world.stories > 1) {
    const playing = mode === 'play' || mode === 'winning' || mode === 'pause' || mode === 'result';
    world.setViewStory(playing ? world.bandAt(camTarget.y + 0.5) : -1);
  }
  updateLights(dt);
  abyss.group.visible = mode !== 'menu';
  if (abyss.group.visible) abyss.update(dt, camTarget);
  slime?.render(dt, alpha, input.tiltX, input.tiltZ);
  if (!$('hud').hidden && slime && world) {
    const pct = slime.aliveCount / slime.n;
    gauge.update(dt, pct, input.tiltX, pct < 0.25);
  }
  renderer.render(scene, camera);
}

/*
  Imágenes por segundo según lo que pasa (la gráfica descansa cuando no hace falta más):
    jugando o ganando → 60 · menús quietos, pausa y resultados → 30 (15 con la ventana sin foco).
  Interactuar o mover la cámara del menú vuelve a 60 un momento. Nunca más de ~60 (monitores de 120-240 Hz).
*/
let lastFrame = -Infinity;
let busyUntil = 0;
const markBusy = (ms = 1500) => { busyUntil = Math.max(busyUntil, performance.now() + ms); };
for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const) {
  addEventListener(ev, () => markBusy(), { passive: true, capture: true });
}
function targetFps(now: number) {
  // jugando nunca se baja (en algunos navegadores hasFocus falla dentro de apps o marcos)
  if (mode === 'play' || mode === 'winning') return softwareGpu ? 30 : 60;
  // el editor tapa el 3D entero: basta con muy pocas imágenes (salvo en su vista 3D)
  if (mode === 'preview') return softwareGpu ? 30 : 60;
  if (currentScreen === 'editor') return 5;
  if (now < busyUntil) return softwareGpu ? 30 : 60;
  if (softwareGpu) return document.hasFocus() ? 20 : 10;
  return document.hasFocus() ? 30 : 15;
}
renderer.setAnimationLoop((now: number) => {
  if (now - lastFrame < (1000 / targetFps(now)) * 0.9) return;
  lastFrame = now;
  const dt = Math.min(clock.getDelta(), 0.1);
  frame(dt);
  if (mode === 'play') watchQuality(dt);
});

if (import.meta.env.DEV) {
  void import('./dev-autopilot');
  // depuración: avanzar la simulación sin requestAnimationFrame
  Object.assign(window, {
    __slime: {
      advance(seconds: number) { for (let s = 0; s < seconds; s += FIXED) frame(FIXED); },
      start: (c: number, k: number) => startFloor(CHAPTERS[c], k),
      practice: () => startLevel(PRACTICE, null, 0),
      play: (level: LevelData) => startLevel(level, null, 0),
      chapters: () => CHAPTERS,
      finish: (win: boolean) => finish(win),
      breakdown: () => showBreakdown(CHAPTERS[0]),
      zoom: (k: number) => { camZoom = k; camPos.set(0, 0, 0); },
      hurt: () => { const g = slime?.groups[0]; if (g) slime!.hurts.push({ x: g.cx, z: g.cz }); },
      quality: () => ({ quality, fps: Math.round(1 / frameAvg), gpu: gpuName, software: softwareGpu, ratio: renderer.getPixelRatio() }),
      three: () => ({ renderer, scene, camera, sun, content, slime, applyQuality }),
      slime: () => slime,
      world: () => world,
      save: () => save,
      open: (id: ScreenId) => openScreen(id),
      collect: (ids: string[] = COLLECTIBLES.map((c) => c.id)) => { save.collectibles = ids; store(); if (mode === 'menu') refreshRoom(); },
      focus: (id: string | null) => { menuFocus = id; },
      cam: (yaw: number, pitch = DEFAULT_PITCH) => { camYaw = yaw; camPitch = pitch; },
      drive: (fn: (() => [number, number]) | null) => { devDrive = fn; },
      /** imagen para compartir el enlace (1200x630): el limo en su habitación y el título */
      shareImage: (w = 1200, h = 630) => {
        renderer.setPixelRatio(1);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        frame(1 / 60);
        if (room) {
          const o = room.position;
          camera.position.set(o.x - 1.05, o.y + 1.15, o.z + 2.7);
          camera.lookAt(o.x - 0.8, o.y + 0.5, o.z);
          renderer.render(scene, camera);
        }
        const shot = document.createElement('canvas');
        shot.width = w;
        shot.height = h;
        const g = shot.getContext('2d')!;
        g.drawImage(renderer.domElement, 0, 0, w, h);
        const shade = g.createLinearGradient(0, 0, w * 0.62, 0);
        shade.addColorStop(0, 'rgba(12, 8, 30, 0.7)');
        shade.addColorStop(1, 'rgba(12, 8, 30, 0)');
        g.fillStyle = shade;
        g.fillRect(0, 0, w, h);
        drawLogo(g, 64, 118, 172);
        const url = shot.toDataURL('image/jpeg', 0.9);
        applyQuality(quality);
        return url;
      },
      run: (seconds: number) => { for (let s = 0; s < seconds && mode === 'play'; s += FIXED) frame(FIXED); return mode; },
      state: () => ({ mode, alive: slime?.aliveCount, slimeState: slime?.state, groups: slime?.groups.map((g) => g.ids.length), coins: world && `${world.coinsCollected}/${world.coinsTotal}`, lead: slime?.groups[0] && { x: slime.groups[0].cx.toFixed(2), y: slime.groups[0].cy.toFixed(2), z: slime.groups[0].cz.toFixed(2) } }),
    },
  });
}

// ------------------------------------------------------------------ arranque

applyDom();
decorateLogo(document.querySelector<SVGSVGElement>('.logo-art')!);
grantCollectibles(); // progreso anterior a los coleccionables
grantAchievements();
applyLook();
show('main');
// temblor del logo de vez en cuando, no continuo
{
  const logo = document.querySelector<HTMLElement>('.logo')!;
  const wobble = () => {
    if (!$('screen-main').hidden && document.hasFocus()) {
      logo.classList.remove('wobble');
      void logo.offsetWidth;
      logo.classList.add('wobble');
    }
  };
  logo.addEventListener('animationend', () => logo.classList.remove('wobble'));
  wobble();
  setInterval(wobble, 9000);
}
// aviso fijo en el menú (un aviso de unos segundos pasaba desapercibido)
$('gpu-warning').hidden = !softwareGpu;
$('btn-gpu-warning').addEventListener('click', () => { sfx.click(); $('gpu-warning').hidden = true; });
$('load-hint').textContent = t('common.loading', { pct: 0 });
Assets.load(Math.min(4, renderer.capabilities.getMaxAnisotropy()), (p) => { $('load-hint').textContent = t('common.loading', { pct: Math.round(p * 100) }); })
  .then((a) => {
    assets = a;
    thumbs = new Thumbs(renderer, a, scene.environment);
    toMenuScene();
    $('load-hint').textContent = '';
    $<HTMLButtonElement>('btn-story').disabled = false;
  })
  .catch((err) => {
    console.error(err);
    $('load-hint').textContent = t('common.loadError');
  });

