"""Injerta piezas del kit en un piso que ya existe: las mete POR DEBAJO de la salida
(así no se mueve nada de lo que había) y añade sus pasos al principio de la ruta.

    python -m scripts.levelkit.graft c4-remolino seesaw_bridge spinner_room

Sirve para subir la nota de un piso flojo sin rehacerlo: se le añade dificultad de
estructura (tablas, discos, vías, rodeos), que es la que no se come al limo.
"""

import io
import os
import re
import sys

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')))

from scripts.levelkit import Level, pieces as P   # noqa: E402
from scripts.levelkit.writer import LEV, ROUTES   # noqa: E402


def map_spans(body):
    out = []
    for m in re.finditer(r'map: \[\n(.*?)\n[ ]*\],', body, re.S):
        block = m.group(1)
        rows = re.findall(r"'([^']*)'", block)
        ind = re.match(r'[ ]*', block).group(0)
        out.append((m.start(1), m.end(1), rows, ind))
    return out


def graft(lid, names):
    src = io.open(LEV, encoding='utf8').read()
    i = src.index("id: '%s'" % lid)
    i = src.rindex('  {\n', 0, i)
    j = src.index('\n  },\n', i) + len('\n  },\n')
    body = src[i:j]
    plants = map_spans(body)
    w = len(plants[0][2][0])
    ps = pi = pj = -1
    for s, (_, _, rows, _) in enumerate(plants):
        for k, r in enumerate(rows):
            if 'P' in r:
                ps, pi, pj = s, r.index('P'), k
    assert ps >= 0, lid
    floor = next((ch for ch in plants[ps][2][pj] if ch.isdigit()), '0')

    wide = any(n.startswith('rail_puzzle') for n in names)
    c = min(max(pi, 6 if wide else 4), w - (7 if wide else 5))
    lv = Level(lid, lid, w=w, floor=floor)
    lv.c = c
    lv.add(P.start_room(lv))
    for n in names:
        # las piezas admiten argumentos: "ice_pass:wind=e", "fire_hall:oil=0"
        base, _, args = n.partition(':')
        kw = {}
        for a in filter(None, args.split(',')):
            k, _, v = a.partition('=')
            kw[k] = int(v) if v in ('0', '1') else v
        lv.add(getattr(P, base)(lv, **kw))
    rows_new, steps, _ = lv.build()

    # el tramo nuevo cuelga justo debajo de la salida vieja, que pasa a ser suelo
    new = body
    joint = 0
    for s in range(len(plants) - 1, -1, -1):
        st, en, rows, ind = plants[s]
        rows = list(rows)
        if s == ps:
            rows[pj] = rows[pj][:pi] + floor + rows[pj][pi + 1:]
            cut = pj + 1
            if cut < len(rows) and set(rows[cut]) - {'.'}:
                r = list(rows[cut])
                for k in range(c - 1, c + 2):
                    r[k] = floor
                rows[cut] = ''.join(r)
                cut += 1
            rows = rows[:cut] + rows_new + rows[cut:]
            joint = cut - 1
        else:
            rows = rows + ['.' * w] * len(rows_new)
        txt = '\n'.join("%s'%s'," % (ind, r) for r in rows)
        new = new[:st] + txt[len(ind):] + new[en:]
    if lv.latch:
        if 'latch:' in new:
            new = re.sub(r'latch: \{[^}]*\}', 'latch: { %s }' % ', '.join('%s: true' % k for k in sorted(lv.latch)), new, count=1)
        else:
            new = new.replace("id: '%s'" % lid, "latch: { %s },\n    id: '%s'" %
                              (', '.join('%s: true' % k for k in sorted(lv.latch)), lid), 1)
    io.open(LEV, 'w', encoding='utf8').write(src[:i] + new + src[j:])

    # los pasos nuevos van al principio de la ruta y acaban en el empalme
    t = io.open(ROUTES, encoding='utf8').read()
    k = t.index("'%s': [" % lid)
    k = t.index('\n', k) + 1
    # el kit numera las filas de SU bloque; en el mapa final el bloque empieza en joint + 1
    shift = joint + 1
    steps = [re.sub(r'to: \[([-\d.]+), ([-\d.]+)\]',
                    lambda m: 'to: [%s, %s]' % (m.group(1), float(m.group(2)) + shift), st) for st in steps]
    steps = steps + ['{ to: [%s, %s], radius: 0.4, t: 6 }' % (c + 0.5, joint + 0.5)]
    io.open(ROUTES, 'w', encoding='utf8').write(t[:k] + '    ' + ', '.join(steps) + ',\n' + t[k:])
    print('%-26s +%d filas, +%d pasos' % (lid, len(rows_new), len(steps)))


if __name__ == '__main__':
    graft(sys.argv[1], sys.argv[2:])
