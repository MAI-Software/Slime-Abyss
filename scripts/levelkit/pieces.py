"""Piezas de piso ya probadas con el autopiloto. Cada una devuelve un Piece con sus filas
en orden de recorrido (la primera es la que pisa antes el limo) y sus marcas de ruta.

Medidas que salen de las tandas anteriores y conviene no tocar a la ligera:
  * los pasos son de 3 casillas; con menos el limo se encalla;
  * las salas de 7 llevan algo dentro (moneda, pico, adorno) o se ven vacías;
  * los trampolines saltan UN hueco y el aterrizaje es de 5 con pinchos en los extremos;
  * la hondonada va en cruz y el carril seguro pegado al muro;
  * el ascensor de raíl pide 3x3 libre y el ventilador de techo va pegado a la repisa.
"""

from . import tiles as T
from .level import Piece


def _row(lv, ch=T.VOID):
    return [ch] * lv.w


def _walls(lv, r, a, b):
    r[a] = T.WALL
    r[b] = T.WALL
    return r


def start_room(lv, coins=True, rows=3):
    """Sala de salida con la P del limo."""
    c, out, marks = lv.c, [], []
    base = _row(lv)
    lv.fill(base, c - 4, c + 4, T.WALL)
    out.append(base)                                  # muro de abajo del todo
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c] = T.START
    out.append(r)
    if coins:
        r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
        r[c - 2] = T.COIN; r[c + 2] = T.COIN
        marks.append({'kind': 'coins', 'row': len(out), 'l': c - 2, 'r': c + 2})
        out.append(r)
    for _ in range(rows - 2):
        r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
        out.append(r)
    return Piece(out, marks)


def neck(lv, door=None, rows=1):
    """Paso estrecho de 3 casillas; `door` pone una puerta ('d' o 'D')."""
    c, out, marks = lv.c, [], []
    for k in range(rows):
        r = _row(lv)
        lv.fill(r, c - 4, c + 4, T.WALL)
        lv.fill(r, c - 1, c + 1, door if (door and k == 0) else lv.floor)
        out.append(r)
    marks.append({'kind': 'pass', 'row': 0, 'col': c})
    return Piece(out, marks)


def room(lv, coins=True, left=None, right=None, wedge=False, rows=4, narrow=True, cliff=False):
    """Sala de 7 con sus dos monedas y, si se piden, adornos pegados a los muros.
    `narrow` cierra los extremos de las filas vacías: menos suelo desangelado.
    `cliff` quita los muros de los lados y deja el vacío: la sala pasa a ser una terraza
    colgada del abismo (más tensión al ir a por las monedas, pero el suelo sigue siendo el
    mismo: el limo solo se cae si lo empujan o si se pasa de largo)."""
    c, out, marks = lv.c, [], []
    for k in range(rows):
        r = _row(lv)
        if not cliff:
            _walls(lv, r, c - 4, c + 4)
        lv.fill(r, c - 3, c + 3, lv.floor)
        if coins and k == 1:
            # las monedas NUNCA en la fila del borde: con la moneda pegada al vacío el limo
            # asoma media bola y pierde los trozos de fuera (se probó: 66 % de limo)
            a, b = c - 2, c + 2
            r[a] = T.COIN; r[b] = T.COIN
            if left:
                r[c - 3] = left                          # la moneda se coge rozando el peligro
            if right:
                r[c + 3] = right
            if left or right:
                marks.append({'kind': 'raw', 'row': len(out), 'steps': ['{ squeeze: true }']})
            marks.append({'kind': 'coins', 'row': len(out), 'l': a, 'r': b})
            if left or right:
                marks.append({'kind': 'raw', 'row': len(out), 'steps': ['{ squeeze: false }']})
        elif k == 2 and wedge:
            r[c - 1] = T.WEDGE['se']; r[c] = T.WEDGE['sw']
        elif k == 3 and (left or right):
            if left:
                r[c - 3] = left
            if right:
                r[c + 3] = right
        elif narrow and not cliff and k not in (0, rows - 1):
            r[c - 3] = T.WALL; r[c + 3] = T.WALL      # alcobas en vez de pista abierta
        out.append(r)
    return Piece(out, marks)


def loop(lv, left=None, right=None):
    """Dos carriles con monedas que se juntan arriba: hay que subir por uno y bajar por el otro."""
    c, out, marks = lv.c, [], []

    def lanes():
        r = _row(lv); _walls(lv, r, c - 4, c + 4); r[c] = T.WALL
        lv.fill(r, c - 3, c - 1, lv.floor); lv.fill(r, c + 1, c + 3, lv.floor)
        return r

    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)                                                   # sala de abajo
    r = lanes(); r[c - 2] = T.COIN; r[c + 2] = T.COIN; out.append(r)
    low = len(out) - 1
    r = lanes()
    if left:
        r[c - 3] = left
    if right:
        r[c + 3] = right
    out.append(r)
    out.append(lanes())
    r = lanes(); r[c - 2] = T.COIN; r[c + 2] = T.COIN; out.append(r)
    high = len(out) - 1
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)                                                   # sala de arriba
    top = len(out) - 1
    marks += [
        {'kind': 'walk', 'row': low, 'col': c - 2, 't': 5},
        {'kind': 'walk', 'row': high, 'col': c - 2, 't': 7},
        {'kind': 'walk', 'row': top, 'col': c - 2, 't': 5},
        {'kind': 'walk', 'row': top, 'col': c + 2, 't': 5},
        {'kind': 'walk', 'row': high, 'col': c + 2, 't': 6},
        {'kind': 'walk', 'row': low, 'col': c + 2, 't': 7},
        {'kind': 'walk', 'row': top, 'col': c, 't': 7},
    ]
    return Piece(out, marks)


def gauntlet(lv):
    """Fila de trampolines, un hueco al vacío y enfrente solo el centro aguanta."""
    c, out, marks = lv.c, [], []
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c - 3] = T.COIN; r[c + 3] = T.COIN
    marks.append({'kind': 'coins', 'row': 0, 'l': c - 3, 'r': c + 3})
    out.append(r)                                            # sala de carrerilla
    r = _row(lv); lv.fill(r, c - 4, c + 4, T.WALL); lv.fill(r, c - 2, c + 2, T.JUMP)
    out.append(r)                                            # los trampolines
    out.append(_row(lv))                                     # el hueco
    r = _row(lv); lv.fill(r, c - 4, c + 4, T.WALL); lv.fill(r, c - 2, c + 2, lv.floor)
    r[c - 2] = T.SPIKE; r[c + 2] = T.SPIKE
    out.append(r)                                            # aterrizaje castigado
    marks.append({'kind': 'jump', 'row': 1, 'land': 3, 'col': c})
    return Piece(out, marks)


def pit(lv):
    """Hondonada en cruz: agujero al vacío en el centro y paso pegado al muro."""
    c, out, marks = lv.c, [], []
    for k in range(3):
        r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
        if k == 0:
            r[c] = T.BOWL; r[c - 3] = T.COIN
        elif k == 1:
            r[c - 1] = T.BOWL; r[c] = T.VOID; r[c + 1] = T.BOWL
        else:
            r[c] = T.BOWL; r[c - 3] = T.COIN
        out.append(r)
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)
    marks.append({'kind': 'pit', 'row': 0, 'top': 2, 'lane': c - 3})
    return Piece(out, marks)


def bubble_tower(lv, rise=4):
    """Jabón abajo, ventilador de techo pegado a la repisa y repisa alta arriba."""
    c, out, marks = lv.c, [], []
    high = str(min(9, int(lv.floor) + rise))
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c - 2] = T.SOAP; r[c + 2] = T.COIN
    marks.append({'kind': 'coin', 'row': 0, 'col': c - 2})
    marks.append({'kind': 'coin', 'row': 0, 'col': c + 2})
    out.append(r)                                                  # jabón y moneda
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)
    r = _row(lv); _walls(lv, r, c - 4, c + 4)
    lv.fill(r, c - 3, c + 1, high); lv.fill(r, c + 2, c + 3, lv.floor)
    out.append(r)                                                  # repisa: una fila de margen por si se pasa
    r = _row(lv); _walls(lv, r, c - 4, c + 4)
    lv.fill(r, c - 3, c + 1, high); lv.fill(r, c + 2, c + 3, lv.floor)
    r[c + 2] = T.FAN_UP
    out.append(r)                                                  # el chorro, pegado a la repisa
    marks.append({'kind': 'tower', 'row': len(out) - 1, 'fan': c + 2, 'ledge': c - 1})
    r = _row(lv); _walls(lv, r, c - 4, c + 4)
    lv.fill(r, c - 3, c + 1, high); lv.fill(r, c + 2, c + 3, lv.floor)
    r[c - 1] = T.COIN
    out.append(r)                                                  # repisa con su premio
    # el premio, una casilla dentro: en el borde de la repisa alta el limo deja trozos abajo
    marks.append({'kind': 'coin', 'row': len(out) - 1, 'col': c - 1})   # sin marca se quedaba sin coger
    r = _row(lv); lv.fill(r, c - 4, c + 4, T.WALL); lv.fill(r, c - 1, c + 1, high)
    out.append(r)
    marks.append({'kind': 'pass', 'row': len(out) - 1, 'col': c})
    lv.floor = high                                                # a partir de aquí se anda arriba
    return Piece(out, marks)


def rail_puzzle(lv):
    """Dos pozos de raíl: el de la derecha lo abre el interruptor del de la izquierda,
    y el de arriba del derecho abre la puerta del pasillo central."""
    c, out, marks = lv.c, [], []
    if lv.w < 13:
        raise ValueError('el puzle de vías pide mapas de 13 o más')

    def frame(r):
        for i in (c - 6, c - 2, c + 2, c + 6):
            r[i] = T.WALL
        return r

    def shafts(ch_left=None, ch_right=None):
        r = frame(_row(lv))
        lv.fill(r, c - 5, c - 3, lv.floor); lv.fill(r, c - 1, c + 1, lv.floor); lv.fill(r, c + 3, c + 5, lv.floor)
        if ch_left:
            r[c - 4] = ch_left
        if ch_right:
            r[c + 4] = ch_right
        return r

    for _ in range(2):
        r = _row(lv); _walls(lv, r, c - 6, c + 6); lv.fill(r, c - 5, c + 5, lv.floor)
        out.append(r)                                               # sala de entrada: de aquí se elige pozo
    entry = len(out) - 1
    r = frame(_row(lv))
    lv.fill(r, c - 5, c - 3, lv.floor); lv.fill(r, c - 1, c + 1, lv.floor); lv.fill(r, c + 3, c + 5, T.DOOR_A)
    out.append(r)                                                   # la puerta A tapa el pozo derecho
    out.append(shafts(T.STATION, T.STATION))                        # estaciones de abajo
    st_low = len(out) - 1
    for _ in range(2):
        r = frame(_row(lv))
        lv.fill(r, c - 5, c - 3, T.WALL); lv.fill(r, c + 3, c + 5, T.WALL)
        lv.fill(r, c - 1, c + 1, lv.floor)
        r[c - 4] = T.RAIL; r[c + 4] = T.RAIL
        out.append(r)                                               # las dos vías suben
    out.append(shafts(T.STATION, T.STATION))                        # estaciones de arriba
    st_high = len(out) - 1
    out.append(shafts())                                            # una fila de margen: hay que alejarse
    mid = len(out) - 1
    r = shafts(T.SWITCH_A, T.SWITCH_B)
    r[c - 3] = T.COIN; r[c + 3] = T.COIN
    out.append(r)                                                   # los dos interruptores
    sw = len(out) - 1
    r = _row(lv); lv.fill(r, c - 6, c + 6, T.WALL); lv.fill(r, c - 1, c + 1, T.DOOR_B)
    out.append(r)                                                   # salida por el pasillo central
    marks += [
        {'kind': 'walk', 'row': entry, 'col': c - 4, 't': 5},
        {'kind': 'station', 'row': st_low, 'col': c - 4},
        {'kind': 'walk', 'row': sw, 'col': c - 3, 't': 5},
        {'kind': 'switch', 'row': sw, 'col': c - 4},
        # el limo baja del raíl marcado 3 s: si vuelve a la estación antes, no se monta
        {'kind': 'raw', 'row': sw, 'steps': ['{ wait: 3 }']},
        {'kind': 'station', 'row': st_high, 'col': c - 4, 't': 5},
        {'kind': 'walk', 'row': entry, 'col': c - 4, 't': 6},
        {'kind': 'walk', 'row': entry, 'col': c + 4, 't': 6},
        {'kind': 'station', 'row': st_low, 'col': c + 4, 't': 7},
        {'kind': 'walk', 'row': sw, 'col': c + 3, 't': 5},
        {'kind': 'switch', 'row': sw, 'col': c + 4},
        {'kind': 'raw', 'row': sw, 'steps': ['{ wait: 3 }']},
        {'kind': 'station', 'row': st_high, 'col': c + 4, 't': 5},
        {'kind': 'walk', 'row': entry, 'col': c + 4, 't': 6},
        {'kind': 'walk', 'row': entry, 'col': c, 't': 6},
        {'kind': 'walk', 'row': len(out) - 1, 'col': c, 't': 8},
    ]
    lv.latch.update({'A': True, 'B': True})
    return Piece(out, marks)


def treasure_room(lv, coins=True, gem=False, relic=False, rows=4):
    """Sala del tesoro. La gema o el coleccionable van en un callejón aparte, nunca de paso."""
    c, out, marks = lv.c, [], []
    r = _row(lv); _walls(lv, r, c - 5, c + 5); lv.fill(r, c - 4, c + 4, lv.floor)
    out.append(r)
    if coins:
        r = _row(lv); _walls(lv, r, c - 5, c + 5); lv.fill(r, c - 4, c + 4, lv.floor)
        r[c - 3] = T.COIN; r[c + 3] = T.COIN
        marks.append({'kind': 'coins', 'row': len(out), 'l': c - 3, 'r': c + 3})
        out.append(r)
    if gem or relic:
        r = _row(lv); _walls(lv, r, c - 5, c + 5); lv.fill(r, c - 4, c + 4, lv.floor)
        lv.fill(r, c - 4, c - 2, T.WALL)
        out.append(r)
        r = _row(lv); _walls(lv, r, c - 5, c + 5); lv.fill(r, c - 4, c + 4, lv.floor)
        r[c - 4] = T.GEM if gem else T.RELIC
        marks.append({'kind': 'coin', 'row': len(out), 'col': c - 4})
        out.append(r)                                    # callejón de tres con el secreto al fondo
    for _ in range(max(0, rows - len(out))):
        r = _row(lv); _walls(lv, r, c - 5, c + 5); lv.fill(r, c - 4, c + 4, lv.floor)
        out.append(r)
    r = _row(lv); _walls(lv, r, c - 5, c + 5); lv.fill(r, c - 4, c + 4, lv.floor)
    r[c + 3] = T.TREASURE
    marks.append({'kind': 'treasure', 'row': len(out), 'col': c + 3})
    out.append(r)
    r = _row(lv); lv.fill(r, c - 5, c + 5, T.WALL)
    out.append(r)
    return Piece(out, marks)


def blizzard(lv, rows=5):
    """Ventisca: pista de hielo con rachas de viento que entran por huecos del muro, una a
    cada lado. No hace daño, pero empuja mientras se resbala, y las monedas están en el lado
    contrario al que empuja cada racha: hay que cruzar apretado y a contraviento."""
    c, out, marks = lv.c, [], []
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)
    for k in range(rows):
        r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
        lv.fill(r, c - 1, c + 1, T.ICE)            # el hielo solo en medio: los hombros agarran
        # dos rachas, una por lado y separadas: con una en cada fila el limo se deshilacha
        if k == 1:
            r[c - 4] = T.FAN['e']                  # la racha va METIDA en el muro
            r[c - 5] = T.WALL                      # y detrás, muro: si no, lo que empuje se cae
            r[c + 3] = T.COIN                      # la moneda, contra el viento
            marks.append({'kind': 'coin', 'row': len(out), 'col': c + 3})
        elif k == rows - 2:
            r[c + 4] = T.FAN['w']
            r[c + 5] = T.WALL
            r[c - 3] = T.COIN
            marks.append({'kind': 'coin', 'row': len(out), 'col': c - 3})
        out.append(r)
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c - 2] = T.COIN; r[c + 2] = T.COIN
    marks.insert(0, {'kind': 'raw', 'row': 0, 'steps': ['{ squeeze: true }']})
    marks.append({'kind': 'walk', 'row': len(out), 'col': c, 't': 8})
    marks.append({'kind': 'coins', 'row': len(out), 'l': c - 2, 'r': c + 2})
    marks.append({'kind': 'raw', 'row': len(out), 'steps': ['{ squeeze: false }']})
    out.append(r)
    return Piece(out, marks)


def switch_gate(lv):
    """Puertas encadenadas a pie: el interruptor del fondo del ramal abre la primera puerta,
    y detrás está el interruptor que abre la segunda. Gasta los dos canales del piso, así que
    no se junta con el puzle de vías."""
    c, out, marks = lv.c, [], []
    lv.latch.update({'A': True, 'B': True})
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)                                              # sala de entrada
    entry = len(out) - 1
    coin_row = None
    for k in range(3):
        r = _row(lv); _walls(lv, r, c - 4, c + 4)
        lv.fill(r, c - 3, c - 1, lv.floor); lv.fill(r, c + 1, c + 3, lv.floor)
        r[c] = T.WALL                                          # dos ramales separados
        if k == 1:
            r[c - 2] = T.COIN; r[c + 2] = T.COIN
            coin_row = len(out)
        out.append(r)
    # los dos ramales NO se comunican: se sube por uno, se baja a la entrada y se sube por el otro
    marks.append({'kind': 'walk', 'row': entry, 'col': c + 2, 't': 5})
    marks.append({'kind': 'coin', 'row': coin_row, 'col': c + 2})
    marks.append({'kind': 'walk', 'row': entry, 'col': c + 2, 't': 6})
    marks.append({'kind': 'walk', 'row': entry, 'col': c - 2, 't': 6})
    marks.append({'kind': 'coin', 'row': coin_row, 'col': c - 2})
    r = _row(lv); _walls(lv, r, c - 4, c + 4)
    lv.fill(r, c - 3, c - 1, lv.floor); lv.fill(r, c + 1, c + 3, T.WALL)
    r[c] = T.WALL; r[c - 2] = T.SWITCH_A
    marks.append({'kind': 'switch', 'row': len(out), 'col': c - 2})
    out.append(r)                                              # el ramal izquierdo muere en A
    r = _row(lv); lv.fill(r, c - 4, c + 4, T.WALL); lv.fill(r, c - 1, c + 1, T.DOOR_A)
    out.append(r)                                              # la puerta que abre A
    marks.append({'kind': 'walk', 'row': len(out) - 1, 'col': c, 't': 8})
    for k in range(2):
        r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
        if k == 1:
            r[c + 2] = T.SWITCH_B; r[c - 2] = T.COIN
            marks.append({'kind': 'coin', 'row': len(out), 'col': c - 2})
            marks.append({'kind': 'switch', 'row': len(out), 'col': c + 2})
        out.append(r)                                          # sala del interruptor B
    r = _row(lv); lv.fill(r, c - 4, c + 4, T.WALL); lv.fill(r, c - 1, c + 1, T.DOOR_B)
    out.append(r)
    marks.append({'kind': 'walk', 'row': len(out) - 1, 'col': c, 't': 8})
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)
    return Piece(out, marks)


def ice_pass(lv, wind=None, spikes=False):
    """Paso de hielo: se resbala, con pinchos a los lados y, si se pide, un ventilador
    metido en el muro que empuja mientras se cruza. Dos mecánicas en la misma casilla."""
    c, out, marks = lv.c, [], []
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)
    for k in range(3):
        # la pista de hielo va en medio, pero con suelo a los lados: sin hombros el limo
        # resbala al vacío y se pierde media bola
        r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
        lv.fill(r, c - 1, c + 1, T.ICE)
        if spikes:
            r[c - 2] = T.SPIKE; r[c + 2] = T.SPIKE
        if wind and k == 1:
            r[c - 4] = T.FAN[wind]        # el ventilador va METIDO en el muro
        out.append(r)
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c - 2] = T.COIN; r[c + 2] = T.COIN
    marks.append({'kind': 'coins', 'row': len(out), 'l': c - 2, 'r': c + 2})
    out.append(r)
    marks.insert(0, {'kind': 'raw', 'row': 0, 'steps': ['{ squeeze: true }']})
    marks.append({'kind': 'pass', 'row': 2, 'col': c})
    marks.append({'kind': 'raw', 'row': len(out) - 1, 'steps': ['{ squeeze: false }']})
    return Piece(out, marks)


def fire_hall(lv, oil=True, plants=True):
    """Sala de fuego: aceite para prenderse, plantas que arden y llamas entre medias."""
    c, out, marks = lv.c, [], []
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    if oil:
        r[c - 2] = T.OIL
    r[c + 2] = T.COIN
    marks.append({'kind': 'coin', 'row': 0, 'col': c + 2})
    out.append(r)
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c - 3] = T.FIRE_T; r[c + 3] = T.FIRE_T   # intermitentes: dejan ventana para pasar
    out.append(r)
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    if plants:
        r[c - 1] = T.PLANT; r[c + 1] = T.PLANT
    out.append(r)
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c - 2] = T.COIN; r[c + 2] = T.COIN
    r[c + 3] = T.FIRE_T
    marks.append({'kind': 'coins', 'row': len(out), 'l': c - 2, 'r': c + 2})
    out.append(r)
    return Piece(out, marks)


def crack_ledge(lv, spikes=False):
    """Repisa de roca agrietada con el vacío a un lado: solo se cruza una vez."""
    c, out, marks = lv.c, [], []
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)
    for k in range(3):
        r = _row(lv); r[c + 4] = T.WALL
        lv.fill(r, c - 1, c + 3, T.CRACK)
        r[c + 3] = T.SPIKE if spikes else lv.floor
        out.append(r)                    # a la izquierda, el vacío
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c - 2] = T.COIN; r[c + 2] = T.COIN
    r[c + 3] = T.CRACK
    marks.append({'kind': 'coins', 'row': len(out), 'l': c - 2, 'r': c + 2})
    out.append(r)
    marks.insert(0, {'kind': 'walk', 'row': 2, 'col': c + 1, 't': 6})
    marks.insert(0, {'kind': 'raw', 'row': 0, 'steps': ['{ squeeze: true }']})
    marks.append({'kind': 'raw', 'row': len(out) - 1, 'steps': ['{ squeeze: false }']})
    return Piece(out, marks)


def void_ledge(lv, side='w', rows=3):
    """Cornisa sin muro a un lado: lo que asoma por el borde se cae. Apretar para cruzar."""
    c, out, marks = lv.c, [], []
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)
    for k in range(rows):
        r = _row(lv)
        if side == 'w':
            r[c + 2] = T.WALL
            lv.fill(r, c - 1, c + 1, lv.floor)     # a la izquierda, el abismo
        else:
            r[c - 2] = T.WALL
            lv.fill(r, c - 1, c + 1, lv.floor)
        if k == 1:
            r[c] = T.COIN
            marks.append({'kind': 'coin', 'row': len(out), 'col': c})
        out.append(r)
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)
    marks.insert(0, {'kind': 'raw', 'row': 0, 'steps': ['{ squeeze: true }']})
    marks.append({'kind': 'raw', 'row': len(out) - 1, 'steps': ['{ squeeze: false }']})
    return Piece(out, marks)


def seesaw_bridge(lv, rows=4):
    """Pasillo de tablas sobre el vacío: se inclinan con el peso, hay que cruzar sin pararse.
    Lleva muro a los lados (sin él, el limo resbala de canto y se pierde)."""
    c, out, marks = lv.c, [], []
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)
    r = _row(lv); lv.fill(r, c - 2, c + 2, T.WALL); lv.fill(r, c - 1, c + 1, lv.floor)
    out.append(r)
    for _ in range(rows):
        r = _row(lv)
        r[c - 2] = T.WALL; r[c + 2] = T.WALL
        lv.fill(r, c - 1, c + 1, T.SEESAW_Z)
        out.append(r)
    r = _row(lv); lv.fill(r, c - 2, c + 2, T.WALL); lv.fill(r, c - 1, c + 1, lv.floor)
    out.append(r)
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c - 2] = T.COIN; r[c + 2] = T.COIN
    marks.append({'kind': 'raw', 'row': 0, 'steps': ['{ squeeze: true }']})
    marks.append({'kind': 'walk', 'row': len(out) - 1, 'col': c, 't': 8})
    marks.append({'kind': 'raw', 'row': len(out), 'steps': ['{ squeeze: false }']})
    marks.append({'kind': 'coins', 'row': len(out), 'l': c - 2, 'r': c + 2})
    out.append(r)
    return Piece(out, marks)


def spinner_room(lv):
    """Plataforma giratoria en medio de la sala: marea y descoloca, con monedas alrededor."""
    c, out, marks = lv.c, [], []
    for k in range(5):
        r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
        if k == 2:
            r[c] = T.SPINNER
        if k == 1:
            r[c - 3] = T.COIN
            marks.append({'kind': 'coin', 'row': len(out), 'col': c - 3})
        if k == 3:
            r[c + 3] = T.COIN
            marks.append({'kind': 'coin', 'row': len(out), 'col': c + 3})
        out.append(r)
    marks.append({'kind': 'walk', 'row': len(out) - 1, 'col': c, 't': 6})
    return Piece(out, marks)


def cold_spikes(lv, rows=3):
    """Chorro de aire frío y, justo después, un pasillo de pinchos: congelado el limo es
    duro y no se pincha, así que hay que congelarse ANTES de cruzar."""
    c, out, marks = lv.c, [], []
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c] = T.COLD
    marks.append({'kind': 'cold', 'row': 0, 'col': c})
    out.append(r)                                        # el chorro frío
    for _ in range(rows):
        r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
        lv.fill(r, c - 1, c + 1, T.SPIKE)
        out.append(r)                                    # la alfombra de pinchos
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c - 2] = T.COIN; r[c + 2] = T.COIN
    marks.append({'kind': 'walk', 'row': len(out), 'col': c, 't': 7})
    marks.append({'kind': 'coins', 'row': len(out), 'l': c - 2, 'r': c + 2})
    marks.append({'kind': 'raw', 'row': len(out), 'steps': ['{ squeeze: false }']})
    out.append(r)
    return Piece(out, marks)


def cannon_hall(lv, gap=3):
    """Cañón sobre el vacío: el chorro frío está al lado, porque congelado se vuela de una
    pieza y se cae justo en la diana. La sala de aterrizaje va cerrada."""
    c, out, marks = lv.c, [], []
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c - 2] = T.COLD; r[c + 2] = T.COIN
    marks.append({'kind': 'cold', 'row': 0, 'col': c - 2})
    marks.append({'kind': 'coin', 'row': 0, 'col': c + 2})
    out.append(r)
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c] = T.CANNON
    marks.append({'kind': 'cannon', 'row': len(out), 'col': c})
    out.append(r)                                        # el cañón
    for _ in range(gap):
        out.append(_row(lv))                             # el vacío que se cruza volando
    r = _row(lv); lv.fill(r, c - 4, c + 4, T.WALL); lv.fill(r, c - 2, c + 2, lv.floor)
    r[c] = T.TARGET
    out.append(r)                                        # la diana, en sala cerrada
    r = _row(lv); lv.fill(r, c - 4, c + 4, T.WALL); lv.fill(r, c - 2, c + 2, lv.floor)
    r[c - 2] = T.COIN; r[c + 2] = T.COIN
    marks.append({'kind': 'coins', 'row': len(out), 'l': c - 2, 'r': c + 2})
    out.append(r)
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)
    return Piece(out, marks)


def ice_slalom(lv, rows=4):
    """Rampa de hielo con picos alternos: se resbala y hay que ir esquivando."""
    c, out, marks = lv.c, [], []
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    out.append(r)
    for k in range(rows):
        r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, T.ICE)
        if k % 2 == 0:
            r[c - 3] = T.WEDGE['se']
        else:
            r[c + 3] = T.WEDGE['sw']
        out.append(r)
    r = _row(lv); _walls(lv, r, c - 4, c + 4); lv.fill(r, c - 3, c + 3, lv.floor)
    r[c - 2] = T.COIN; r[c + 2] = T.COIN
    marks.append({'kind': 'raw', 'row': 0, 'steps': ['{ squeeze: true }']})
    marks.append({'kind': 'walk', 'row': len(out), 'col': c, 't': 7})
    marks.append({'kind': 'coins', 'row': len(out), 'l': c - 2, 'r': c + 2})
    marks.append({'kind': 'raw', 'row': len(out), 'steps': ['{ squeeze: false }']})
    out.append(r)
    return Piece(out, marks)
