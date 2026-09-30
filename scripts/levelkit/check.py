"""Repaso estático de un piso antes de probarlo con el autopiloto.
No sustituye a __auto (eso es lo único que demuestra que se puede jugar), pero pilla en
un segundo los fallos que ya nos han costado tandas enteras.
"""

import math
import re

from . import tiles as T


def band(row, i):
    """Casillas seguidas que se pueden pisar alrededor de la columna i."""
    if i >= len(row) or row[i] in T.BLOCKING:
        return []
    lo = hi = i
    while lo > 0 and row[lo - 1] not in T.BLOCKING:
        lo -= 1
    while hi < len(row) - 1 and row[hi + 1] not in T.BLOCKING:
        hi += 1
    return list(range(lo, hi + 1))


def check(rows, steps=(), lid='?', up=None):
    """Devuelve la lista de avisos (vacía = bien).
    `up` es la planta alta de los pisos de dos plantas: allí también hay salida, tesoro y
    monedas, y una estación sin vía al lado NO está suelta si tiene su gemela justo encima."""
    bad = []
    say = lambda m: bad.append('%s: %s' % (lid, m))
    w = len(rows[0])
    twin = lambda i, j: (up[j][i] if up and 0 <= j < len(up) and 0 <= i < len(up[j]) else T.VOID) == T.STATION
    for j, r in enumerate(rows):
        if len(r) != w:
            say('la fila %d mide %d y el mapa %d' % (j, len(r), w))
    txt = ''.join(rows) + ''.join(up or [])
    if txt.count(T.START) != 1:
        say('tiene %d salidas del limo' % txt.count(T.START))
    if txt.count(T.TREASURE) != 1:
        say('tiene %d tesoros' % txt.count(T.TREASURE))
    if txt.count(T.COIN) == 0:
        say('no tiene monedas')
    at = lambda i, j: rows[j][i] if 0 <= j < len(rows) and 0 <= i < len(rows[j]) else T.VOID
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            side = [at(i + 1, j), at(i - 1, j), at(i, j + 1), at(i, j - 1)]
            if ch == T.STATION:
                if not any(c in (T.RAIL, T.RAIL_LOOP, T.RAIL_SPIRAL, T.STATION) for c in side) and not twin(i, j):
                    say('estación suelta en (%d,%d)' % (i, j))
                walls = [(a, b) for a in (-1, 0, 1) for b in (-1, 0, 1)
                         if (a or b) and at(i + a, j + b) == T.WALL]
                if not any(c in (T.RAIL, T.RAIL_LOOP, T.RAIL_SPIRAL) for c in side) and walls:
                    say('ascensor sin hueco 3x3 en (%d,%d)' % (i, j))
            if ch in (T.RAIL, T.RAIL_LOOP, T.RAIL_SPIRAL):
                if sum(1 for c in side if c in (T.RAIL, T.RAIL_LOOP, T.RAIL_SPIRAL, T.STATION)) < 2:
                    say('vía que no lleva a ninguna parte en (%d,%d)' % (i, j))
            if ch == T.CANNON and T.TARGET not in txt:
                say('cañón sin diana')
            if ch == T.FAN_UP and T.SOAP not in txt:
                say('ventilador de techo sin jabón en el piso')
            for d, f in T.FAN.items():
                if ch == f:
                    dx, dz = {'n': (0, -1), 's': (0, 1), 'e': (1, 0), 'w': (-1, 0)}[d]
                    if at(i + dx, j + dz) == T.WALL:
                        say('ventilador soplando contra el muro en (%d,%d)' % (i, j))
            if ch == T.HOLE and T.HOLE_EXIT not in txt:
                say('agujero sin salida (solo vale si hay planta debajo)')
    # el camino no puede estrecharse a menos de 3 donde anda el limo
    pcol = next((r.index(T.START) for r in rows if T.START in r), -1)
    if pcol >= 0:
        for j, r in enumerate(rows):
            bd = band(r, pcol)
            if bd and len(bd) < T.MIN_CORRIDOR and not any(c in T.PICKUPS for c in r):
                say('paso de %d casillas en la fila %d (el limo pide %d)' % (len(bd), j, T.MIN_CORRIDOR))
    # el secreto tiene que costar un rodeo, no estar al lado del camino
    pts = [(float(a), float(b)) for a, b in re.findall(r'to: \[([-\d.]+), ([-\d.]+)\]', ' '.join(steps))]
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch not in (T.GEM, T.RELIC) or len(pts) < 3:
                continue
            far = [p for p in pts if math.hypot(p[0] - (i + 0.5), p[1] - (j + 0.5)) > 3.2]
            d = min((seg_dist((i + 0.5, j + 0.5), far[k], far[k + 1]) for k in range(len(far) - 1)), default=99)
            if d < 2:
                say('el secreto de (%d,%d) está pegado al camino principal' % (i, j))
    return bad


def seg_dist(p, a, b):
    ax, az = a
    bx, bz = b
    px, pz = p
    dx, dz = bx - ax, bz - az
    L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L))
    return math.hypot(px - (ax + dx * t), pz - (az + dz * t))
