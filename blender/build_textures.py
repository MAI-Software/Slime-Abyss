"""
Genera las texturas de la mazmorra (PNG repetibles 256x256) en src/textures/.

Uso:
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P blender/build_textures.py

Son en escala de grises cálida: el juego las multiplica por el color de cada bloque
(así una misma textura sirve para suelo, hielo, plataformas...). Se pueden repintar
a mano en Blender o en cualquier editor; mantén el tamaño potencia de 2 y que sean repetibles.
"""

import os

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(ROOT, "..", "src", "textures"))
SIZE = 256
os.makedirs(OUT, exist_ok=True)


def value_noise(cells, rng):
    """Ruido de valor repetible (se repite cada SIZE píxeles)."""
    g = rng.random((cells, cells)).astype(np.float32)
    t = np.arange(SIZE, dtype=np.float32) * cells / SIZE
    i0 = np.floor(t).astype(np.int32)
    f = t - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    i0 = i0 % cells
    a = g[i0][:, i0]
    b = g[i0][:, i1]
    c = g[i1][:, i0]
    d = g[i1][:, i1]
    fx = f[None, :]
    fy = f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(base, octaves, rng):
    out = np.zeros((SIZE, SIZE), np.float32)
    amp, total = 0.5, 0.0
    for o in range(octaves):
        out += value_noise(base * 2 ** o, rng) * amp
        total += amp
        amp *= 0.5
    return out / total


def voronoi(points):
    """Distancias al 1er y 2º punto más cercano (con repetición en los bordes) y id de celda."""
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32) / SIZE
    d1 = np.full((SIZE, SIZE), 9.0, np.float32)
    d2 = np.full((SIZE, SIZE), 9.0, np.float32)
    cell = np.zeros((SIZE, SIZE), np.int32)
    for k, (px, py) in enumerate(points):
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                d = np.hypot(xx - (px + ox), yy - (py + oy))
                closer = d < d1
                d2 = np.where(closer, d1, np.minimum(d2, d))
                cell = np.where(closer, k, cell)
                d1 = np.where(closer, d, d1)
    return d1, d2, cell


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def save(name, gray, tint=(1.0, 0.97, 0.92)):
    gray = np.clip(gray, 0, 1)
    rgba = np.ones((SIZE, SIZE, 4), np.float32)
    for c in range(3):
        rgba[:, :, c] = np.clip(gray * tint[c], 0, 1)
    img = bpy.data.images.new(name, SIZE, SIZE, alpha=False)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(OUT, name + ".png")
    img.file_format = "PNG"
    img.save()
    print("OK ->", img.filepath_raw)


def flagstones(seed, stones, contrast):
    """Losas irregulares con juntas, grano y algún desconchón."""
    rng = np.random.default_rng(seed)
    # puntos en rejilla con desplazamiento aleatorio: losas de tamaño parecido
    pts = [((i + 0.5 + rng.uniform(-0.3, 0.3)) / stones, (j + 0.5 + rng.uniform(-0.3, 0.3)) / stones)
           for i in range(stones) for j in range(stones)]
    d1, d2, cell = voronoi(pts)
    edge = d2 - d1
    mortar = smoothstep(0.004, 0.02, edge)              # 0 en la junta
    shade = rng.uniform(0.74, 1.0, len(pts))[cell]      # cada losa con su tono
    grain = fbm(8, 5, rng)
    pits = smoothstep(0.62, 0.78, fbm(24, 3, rng))       # puntitos oscuros
    bevel = 0.86 + 0.14 * smoothstep(0.0, 0.06, edge)      # bordes de losa algo más oscuros
    v = shade * bevel * (0.72 + 0.4 * grain) - pits * 0.14
    v = v * (0.5 + 0.5 * mortar)
    return 0.5 + (v - 0.5) * contrast + 0.12


def bricks(seed, cols, rows, mortar_px, rough):
    """Ladrillos en hileras alternas: cols por unidad a lo ancho, rows a lo alto."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    bh = SIZE / rows
    bw = SIZE / cols
    row = np.floor(yy / bh).astype(np.int32)
    shift = (row % 2) * bw * 0.5
    col = np.floor((xx + shift) / bw).astype(np.int32) % cols
    fx = ((xx + shift) % bw)
    fy = (yy % bh)
    dist = np.minimum.reduce([fx, bw - fx, fy, bh - fy])
    wobble = fbm(16, 3, rng) * rough * 3
    mortar = smoothstep(mortar_px * 0.5, mortar_px + 1.5, dist - wobble)
    shade = rng.uniform(0.7, 1.0, (rows, cols))[row % rows, col]
    grain = fbm(6, 5, rng)
    chips = smoothstep(0.7, 0.85, fbm(20, 3, rng)) * 0.18
    face = 0.9 + 0.1 * smoothstep(0, 10, dist)
    v = shade * face * (0.72 + 0.4 * grain) - chips
    return v * (0.55 + 0.45 * mortar) + 0.04


save("floor", flagstones(seed=7, stones=2, contrast=1.0))
save("wall_top", flagstones(seed=21, stones=3, contrast=1.1), tint=(0.96, 0.96, 1.0))
save("brick", bricks(seed=3, cols=2, rows=4, mortar_px=3, rough=0.6), tint=(0.97, 0.96, 1.0))
save("stone_side", bricks(seed=11, cols=1, rows=2, mortar_px=4, rough=1.0))
