"""
Portada del juego: el limo, hecho bola dentro de la cápsula del raíl, bajando a toda pastilla
por una vía del juego. Usa los modelos de assets.blend (vía, traviesas, cápsula y cara).

Uso (desde la carpeta del proyecto):
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P blender/cover.py

Resultado: src/assets/cover.png
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(ROOT, "assets.blend")
OUT = os.path.normpath(os.path.join(ROOT, "..", "src", "assets", "cover.png"))
W, H = int(os.environ.get("COVER_W", 1920)), int(os.environ.get("COVER_H", 1080))

bpy.ops.wm.open_mainfile(filepath=BLEND)
SCENE = bpy.context.scene

# los modelos del juego se quedan guardados pero fuera de cámara: solo se renderizan las copias
for ob in bpy.data.objects:
    ob.hide_render = True
    ob.hide_viewport = True


def srgb(h):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(int(h[0:2], 16)), lin(int(h[2:4], 16)), lin(int(h[4:6], 16)), 1.0)


def material(name, color, rough=0.5, metal=0.0, emit=None, strength=1.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(color)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = srgb(emit)
        b.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    return m


def put(name, loc=(0, 0, 0), rot=None, scale=1.0):
    """Copia un modelo del juego (con sus hijos) a la escena de la portada."""
    src = bpy.data.objects.get(name)
    if not src:
        raise SystemExit("falta el modelo " + name)

    def clone(ob, parent=None):
        cp = ob.copy()
        if ob.data:
            cp.data = ob.data
        cp.hide_render = False
        cp.hide_viewport = False
        SCENE.collection.objects.link(cp)
        if parent:
            cp.parent = parent
            cp.matrix_parent_inverse = ob.matrix_parent_inverse.copy()
        for ch in ob.children:
            clone(ch, cp)
        return cp

    root = clone(src)
    root.location = loc
    if rot is not None:
        root.rotation_euler = rot
    root.scale = (scale, scale, scale)
    return root


def mesh(name, bm, mat, loc=(0, 0, 0), smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    SCENE.collection.objects.link(ob)
    return ob


def ball_mesh(bm, r, center=(0, 0, 0), seg=32):
    tmp = bmesh.new()
    bmesh.ops.create_uvsphere(tmp, u_segments=seg, v_segments=seg // 2, radius=r)
    bmesh.ops.translate(tmp, verts=tmp.verts, vec=center)
    tmp.to_mesh(bpy.data.meshes.new("_tmp"))
    for v in tmp.verts:
        bm.verts.new(v.co)
    tmp.free()


def sphere(name, r, loc, mat, seg=32):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    return mesh(name, bm, mat, loc)


def capsule(name, length, r, loc, rot, mat):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=r)
    bmesh.ops.scale(bm, verts=bm.verts, vec=(length / r, 1, 1))
    ob = mesh(name, bm, mat, loc)
    ob.rotation_euler = rot
    return ob


# ---------------------------------------------------------------- materiales propios
M_SLIME = material("CoverSlime", "2f8cff", 0.12, emit="1d5fd0", strength=0.5)
M_DROP = material("CoverDrop", "4aa3ff", 0.15, emit="1d5fd0", strength=0.4)
M_SPEED = material("CoverSpeed", "bfe9ff", 0.3, emit="7dd3fc", strength=2.5)
M_ROCK = material("CoverRock", "2b2547", 0.9)
M_ROCK2 = material("CoverRock2", "1d1834", 0.95)
M_GLOW = material("CoverGlow", "ffd166", 0.4, emit="ffb703", strength=8.0)
M_GLASS = material("CoverGlass", "dff1ff", 0.05, alpha=0.18)
for prop, value in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND"), ("show_transparent_back", False)):
    try:
        setattr(M_GLASS, prop, value)
    except (AttributeError, TypeError):
        pass

# ---------------------------------------------------------------- la vía
# curva que baja de izquierda a derecha con un bache: el limo la coge en la bajada
PTS = [Vector(p) for p in (
    (-9.0, 1.6, 4.6), (-6.6, 1.0, 3.7), (-4.2, 0.5, 2.7), (-1.9, 0.2, 1.75),
    (0.4, 0.1, 1.15), (2.7, 0.3, 0.95), (5.0, 0.8, 1.25), (7.2, 1.6, 2.0), (9.2, 2.6, 3.0),
)]


def track_point(t):
    """Punto y dirección a lo largo de la vía (t en [0, 1])."""
    n = len(PTS) - 1
    k = min(int(t * n), n - 1)
    f = t * n - k
    a, b = PTS[k], PTS[k + 1]
    return a.lerp(b, f), (b - a).normalized()


TIE_STEP = 0.42
for k in range(len(PTS) - 1):
    a, b = PTS[k], PTS[k + 1]
    d = b - a
    rot = d.to_track_quat("X", "Z").to_euler()
    piece = put("rail_piece", loc=(a + b) / 2, rot=rot)
    piece.scale = (d.length + 0.02, 1, 1)
    n = max(1, int(d.length / TIE_STEP))
    for i in range(n):
        p = a + d * ((i + 0.5) / n)
        put("rail_tie", loc=p, rot=rot)

# la estación de la que sale disparado, al fondo de la vía
st_dir = (PTS[1] - PTS[0]).normalized()
put("rail_station", loc=PTS[0], rot=st_dir.to_track_quat("X", "Z").to_euler())

# ---------------------------------------------------------------- el limo, bola dentro de la cápsula
BALL_T = 0.52
pos, dir_ = track_point(BALL_T)
rot = dir_.to_track_quat("X", "Z").to_euler()
shell = put("rail_shell", loc=pos, rot=rot)
shell.rotation_euler.rotate_axis("X", math.radians(-10))   # el aro de la cápsula, fuera de los ojos
for ob in [shell] + list(shell.children_recursive):
    if ob.type == "MESH" and ob.name.endswith("_glass") or "_glass" in ob.name:
        ob.data = ob.data.copy()
        ob.data.materials.clear()
        ob.data.materials.append(M_GLASS)

CENTER = pos + Vector((0, 0, 0.52))
body = sphere("CoverBall", 0.4, CENTER, M_SLIME, 48)
body.scale = (1.06, 0.96, 0.98)          # un poco estirado por la velocidad

# cara: ojos como platos, boca abierta de par en par y gotas de sudor. Va demasiado rapido
FACE_Y = -0.33
for side in (-1, 1):
    eye = put("face_eye_round", loc=CENTER + Vector((side * 0.14, FACE_Y - 0.02, 0.11)), scale=1.9)
    eye.rotation_euler = (0, 0, side * 0.1)
mouth = put("face_mouth_open", loc=CENTER + Vector((0, FACE_Y - 0.05, -0.12)), scale=2.4)
mouth.scale = (2.4, 2.4, 2.9)
for side in (-1, 1):
    put("face_blush_lines", loc=CENTER + Vector((side * 0.2, FACE_Y - 0.01, -0.02)), scale=1.3)
for k, (dx, dz, sc) in enumerate(((-0.24, 0.3, 1.6), (0.26, 0.26, 1.2))):
    put("face_sweat", loc=CENTER + Vector((dx, FACE_Y + 0.06, dz)), scale=sc)

# gotas que se le escapan por detrás
DROPS = [(0.95, 0.2, 0.3, 0.075), (1.6, -0.15, 0.62, 0.055), (2.35, 0.3, 0.85, 0.045),
         (1.25, 0.5, 0.12, 0.04), (3.0, 0.0, 1.1, 0.035)]
for k, (along, dy, up, r) in enumerate(DROPS):
    sphere("CoverDrop%d" % k, r, CENTER - dir_ * along + Vector((0, dy, up)), M_DROP, 16)

# líneas de velocidad detrás de la bola
LINES = [(1.1, -0.4, 0.45, 0.45, 0.02), (1.6, 0.3, 0.85, 0.6, 0.016),
         (1.35, 0.0, -0.35, 0.4, 0.014), (2.1, -0.2, 1.15, 0.7, 0.013),
         (1.85, 0.45, 0.05, 0.5, 0.012), (2.4, 0.15, -0.6, 0.55, 0.011)]
back = -dir_
for k, (along, dy, up, ln, r) in enumerate(LINES):
    p = CENTER + back * abs(along) + Vector((0, dy, up * 0.35))
    capsule("CoverSpeed%d" % k, ln, r, p, rot, M_SPEED)

# ---------------------------------------------------------------- el abismo de fondo
for k, (x, y, z, sx, sy, sz, mat) in enumerate((
        (-8, 11.0, -4.5, 9, 3, 5, M_ROCK), (2.0, 13.0, -6.0, 12, 3, 6, M_ROCK2),
        (11.0, 10.0, -2.5, 7, 3, 5, M_ROCK), (-3.0, 12.0, 7.0, 10, 3, 4, M_ROCK2),
        (10.0, 9.0, 7.5, 6, 3, 4, M_ROCK))):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, verts=bm.verts, vec=(sx, sy, sz))
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=0.25, segments=2, affect="EDGES")
    mesh("CoverRock%d" % k, bm, mat, (x, y, z), smooth=False)

# muro del fondo: el abismo no puede ser un vacio plano
for k, (x, y, z, sx, sy, sz, mat) in enumerate((
        (-4.0, 7.0, 1.0, 13, 2, 9, M_ROCK2), (7.5, 8.0, 2.0, 11, 2, 9, M_ROCK),
        (1.0, 6.0, -5.5, 16, 2, 5, M_ROCK))):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, verts=bm.verts, vec=(sx, sy, sz))
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=0.3, segments=2, affect="EDGES")
    mesh("CoverWall%d" % k, bm, mat, (x, y, z), smooth=False)

# ---------------------------------------------------------------- luces, cámara y mundo
world = SCENE.world or bpy.data.worlds.new("CoverWorld")
SCENE.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = srgb("1a1338")
bg.inputs[1].default_value = 0.6

key = bpy.data.lights.new("CoverKey", "AREA")
key.energy = 2600
key.size = 8
key.color = (0.85, 0.93, 1.0)
ko = bpy.data.objects.new("CoverKeyObj", key)
ko.location = (-4.5, -7.0, 7.0)
ko.rotation_euler = (math.radians(48), 0, math.radians(-28))
SCENE.collection.objects.link(ko)

rim = bpy.data.lights.new("CoverRim", "AREA")
rim.energy = 1800
rim.size = 6
rim.color = (0.55, 0.8, 1.0)
ro = bpy.data.objects.new("CoverRimObj", rim)
ro.location = (6.5, 6.0, 3.0)
ro.rotation_euler = (math.radians(70), 0, math.radians(150))
SCENE.collection.objects.link(ro)

cam = bpy.data.cameras.new("CoverCam")
cam.lens = 34
cam.dof.use_dof = True
cam.dof.focus_distance = 3.8
cam.dof.aperture_fstop = 2.8
co = bpy.data.objects.new("CoverCamObj", cam)
co.location = CENTER + Vector((0.75, -3.6, 0.95))
SCENE.collection.objects.link(co)
SCENE.camera = co
look = CENTER - Vector(co.location)
co.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
co.rotation_euler.rotate_axis("Z", 0)
co.rotation_euler.y += math.radians(-11)     # cámara ladeada: la bajada se siente más rápida

for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
    try:
        SCENE.render.engine = engine
        break
    except TypeError:
        continue
try:
    SCENE.eevee.taa_render_samples = 64
    SCENE.eevee.use_bloom = True
except AttributeError:
    pass
SCENE.render.resolution_x = W
SCENE.render.resolution_y = H
SCENE.render.film_transparent = False
SCENE.render.image_settings.file_format = "PNG"
SCENE.render.filepath = OUT
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.render.render(write_still=True)
print("OK ->", OUT)
