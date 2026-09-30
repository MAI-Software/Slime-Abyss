"""Capítulo 11 «La Torre» (segundo del tema tecnológico).

Estrena los PISOS DE DOS PLANTAS: a mitad de camino hay un ascensor de raíl (una estación con
su gemela justo encima) y la vagoneta sube en espiral a la planta de arriba, que cuelga sobre
el vacío de la de abajo. El resto del piso se juega allí arriba, con el abismo debajo.

Un piso solo tiene dos canales de puerta, así que en cada uno va UNA de estas tres:
`weight_gate`, `rail_puzzle` o `switch_gate`.

  python -m scripts.levelkit.chapter11
"""

import os
import sys

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')))

from scripts.levelkit import Level, check, pieces as P, writer   # noqa: E402

W = 15


def section(lv, feature=None, left=None, right=None, wedge=False, neck_rows=1, mix=None, cliff=None):
    """Sala con su peligro en la fila de las monedas, paso con moneda y la mecánica que toque."""
    if cliff is None:
        cliff = (len(lv.rows) // 20) % 3 == 0
    if left is None:
        left = 'B' if (len(lv.rows) // 20) % 2 else 'Z'
    lv.add(P.room(lv, left=left, right=right, wedge=wedge, rows=4, cliff=cliff))
    if mix:
        lv.add(mix(lv))
    lv.add(P.neck(lv, rows=neck_rows, coin=True))
    if feature:
        lv.add(feature(lv))
        lv.add(P.neck(lv, rows=neck_rows, coin=True))
    return lv


def floor1():
    lv = Level('c11-primer-ascensor', 'Primer ascensor', w=W, mood='cave', cam_yaw=-12, keep=0.78)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Z', mix=P.ice_slalom)
    section(lv, P.roller_gap, right='W')
    section(lv, P.weight_gate, right='B')
    section(lv, P.loop, right='Y', mix=P.void_ledge)
    lv.lift()
    lv.tip('El ascensor sube a la planta de arriba', back=-4)
    lv.tip('El cilindro te lanza hacia donde empujas', back=-26)
    section(lv, P.cannon_hall, right='Z')
    section(lv, P.bubble_tower, right='W', mix=P.crack_ledge)
    section(lv, P.gauntlet, right='B')
    section(lv, P.blizzard, right='Y')
    section(lv, P.pit, right='Z')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor2():
    lv = Level('c11-andamios', 'Andamios', w=W, mood='dusk', cam_yaw=16, keep=0.76)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='B', mix=P.ice_slalom)
    section(lv, P.rail_puzzle, right='Z')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.roller_gap, right='Y')
    lv.lift()
    section(lv, P.loop_rail, right='Z')
    section(lv, P.bubble_tower, right='B')
    section(lv, P.cannon_hall, right='W', mix=P.crack_ledge)
    section(lv, P.gauntlet, right='Y')
    section(lv, P.pit, right='Z')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor3():
    lv = Level('c11-grua', 'Grúa', w=W, mood='cave', cam_yaw=-20, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Y', mix=P.blizzard)
    section(lv, P.switch_gate, right='Z')
    section(lv, P.bubble_tower, right='W')
    section(lv, P.loop, right='B', mix=P.void_ledge)
    lv.lift()
    section(lv, P.loop_rail, right='Y')
    section(lv, P.roller_gap, right='Z', mix=P.ice_slalom)
    section(lv, P.cannon_hall, right='W')
    section(lv, P.gauntlet, right='B', mix=P.crack_ledge)
    section(lv, P.pit, right='Y')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor4():
    lv = Level('c11-sala-de-turbinas', 'Sala de turbinas', w=W, mood='dusk', cam_yaw=20, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Z', mix=P.ice_slalom)
    section(lv, P.weight_gate, right='W')
    section(lv, P.loop, right='B', mix=P.void_ledge)
    section(lv, P.cannon_hall, right='Y')
    lv.lift()
    section(lv, P.loop_rail, right='Z')
    section(lv, P.blizzard, right='W', mix=P.crack_ledge)
    section(lv, P.bubble_tower, right='B')
    section(lv, P.gauntlet, right='Y')
    section(lv, P.roller_gap, right='Z')
    section(lv, P.pit, right='W')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor5():
    lv = Level('c11-pasarelas', 'Pasarelas', w=W, mood='cave', cam_yaw=-16, keep=0.74)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='W', mix=P.ice_slalom)
    section(lv, P.rail_puzzle, right='B')
    section(lv, P.pit, right='Y')
    section(lv, P.loop, right='Z', mix=P.void_ledge)
    lv.lift()
    section(lv, P.bubble_tower, right='W')
    section(lv, P.loop_rail, right='B')
    section(lv, P.roller_gap, right='Y', mix=P.crack_ledge)
    section(lv, P.blizzard, right='Z')
    section(lv, P.gauntlet, right='W')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor6():
    lv = Level('c11-almacen-alto', 'Almacén alto', w=W, mood='cave', cam_yaw=22, keep=0.74)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Y', mix=P.ice_slalom)
    section(lv, P.switch_gate, right='Z')
    section(lv, P.cannon_hall, right='W')
    section(lv, P.loop, right='B', mix=P.void_ledge)
    lv.lift()
    section(lv, P.loop_rail, right='Y')
    section(lv, P.bubble_tower, right='Z', mix=P.crack_ledge)
    section(lv, P.spinner_room, right='W')
    section(lv, P.gauntlet, right='B')
    section(lv, P.roller_gap, right='Y')
    section(lv, P.pit, right='Z')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor7():
    lv = Level('c11-cornisas-altas', 'Cornisas altas', w=W, mood='dusk', cam_yaw=-24, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.loop_rail, right='Z')
    section(lv, P.weight_gate, right='W', mix=P.ice_slalom)
    section(lv, P.blizzard, right='B')
    section(lv, P.loop, right='Y', mix=P.void_ledge)
    lv.lift()
    section(lv, P.bubble_tower, right='Z', mix=P.crack_ledge)
    section(lv, P.cannon_hall, right='W')
    section(lv, P.roller_gap, right='B')
    section(lv, P.gauntlet, right='Y')
    section(lv, P.pit, right='Z')
    lv.add(P.spinner_room(lv))
    lv.add(P.void_ledge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor8():
    lv = Level('c11-sala-de-maquinas', 'Sala de máquinas', w=W, mood='cave', cam_yaw=18, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='B', mix=P.blizzard)
    section(lv, P.rail_puzzle, right='Y')
    section(lv, P.cannon_hall, right='Z')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    lv.lift()
    section(lv, P.loop_rail, right='B')
    section(lv, P.fire_hall, right='Y', mix=P.ice_slalom)
    section(lv, P.bubble_tower, right='Z')
    section(lv, P.gauntlet, right='W', mix=P.crack_ledge)
    section(lv, P.roller_gap, right='B')
    section(lv, P.pit, right='Y')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor9():
    lv = Level('c11-laberinto-alto', 'Laberinto alto', w=W, mood='cave', cam_yaw=-26, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Z', mix=P.ice_slalom)
    section(lv, P.switch_gate, right='W')
    section(lv, P.bubble_tower, right='B')
    section(lv, P.loop, right='Y', mix=P.void_ledge)
    section(lv, P.roller_gap, right='Z')
    lv.lift()
    section(lv, P.loop_rail, right='W')
    section(lv, P.cannon_hall, right='B')
    section(lv, P.loop, right='Y', mix=P.crack_ledge)
    section(lv, P.gauntlet, right='Z')
    section(lv, P.blizzard, right='W')
    section(lv, P.pit, right='B')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor10():
    lv = Level('c11-cima-de-la-torre', 'Cima de la torre', w=W, mood='dungeon', cam_yaw=0, keep=0.7)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Y', mix=P.blizzard)
    section(lv, P.weight_gate, right='Z')
    section(lv, P.loop_rail, right='W')
    section(lv, P.cannon_hall, right='B')
    section(lv, P.loop, right='Z', mix=P.void_ledge)
    lv.lift()
    section(lv, P.loop_rail, right='Y')
    section(lv, P.bubble_tower, right='W', mix=P.crack_ledge)
    section(lv, P.blizzard, right='B')
    section(lv, P.gauntlet, right='Z')
    section(lv, P.roller_gap, right='Y', mix=P.ice_slalom)
    section(lv, P.pit, right='W')
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
        bad = check.check(rows, steps, lv.id, up=lv.top_up)
        avisos += len(bad)
        for b in bad:
            print('  aviso', b)
        path = 'chapter11/%02d-%s.json' % (n, lv.id)
        print('%-26s %3d filas  %3d pasos' % (lv.id, len(rows), len(steps)))
        levels.append((lv, rows, steps, tips, path))
    writer.write_chapter(11, levels)
    writer.write_routes(levels)
    print('capitulo 11 escrito (%d avisos)' % avisos)


if __name__ == '__main__':
    main()
