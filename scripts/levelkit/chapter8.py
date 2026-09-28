"""Capítulo 8 «La Ventisca» (segundo capítulo del hielo).

Estrena dos cosas: la VENTISCA (pista de hielo con rachas de viento que entran por los muros,
una a cada lado, y las monedas al lado contrario del empujón) y las PUERTAS ENCADENADAS a pie
(el interruptor del fondo de un ramal abre la puerta que lleva al segundo interruptor).

Los dos canales de puerta son solo dos por piso, así que `switch_gate` y `rail_puzzle` nunca
van en el mismo piso: los pisos alternan uno u otro.

  python -m scripts.levelkit.chapter8
"""

import os
import sys

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')))

from scripts.levelkit import Level, check, pieces as P, writer   # noqa: E402

W = 15


CLIFF = [True, False]          # una sala de cada dos cuelga del abismo


def section(lv, feature=None, left=None, right=None, wedge=False, neck_rows=1, mix=None, cliff=None):
    """Sala con su peligro en la fila de las monedas, paso y la mecánica que toque.
    Pasos de una fila y salas de cuatro: menos suelo vacío, que el medidor lo penaliza.
    Las salas van alternando terraza colgada del vacío y sala cerrada: en el capítulo de la
    ventisca el peligro es el borde, no más pinchos (los pinchos se comen al limo)."""
    if cliff is None:
        cliff = CLIFF[len(lv.rows) // 20 % 2]
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
    lv = Level('c8-primeras-rachas', 'Primeras rachas', w=W, mood='bright', cam_yaw=-12, keep=0.78)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Z', mix=P.ice_slalom)
    lv.tip('La racha empuja: cruza apretado y pegado al muro', back=-10)
    section(lv, P.cold_spikes, right='Y')
    section(lv, P.loop, right='B')
    section(lv, P.loop, right='B')
    section(lv, P.switch_gate, right='W')
    section(lv, P.gauntlet, right='Z', mix=P.crack_ledge)
    section(lv, P.pit, right='Y')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    section(lv, P.bubble_tower, right='B')
    section(lv, P.loop, right='Y')
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor2():
    lv = Level('c8-puertas-de-escarcha', 'Puertas de escarcha', w=W, mood='cave', cam_yaw=16, keep=0.76)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Z', mix=P.blizzard)
    section(lv, P.switch_gate, right='Y')
    lv.tip('Un interruptor abre la puerta del siguiente', back=-12)
    section(lv, P.cold_spikes, right='B')
    section(lv, P.loop, right='B')
    section(lv, P.cannon_hall, right='W')
    section(lv, P.gauntlet, right='Z')
    section(lv, P.pit, right='Y', mix=P.crack_ledge)
    section(lv, P.bubble_tower, right='B')
    section(lv, P.loop, right='Y')
    section(lv, P.loop, right='Z', mix=P.void_ledge)
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor3():
    lv = Level('c8-torre-de-nieve', 'Torre de nieve', w=W, mood='dusk', cam_yaw=-20, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Y', mix=P.ice_slalom)
    section(lv, P.bubble_tower, right='Z')
    section(lv, P.loop, right='B')
    section(lv, P.rail_puzzle, right='B')
    section(lv, P.cold_spikes, right='W', mix=P.crack_ledge)
    section(lv, P.loop, right='Y')
    section(lv, P.loop, right='Y')
    section(lv, P.gauntlet, right='Z')
    section(lv, P.pit, right='B')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor4():
    lv = Level('c8-vientos-cruzados', 'Vientos cruzados', w=W, mood='cave', cam_yaw=22, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='B', mix=P.cold_spikes)
    section(lv, P.switch_gate, right='Z')
    section(lv, P.loop, right='Y', mix=P.ice_slalom)
    section(lv, P.cannon_hall, right='W')
    section(lv, P.loop, right='B')
    section(lv, P.bubble_tower, right='B')
    section(lv, P.loop, right='Y')
    section(lv, P.gauntlet, right='Y')
    section(lv, P.pit, right='Z', mix=P.crack_ledge)
    section(lv, P.loop, right='Y', mix=P.void_ledge)
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor5():
    lv = Level('c8-pozo-blanco', 'Pozo blanco', w=W, mood='bright', cam_yaw=-18, keep=0.74)
    lv.add(P.start_room(lv))
    section(lv, P.pit, right='Y', mix=P.blizzard)
    section(lv, P.rail_puzzle, right='Z')
    section(lv, P.cold_spikes, right='B', mix=P.ice_slalom)
    section(lv, P.loop, right='B')
    section(lv, P.bubble_tower, right='W')
    section(lv, P.loop, right='Y')
    section(lv, P.loop, right='Y')
    section(lv, P.gauntlet, right='Z', mix=P.crack_ledge)
    section(lv, P.blizzard, right='B')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    lv.add(P.void_ledge(lv))
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor6():
    lv = Level('c8-cristales', 'Cristales', w=W, mood='cave', cam_yaw=14, keep=0.74)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Z', mix=P.ice_slalom)
    section(lv, P.switch_gate, right='Y')
    section(lv, P.blizzard, right='B', mix=P.cold_spikes)
    section(lv, P.cannon_hall, right='W')
    section(lv, P.loop, right='B')
    section(lv, P.spinner_room, right='Z', mix=P.crack_ledge)
    section(lv, P.gauntlet, right='Y')
    section(lv, P.bubble_tower, right='B')
    section(lv, P.loop, right='Y')
    section(lv, P.pit, right='W')
    section(lv, P.loop, right='Y', mix=P.void_ledge)
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor7():
    lv = Level('c8-cornisas-del-viento', 'Cornisas del viento', w=W, mood='dusk', cam_yaw=-24, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Y')
    section(lv, P.seesaw_bridge, right='Z', mix=P.ice_slalom)
    section(lv, P.rail_puzzle, right='B')
    section(lv, P.cold_spikes, right='W')
    section(lv, P.loop, right='B')
    section(lv, P.bubble_tower, right='Y', mix=P.crack_ledge)
    section(lv, P.loop, right='Y')
    section(lv, P.loop, right='Z')
    section(lv, P.gauntlet, right='B')
    section(lv, P.pit, right='Y')
    section(lv, P.loop, right='W', mix=P.void_ledge)
    lv.add(P.spinner_room(lv))
    lv.add(P.void_ledge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor8():
    lv = Level('c8-sala-de-las-corrientes', 'Sala de las corrientes', w=W, mood='cave', cam_yaw=18, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='B', mix=P.ice_slalom)
    section(lv, P.switch_gate, right='Y')
    section(lv, P.cannon_hall, right='Z')
    section(lv, P.loop, right='B')
    section(lv, P.cold_spikes, right='W', mix=P.crack_ledge)
    section(lv, P.bubble_tower, right='B')
    section(lv, P.loop, right='Y')
    section(lv, P.loop, right='Y')
    section(lv, P.gauntlet, right='Z')
    section(lv, P.pit, right='W')
    section(lv, P.loop, right='Z', mix=P.void_ledge)
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor9():
    lv = Level('c8-laberinto-blanco', 'Laberinto blanco', w=W, mood='cave', cam_yaw=-26, keep=0.72)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Y', mix=P.blizzard)
    section(lv, P.rail_puzzle, right='Z')
    section(lv, P.cold_spikes, right='B', mix=P.ice_slalom)
    section(lv, P.loop, right='B')
    section(lv, P.bubble_tower, right='W')
    section(lv, P.cannon_hall, right='Y')
    section(lv, P.loop, right='Y')
    section(lv, P.gauntlet, right='Z', mix=P.crack_ledge)
    section(lv, P.pit, right='B')
    section(lv, P.blizzard, right='W')
    section(lv, P.loop, right='Y', mix=P.void_ledge)
    lv.add(P.spinner_room(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor10():
    lv = Level('c8-ojo-de-la-ventisca', 'Ojo de la ventisca', w=W, mood='dungeon', cam_yaw=0, keep=0.7)
    lv.add(P.start_room(lv))
    section(lv, P.blizzard, right='Z', mix=P.ice_slalom)
    section(lv, P.switch_gate, right='Y')
    section(lv, P.cold_spikes, right='B', mix=P.crack_ledge)
    section(lv, P.loop, right='B')
    section(lv, P.cannon_hall, right='W')
    section(lv, P.bubble_tower, right='Z')
    section(lv, P.loop, right='Y')
    section(lv, P.loop, right='Y')
    section(lv, P.gauntlet, right='B')
    section(lv, P.pit, right='W')
    section(lv, P.blizzard, right='Z')
    section(lv, P.loop, right='Y', mix=P.void_ledge)
    lv.add(P.spinner_room(lv))
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
        path = 'chapter8/%02d-%s.json' % (n, lv.id)
        print('%-28s %3d filas  %3d pasos' % (lv.id, len(rows), len(steps)))
        levels.append((lv, rows, steps, tips, path))
    writer.write_chapter(8, levels)
    writer.write_routes(levels)
    print('capitulo 8 escrito (%d avisos)' % avisos)


if __name__ == '__main__':
    main()
