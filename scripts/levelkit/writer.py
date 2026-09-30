"""Escribe lo que monta el kit en los dos ficheros del juego:
  * scripts/author-levels.mjs  -> el bloque `const CHAPTERn = [...]` y su registro
  * src/dev-routes.ts          -> la ruta del autopiloto de cada piso
Siempre reemplaza el capítulo entero: el kit es la fuente, el .mjs es la salida.
"""

import io
import os
import re

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
LEV = os.path.join(ROOT, 'scripts', 'author-levels.mjs')
ROUTES = os.path.join(ROOT, 'src', 'dev-routes.ts')


def level_block(lv, rows, tips, file_path):
    """Texto JS de un piso, con el mismo formato que el resto del fichero."""
    meta = ["    file: '%s'," % file_path,
            "    id: '%s', name: '%s', count: %d, keepPct: %s," % (lv.id, lv.name, lv.count, lv.keep),
            "    mood: '%s', camYaw: %d," % (lv.mood, lv.cam_yaw)]
    if lv.latch:
        meta.insert(1, '    latch: { %s },' % ', '.join('%s: true' % k for k in sorted(lv.latch)))
    if getattr(lv, 'need', None):
        meta.insert(1, '    need: { %s },' % ', '.join('%s: %d' % (k, v) for k, v in sorted(lv.need.items())))
    body = ['  {'] + meta + ['    map: [']
    body += ["'%s'," % r for r in rows]
    body.append('    ],')
    if getattr(lv, 'top_up', None):
        body.append('    stories: [{')
        body.append('      map: [')
        body += ["'%s'," % r for r in lv.top_up]
        body.append('      ],')
        body.append('    }],')
    if tips:
        body.append('    tips: [')
        body += ["      { z: %d, text: '%s' }," % (t['z'], t['text'].replace("'", "\\'")) for t in tips]
        body.append('    ],')
    body.append('  },')
    return '\n'.join(body)


def write_chapter(n, levels):
    """levels: lista de (lv, rows, steps, tips, file_path)."""
    src = io.open(LEV, encoding='utf8').read()
    block = 'const CHAPTER%d = [\n' % n + '\n'.join(
        level_block(lv, rows, tips, path) for lv, rows, _, tips, path in levels) + '\n];\n'
    marker = 'const CHAPTER%d = [' % n
    if marker in src:
        a = src.index(marker)
        b = src.index('\n];\n', a) + len('\n];\n')
        src = src[:a] + block + src[b:]
    else:
        prev = 'const CHAPTER%d = [' % (n - 1)
        a = src.index(prev)
        b = src.index('\n];\n', a) + len('\n];\n')
        src = src[:b] + '\n' + block + src[b:]
    # registro en el bucle final
    old = re.search(r'for \(const def of \[PRACTICE(.*?)\]\) \{', src, re.S)
    chapters = old.group(1)
    if '...CHAPTER%d' % n not in chapters:
        src = src[:old.start(1)] + chapters + ', ...CHAPTER%d' % n + src[old.end(1):]
    io.open(LEV, 'w', encoding='utf8').write(src)


def write_routes(levels):
    t = io.open(ROUTES, encoding='utf8').read()
    for lv, _, steps, _, _ in levels:
        entry = "  '%s': [\n    %s,\n  ],\n" % (lv.id, ',\n    '.join(steps))
        key = "  '%s': [" % lv.id
        if key in t:
            a = t.index(key)
            b = t.index('\n  ],\n', a) + len('\n  ],\n')
            t = t[:a] + entry + t[b:]
        else:
            a = t.rindex('\n};')
            t = t[:a] + '\n' + entry.rstrip('\n') + t[a:]
    io.open(ROUTES, 'w', encoding='utf8').write(t)
