"""
Imagen para compartir (og:image): el limo sale disparado del cañón con cara de atracción de
feria, y detrás quedan el cofre y los tesoros del abismo. Usa los modelos de assets.blend.

Uso (desde la carpeta del proyecto):
  python blender/make_og.py          (convierte la fuente y llama a Blender)
  o a mano:
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P blender/og.py

Resultado: public/og-image.jpg (1200x630, la medida que piden WhatsApp y las redes)

Composición (importa el orden de lectura): cañón humeando abajo a la izquierda, el limo grande
cruzando en diagonal hacia arriba a la derecha, el título en el hueco oscuro de la izquierda y
el cofre con las gemas al fondo a la derecha, desenfocado, para que no pelee con el limo.
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(ROOT, "assets.blend")
OUT = os.path.normpath(os.path.join(ROOT, "..", "public", "og-image.jpg"))
FONT = os.environ.get("OG_FONT", os.path.join(os.environ.get("TEMP", "/tmp"), "fredoka-700.ttf"))
W, H = int(os.environ.get("OG_W", 1200)), int(os.environ.get("OG_H", 630))

bpy.ops.wm.open_mainfile(filepath=BLEND)
SCENE = bpy.context.scene

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
        for prop, value in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, prop, value)
            except (AttributeError, TypeError):
                pass
    return m


def put(name, loc=(0, 0, 0), rot=None, scale=1.0):
    """Copia un modelo del juego (con sus hijos) a la escena."""
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


# ---------------------------------------------------------------- materiales
M_SLIME = material("OgSlime", "2f8cff", 0.12, emit="1d5fd0", strength=0.55)
M_DROP = material("OgDrop", "4aa3ff", 0.15, emit="1d5fd0", strength=0.4)
M_SPEED = material("OgSpeed", "bfe9ff", 0.3, emit="7dd3fc", strength=3.0)
M_IRON = material("OgIron", "4a556b", 0.38, metal=0.6)
M_BRONZE = material("OgBronze", "c28b2c", 0.3, metal=0.7)
M_ROCK = material("OgRock", "2b2547", 0.9)
M_ROCK2 = material("OgRock2", "1d1834", 0.95)
M_GOLD = material("OgGold", "ffc94d", 0.25, metal=0.85, emit="ffb703", strength=1.2)
M_GEM = material("OgGem", "3de0b0", 0.1, emit="1fd6a0", strength=3.0)
M_GEM2 = material("OgGem2", "ff5f8f", 0.1, emit="ff2d6a", strength=3.0)
M_SMOKE = material("OgSmoke", "c9d6ff", 0.9, alpha=0.22)
M_FLASH = material("OgFlash", "fff0c2", 0.2, emit="ffd166", strength=14.0)
M_TITLE = material("OgTitle", "ffffff", 0.35, emit="eaf4ff", strength=1.5)
M_TITLE_BACK = material("OgTitleBack", "0b1026", 0.9)
M_SUB = material("OgSub", "8fd0ff", 0.4, emit="4aa3ff", strength=1.2)

# ---------------------------------------------------------------- el cañón, abajo en el centro
# mismas proporciones que el del juego (world.ts addCannon) pero a lo grande, y apuntando
# arriba a la derecha: el limo cruza el encuadre en diagonal, que es lo que da la sensación
# de velocidad. Todo ocurre en el plano XZ, así que la cara del limo mira siempre a cámara.
ANG = math.radians(41)
FLY = Vector((math.cos(ANG), 0.0, math.sin(ANG)))
CAN_BASE = Vector((-4.1, 2.4, -2.35))
CAN_LEN = 3.0

BARREL_ROT = FLY.to_track_quat("Z", "Y").to_euler()      # el tubo se construye en +Z y se gira a FLY

bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=28, radius1=1.65, radius2=1.45, depth=1.0,
                      matrix=Matrix.Translation((0, 0, 0.5)))
mesh("OgCannonBase", bm, M_IRON, CAN_BASE, smooth=True)          # la cureña, de pie

PIVOT = CAN_BASE + Vector((0, 0, 1.0))
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=28, radius1=0.95, radius2=1.15, depth=CAN_LEN,
                      matrix=Matrix.Translation((0, 0, CAN_LEN / 2)))
barrel = mesh("OgCannonBarrel", bm, M_IRON, PIVOT, smooth=True)
barrel.rotation_euler = BARREL_ROT

MUZZLE = PIVOT + FLY * CAN_LEN
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=28, radius1=1.32, radius2=1.32, depth=0.22)
ring = mesh("OgCannonRing", bm, M_BRONZE, MUZZLE, smooth=True)
ring.rotation_euler = BARREL_ROT

# aro de bronce en la parte de atrás del tubo, como el del juego
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=28, radius1=1.18, radius2=1.18, depth=0.2)
band = mesh("OgCannonBand", bm, M_BRONZE, PIVOT + FLY * 0.55, smooth=True)
band.rotation_euler = BARREL_ROT

# fogonazo en la boca y humo quedándose atrás
flash = sphere("OgFlash", 0.3, MUZZLE + FLY * 0.16, M_FLASH, 20)
flash.scale = (1.5, 1.5, 0.75)
flash.rotation_euler = BARREL_ROT
for k, (along, side, up, r) in enumerate(((-0.45, -0.55, 0.25, 0.5), (-1.15, 0.5, 0.55, 0.62),
                                          (-1.95, -0.3, 0.15, 0.52), (-2.7, 0.35, 0.7, 0.42))):
    sphere("OgSmoke%d" % k, r, MUZZLE + FLY * along + Vector((side, 0.9, up)), M_SMOKE, 16)

# ---------------------------------------------------------------- el limo, en el aire
CENTER = MUZZLE + FLY * 4.6 + Vector((0.2, 0.9, 0.5))
R = 1.6
body = sphere("OgSlime", R, CENTER, M_SLIME, 56)
body.scale = (1.24, 0.93, 0.9)               # estirado en la dirección del disparo
body.rotation_euler = (0, 0, 0)              # sin girar: la cara tiene que dar a cámara

# cara de atracción de feria: ojos como platos, boca abierta de par en par y coloretes.
# el frente de la bola queda en y = CENTER.y - R * 0.93; la cara va justo ahí, un pelo dentro
FACE_Y = -R * 0.93 + 0.06
for side in (-1, 1):
    eye = put("face_eye_round", loc=CENTER + Vector((side * 0.46, FACE_Y, 0.34)), scale=6.4)
    eye.rotation_euler = (0, 0, side * 0.1)
mouth = put("face_mouth_open", loc=CENTER + Vector((0.02, FACE_Y + 0.04, -0.34)), scale=7.6)
mouth.scale = (7.6, 7.6, 9.4)
for side in (-1, 1):
    put("face_blush_lines", loc=CENTER + Vector((side * 0.76, FACE_Y + 0.05, -0.02)), scale=4.2)
# (sin gotas de sudor: puestas sobre la cabeza parecían cuernos)

# gotas que se le escapan hacia atrás y rayas de velocidad
for k, (along, side, up, r) in enumerate(((1.9, 0.3, 0.5, 0.24), (2.9, -0.45, 0.95, 0.18),
                                          (2.3, 0.65, -0.4, 0.15), (3.9, 0.05, 1.3, 0.14),
                                          (3.2, -0.7, 0.05, 0.12))):
    sphere("OgDrop%d" % k, r, CENTER - FLY * along + Vector((side, 0.3, up)), M_DROP, 16)

rot_speed = FLY.to_track_quat("X", "Z").to_euler()
for k, (along, side, up, ln, r) in enumerate(((2.1, -0.8, 0.8, 1.4, 0.07), (2.8, 0.7, 1.4, 1.8, 0.055),
                                              (2.5, 0.15, -0.8, 1.3, 0.05), (3.7, -0.45, 1.8, 2.0, 0.045),
                                              (3.3, 0.9, 0.2, 1.5, 0.04))):
    p = CENTER - FLY * along + Vector((side, 0.35, up))
    capsule("OgSpeed%d" % k, ln, r, p, rot_speed, M_SPEED)

# ---------------------------------------------------------------- los tesoros, al fondo a la derecha
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1)
bmesh.ops.scale(bm, verts=bm.verts, vec=(7.0, 4.0, 1.4))
bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=0.18, segments=2, affect="EDGES")
mesh("OgLedge", bm, M_ROCK, (7.6, 8.4, -1.05), smooth=False)     # cornisa: el cofre no puede flotar
chest = put("chest", loc=(7.2, 8.2, -0.3), rot=(0, 0, math.radians(-24)), scale=4.2)
glow = sphere("OgTreasureGlow", 1.1, (7.2, 11.6, 0.2), material("OgGlow", "ffd27a", 0.6, emit="ffb703", strength=3.0, alpha=0.10), 20)
lid = next((o for o in chest.children_recursive if o.name.startswith("chest_lid")), None)
if lid:
    lid.rotation_euler.x = math.radians(-58)        # el cofre, abierto de par en par

for k, (x, y, z, s, m) in enumerate((
        (5.5, 8.6, 0.9, 0.7, M_GOLD), (8.5, 8.9, 1.2, 0.58, M_GOLD), (6.6, 8.0, 2.2, 0.5, M_GEM),
        (9.0, 9.6, 2.5, 0.62, M_GEM2), (5.2, 9.2, 3.0, 0.46, M_GOLD), (7.7, 8.3, 3.4, 0.42, M_GEM),
        (9.6, 10.2, 0.2, 0.54, M_GOLD), (6.3, 10.0, 3.9, 0.38, M_GEM2))):
    bm = bmesh.new()
    if m is M_GOLD:
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=20, radius1=s, radius2=s, depth=s * 0.22,
                              matrix=Matrix.Rotation(math.radians(72), 4, "X"))
    else:
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=s)
    ob = mesh("OgTreasure%d" % k, bm, m, (x, y, z), smooth=False)
    ob.rotation_euler = (0, 0, k * 0.7)

# ---------------------------------------------------------------- el abismo de fondo
for k, (x, y, z, sx, sy, sz, m) in enumerate((
        (-7.5, 12.0, -5.0, 10, 3, 6, M_ROCK), (2.0, 19.0, -7.5, 14, 3, 7, M_ROCK2),
        (12.5, 18.0, -3.0, 8, 3, 6, M_ROCK), (-4.0, 17.0, 9.5, 11, 3, 5, M_ROCK2),
        (12.0, 20.0, 11.0, 7, 3, 5, M_ROCK), (-1.0, 9.5, -8.5, 16, 3, 4, M_ROCK2))):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, verts=bm.verts, vec=(sx, sy, sz))
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=0.3, segments=2, affect="EDGES")
    mesh("OgRock%d" % k, bm, m, (x, y, z), smooth=False)

for k, (x, y, z, sx, sy, sz, m) in enumerate((
        (-6.0, 15.0, 1.0, 16, 2, 13, M_ROCK2), (9.0, 16.5, 2.0, 14, 2, 13, M_ROCK))):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, verts=bm.verts, vec=(sx, sy, sz))
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=0.35, segments=2, affect="EDGES")
    mesh("OgWall%d" % k, bm, m, (x, y, z), smooth=False)

# ---------------------------------------------------------------- luces, cámara y mundo
world = SCENE.world or bpy.data.worlds.new("OgWorld")
SCENE.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = srgb("161033")
bg.inputs[1].default_value = 0.55

key = bpy.data.lights.new("OgKey", "AREA")
key.energy = 5200
key.size = 9
key.color = (0.88, 0.94, 1.0)
ko = bpy.data.objects.new("OgKeyObj", key)
ko.location = (-5.0, -8.5, 8.0)
ko.rotation_euler = (math.radians(52), 0, math.radians(-30))
SCENE.collection.objects.link(ko)

rim = bpy.data.lights.new("OgRim", "AREA")
rim.energy = 3600
rim.size = 7
rim.color = (0.5, 0.78, 1.0)
ro = bpy.data.objects.new("OgRimObj", rim)
ro.location = (8.0, 7.0, 4.0)
ro.rotation_euler = (math.radians(72), 0, math.radians(148))
SCENE.collection.objects.link(ro)

fill = bpy.data.lights.new("OgFill", "AREA")
fill.energy = 2200
fill.size = 6
fill.color = (1.0, 0.82, 0.55)               # el oro del cofre tiñe la escena por la derecha
fo = bpy.data.objects.new("OgFillObj", fill)
fo.location = (5.5, 3.0, -1.0)
fo.rotation_euler = (math.radians(95), 0, math.radians(190))
SCENE.collection.objects.link(fo)

spot = bpy.data.lights.new("OgCannonLight", "POINT")
spot.energy = 900
spot.color = (1.0, 0.86, 0.6)
spo = bpy.data.objects.new("OgCannonLightObj", spot)
spo.location = (CAN_BASE.x + 1.2, CAN_BASE.y - 2.4, CAN_BASE.z + 2.2)   # dibuja el tubo del cañón
SCENE.collection.objects.link(spo)

cam = bpy.data.cameras.new("OgCam")
cam.lens = 40
cam.dof.use_dof = True
cam.dof.focus_distance = 14.0
cam.dof.aperture_fstop = 2.2
co = bpy.data.objects.new("OgCamObj", cam)
co.location = (1.0, -14.0, 1.2)
SCENE.collection.objects.link(co)
SCENE.camera = co
look = (CENTER + Vector((0.2, 0, -0.15))) - Vector(co.location)
co.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------- el título, pegado a la cámara
bpy.context.view_layer.update()       # sin esto la matriz de la cámara aún es la de antes de girarla
def text(name, body, size, offset, mat, align="LEFT"):
    """Texto plano delante de la cámara: offset = (derecha, arriba, distancia)."""
    cu = bpy.data.curves.new(name, type="FONT")
    cu.body = body
    cu.size = size
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.extrude = 0.012
    cu.bevel_depth = 0.006
    if os.path.exists(FONT):
        cu.font = bpy.data.fonts.load(FONT)
    ob = bpy.data.objects.new(name, cu)
    ob.data.materials.append(mat)
    SCENE.collection.objects.link(ob)
    m = co.matrix_world
    right, up, back = m.col[0].xyz, m.col[1].xyz, m.col[2].xyz
    ob.location = Vector(co.location) + right * offset[0] + up * offset[1] - back * offset[2]
    ob.rotation_euler = co.rotation_euler
    return ob


# a 4.2 m de la cámara el encuadre mide 3.8 x 2.0: el título cabe en el tercio de la izquierda
D = 4.2
text("OgTitleBack1", "SLIME", 0.42, (-1.70, 0.46, D + 0.03), M_TITLE_BACK)
text("OgTitleBack2", "ABYSS", 0.42, (-1.70, -0.01, D + 0.03), M_TITLE_BACK)
text("OgTitle1", "SLIME", 0.40, (-1.69, 0.47, D), M_TITLE)
text("OgTitle2", "ABYSS", 0.40, (-1.69, 0.0, D), M_TITLE)
# sin subtítulo: en la miniatura de WhatsApp no se leería

# ---------------------------------------------------------------- render
for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
    try:
        SCENE.render.engine = engine
        break
    except TypeError:
        continue
try:
    SCENE.eevee.taa_render_samples = 96
    SCENE.eevee.use_bloom = True
except AttributeError:
    pass
SCENE.render.resolution_x = W
SCENE.render.resolution_y = H
SCENE.render.film_transparent = False
SCENE.render.image_settings.file_format = "JPEG"
SCENE.render.image_settings.quality = 92
SCENE.render.filepath = OUT
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.render.render(write_still=True)
print("OK ->", OUT)
