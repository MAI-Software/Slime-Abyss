"""
Genera public/og-image.jpg (la imagen que sale al compartir el juego).

Hace dos cosas: saca un .ttf de la fuente de la marca (Fredoka viene en woff2, que Blender no
sabe leer) y llama a Blender con blender/og.py.

  python blender/make_og.py
"""

import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.normpath(os.path.join(ROOT, ".."))
WOFF2 = os.path.join(PROJ, "node_modules", "@fontsource", "fredoka", "files", "fredoka-latin-700-normal.woff2")
TTF = os.path.join(tempfile.gettempdir(), "fredoka-700.ttf")

BLENDERS = [
    os.environ.get("BLENDER"),
    r"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe",
    r"C:/Program Files/Blender Foundation/Blender 4.2/blender.exe",
    shutil.which("blender"),
]


def font():
    """La fuente de la marca, convertida a ttf para Blender."""
    if os.path.exists(TTF):
        return TTF
    if not os.path.exists(WOFF2):
        print("aviso: no está la fuente Fredoka; el título saldrá con la fuente de Blender")
        return ""
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        print("aviso: falta fonttools (pip install fonttools brotli); el título saldrá con otra fuente")
        return ""
    f = TTFont(WOFF2)
    f.flavor = None
    f.save(TTF)
    print("fuente ->", TTF)
    return TTF


def main():
    exe = next((b for b in BLENDERS if b and os.path.exists(b)), None)
    if not exe:
        sys.exit("no encuentro Blender: pon la ruta en la variable BLENDER")
    env = dict(os.environ, OG_FONT=font())
    r = subprocess.run([exe, "-b", "--factory-startup", "-P", os.path.join(ROOT, "og.py")], env=env)
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
