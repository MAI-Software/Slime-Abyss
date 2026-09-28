"""Capítulo 6 «El Oasis Hundido» (tercer capítulo del desierto).

Estrena el jabón: el limo se hace burbuja, flota, cruza las corrientes de aire entero y sube
con los ventiladores de techo. Reaprovecha todo lo anterior (raíles, hondonadas, trampolines,
puertas encadenadas) y los pisos son los más largos del juego.

  python -m scripts.levelkit.chapter6         (desde la carpeta del proyecto)
"""

import os
import sys

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')))

from scripts.levelkit import Level, check, pieces as P, writer   # noqa: E402

W = 15


def section(lv, feature=None, left=None, right=None, wedge=False, neck_rows=2, **kw):
    """Tramo tipo: sala con monedas, paso y la mecánica que toque."""
    lv.add(P.room(lv, left=left, right=right, wedge=wedge, rows=5))
    lv.add(P.neck(lv, rows=neck_rows))
    if feature:
        lv.add(feature(lv, **kw))
        lv.add(P.neck(lv, rows=neck_rows))
    return lv


def floor1():
    lv = Level('c6-gota-de-jabon', 'Gota de jabón', w=W, mood='bright', cam_yaw=-8, keep=0.85)
    lv.add(P.start_room(lv))
    section(lv, right='O')
    section(lv, P.loop, left='Y')
    section(lv, P.bubble_tower)
    lv.tip('El jabón convierte al limo en burbuja', back=-8)
    section(lv, P.gauntlet, left='Y', right='Y')
    section(lv, P.room, wedge=True)
    section(lv, P.pit)
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor2():
    lv = Level('c6-corrientes-del-oasis', 'Corrientes del oasis', w=W, mood='dusk', cam_yaw=12)
    lv.add(P.start_room(lv))
    section(lv, P.loop, left='B', right='Y')
    section(lv, P.bubble_tower)
    section(lv, P.pit, left='W', right='W')
    section(lv, P.gauntlet, wedge=True)
    section(lv, P.loop, left='Z')
    section(lv, P.room)
    lv.add(P.treasure_room(lv))
    return lv


def floor3():
    lv = Level('c6-torres-de-arena', 'Torres de arena', w=W, mood='bright', cam_yaw=-16)
    lv.add(P.start_room(lv))
    section(lv, P.room, left='Y')
    section(lv, P.bubble_tower)
    section(lv, P.loop, right='Z')
    section(lv, P.bubble_tower)
    lv.tip('Con el chorro de aire la burbuja sube a la repisa', back=-8)
    section(lv, P.gauntlet, left='Y', right='Y')
    section(lv, P.pit)
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor4():
    lv = Level('c6-espuma-y-grietas', 'Espuma y grietas', w=W, mood='cave', cam_yaw=10, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.room, left='B', right='B')
    section(lv, P.bubble_tower)
    lv.tip('De burbuja la roca agrietada no se rompe', back=-8)
    section(lv, P.loop, left='B', right='B')
    section(lv, P.gauntlet)
    section(lv, P.pit, left='B', right='Y')
    section(lv, P.loop, right='Z')
    lv.add(P.treasure_room(lv))
    return lv


def floor5():
    lv = Level('c6-pozos-de-espuma', 'Pozos de espuma', w=W, mood='dusk', cam_yaw=-12, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.pit)
    section(lv, P.loop, left='Y', right='Z')
    section(lv, P.pit, wedge=True)
    section(lv, P.bubble_tower)
    section(lv, P.gauntlet, left='Y', right='Y')
    section(lv, P.room)
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor6():
    lv = Level('c6-vias-del-oasis', 'Vías del oasis', w=W, mood='cave', cam_yaw=18)
    lv.add(P.start_room(lv))
    section(lv, P.room, right='Y')
    section(lv, P.rail_puzzle)
    lv.tip('El interruptor de una vía abre la otra', back=-12)
    section(lv, P.loop, left='W')
    section(lv, P.bubble_tower)
    section(lv, P.gauntlet)
    section(lv, P.pit)
    lv.add(P.treasure_room(lv))
    return lv


def floor7():
    lv = Level('c6-saltos-de-espuma', 'Saltos de espuma', w=W, mood='bright', cam_yaw=-20, keep=0.7)
    lv.add(P.start_room(lv))
    section(lv, P.gauntlet)
    section(lv, P.room, left='Y', right='Y')
    section(lv, P.gauntlet, wedge=True)
    section(lv, P.bubble_tower)
    section(lv, P.loop, right='B')
    section(lv, P.gauntlet)
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor8():
    lv = Level('c6-canaveral', 'Cañaveral', w=W, mood='dusk', cam_yaw=14, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.room, left='O', right='W')
    section(lv, P.loop, left='W', right='W')
    section(lv, P.bubble_tower)
    section(lv, P.pit, left='Z', right='Z')
    section(lv, P.gauntlet)
    section(lv, P.loop, left='Y')
    lv.add(P.treasure_room(lv))
    return lv


def floor9():
    lv = Level('c6-laberinto-de-vidrio', 'Laberinto de vidrio', w=W, mood='cave', cam_yaw=-22, keep=0.75)
    lv.add(P.start_room(lv))
    section(lv, P.loop, left='Y', right='B')
    section(lv, P.rail_puzzle)
    section(lv, P.pit, wedge=True)
    section(lv, P.bubble_tower)
    section(lv, P.gauntlet)
    section(lv, P.loop, left='Z')
    lv.add(P.treasure_room(lv, gem=True))
    return lv


def floor10():
    lv = Level('c6-corazon-del-oasis', 'Corazón del oasis', w=W, mood='dungeon', cam_yaw=0, keep=0.7)
    lv.add(P.start_room(lv))
    section(lv, P.room, left='Y', right='Y')
    section(lv, P.loop, left='B', right='Y')
    section(lv, P.rail_puzzle)
    section(lv, P.pit)
    section(lv, P.bubble_tower)
    section(lv, P.gauntlet, wedge=True)
    section(lv, P.loop, left='Z', right='B')
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
    print('capítulo 6 escrito (%d avisos)' % avisos)


if __name__ == '__main__':
    main()
