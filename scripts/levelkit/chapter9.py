"""Capítulo 9 «El Núcleo Helado» (el último del hielo).

Estrena la PUERTA DE PESO: la placa solo baja con casi todo el limo encima (el contador dice
cuántos limitos faltan), así que no vale mandar un trocito por delante — hay que llegar entero.
Sigue usando todo lo anterior: ventisca, vías, jabón, cañones, trampolines y cornisas.

Un piso solo tiene dos canales de puerta, así que en cada piso va UNA de estas tres:
`weight_gate`, `rail_puzzle` o `switch_gate`.

  python -m scripts.levelkit.chapter9
"""

import os
import sys

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')))

from scripts.levelkit import Level, check, pieces as P, writer   # noqa: E402

W = 15


def section(lv, feature=None, left=None, right=None, wedge=False, neck_rows=1, mix=None, cliff=None):
    """Sala con su peligro en la fila de las monedas, paso y la mecánica que toque.
    Pasos de una fila, salas de cuatro y una sala de cada tres colgada del vacío."""
    if cliff is None:
        cliff = (len(lv.rows) // 20) % 3 == 0
    if left is None:
        left = 'B'                       # roca agrietada, nunca pinchos: el pincho va comiendo limo
    lv.add(P.room(lv, left=left, right=right, wedge=wedge, rows=4, cliff=cliff))
    if mix:
        lv.add(mix(lv))
    lv.add(P.neck(lv, rows=neck_rows, coin=True))
    if feature:
        lv.add(feature(lv))
        lv.add(P.neck(lv, rows=neck_rows, coin=True))
    return lv


def floor1():
    lv = Level('c9-placa-de-hielo', 'Placa de hielo', w=W, mood='bright', cam_yaw=-12, keep=0.78)
    lv.add(P.start_room(lv))
    section(lv, P.weight_gate, right='Z', mix=P.ice_slalom)
    lv.tip('La placa pide casi todo el limo: llega entero', back=-10)
    section(lv, P.cold_spikes, right='Y')
    section(lv, P.loop, right='B', mix=P.void_ledge)
    section(lv, P.blizzard, right='W')
    section(lv, P.gauntlet, right='Z')
    section(lv, P.bubble_tower, right='Y')
    section(lv, P.pit, right='B')
    section(lv, P.loop, right='W', mix=P.crack_ledge)
    section(lv, P.cannon_hall, right='Z')
    section(lv, P.blizzard, right='Y')
    section(lv, P.loop, right='Z', mix=P.crack_ledge)
    section(lv, P.cold_spikes, right='B')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor2():
    lv = Level('c9-vias-del-nucleo', 'Vías del núcleo', w=W, mood='cave', cam_yaw=18, keep=0.76)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Z', mix=P.blizzard)
    section(lv, P.rail_puzzle, right='Y')
    section(lv, P.cold_spikes, right='B', mix=P.ice_slalom)
    section(lv, P.cannon_hall, right='W')
    section(lv, P.loop, right='Z', mix=P.void_ledge)
    section(lv, P.bubble_tower, right='Y')
    section(lv, P.gauntlet, right='B')
    section(lv, P.pit, right='W', mix=P.crack_ledge)
    section(lv, P.blizzard, right='Z')
    section(lv, P.loop, right='Y', mix=P.ice_slalom)
    section(lv, P.loop, right='B', mix=P.ice_slalom)
    section(lv, P.cold_spikes, right='W')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor3():
    lv = Level('c9-galeria-de-escarcha', 'Galería de escarcha', w=W, mood='dusk', cam_yaw=-20, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Y', mix=P.ice_slalom)
    section(lv, P.weight_gate, right='Z')
    section(lv, P.loop, right='B', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='W')
    section(lv, P.bubble_tower, right='Y', mix=P.crack_ledge)
    section(lv, P.gauntlet, right='Z')
    section(lv, P.pit, right='B')
    section(lv, P.loop, right='W')
    section(lv, P.cannon_hall, right='Z')
    section(lv, P.blizzard, right='W')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='Y')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor4():
    lv = Level('c9-puertas-del-nucleo', 'Puertas del núcleo', w=W, mood='cave', cam_yaw=22, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='B', mix=P.ice_slalom)
    section(lv, P.switch_gate, right='Z')
    section(lv, P.blizzard, right='Y', mix=P.cold_spikes)
    section(lv, P.cannon_hall, right='W')
    section(lv, P.bubble_tower, right='B')
    section(lv, P.loop, right='Y', mix=P.void_ledge)
    section(lv, P.gauntlet, right='Z')
    section(lv, P.pit, right='W')
    section(lv, P.blizzard, right='Z', mix=P.crack_ledge)
    section(lv, P.loop, right='B')
    section(lv, P.loop, right='Y', mix=P.crack_ledge)
    section(lv, P.cold_spikes, right='Z')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor5():
    lv = Level('c9-pozo-del-nucleo', 'Pozo del núcleo', w=W, mood='bright', cam_yaw=-16, keep=0.74)
    lv.add(P.start_room(lv))
    section(lv, P.pit, right='Y', mix=P.blizzard)
    section(lv, P.weight_gate, right='Z')
    section(lv, P.bubble_tower, right='B', mix=P.ice_slalom)
    section(lv, P.cold_spikes, right='W')
    section(lv, P.loop, right='Y', mix=P.void_ledge)
    section(lv, P.gauntlet, right='Z')
    section(lv, P.blizzard, right='B')
    section(lv, P.loop, right='W')
    section(lv, P.cannon_hall, right='Y')
    section(lv, P.loop, right='Z', mix=P.crack_ledge)
    section(lv, P.loop, right='Z', mix=P.ice_slalom)
    section(lv, P.cold_spikes, right='B')
    lv.add(P.crack_ledge(lv))
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor6():
    lv = Level('c9-cristal-mayor', 'Cristal mayor', w=W, mood='cave', cam_yaw=14, keep=0.74)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Z', mix=P.ice_slalom)
    section(lv, P.rail_puzzle, right='Y')
    section(lv, P.blizzard, right='B', mix=P.cold_spikes)
    section(lv, P.spinner_room, right='W', mix=P.crack_ledge)
    section(lv, P.cannon_hall, right='Z')
    section(lv, P.bubble_tower, right='Y')
    section(lv, P.loop, right='B', mix=P.void_ledge)
    section(lv, P.gauntlet, right='W')
    section(lv, P.pit, right='Z')
    section(lv, P.loop, right='W')
    section(lv, P.loop, right='B', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='W')
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor7():
    lv = Level('c9-cornisas-del-nucleo', 'Cornisas del núcleo', w=W, mood='dusk', cam_yaw=-24, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Y')
    section(lv, P.weight_gate, right='Z', mix=P.ice_slalom)
    # las tablas, de remate y no en medio: como tramo con paso se llevaban un cuarto del limo
    section(lv, P.crack_ledge, right='B')
    section(lv, P.cold_spikes, right='W')
    section(lv, P.bubble_tower, right='Y', mix=P.crack_ledge)
    section(lv, P.loop, right='Z', mix=P.void_ledge)
    section(lv, P.gauntlet, right='B')
    section(lv, P.pit, right='W')
    section(lv, P.cannon_hall, right='Z')
    section(lv, P.blizzard, right='B', mix=P.ice_slalom)
    section(lv, P.loop, right='Y')
    section(lv, P.loop, right='W', mix=P.crack_ledge)
    section(lv, P.cold_spikes, right='Y')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor8():
    lv = Level('c9-sala-de-los-ecos', 'Sala de los ecos', w=W, mood='cave', cam_yaw=20, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='B', mix=P.blizzard)
    section(lv, P.switch_gate, right='Y')
    section(lv, P.cannon_hall, right='Z')
    section(lv, P.cold_spikes, right='W', mix=P.ice_slalom)
    section(lv, P.bubble_tower, right='B')
    section(lv, P.loop, right='Y', mix=P.void_ledge)
    section(lv, P.gauntlet, right='Z')
    section(lv, P.blizzard, right='W')
    section(lv, P.pit, right='B', mix=P.crack_ledge)
    section(lv, P.loop, right='W')
    section(lv, P.loop, right='Y', mix=P.ice_slalom)
    section(lv, P.cold_spikes, right='Z')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor9():
    lv = Level('c9-laberinto-del-nucleo', 'Laberinto del núcleo', w=W, mood='cave', cam_yaw=-26, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Y', mix=P.ice_slalom)
    section(lv, P.rail_puzzle, right='Z')
    section(lv, P.cold_spikes, right='B')
    section(lv, P.bubble_tower, right='W', mix=P.crack_ledge)
    section(lv, P.cannon_hall, right='Y')
    section(lv, P.loop, right='Z', mix=P.void_ledge)
    section(lv, P.gauntlet, right='B')
    section(lv, P.blizzard, right='W')
    section(lv, P.pit, right='Y')
    section(lv, P.loop, right='B')
    section(lv, P.loop, right='Z', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='B')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor10():
    lv = Level('c9-corazon-de-hielo', 'Corazón de hielo', w=W, mood='dungeon', cam_yaw=0, keep=0.7)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Z', mix=P.blizzard)
    section(lv, P.weight_gate, right='Y')
    section(lv, P.cold_spikes, right='B', mix=P.ice_slalom)
    section(lv, P.cannon_hall, right='W')
    section(lv, P.bubble_tower, right='Z')
    section(lv, P.blizzard, right='Y', mix=P.crack_ledge)
    section(lv, P.loop, right='B', mix=P.void_ledge)
    section(lv, P.gauntlet, right='W')
    section(lv, P.pit, right='Z')
    section(lv, P.loop, right='Y')
    section(lv, P.blizzard, right='W')
    section(lv, P.loop, right='B', mix=P.crack_ledge)
    section(lv, P.cold_spikes, right='W')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


FLOORS = [floor1, floor2, floor3, floor4, floor5, floor6, floor7, floor8, floor9, floor10]


def main():
    levels, avisos = [], 0
    for n, make in enumerate(FLOORS, 1):
        lv = make()
        rows, steps, tips = lv.build()
        bad = check.check(rows, steps, lv.id)
        avisos += len(bad)
        for b in bad:
            print('  aviso', b)
        path = 'chapter9/%02d-%s.json' % (n, lv.id)
        print('%-26s %3d filas  %3d pasos' % (lv.id, len(rows), len(steps)))
        levels.append((lv, rows, steps, tips, path))
    writer.write_chapter(9, levels)
    writer.write_routes(levels)
    print('capitulo 9 escrito (%d avisos)' % avisos)


if __name__ == '__main__':
    main()
