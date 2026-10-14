"""Capítulo 12 «La Ciudadela» (último del tema tecnológico y último del juego).

No estrena mecánica: las junta TODAS. Cada piso lleva ventisca, jabón, cañón, cilindros,
vías con forma, trampolines y una de las tres puertas, y los tres pisos del ascensor usan
las dos plantas. Es la ruina de la ciudad de arriba: lo que en el capítulo 10 era fábrica
nueva aquí está partido, y el peligro de verdad es el borde, no el pincho.

Un piso solo tiene dos canales de puerta, así que en cada uno va UNA de estas tres:
`weight_gate`, `rail_puzzle` o `switch_gate`.

  python -m scripts.levelkit.chapter12
"""

import os
import sys

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')))

from scripts.levelkit import Level, check, pieces as P, writer   # noqa: E402

W = 15


def section(lv, feature=None, left=None, right=None, wedge=False, neck_rows=1, mix=None, cliff=None):
    """Sala con su peligro en la fila de las monedas, paso con moneda y la mecánica que toque.
    Dos de cada tres salas cuelgan del vacío: en la ciudadela el suelo es lo que falta."""
    if cliff is None:
        cliff = (len(lv.rows) // 20) % 3 != 0
    if left is None:
        left = 'B' if (len(lv.rows) // 20) % 2 else 'Z'
    lv.add(P.room(lv, left=left, right=right, wedge=wedge, rows=4, cliff=cliff))
    if mix:
        lv.add(mix(lv))
    lv.add(P.neck(lv, rows=neck_rows, coin=True))
    if feature:
        lv.add(feature(lv))
        lv.add(P.neck(lv, rows=neck_rows))
    return lv


def floor1():
    lv = Level('c12-puertas-de-la-ciudadela', 'Puertas de la ciudadela', w=W, mood='dusk', cam_yaw=-12, keep=0.85)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Z', mix=P.ice_slalom)
    lv.tip('La ciudadela junta todo lo que has aprendido', back=-6)
    section(lv, P.switch_gate, right='W')
    section(lv, P.roller_gap, right='B')
    section(lv, P.cannon_hall, right='Y', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='W', mix=P.crack_ledge)
    section(lv, P.bubble_tower, right='Z')
    section(lv, P.blizzard, right='W', mix=P.crack_ledge)
    section(lv, P.loop_rail, right='B')
    section(lv, P.gauntlet, right='Y')
    section(lv, P.pit, right='Z')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor2():
    lv = Level('c12-avenida-rota', 'Avenida rota', w=W, mood='cave', cam_yaw=16, keep=0.84)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='B', mix=P.void_ledge)
    section(lv, P.rail_puzzle, right='Z')
    section(lv, P.roller_gap, right='W', mix=P.ice_slalom)
    lv.tip('El cilindro te lanza hacia donde empujas', back=-10)
    section(lv, P.fire_hall, right='Y')
    section(lv, P.cold_spikes, right='W', mix=P.crack_ledge)
    section(lv, P.charge_rail, right='B')
    section(lv, P.cannon_hall, right='Z', mix=P.crack_ledge)
    section(lv, P.loop_rail, right='W')
    section(lv, P.gauntlet, right='Y')
    section(lv, P.pit, right='B')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor3():
    lv = Level('c12-torres-caidas', 'Torres caídas', w=W, mood='dusk', cam_yaw=-20, keep=0.80)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Y', mix=P.blizzard)
    section(lv, P.weight_gate, right='Z')
    section(lv, P.bubble_tower, right='W')
    section(lv, P.roller_gap, right='B', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='W', mix=P.crack_ledge)
    section(lv, P.cannon_hall, right='Y')
    section(lv, P.loop_rail, right='Z', mix=P.ice_slalom)
    section(lv, P.spinner_room, right='W')
    section(lv, P.gauntlet, right='B', mix=P.crack_ledge)
    section(lv, P.pit, right='Y')
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor4():
    lv = Level('c12-grua-parada', 'Grúa parada', w=W, mood='cave', cam_yaw=20, keep=0.83)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Z', mix=P.ice_slalom)
    section(lv, P.switch_gate, right='W')
    section(lv, P.roller_gap, right='B', mix=P.void_ledge)
    section(lv, P.cannon_hall, right='Y')
    section(lv, P.cold_spikes, right='W', mix=P.crack_ledge)
    section(lv, P.rail_ride, right='W')
    section(lv, P.loop_rail, right='Z')
    section(lv, P.bubble_tower, right='W', mix=P.crack_ledge)
    section(lv, P.gauntlet, right='B')
    section(lv, P.pit, right='Y')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor5():
    lv = Level('c12-plaza-de-neon', 'Plaza de neón', w=W, mood='dusk', cam_yaw=-16, keep=0.84)
    lv.add(P.start_room(lv))
    section(lv, P.rail_puzzle, right='B')
    section(lv, P.fire_hall, right='Y', mix=P.ice_slalom)
    section(lv, P.roller_gap, right='Z')
    section(lv, P.cold_spikes, right='W', mix=P.crack_ledge)
    section(lv, P.charge_rail, right='W', mix=P.void_ledge)
    lv.tip('El chorro de aire sube la burbuja a la repisa', back=-10)
    section(lv, P.cannon_hall, right='B')
    section(lv, P.loop_rail, right='Y', mix=P.crack_ledge)
    section(lv, P.gauntlet, right='Z')
    section(lv, P.pit, right='W')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor6():
    lv = Level('c12-conductos', 'Conductos', w=W, mood='cave', cam_yaw=22, keep=0.83)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Y', mix=P.void_ledge)
    section(lv, P.weight_gate, right='Z')
    section(lv, P.cannon_hall, right='W')
    section(lv, P.roller_gap, right='B', mix=P.ice_slalom)
    section(lv, P.cold_spikes, right='W', mix=P.crack_ledge)
    section(lv, P.generator_gate_b, right='Y')
    section(lv, P.bubble_tower, right='Z', mix=P.crack_ledge)
    section(lv, P.spinner_room, right='W')
    section(lv, P.gauntlet, right='B')
    section(lv, P.pit, right='Y')
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor7():
    lv = Level('c12-mirador-roto', 'Mirador roto', w=W, mood='dusk', cam_yaw=-24, keep=0.84)
    lv.add(P.start_room(lv))
    section(lv, P.loop_rail, right='Z', mix=P.ice_slalom)
    section(lv, P.switch_gate, right='W')
    section(lv, P.blizzard, right='B')
    section(lv, P.roller_gap, right='Y', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='W', mix=P.crack_ledge)
    section(lv, P.rail_ride, right='W')
    section(lv, P.bubble_tower, right='Z', mix=P.crack_ledge)
    section(lv, P.cannon_hall, right='W')
    section(lv, P.gauntlet, right='B')
    section(lv, P.pit, right='Y')
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor8():
    lv = Level('c12-sala-de-los-relojes', 'Sala de los relojes', w=W, mood='cave', cam_yaw=18, keep=0.84)
    lv.add(P.start_room(lv))
    section(lv, P.rail_puzzle, right='Y')
    section(lv, P.blizzard, right='Z', mix=P.ice_slalom)
    section(lv, P.roller_gap, right='W')
    section(lv, P.ice_pass, right='W', mix=P.crack_ledge)
    section(lv, P.cannon_hall, right='B', mix=P.void_ledge)
    section(lv, P.charge_rail, right='Y')
    section(lv, P.loop_rail, right='Z', mix=P.crack_ledge)
    section(lv, P.gauntlet, right='W')
    section(lv, P.pit, right='B')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor9():
    lv = Level('c12-laberinto-de-la-ciudadela', 'Laberinto de la ciudadela', w=W, mood='cave', cam_yaw=-26, keep=0.81)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Z', mix=P.ice_slalom)
    section(lv, P.weight_gate, right='W')
    section(lv, P.generator_gate_b, right='B')
    section(lv, P.roller_gap, right='Y', mix=P.void_ledge)
    section(lv, P.cold_spikes, right='W', mix=P.crack_ledge)
    section(lv, P.cannon_hall, right='Z')
    section(lv, P.loop_rail, right='W', mix=P.crack_ledge)
    section(lv, P.spinner_room, right='B')
    section(lv, P.gauntlet, right='Y')
    section(lv, P.pit, right='Z')
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor10():
    lv = Level('c12-corazon-de-la-ciudadela', 'Corazón de la ciudadela', w=W, mood='dungeon', cam_yaw=0, keep=0.79)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Y', mix=P.blizzard)
    section(lv, P.switch_gate, right='Z')
    section(lv, P.roller_gap, right='W', mix=P.ice_slalom)
    section(lv, P.cannon_hall, right='B')
    section(lv, P.rail_ride, right='W')
    section(lv, P.cold_spikes, right='B', mix=P.void_ledge)
    section(lv, P.loop_rail, right='Y')
    section(lv, P.bubble_tower, right='Z', mix=P.crack_ledge)
    section(lv, P.fire_hall, right='W', mix=P.void_ledge)
    section(lv, P.gauntlet, right='B')
    section(lv, P.pit, right='Y')
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
        path = 'chapter12/%02d-%s.json' % (n, lv.id)
        print('%-32s %3d filas  %3d pasos' % (lv.id, len(rows), len(steps)))
        levels.append((lv, rows, steps, tips, path))
    writer.write_chapter(12, levels)
    writer.write_routes(levels)
    print('capitulo 12 escrito (%d avisos)' % avisos)


if __name__ == '__main__':
    main()
