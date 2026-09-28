"""Capítulo 7 «El Glaciar Roto» (primer capítulo del hielo).

El tema es el frío: los chorros congelan al limo y congelado es DURO (no se pincha) y vuela
de una pieza en el cañón. Los pisos alternan: congélate para cruzar los pinchos, congélate
para que el cañonazo caiga en la diana, y descongélate para colarte por los sitios estrechos.
Sigue usando todo lo anterior (raíles, jabón, hondonadas, tablas, trampolines).

  python -m scripts.levelkit.chapter7
"""

import os
import sys

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')))

from scripts.levelkit import Level, check, pieces as P, writer   # noqa: E402

W = 15


def section(lv, feature=None, left=None, right=None, wedge=False, neck_rows=1, mix=None, cliff=None):
    """Sala con su peligro en la fila de las monedas, paso y la mecánica que toque.
    Pasos de una fila, salas de cuatro y una sala de cada dos colgada del vacío."""
    if cliff is None:
        cliff = (len(lv.rows) // 20) % 2 == 0
    if left is None:
        # roca agrietada, nunca pinchos: el pincho pegado a la moneda va comiendo limo
        left = 'B'
    lv.add(P.room(lv, left=left, right=right, wedge=wedge, rows=4, cliff=cliff))
    if mix:
        lv.add(mix(lv))
    lv.add(P.neck(lv, rows=neck_rows))
    if feature:
        lv.add(feature(lv))
        lv.add(P.neck(lv, rows=neck_rows))
    return lv


def floor1():
    lv = Level('c7-primer-hielo', 'Primer hielo', w=W, mood='bright', cam_yaw=-10, keep=0.8)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Y', mix=P.ice_slalom)
    section(lv, P.cold_spikes, right='Z')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    lv.tip('Congelado eres duro: los pinchos no te pinchan', back=-8)
    section(lv, P.gauntlet, right='B')
    section(lv, P.rail_puzzle, right='Z')
    section(lv, P.pit, right='W', mix=P.crack_ledge)
    section(lv, P.bubble_tower, right='Y')
    lv.add(P.spinner_room(lv))
    lv.add(P.crack_ledge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor2():
    lv = Level('c7-canon-helado', 'Canon helado', w=W, mood='dusk', cam_yaw=14, keep=0.78)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Z', mix=P.ice_slalom)
    section(lv, P.cannon_hall, right='Y')
    lv.tip('Congelado vuelas de una pieza y caes en la diana', back=-10)
    section(lv, P.bubble_tower, right='B', mix=P.cold_spikes)
    section(lv, P.rail_puzzle, right='W')
    section(lv, P.gauntlet, right='Z', mix=P.ice_slalom)
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.pit, right='Y', mix=P.crack_ledge)
    section(lv, P.loop, right='B')
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor3():
    lv = Level('c7-cornisas-de-escarcha', 'Cornisas de escarcha', w=W, mood='cave', cam_yaw=-18, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.ice_slalom, right='Y')
    section(lv, P.loop, right='B', mix=P.crack_ledge)
    section(lv, P.cold_spikes, right='Z')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.rail_puzzle, right='W')
    section(lv, P.pit, right='Y', mix=P.cold_spikes)
    section(lv, P.gauntlet, right='Z', mix=P.ice_slalom)
    section(lv, P.bubble_tower, right='B')
    lv.add(P.void_ledge(lv))
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor4():
    lv = Level('c7-vias-de-hielo', 'Vias de hielo', w=W, mood='dusk', cam_yaw=20, keep=0.78)
    lv.add(P.start_room(lv))
    section(lv, P.rail_puzzle, right='Z', mix=P.ice_slalom)
    section(lv, P.cold_spikes, right='Y')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.loop, right='W', mix=P.crack_ledge)
    section(lv, P.cannon_hall, right='B')
    section(lv, P.gauntlet, right='Z', mix=P.ice_slalom)
    section(lv, P.bubble_tower, right='Y')
    section(lv, P.pit, right='W', mix=P.cold_spikes)
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor5():
    lv = Level('c7-pozo-de-nieve', 'Pozo de nieve', w=W, mood='bright', cam_yaw=-14, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.pit, right='Y', mix=P.ice_slalom)
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.bubble_tower, right='Z')
    section(lv, P.cold_spikes, right='B')
    section(lv, P.loop, right='W')
    section(lv, P.gauntlet, right='Y')
    section(lv, P.rail_puzzle, right='Z')
    section(lv, P.loop, right='B')
    lv.add(P.crack_ledge(lv))
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor6():
    lv = Level('c7-sala-de-los-espejos', 'Sala de los espejos', w=W, mood='cave', cam_yaw=22, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Z', mix=P.ice_slalom)
    section(lv, P.rail_puzzle, right='Y')
    section(lv, P.spinner_room, right='B', mix=P.cold_spikes)
    section(lv, P.pit, right='W')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.cannon_hall, right='Z')
    section(lv, P.gauntlet, right='Y')
    section(lv, P.bubble_tower, right='B')
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.crack_ledge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor7():
    lv = Level('c7-tablas-heladas', 'Tablas heladas', w=W, mood='dusk', cam_yaw=-20, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.seesaw_bridge, right='Y', mix=P.ice_slalom)
    section(lv, P.cold_spikes, right='Z')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.gauntlet, right='B')
    section(lv, P.bubble_tower, right='W', mix=P.crack_ledge)
    section(lv, P.loop, right='Y')
    section(lv, P.rail_puzzle, right='Z')
    section(lv, P.pit, right='B', mix=P.ice_slalom)
    lv.add(P.spinner_room(lv))
    lv.add(P.void_ledge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor8():
    lv = Level('c7-grietas-de-escarcha', 'Grietas de escarcha', w=W, mood='cave', cam_yaw=16, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.crack_ledge, right='B', mix=P.ice_slalom)
    section(lv, P.cold_spikes, right='Y')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.rail_puzzle, right='Z')
    section(lv, P.pit, right='W', mix=P.ice_slalom)
    section(lv, P.cannon_hall, right='B')
    section(lv, P.loop, right='Y', mix=P.cold_spikes)
    section(lv, P.gauntlet, right='Z')
    section(lv, P.bubble_tower, right='W', mix=P.crack_ledge)
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor9():
    lv = Level('c7-laberinto-de-escarcha', 'Laberinto de escarcha', w=W, mood='cave', cam_yaw=-24, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Y', mix=P.ice_slalom)
    section(lv, P.rail_puzzle, right='Z')
    section(lv, P.cold_spikes, right='B')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.bubble_tower, right='W')
    section(lv, P.gauntlet, right='Y')
    section(lv, P.pit, right='Z')
    section(lv, P.cannon_hall, right='B')
    section(lv, P.loop, right='W')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.crack_ledge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor10():
    lv = Level('c7-corazon-del-glaciar', 'Corazon del glaciar', w=W, mood='dungeon', cam_yaw=0, keep=0.7)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Z', mix=P.ice_slalom)
    section(lv, P.rail_puzzle, right='Y')
    section(lv, P.cold_spikes, right='B')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.cannon_hall, right='W')
    section(lv, P.bubble_tower, right='Z')
    section(lv, P.gauntlet, right='Y')
    section(lv, P.pit, right='W')
    section(lv, P.loop, right='B', mix=P.crack_ledge)
    section(lv, P.spinner_room, right='Z')
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.void_ledge(lv))
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
        path = 'chapter7/%02d-%s.json' % (n, lv.id)
        print('%-26s %3d filas  %3d pasos' % (lv.id, len(rows), len(steps)))
        levels.append((lv, rows, steps, tips, path))
    writer.write_chapter(7, levels)
    writer.write_routes(levels)
    print('capitulo 7 escrito (%d avisos)' % avisos)


if __name__ == '__main__':
    main()
