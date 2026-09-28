"""Kit de creación de niveles de Slime Abyss.

Se monta un piso encadenando piezas en el orden en que las pisa el limo y el kit devuelve
el ASCII para author-levels.mjs y la ruta del autopiloto. Las reglas de diseño están en
docs/level-design.md; las piezas, en pieces.py.

    from levelkit import Level, pieces as P, check, writer

    lv = Level('c6-ejemplo', 'Ejemplo', w=15, mood='dusk', cam_yaw=-10)
    lv.add(P.start_room(lv)).add(P.loop(lv, left='B')).add(P.neck(lv))
    lv.add(P.gauntlet(lv)).add(P.treasure_room(lv, gem=True))
    rows, steps, tips = lv.build()
    print('\\n'.join(check.check(rows, steps, lv.id)) or 'sin avisos')
"""

from .level import Level, Piece   # noqa: F401
from . import pieces, check, writer, tiles   # noqa: F401
