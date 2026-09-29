"""Capítulo 10 «La Fábrica» (primero del tema tecnológico).

Estrena las VÍAS CON FORMA: la vagoneta hace un bucle vertical y una espiral de dos vueltas
(de esas el limo sale mareado). El tema tecnológico mezcla de propósito todo lo anterior:
ventisca, jabón, cañones, placas de peso, puzles de vías y trampolines.

Un piso solo tiene dos canales de puerta, así que en cada uno va UNA de estas tres:
`weight_gate`, `rail_puzzle` o `switch_gate`.

  python -m scripts.levelkit.chapter10
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
        # la roca agrietada de al lado de la moneda también se lleva algún limito (el borde de
        # la bola la pisa), así que va una sala sí y otra no; la otra lleva bloque de hielo
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
    lv = Level('c10-cinta-de-montaje', 'Cinta de montaje', w=W, mood='cave', cam_yaw=-10, keep=0.78)
    lv.add(P.start_room(lv))
    section(lv, P.loop_rail, right='Z')
    lv.tip('La vagoneta hace el rizo: agárrate', back=-12)
    section(lv, P.cold_spikes, right='Y', mix=P.ice_slalom)
    section(lv, P.weight_gate, right='B')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.cannon_hall, right='Z')
    section(lv, P.bubble_tower, right='Y', mix=P.crack_ledge)
    section(lv, P.gauntlet, right='B')
    section(lv, P.blizzard, right='W')
    section(lv, P.pit, right='Z')
    section(lv, P.loop, right='Y')
    section(lv, P.loop, right='B', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='Z')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor2():
    lv = Level('c10-sala-de-calderas', 'Sala de calderas', w=W, mood='dusk', cam_yaw=16, keep=0.76)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='B', mix=P.fire_hall)
    section(lv, P.loop_rail, right='Z')
    section(lv, P.rail_puzzle, right='Y')
    section(lv, P.blizzard, right='W', mix=P.ice_slalom)
    section(lv, P.cannon_hall, right='B')
    section(lv, P.bubble_tower, right='Z')
    section(lv, P.gauntlet, right='Y', mix=P.crack_ledge)
    section(lv, P.pit, right='W')
    section(lv, P.loop, right='Z', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='B')
    section(lv, P.loop, right='W', mix=P.ice_slalom)
    section(lv, P.cold_spikes, right='B')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor3():
    lv = Level('c10-engranajes', 'Engranajes', w=W, mood='cave', cam_yaw=-18, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.spinner_room, right='Y', mix=P.ice_slalom)
    section(lv, P.loop_rail, right='Z')
    section(lv, P.weight_gate, right='B')
    section(lv, P.cold_spikes, right='W', mix=P.crack_ledge)
    section(lv, P.loop, right='Y', mix=P.void_ledge)
    section(lv, P.bubble_tower, right='Z')
    section(lv, P.cannon_hall, right='B')
    section(lv, P.gauntlet, right='W')
    section(lv, P.blizzard, right='Y')
    section(lv, P.pit, right='Z')
    section(lv, P.loop, right='Y', mix=P.crack_ledge)
    section(lv, P.cold_spikes, right='W')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor4():
    lv = Level('c10-tuberias', 'Tuberías', w=W, mood='dusk', cam_yaw=20, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Z', mix=P.blizzard)
    section(lv, P.switch_gate, right='Y')
    section(lv, P.loop_rail, right='B')
    section(lv, P.fire_hall, right='W', mix=P.ice_slalom)
    section(lv, P.bubble_tower, right='Z')
    section(lv, P.cannon_hall, right='Y')
    section(lv, P.gauntlet, right='B', mix=P.crack_ledge)
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='Z')
    section(lv, P.pit, right='Y')
    section(lv, P.loop, right='Z', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='Y')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor5():
    """El horno es el piso más largo del capítulo, y en un piso largo los roces pequeños suman:
    aquí el adorno de al lado de las monedas es bloque de hielo o planta (no hace daño) y solo
    hay un tramo de pinchos. Con roca agrietada a los dos lados se quedaba en el 88 %."""
    lv = Level('c10-horno', 'Horno', w=W, mood='dusk', cam_yaw=-14, keep=0.74)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, left='Z', right='W', mix=lambda lv: P.fire_hall(lv, oil=False))
    section(lv, P.loop_rail, left='Z', right='W')
    section(lv, P.weight_gate, left='B', right='Z')
    section(lv, P.pit, left='Z', right='W')
    section(lv, P.bubble_tower, left='W', right='Z')
    section(lv, P.loop, left='Z', right='W', mix=P.void_ledge)
    section(lv, P.cannon_hall, left='B', right='Z')
    section(lv, P.gauntlet, left='Z', right='W')
    section(lv, P.cold_spikes, left='W', right='Z')
    section(lv, P.loop, left='Z', right='W')
    section(lv, P.loop, left='B', right='Y', mix=P.ice_slalom)
    section(lv, P.spinner_room, left='Z', right='W')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor6():
    lv = Level('c10-almacen', 'Almacén', w=W, mood='cave', cam_yaw=22, keep=0.74)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='W', mix=P.ice_slalom)
    section(lv, P.rail_puzzle, right='Z')
    section(lv, P.loop_rail, right='Y')
    section(lv, P.blizzard, right='B', mix=P.cold_spikes)
    section(lv, P.spinner_room, right='W', mix=P.crack_ledge)
    section(lv, P.bubble_tower, right='Z')
    section(lv, P.cannon_hall, right='Y')
    section(lv, P.loop, right='B', mix=P.void_ledge)
    section(lv, P.gauntlet, right='W')
    section(lv, P.pit, right='Z')
    section(lv, P.loop, right='W', mix=P.crack_ledge)
    section(lv, P.cold_spikes, right='B')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor7():
    lv = Level('c10-cadena-de-vias', 'Cadena de vías', w=W, mood='cave', cam_yaw=-24, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.loop_rail, right='Y')
    section(lv, P.weight_gate, right='Z', mix=P.ice_slalom)
    section(lv, P.loop_rail, right='B')
    section(lv, P.blizzard, right='W')
    section(lv, P.bubble_tower, right='Y', mix=P.crack_ledge)
    section(lv, P.loop, right='Z', mix=P.void_ledge)
    section(lv, P.cannon_hall, right='B')
    section(lv, P.gauntlet, right='W')
    section(lv, P.cold_spikes, right='Y')
    section(lv, P.pit, right='Z')
    section(lv, P.loop, right='Y', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='W')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor8():
    lv = Level('c10-sala-de-control', 'Sala de control', w=W, mood='cave', cam_yaw=18, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='B', mix=P.blizzard)
    section(lv, P.switch_gate, right='Y')
    section(lv, P.loop_rail, right='Z')
    section(lv, P.cannon_hall, right='W')
    section(lv, P.fire_hall, right='B', mix=P.ice_slalom)
    section(lv, P.bubble_tower, right='Y')
    section(lv, P.loop, right='Z', mix=P.void_ledge)
    section(lv, P.gauntlet, right='W', mix=P.crack_ledge)
    section(lv, P.cold_spikes, right='B')
    section(lv, P.pit, right='Y')
    section(lv, P.loop, right='Z', mix=P.ice_slalom)
    section(lv, P.cold_spikes, right='Y')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor9():
    lv = Level('c10-laberinto-de-acero', 'Laberinto de acero', w=W, mood='cave', cam_yaw=-26, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Y', mix=P.ice_slalom)
    section(lv, P.rail_puzzle, right='Z')
    section(lv, P.loop_rail, right='B')
    section(lv, P.cold_spikes, right='W')
    section(lv, P.bubble_tower, right='Y', mix=P.crack_ledge)
    section(lv, P.cannon_hall, right='Z')
    section(lv, P.loop, right='B', mix=P.void_ledge)
    section(lv, P.fire_hall, right='W')
    section(lv, P.gauntlet, right='Z')
    section(lv, P.pit, right='Y')
    section(lv, P.loop, right='W')
    section(lv, P.loop, right='Y', mix=P.crack_ledge)
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor10():
    lv = Level('c10-corazon-de-la-maquina', 'Corazón de la máquina', w=W, mood='dungeon', cam_yaw=0, keep=0.7)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Z', mix=P.blizzard)
    section(lv, P.loop_rail, right='Y')
    section(lv, P.weight_gate, right='B')
    section(lv, P.cannon_hall, right='W')
    section(lv, P.bubble_tower, right='Z')
    section(lv, P.fire_hall, right='Y', mix=P.ice_slalom)
    section(lv, P.loop_rail, right='B')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.gauntlet, right='Z', mix=P.crack_ledge)
    section(lv, P.cold_spikes, right='Y')
    section(lv, P.pit, right='W')
    section(lv, P.loop, right='Z', mix=P.crack_ledge)
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
        path = 'chapter10/%02d-%s.json' % (n, lv.id)
        print('%-28s %3d filas  %3d pasos' % (lv.id, len(rows), len(steps)))
        levels.append((lv, rows, steps, tips, path))
    writer.write_chapter(10, levels)
    writer.write_routes(levels)
    print('capitulo 10 escrito (%d avisos)' % avisos)


if __name__ == '__main__':
    main()
