"""
Genera todos los modelos del juego en Blender y los exporta a public/models/assets.glb.

Uso (desde la carpeta del proyecto):
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P blender/build_assets.py

Resultado:
  blender/assets.blend      -> archivo editable (retocar aquí y exportar con export_assets.py)
  public/models/assets.glb  -> lo que carga el juego

Convenciones: Z arriba en Blender (el exportador lo pasa a Y arriba), 1 unidad = 1 bloque,
las caras y frentes miran a -Y (hacia la cámara del juego). El juego busca los objetos por nombre.
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_GLB = os.path.normpath(os.path.join(ROOT, "..", "public", "models", "assets.glb"))
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
    "mouth": material("Mouth", "5a1020", 0.5),
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


def tube(name, points, radius, mat, parent=None, loc=(0, 0, 0)):
    """Línea gruesa redondeada (para ojos y bocas dibujadas). Puntos en el plano XZ."""
    cu = bpy.data.curves.new(name + "_curve", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new("NURBS")
    sp.points.add(len(points) - 1)
    for p, (x, z) in zip(sp.points, points):
        p.co = (x, 0.0, z, 1.0)
    sp.use_endpoint_u = True
    sp.order_u = 3
    sp.resolution_u = 6
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

bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.2)
for v in bm.verts:
    z = v.co.z
    if z > 0:
        t = z / 0.2
        v.co.x *= 1 - t * 0.85
        v.co.y *= 1 - t * 0.85
        v.co.z = z * 3.0
    v.co.z += 0.2
mesh_object("flame", bm, M["fire"], smooth=True)

bm = bmesh.new()
for k in (-0.3, 0.0, 0.3):
    box(bm, (0.9, 0.06, 0.05), (0, k, 0.025))
    box(bm, (0.06, 0.9, 0.05), (k, 0, 0.025))
mesh_object("fire_grate", bm, M["iron"])

# ================================================================== PLATAFORMA DE SALTO

pad = empty("jump_pad")
bm = bmesh.new()
cylinder(bm, 0.42, 0.1, (0, 0, 0.05), 24)
mesh_object("jump_pad_base", bm, M["pink_dark"], parent=pad)
bm = bmesh.new()
verts = ellipsoid(bm, (0.33, 0.33, 0.14), (0, 0, 0), 20, 12)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context="VERTS")
mesh_object("jump_pad_top", bm, M["pink"], smooth=True, parent=pad, loc=(0, 0, 0.1))

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
# Todo mira a -Y. El juego coloca cada pieza; aquí solo importa la forma.

# Ojo normal: blanco + pupila (con brillo) que el juego desplaza.
eye = empty("face_eye_open")
bm = bmesh.new()
ellipsoid(bm, (0.1, 0.05, 0.14))
mesh_object("face_eye_white", bm, M["white"], smooth=True, parent=eye)
bm = bmesh.new()
ellipsoid(bm, (0.058, 0.03, 0.08))
pupil = mesh_object("face_eye_pupil", bm, M["black"], smooth=True, parent=eye, loc=(0, -0.035, -0.01))
bm = bmesh.new()
ellipsoid(bm, (0.02, 0.012, 0.024), (0, 0, 0), 10, 6)
mesh_object("face_eye_shine", bm, M["white"], smooth=True, parent=pupil, loc=(0.02, -0.028, 0.035))

# Ojo de dolor ">" (el juego lo refleja para el ojo derecho "<").
tube("face_eye_pain", [(-0.055, 0.06), (0.045, 0.0), (-0.055, -0.06)], 0.022, M["black"])

# Ojo feliz "^".
tube("face_eye_happy", [(-0.065, -0.025), (-0.03, 0.03), (0.0, 0.045), (0.03, 0.03), (0.065, -0.025)], 0.022,
     M["black"])

# Boca sonriente.
tube("face_mouth_smile", [(x / 4 * 0.075, 0.03 * (x / 4) ** 2) for x in range(-4, 5)], 0.018, M["black"])

# Boca abierta de alegría: hueco oscuro + lengua.
mouth_open = empty("face_mouth_open")
bm = bmesh.new()
ellipsoid(bm, (0.075, 0.03, 0.06))
bmesh.ops.scale(bm, vec=(1, 1, 1), verts=bm.verts)
for v in bm.verts:  # media luna: parte de arriba plana
    if v.co.z > 0.012:
        v.co.z = 0.012 + (v.co.z - 0.012) * 0.2
mesh_object("face_mouth_open_hole", bm, M["mouth"], smooth=True, parent=mouth_open)
bm = bmesh.new()
ellipsoid(bm, (0.04, 0.02, 0.022))
mesh_object("face_mouth_open_tongue", bm, M["tongue"], smooth=True, parent=mouth_open, loc=(0, -0.018, -0.03))

# Boca de sorpresa "o".
bm = bmesh.new()
ellipsoid(bm, (0.035, 0.025, 0.045))
mesh_object("face_mouth_o", bm, M["mouth"], smooth=True)

# Boca de dolor en zigzag.
tube("face_mouth_pain", [(-0.08, 0.0), (-0.053, 0.022), (-0.027, -0.012), (0.0, 0.022), (0.027, -0.012),
                          (0.053, 0.022), (0.08, 0.0)], 0.017, M["black"])

# Mofletes.
bm = bmesh.new()
ellipsoid(bm, (0.055, 0.008, 0.032), (0, 0, 0), 14, 6)
mesh_object("face_blush", bm, M["blush"], smooth=True)

# Gota de sudor (dolor).
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=0.04)
for v in bm.verts:
    if v.co.z > 0:
        t = v.co.z / 0.04
        v.co.x *= 1 - t * 0.9
        v.co.y *= 1 - t * 0.9
        v.co.z *= 2.2
bmesh.ops.scale(bm, vec=(1, 0.5, 1), verts=bm.verts)
mesh_object("face_sweat", bm, M["sweat"], smooth=True)

# ================================================================== guardar y exportar

os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", export_yup=True)
print("OK ->", OUT_GLB)
