"""Nota de cada piso: mide si de verdad es largo, variado, encadenado y peligroso,
o si es relleno. Sirve para encontrar los pisos aburridos sin jugarlos uno a uno.

    python -m scripts.levelkit.score              # tabla de los 60 pisos
    python -m scripts.levelkit.score --flojos     # solo los que se quedan cortos

Qué se mide (y por qué):
  tamaño      filas y largo real del recorrido del autopiloto: un piso corto se nota.
  variedad    tipos de mecánica distintos: un piso de una sola cosa cansa.
  combos      veces que dos mecánicas DISTINTAS se tocan (a 3 casillas): eso es encadenar.
  peligro     parte del recorrido que pasa pegada a algo que hace daño o al vacío.
  decisiones  puertas con interruptor, estaciones, bifurcaciones y rodeos de la ruta.
  relleno     tramos seguidos de suelo sin nada: penaliza (es lo que hace un piso soso).
"""

import io
import json
import math
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
CAMPAIGN = os.path.join(ROOT, 'src', 'level', 'campaign')
ROUTES = os.path.join(ROOT, 'src', 'dev-routes.ts')

BLOCK = set('#.=@%')
#: cada casilla, a qué familia de mecánica pertenece (lo que cuenta para variedad y combos)
FAMILY = {
    'F': 'fuego', 'X': 'fuego', 'I': 'hielo', 'Z': 'hielo', 'O': 'aceite', 'W': 'plantas',
    'Y': 'pinchos', 'B': 'grietas', 'J': 'saltos', 'a': 'hondonada', 'b': 'jabón', 'A': 'jabón',
    '^': 'viento', 'v': 'viento', '<': 'viento', '>': 'viento', 'Q': 'frío',
    'R': 'raíles', '=': 'raíles', '@': 'raíles', '%': 'raíles',
    'S': 'puertas', 's': 'puertas', 'D': 'puertas', 'd': 'puertas',
    'E': 'disco', 'N': 'cañón', 'x': 'cañón', 'H': 'agujeros', 'U': 'agujeros',
    '-': 'balancines', '|': 'balancines', 'g': 'picos', 'h': 'picos', 'i': 'picos', 'j': 'picos',
    'n': 'rampas', 'u': 'rampas', 'e': 'rampas', 'o': 'rampas',
}
DANGER = set('FXY.aB')                     # hace daño, se lleva limo o es vacío
#: nota que se le pide a cada capítulo (la dificultad tiene que subir)
# objetivos con los topes nuevos: cada capítulo tiene que quedar por encima del suyo
TARGET = {1: 26, 2: 40, 3: 58, 4: 60, 5: 72, 6: 76, 7: 80, 8: 84}


def levels():
    for ch in range(1, 20):
        d = os.path.join(CAMPAIGN, 'chapter%d' % ch)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.endswith('.json'):
                yield ch, json.load(io.open(os.path.join(d, f), encoding='utf8'))


def route_of(text, lid):
    i = text.find("'%s': [" % lid)
    if i < 0:
        return []
    j = text.index('\n  ],', i)
    return [(float(a), float(b)) for a, b in re.findall(r'to: \[([-\d.]+), ([-\d.]+)\]', text[i:j])]


def grids(L):
    return [L['tiles']] + [g['tiles'] if isinstance(g, dict) else g for g in L.get('stories', [])]


def measure(ch, L, pts):
    gs = grids(L)
    rows = len(gs[0])
    cells = [(s, i, j, ch2) for s, g in enumerate(gs) for j, r in enumerate(g) for i, ch2 in enumerate(r)]
    walk = [c for c in cells if c[3] not in BLOCK]
    mech = [(s, i, j, FAMILY[c]) for s, i, j, c in cells if c in FAMILY]
    fams = {m[3] for m in mech}

    # combos: mecánicas de familias distintas que se tocan (3 casillas)
    combos = set()
    by_cell = defaultdict(set)
    for s, i, j, fam in mech:
        by_cell[(s, i // 3, j // 3)].add(fam)
    for s, i, j, fam in mech:
        near = set()
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                near |= by_cell.get((s, i // 3 + di, j // 3 + dj), set())
        for other in near:
            if other != fam:
                combos.add((min(fam, other), max(fam, other), j // 6))

    # largo real del recorrido y exposición al peligro
    length = sum(math.dist(pts[k], pts[k + 1]) for k in range(len(pts) - 1)) if len(pts) > 1 else 0
    exposed = 0
    for x, zz in pts:
        i, j = int(x), int(zz)
        hit = False
        # solo cuenta la planta por la que anda el limo: si no, el vacío de la planta de
        # arriba haría parecer peligroso un piso llano
        for g in gs:
            here = g[j][i] if 0 <= j < len(g) and 0 <= i < len(g[j]) else '.'
            if here in BLOCK and here != '.':
                continue
            if here == '.':
                continue
            for dj in (-1, 0, 1):
                for di in (-1, 0, 1):
                    if 0 <= j + dj < len(g) and 0 <= i + di < len(g[j + dj]) and g[j + dj][i + di] in DANGER:
                        hit = True
        exposed += 1 if hit else 0
    exposure = exposed / max(1, len(pts))

    # rodeos: la ruta vuelve sobre sí misma (ir a por algo y volver)
    detours = sum(1 for k in range(1, len(pts) - 1)
                  if (pts[k + 1][1] - pts[k][1]) * (pts[k][1] - pts[k - 1][1]) < -0.2)

    # relleno: filas seguidas sin mecánica ni moneda
    interest = set()
    for s, g in enumerate(gs):
        for j, r in enumerate(g):
            if any(c in FAMILY or c in 'CGLT' for c in r):
                interest.add(j)
    run, worst, empty = 0, 0, 0
    for j in range(rows):
        if j in interest:
            run = 0
        else:
            run += 1
            empty += 1
            worst = max(worst, run)
    filler = empty / max(1, rows)

    decisions = len([1 for _, _, _, f in mech if f in ('puertas', 'raíles')]) // 4 + detours
    # trampas: lo que hace daño o se lleva limo, contado por grupos (no casilla a casilla)
    trap_fams = ('pinchos', 'fuego', 'grietas', 'hondonada', 'saltos', 'disco')
    traps = len({(s2, i // 4, j // 4, f) for s2, i, j, f in mech if f in trap_fams})
    # puzles: cosas que hay que resolver, no solo esquivar
    puzzles = (len({(s2, j // 6) for s2, i, j, f in mech if f == 'puertas'})
               + len({(s2, j // 8) for s2, i, j, f in mech if f == 'raíles'})
               + len({(s2, j // 6) for s2, i, j, f in mech if f in ('cañón', 'jabón', 'agujeros')}))
    return {
        'filas': rows, 'largo': round(length), 'variedad': len(fams), 'familias': sorted(fams),
        'combos': len(combos), 'peligro': round(exposure, 2), 'decisiones': decisions,
        'relleno': round(filler, 2), 'vacio_max': worst, 'plantas': len(gs), 'monedas': sum(r.count('C') for g in gs for r in g),
        'trampas': traps, 'puzles': puzzles,
    }


def score(m):
    """Nota 0-100. Cada parte está acotada para que ninguna se dispare sola.

    Los topes se recalibraron cuando los capítulos 5 al 8 se quedaron todos entre 80 y 84: con
    los topes viejos (100 filas, 220 m, 9 familias, 14 combos) un piso grande los reventaba y la
    nota dejaba de distinguir. Y el peligro se mide contra 0.30, no contra 0.75: más exposición
    que esa no se puede pedir, porque el listón de la prueba es conservar más del 90 % del limo
    y los pinchos y el fuego se lo van comiendo."""
    size = min(1, m['filas'] / 150) * 15
    length = min(1, m['largo'] / 400) * 10
    variety = min(1, m['variedad'] / 12) * 20
    combo = min(1, m['combos'] / 25) * 20
    danger = min(1, m['peligro'] / 0.30) * 15
    decide = min(1, m['decisiones'] / 12) * 15
    fill = (1 - min(1, m['relleno'] / 0.5)) * 5
    return round(size + length + variety + combo + danger + decide + fill)


def tags(ch, m, s):
    out = []
    if m['filas'] < 45:
        out.append('corto')
    if m['variedad'] <= 3:
        out.append('poca variedad')
    if m['combos'] <= 3:
        out.append('sin encadenar')
    if m['peligro'] < 0.25:
        out.append('sin riesgo')
    if m['vacio_max'] >= 8:
        out.append('tramo muerto')
    if m['trampas'] < 4:
        out.append('pocas trampas')
    if m['puzles'] < 2 and ch >= 4:
        out.append('sin puzles')
    if s < TARGET.get(ch, 70) - 8:
        out.append('flojo para el capítulo')
    return out


def main():
    text = io.open(ROUTES, encoding='utf8').read()
    only_bad = '--flojos' in sys.argv
    by_ch = defaultdict(list)
    print('%-28s %5s %5s %4s %4s %5s %4s %4s %4s %4s  %s' %
          ('piso', 'filas', 'largo', 'var', 'com', 'peli', 'tram', 'puz', 'mon', 'nota', 'avisos'))
    for ch, L in levels():
        m = measure(ch, L, route_of(text, L['id']))
        s = score(m)
        by_ch[ch].append(s)
        bad = tags(ch, m, s)
        if only_bad and not bad:
            continue
        print('%-28s %5d %5d %4d %4d %5.2f %4d %4d %4d %4d  %s' %
              (L['id'], m['filas'], m['largo'], m['variedad'], m['combos'], m['peligro'],
               m['trampas'], m['puzles'], m['monedas'], s, ', '.join(bad)))
    print()
    for ch in sorted(by_ch):
        notas = by_ch[ch]
        print('capítulo %d: media %d (objetivo %d), peor %d, mejor %d' %
              (ch, sum(notas) / len(notas), TARGET.get(ch, 70), min(notas), max(notas)))
    # la curva tiene que subir capítulo a capítulo
    medias = [sum(by_ch[c]) / len(by_ch[c]) for c in sorted(by_ch)]
    for k in range(1, len(medias)):
        if medias[k] < medias[k - 1]:
            print('aviso: el capítulo %d puntúa menos que el %d' % (k + 1, k))


if __name__ == '__main__':
    main()
