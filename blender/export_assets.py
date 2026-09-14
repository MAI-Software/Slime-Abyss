"""
Re-exporta blender/assets.blend a src/models/assets.glb tras retocar los modelos a mano.

Uso:
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b blender/assets.blend -P blender/export_assets.py

Mantén los nombres de objeto: el juego los busca por nombre (block_top, chest_lid, face_eye_open...).
Ojo: build_assets.py SOBRESCRIBE assets.blend; tras editar a mano usa solo este script.
"""

import os

import bpy

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_GLB = os.path.normpath(os.path.join(ROOT, "..", "src", "models", "assets.glb"))
os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", export_yup=True)
print("OK ->", OUT_GLB)
