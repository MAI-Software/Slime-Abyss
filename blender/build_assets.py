"""
Genera todos los modelos del juego en Blender y los exporta a src/models/assets.glb.

Uso (desde la carpeta del proyecto):
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P blender/build_assets.py

Resultado:
  blender/assets.blend      -> archivo editable (retocar aquí y exportar con export_assets.py)
  src/models/assets.glb  -> lo que carga el juego

Convenciones: Z arriba en Blender (el exportador lo pasa a Y arriba), 1 unidad = 1 bloque,
las caras y frentes miran a -Y (hacia la cámara del juego). El juego busca los objetos por nombre.
"""

import math
import random
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_GLB = os.path.normpath(os.path.join(ROOT, "..", "src", "models", "assets.glb"))
OUT_BLEND = os.path.join(ROOT, "assets.blend")

# ------------------------------------------------------------------ escena limpia
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
    for block in list(coll):
        coll.remove(block)

SCENE = bpy.context.scene.collection


def srgb(h):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return tuple(lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def material(name, hexcolor, rough=0.6, metal=0.0, emit=None, strength=1.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    col = srgb(hexcolor)
    m.diffuse_color = (*col, 1)
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*col, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*srgb(emit), 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


M = {
    "block": material("Block", "ffffff", 0.9),
    "fire": material("Flame", "ff7a1a", 1.0, emit="ff7a1a", strength=2.0),
    "iron": material("Iron", "3a3450", 0.5, 0.6),
    "pink": material("PadPink", "ec4899", 0.4),
    "pink_dark": material("PadPinkDark", "9d2a66", 0.6),
    "channel": material("Channel", "f59e0b", 0.5),
    "wood": material("Wood", "9a5b2e", 0.8),
    "gold": material("Gold", "f5b301", 0.3, 0.8, emit="7a4a00", strength=0.4),
    "white": material("EyeWhite", "ffffff", 0.3),
    "black": material("Ink", "0f172a", 0.4),
    "mouth": material("Mouth", "3b0a1a", 0.5),
    "tongue": material("Tongue", "ff6b8a", 0.5),
    "blush": material("Blush", "ff8fb8", 0.8),
    "sweat": material("Sweat", "bfe6ff", 0.2),
}

_slot = [0]


def place(ob):
    """Separa los objetos raíz en fila para que el .blend sea cómodo de editar."""
    ob.location = Vector((_slot[0] * 1.6, 0, 0))
    _slot[0] += 1


def mesh_object(name, bm, mat, smooth=False, parent=None, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    SCENE.objects.link(ob)
    if parent:
        ob.parent = parent
        ob.location = loc
    else:
        place(ob)
    return ob


def empty(name, parent=None, loc=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.3
    SCENE.objects.link(ob)
    if parent:
        ob.parent = parent
        ob.location = loc
    else:
        place(ob)
    return ob


def box(bm, size, center=(0, 0, 0)):
    m = Matrix.Translation(center) @ Matrix.Diagonal((*size, 1))
    return bmesh.ops.create_cube(bm, size=1.0, matrix=m)["verts"]


def ellipsoid(bm, radii, center=(0, 0, 0), u=16, v=10):
    m = Matrix.Translation(center) @ Matrix.Diagonal((*radii, 1))
    return bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0, matrix=m)["verts"]


def cylinder(bm, radius, depth, center=(0, 0, 0), segments=20, rot=None):
    m = Matrix.Translation(center)
    if rot:
        m = m @ rot
    return bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=radius, depth=depth, matrix=m
    )["verts"]


def tube(name, points, radius, mat, parent=None, loc=(0, 0, 0), poly=False, cyclic=False, plane="XZ"):
    """Línea gruesa redondeada (para ojos y bocas dibujadas). Puntos en el plano XZ."""
    cu = bpy.data.curves.new(name + "_curve", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 6
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY" if poly else "NURBS")
    sp.points.add(len(points) - 1)
    for p, (a, b) in zip(sp.points, points):
        p.co = (a, 0.0, b, 1.0) if plane == "XZ" else (a, b, 0.0, 1.0)
    sp.use_cyclic_u = cyclic
    if not poly:
        sp.use_endpoint_u = True
        sp.order_u = 3
        sp.resolution_u = 16
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    SCENE.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    me.name = name
    for p in me.polygons:
        p.use_smooth = True
    me.materials.clear()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    SCENE.objects.link(ob)
    if parent:
        ob.parent = parent
        ob.location = loc
    else:
        place(ob)
    return ob


# ================================================================== BLOQUES

# Losa superior: 1x1x0.5, cara de arriba en z=0, bordes biselados y baldosa hundida.
bm = bmesh.new()
box(bm, (1, 1, 0.5), (0, 0, -0.25))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.06, segments=2, profile=0.5, affect="EDGES")
bm.normal_update()
top = max((f for f in bm.faces if f.normal.z > 0.99), key=lambda f: f.calc_area())
bmesh.ops.inset_individual(bm, faces=[top], thickness=0.08, depth=-0.018)
mesh_object("block_top", bm, M["block"])

# Columna bajo la losa (el juego la estira en altura): de z=-1 a z=0.
bm = bmesh.new()
box(bm, (0.985, 0.985, 1), (0, 0, -0.5))
vertical = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.5]
bmesh.ops.bevel(bm, geom=vertical, offset=0.04, segments=1, affect="EDGES")
mesh_object("block_column", bm, M["block"])

# ================================================================== FUEGO

# Llama: gota alta con muchos anillos para que el shader del juego la ondule y la anime.
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=14, radius=0.2)
for v in bm.verts:
    z = v.co.z
    if z > 0:
        t = min(z / 0.2, 1.0)
        k = max(1 - t, 0.0) ** 1.4  # punta afilada
        v.co.x *= 0.15 + 0.85 * k
        v.co.y *= 0.15 + 0.85 * k
        v.co.z = z * 3.2
    else:
        v.co.z *= 0.6
    v.co.z += 0.12
mesh_object("flame", bm, M["fire"], smooth=True)

# Resplandor sobre la rejilla (el juego le pone un degradado radial aditivo).
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=False, segments=24, radius=0.5)
bmesh.ops.translate(bm, vec=(0, 0, 0.012), verts=bm.verts)
mesh_object("fire_glow", bm, M["fire"])

# Brasero: marco + rejilla.
bm = bmesh.new()
for k in (-0.22, 0.0, 0.22):
    box(bm, (0.84, 0.05, 0.04), (0, k, 0.03))
    box(bm, (0.05, 0.84, 0.04), (k, 0, 0.03))
for sx, sy, px, py in ((0.94, 0.08, 0, 0.43), (0.94, 0.08, 0, -0.43), (0.08, 0.94, 0.43, 0), (0.08, 0.94, -0.43, 0)):
    box(bm, (sx, sy, 0.08), (px, py, 0.04))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.008, segments=1, affect="EDGES")
mesh_object("fire_grate", bm, M["iron"])

# ================================================================== PLATAFORMA DE SALTO
# Tapa elevada 0.38 sobre el suelo (origen = cara de arriba de la tapa) y muelle a la vista debajo.
# El juego comprime el muelle (escala Z de jump_pad_spring) y hunde la tapa (jump_pad_plate).

M["steel_spring"] = material("SpringSteel", "e2e8f0", 0.2, 0.6, emit="8a96aa", strength=0.6)
M["pad_plate"] = material("PadPlate", "ff5fae", 0.35)
M["pad_rim"] = material("PadRim", "7a1f52", 0.5)

pad = empty("jump_pad")
bm = bmesh.new()
cylinder(bm, 0.36, 0.05, (0, 0, 0.025), 24)
mesh_object("jump_pad_base", bm, M["iron"], parent=pad, loc=(0, 0, -0.38))

# muelle: hélice de tubo; su origen está abajo para poder comprimirlo escalando
cu = bpy.data.curves.new("jump_pad_spring_curve", "CURVE")
cu.dimensions = "3D"
cu.bevel_depth = 0.036
cu.bevel_resolution = 2
sp = cu.splines.new("POLY")
turns, per_turn, radius, height = 4, 18, 0.21, 0.28
count = turns * per_turn + 1
sp.points.add(count - 1)
for k in range(count):
    t = k / per_turn
    ang = t * math.tau
    sp.points[k].co = (radius * math.cos(ang), radius * math.sin(ang), 0.04 + height * k / (count - 1), 1.0)
tmp = bpy.data.objects.new("jump_pad_spring_tmp", cu)
SCENE.objects.link(tmp)
dg = bpy.context.evaluated_depsgraph_get()
dg.update()
spring_mesh = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
bpy.data.objects.remove(tmp, do_unlink=True)
bpy.data.curves.remove(cu)
spring_mesh.name = "jump_pad_spring"
for poly in spring_mesh.polygons:
    poly.use_smooth = True
spring_mesh.materials.clear()
spring_mesh.materials.append(M["steel_spring"])
spring = bpy.data.objects.new("jump_pad_spring", spring_mesh)
SCENE.objects.link(spring)
spring.parent = pad
spring.location = (0, 0, -0.38)

# tapa: losa rosa biselada con un marco oscuro y el centro hundido
plate = empty("jump_pad_plate", parent=pad, loc=(0, 0, 0))
bm = bmesh.new()
box(bm, (0.68, 0.68, 0.08), (0, 0, -0.04))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.025, segments=2, affect="EDGES")
bm.normal_update()
top = max((f for f in bm.faces if f.normal.z > 0.99), key=lambda f: f.calc_area())
bmesh.ops.inset_individual(bm, faces=[top], thickness=0.09, depth=-0.018)
mesh_object("jump_pad_plate_body", bm, M["pad_plate"], parent=plate)
bm = bmesh.new()
box(bm, (0.72, 0.72, 0.035), (0, 0, -0.095))
mesh_object("jump_pad_plate_rim", bm, M["pad_rim"], parent=plate)

# ================================================================== INTERRUPTOR

sw = empty("switch")
bm = bmesh.new()
cylinder(bm, 0.46, 0.06, (0, 0, 0.03), 24)
mesh_object("switch_base", bm, M["iron"], parent=sw)
bm = bmesh.new()
cylinder(bm, 0.36, 0.1, (0, 0, 0.05), 24)
bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.verts[0].co.z > 0.09 and e.verts[1].co.z > 0.09],
                offset=0.03, segments=2, affect="EDGES")
mesh_object("switch_button", bm, M["channel"], smooth=True, parent=sw, loc=(0, 0, 0.04))

# ================================================================== PUERTA (de z=-1.5 a z=0)

door = empty("door")
bm = bmesh.new()
box(bm, (0.94, 0.94, 1.5), (0, 0, -0.75))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.03, segments=1, affect="EDGES")
mesh_object("door_core", bm, M["channel"], parent=door)
bm = bmesh.new()
for z in (-0.2, -0.75, -1.3):
    box(bm, (0.99, 0.99, 0.09), (0, 0, z))
for x in (-0.25, 0.0, 0.25):
    box(bm, (0.07, 0.99, 1.46), (x, 0, -0.75))
    box(bm, (0.99, 0.07, 1.46), (0, x, -0.75))
mesh_object("door_bars", bm, M["iron"], parent=door)

# ================================================================== COFRE

chest = empty("chest")
bm = bmesh.new()
box(bm, (0.7, 0.5, 0.42), (0, 0, 0.21))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.025, segments=2, affect="EDGES")
mesh_object("chest_body", bm, M["wood"], parent=chest)
bm = bmesh.new()
for x in (-0.24, 0.24):
    box(bm, (0.07, 0.52, 0.44), (x, 0, 0.21))
box(bm, (0.14, 0.05, 0.16), (0, -0.265, 0.34))
mesh_object("chest_trim", bm, M["gold"], parent=chest)

# Tapa con el pivote en la bisagra trasera (el juego la rota para abrirla).
lid = empty("chest_lid", parent=chest, loc=(0, 0.25, 0.42))
bm = bmesh.new()
cylinder(bm, 0.25, 0.72, (0, 0, 0), 20, rot=Matrix.Rotation(math.radians(90), 4, "Y"))
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context="VERTS")
bmesh.ops.scale(bm, vec=(1, 1, 0.8), verts=bm.verts)
bmesh.ops.translate(bm, vec=(0, -0.25, 0), verts=bm.verts)
mesh_object("chest_lid_wood", bm, M["wood"], smooth=True, parent=lid)
bm = bmesh.new()
for x in (-0.24, 0.24):
    cylinder(bm, 0.265, 0.075, (x, -0.25, 0), 20, rot=Matrix.Rotation(math.radians(90), 4, "Y"))
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context="VERTS")
bmesh.ops.scale(bm, vec=(1, 1, 0.82), verts=bm.verts)
mesh_object("chest_lid_trim", bm, M["gold"], smooth=True, parent=lid)

# ================================================================== CARA DEL LIMO
# Estilo kawaii. Todo mira a -Y. El juego coloca cada pieza; aquí solo importa la forma.


def flat_shape(name, points, depth, mat, front=0.0, parent=None, loc=(0, 0, 0)):
    """Silueta plana (puntos en XZ) con un poco de grosor hacia atrás (+Y)."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, front, z)) for x, z in points]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face], use_keep_orig=True)
    moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, depth, 0), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return mesh_object(name, bm, mat, parent=parent, loc=loc)


def ellipse_pts(rx, rz, cx=0.0, cz=0.0, n=48):
    return [(cx + rx * math.cos(2 * math.pi * i / n), cz + rz * math.sin(2 * math.pi * i / n)) for i in range(n)]


def teardrop(name, radius, mat):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=radius)
    for v in bm.verts:
        if v.co.z > 0:
            t = v.co.z / radius
            v.co.x *= 1 - t * 0.9
            v.co.y *= 1 - t * 0.9
            v.co.z *= 2.2
    bmesh.ops.scale(bm, vec=(1, 0.5, 1), verts=bm.verts)
    return mesh_object(name, bm, mat, smooth=True)


# Ojos personalizables (Mi limo). Cada estilo es face_eye_<id> y su hijo face_eye_<id>_look
# (iris, pupila, brillos) es lo que el juego desplaza para que el limo mire hacia donde va.
M["iris"] = material("Iris", "1e3a8a", 0.3)
M["iris_light"] = material("IrisLight", "60a5fa", 0.3)
M["cat_iris"] = material("CatIris", "a3e635", 0.3)


def star_pts(r_out, r_in, n=4, cx=0.0, cz=0.0):
    pts = []
    for k in range(n * 2):
        r = r_out if k % 2 == 0 else r_in
        a = math.pi / 2 + k * math.pi / n
        pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def eye_base(name, rx, rz, white_mat):
    eye = empty(name)
    bm = bmesh.new()
    ellipsoid(bm, (rx + 0.009, 0.03, rz + 0.01), (0, 0, 0), 36, 20)
    mesh_object(name + "_outline", bm, M["black"], smooth=True, parent=eye, loc=(0, 0.006, 0))
    bm = bmesh.new()
    ellipsoid(bm, (rx, 0.03, rz), (0, 0, 0), 36, 20)
    mesh_object(name + "_white", bm, white_mat, smooth=True, parent=eye)
    return eye


def shines(name, parent, big, small, y=-0.013):
    bm = bmesh.new()
    ellipsoid(bm, (big, 0.006, big * 1.2), (0, 0, 0), 20, 12)
    mesh_object(name + "_shine", bm, M["white"], smooth=True, parent=parent, loc=(-big * 1.15, y, big * 1.4))
    bm = bmesh.new()
    ellipsoid(bm, (small, 0.005, small), (0, 0, 0), 16, 10)
    mesh_object(name + "_shine2", bm, M["white"], smooth=True, parent=parent, loc=(big * 1.05, y, -big * 1.25))


# redondos (por defecto): blanco, iris azul marino, pupila y brillos
eye = eye_base("face_eye_round", 0.062, 0.082, M["white"])
look = empty("face_eye_round_look", parent=eye, loc=(0, -0.02, -0.01))
bm = bmesh.new()
ellipsoid(bm, (0.043, 0.012, 0.054), (0, 0, 0), 32, 18)
mesh_object("face_eye_round_iris", bm, M["iris"], smooth=True, parent=look)
bm = bmesh.new()
ellipsoid(bm, (0.025, 0.008, 0.031), (0, 0, 0), 24, 14)
mesh_object("face_eye_round_pupil", bm, M["black"], smooth=True, parent=look, loc=(0, -0.006, 0))
shines("face_eye_round", look, 0.015, 0.007)

# puntitos: óvalo negro brillante (el estilo clásico)
eye = empty("face_eye_dot")
bm = bmesh.new()
ellipsoid(bm, (0.05, 0.03, 0.066), (0, 0, 0), 36, 20)
mesh_object("face_eye_dot_ball", bm, M["black"], smooth=True, parent=eye)
look = empty("face_eye_dot_look", parent=eye, loc=(0, -0.026, 0))
shines("face_eye_dot", look, 0.016, 0.008, y=0.0)

# brillantes: ojazos con reflejo de estrella y media luna clara abajo
eye = eye_base("face_eye_sparkle", 0.07, 0.092, M["white"])
look = empty("face_eye_sparkle_look", parent=eye, loc=(0, -0.02, -0.012))
bm = bmesh.new()
ellipsoid(bm, (0.053, 0.012, 0.066), (0, 0, 0), 32, 18)
mesh_object("face_eye_sparkle_iris", bm, M["iris"], smooth=True, parent=look)
bm = bmesh.new()
ellipsoid(bm, (0.038, 0.008, 0.026), (0, 0, 0), 28, 14)
mesh_object("face_eye_sparkle_low", bm, M["iris_light"], smooth=True, parent=look, loc=(0, -0.006, -0.03))
bm = bmesh.new()
ellipsoid(bm, (0.028, 0.008, 0.034), (0, 0, 0), 24, 14)
mesh_object("face_eye_sparkle_pupil", bm, M["black"], smooth=True, parent=look, loc=(0, -0.009, 0.004))
flat_shape("face_eye_sparkle_star", star_pts(0.024, 0.007), 0.002, M["white"], front=-0.016, parent=look,
           loc=(-0.02, 0, 0.026))
bm = bmesh.new()
ellipsoid(bm, (0.009, 0.005, 0.009), (0, 0, 0), 16, 10)
mesh_object("face_eye_sparkle_shine2", bm, M["white"], smooth=True, parent=look, loc=(0.02, -0.015, -0.018))

# gatunos: iris verde lima con pupila rasgada
eye = eye_base("face_eye_cat", 0.062, 0.08, M["cat_iris"])
look = empty("face_eye_cat_look", parent=eye, loc=(0, -0.026, 0))
bm = bmesh.new()
ellipsoid(bm, (0.012, 0.008, 0.058), (0, 0, 0), 20, 16)
mesh_object("face_eye_cat_slit", bm, M["black"], smooth=True, parent=look)
bm = bmesh.new()
ellipsoid(bm, (0.012, 0.005, 0.014), (0, 0, 0), 16, 10)
mesh_object("face_eye_cat_shine", bm, M["white"], smooth=True, parent=look, loc=(-0.026, -0.006, 0.03))

# Ojo de dolor ">" con esquina marcada (el juego lo refleja para "<").
tube("face_eye_pain", [(-0.04, 0.045), (0.035, 0.0), (-0.04, -0.045)], 0.017, M["black"], poly=True)

# Ojo feliz "^".
tube("face_eye_happy", [(-0.05, -0.02), (-0.025, 0.025), (0.0, 0.04), (0.025, 0.025), (0.05, -0.02)], 0.017,
     M["black"])

# Bocas personalizables (Mi limo): face_mouth_<id>.
# gatito "ω" (por defecto)
tube("face_mouth_cat", [(-0.046, 0.012), (-0.032, -0.012), (-0.013, -0.012), (0.0, 0.004), (0.013, -0.012),
                        (0.032, -0.012), (0.046, 0.012)], 0.009, M["black"])
# sonrisa sencilla
tube("face_mouth_smile", [(-0.04, 0.01), (-0.02, -0.01), (0.0, -0.016), (0.02, -0.01), (0.04, 0.01)], 0.009, M["black"])
# sonrisa con colmillo
mouth = empty("face_mouth_fang")
tube("face_mouth_fang_line", [(-0.042, 0.01), (-0.02, -0.01), (0.0, -0.015), (0.02, -0.01), (0.042, 0.01)], 0.009,
     M["black"], parent=mouth)
flat_shape("face_mouth_fang_tooth", [(0.006, -0.012), (0.024, -0.009), (0.016, -0.03)], 0.004, M["white"],
           front=-0.004, parent=mouth)
# lengua fuera
mouth = empty("face_mouth_tongue")
tube("face_mouth_tongue_line", [(-0.042, 0.008), (-0.02, -0.01), (0.0, -0.014), (0.02, -0.01), (0.042, 0.008)], 0.009,
     M["black"], parent=mouth)
flat_shape("face_mouth_tongue_tip", [(0.028 * math.cos(math.pi * (1 + i / 12)), -0.012 + 0.03 * math.sin(math.pi * (1 + i / 12)))
                                     for i in range(13)], 0.004, M["tongue"], front=-0.001, parent=mouth, loc=(0.008, 0, 0))

# Boca abierta en "D" con lengua.
mouth_open = empty("face_mouth_open")
d_shape = [(0.05 * math.cos(math.pi * i / 16), -0.055 * math.sin(math.pi * i / 16)) for i in range(17)]
flat_shape("face_mouth_open_hole", d_shape, 0.01, M["mouth"], parent=mouth_open)
flat_shape("face_mouth_open_tongue", ellipse_pts(0.028, 0.015, 0, -0.038), 0.001, M["tongue"], front=-0.002,
           parent=mouth_open)

# Boca de sorpresa "o".
flat_shape("face_mouth_o", ellipse_pts(0.022, 0.028), 0.01, M["mouth"])

# Boca de dolor ondulada.
tube("face_mouth_pain", [(-0.05, 0.0), (-0.033, 0.014), (-0.017, -0.01), (0.0, 0.014), (0.017, -0.01),
                          (0.033, 0.014), (0.05, 0.0)], 0.011, M["black"])

# Mofletes, sudor y lágrima.
# Mofletes personalizables (Mi limo): face_blush_<id> (el estilo "none" no tiene modelo).
M["blush_line"] = material("BlushLine", "f0508f", 0.8)
blush = empty("face_blush_lines")
flat_shape("face_blush_lines_spot", ellipse_pts(0.036, 0.02), 0.004, M["blush"], parent=blush)
for k, x in enumerate((-0.018, 0.0, 0.018)):
    tube(f"face_blush_lines_line{k}", [(x - 0.007, -0.01), (x + 0.007, 0.01)], 0.0045, M["blush_line"], parent=blush,
         loc=(0, -0.006, 0), poly=True)
flat_shape("face_blush_spots", ellipse_pts(0.04, 0.024), 0.004, M["blush"])
heart = [(0.0022 * 16 * math.sin(t) ** 3, 0.0022 * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)))
         for t in [2 * math.pi * i / 32 for i in range(32)]]
flat_shape("face_blush_hearts", heart, 0.004, M["blush_line"])

# Caras que se desbloquean con logros: ojos estrellados y enamorados, sonrisota, morritos, estrellitas y pecas.
M["star_iris"] = material("StarIris", "facc15", 0.35, emit="a16207", strength=0.4)
M["heart_iris"] = material("HeartIris", "f43f5e", 0.35)
M["freckle"] = material("Freckle", "b45309", 0.8)

eye = eye_base("face_eye_star", 0.064, 0.084, M["white"])
look = empty("face_eye_star_look", parent=eye, loc=(0, -0.02, -0.008))
flat_shape("face_eye_star_iris", star_pts(0.052, 0.022, 5), 0.008, M["star_iris"], front=-0.017, parent=look)
bm = bmesh.new()
ellipsoid(bm, (0.016, 0.006, 0.016), (0, 0, 0), 20, 12)
mesh_object("face_eye_star_pupil", bm, M["black"], smooth=True, parent=look, loc=(0, -0.02, 0))
shines("face_eye_star", look, 0.011, 0.006, y=-0.026)

heart_pts = [(0.0032 * 16 * math.sin(t) ** 3, 0.0032 * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)))
             for t in [2 * math.pi * i / 40 for i in range(40)]]
eye = eye_base("face_eye_heart", 0.064, 0.084, M["white"])
look = empty("face_eye_heart_look", parent=eye, loc=(0, -0.02, -0.004))
flat_shape("face_eye_heart_iris", heart_pts, 0.008, M["heart_iris"], front=-0.017, parent=look)
shines("face_eye_heart", look, 0.012, 0.006, y=-0.026)

# sonrisota: boca abierta ancha con fila de dientes
mouth = empty("face_mouth_grin")
grin = [(0.058 * math.cos(math.pi * i / 20), -0.045 * math.sin(math.pi * i / 20) + 0.008) for i in range(21)]
flat_shape("face_mouth_grin_hole", grin, 0.01, M["mouth"], parent=mouth)
flat_shape("face_mouth_grin_teeth", [(-0.046, 0.006), (0.046, 0.006), (0.04, -0.012), (-0.04, -0.012)], 0.004, M["white"],
           front=-0.003, parent=mouth)
tube("face_mouth_grin_line", [(x, z) for x, z in grin] + [(-0.058, 0.008)], 0.006, M["black"], parent=mouth, poly=True)

# morritos: un "3" tumbado, de beso
tube("face_mouth_pout", [(-0.012, 0.024), (0.014, 0.018), (0.004, 0.0), (0.014, -0.018), (-0.012, -0.024)], 0.008, M["black"])

# mofletes: estrellitas y pecas
flat_shape("face_blush_stars", star_pts(0.03, 0.012, 5), 0.004, M["blush_line"])
freckles = empty("face_blush_freckles")
bm = bmesh.new()
for x, z in ((-0.02, 0.006), (0.004, -0.008), (0.022, 0.01), (-0.004, 0.016)):
    ellipsoid(bm, (0.0065, 0.003, 0.0065), (x, -0.004, z), 12, 8)
mesh_object("face_blush_freckles_dots", bm, M["freckle"], smooth=True, parent=freckles)
teardrop("face_sweat", 0.03, M["sweat"])
teardrop("face_tear", 0.016, M["sweat"])

# ================================================================== DIVISORES Y MONEDAS

M["steel"] = material("Steel", "d7dfea", 0.18, 1.0)
M["steel_dark"] = material("SteelDark", "4a4660", 0.45, 0.7)
M["coin"] = material("CoinGold", "ffc53d", 0.22, 1.0, emit="6b4200", strength=0.25)

# Cuchilla: hoja afilada a lo largo de Y (el juego la gira para la otra orientación).
blade = empty("blade")
bm = bmesh.new()
box(bm, (0.2, 0.96, 0.1), (0, 0, 0.05))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.02, segments=2, affect="EDGES")
mesh_object("blade_mount", bm, M["steel_dark"], parent=blade)
bm = bmesh.new()
profile = [(-0.46, 0.08), (0.46, 0.08), (0.46, 0.34), (0.3, 0.72), (-0.3, 0.72), (-0.46, 0.34)]
verts = [bm.verts.new((-0.035, y, z)) for y, z in profile]
face = bm.faces.new(verts)
ext = bmesh.ops.extrude_face_region(bm, geom=[face], use_keep_orig=True)
moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
bmesh.ops.translate(bm, vec=(0.07, 0, 0), verts=moved)
for v in bm.verts:  # filo: los vértices altos se juntan en el centro
    if v.co.z > 0.3:
        v.co.x *= 0.12
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
mesh_object("blade_edge", bm, M["steel"], parent=blade)

# Casilla de pinchos: una losa metálica cubierta de púas (pincha el limo que la pisa).
spike = empty("spike_bed")
bm = bmesh.new()
box(bm, (0.96, 0.96, 0.08), (0, 0, 0.04))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.02, segments=2, affect="EDGES")
mesh_object("spike_bed_plate", bm, M["steel_dark"], parent=spike)
bm = bmesh.new()
rng_spikes = random.Random(11)
for gx in range(4):
    for gy in range(4):
        cx = -0.345 + gx * 0.23 + rng_spikes.uniform(-0.025, 0.025)
        cy = -0.345 + gy * 0.23 + rng_spikes.uniform(-0.025, 0.025)
        h = rng_spikes.uniform(0.26, 0.38)
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.085, radius2=0.0, depth=h,
                              matrix=Matrix.Translation((cx, cy, 0.08 + h / 2)))
mesh_object("spike_bed_points", bm, M["steel"], smooth=True, parent=spike)

# Moneda de pie, mirando a -Y, con canto biselado y relieve.
bm = bmesh.new()
cylinder(bm, 0.22, 0.05, (0, 0, 0), 32, rot=Matrix.Rotation(math.radians(90), 4, "X"))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.012, segments=2, affect="EDGES")
bm.normal_update()
caps = [f for f in bm.faces if abs(f.normal.y) > 0.99 and f.calc_area() > 0.05]
bmesh.ops.inset_individual(bm, faces=caps, thickness=0.035, depth=-0.008)
bm.normal_update()
caps = [f for f in bm.faces if abs(f.normal.y) > 0.99 and f.calc_area() > 0.03]
bmesh.ops.inset_individual(bm, faces=caps, thickness=0.03, depth=0.01)
mesh_object("coin", bm, M["coin"], smooth=False)

# ================================================================== SECRETOS Y MAREO

# Gema secreta: cristal facetado alargado con un halo de color.
M["gem"] = material("GemCrystal", "8b5cf6", 0.12, 0.2, emit="5b21b6", strength=1.2)
bm = bmesh.new()
top = bm.verts.new((0, 0, 0.42))
bottom = bm.verts.new((0, 0, 0.0))
ring = [bm.verts.new((0.15 * math.cos(a * math.tau / 6), 0.15 * math.sin(a * math.tau / 6), 0.26)) for a in range(6)]
for k in range(6):
    a, b = ring[k], ring[(k + 1) % 6]
    bm.faces.new((a, b, top))
    bm.faces.new((b, a, bottom))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
mesh_object("gem", bm, M["gem"], smooth=False)

# Ojo mareado: espiral dibujada (el juego la hace girar).
spiral = []
for k in range(46):
    t = k / 45
    ang = t * math.tau * 2.4
    r = 0.008 + 0.05 * t
    spiral.append((r * math.cos(ang), r * math.sin(ang)))
tube("face_eye_dizzy", spiral, 0.011, M["black"])

# ================================================================== REACCIONES
M["glass_oil"] = material("OilBottle", "e0a526", 0.1, 0.0, emit="7a4a00", strength=0.35)
M["cork"] = material("Cork", "a0703c", 0.9)
M["label"] = material("Label", "fdf2e0", 0.8)
M["leaf"] = material("Leaf", "3f9d3c", 0.7)
M["leaf_dark"] = material("LeafDark", "2a6e2f", 0.8)
M["thorn"] = material("Thorn", "6b4a2b", 0.7)
M["ice_block"] = material("IceBlock", "a9e4ff", 0.05, 0.0, emit="3aa0d8", strength=0.25)
M["fan_body"] = material("FanBody", "3d4a66", 0.45, 0.6)
M["fan_blade"] = material("FanBlade", "cfd8e6", 0.25, 0.8)
M["cold"] = material("ColdGlow", "bfefff", 0.2, 0.0, emit="7fd8ff", strength=1.5)

# Botella de aceite: cuerpo ámbar, etiqueta, cuello y tapón.
bottle = empty("oil_bottle")
bm = bmesh.new()
ellipsoid(bm, (0.13, 0.13, 0.16), (0, 0, 0.16), 18, 12)
mesh_object("oil_bottle_body", bm, M["glass_oil"], smooth=True, parent=bottle)
bm = bmesh.new()
cylinder(bm, 0.135, 0.08, (0, 0, 0.15), 20)
mesh_object("oil_bottle_label", bm, M["label"], smooth=True, parent=bottle)
bm = bmesh.new()
cylinder(bm, 0.05, 0.12, (0, 0, 0.34), 14)
mesh_object("oil_bottle_neck", bm, M["glass_oil"], smooth=True, parent=bottle)
bm = bmesh.new()
cylinder(bm, 0.058, 0.07, (0, 0, 0.43), 14)
mesh_object("oil_bottle_cork", bm, M["cork"], smooth=True, parent=bottle)

# Plantas: matorral espeso con espinas (bloquea el paso hasta que arde). De z=0 a ~1.1.
plant = empty("plant_block")
bm = bmesh.new()
for (x, y, z, r) in ((0, 0, 0.35, 0.42), (-0.22, 0.18, 0.62, 0.3), (0.24, -0.15, 0.7, 0.32), (0.05, 0.1, 0.92, 0.26),
                     (0.25, 0.25, 0.35, 0.28), (-0.25, -0.25, 0.4, 0.3)):
    ellipsoid(bm, (r, r, r * 0.95), (x, y, z), 12, 8)
mesh_object("plant_bush", bm, M["leaf"], smooth=True, parent=plant)
bm = bmesh.new()
for (x, y, z, r) in ((0.3, 0.05, 0.55, 0.22), (-0.3, 0.02, 0.75, 0.2), (0.0, -0.32, 0.5, 0.22), (0.02, 0.33, 0.65, 0.2)):
    ellipsoid(bm, (r, r, r), (x, y, z), 10, 6)
mesh_object("plant_bush_dark", bm, M["leaf_dark"], smooth=True, parent=plant)
bm = bmesh.new()
for k in range(14):
    ang = k * 2.4
    h = 0.25 + (k % 5) * 0.16
    x, y = 0.42 * math.cos(ang), 0.42 * math.sin(ang)
    m = Matrix.Translation((x, y, h)) @ Matrix.Rotation(ang, 4, "Z") @ Matrix.Rotation(math.radians(90), 4, "Y")
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=5, radius1=0.035, radius2=0.0, depth=0.16, matrix=m)
mesh_object("plant_thorns", bm, M["thorn"], parent=plant)

# Bloque de hielo: cubo biselado translúcido-claro (se derrite con el limo en llamas).
bm = bmesh.new()
box(bm, (0.94, 0.94, 1.0), (0, 0, 0.5))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.05, segments=2, affect="EDGES")
mesh_object("ice_block", bm, M["ice_block"])

# Ventilador: pedestal + aro + aspas (el juego gira fan_blades y orienta el conjunto; sopla hacia -Y).
fan = empty("fan")
bm = bmesh.new()
box(bm, (0.5, 0.36, 0.22), (0, 0.05, 0.11))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.03, segments=1, affect="EDGES")
box(bm, (0.12, 0.12, 0.28), (0, 0.05, 0.34))
mesh_object("fan_base", bm, M["fan_body"], parent=fan)
ring = [(0.4 * math.cos(a * math.tau / 28), 0.4 * math.sin(a * math.tau / 28)) for a in range(28)]
tube("fan_ring", ring, 0.045, M["fan_body"], parent=fan, loc=(0, 0, 0.62), poly=True, cyclic=True)
blades = empty("fan_blades", parent=fan, loc=(0, 0, 0.62))
bm = bmesh.new()
for k in range(4):
    ang = k * math.pi / 2
    m = Matrix.Rotation(ang, 4, "Y") @ Matrix.Translation((0.19, 0, 0)) @ Matrix.Rotation(math.radians(25), 4, "X")
    bmesh.ops.create_cube(bm, size=1.0, matrix=m @ Matrix.Diagonal((0.3, 0.02, 0.12, 1)))
ellipsoid(bm, (0.07, 0.06, 0.07))
mesh_object("fan_blades_mesh", bm, M["fan_blade"], parent=blades)

# Rejilla de aire frío en el suelo (el juego añade la niebla).
vent = empty("cold_vent")
bm = bmesh.new()
for k in (-0.3, 0.3):
    box(bm, (0.8, 0.07, 0.06), (0, k, 0.03))
    box(bm, (0.07, 0.8, 0.06), (k, 0, 0.03))
for k in (-0.1, 0.1):
    box(bm, (0.6, 0.04, 0.04), (0, k, 0.02))
mesh_object("cold_vent_grate", bm, M["iron"], parent=vent)
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=False, segments=24, radius=0.3)
bmesh.ops.translate(bm, vec=(0, 0, 0.012), verts=bm.verts)
mesh_object("cold_vent_glow", bm, M["cold"], parent=vent)

# ================================================================== RAÍLES
# rail_piece: tramo de 1 de largo a lo largo de X (el juego lo estira y lo inclina entre casillas); origen = altura del raíl.
# rail_station: estación redonda con aro brillante donde el limo se hace bola.
M["rail_metal"] = material("RailMetal", "9aa3b5", 0.3, 1.0)
M["rail_wood"] = material("RailWood", "6b4226", 0.8)
M["rail_glow"] = material("RailGlow", "7dd3fc", 0.3, emit="38bdf8", strength=2.5)
M["station_stone"] = material("StationStone", "cfc6e6", 0.6)

rail = empty("rail_piece")
bm = bmesh.new()
for y in (-0.15, 0.15):
    box(bm, (1.0, 0.05, 0.05), (0, y, 0.0))
mesh_object("rail_piece_rails", bm, M["rail_metal"], parent=rail)
bm = bmesh.new()
for x in (-0.25, 0.25):
    box(bm, (0.09, 0.44, 0.04), (x, 0, -0.045))
box(bm, (1.0, 0.1, 0.07), (0, 0, -0.1))
mesh_object("rail_piece_wood", bm, M["rail_wood"], parent=rail)

station = empty("rail_station")
bm = bmesh.new()
cylinder(bm, 0.44, 0.06, (0, 0, 0.03), 40)
mesh_object("rail_station_base", bm, M["station_stone"], smooth=True, parent=station)
ring = [(0.36 * math.cos(a * math.tau / 40), 0.36 * math.sin(a * math.tau / 40)) for a in range(40)]
tube("rail_station_ring", ring, 0.025, M["rail_glow"], parent=station, loc=(0, 0, 0.075), poly=True, cyclic=True, plane="XY")
bm = bmesh.new()
for a in (0.25, 0.75):
    cylinder(bm, 0.035, 0.5, (0.42 * math.cos(a * math.tau + math.pi / 2), 0.42 * math.sin(a * math.tau + math.pi / 2), 0.28), 12)
mesh_object("rail_station_posts", bm, M["rail_metal"], smooth=True, parent=station)
arch = [(0.42 * math.cos(math.pi * t / 16), 0.0, 0.53 + 0.12 * math.sin(math.pi * t / 16)) for t in range(17)]
cu_pts = [(x, z) for x, _, z in arch]
tube("rail_station_arch", cu_pts, 0.03, M["rail_metal"], parent=station)

# ================================================================== COLECCIONABLES
# Piezas pequeñas (~0.4 de alto, origen en la base) que se exponen en la habitación del menú.
M["crystal"] = material("Crystal", "b9f0ff", 0.05, 0.1, emit="4cc9f0", strength=0.6)
M["dark_hole"] = material("DarkHole", "0b1a2e", 0.6)
M["terracotta"] = material("Terracotta", "c2663a", 0.75)
M["gold_col"] = material("GoldCollectible", "fbbf24", 0.22, 1.0, emit="6b4200", strength=0.25)
M["orb"] = material("Orb", "3b82f6", 0.08, 0.0, emit="1d4ed8", strength=1.1)
M["bronze"] = material("Bronze", "b7793a", 0.3, 1.0)
M["wood_col"] = material("WoodCollectible", "8a5a32", 0.8)

col = empty("col_crystal_skull")
bm = bmesh.new()
ellipsoid(bm, (0.15, 0.14, 0.14), (0, 0, 0.2), 18, 12)
box(bm, (0.16, 0.12, 0.09), (0, -0.04, 0.07))
mesh_object("col_crystal_skull_bone", bm, M["crystal"], smooth=True, parent=col)
bm = bmesh.new()
for x in (-0.055, 0.055):
    ellipsoid(bm, (0.035, 0.02, 0.04), (x, -0.125, 0.2), 10, 6)
ellipsoid(bm, (0.018, 0.02, 0.025), (0, -0.135, 0.13), 8, 6)
mesh_object("col_crystal_skull_holes", bm, M["dark_hole"], smooth=True, parent=col)

col = empty("col_ancient_vase")
bm = bmesh.new()
ellipsoid(bm, (0.14, 0.14, 0.16), (0, 0, 0.18), 20, 12)
cylinder(bm, 0.06, 0.12, (0, 0, 0.36), 16)
cylinder(bm, 0.085, 0.03, (0, 0, 0.43), 16)
cylinder(bm, 0.08, 0.04, (0, 0, 0.02), 16)
mesh_object("col_ancient_vase_body", bm, M["terracotta"], smooth=True, parent=col)
bm = bmesh.new()
cylinder(bm, 0.143, 0.035, (0, 0, 0.2), 24)
mesh_object("col_ancient_vase_band", bm, M["gold_col"], smooth=True, parent=col)

col = empty("col_blue_orb")
bm = bmesh.new()
cylinder(bm, 0.11, 0.04, (0, 0, 0.02), 20)
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=16, radius1=0.05, radius2=0.1, depth=0.12,
                      matrix=Matrix.Translation((0, 0, 0.1)))
mesh_object("col_blue_orb_stand", bm, M["gold_col"], smooth=True, parent=col)
bm = bmesh.new()
ellipsoid(bm, (0.12, 0.12, 0.12), (0, 0, 0.27), 20, 14)
mesh_object("col_blue_orb_sphere", bm, M["orb"], smooth=True, parent=col)

col = empty("col_crypt_key")
ring = [(0.07 * math.cos(a * math.tau / 20), 0.07 * math.sin(a * math.tau / 20) + 0.33) for a in range(20)]
tube("col_crypt_key_ring", ring, 0.018, M["bronze"], parent=col, poly=True, cyclic=True)
bm = bmesh.new()
box(bm, (0.035, 0.03, 0.25), (0, 0, 0.14))
box(bm, (0.07, 0.03, 0.03), (0.035, 0, 0.04))
box(bm, (0.05, 0.03, 0.03), (0.025, 0, 0.1))
mesh_object("col_crypt_key_shaft", bm, M["bronze"], parent=col)

col = empty("col_coin_chest")
bm = bmesh.new()
box(bm, (0.3, 0.2, 0.16), (0, 0, 0.08))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.012, segments=1, affect="EDGES")
mesh_object("col_coin_chest_box", bm, M["wood_col"], parent=col)
bm = bmesh.new()
for k in range(9):
    ang = k * 2.4
    r = 0.03 + 0.02 * (k % 3)
    cylinder(bm, 0.035, 0.012, (r * math.cos(ang), r * math.sin(ang), 0.17 + (k % 4) * 0.012), 12,
             rot=Matrix.Rotation(math.radians(15 * (k % 3 - 1)), 4, "X"))
box(bm, (0.31, 0.21, 0.025), (0, 0, 0.12))
mesh_object("col_coin_chest_gold", bm, M["gold_col"], smooth=True, parent=col)

col = empty("col_trophy")
bm = bmesh.new()
box(bm, (0.2, 0.2, 0.05), (0, 0, 0.025))
cylinder(bm, 0.03, 0.12, (0, 0, 0.11), 12)
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=20, radius1=0.05, radius2=0.14, depth=0.2,
                      matrix=Matrix.Translation((0, 0, 0.27)))
mesh_object("col_trophy_cup", bm, M["gold_col"], smooth=True, parent=col)
for side in (-1, 1):
    arc = [(side * (0.13 + 0.06 * math.sin(t * math.pi / 8)), 0.33 - t * 0.02) for t in range(9)]
    tube(f"col_trophy_handle{side}", arc, 0.014, M["gold_col"], parent=col)


# ================================================================== PARCHES DE LOGROS
# Parches de tela con costura alrededor (el juego los tiñe y les pone el bordado del icono delante).
# Miran a -Y y su cara trasera queda en Y = 0 (se cosen a una superficie).
M["patch_fabric"] = material("PatchFabric", "ffffff", 0.95)
M["patch_thread"] = material("PatchThread", "fdf6e3", 0.9)


def stitches(name, outline, parent, gap=0.022, dash=0.012, y=-0.034):
    """Puntadas cortas repartidas a lo largo de un contorno cerrado (puntos XZ)."""
    bm = bmesh.new()
    pts = outline + [outline[0]]
    seglen = [math.dist(a, b) for a, b in zip(pts, pts[1:])]
    total = sum(seglen)
    d = 0.0
    while d < total:
        acc, k = d, 0
        while acc > seglen[k]:
            acc -= seglen[k]
            k += 1
        (ax, az), (bx, bz) = pts[k], pts[k + 1]
        f = acc / seglen[k]
        x, z = ax + (bx - ax) * f, az + (bz - az) * f
        ang = math.atan2(bz - az, bx - ax)
        m = Matrix.Translation((x, y, z)) @ Matrix.Rotation(-ang, 4, "Y")
        bmesh.ops.create_cube(bm, size=1.0, matrix=m @ Matrix.Diagonal((dash, 0.008, 0.006, 1)))
        d += gap
    mesh_object(name, bm, M["patch_thread"], parent=parent)


def patch(name, outline, inner):
    root = empty(name)
    flat_shape(name + "_cloth", outline, 0.03, M["patch_fabric"], front=-0.03, parent=root)
    stitches(name + "_stitch", inner, root)


def scaled(pts, k):
    return [(x * k, z * k) for x, z in pts]


round_pts = ellipse_pts(0.29, 0.29, 0, 0, 56)
patch("patch_round", round_pts, scaled(round_pts, 0.86))
shield_pts = [(-0.26, 0.27), (0.26, 0.27), (0.26, 0.02)] + \
    [(0.26 * math.cos(math.pi * i / 16) , -0.02 - 0.27 * math.sin(math.pi * i / 16)) for i in range(1, 16)] + [(-0.26, 0.02)]
patch("patch_shield", shield_pts, scaled(shield_pts, 0.84))
hex_pts = [(0.3 * math.cos(math.pi / 6 + i * math.pi / 3), 0.3 * math.sin(math.pi / 6 + i * math.pi / 3)) for i in range(6)]
patch("patch_hex", hex_pts, scaled(hex_pts, 0.84))

# ================================================================== HABITACIÓN DEL MENÚ
# Suelo de 9x7 centrado en el origen (donde está el limo), paredes al fondo (+Y) y a los lados; sin pared delantera.
# Todo se coloca respecto a unos planos fijos para que nada se cruce ni parpadee:
#   cara interior de la pared del fondo en Y = WALL_Y; de las laterales en X = ±WALL_X
#   el zócalo (tabla, paneles, moldura, rodapié) sobresale como mucho TRIM_D de la pared
#   los muebles pegados a la pared empiezan delante de eso (Y <= FURN_Y)
# Huecos: slot_<coleccionable> (dónde se expone cada pieza) y light_* (dónde el juego pone luces).
WALL_Y, WALL_X, WALL_H = 3.5, 4.5, 4.2
TRIM_D = 0.07
FURN_Y = WALL_Y - TRIM_D - 0.01

M["plank"] = material("Plank", "a8764a", 0.75)
M["plank_dark"] = material("PlankDark", "5a3a22", 0.9)
M["wallpaper"] = material("Wallpaper", "5b4b8a", 0.9)
M["shelf_wood"] = material("ShelfWood", "6b4226", 0.7)
M["rug"] = material("Rug", "c2410c", 0.95)
M["rug_edge"] = material("RugEdge", "fbbf24", 0.9)
M["glass"] = material("Glass", "d6f2ff", 0.05)
M["pedestal"] = material("Pedestal", "e7e0f5", 0.5)
M["candle"] = material("CandleFlame", "ffd27a", 0.4, emit="ffb347", strength=4.0)
M["brass"] = material("Brass", "b08d3c", 0.35, 1.0)
M["wainscot"] = material("Wainscot", "7a4a2a", 0.7)
M["wainscot_panel"] = material("WainscotPanel", "8f5a34", 0.75)

room = empty("menu_room")

# suelo: tablas con juntas reales (huecos sobre una base oscura, sin caras superpuestas)
rng_floor = random.Random(3)
bm = bmesh.new()
box(bm, (2 * WALL_X, 2 * WALL_Y, 0.04), (0, 0, -0.04))
mesh_object("room_floor_base", bm, M["plank_dark"], parent=room)
bm = bmesh.new()
rows = 14
row_w = 2 * WALL_Y / rows
for r in range(rows):
    y = -WALL_Y + row_w * (r + 0.5)
    x = -WALL_X + rng_floor.uniform(0.2, 1.4)
    edges = [-WALL_X]
    while x < WALL_X - 0.4:
        edges.append(x)
        x += rng_floor.uniform(1.8, 3.0)
    edges.append(WALL_X)
    for x0, x1 in zip(edges, edges[1:]):
        box(bm, (x1 - x0 - 0.02, row_w - 0.03, 0.1), ((x0 + x1) / 2, y, -0.05))
mesh_object("room_floor", bm, M["plank"], parent=room)

# paredes
bm = bmesh.new()
box(bm, (2 * WALL_X + 0.6, 0.3, WALL_H), (0, WALL_Y + 0.15, WALL_H / 2))
for sx in (-1, 1):
    box(bm, (0.3, 2 * WALL_Y + 0.3, WALL_H), (sx * (WALL_X + 0.15), 0.15, WALL_H / 2))
mesh_object("room_walls", bm, M["wallpaper"], parent=room)


def wall_strip(bm, depth, height, z0):
    """Franja pegada a las tres paredes (fondo y laterales) que se unen en las esquinas sin cruzarse."""
    box(bm, (2 * WALL_X, depth, height), (0, WALL_Y - depth / 2, z0 + height / 2))
    for sx in (-1, 1):
        box(bm, (depth, 2 * WALL_Y - depth, height), (sx * (WALL_X - depth / 2), -depth / 2, z0 + height / 2))


# zócalo: tabla fina, moldura a media altura, rodapié y cornisa
bm = bmesh.new()
wall_strip(bm, 0.03, 1.0, 0.0)
wall_strip(bm, TRIM_D, 0.06, 1.0)
wall_strip(bm, TRIM_D, 0.14, 0.0)
wall_strip(bm, 0.09, 0.12, WALL_H - 0.12)
mesh_object("room_wainscot", bm, M["wainscot"], parent=room)

# paneles en relieve repartidos para caber justos en cada pared (sobresalen menos que la moldura)
bm = bmesh.new()
PANEL_W, PANEL_GAP, PANEL_D = 0.9, 0.2, 0.02
face_y = WALL_Y - 0.03 - PANEL_D / 2
span = 2 * WALL_X - 0.3
n = int((span + PANEL_GAP) // (PANEL_W + PANEL_GAP))
start = -(n * (PANEL_W + PANEL_GAP) - PANEL_GAP) / 2 + PANEL_W / 2
for k in range(n):
    box(bm, (PANEL_W, PANEL_D, 0.64), (start + k * (PANEL_W + PANEL_GAP), face_y, 0.54))
span = 2 * WALL_Y - 0.03 - 0.3
n = int((span + PANEL_GAP) // (PANEL_W + PANEL_GAP))
mid = -0.015
start = mid - (n * (PANEL_W + PANEL_GAP) - PANEL_GAP) / 2 + PANEL_W / 2
for sx in (-1, 1):
    for k in range(n):
        box(bm, (PANEL_D, PANEL_W, 0.64), (sx * (WALL_X - 0.03 - PANEL_D / 2), start + k * (PANEL_W + PANEL_GAP), 0.54))
mesh_object("room_wainscot_panels", bm, M["wainscot_panel"], parent=room)

# alfombra
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=False, segments=64, radius=1.55)
bmesh.ops.translate(bm, vec=(0, 0, 0.004), verts=bm.verts)
mesh_object("room_rug_edge", bm, M["rug_edge"], parent=room)
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=False, segments=64, radius=1.4)
bmesh.ops.translate(bm, vec=(0, 0, 0.009), verts=bm.verts)
mesh_object("room_rug", bm, M["rug"], parent=room)

SHELF_D = 0.45
SHELF_Y = FURN_Y - SHELF_D / 2
SHELF_TOPS = (0.08, 0.89, 1.69, 2.5)


def bookcase(name, x):
    bm = bmesh.new()
    w, h = 2.2, 2.5
    box(bm, (w - 0.16, 0.03, h - 0.08), (x, FURN_Y - 0.015, h / 2))
    for sx in (-1, 1):
        box(bm, (0.08, SHELF_D, h), (x + sx * (w / 2 - 0.04), SHELF_Y, h / 2))
    for top in SHELF_TOPS:
        box(bm, (w - 0.16, SHELF_D, 0.08), (x, SHELF_Y, top - 0.04))
    mesh_object(name, bm, M["shelf_wood"], parent=room)


bookcase("room_bookcase_left", -2.55)
bookcase("room_bookcase_right", 2.55)

# ventana redonda al abismo en la pared del fondo (brilla desde abajo)
M["abyss_glass"] = material("AbyssGlass", "1e1b4b", 0.2, emit="3b82f6", strength=0.9)
M["window_frame"] = material("WindowFrame", "4a2d18", 0.6)
WIN_Z, WIN_R = 2.55, 0.62
ring = [(WIN_R * math.cos(a * math.tau / 48), WIN_R * math.sin(a * math.tau / 48) + WIN_Z) for a in range(48)]
tube("room_window_frame", ring, 0.07, M["window_frame"], parent=room, loc=(0, WALL_Y - 0.05, 0), poly=True, cyclic=True)
bm = bmesh.new()
box(bm, (0.05, 0.05, 2 * WIN_R), (0, WALL_Y - 0.045, WIN_Z))
box(bm, (2 * WIN_R, 0.05, 0.05), (0, WALL_Y - 0.045, WIN_Z))
mesh_object("room_window_bars", bm, M["window_frame"], parent=room)
flat_shape("room_window_glass", ellipse_pts(WIN_R - 0.02, WIN_R - 0.02, 0, WIN_Z, 48), 0.015, M["abyss_glass"],
           front=WALL_Y - 0.018, parent=room)
empty("light_window", parent=room, loc=(0, WALL_Y - 0.7, WIN_Z - 0.2))


def vitrina(name, x, y, z_top):
    bm = bmesh.new()
    box(bm, (0.7, 0.7, z_top), (x, y, z_top / 2))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.03, segments=2, affect="EDGES")
    mesh_object(name + "_pedestal", bm, M["pedestal"], parent=room)
    bm = bmesh.new()
    box(bm, (0.62, 0.62, 0.6), (x, y, z_top + 0.3))
    mesh_object(name + "_glass", bm, M["glass"], parent=room)
    bm = bmesh.new()
    box(bm, (0.66, 0.66, 0.04), (x, y, z_top + 0.62))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.01, segments=1, affect="EDGES")
    mesh_object(name + "_lid", bm, M["shelf_wood"], parent=room)


vitrina("room_vitrina_center", 0.0, FURN_Y - 0.36, 0.95)
vitrina("room_vitrina_left", -(WALL_X - 0.8), 0.9, 0.8)
vitrina("room_vitrina_right", WALL_X - 0.8, 0.9, 0.8)

# velas en apliques de latón sobre la pared del fondo
bm_brass, bm_wax, bm_flame = bmesh.new(), bmesh.new(), bmesh.new()
for side, x in (("l", -1.1), ("r", 1.1)):
    cup_y = WALL_Y - 0.17
    box(bm_brass, (0.12, 0.02, 0.24), (x, WALL_Y - 0.01, 2.02))
    box(bm_brass, (0.03, 0.15, 0.03), (x, WALL_Y - 0.095, 1.96))
    cylinder(bm_brass, 0.07, 0.03, (x, cup_y, 1.975), 20)
    cylinder(bm_wax, 0.045, 0.22, (x, cup_y, 2.1), 20)
    ellipsoid(bm_flame, (0.035, 0.035, 0.075), (x, cup_y, 2.29), 16, 10)
    empty(f"light_candle_{side}", parent=room, loc=(x, cup_y - 0.08, 2.36))
mesh_object("room_sconces", bm_brass, M["brass"], smooth=True, parent=room)
mesh_object("room_candles", bm_wax, M["pedestal"], smooth=True, parent=room)
mesh_object("room_candle_flames", bm_flame, M["candle"], smooth=True, parent=room)


# tablón de fieltro con marco en la pared derecha: los logros se cosen en él (huecos ach_slot_<n>, 4 x 3)
M["board_felt"] = material("BoardFelt", "2f4f5f", 0.98)
BOARD_Y0, BOARD_Y1, BOARD_Z0, BOARD_Z1 = -2.35, 1.95, 1.3, 3.5
bm = bmesh.new()
box(bm, (0.04, BOARD_Y1 - BOARD_Y0, BOARD_Z1 - BOARD_Z0), (WALL_X - 0.02, (BOARD_Y0 + BOARD_Y1) / 2, (BOARD_Z0 + BOARD_Z1) / 2))
mesh_object("room_board_felt", bm, M["board_felt"], parent=room)
bm = bmesh.new()
FR = 0.09
box(bm, (0.08, BOARD_Y1 - BOARD_Y0 + 2 * FR, FR), (WALL_X - 0.04, (BOARD_Y0 + BOARD_Y1) / 2, BOARD_Z1 + FR / 2))
box(bm, (0.08, BOARD_Y1 - BOARD_Y0 + 2 * FR, FR), (WALL_X - 0.04, (BOARD_Y0 + BOARD_Y1) / 2, BOARD_Z0 - FR / 2))
box(bm, (0.08, FR, BOARD_Z1 - BOARD_Z0), (WALL_X - 0.04, BOARD_Y0 - FR / 2, (BOARD_Z0 + BOARD_Z1) / 2))
box(bm, (0.08, FR, BOARD_Z1 - BOARD_Z0), (WALL_X - 0.04, BOARD_Y1 + FR / 2, (BOARD_Z0 + BOARD_Z1) / 2))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.012, segments=1, affect="EDGES")
mesh_object("room_board_frame", bm, M["shelf_wood"], parent=room)
for r, z in enumerate((3.02, 2.4, 1.78)):
    for c, y in enumerate((-1.65, -0.7, 0.25, 1.2)):
        slot = empty(f"ach_slot_{r * 4 + c}", parent=room, loc=(WALL_X - 0.04, y, z))
        slot.rotation_euler = (0, 0, -math.pi / 2)
empty("board_view", parent=room, loc=(WALL_X - 0.04, (BOARD_Y0 + BOARD_Y1) / 2, (BOARD_Z0 + BOARD_Z1) / 2))

# la escala del hueco es la escala con la que se expone la pieza
for slot, loc, size in (("slot_col_trophy", (0.0, FURN_Y - 0.36, 0.95), 1.3),
                        ("slot_col_crystal_skull", (-(WALL_X - 0.8), 0.9, 0.8), 1.35),
                        ("slot_col_ancient_vase", (WALL_X - 0.8, 0.9, 0.8), 1.25),
                        ("slot_col_crypt_key", (-2.55, SHELF_Y, SHELF_TOPS[1]), 1.6),
                        ("slot_col_blue_orb", (-2.55, SHELF_Y, SHELF_TOPS[2]), 1.6),
                        ("slot_col_coin_chest", (2.55, SHELF_Y, SHELF_TOPS[1]), 1.8)):
    empty(slot, parent=room, loc=loc).scale = (size, size, size)

# ================================================================== guardar y exportar

os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", export_yup=True)
print("OK ->", OUT_GLB)
