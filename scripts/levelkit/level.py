"""Constructor de pisos: se encadenan piezas en el orden en que las pisa el limo
(de la salida al tesoro) y al final salen las dos cosas que hacen falta:

  * el bloque ASCII para scripts/author-levels.mjs
  * los pasos de ruta para el autopiloto (src/dev-routes.ts)

Convenios que hay que tener presentes siempre:
  * en el ASCII la fila 0 es la de ARRIBA (donde está el tesoro) y la última la de abajo
    (donde sale el limo), así que las piezas se guardan en orden de recorrido y se dan la
    vuelta al emitir;
  * los dígitos son alturas, no suelo genérico: una pieza que quiera suelo usa `floor`;
  * el limo no busca camino solo: cada pieza deja sus marcas y de ahí salen los puntos de ruta.
"""

from dataclasses import dataclass, field

from . import tiles as T


@dataclass
class Piece:
    """Un trozo de piso: sus filas (en orden de recorrido, de abajo arriba) y sus marcas."""
    rows: list           # filas de abajo (la primera que pisa el limo) hacia arriba
    marks: list = field(default_factory=list)   # {'kind': ..., 'row': índice dentro de la pieza, ...}


class Level:
    """Piso en construcción. Las piezas se añaden en orden de recorrido."""

    def __init__(self, lid, name, w=15, floor='0', mood='dusk', cam_yaw=0, count=80, keep=0.8,
                 latch=None, story=0, need=None):
        self.id = lid
        self.name = name
        self.w = w
        self.floor = floor
        self.mood = mood
        self.cam_yaw = cam_yaw
        self.count = count
        self.keep = keep
        self.latch = latch or {}
        self.need = need or {}            # limitos que tiene que haber encima del interruptor
        self.c = w // 2                      # columna por la que corre el camino
        self.rows = []                       # planta baja, de abajo (salida) hacia arriba (tesoro)
        self.up = []                         # planta alta: misma longitud, vacío donde no hay nada
        self.story = 0                       # planta en la que se está construyendo
        self.marks = []                      # marcas absolutas: {'kind', 'row', ...}
        self.tips = []

    # ------------------------------------------------------------------ utilidades
    def blank(self):
        return [T.VOID] * self.w

    def fill(self, r, a, b, ch):
        for i in range(max(0, a), min(self.w - 1, b) + 1):
            r[i] = ch
        return r

    def add(self, piece: Piece):
        base = len(self.rows)
        void = T.VOID * self.w
        for r in piece.rows:
            line = ''.join(r) if isinstance(r, list) else r
            # las dos plantas van siempre a la par: lo que se construye arriba deja vacío abajo
            self.rows.append(void if self.story else line)
            self.up.append(line if self.story else void)
        for m in piece.marks:
            m = dict(m)
            # todas las filas de una marca son relativas a la pieza: hay que correrlas
            for key in ('row', 'land', 'top', 'pads'):
                if key in m:
                    m[key] = base + m[key]
            self.marks.append(m)
        return self

    def lift(self, col=None, rows=1):
        """Ascensor de raíl: una estación sin vía al lado con su gemela JUSTO ENCIMA en la otra
        planta. La vagoneta sube en espiral entre las dos y a partir de aquí se construye arriba.
        La estación necesita su hueco de 3x3, así que la fila va despejada a los lados."""
        c = self.c if col is None else col
        void = T.VOID * self.w
        for _ in range(rows):                       # sitio para acercarse parado a la estación
            r = [T.WALL] * self.w
            self.fill(r, c - 3, c + 3, self.floor)
            r[c - 4] = r[c + 4] = T.WALL
            self.rows.append(''.join(r)); self.up.append(void)
        # el rellano mide lo mismo que una sala (7 de ancho): si es más estrecho que la sala de
        # al lado, al pasar de uno a otra el limo asoma medio cuerpo sobre el vacío y lo pierde
        r = [T.VOID] * self.w
        self.fill(r, c - 3, c + 3, self.floor)
        r[c - 4] = r[c + 4] = T.WALL
        r[c] = T.STATION
        self.rows.append(''.join(r))                # la estación de abajo
        u = [T.VOID] * self.w
        self.fill(u, c - 3, c + 3, self.floor)
        u[c] = T.STATION
        self.up.append(''.join(u))                  # y la de arriba, en la misma casilla
        for _ in range(2):
            # abajo, un cuarto cerrado alrededor del ascensor: al rezagado lo tira la cohesión
            # hacia el limo de arriba, y sin muros se cae al vacío
            d = [T.VOID] * self.w
            self.fill(d, c - 3, c + 3, self.floor)
            d[c - 4] = d[c + 4] = T.WALL
            self.rows.append(''.join(d))
            u = [T.VOID] * self.w
            self.fill(u, c - 3, c + 3, self.floor)
            self.up.append(''.join(u))              # y arriba, el rellano del ascensor
        # y se tapia el cuarto por arriba: si se deja abierto, a los rezagados los arrastra la
        # cohesión hacia el limo de la planta alta y se tiran por el borde
        self.rows.append(T.WALL * self.w)
        u = [T.VOID] * self.w
        self.fill(u, c - 3, c + 3, self.floor)
        self.up.append(''.join(u))
        # al ascensor se llega HECHO UNA BOLA: la vagoneta se lleva el grupo que haya en ese
        # momento y los rezagados se quedan abajo, en una planta que ya no lleva a ningún sitio.
        # Después se espera de sobra: los que se queden montan solos en el siguiente viaje.
        row = len(self.rows) - 4                    # la fila de las dos estaciones
        self.marks.append({'kind': 'walk', 'row': row - 1, 'col': c, 't': 6})
        self.marks.append({'kind': 'raw', 'row': row - 1, 'steps': ['{ squeeze: true }', '{ wait: 3 }']})
        self.marks.append({'kind': 'station', 'row': row, 'col': c, 't': 7, 'wait': 20})
        self.story = 1
        return self

    def tip(self, text, back=2):
        """Pista flotante: se coloca `back` filas por encima de lo último añadido."""
        self.tips.append({'row': len(self.rows) + back, 'text': text})
        return self

    # ------------------------------------------------------------------ salida
    def build(self):
        """Devuelve (bloque ASCII, pasos de ruta)."""
        n = len(self.rows)
        top_rows = list(reversed(self.rows))                 # la fila 0 del mapa es la de arriba
        def z(row):                                          # fila de recorrido -> fila del mapa
            return n - 1 - row
        steps = []
        # las marcas ya vienen en orden de recorrido: ordenarlas por fila rompe los rodeos
        for m in self.marks:
            steps += route_steps(self, m, z)
        tips = [{'z': z(t['row']), 'text': t['text']} for t in self.tips]
        self.top_up = list(reversed(self.up)) if any(set(r) - {T.VOID} for r in self.up) else None
        return top_rows, steps, tips


def route_steps(lv, m, z):
    """Pasos del autopiloto para una marca. Reglas que ya nos han costado caras:
       * a una estación se llega PARADO y apretado, o el limo no se hace bola entera;
       * los trampolines se cruzan sin pararse encima;
       * al interruptor se va DESPUÉS de las monedas de su sala (el limo llega desde abajo).
    """
    k = m['kind']
    x = lambda col: col + 0.5
    if k == 'coins':
        # con radio 0.4 y sin tiempo el bot pasa de largo si el paso siguiente tira de él
        return ['{ to: [%s, %s], radius: 0.35, t: 5 }' % (x(m['l']), z(m['row']) + 0.5),
                '{ to: [%s, %s], radius: 0.35, t: 5 }' % (x(m['r']), z(m['row']) + 0.5)]
    if k == 'coin':
        return ['{ to: [%s, %s], radius: 0.35, t: 5 }' % (x(m['col']), z(m['row']) + 0.5)]
    if k == 'pass':
        return ['{ to: [%s, %s], radius: 0.4, t: 6 }' % (x(m.get('col', lv.c)), z(m['row']) + 0.5)]
    if k == 'switch':
        return ['{ to: [%s, %s], radius: 0.3, t: 5 }' % (x(m['col']), z(m['row']) + 0.5),
                '{ wait: 1.5 }']
    if k == 'jump':
        c = x(m.get('col', lv.c))
        # el trampolin lanza muy alto: sin esta espera los pasos siguientes se dan en el aire
        return ['{ to: [%s, %s], radius: 0.4, t: 5 }' % (c, z(m['row']) + 1.6),
                '{ squeeze: true, to: [%s, %s], radius: 0.4, t: 7 }' % (c, z(m['land']) + 0.5),
                '{ settle: 16 }',   # congelado cae flotando: el vuelo del trampolin dura mas de 10 s
                '{ to: [%s, %s], radius: 0.4, t: 4 }' % (c, z(m['land']) + 0.5),
                '{ squeeze: false }']
    if k == 'pit':
        lane = x(m['lane'])
        return ['{ squeeze: true, to: [%s, %s], radius: 0.4, t: 6 }' % (lane, z(m['row']) + 0.5),
                '{ to: [%s, %s], radius: 0.4, t: 7 }' % (lane, z(m['top']) + 0.5),
                '{ squeeze: false, to: [%s, %s], radius: 0.4, t: 6 }' % (x(lv.c), z(m['top']) - 0.4)]
    if k == 'tower':
        return ['{ squeeze: true, to: [%s, %s], radius: 0.25, t: 5 }' % (x(m['fan']), z(m['row']) + 0.5),
                '{ wait: 1.6 }',
                '{ to: [%s, %s], radius: 0.5, t: 4 }' % (x(m['ledge']), z(m['row']) + 0.5),
                '{ squeeze: false, to: [%s, %s], radius: 0.4, t: 5 }' % (x(m['ledge']), z(m['row']) - 0.5)]
    if k == 'station':
        # board suelta el mando en cuanto monta: con `to` el empuje lo devolvia en el viaje de vuelta
        return ['{ squeeze: true, board: [%s, %s], t: %d }' % (x(m['col']), z(m['row']) + 0.5, m.get('t', 6)),
                '{ wait: %s }' % m.get('wait', 6)]
    if k == 'plate':
        # la placa cuenta los limitos APOYADOS: hecho bola solo tocan los de abajo (8 de 80) y
        # esparramado toca 30. Así que aquí se suelta el apretón y se espera a que se extienda
        x0, z0 = x(m['col']), z(m['row']) + 0.5
        return ['{ squeeze: false, to: [%s, %s], radius: 0.4, t: 6 }' % (x0, z0),
                '{ to: [%s, %s], radius: 0.25, t: 4 }' % (x0, z0),
                '{ wait: 4.5 }']
    if k == 'walk':
        return ['{ squeeze: false, to: [%s, %s], radius: 0.4, t: %d }' % (x(m['col']), z(m['row']) + 0.5, m.get('t', 6))]
    if k == 'treasure':
        return ['{ to: [%s, %s], t: 8 }' % (x(m['col']), z(m['row']) + 0.5)]
    if k == 'cannon':
        return ['{ to: [%s, %s], radius: 0.4, t: 6 }' % (x(m['col']), z(m['row']) + 1.4),
                '{ cannon: [%s, %s] }' % (x(m['col']), z(m['row']) + 0.5),
                '{ squeeze: true, wait: 2 }', '{ squeeze: false }']
    if k == 'cold':
        return ['{ squeeze: true, to: [%s, %s], radius: 0.3, t: 5 }' % (x(m['col']), z(m['row']) + 0.5),
                '{ wait: 1.2 }']
    if k == 'raw':
        return list(m['steps'])
    return []
