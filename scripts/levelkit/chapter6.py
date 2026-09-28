"""Capítulo 6 «El Oasis Hundido» (tercer capítulo del desierto).

Estrena el jabón: el limo se hace burbuja, flota, cruza las corrientes de aire entero y sube
con los ventiladores de techo. Reaprovecha todo lo anterior (raíles, hondonadas, trampolines,
puertas encadenadas) y los pisos son los más largos del juego.

Los tramos MEZCLAN mecánicas a propósito: la nota de score.py sube con los combos (dos
familias distintas que se tocan) y con el peligro que se roza al coger las monedas.

  python -m scripts.levelkit.chapter6         (desde la carpeta del proyecto)
"""

import os
import sys

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')))

from scripts.levelkit import Level, check, pieces as P, writer   # noqa: E402

W = 15


def section(lv, feature=None, left=None, right=None, wedge=False, neck_rows=2, mix=None, **kw):
    """Tramo tipo: sala con su peligro en la fila de las monedas, paso y la mecánica que toque.
    `mix` pega otra pieza justo al lado para que las mecánicas se toquen (eso son los combos)."""
    lv.add(P.room(lv, left=left, right=right, wedge=wedge, rows=5))
    if mix:
        lv.add(mix(lv, **kw) if mix is P.ice_pass else mix(lv))
    lv.add(P.neck(lv, rows=neck_rows))
    if feature:
        lv.add(feature(lv))
        lv.add(P.neck(lv, rows=neck_rows))
    return lv


def floor1():
    lv = Level('c6-gota-de-jabon', 'Gota de jabón', w=W, mood='bright', cam_yaw=-8, keep=0.85)
    lv.add(P.start_room(lv))
    section(lv, right='O')
    section(lv, P.loop, right='Y', mix=P.ice_pass)
    section(lv, P.bubble_tower, right='Y')
    lv.tip('El jabón convierte al limo en burbuja', back=-8)
    section(lv, P.gauntlet, right='B', mix=P.fire_hall)
    section(lv, P.pit, right='Y', wedge=True)
    lv.add(P.crack_ledge(lv))
    lv.add(P.void_ledge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor2():
    lv = Level('c6-corrientes-del-oasis', 'Corrientes del oasis', w=W, mood='dusk', cam_yaw=12)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='Y', mix=P.ice_pass)
    section(lv, P.bubble_tower, right='W')
    section(lv, P.pit, right='Y', mix=P.fire_hall)
    section(lv, P.gauntlet, right='B', wedge=True)
    lv.add(P.crack_ledge(lv))
    lv.add(P.void_ledge(lv))
    section(lv, P.loop, right='Y')
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor3():
    lv = Level('c6-torres-de-arena', 'Torres de arena', w=W, mood='bright', cam_yaw=-16)
    lv.add(P.start_room(lv))
    section(lv, P.room, right='B', mix=P.ice_pass, wind='e')
    section(lv, P.bubble_tower, right='Y')
    section(lv, P.loop, right='Z', mix=P.fire_hall)
    section(lv, P.bubble_tower, right='Y')
    lv.tip('Con el chorro de aire la burbuja sube a la repisa', back=-8)
    section(lv, P.gauntlet, right='Y')
    lv.add(P.crack_ledge(lv))
    lv.add(P.void_ledge(lv))
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor4():
    lv = Level('c6-espuma-y-grietas', 'Espuma y grietas', w=W, mood='cave', cam_yaw=10, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.room, right='B', mix=P.crack_ledge)
    section(lv, P.bubble_tower, right='B')
    lv.tip('De burbuja la roca agrietada no se rompe', back=-8)
    section(lv, P.loop, right='Y', mix=P.ice_pass, wind='w')
    section(lv, P.gauntlet, right='B', mix=P.fire_hall)
    section(lv, P.pit, right='Y')
    section(lv, P.loop, right='Y')
    lv.add(P.treasure_room(lv))
    return lv


def floor5():
    lv = Level('c6-pozos-de-espuma', 'Pozos de espuma', w=W, mood='dusk', cam_yaw=-12, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.pit, right='B', mix=P.ice_pass)
    section(lv, P.loop, right='Z', mix=P.fire_hall)
    section(lv, P.pit, right='Y', wedge=True)
    section(lv, P.bubble_tower, right='Y')
    section(lv, P.gauntlet, right='Y')
    lv.add(P.crack_ledge(lv))
    lv.add(P.void_ledge(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor6():
    lv = Level('c6-vias-del-oasis', 'Vías del oasis', w=W, mood='cave', cam_yaw=18)
    lv.add(P.start_room(lv))
    section(lv, P.room, right='B', mix=P.ice_pass, wind='e')
    section(lv, P.rail_puzzle, right='W')
    lv.tip('El interruptor de una vía abre la otra', back=-12)
    section(lv, P.loop, right='Y', mix=P.fire_hall)
    section(lv, P.bubble_tower, right='Y')
    section(lv, P.gauntlet, right='B')
    lv.add(P.crack_ledge(lv))
    lv.add(P.void_ledge(lv))
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor7():
    lv = Level('c6-saltos-de-espuma', 'Saltos de espuma', w=W, mood='bright', cam_yaw=-20, keep=0.7)
    lv.add(P.start_room(lv))
    section(lv, P.gauntlet, right='B', mix=P.ice_pass)
    section(lv, P.room, right='Y', mix=P.fire_hall)
    section(lv, P.gauntlet, wedge=True)
    section(lv, P.bubble_tower, right='Z')
    lv.add(P.crack_ledge(lv))
    section(lv, P.loop, right='Z')
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor8():
    lv = Level('c6-canaveral', 'Cañaveral', w=W, mood='dusk', cam_yaw=14, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.room, right='W', mix=P.fire_hall)
    section(lv, P.loop, right='Y', mix=P.ice_pass, wind='w')
    section(lv, P.bubble_tower, right='B')
    section(lv, P.pit, right='Y')
    section(lv, P.gauntlet, right='B')
    lv.add(P.crack_ledge(lv))
    lv.add(P.void_ledge(lv))
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.treasure_room(lv))
    return lv


def floor9():
    lv = Level('c6-laberinto-de-vidrio', 'Laberinto de vidrio', w=W, mood='cave', cam_yaw=-22, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.loop, right='B', mix=P.ice_pass, wind='e')
    section(lv, P.rail_puzzle, right='Y')
    section(lv, P.pit, right='Z', wedge=True, mix=P.fire_hall)
    section(lv, P.bubble_tower, right='Y')
    section(lv, P.gauntlet, right='B')
    lv.add(P.crack_ledge(lv))
    lv.add(P.void_ledge(lv))
    lv.add(P.spinner_room(lv))
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor10():
    lv = Level('c6-corazon-del-oasis', 'Corazón del oasis', w=W, mood='dungeon', cam_yaw=0, keep=0.7)
    lv.add(P.start_room(lv))
    section(lv, P.room, right='W', mix=P.ice_pass, wind='w')
    section(lv, P.loop, right='W', mix=P.fire_hall)
    section(lv, P.rail_puzzle, right='W')
    section(lv, P.pit, right='Z')
    section(lv, P.bubble_tower, right='B')
    section(lv, P.gauntlet, right='W', wedge=True)
    section(lv, P.loop, right='B')
    lv.add(P.seesaw_bridge(lv))
    lv.add(P.spinner_room(lv))
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
        path = 'chapter6/%02d-%s.json' % (n, lv.id)
        print('%-26s %3d filas  %3d pasos' % (lv.id, len(rows), len(steps)))
        levels.append((lv, rows, steps, tips, path))
    writer.write_chapter(6, levels)
    writer.write_routes(levels)
    print('capitulo 6 escrito (%d avisos)' % avisos)


if __name__ == '__main__':
    main()
