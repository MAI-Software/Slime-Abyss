"""Casillas del juego tal y como las entiende el creador de niveles (espejo de src/level/format.ts).

En el ASCII un DÍGITO es la altura del suelo (dígito x 0.5) y el resto son casillas con
significado. El mapa `map:` es la planta BAJA y las `stories` van hacia arriba.
"""

# suelo y muros
FLOOR_DIGITS = '0123456789'
WALL = '#'
VOID = '.'

# metas
START = 'P'
TREASURE = 'T'
COIN = 'C'
GEM = 'G'
RELIC = 'L'

# peligros y obstáculos
FIRE = 'F'
FIRE_T = 'X'
SPIKE = 'Y'
PLANT = 'W'
ICE_BLOCK = 'Z'
OIL = 'O'
SOAP = 'b'
CRACK = 'B'
ICE = 'I'
BOWL = 'a'

# mecanismos
JUMP = 'J'
SWITCH_A, SWITCH_B = 'S', 's'
DOOR_A, DOOR_B = 'D', 'd'
SPINNER = 'E'
COLD = 'Q'
CANNON, TARGET = 'N', 'x'
FAN = {'n': '^', 's': 'v', 'e': '>', 'w': '<'}
FAN_UP = 'A'

# raíles
STATION = 'R'
RAIL = '='
RAIL_LOOP = '@'
RAIL_SPIRAL = '%'

# agujeros y rampas
HOLE = 'H'
HOLE_EXIT = 'U'
RAMP = {'n': 'n', 's': 'u', 'e': 'e', 'w': 'o'}
SLAB = {'nw': 'q', 'ne': 'p', 'sw': 'z', 'se': 'm'}
WEDGE = {'nw': 'g', 'ne': 'h', 'se': 'i', 'sw': 'j'}
SEESAW_X, SEESAW_Z = '-', '|'

#: casillas por las que el limo NO pasa
BLOCKING = set(WALL + VOID + RAIL + RAIL_LOOP + RAIL_SPIRAL)
#: casillas que hacen daño o se llevan limo
HAZARDS = set(FIRE + FIRE_T + SPIKE + VOID)
#: lo que el limo se lleva al pasar por encima
PICKUPS = set(COIN + GEM + RELIC + OIL + SOAP)

#: ancho mínimo de un paso para que el limo quepa sin encallarse
MIN_CORRIDOR = 3
#: hueco que pide un ascensor de raíl a su alrededor (3x3 con la estación en el centro)
LIFT_CLEARANCE = 1
#: lo que sube una rampa o un escalón que el limo puede subir solo
STEP = 1          # en dígitos de altura (0.5 de mundo)
