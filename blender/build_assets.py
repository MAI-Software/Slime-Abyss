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
    cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY" if poly else "NURBS")
    sp.points.add(len(points) - 1)
    for p, (a, b) in zip(sp.points, points):
        p.co = (a, 0.0, b, 1.0) if plane == "XZ" else (a, b, 0.0, 1.0)
    sp.use_cyclic_u = cyclic
    if not poly:
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


def ellipse_pts(rx, rz, cx=0.0, cz=0.0, n=24):
    return [(cx + rx * math.cos(2 * math.pi * i / n), cz + rz * math.sin(2 * math.pi * i / n)) for i in range(n)]


def teardrop(name, radius, mat):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=radius)
    for v in bm.verts:
        if v.co.z > 0:
            t = v.co.z / radius
            v.co.x *= 1 - t * 0.9
            v.co.y *= 1 - t * 0.9
            v.co.z *= 2.2
    bmesh.ops.scale(bm, vec=(1, 0.5, 1), verts=bm.verts)
    return mesh_object(name, bm, mat, smooth=True)


# Ojo: óvalo negro brillante con dos reflejos.
eye = empty("face_eye")
bm = bmesh.new()
ellipsoid(bm, (0.062, 0.03, 0.082), (0, 0, 0), 20, 12)
mesh_object("face_eye_ball", bm, M["black"], smooth=True, parent=eye)
bm = bmesh.new()
ellipsoid(bm, (0.024, 0.01, 0.028), (0, 0, 0), 12, 8)
mesh_object("face_eye_shine", bm, M["white"], smooth=True, parent=eye, loc=(-0.02, -0.026, 0.03))
bm = bmesh.new()
ellipsoid(bm, (0.011, 0.008, 0.011), (0, 0, 0), 10, 6)
mesh_object("face_eye_shine2", bm, M["white"], smooth=True, parent=eye, loc=(0.022, -0.026, -0.025))

# Ojo de dolor ">" con esquina marcada (el juego lo refleja para "<").
tube("face_eye_pain", [(-0.04, 0.045), (0.035, 0.0), (-0.04, -0.045)], 0.017, M["black"], poly=True)

# Ojo feliz "^".
tube("face_eye_happy", [(-0.05, -0.02), (-0.025, 0.025), (0.0, 0.04), (0.025, 0.025), (0.05, -0.02)], 0.017,
     M["black"])

# Boquita sonriente.
tube("face_mouth_smile", [(-0.035, 0.012), (-0.018, -0.008), (0.0, -0.013), (0.018, -0.008), (0.035, 0.012)],
     0.012, M["black"])

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
flat_shape("face_blush", ellipse_pts(0.034, 0.02), 0.004, M["blush"])
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

# Pincho divisor: uno grande y tres pequeños sobre una base.
spike = empty("spike")
bm = bmesh.new()
cylinder(bm, 0.3, 0.08, (0, 0, 0.04), 20)
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.015, segments=1, affect="EDGES")
mesh_object("spike_base", bm, M["steel_dark"], parent=spike)
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12, radius1=0.13, radius2=0.0, depth=0.78,
                      matrix=Matrix.Translation((0, 0, 0.47)))
for a in range(3):
    ang = a * 2.094 + 0.5
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.065, radius2=0.0, depth=0.34,
                          matrix=Matrix.Translation((0.19 * math.cos(ang), 0.19 * math.sin(ang), 0.25)))
mesh_object("spike_points", bm, M["steel"], smooth=True, parent=spike)

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

# ================================================================== ACCESORIOS DE CABEZA (solo visuales)
# Origen en la base del accesorio; tamaño para una cabeza de ~0.5 de radio.
M["wool"] = material("Wool", "6d5bd0", 0.95)
M["wool_light"] = material("WoolLight", "f5f3ff", 0.95)
M["felt_black"] = material("FeltBlack", "1f1b2e", 0.7)
M["ribbon_red"] = material("RibbonRed", "e11d48", 0.5)
M["bow_pink"] = material("BowPink", "f472b6", 0.45)
M["party"] = material("PartyTeal", "14b8a6", 0.55)
M["party_star"] = material("PartyYellow", "facc15", 0.5)
M["gold_hat"] = material("CrownGold", "fbbf24", 0.25, 1.0, emit="7a4a00", strength=0.3)
M["ruby"] = material("Ruby", "e11d48", 0.1, 0.2, emit="7f1d1d", strength=0.4)

hat = empty("hat_beanie")
bm = bmesh.new()
ellipsoid(bm, (0.3, 0.3, 0.24), (0, 0, 0.0), 20, 12)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context="VERTS")
mesh_object("hat_beanie_dome", bm, M["wool"], smooth=True, parent=hat, loc=(0, 0, 0.05))
bm = bmesh.new()
cylinder(bm, 0.315, 0.09, (0, 0, 0.05), 24)
mesh_object("hat_beanie_band", bm, M["wool_light"], smooth=True, parent=hat)
bm = bmesh.new()
ellipsoid(bm, (0.085, 0.085, 0.085), (0, 0, 0), 14, 10)
mesh_object("hat_beanie_pompom", bm, M["wool_light"], smooth=True, parent=hat, loc=(0, 0, 0.33))

hat = empty("hat_crown")
bm = bmesh.new()
cylinder(bm, 0.24, 0.12, (0, 0, 0.06), 28)
for k in range(5):
    ang = k * math.tau / 5
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=0.06, radius2=0.0, depth=0.16,
                          matrix=Matrix.Translation((0.22 * math.cos(ang), 0.22 * math.sin(ang), 0.2)))
mesh_object("hat_crown_gold", bm, M["gold_hat"], parent=hat)
bm = bmesh.new()
ellipsoid(bm, (0.035, 0.02, 0.035), (0, -0.245, 0.06), 10, 6)
mesh_object("hat_crown_ruby", bm, M["ruby"], smooth=True, parent=hat)

hat = empty("hat_top")
bm = bmesh.new()
cylinder(bm, 0.34, 0.03, (0, 0, 0.015), 28)
cylinder(bm, 0.2, 0.34, (0, 0, 0.2), 28)
mesh_object("hat_top_felt", bm, M["felt_black"], parent=hat)
bm = bmesh.new()
cylinder(bm, 0.205, 0.06, (0, 0, 0.08), 28)
mesh_object("hat_top_band", bm, M["ribbon_red"], parent=hat)

hat = empty("hat_bow")
bm = bmesh.new()
ellipsoid(bm, (0.14, 0.05, 0.1), (-0.13, 0, 0.1), 14, 8)
ellipsoid(bm, (0.14, 0.05, 0.1), (0.13, 0, 0.1), 14, 8)
ellipsoid(bm, (0.05, 0.06, 0.05), (0, 0, 0.1), 10, 6)
mesh_object("hat_bow_mesh", bm, M["bow_pink"], smooth=True, parent=hat)

hat = empty("hat_party")
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=20, radius1=0.18, radius2=0.0, depth=0.42,
                      matrix=Matrix.Translation((0, 0, 0.21)))
mesh_object("hat_party_cone", bm, M["party"], smooth=True, parent=hat)
bm = bmesh.new()
ellipsoid(bm, (0.06, 0.06, 0.06), (0, 0, 0.44), 12, 8)
mesh_object("hat_party_pompom", bm, M["party_star"], smooth=True, parent=hat)

hat = empty("hat_leaf")
bm = bmesh.new()
cylinder(bm, 0.018, 0.14, (0, 0, 0.07), 8)
mesh_object("hat_leaf_stem", bm, M["thorn"], parent=hat)
bm = bmesh.new()
ellipsoid(bm, (0.16, 0.02, 0.08), (0.14, 0, 0.16), 14, 6)
mesh_object("hat_leaf_blade", bm, M["leaf"], smooth=True, parent=hat)

# ================================================================== guardar y exportar

os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", export_yup=True)
print("OK ->", OUT_GLB)
