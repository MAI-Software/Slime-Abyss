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


def lathe(bm, profile, segments=32, matrix=None):
    """Sólido de revolución alrededor de Z con un perfil [(radio, z)] de abajo arriba (radio 0 = cerrado en el eje)."""
    before = set(bm.verts)
    verts = [bm.verts.new((r, 0.0, z)) for r, z in profile]
    edges = [bm.edges.new((a, b)) for a, b in zip(verts, verts[1:])]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=segments, use_merge=True)
    new = [v for v in bm.verts if v not in before]
    bmesh.ops.remove_doubles(bm, verts=new, dist=1e-5)
    new = [v for v in bm.verts if v not in before]
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=new)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))


def taper_tube(bm, points, r0, r1, segments=14):
    """Tubo por puntos 3D (en el plano XZ) que pasa de radio r0 a r1, con la punta abierta."""
    rings = []
    n = len(points)
    up = Vector((0, 1, 0))
    for k, p in enumerate(points):
        p = Vector(p)
        t = (Vector(points[min(k + 1, n - 1)]) - Vector(points[max(k - 1, 0)])).normalized()
        a = t.cross(up).normalized()
        b = a.cross(t).normalized()
        r = r0 + (r1 - r0) * k / (n - 1)
        rings.append([bm.verts.new(p + (a * math.cos(i * math.tau / segments) + b * math.sin(i * math.tau / segments)) * r)
                      for i in range(segments)])
    for A, B in zip(rings, rings[1:]):
        for i in range(segments):
            bm.faces.new((A[i], A[(i + 1) % segments], B[(i + 1) % segments], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))


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

# ================================================================== COFRE DEL ORO (salón)
# Aparece al comprar el limo de oro. Frente hacia -Y; la tapa gira sobre su bisagra trasera (gold_chest_lid)
# y dentro asoma un montón de oro con gemas y una copa (el juego añade las monedas sueltas encima y delante).

gold_chest = empty("gold_chest")
M["chest_wood"] = material("ChestWood", "7c4a24", 0.7)
M["chest_wood_dark"] = material("ChestWoodDark", "3f2412", 0.9)
M["chest_gold"] = material("ChestGold", "f5b301", 0.25, 1.0, emit="6b4200", strength=0.2)
M["chest_iron"] = material("ChestIron", "1f1b2e", 0.6, 0.6)
GC_W, GC_D, GC_H, GC_FOOT = 0.9, 0.58, 0.46, 0.04
GC_TOP = GC_FOOT + GC_H
bm = bmesh.new()
box(bm, (GC_W, GC_D, GC_H), (0, 0, GC_FOOT + GC_H / 2))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.02, segments=2, affect="EDGES")
mesh_object("gold_chest_body", bm, M["chest_wood"], parent=gold_chest)
bm = bmesh.new()
for z in (GC_FOOT + 0.15, GC_FOOT + 0.3):
    box(bm, (GC_W + 0.006, GC_D + 0.006, 0.014), (0, 0, z))
mesh_object("gold_chest_planks", bm, M["chest_wood_dark"], parent=gold_chest)
bm = bmesh.new()
for x in (-0.3, 0.3):
    box(bm, (0.075, GC_D + 0.024, GC_H + 0.016), (x, 0, GC_FOOT + GC_H / 2))
for sx in (-1, 1):
    for sy in (-1, 1):
        for z in (GC_FOOT + 0.05, GC_TOP - 0.05):
            box(bm, (0.11, 0.11, 0.11), (sx * (GC_W / 2 - 0.045), sy * (GC_D / 2 - 0.045), z))
box(bm, (0.17, 0.03, 0.2), (0, -GC_D / 2 - 0.014, GC_TOP - 0.1))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.008, segments=1, affect="EDGES")
for sx in (-1, 1):
    for sy in (-1, 1):
        ellipsoid(bm, (0.05, 0.05, 0.035), (sx * (GC_W / 2 - 0.06), sy * (GC_D / 2 - 0.06), 0.03), 12, 8)
mesh_object("gold_chest_trim", bm, M["chest_gold"], parent=gold_chest)
bm = bmesh.new()
ellipsoid(bm, (0.018, 0.01, 0.018), (0, -GC_D / 2 - 0.03, GC_TOP - 0.08), 10, 8)
box(bm, (0.012, 0.01, 0.05), (0, -GC_D / 2 - 0.03, GC_TOP - 0.115))
mesh_object("gold_chest_keyhole", bm, M["chest_iron"], parent=gold_chest)
# tapa (pivote en la bisagra de atrás)
gc_lid = empty("gold_chest_lid", parent=gold_chest, loc=(0, GC_D / 2, GC_TOP))
bm = bmesh.new()
cylinder(bm, GC_D / 2, GC_W, (0, 0, 0), 28, rot=Matrix.Rotation(math.radians(90), 4, "Y"))
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context="VERTS")
bmesh.ops.scale(bm, vec=(1, 1, 0.72), verts=bm.verts)
bmesh.ops.translate(bm, vec=(0, -GC_D / 2, 0), verts=bm.verts)
mesh_object("gold_chest_lid_wood", bm, M["chest_wood"], smooth=True, parent=gc_lid)
bm = bmesh.new()
box(bm, (GC_W - 0.02, GC_D - 0.02, 0.02), (0, -GC_D / 2, 0.01))
mesh_object("gold_chest_lid_inside", bm, M["chest_wood_dark"], parent=gc_lid)
bm = bmesh.new()
for x in (-0.3, 0.3):
    cylinder(bm, GC_D / 2 + 0.014, 0.08, (x, -GC_D / 2, 0), 28, rot=Matrix.Rotation(math.radians(90), 4, "Y"))
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context="VERTS")
bmesh.ops.scale(bm, vec=(1, 1, 0.74), verts=bm.verts)
mesh_object("gold_chest_lid_trim", bm, M["chest_gold"], smooth=True, parent=gc_lid)
# el tesoro: montón de oro, tres gemas talladas y una copa inclinada
bm = bmesh.new()
ellipsoid(bm, (0.4, 0.25, 0.1), (0, 0, GC_TOP), 32, 16)
lathe(bm, [(0.0, 0.0), (0.05, 0.0), (0.05, 0.01), (0.012, 0.03), (0.01, 0.1), (0.045, 0.12), (0.062, 0.17), (0.06, 0.205), (0.052, 0.205),
           (0.04, 0.135), (0.0, 0.128)], 28, matrix=Matrix.Translation((0.2, 0.07, GC_TOP + 0.02)) @ Matrix.Rotation(0.35, 4, "Y"))
mesh_object("gold_chest_hoard", bm, M["chest_gold"], smooth=True, parent=gold_chest)
for gname, color, emit, loc in (("Ruby", "e11d48", "9f1239", (-0.2, -0.05, GC_TOP + 0.09)), ("Sapphire", "2563eb", "1e3a8a", (0.02, 0.09, GC_TOP + 0.1)),
                                ("Emerald", "10b981", "065f46", (-0.05, -0.13, GC_TOP + 0.06))):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=1.0, matrix=Matrix.Translation(loc) @ Matrix.Diagonal((0.04, 0.04, 0.034, 1)))
    mesh_object(f"gold_chest_{gname.lower()}", bm, material(f"Hoard{gname}", color, 0.1, 0.0, emit=emit, strength=0.8), parent=gold_chest)

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
# ojos enamorados: el ojo entero es un corazón relleno con contorno (se mueve entero al mirar).
# El corazón clásico se suaviza (media con los vecinos) para redondear la punta y los lóbulos.
def heart_shape(k, dz, smooth=10):
    pts = [(16 * math.sin(t) ** 3, 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
           for t in [2 * math.pi * i / 72 for i in range(72)]]
    for _ in range(smooth):
        n = len(pts)
        pts = [((pts[i - 1][0] + 2 * pts[i][0] + pts[(i + 1) % n][0]) / 4, (pts[i - 1][1] + 2 * pts[i][1] + pts[(i + 1) % n][1]) / 4)
               for i in range(n)]
    return [(x * k, z * k + dz) for x, z in pts]


eye = empty("face_eye_heart")
flat_shape("face_eye_heart_outline", heart_shape(0.0058, 0.012), 0.006, M["black"], front=-0.02, parent=eye)
flat_shape("face_eye_heart_fill", heart_shape(0.0045, 0.012), 0.006, M["heart_iris"], front=-0.028, parent=eye)

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

# Más rasgos desbloqueables: ojos dormilones, guiño (ojo izquierdo y derecho distintos) y gafas;
# bocas pícara, vampiro y ondulada; mofletes de espirales, tirita y destellos.
tube("face_eye_sleepy", [(-0.055, 0.004), (-0.03, -0.02), (0.0, -0.027), (0.03, -0.02), (0.055, 0.004)], 0.013, M["black"])
for k, (x, z) in enumerate(((-0.05, -0.006), (-0.022, -0.028), (0.022, -0.028), (0.05, -0.006))):
    tube(f"face_eye_sleepy_lash{k}", [(x, z), (x * 1.18, z - 0.02)], 0.006, M["black"], parent=bpy.data.objects["face_eye_sleepy"], poly=True)

eye = eye_base("face_eye_wink_l", 0.062, 0.082, M["white"])
look = empty("face_eye_wink_l_look", parent=eye, loc=(0, -0.02, -0.01))
bm = bmesh.new()
ellipsoid(bm, (0.043, 0.012, 0.054), (0, 0, 0), 32, 18)
mesh_object("face_eye_wink_l_iris", bm, M["iris"], smooth=True, parent=look)
bm = bmesh.new()
ellipsoid(bm, (0.025, 0.008, 0.031), (0, 0, 0), 24, 14)
mesh_object("face_eye_wink_l_pupil", bm, M["black"], smooth=True, parent=look, loc=(0, -0.006, 0))
shines("face_eye_wink_l", look, 0.015, 0.007)
tube("face_eye_wink_r", [(-0.05, -0.022), (-0.025, 0.016), (0.0, 0.03), (0.025, 0.016), (0.05, -0.022)], 0.016, M["black"])

M["glasses"] = material("GlassesFrame", "1f2937", 0.35, 0.3)
eye = eye_base("face_eye_glasses", 0.05, 0.064, M["white"])
look = empty("face_eye_glasses_look", parent=eye, loc=(0, -0.02, -0.006))
bm = bmesh.new()
ellipsoid(bm, (0.034, 0.012, 0.042), (0, 0, 0), 32, 18)
mesh_object("face_eye_glasses_iris", bm, M["iris"], smooth=True, parent=look)
bm = bmesh.new()
ellipsoid(bm, (0.02, 0.008, 0.025), (0, 0, 0), 24, 14)
mesh_object("face_eye_glasses_pupil", bm, M["black"], smooth=True, parent=look, loc=(0, -0.006, 0))
shines("face_eye_glasses", look, 0.012, 0.006)
ring = [(0.088 * math.cos(a * math.tau / 40), 0.08 * math.sin(a * math.tau / 40)) for a in range(40)]
tube("face_eye_glasses_frame", ring, 0.011, M["glasses"], parent=bpy.data.objects["face_eye_glasses"], loc=(0, -0.045, 0),
     poly=True, cyclic=True)
# medio puente hacia el centro de la cara (el ojo derecho se refleja)
tube("face_eye_glasses_bridge", [(0.086, 0.012), (0.1, 0.018)], 0.009, M["glasses"], parent=bpy.data.objects["face_eye_glasses"],
     loc=(0, -0.045, 0), poly=True)

tube("face_mouth_smirk", [(-0.04, 0.0), (-0.018, -0.01), (0.012, -0.012), (0.036, 0.004), (0.046, 0.02)], 0.009, M["black"])
mouth = empty("face_mouth_vampire")
tube("face_mouth_vampire_line", [(-0.042, 0.008), (-0.02, -0.008), (0.0, -0.012), (0.02, -0.008), (0.042, 0.008)], 0.009,
     M["black"], parent=mouth)
for x in (-0.017, 0.017):
    flat_shape(f"face_mouth_vampire_fang{'l' if x < 0 else 'r'}", [(x - 0.008, -0.009), (x + 0.008, -0.009), (x, -0.03)], 0.004,
               M["white"], front=-0.004, parent=mouth)
tube("face_mouth_wobbly", [(-0.046, -0.002), (-0.03, 0.01), (-0.012, -0.004), (0.006, -0.014), (0.024, -0.002), (0.044, 0.008)],
     0.009, M["black"])

swirl = [(0.0009 * t * math.cos(t), 0.0009 * t * math.sin(t)) for t in [i * 0.35 for i in range(4, 44)]]
tube("face_blush_swirls", swirl, 0.0045, M["blush_line"])
M["bandage"] = material("Bandage", "f3c9a0", 0.85)
M["bandage_pad"] = material("BandagePad", "e7ae80", 0.9)
bandage = empty("face_blush_bandage")
band = [(0.04 * math.cos(a * math.tau / 36) * (1 if abs(math.cos(a * math.tau / 36)) < 0.9 else 1), 0.014 * math.sin(a * math.tau / 36))
        for a in range(36)]
flat_shape("face_blush_bandage_strip", [(x * 1.0, z * 1.25) for x, z in ellipse_pts(0.042, 0.016, 0, 0, 40)], 0.004, M["bandage"],
           parent=bandage)
flat_shape("face_blush_bandage_pad", ellipse_pts(0.014, 0.012, 0, 0, 24), 0.003, M["bandage_pad"], front=-0.002, parent=bandage)
sparkles = empty("face_blush_sparkles")
M["sparkle"] = material("SparkleWhite", "fff7d6", 0.4, emit="fde68a", strength=0.4)
flat_shape("face_blush_sparkles_big", star_pts(0.02, 0.006, 4, -0.006, 0.006), 0.004, M["sparkle"], parent=sparkles)
flat_shape("face_blush_sparkles_small", star_pts(0.011, 0.0035, 4, 0.02, -0.014), 0.004, M["sparkle"], parent=sparkles)

# Ojos de anime: "tomoe" (iris rojo con anillo y tres comas) y "ondas" (anillos concéntricos sobre lila).
M["tomoe_red"] = material("TomoeRed", "c1121f", 0.35)
M["ripple"] = material("RippleIris", "c4b5fd", 0.4)


def comma(r, tail):
    """Coma de tomoe: círculo con una cola curva (puntos XZ, centrada en el círculo)."""
    pts = [(r * math.cos(a), r * math.sin(a)) for a in [math.radians(d) for d in range(40, 361, 20)]]
    pts += [(r * 1.25 * math.cos(math.radians(20)) + tail * 0.35, r * 1.1 + tail * 0.35),
            (tail * 0.55, r + tail * 0.9),
            (r * 0.2, r * 1.05)]
    return pts


eye = eye_base("face_eye_tomoe", 0.062, 0.082, M["white"])
look = empty("face_eye_tomoe_look", parent=eye, loc=(0, -0.02, -0.004))
bm = bmesh.new()
ellipsoid(bm, (0.05, 0.012, 0.062), (0, 0, 0), 32, 18)
mesh_object("face_eye_tomoe_iris", bm, M["tomoe_red"], smooth=True, parent=look)
ring = [(0.03 * math.cos(a * math.tau / 36), 0.037 * math.sin(a * math.tau / 36)) for a in range(36)]
tube("face_eye_tomoe_ring", ring, 0.0028, M["black"], parent=look, loc=(0, -0.013, 0), poly=True, cyclic=True)
bm = bmesh.new()
ellipsoid(bm, (0.011, 0.006, 0.013), (0, 0, 0), 20, 12)
mesh_object("face_eye_tomoe_pupil", bm, M["black"], smooth=True, parent=look, loc=(0, -0.014, 0))
for k in range(3):
    ang = math.pi / 2 + k * math.tau / 3
    cx, cz = 0.03 * math.cos(ang), 0.037 * math.sin(ang)
    # la coma sigue la tangente del anillo
    rot = ang + math.pi
    pts = [(cx + x * math.cos(rot) - z * math.sin(rot), cz + x * math.sin(rot) + z * math.cos(rot)) for x, z in comma(0.0075, 0.012)]
    flat_shape(f"face_eye_tomoe_comma{k}", pts, 0.004, M["black"], front=-0.019, parent=look)

eye = eye_base("face_eye_ripple", 0.062, 0.082, M["ripple"])
look = empty("face_eye_ripple_look", parent=eye, loc=(0, -0.031, 0))
for k, r in enumerate((0.014, 0.028, 0.042)):
    ring = [(r * math.cos(a * math.tau / 40), r * 1.25 * math.sin(a * math.tau / 40)) for a in range(40)]
    tube(f"face_eye_ripple_ring{k}", ring, 0.0026, M["black"], parent=look, poly=True, cyclic=True)
bm = bmesh.new()
ellipsoid(bm, (0.006, 0.004, 0.007), (0, 0, 0), 16, 10)
mesh_object("face_eye_ripple_pupil", bm, M["black"], smooth=True, parent=look, loc=(0, -0.002, 0))

# bigotes de gato (moflete izquierdo; el derecho se refleja): tres líneas que se abren hacia fuera
whiskers = empty("face_blush_whiskers")
for k, (z0, z1) in enumerate(((0.012, 0.03), (0.0, 0.0), (-0.012, -0.03))):
    tube(f"face_blush_whiskers_line{k}", [(0.012, z0), (-0.024, (z0 + z1) / 2 + z1 * 0.1), (-0.056, z1 * 0.85)], 0.0032, M["black"],
         parent=whiskers)
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

# Sierra circular: disco dentado que gira dentro de una ranura del suelo (divide al limo sin dañarlo).
# El disco va en el plano YZ (corta a lo largo de Y, como la cuchilla); el juego lo hace girar sobre su eje X.
saw = empty("saw")
bm = bmesh.new()
box(bm, (0.2, 0.98, 0.05), (0, 0, 0.025))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.015, segments=1, affect="EDGES")
mesh_object("saw_housing", bm, M["steel_dark"], parent=saw)
bm = bmesh.new()
box(bm, (0.07, 0.9, 0.02), (0, 0, 0.051))
mesh_object("saw_slot", bm, M["black"], parent=saw)
M["saw"] = material("SawSteel", "e8edf5", 0.32, 0.55, emit="3a4252", strength=0.35)
disc = empty("saw_disc", parent=saw, loc=(0, 0, 0.2))
bm = bmesh.new()
TEETH = 26
outline = []
for k in range(TEETH):
    a0 = k * math.tau / TEETH
    a1 = (k + 0.62) * math.tau / TEETH
    outline.append((0.35 * math.cos(a0), 0.35 * math.sin(a0)))   # fondo del diente
    outline.append((0.43 * math.cos(a1), 0.43 * math.sin(a1)))   # punta inclinada (sierra)
verts = [bm.verts.new((-0.018, y, z)) for y, z in outline]
face = bm.faces.new(verts)
ext = bmesh.ops.extrude_face_region(bm, geom=[face], use_keep_orig=True)
bmesh.ops.translate(bm, vec=(0.036, 0, 0), verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
mesh_object("saw_blade", bm, M["saw"], parent=disc)
bm = bmesh.new()
cylinder(bm, 0.11, 0.07, (0, 0, 0), 18, rot=Matrix.Rotation(math.radians(90), 4, "Y"))
mesh_object("saw_hub", bm, M["steel_dark"], smooth=True, parent=disc)
bm = bmesh.new()
for k in range(4):
    a = k * math.tau / 4 + 0.4
    cylinder(bm, 0.035, 0.074, (0, 0.2 * math.cos(a), 0.2 * math.sin(a)), 10, rot=Matrix.Rotation(math.radians(90), 4, "Y"))
mesh_object("saw_holes", bm, M["steel_dark"], parent=disc)

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

# Plantas: pared de hiedra entrelazada (bloquea el paso hasta que arde). Ocupa la casilla, de z=0 a ~1.1.
# Un núcleo oscuro, tallos leñosos que se cruzan en diagonal por las cuatro caras y por arriba, y hojas
# de hiedra (forma de corazón con puntas) cubriéndolo casi todo. Pocos polígonos: tallos con bisel bajo
# y hojas planas de pocos vértices.
import random
rnd = random.Random(7)
M["ivy_stem"] = material("IvyStem", "5b4a2e", 0.85)
M["ivy_core"] = material("IvyCore", "1f4d24", 0.9)
M["leaf_light"] = material("LeafLight", "5cb84a", 0.65)
HALF, TOP = 0.47, 1.1
plant = empty("plant_block")

bm = bmesh.new()
box(bm, (0.84, 0.84, TOP - 0.08), (0, 0, (TOP - 0.08) / 2))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.06, segments=1, affect="EDGES")
mesh_object("plant_core", bm, M["ivy_core"], parent=plant)


def vine_curve(name, pts, radius, parent):
    """Tallo: curva suave con bisel de 2 segmentos (ligera)."""
    cu = bpy.data.curves.new(name + "_curve", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 1
    cu.use_fill_caps = False
    sp = cu.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for q, co in zip(sp.points, pts):
        q.co = (*co, 1.0)
    sp.use_endpoint_u = True
    sp.order_u = 3
    sp.resolution_u = 4
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    SCENE.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    return me


def face_point(face, u, h, out=0.0):
    """Punto sobre una cara lateral: u en [-1, 1] a lo ancho, h altura; out lo separa de la cara."""
    r = HALF + out
    return {0: (u * HALF, -r, h), 1: (r, u * HALF, h), 2: (-u * HALF, r, h), 3: (-r, -u * HALF, h)}[face]


stems = bmesh.new()
leaf_spots = []
for face in range(4):
    # dos familias de diagonales que se cruzan: parecen trenzadas porque alternan delante y detrás
    for fam in (1, -1):
        for k in range(3):
            u0 = -1.3 + k * 0.9 + rnd.uniform(-0.25, 0.25)
            slope = rnd.uniform(0.3, 0.5)
            pts = []
            for t in range(6):
                h = 0.02 + t * (TOP - 0.06) / 5 + rnd.uniform(-0.04, 0.04)
                u = max(-1.0, min(1.0, fam * (u0 + t * slope) + rnd.uniform(-0.08, 0.08)))
                weave = 0.0 + 0.03 * (0.5 + 0.5 * math.sin(t * 2.2 + k + (0 if fam > 0 else math.pi)))
                pts.append(face_point(face, u, h, weave))
                leaf_spots.append((face, u, h))
            me = vine_curve(f"ivy_stem_{face}_{fam}_{k}", pts, 0.017, plant)
            stems.from_mesh(me)
            bpy.data.meshes.remove(me)
# por arriba: tallos que cruzan la tapa
for k in range(4):
    a = k * math.pi / 4
    ca, sa = math.cos(a), math.sin(a)
    pts = [(ca * -0.46 + sa * 0.1, sa * -0.46 - ca * 0.1, TOP - 0.02), (0.0, 0.0, TOP + 0.03), (ca * 0.46 - sa * 0.1, sa * 0.46 + ca * 0.1, TOP - 0.02)]
    me = vine_curve(f"ivy_stem_top_{k}", pts, 0.02, plant)
    stems.from_mesh(me)
    bpy.data.meshes.remove(me)
mesh_object("plant_stems", stems, M["ivy_stem"], smooth=True, parent=plant)


def ivy_leaf(bm, center, normal, size, spin):
    """Hoja de hiedra plana: 5 puntas (corazón lobulado), 11 vértices en abanico."""
    n = Vector(normal).normalized()
    up = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((0, 1, 0))
    tx = n.cross(up).normalized()
    ty = tx.cross(n).normalized()
    c, sn = math.cos(spin), math.sin(spin)
    ax, ay = tx * c + ty * sn, -tx * sn + ty * c
    outline = [(0.0, -0.55), (0.35, -0.2), (0.55, 0.15), (0.3, 0.2), (0.35, 0.55), (0.0, 0.35),
               (-0.35, 0.55), (-0.3, 0.2), (-0.55, 0.15), (-0.35, -0.2)]
    base = Vector(center)
    verts = [bm.verts.new(base + n * 0.01)]
    for (x, y) in outline:
        verts.append(bm.verts.new(base + (ax * x + ay * y) * size + n * (0.012 * (1 - abs(y)))))
    m = len(outline)
    for q in range(m):
        bm.faces.new((verts[0], verts[1 + q], verts[1 + (q + 1) % m]))


leaves = {"leaf": bmesh.new(), "leaf_dark": bmesh.new(), "leaf_light": bmesh.new()}
normals = {0: (0, -1, 0), 1: (1, 0, 0), 2: (0, 1, 0), 3: (-1, 0, 0)}
for face in range(4):
    for row in range(7):
        for col in range(6):
            # filas al tresbolillo: sin huecos regulares
            u = -1.05 + col * 0.42 + (0.21 if row % 2 else 0) + rnd.uniform(-0.1, 0.1)
            h = 0.02 + row * 0.165 + rnd.uniform(-0.05, 0.05)
            if h > TOP or abs(u) > 1.12:
                continue
            nx, ny, nz = normals[face]
            # hojas algo caídas y giradas; en las esquinas asoman y rompen la silueta cúbica
            tilt = Vector((nx, ny, nz)) + Vector((rnd.uniform(-0.45, 0.45), rnd.uniform(-0.45, 0.45), rnd.uniform(-0.2, 0.6)))
            key = rnd.choice(("leaf", "leaf", "leaf_dark", "leaf_light"))
            ivy_leaf(leaves[key], face_point(face, u, h, 0.035 + rnd.uniform(0, 0.05)), tilt, rnd.uniform(0.14, 0.2), rnd.uniform(-0.7, 0.7))
for k in range(22):
    x, y = rnd.uniform(-0.46, 0.46), rnd.uniform(-0.46, 0.46)
    key = rnd.choice(("leaf", "leaf_dark", "leaf_light"))
    ivy_leaf(leaves[key], (x, y, TOP - 0.04 + rnd.uniform(0, 0.08)), (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), 1), rnd.uniform(0.14, 0.2), rnd.uniform(0, 6.28))
for key, lbm in leaves.items():
    mesh_object(f"plant_{key}", lbm, M[key], parent=plant)

# Roca agrietada: grietas oscuras sobre la losa (el juego la coloca sobre un bloque de suelo más gris).
M["crack"] = material("CrackDark", "2b2420", 0.95)
crack = empty("crack_lines")
cracks = bmesh.new()
paths = [
    [(-0.44, -0.1), (-0.25, -0.05), (-0.12, 0.08), (0.05, 0.02), (0.2, 0.15), (0.44, 0.12)],
    [(-0.12, 0.08), (-0.18, 0.28), (-0.1, 0.44)],
    [(0.05, 0.02), (0.1, -0.2), (0.02, -0.34), (0.12, -0.44)],
    [(0.2, 0.15), (0.3, 0.3), (0.28, 0.44)],
    [(-0.25, -0.05), (-0.32, -0.25), (-0.44, -0.3)],
]
for n_, path in enumerate(paths):
    ob = tube(f"crack_path_{n_}", path, 0.018 if n_ == 0 else 0.013, M["crack"], plane="XY", poly=True)
    ob.data.transform(Matrix.Scale(0.35, 4, (0, 0, 1)))
    cracks.from_mesh(ob.data)
    bpy.data.objects.remove(ob, do_unlink=True)
bmesh.ops.translate(cracks, verts=cracks.verts, vec=(0, 0, 0.004))
mesh_object("crack_lines_mesh", cracks, M["crack"], parent=crack)

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

# vía ancha (entre carriles 0.6, traviesas de 0.84: no se sale de la casilla) para la vagoneta
RAIL_GAUGE = 0.6
rail = empty("rail_piece")
bm = bmesh.new()
for y in (-RAIL_GAUGE / 2, RAIL_GAUGE / 2):
    box(bm, (1.0, 0.06, 0.06), (0, y, 0.0))
mesh_object("rail_piece_rails", bm, M["rail_metal"], parent=rail)
bm = bmesh.new()
for x in (-0.25, 0.25):
    box(bm, (0.1, 0.84, 0.04), (x, 0, -0.05))
for y in (-0.16, 0.16):
    box(bm, (1.0, 0.08, 0.06), (0, y, -0.1))
mesh_object("rail_piece_wood", bm, M["rail_wood"], parent=rail)

# rail_cart: vagoneta-cuenco que lleva al limo por la vía (X = avance, origen = altura de los carriles)
M["cart_metal"] = material("CartMetal", "3f4a63", 0.35, 0.9)
cart = empty("rail_cart")
bm = bmesh.new()
lathe(bm, [(0.0, 0.07), (0.16, 0.075), (0.3, 0.12), (0.37, 0.2), (0.39, 0.3), (0.35, 0.3), (0.33, 0.22), (0.26, 0.15), (0.14, 0.115), (0.0, 0.11)], 36)
mesh_object("rail_cart_bowl", bm, M["station_stone"], smooth=True, parent=cart)
tube("rail_cart_rim", [(0.372 * math.cos(a * math.tau / 36), 0.372 * math.sin(a * math.tau / 36)) for a in range(36)], 0.022,
     M["rail_glow"], parent=cart, loc=(0, 0, 0.3), poly=True, cyclic=True, plane="XY")
bm = bmesh.new()
box(bm, (0.44, RAIL_GAUGE - 0.02, 0.04), (0, 0, 0.06))
for x in (-0.16, 0.16):
    for y in (-RAIL_GAUGE / 2, RAIL_GAUGE / 2):
        cylinder(bm, 0.055, 0.035, (x, y, 0.045), 16, rot=Matrix.Rotation(math.radians(90), 4, "X"))
mesh_object("rail_cart_chassis", bm, M["cart_metal"], smooth=True, parent=cart)

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


# ================================================================== CARAS NUEVAS
# Opciones de Mi limo que de momento se ven bloqueadas ("Próximamente").
M["button_eye"] = material("ButtonEye", "3b2a52", 0.45)
M["tear"] = material("Tear", "9ee7ff", 0.1, emit="4cc9f0", strength=0.3)
M["face_paint"] = material("FacePaint", "4f46e5", 0.7)
M["petal"] = material("Petal", "f9a8d4", 0.7)
M["petal_center"] = material("PetalCenter", "fcd34d", 0.6)
M["mole"] = material("Mole", "4a2c20", 0.7)
M["kiss"] = material("KissLips", "f43f5e", 0.5)

# ojos de botón cosido
eye = empty("face_eye_button")
flat_shape("face_eye_button_disc", ellipse_pts(0.06, 0.066), 0.012, M["button_eye"], front=-0.012, parent=eye)
tube("face_eye_button_rim", ellipse_pts(0.047, 0.052, 0, 0, 32), 0.0045, M["black"], parent=eye, loc=(0, -0.014, 0), poly=True, cyclic=True)
for k, (x, z) in enumerate(((-0.014, 0.014), (0.014, 0.014), (-0.014, -0.014), (0.014, -0.014))):
    flat_shape(f"face_eye_button_hole{k}", ellipse_pts(0.0075, 0.0075, x, z, 12), 0.002, M["white"], front=-0.016, parent=eye)

# ojos hipnóticos: espiral sobre blanco
eye = eye_base("face_eye_spiral", 0.062, 0.082, M["white"])
look = empty("face_eye_spiral_look", parent=eye, loc=(0, -0.03, 0))
pts = [((0.006 + 0.045 * (k / 39)) * math.cos(k / 39 * math.tau * 2.2), (0.006 + 0.045 * (k / 39)) * 1.25 * math.sin(k / 39 * math.tau * 2.2)) for k in range(40)]
tube("face_eye_spiral_line", pts, 0.0055, M["black"], parent=look)

# ojos de media luna (cerrados y contentos)
moon = [(0.05 * math.cos(math.pi * i / 16), 0.035 * math.sin(math.pi * i / 16) - 0.012) for i in range(17)]
moon += [(0.05 * math.cos(math.pi * (16 - i) / 16) * 0.8, 0.012 * math.sin(math.pi * (16 - i) / 16) - 0.006) for i in range(17)]
flat_shape("face_eye_moon", moon, 0.008, M["black"], front=-0.02)

# ojos llorosos: grandes y brillantes con una lágrima
eye = eye_base("face_eye_teary", 0.068, 0.088, M["white"])
look = empty("face_eye_teary_look", parent=eye, loc=(0, -0.02, -0.012))
bm = bmesh.new()
ellipsoid(bm, (0.05, 0.012, 0.062), (0, 0, 0), 32, 18)
mesh_object("face_eye_teary_iris", bm, M["iris"], smooth=True, parent=look)
bm = bmesh.new()
ellipsoid(bm, (0.022, 0.008, 0.026), (0, 0, 0), 20, 12)
mesh_object("face_eye_teary_pupil", bm, M["black"], smooth=True, parent=look, loc=(0, -0.007, 0))
shines("face_eye_teary", look, 0.019, 0.01)
bm = bmesh.new()
ellipsoid(bm, (0.014, 0.008, 0.02), (0, 0, 0), 16, 10)
mesh_object("face_eye_teary_tear", bm, M["tear"], smooth=True, parent=eye, loc=(0.04, -0.035, -0.085))

# bocas
tube("face_mouth_flat", [(-0.036, 0.004), (0.036, -0.004)], 0.009, M["black"], poly=True)
tube("face_mouth_zigzag", [(-0.044, 0.0), (-0.029, 0.012), (-0.015, -0.01), (0.0, 0.012), (0.015, -0.01), (0.029, 0.012), (0.044, 0.0)],
     0.008, M["black"], poly=True)
mouth = empty("face_mouth_bunny")
tube("face_mouth_bunny_line", [(-0.034, 0.008), (-0.017, -0.006), (0.0, -0.009), (0.017, -0.006), (0.034, 0.008)], 0.008, M["black"], parent=mouth)
for k, x in enumerate((-0.009, 0.009)):
    flat_shape(f"face_mouth_bunny_tooth{k}", [(x - 0.008, -0.006), (x + 0.008, -0.006), (x + 0.008, -0.03), (x - 0.008, -0.03)], 0.004, M["white"],
               front=-0.004, parent=mouth)
    tube(f"face_mouth_bunny_edge{k}", [(x - 0.008, -0.006), (x - 0.008, -0.03), (x + 0.008, -0.03), (x + 0.008, -0.006)], 0.0025, M["black"],
         parent=mouth, loc=(0, -0.006, 0), poly=True)
mouth = empty("face_mouth_kiss")
flat_shape("face_mouth_kiss_lips", heart_shape(0.0016, 0.0), 0.006, M["kiss"], front=-0.006, parent=mouth)
tube("face_mouth_kiss_line", [(-0.012, 0.0), (0.012, 0.0)], 0.0035, M["mouth"], parent=mouth, loc=(0, -0.013, 0), poly=True)
mouth = empty("face_mouth_drool")
tube("face_mouth_drool_line", [(-0.04, 0.01), (-0.02, -0.01), (0.0, -0.015), (0.02, -0.01), (0.04, 0.01)], 0.009, M["black"], parent=mouth)
bm = bmesh.new()
ellipsoid(bm, (0.011, 0.007, 0.017), (0, 0, 0), 16, 10)
mesh_object("face_mouth_drool_drop", bm, M["tear"], smooth=True, parent=mouth, loc=(0.03, -0.01, -0.02))
mouth = empty("face_mouth_teeth")
grin_pts = [(-0.05, 0.012), (0.05, 0.012), (0.038, -0.024), (-0.038, -0.024)]
flat_shape("face_mouth_teeth_white", grin_pts, 0.006, M["white"], front=-0.004, parent=mouth)
tube("face_mouth_teeth_outline", grin_pts + [grin_pts[0]], 0.005, M["black"], parent=mouth, loc=(0, -0.006, 0), poly=True)
tube("face_mouth_teeth_mid", [(-0.046, -0.006), (0.046, -0.006)], 0.0028, M["black"], parent=mouth, loc=(0, -0.006, 0), poly=True)
for k, x in enumerate((-0.025, 0.0, 0.025)):
    tube(f"face_mouth_teeth_gap{k}", [(x, 0.012), (x, -0.024)], 0.0025, M["black"], parent=mouth, loc=(0, -0.006, 0), poly=True)

# mofletes
paint = empty("face_blush_paint")
for k, z in enumerate((0.012, -0.008)):
    flat_shape(f"face_blush_paint_stripe{k}", [(-0.035, z + 0.005), (0.035, z + 0.009), (0.035, z - 0.002), (-0.035, z - 0.006)], 0.004,
               M["face_paint"], parent=paint)
flowers = empty("face_blush_flowers")
for p in range(5):
    a = p * math.tau / 5 + math.pi / 2
    flat_shape(f"face_blush_flowers_petal{p}", ellipse_pts(0.011, 0.008, 0.013 * math.cos(a), 0.013 * math.sin(a), 16), 0.004, M["petal"],
               parent=flowers)
flat_shape("face_blush_flowers_center", ellipse_pts(0.007, 0.007, 0, 0, 12), 0.004, M["petal_center"], front=-0.002, parent=flowers)
flat_shape("face_blush_mole", ellipse_pts(0.007, 0.007, 0.018, -0.012, 14), 0.004, M["mole"])


# ================================================================== COLECCIONABLES NUEVOS
# Estantería (~0.4 de alto), pared (se cuelgan: parte trasera en Y = 0, miran a -Y) y suelo (~1 de alto).
M["glass_col"] = material("GlassCollectible", "d6f2ff", 0.05, 0.0, emit="7dd3fc", strength=0.25)
M["lamp_glow"] = material("LampGlow", "ffd27a", 0.3, emit="ffb347", strength=2.5)
M["iron_col"] = material("IronCollectible", "374151", 0.45, 0.8)
M["red_col"] = material("RedCollectible", "dc2626", 0.5)
M["green_col"] = material("GreenCollectible", "16a34a", 0.6)
M["leaf_gold"] = material("LeafGold", "fbbf24", 0.25, 1.0, emit="a16207", strength=0.4)
M["ice_col"] = material("IceCollectible", "a5f3fc", 0.05, 0.1, emit="22d3ee", strength=0.5)
M["egg"] = material("Egg", "fef3c7", 0.6)
M["rock"] = material("Rock", "57534e", 0.9)
M["amethyst"] = material("Amethyst", "a855f7", 0.1, 0.1, emit="7e22ce", strength=0.6)
M["scarab"] = material("Scarab", "0d9488", 0.2, 0.9)
M["sand_col"] = material("SandCollectible", "e8b86d", 0.9)
M["paper"] = material("Paper", "f8fafc", 0.9)
M["blueprint"] = material("Blueprint", "1d4ed8", 0.8)
M["slime_col"] = material("SlimeCollectible", "2f8cff", 0.25, 0.0, emit="0b3a8c", strength=0.3)
M["purple_cloth"] = material("PurpleCloth", "7c3aed", 0.9)
M["cactus"] = material("Cactus", "4d7c0f", 0.8)
M["flower_pink"] = material("FlowerPink", "f472b6", 0.6)
M["blue_sea"] = material("GlobeSea", "2563eb", 0.4)
M["snow"] = material("Snow", "ffffff", 0.7)
M["pine"] = material("Pine", "166534", 0.8)

# --- estantería ---
col = empty("col_root_lantern")
bm = bmesh.new()
cylinder(bm, 0.1, 0.04, (0, 0, 0.02), 16)
cylinder(bm, 0.08, 0.03, (0, 0, 0.28), 16)
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=16, radius1=0.08, radius2=0.02, depth=0.08, matrix=Matrix.Translation((0, 0, 0.33)))
for k in range(4):
    a = k * math.tau / 4 + math.pi / 4
    box(bm, (0.015, 0.015, 0.24), (0.075 * math.cos(a), 0.075 * math.sin(a), 0.15))
mesh_object("col_root_lantern_frame", bm, M["iron_col"], smooth=True, parent=col)
bm = bmesh.new()
cylinder(bm, 0.065, 0.22, (0, 0, 0.15), 16)
mesh_object("col_root_lantern_glow", bm, M["lamp_glow"], smooth=True, parent=col)
tube("col_root_lantern_ring", [(0.035 * math.cos(a * math.tau / 16), 0.4 + 0.035 * math.sin(a * math.tau / 16)) for a in range(16)], 0.008,
     M["iron_col"], parent=col, poly=True, cyclic=True)

col = empty("col_mini_train")
bm = bmesh.new()
box(bm, (0.32, 0.14, 0.1), (0, 0, 0.1))
box(bm, (0.12, 0.14, 0.12), (0.1, 0, 0.21))
cylinder(bm, 0.03, 0.1, (-0.1, 0, 0.2), 12)
mesh_object("col_mini_train_body", bm, M["red_col"], parent=col)
bm = bmesh.new()
for x in (-0.1, 0.1):
    for y in (-0.075, 0.075):
        cylinder(bm, 0.045, 0.02, (x, y, 0.045), 16, rot=Matrix.Rotation(math.pi / 2, 4, "X"))
box(bm, (0.13, 0.15, 0.02), (0.1, 0, 0.28))
mesh_object("col_mini_train_wheels", bm, M["iron_col"], smooth=True, parent=col)

col = empty("col_spring_toy")
bm = bmesh.new()
cylinder(bm, 0.11, 0.04, (0, 0, 0.02), 20)
mesh_object("col_spring_toy_base", bm, M["iron_col"], smooth=True, parent=col)
spring = []
for k in range(64):
    t = k / 63
    spring.append((0.07 * math.cos(t * math.tau * 5), 0.05 + t * 0.24))
tube("col_spring_toy_coil", spring, 0.012, M["iron_col"], parent=col)
bm = bmesh.new()
cylinder(bm, 0.1, 0.05, (0, 0, 0.32), 20)
mesh_object("col_spring_toy_cap", bm, M["pink"], smooth=True, parent=col)

col = empty("col_acorn_jar")
M["acorn_nut"] = material("AcornNut", "b86b2e", 0.45)
M["acorn_cap"] = material("AcornCap", "5c3b1e", 0.95)
bm = bmesh.new()
lathe(bm, [(0.0, 0.004), (0.095, 0.004), (0.108, 0.02), (0.112, 0.2), (0.1, 0.228), (0.082, 0.24), (0.082, 0.262), (0.09, 0.27)], 40)
mesh_object("col_acorn_jar_glass", bm, M["glass_col"], smooth=True, parent=col)
bm = bmesh.new()
cylinder(bm, 0.097, 0.035, (0, 0, 0.286), 32)
ellipsoid(bm, (0.03, 0.03, 0.022), (0, 0, 0.306), 16, 10)
mesh_object("col_acorn_jar_lid", bm, M["wood_col"], smooth=True, parent=col)
tube("col_acorn_jar_twine", [(0.086 * math.cos(k * math.tau / 24), 0.086 * math.sin(k * math.tau / 24)) for k in range(24)], 0.006,
     M["acorn_cap"], parent=col, loc=(0, 0, 0.25), poly=True, cyclic=True, plane="XY")
# bellotas apretadas en capas hasta el cuello del bote, cada una con su caperuza y su rabito
rng_acorn = random.Random(21)
nuts, caps = bmesh.new(), bmesh.new()


def acorn(x, y, z, tilt, spin):
    m = Matrix.Translation((x, y, z)) @ Matrix.Rotation(spin, 4, "Z") @ Matrix.Rotation(tilt, 4, "X")
    bmesh.ops.create_uvsphere(nuts, u_segments=12, v_segments=8, radius=1.0,
                              matrix=m @ Matrix.Translation((0, 0, -0.006)) @ Matrix.Diagonal((0.026, 0.026, 0.034, 1)))
    bmesh.ops.create_uvsphere(caps, u_segments=12, v_segments=6, radius=1.0,
                              matrix=m @ Matrix.Translation((0, 0, 0.02)) @ Matrix.Diagonal((0.029, 0.029, 0.016, 1)))
    bmesh.ops.create_cone(caps, cap_ends=True, cap_tris=True, segments=6, radius1=0.004, radius2=0.0025, depth=0.016,
                          matrix=m @ Matrix.Translation((0, 0, 0.04)))


for layer, z in enumerate((0.036, 0.086, 0.136, 0.186, 0.228)):
    ring, r = (6, 0.058) if layer < 4 else (4, 0.034)
    for k in range(ring):
        ang = k * math.tau / ring + layer * 0.5
        acorn(r * math.cos(ang), r * math.sin(ang), z + rng_acorn.uniform(-0.006, 0.006), rng_acorn.uniform(0.3, 1.4), rng_acorn.uniform(0, math.tau))
    if layer < 4:
        acorn(0, 0, z + 0.01, rng_acorn.uniform(0.2, 1.2), rng_acorn.uniform(0, math.tau))
mesh_object("col_acorn_jar_acorns", nuts, M["acorn_nut"], smooth=True, parent=col)
mesh_object("col_acorn_jar_caps", caps, M["acorn_cap"], smooth=True, parent=col)

col = empty("col_ice_crystal")
bm = bmesh.new()
for k, (x, y, h, tilt) in enumerate(((0, 0, 0.4, 0), (0.07, 0.02, 0.26, 0.35), (-0.07, -0.01, 0.22, -0.4), (0.02, -0.06, 0.18, 0.3))):
    m = Matrix.Translation((x, y, 0.02)) @ Matrix.Rotation(tilt, 4, "Y") @ Matrix.Translation((0, 0, h / 2))
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=6, radius1=0.045, radius2=0.0, depth=h, matrix=m)
mesh_object("col_ice_crystal_shards", bm, M["ice_col"], parent=col)
bm = bmesh.new()
cylinder(bm, 0.11, 0.03, (0, 0, 0.015), 12)
mesh_object("col_ice_crystal_base", bm, M["rock"], parent=col)

col = empty("col_cracked_egg")
bm = bmesh.new()
ellipsoid(bm, (0.11, 0.11, 0.15), (0, 0, 0.17), 24, 16)
mesh_object("col_cracked_egg_shell", bm, M["egg"], smooth=True, parent=col)
tube("col_cracked_egg_crack", [(-0.1, 0.2), (-0.05, 0.16), (-0.02, 0.22), (0.02, 0.15), (0.06, 0.21), (0.1, 0.17)], 0.006, M["black"],
     parent=col, loc=(0, -0.1, 0), poly=True)
tube("col_cracked_egg_nest", [(0.12 * math.cos(a * math.tau / 20), 0.12 * math.sin(a * math.tau / 20)) for a in range(20)], 0.03,
     M["wood_col"], parent=col, loc=(0, 0, 0.04), poly=True, cyclic=True, plane="XY")

col = empty("col_fire_lamp")
M["lamp_gem"] = material("LampGem", "dc2626", 0.15, 0.0, emit="7f1d1d", strength=0.6)
M["flame_core"] = material("FlameCore", "fff3c4", 0.3, emit="ffe08a", strength=4.0)
bm = bmesh.new()
# pie torneado
lathe(bm, [(0.0, 0.0), (0.075, 0.0), (0.08, 0.012), (0.05, 0.028), (0.03, 0.045), (0.034, 0.062)], 36)
mesh_object("col_fire_lamp_foot", bm, M["gold_col"], smooth=True, parent=col)
bm = bmesh.new()
# cuerpo en gota aplastada, cuello y tapa con remate
lathe(bm, [(0.0, 0.055), (0.07, 0.065), (0.13, 0.095), (0.155, 0.13), (0.145, 0.162), (0.1, 0.186), (0.05, 0.2), (0.04, 0.214), (0.0, 0.214)], 40)
lathe(bm, [(0.0, 0.21), (0.052, 0.214), (0.056, 0.228), (0.036, 0.24), (0.02, 0.262), (0.0, 0.27)], 32)
ellipsoid(bm, (0.017, 0.017, 0.017), (0, 0, 0.284), 14, 10)
bmesh.ops.scale(bm, vec=(1, 0.74, 1), verts=bm.verts)
# pico largo que se afina y sube
taper_tube(bm, [(0.1, 0, 0.125), (0.17, 0, 0.14), (0.235, 0, 0.17), (0.285, 0, 0.21), (0.318, 0, 0.245)], 0.042, 0.014)
mesh_object("col_fire_lamp_body", bm, M["gold_col"], smooth=True, parent=col)
tube("col_fire_lamp_handle", [(-0.11, 0.175), (-0.19, 0.205), (-0.24, 0.165), (-0.225, 0.105), (-0.14, 0.11)], 0.013, M["gold_col"], parent=col)
# franja de bronce con tres gemas en el frente
tube("col_fire_lamp_band", [(0.157 * math.cos(k * math.tau / 40), 0.116 * math.sin(k * math.tau / 40)) for k in range(40)], 0.008,
     M["bronze"], parent=col, loc=(0, 0, 0.13), poly=True, cyclic=True, plane="XY")
bm = bmesh.new()
for x in (-0.055, 0.0, 0.055):
    bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=1.0,
                              matrix=Matrix.Translation((x, -0.118 + abs(x) * 0.12, 0.13)) @ Matrix.Diagonal((0.016, 0.01, 0.016, 1)))
mesh_object("col_fire_lamp_gems", bm, M["lamp_gem"], parent=col)
# llama doble: halo naranja y corazón claro
flame = teardrop("col_fire_lamp_flame", 0.036, M["lamp_glow"])
flame.parent = col
flame.location = (0.325, 0, 0.268)
core = teardrop("col_fire_lamp_core", 0.018, M["flame_core"])
core.parent = col
core.location = (0.325, -0.006, 0.262)

col = empty("col_geode")
bm = bmesh.new()
ellipsoid(bm, (0.16, 0.12, 0.16), (0, 0.02, 0.15), 20, 14)
mesh_object("col_geode_rock", bm, M["rock"], smooth=True, parent=col)
bm = bmesh.new()
rng_geode = random.Random(8)
for k in range(12):
    a = rng_geode.uniform(0, math.tau)
    r = rng_geode.uniform(0, 0.09)
    x, z = r * math.cos(a), 0.15 + r * math.sin(a)
    m = Matrix.Translation((x, -0.09, z)) @ Matrix.Rotation(math.pi / 2, 4, "X") @ Matrix.Rotation(rng_geode.uniform(-0.4, 0.4), 4, "Y")
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=5, radius1=0.022, radius2=0.0, depth=0.07, matrix=m)
mesh_object("col_geode_crystals", bm, M["amethyst"], parent=col)

col = empty("col_crystal_crown")
bm = bmesh.new()
cylinder(bm, 0.14, 0.07, (0, 0, 0.1), 32)
for k in range(8):
    a = k * math.tau / 8
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=0.03, radius2=0.004, depth=0.12,
                          matrix=Matrix.Translation((0.13 * math.cos(a), 0.13 * math.sin(a), 0.19)))
mesh_object("col_crystal_crown_band", bm, M["gold_col"], smooth=True, parent=col)
bm = bmesh.new()
for k in range(8):
    a = k * math.tau / 8 + math.pi / 8
    ellipsoid(bm, (0.018, 0.018, 0.022), (0.142 * math.cos(a), 0.142 * math.sin(a), 0.1), 10, 8)
mesh_object("col_crystal_crown_gems", bm, M["ice_col"], smooth=True, parent=col)

col = empty("col_scarab")
bm = bmesh.new()
cylinder(bm, 0.12, 0.04, (0, 0, 0.02), 20)
mesh_object("col_scarab_stand", bm, M["sand_col"], smooth=True, parent=col)
bm = bmesh.new()
ellipsoid(bm, (0.09, 0.13, 0.07), (0, 0.01, 0.1), 20, 12)
ellipsoid(bm, (0.05, 0.04, 0.04), (0, -0.13, 0.09), 14, 8)
mesh_object("col_scarab_shell", bm, M["scarab"], smooth=True, parent=col)
bm = bmesh.new()
for sx in (-1, 1):
    for y in (-0.06, 0.0, 0.07):
        box(bm, (0.08, 0.012, 0.012), (sx * 0.1, y, 0.06))
box(bm, (0.004, 0.2, 0.006), (0, 0.02, 0.17))
mesh_object("col_scarab_legs", bm, M["black"], parent=col)

col = empty("col_hourglass")
bm = bmesh.new()
for z in (0.02, 0.4):
    cylinder(bm, 0.12, 0.04, (0, 0, z), 20)
for k in range(3):
    a = k * math.tau / 3
    cylinder(bm, 0.012, 0.36, (0.1 * math.cos(a), 0.1 * math.sin(a), 0.21), 8)
mesh_object("col_hourglass_frame", bm, M["wood_col"], smooth=True, parent=col)
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=20, radius1=0.08, radius2=0.012, depth=0.17, matrix=Matrix.Translation((0, 0, 0.125)))
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=20, radius1=0.012, radius2=0.08, depth=0.17, matrix=Matrix.Translation((0, 0, 0.295)))
mesh_object("col_hourglass_glass", bm, M["glass_col"], smooth=True, parent=col)
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=16, radius1=0.065, radius2=0.01, depth=0.08, matrix=Matrix.Translation((0, 0, 0.08)))
mesh_object("col_hourglass_sand", bm, M["sand_col"], smooth=True, parent=col)

col = empty("col_compass")
bm = bmesh.new()
cylinder(bm, 0.07, 0.03, (0, 0.05, 0.015), 16)
box(bm, (0.03, 0.03, 0.12), (0, 0.05, 0.08))
mesh_object("col_compass_stand", bm, M["wood_col"], smooth=True, parent=col)
bm = bmesh.new()
cylinder(bm, 0.14, 0.04, (0, 0.02, 0.25), 32, rot=Matrix.Rotation(math.pi / 2, 4, "X"))
mesh_object("col_compass_case", bm, M["bronze"], smooth=True, parent=col)
flat_shape("col_compass_face", ellipse_pts(0.12, 0.12, 0, 0.25, 32), 0.005, M["paper"], front=-0.005, parent=col)
flat_shape("col_compass_north", [(-0.018, 0.25), (0.018, 0.25), (0.0, 0.35)], 0.004, M["red_col"], front=-0.01, parent=col)
flat_shape("col_compass_south", [(-0.018, 0.25), (0.0, 0.15), (0.018, 0.25)], 0.004, M["black"], front=-0.01, parent=col)

col = empty("col_slime_plush")
bm = bmesh.new()
ellipsoid(bm, (0.17, 0.15, 0.13), (0, 0, 0.13), 28, 18)
mesh_object("col_slime_plush_body", bm, M["slime_col"], smooth=True, parent=col)
bm = bmesh.new()
for x in (-0.05, 0.05):
    ellipsoid(bm, (0.018, 0.01, 0.026), (x, -0.135, 0.16), 12, 8)
mesh_object("col_slime_plush_eyes", bm, M["black"], smooth=True, parent=col)
tube("col_slime_plush_smile", [(-0.03, 0.115), (-0.015, 0.1), (0.0, 0.112), (0.015, 0.1), (0.03, 0.115)], 0.006, M["black"], parent=col,
     loc=(0, -0.145, 0))

col = empty("col_dizzy_top")
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=24, radius1=0.005, radius2=0.14, depth=0.16, matrix=Matrix.Translation((0, 0, 0.09)))
mesh_object("col_dizzy_top_body", bm, M["flower_pink"], smooth=True, parent=col)
bm = bmesh.new()
cylinder(bm, 0.14, 0.05, (0, 0, 0.19), 24)
cylinder(bm, 0.02, 0.12, (0, 0, 0.27), 12)
mesh_object("col_dizzy_top_cap", bm, M["purple_cloth"], smooth=True, parent=col)
tube("col_dizzy_top_stripe", [(0.142 * math.cos(a * math.tau / 24), 0.142 * math.sin(a * math.tau / 24)) for a in range(24)], 0.012,
     M["petal_center"], parent=col, loc=(0, 0, 0.17), poly=True, cyclic=True, plane="XY")

col = empty("col_snow_globe")
bm = bmesh.new()
cylinder(bm, 0.12, 0.08, (0, 0, 0.04), 24)
mesh_object("col_snow_globe_base", bm, M["wood_col"], smooth=True, parent=col)
bm = bmesh.new()
ellipsoid(bm, (0.13, 0.13, 0.13), (0, 0, 0.2), 28, 18)
mesh_object("col_snow_globe_glass", bm, M["glass_col"], smooth=True, parent=col)
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.05, radius2=0.0, depth=0.14, matrix=Matrix.Translation((0, 0, 0.18)))
mesh_object("col_snow_globe_tree", bm, M["pine"], smooth=True, parent=col)
bm = bmesh.new()
rng_snow = random.Random(4)
for k in range(14):
    a, r = rng_snow.uniform(0, math.tau), rng_snow.uniform(0, 0.09)
    ellipsoid(bm, (0.008, 0.008, 0.008), (r * math.cos(a), r * math.sin(a), rng_snow.uniform(0.12, 0.3)), 6, 4)
cylinder(bm, 0.1, 0.02, (0, 0, 0.1), 20)
mesh_object("col_snow_globe_snow", bm, M["snow"], smooth=True, parent=col)

# --- pared ---
# --- vitrina ---
# vagoneta de mina cargada de oro sobre un tramo de vía (capítulo 2, el de los raíles)
col = empty("col_mine_cart")
bm = bmesh.new()
for y in (-0.075, 0.075):
    box(bm, (0.5, 0.018, 0.022), (0, y, 0.031))
for k in range(5):
    box(bm, (0.015, 0.2, 0.012), (-0.2 + k * 0.1, 0, 0.026))
mesh_object("col_mine_cart_rails", bm, M["iron_col"], parent=col)
bm = bmesh.new()
for k in range(5):
    box(bm, (0.045, 0.24, 0.02), (-0.2 + k * 0.1, 0, 0.01))
mesh_object("col_mine_cart_sleepers", bm, M["wood_col"], parent=col)
# caja que se abre hacia arriba, con flejes de hierro
bm = bmesh.new()
box(bm, (0.3, 0.2, 0.15), (0, 0, 0.165))
for v in bm.verts:
    if v.co.z > 0.165:
        v.co.x *= 1.14
        v.co.y *= 1.16
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.008, segments=1, affect="EDGES")
mesh_object("col_mine_cart_body", bm, M["wood_col"], parent=col)
bm = bmesh.new()
for x in (-0.09, 0.09):
    box(bm, (0.022, 0.224, 0.155), (x, 0, 0.165))
box(bm, (0.35, 0.24, 0.018), (0, 0, 0.24))
mesh_object("col_mine_cart_bands", bm, M["iron_col"], parent=col)
bm = bmesh.new()
for x in (-0.1, 0.1):
    for y in (-0.075, 0.075):
        cylinder(bm, 0.045, 0.02, (x, y + (0.012 if y > 0 else -0.012), 0.065), 20, rot=Matrix.Rotation(math.radians(90), 4, "X"))
mesh_object("col_mine_cart_wheels", bm, M["black"], smooth=True, parent=col)
# montón de oro con pepitas y dos gemas
rng_cart = random.Random(12)
bm = bmesh.new()
ellipsoid(bm, (0.16, 0.1, 0.05), (0, 0, 0.245), 20, 12)
for k in range(9):
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0, matrix=Matrix.Translation(
        (rng_cart.uniform(-0.12, 0.12), rng_cart.uniform(-0.07, 0.07), 0.27 + rng_cart.uniform(0, 0.03))) @ Matrix.Diagonal((0.03, 0.026, 0.024, 1)))
mesh_object("col_mine_cart_gold", bm, M["gold_col"], parent=col)
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=1.0, matrix=Matrix.Translation((-0.05, -0.03, 0.3)) @ Matrix.Diagonal((0.028, 0.028, 0.024, 1)))
mesh_object("col_mine_cart_ruby", bm, M["red_col"], parent=col)
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=1.0, matrix=Matrix.Translation((0.07, 0.03, 0.295)) @ Matrix.Diagonal((0.026, 0.026, 0.022, 1)))
mesh_object("col_mine_cart_gem", bm, M["ice_col"], parent=col)

# --- pared ---
col = empty("col_leaf_frame")
flat_shape("col_leaf_frame_back", [(-0.26, 0.0), (0.26, 0.0), (0.26, 0.6), (-0.26, 0.6)], 0.02, M["purple_cloth"], front=-0.03, parent=col)
bm = bmesh.new()
for (sx, sz, cx, cz) in ((0.58, 0.05, 0, 0.0), (0.58, 0.05, 0, 0.6), (0.05, 0.6, -0.27, 0.3), (0.05, 0.6, 0.27, 0.3)):
    box(bm, (sx, 0.05, sz), (cx, -0.035, cz))
mesh_object("col_leaf_frame_frame", bm, M["gold_col"], parent=col)
leaf = [(0.16 * math.sin(math.pi * i / 20) * (1 - i / 40), 0.1 + 0.4 * i / 20) for i in range(21)]
leaf += [(-x, z) for x, z in reversed(leaf[1:-1])]
flat_shape("col_leaf_frame_leaf", leaf, 0.01, M["leaf_gold"], front=-0.045, parent=col)

col = empty("col_pickaxes")
flat_shape("col_pickaxes_plaque", ellipse_pts(0.24, 0.2, 0, 0.3, 32), 0.03, M["wood_col"], front=-0.03, parent=col)
for k, sgn in enumerate((-1, 1)):
    ang = sgn * 0.7
    c, s = math.cos(ang), math.sin(ang)
    handle = [(-0.28 * s, 0.3 - 0.28 * c), (0.28 * s, 0.3 + 0.28 * c)]
    tube(f"col_pickaxes_handle{k}", handle, 0.018, M["wood"], parent=col, loc=(0, -0.05, 0), poly=True)
    hx, hz = 0.26 * s, 0.3 + 0.26 * c
    head = [(hx - 0.14 * c, hz + 0.14 * s - 0.04), (hx, hz + 0.02), (hx + 0.14 * c, hz - 0.14 * s - 0.04)]
    tube(f"col_pickaxes_head{k}", head, 0.022, M["iron_col"], parent=col, loc=(0, -0.06, 0))

col = empty("col_star_banner")
tube("col_star_banner_rod", [(-0.3, 0.62), (0.3, 0.62)], 0.018, M["gold_col"], parent=col, loc=(0, -0.03, 0), poly=True)
flat_shape("col_star_banner_cloth", [(-0.26, 0.6), (0.26, 0.6), (0.26, 0.15), (0.0, 0.0), (-0.26, 0.15)], 0.015, M["purple_cloth"], front=-0.04,
           parent=col)
flat_shape("col_star_banner_star", star_pts(0.14, 0.06, 5, 0, 0.36), 0.01, M["leaf_gold"], front=-0.05, parent=col)

col = empty("col_painting")
flat_shape("col_painting_canvas", [(-0.28, 0.0), (0.28, 0.0), (0.28, 0.5), (-0.28, 0.5)], 0.02, M["paper"], front=-0.03, parent=col)
bm = bmesh.new()
for (sx, sz, cx, cz) in ((0.62, 0.05, 0, -0.01), (0.62, 0.05, 0, 0.51), (0.05, 0.56, -0.29, 0.25), (0.05, 0.56, 0.29, 0.25)):
    box(bm, (sx, 0.06, sz), (cx, -0.035, cz))
mesh_object("col_painting_frame", bm, M["gold_col"], parent=col)
flat_shape("col_painting_slime", [(0.16 * math.cos(math.pi * i / 24), 0.12 + 0.2 * math.sin(math.pi * i / 24)) for i in range(25)], 0.006,
           M["slime_col"], front=-0.04, parent=col)
for k, x in enumerate((-0.05, 0.05)):
    flat_shape(f"col_painting_eye{k}", ellipse_pts(0.015, 0.022, x, 0.22, 12), 0.004, M["black"], front=-0.045, parent=col)

col = empty("col_desert_mask")
mask = ellipse_pts(0.17, 0.26, 0, 0.3, 40)
flat_shape("col_desert_mask_face", mask, 0.05, M["sand_col"], front=-0.05, parent=col)
for k, x in enumerate((-0.07, 0.07)):
    flat_shape(f"col_desert_mask_eye{k}", [(x - 0.045, 0.36), (x + 0.045, 0.34), (x + 0.02, 0.3), (x - 0.04, 0.31)], 0.004, M["black"], front=-0.055,
               parent=col)
for k, z in enumerate((0.2, 0.15)):
    tube(f"col_desert_mask_stripe{k}", [(-0.09, z), (0.09, z)], 0.008, M["red_col"], parent=col, loc=(0, -0.055, 0), poly=True)
flat_shape("col_desert_mask_crest", star_pts(0.1, 0.04, 6, 0, 0.58), 0.02, M["leaf_gold"], front=-0.045, parent=col)

col = empty("col_blueprint")
flat_shape("col_blueprint_sheet", [(-0.3, 0.0), (0.3, 0.0), (0.3, 0.46), (-0.3, 0.46)], 0.008, M["blueprint"], front=-0.012, parent=col)
bm = bmesh.new()
for k in range(1, 6):
    box(bm, (0.58, 0.004, 0.004), (0, -0.014, k * 0.077))
for k in range(1, 8):
    box(bm, (0.004, 0.004, 0.44), (-0.3 + k * 0.075, -0.014, 0.23))
mesh_object("col_blueprint_grid", bm, M["paper"], parent=col)
tube("col_blueprint_ramp", [(-0.2, 0.08), (-0.05, 0.08), (0.05, 0.2), (0.2, 0.2), (0.2, 0.36)], 0.009, M["paper"], parent=col, loc=(0, -0.018, 0), poly=True)
bm = bmesh.new()
for x, z in ((-0.27, 0.43), (0.27, 0.43)):
    cylinder(bm, 0.018, 0.02, (x, -0.02, z), 12, rot=Matrix.Rotation(math.pi / 2, 4, "X"))
mesh_object("col_blueprint_pins", bm, M["red_col"], smooth=True, parent=col)

# --- suelo ---
col = empty("col_cactus_pot")
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=24, radius1=0.16, radius2=0.2, depth=0.26, matrix=Matrix.Translation((0, 0, 0.13)))
mesh_object("col_cactus_pot_pot", bm, M["terracotta"], smooth=True, parent=col)
bm = bmesh.new()
ellipsoid(bm, (0.11, 0.11, 0.36), (0, 0, 0.58), 20, 14)
ellipsoid(bm, (0.06, 0.06, 0.13), (0.17, 0, 0.62), 14, 10)
ellipsoid(bm, (0.06, 0.06, 0.1), (-0.16, 0, 0.72), 14, 10)
box(bm, (0.08, 0.06, 0.05), (0.12, 0, 0.52))
box(bm, (0.08, 0.06, 0.05), (-0.11, 0, 0.64))
mesh_object("col_cactus_pot_cactus", bm, M["cactus"], smooth=True, parent=col)
bm = bmesh.new()
for k in range(5):
    a = k * math.tau / 5
    ellipsoid(bm, (0.035, 0.035, 0.02), (0.03 * math.cos(a), 0.03 * math.sin(a), 0.94), 10, 6)
mesh_object("col_cactus_pot_flower", bm, M["flower_pink"], smooth=True, parent=col)

col = empty("col_sphinx")
bm = bmesh.new()
box(bm, (0.5, 0.8, 0.12), (0, 0.05, 0.06))
box(bm, (0.36, 0.62, 0.22), (0, 0.12, 0.23))
box(bm, (0.1, 0.34, 0.08), (-0.12, -0.3, 0.16))
box(bm, (0.1, 0.34, 0.08), (0.12, -0.3, 0.16))
box(bm, (0.22, 0.22, 0.26), (0, -0.16, 0.5))
mesh_object("col_sphinx_body", bm, M["sand_col"], parent=col)
flat_shape("col_sphinx_headdress", [(-0.2, 0.62), (0.2, 0.62), (0.26, 0.36), (0.12, 0.36), (0.1, 0.56), (-0.1, 0.56), (-0.12, 0.36), (-0.26, 0.36)],
           0.24, M["leaf_gold"], front=-0.28, parent=col)
bm = bmesh.new()
for x in (-0.05, 0.05):
    box(bm, (0.04, 0.01, 0.02), (x, -0.275, 0.52))
mesh_object("col_sphinx_eyes", bm, M["black"], parent=col)

col = empty("col_globe")
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=24, radius1=0.2, radius2=0.08, depth=0.1, matrix=Matrix.Translation((0, 0, 0.05)))
cylinder(bm, 0.025, 0.4, (0, 0, 0.3), 12)
mesh_object("col_globe_stand", bm, M["wood_col"], smooth=True, parent=col)
bm = bmesh.new()
ellipsoid(bm, (0.26, 0.26, 0.26), (0, 0, 0.78), 32, 20)
mesh_object("col_globe_sea", bm, M["blue_sea"], smooth=True, parent=col)
bm = bmesh.new()
rng_globe = random.Random(12)
for k in range(9):
    lon, lat = rng_globe.uniform(0, math.tau), rng_globe.uniform(-0.9, 0.9)
    cx, cy, cz = 0.262 * math.cos(lat) * math.cos(lon), 0.262 * math.cos(lat) * math.sin(lon), 0.78 + 0.262 * math.sin(lat)
    ellipsoid(bm, (0.06, 0.06, 0.05), (cx, cy, cz), 12, 8)
mesh_object("col_globe_land", bm, M["green_col"], smooth=True, parent=col)
tube("col_globe_ring", [(0.3 * math.cos(math.pi * i / 16 - math.pi / 2), 0.78 + 0.3 * math.sin(math.pi * i / 16 - math.pi / 2)) for i in range(17)],
     0.015, M["gold_col"], parent=col)

col = empty("col_cannonballs")
bm = bmesh.new()
box(bm, (0.62, 0.62, 0.08), (0, 0, 0.04))
mesh_object("col_cannonballs_pallet", bm, M["wood_col"], parent=col)
bm = bmesh.new()
R_BALL = 0.1
for layer, n in enumerate((3, 2, 1)):
    z = 0.08 + R_BALL + layer * R_BALL * 1.414
    for i in range(n):
        for j in range(n):
            ellipsoid(bm, (R_BALL, R_BALL, R_BALL), ((i - (n - 1) / 2) * 2 * R_BALL, (j - (n - 1) / 2) * 2 * R_BALL, z), 16, 10)
mesh_object("col_cannonballs_balls", bm, M["iron_col"], smooth=True, parent=col)



col = empty("col_abyss_heart")
M["abyss_heart"] = material("AbyssHeart", "d946ef", 0.08, 0.2, emit="a21caf", strength=1.4)
M["velvet"] = material("Velvet", "1e1b4b", 0.95)
RING_R, RING_Z = 0.56, 0.62
flat_shape("col_abyss_heart_velvet", ellipse_pts(RING_R, RING_R, 0, RING_Z, 48), 0.02, M["velvet"], front=-0.03, parent=col)
tube("col_abyss_heart_ring", [(RING_R * math.cos(a * math.tau / 48), RING_Z + RING_R * math.sin(a * math.tau / 48)) for a in range(48)], 0.06,
     M["gold_col"], parent=col, loc=(0, -0.05, 0), poly=True, cyclic=True)
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=1.0,
                          matrix=Matrix.Translation((0, -0.14, RING_Z)) @ Matrix.Diagonal((0.26, 0.13, 0.32, 1)))
mesh_object("col_abyss_heart_gem", bm, M["abyss_heart"], smooth=False, parent=col)
bm = bmesh.new()
for k in range(8):
    a = k * math.tau / 8 + math.pi / 8
    ellipsoid(bm, (0.035, 0.03, 0.035), (RING_R * math.cos(a), -0.09, RING_Z + RING_R * math.sin(a)), 8, 6)
mesh_object("col_abyss_heart_studs", bm, M["ice_col"], smooth=False, parent=col)
bm = bmesh.new()
for k in range(8):
    a = k * math.tau / 8
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=4, radius1=0.04, radius2=0.0, depth=0.14,
                          matrix=Matrix.Translation(((RING_R + 0.12) * math.cos(a), -0.05, RING_Z + (RING_R + 0.12) * math.sin(a)))
                          @ Matrix.Rotation(-a + math.pi / 2, 4, "Y") @ Matrix.Rotation(math.pi / 2, 4, "Y"))
mesh_object("col_abyss_heart_rays", bm, M["gold_col"], smooth=False, parent=col)

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
# Habitación cerrada: suelo de 9 de ancho con el limo en el origen, pared del fondo (+Y), laterales, pared delantera
# con la puerta (-Y, detrás de la cámara del menú) y techo con vigas. La pared delantera y el techo no dan sombra.
# Todo se coloca respecto a unos planos fijos para que nada se cruce ni parpadee:
#   cara interior de la pared del fondo en Y = WALL_Y; de las laterales en X = ±WALL_X
#   el zócalo (tabla, paneles, moldura, rodapié) sobresale como mucho TRIM_D de la pared
#   los muebles pegados a la pared empiezan delante de eso (Y <= FURN_Y)
# Huecos: slot_<coleccionable> (dónde se expone cada pieza) y light_* (dónde el juego pone luces).
WALL_Y, WALL_X, WALL_H = 3.5, 4.5, 4.2
# cara interior de la pared delantera en Y = -FRONT_Y (la cámara del menú queda dentro)
FRONT_Y = 5.0
ROOM_MID_Y = (WALL_Y - FRONT_Y) / 2
ROOM_D = WALL_Y + FRONT_Y
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
box(bm, (2 * WALL_X, ROOM_D, 0.04), (0, ROOM_MID_Y, -0.04))
mesh_object("room_floor_base", bm, M["plank_dark"], parent=room)
bm = bmesh.new()
rows = 17
row_w = ROOM_D / rows
for r in range(rows):
    y = -FRONT_Y + row_w * (r + 0.5)
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
    box(bm, (0.3, ROOM_D + 0.6, WALL_H), (sx * (WALL_X + 0.15), ROOM_MID_Y, WALL_H / 2))
mesh_object("room_walls", bm, M["wallpaper"], parent=room)
bm = bmesh.new()
box(bm, (2 * WALL_X + 0.6, 0.3, WALL_H), (0, -FRONT_Y - 0.15, WALL_H / 2))
mesh_object("room_front_wall", bm, M["wallpaper"], parent=room)

# techo de yeso oscuro con vigas de madera de pared a pared
M["ceiling"] = material("Ceiling", "3b2f5c", 0.95)
bm = bmesh.new()
box(bm, (2 * WALL_X + 0.6, ROOM_D + 0.6, 0.2), (0, ROOM_MID_Y, WALL_H + 0.1))
mesh_object("room_ceiling", bm, M["ceiling"], parent=room)
bm = bmesh.new()
BEAMS = 6
for k in range(BEAMS):
    box(bm, (2 * WALL_X, 0.22, 0.16), (0, -FRONT_Y + 0.7 + k * (ROOM_D - 1.4) / (BEAMS - 1), WALL_H - 0.08))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.015, segments=1, affect="EDGES")
mesh_object("room_ceiling_beams", bm, M["shelf_wood"], parent=room)


def wall_strip(bm, depth, height, z0):
    """Franja pegada a las cuatro paredes que se unen en las esquinas sin cruzarse."""
    box(bm, (2 * WALL_X, depth, height), (0, WALL_Y - depth / 2, z0 + height / 2))
    box(bm, (2 * WALL_X, depth, height), (0, -FRONT_Y + depth / 2, z0 + height / 2))
    for sx in (-1, 1):
        box(bm, (depth, ROOM_D - 2 * depth, height), (sx * (WALL_X - depth / 2), ROOM_MID_Y, z0 + height / 2))


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
DOOR_X, DOOR_W, DOOR_H = 2.6, 1.1, 2.3
for k in range(n):
    x = start + k * (PANEL_W + PANEL_GAP)
    box(bm, (PANEL_W, PANEL_D, 0.64), (x, face_y, 0.54))
    # pared delantera: los mismos paneles salvo donde está la puerta
    if abs(x - DOOR_X) > DOOR_W / 2 + PANEL_W / 2 + 0.12:
        box(bm, (PANEL_W, PANEL_D, 0.64), (x, -FRONT_Y + 0.03 + PANEL_D / 2, 0.54))
span = ROOM_D - 0.06 - 0.3
n = int((span + PANEL_GAP) // (PANEL_W + PANEL_GAP))
mid = ROOM_MID_Y
start = mid - (n * (PANEL_W + PANEL_GAP) - PANEL_GAP) / 2 + PANEL_W / 2
for sx in (-1, 1):
    for k in range(n):
        box(bm, (PANEL_D, PANEL_W, 0.64), (sx * (WALL_X - 0.03 - PANEL_D / 2), start + k * (PANEL_W + PANEL_GAP), 0.54))
mesh_object("room_wainscot_panels", bm, M["wainscot_panel"], parent=room)

# puerta de la habitación en la pared delantera (hoja con cuarterones, marco y pomo)
fy = -FRONT_Y
bm = bmesh.new()
box(bm, (DOOR_W, 0.06, DOOR_H), (DOOR_X, fy + 0.07, DOOR_H / 2))
mesh_object("room_door", bm, M["wainscot_panel"], parent=room)
bm = bmesh.new()
for sx in (-1, 1):
    box(bm, (0.12, 0.12, DOOR_H + 0.12), (DOOR_X + sx * (DOOR_W / 2 + 0.06), fy + 0.06, (DOOR_H + 0.12) / 2))
box(bm, (DOOR_W + 0.24, 0.12, 0.12), (DOOR_X, fy + 0.06, DOOR_H + 0.06))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.012, segments=1, affect="EDGES")
mesh_object("room_door_frame", bm, M["shelf_wood"], parent=room)
bm = bmesh.new()
for z in (0.62, 1.62):
    box(bm, (DOOR_W - 0.3, 0.02, 0.8), (DOOR_X, fy + 0.11, z))
mesh_object("room_door_panels", bm, M["wainscot"], parent=room)
bm = bmesh.new()
ellipsoid(bm, (0.05, 0.05, 0.05), (DOOR_X - DOOR_W / 2 + 0.14, fy + 0.15, 1.1), 12, 8)
mesh_object("room_door_knob", bm, M["brass"], smooth=True, parent=room)

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

VITRINA_LEN, VITRINA_GAP = 2.1, 0.65


def vitrina(name, x, y, z_top, along):
    """Vitrina alargada (a lo largo de X o de Y) con tres huecos dentro y uno más encima de la tapa."""
    sx, sy = (VITRINA_LEN, 0.7) if along == "x" else (0.7, VITRINA_LEN)
    bm = bmesh.new()
    box(bm, (sx, sy, z_top), (x, y, z_top / 2))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.03, segments=2, affect="EDGES")
    mesh_object(name + "_pedestal", bm, M["pedestal"], parent=room)
    bm = bmesh.new()
    box(bm, (sx - 0.08, sy - 0.08, 0.6), (x, y, z_top + 0.3))
    mesh_object(name + "_glass", bm, M["glass"], parent=room)
    bm = bmesh.new()
    box(bm, (sx - 0.04, sy - 0.04, 0.04), (x, y, z_top + 0.62))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.01, segments=1, affect="EDGES")
    mesh_object(name + "_lid", bm, M["shelf_wood"], parent=room)
    # marcos de madera entre huecos para que se lean los tres compartimentos
    bm = bmesh.new()
    for k in (-0.5, 0.5):
        off = k * VITRINA_GAP * 1.0
        if along == "x":
            box(bm, (0.03, sy - 0.06, 0.6), (x + off, y, z_top + 0.3))
        else:
            box(bm, (sx - 0.06, 0.03, 0.6), (x, y + off, z_top + 0.3))
    mesh_object(name + "_mullions", bm, M["shelf_wood"], parent=room)


vitrina("room_vitrina_center", 0.0, FURN_Y - 0.36, 0.95, "x")
vitrina("room_vitrina_left", -(WALL_X - 0.8), 0.9, 0.8, "y")
vitrina("room_vitrina_right", WALL_X - 0.8, 0.9, 0.8, "y")

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


# tablones de fieltro con marco en las paredes laterales: los logros se cosen en ellos
# (huecos ach_slot_<n>: 0-29 en la pared derecha, 30-59 en la izquierda; 6 columnas x 5 filas cada uno)
M["board_felt"] = material("BoardFelt", "2f4f5f", 0.98)
BOARD_Y0, BOARD_Y1, BOARD_Z0, BOARD_Z1 = -2.9, 2.6, 1.3, 3.95
BOARD_COLS = (-2.45, -1.55, -0.65, 0.25, 1.15, 2.05)
BOARD_ROWS = (3.66, 3.15, 2.64, 2.13, 1.62)
for side, sx in (("right", 1), ("left", -1)):
    wx = sx * WALL_X
    bm = bmesh.new()
    box(bm, (0.04, BOARD_Y1 - BOARD_Y0, BOARD_Z1 - BOARD_Z0), (wx - sx * 0.02, (BOARD_Y0 + BOARD_Y1) / 2, (BOARD_Z0 + BOARD_Z1) / 2))
    mesh_object(f"room_board_felt_{side}", bm, M["board_felt"], parent=room)
    bm = bmesh.new()
    FR = 0.09
    box(bm, (0.08, BOARD_Y1 - BOARD_Y0 + 2 * FR, FR), (wx - sx * 0.04, (BOARD_Y0 + BOARD_Y1) / 2, BOARD_Z1 + FR / 2))
    box(bm, (0.08, BOARD_Y1 - BOARD_Y0 + 2 * FR, FR), (wx - sx * 0.04, (BOARD_Y0 + BOARD_Y1) / 2, BOARD_Z0 - FR / 2))
    box(bm, (0.08, FR, BOARD_Z1 - BOARD_Z0), (wx - sx * 0.04, BOARD_Y0 - FR / 2, (BOARD_Z0 + BOARD_Z1) / 2))
    box(bm, (0.08, FR, BOARD_Z1 - BOARD_Z0), (wx - sx * 0.04, BOARD_Y1 + FR / 2, (BOARD_Z0 + BOARD_Z1) / 2))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.012, segments=1, affect="EDGES")
    mesh_object(f"room_board_frame_{side}", bm, M["shelf_wood"], parent=room)
    base = 0 if sx > 0 else 30
    for r, z in enumerate(BOARD_ROWS):
        # en la pared izquierda se lee de izquierda a derecha mirándola: del fondo hacia delante
        cols = BOARD_COLS if sx > 0 else tuple(reversed(BOARD_COLS))
        for c, y in enumerate(cols):
            slot = empty(f"ach_slot_{base + r * 6 + c}", parent=room, loc=(wx - sx * 0.04, y, z))
            slot.rotation_euler = (0, 0, -sx * math.pi / 2)
            slot.scale = (0.78, 0.78, 0.78)
    empty(f"board_view_{side}", parent=room, loc=(wx - sx * 0.04, (BOARD_Y0 + BOARD_Y1) / 2, (BOARD_Z0 + BOARD_Z1) / 2))

# coleccionables: la escala del hueco es la escala con la que se expone la pieza
SLOTS = []
# vitrinas
# vitrinas: hueco del medio con su pieza; en los de los lados y encima de la tapa, piezas que antes colgaban de la pared;
# los que quedan libres se llaman slot_vitrina_<vitrina>_<0|2|top> (el de encima de la central, libre: taparía el corazón)
VITRINA_ITEMS = {("center", 0): "col_desert_mask", ("center", 2): "col_pickaxes",
                 ("left", 0): "col_mine_cart", ("right", "top"): "col_leaf_frame"}
for vname, vx, vy, vz, along, middle in (("center", 0.0, FURN_Y - 0.36, 0.95, "x", "col_trophy"),
                                          ("left", -(WALL_X - 0.8), 0.9, 0.8, "y", "col_crystal_skull"),
                                          ("right", WALL_X - 0.8, 0.9, 0.8, "y", "col_ancient_vase")):
    for k, off in enumerate((-VITRINA_GAP, 0.0, VITRINA_GAP)):
        loc = (vx + off, vy, vz) if along == "x" else (vx, vy + off, vz)
        item = middle if k == 1 else VITRINA_ITEMS.get((vname, k))
        SLOTS.append((f"slot_{item}" if item else f"slot_vitrina_{vname}_{k}", loc, 1.3))
    item = VITRINA_ITEMS.get((vname, "top"))
    SLOTS.append((f"slot_{item}" if item else f"slot_vitrina_{vname}_top", (vx, vy, vz + 0.64), 1.3))
# estanterías: 3 baldas x 3 huecos (caben 9 en cada una), de arriba abajo
SHELF_ITEMS = {
    -2.55: (("col_blue_orb", "col_crypt_key", "col_coin_chest"),
            ("col_root_lantern", "col_mini_train", "col_spring_toy"),
            ("col_acorn_jar", "col_ice_crystal", "col_cracked_egg")),
    2.55: (("col_fire_lamp", "col_geode", "col_crystal_crown"),
           ("col_scarab", "col_hourglass", "col_compass"),
           ("col_slime_plush", "col_dizzy_top", "col_snow_globe")),
}
for x, shelves in SHELF_ITEMS.items():
    for top, row in zip((SHELF_TOPS[2], SHELF_TOPS[1], SHELF_TOPS[0]), shelves):
        for dx, item in zip((-0.62, 0.0, 0.62), row):
            SLOTS.append((f"slot_{item}", (x + dx, SHELF_Y, top), 1.35))
# colgados en la pared del fondo (encima de las estanterías y de las velas)
# (estandarte, cuadro, plano y globo tienen modelo pero no están en el juego: se decidirá dónde van)
for item, x, z in (("col_abyss_heart", 0.0, 2.08),):
    SLOTS.append((f"slot_{item}", (x, WALL_Y - 0.03, z), 0.95))
# en el suelo, junto a las paredes laterales
for item, x, y in (("col_cactus_pot", -3.75, -1.9), ("col_sphinx", 3.75, -1.9), ("col_cannonballs", 3.75, 2.4)):
    SLOTS.append((f"slot_{item}", (x, y, 0.0), 1.0))
# a la izquierda de la alfombra: se ve desde el menú y no tapa ninguna pieza (ni las vitrinas ni lo del suelo)
empty("room_gold_chest", parent=room, loc=(-2.1, 0.6, 0.0))
for slot, loc, size in SLOTS:
    empty(slot, parent=room, loc=loc).scale = (size, size, size)

# ================================================================== guardar y exportar

os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", export_yup=True)
print("OK ->", OUT_GLB)
