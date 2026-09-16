"""
Genera las texturas de la mazmorra en src/textures/ (1024x1024, repetibles; cada textura cubre 2x2 casillas):
  <nombre>.jpg     color
  <nombre>_n.jpg   mapa de normales (relieve: juntas, grietas, desconchones)

Uso:
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P blender/build_textures.py

El juego saca el brillo especular del propio color (piedra clara brilla, juntas oscuras no)
y varía el tono a gran escala. Se pueden repintar a mano: mantener 1024 px, 2 casillas por lado y que repitan.
"""

import os

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(ROOT, "..", "src", "textures"))
SIZE = 1024
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith(".png"):
        os.remove(os.path.join(OUT, f))  # formato antiguo

YY, XX = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)


# ------------------------------------------------------------------ utilidades

def value_noise(cells, rng):
    g = rng.random((cells, cells)).astype(np.float32)
    t = np.arange(SIZE, dtype=np.float32) * cells / SIZE
    i0 = np.floor(t).astype(np.int32)
    f = t - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    i0 = i0 % cells
    a, b, c, d = g[i0][:, i0], g[i0][:, i1], g[i1][:, i0], g[i1][:, i1]
    fx, fy = f[None, :], f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(base, octaves, rng, gain=0.5):
    out = np.zeros((SIZE, SIZE), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        out += value_noise(base * 2 ** o, rng) * amp
        total += amp
        amp *= gain
    return out / total


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a, passes=3):
    for _ in range(passes):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0)) / 3
        a = (a + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 3
    return a


def voronoi(points):
    """Distancia al 1º y 2º punto (repetible) e índice de celda. Coordenadas en píxeles.
    Cada punto solo afecta a una ventana a su alrededor (mucho más rápido a 1024 px)."""
    d1 = np.full((SIZE, SIZE), 1e9, np.float32)
    d2 = np.full((SIZE, SIZE), 1e9, np.float32)
    cell = np.zeros((SIZE, SIZE), np.int32)
    reach = 2.6 * SIZE / max(1.0, len(points) ** 0.5)
    for k, (px, py) in enumerate(points):
        for ox in (-SIZE, 0, SIZE):
            for oy in (-SIZE, 0, SIZE):
                cx, cy = px + ox, py + oy
                x0, x1 = int(max(0, cx - reach)), int(min(SIZE, cx + reach + 1))
                y0, y1 = int(max(0, cy - reach)), int(min(SIZE, cy + reach + 1))
                if x0 >= x1 or y0 >= y1:
                    continue
                win = (slice(y0, y1), slice(x0, x1))
                d = np.hypot(XX[win] - cx, YY[win] - cy)
                a1, a2, ac = d1[win], d2[win], cell[win]
                closer = d < a1
                d2[win] = np.where(closer, a1, np.minimum(a2, d))
                cell[win] = np.where(closer, k, ac)
                d1[win] = np.where(closer, d, a1)
    return d1, d2, cell


def jittered(n, rng, jitter=0.32):
    return [((i + 0.5 + rng.uniform(-jitter, jitter)) * SIZE / n, (j + 0.5 + rng.uniform(-jitter, jitter)) * SIZE / n)
            for i in range(n) for j in range(n)]


def palette_pick(pal, n, rng, spread=0.06):
    base = np.array(pal, np.float32)[rng.integers(0, len(pal), n)]
    return np.clip(base * rng.uniform(1 - spread, 1 + spread, (n, 1)), 0, 1)


def normals_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.stack([-dx, -dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def save(name, rgb, colorspace="sRGB"):
    rgba = np.ones((SIZE, SIZE, 4), np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0, 1)
    img = bpy.data.images.new(name, SIZE, SIZE, alpha=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(OUT, name + ".jpg")
    img.file_format = "JPEG"
    img.save()
    print("OK ->", img.filepath_raw)


def save_pair(name, color, height, strength):
    save(name, color)
    save(name + "_n", normals_from_height(height, strength), "Non-Color")


# ------------------------------------------------------------------ materiales

def flagstones(seed, per_side, palette, mortar_col, crack_amount):
    """Losas irregulares con juntas hundidas, grano, grietas y suciedad en los huecos."""
    rng = np.random.default_rng(seed)
    pts = jittered(per_side, rng)
    d1, d2, cell = voronoi(pts)
    edge = d2 - d1
    gap = smoothstep(1.5, 7.0, edge)                       # 0 en la junta
    rim = smoothstep(0.0, 34.0, edge)                      # borde redondeado de la losa
    grain = fbm(32, 6, rng)
    big = fbm(8, 3, rng)
    # grietas finas: bordes de un voronoi pequeño, solo en algunas zonas
    c1, c2, _ = voronoi(jittered(14, rng, 0.45))
    crack_mask = smoothstep(0.58, 0.72, fbm(12, 3, rng)) * crack_amount
    cracks = (1 - smoothstep(0.4, 1.6, c2 - c1)) * crack_mask
    pits = smoothstep(0.68, 0.8, fbm(96, 2, rng))

    height = 0.35 + 0.55 * gap * (0.6 + 0.4 * rim) + grain * 0.12 - cracks * 0.3 - pits * 0.08
    cols = palette_pick(palette, len(pts), rng)[cell]
    tone = (0.82 + 0.3 * grain + 0.12 * (big - 0.5))[..., None]
    stone = cols * tone * (0.92 + 0.08 * rim[..., None])
    dirt = blur(1 - height, 4)[..., None]                   # huecos más oscuros
    color = stone * (1 - 0.22 * np.clip(dirt - 0.3, 0, 1)) - (cracks * 0.16)[..., None] - (pits * 0.06)[..., None]
    mortar = np.array(mortar_col, np.float32) * (0.8 + 0.3 * grain[..., None])
    color = color * gap[..., None] + mortar * (1 - gap[..., None])
    return color, height


def masonry(seed, cols_n, rows_n, palette, mortar_col, mortar_px, moss):
    """Sillares/ladrillos en hileras alternas con cantos gastados y algo de musgo en las juntas."""
    rng = np.random.default_rng(seed)
    bh, bw = SIZE / rows_n, SIZE / cols_n
    row = np.floor(YY / bh).astype(np.int32)
    shift = (row % 2) * bw * 0.5
    col = np.floor((XX + shift) / bw).astype(np.int32) % cols_n
    fx, fy = (XX + shift) % bw, YY % bh
    dist = np.minimum.reduce([fx, bw - fx, fy, bh - fy])
    wobble = (fbm(24, 4, rng) - 0.5) * mortar_px * 1.4
    gap = smoothstep(mortar_px * 0.35, mortar_px * 1.3, dist + wobble)
    rim = smoothstep(0, mortar_px * 7, dist + wobble)
    grain = fbm(28, 6, rng)
    chips = smoothstep(0.7, 0.84, fbm(36, 3, rng)) * (1 - rim * 0.6)

    height = 0.3 + 0.6 * gap * (0.55 + 0.45 * rim) + grain * 0.14 - chips * 0.35
    ids = (row % rows_n) * cols_n + col
    cols = palette_pick(palette, rows_n * cols_n, rng, 0.08)[ids]
    tone = (0.8 + 0.34 * grain)[..., None]
    color = cols * tone * (0.9 + 0.1 * rim[..., None]) - (chips * 0.2)[..., None]
    mortar = np.array(mortar_col, np.float32) * (0.75 + 0.35 * grain[..., None])
    if moss:
        m = smoothstep(0.55, 0.75, fbm(10, 4, rng))[..., None] * moss
        mortar = mortar * (1 - m) + np.array((0.28, 0.42, 0.22), np.float32) * m
    color = color * gap[..., None] + mortar * (1 - gap[..., None])
    return color, height


def ice(seed):
    rng = np.random.default_rng(seed)
    d1, d2, cell = voronoi(jittered(6, rng, 0.4))
    cracks = 1 - smoothstep(0.6, 3.0, d2 - d1)
    c1, c2, _ = voronoi(jittered(16, rng, 0.45))
    fine = (1 - smoothstep(0.4, 1.4, c2 - c1)) * smoothstep(0.5, 0.65, fbm(10, 3, rng))
    cloud = fbm(12, 6, rng)
    height = 0.8 - cracks * 0.35 - fine * 0.12 + cloud * 0.06
    deep = np.array((0.42, 0.68, 0.9), np.float32)
    light = np.array((0.82, 0.94, 1.0), np.float32)
    t = (0.35 + 0.65 * cloud)[..., None]
    color = deep * (1 - t) + light * t
    color = color + (cracks * 0.3 + fine * 0.18)[..., None]
    return color, height


def panels(seed, cols_n, rows_n, palette, seam_col, accent_col=None, tread=0.35):
    """Placas metálicas: juntas hundidas, remaches en las esquinas, chapa estriada en algunas y franjas de luz."""
    rng = np.random.default_rng(seed)
    bw, bh = SIZE / cols_n, SIZE / rows_n
    col = np.floor(XX / bw).astype(np.int32)
    row = np.floor(YY / bh).astype(np.int32)
    fx, fy = XX % bw, YY % bh
    dist = np.minimum.reduce([fx, bw - fx, fy, bh - fy])
    seam = smoothstep(2.0, 6.0, dist)
    bevel = smoothstep(0.0, 20.0, dist)
    grain = fbm(48, 4, rng)
    fine = fbm(128, 2, rng)
    rx, ry = np.minimum(fx, bw - fx), np.minimum(fy, bh - fy)
    rivet = 1 - smoothstep(3.0, 7.5, np.hypot(rx - 18, ry - 18))
    n = rows_n * cols_n
    ids = row * cols_n + col
    cols = palette_pick(palette, n, rng, 0.03)[ids]
    tread_on = (rng.random(n) < tread)[ids].astype(np.float32)
    stripes = ((XX + YY) % 24 < 6).astype(np.float32) * tread_on * smoothstep(8.0, 14.0, dist)
    height = 0.35 + 0.5 * seam * (0.6 + 0.4 * bevel) + rivet * 0.3 + stripes * 0.12 + grain * 0.03
    tone = (0.84 + 0.1 * grain + 0.08 * fine)[..., None]
    color = cols * tone * (0.9 + 0.1 * bevel[..., None]) + (rivet * 0.18)[..., None] - (stripes * 0.06)[..., None]
    color = color * seam[..., None] + np.array(seam_col, np.float32) * (1 - seam[..., None])
    if accent_col is not None:
        # franja luminosa a media altura de algunas filas de placas
        lit = (rng.random(rows_n) < 0.5)[row].astype(np.float32)
        strip = (1 - smoothstep(1.5, 4.5, np.abs(fy - bh / 2))) * lit * smoothstep(10.0, 24.0, np.minimum(fx, bw - fx))
        color = color * (1 - strip[..., None]) + np.array(accent_col, np.float32) * strip[..., None]
        height = height - strip * 0.1
    return np.clip(color, 0, 1), height


def sand_overlay(color, height, seed, amount):
    """Arena acumulada en las juntas y en manchas suaves."""
    rng = np.random.default_rng(seed)
    drift = smoothstep(0.45, 0.8, fbm(6, 4, rng)) * amount
    low = blur(1 - height, 3)
    m = np.clip(drift + smoothstep(0.35, 0.6, low) * amount * 0.8, 0, 1)
    sand = np.array((0.9, 0.74, 0.5), np.float32) * (0.9 + 0.2 * fbm(64, 3, rng)[..., None])
    return color * (1 - m[..., None]) + sand * m[..., None], height * (1 - m * 0.3) + m * 0.35


# ------------------------------------------------------------------ generar

save_pair("floor", *flagstones(7, 5, [(0.93, 0.82, 0.62), (0.87, 0.76, 0.58), (0.95, 0.86, 0.68), (0.84, 0.75, 0.61)],
                                (0.52, 0.43, 0.35), 0.7), strength=4.0)
save_pair("wall_top", *flagstones(21, 6, [(0.62, 0.59, 0.74), (0.57, 0.54, 0.69), (0.66, 0.63, 0.78)],
                                   (0.36, 0.33, 0.45), 0.45), strength=4.0)
save_pair("brick", *masonry(3, 4, 8, [(0.61, 0.57, 0.73), (0.56, 0.52, 0.68), (0.66, 0.62, 0.78), (0.53, 0.5, 0.65)],
                             (0.32, 0.29, 0.4), 4, 0.5), strength=5.0)
save_pair("stone_side", *masonry(11, 2, 4, [(0.7, 0.62, 0.52), (0.65, 0.58, 0.49), (0.74, 0.66, 0.56)],
                                  (0.42, 0.36, 0.3), 5, 0.3), strength=5.0)
save_pair("ice", *ice(5), strength=2.5)

# ------------------------------------------------------------------ temas por capítulo (se cargan al jugar ese capítulo)
# Arena (capítulos 4 a 6): arenisca cálida con arena en las juntas
c, h = flagstones(31, 4, [(0.93, 0.74, 0.5), (0.88, 0.68, 0.45), (0.96, 0.8, 0.56), (0.85, 0.66, 0.46)], (0.62, 0.45, 0.3), 0.35)
save_pair("desert_floor", *sand_overlay(c, h, 32, 0.35), strength=3.5)
save_pair("desert_wall_top", *flagstones(33, 5, [(0.86, 0.62, 0.4), (0.8, 0.57, 0.37), (0.9, 0.67, 0.44)], (0.55, 0.38, 0.25), 0.25), strength=3.5)
save_pair("desert_brick", *masonry(34, 3, 6, [(0.85, 0.6, 0.38), (0.8, 0.55, 0.34), (0.9, 0.66, 0.42), (0.76, 0.52, 0.33)], (0.6, 0.43, 0.28), 4, 0.0), strength=4.5)
save_pair("desert_side", *masonry(35, 2, 4, [(0.78, 0.56, 0.36), (0.72, 0.51, 0.33), (0.82, 0.6, 0.39)], (0.52, 0.37, 0.24), 5, 0.0), strength=4.5)
# Hielo (capítulos 7 a 9): nieve prensada y ladrillos de hielo
save_pair("frost_floor", *flagstones(41, 5, [(0.9, 0.95, 1.0), (0.84, 0.91, 0.98), (0.94, 0.97, 1.0), (0.8, 0.88, 0.96)], (0.6, 0.74, 0.88), 0.25), strength=3.0)
save_pair("frost_wall_top", *flagstones(42, 6, [(0.72, 0.84, 0.96), (0.66, 0.8, 0.94), (0.78, 0.88, 0.98)], (0.45, 0.6, 0.78), 0.3), strength=3.0)
save_pair("frost_brick", *masonry(43, 4, 8, [(0.66, 0.82, 0.96), (0.6, 0.78, 0.94), (0.72, 0.86, 0.98), (0.56, 0.74, 0.92)], (0.86, 0.93, 1.0), 4, 0.0), strength=4.0)
save_pair("frost_side", *masonry(44, 2, 4, [(0.58, 0.74, 0.9), (0.52, 0.7, 0.88), (0.64, 0.8, 0.94)], (0.82, 0.9, 0.98), 5, 0.0), strength=4.0)
# Tecnológico (capítulos 10 a 12): placas de metal con remaches y franjas de luz
save_pair("tech_floor", *panels(51, 2, 2, [(0.62, 0.66, 0.72), (0.56, 0.6, 0.67), (0.66, 0.7, 0.76)], (0.16, 0.18, 0.22), None, 0.4), strength=3.5)
save_pair("tech_wall_top", *panels(52, 4, 4, [(0.36, 0.4, 0.48), (0.32, 0.36, 0.44), (0.4, 0.44, 0.52)], (0.1, 0.12, 0.16), None, 0.2), strength=3.5)
save_pair("tech_brick", *panels(53, 2, 4, [(0.4, 0.44, 0.52), (0.36, 0.4, 0.48), (0.44, 0.48, 0.56)], (0.08, 0.1, 0.14), (0.35, 0.95, 1.0), 0.0), strength=4.0)
save_pair("tech_side", *panels(54, 2, 4, [(0.46, 0.5, 0.58), (0.42, 0.46, 0.54)], (0.12, 0.14, 0.18), (0.95, 0.4, 0.85), 0.0), strength=4.0)
