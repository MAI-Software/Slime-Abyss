"""Junta las dos mitades de la revisión en una sola tabla:

  * lo que mide score.py sin jugar (filas, largo, variedad, combos, peligro, trampas, puzles, nota)
  * lo que saca el autopiloto al jugarlo (segundos, limo que conserva, monedas, si llega al cofre)

El autopiloto escribe sus líneas en auto-run.log según van saliendo (lo hace el servidor de
desarrollo, ver vite.config.ts), así que basta con tener esa tanda hecha.

  python -m scripts.levelkit.report            tabla piso a piso
  python -m scripts.levelkit.report --capitulos   solo el resumen por capítulo
"""

import io
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
LOG = os.path.join(ROOT, 'auto-run.log')

from scripts.levelkit import score as S   # noqa: E402


def medidas():
    """Lo que dice score.py de cada piso."""
    text = io.open(S.ROUTES, encoding='utf8').read()
    out = {}
    for ch, L in S.levels():
        m = S.measure(ch, L, S.route_of(text, L['id']))
        m['cap'] = ch
        m['nota'] = S.score(m)
        m['avisos'] = ', '.join(S.tags(ch, m, m['nota']))
        out[L['id']] = m
    return out


def partidas():
    """Lo que sacó el autopiloto: segundos, limo, monedas y si llegó al cofre."""
    out = {}
    if not os.path.exists(LOG):
        return out
    for ln in io.open(LOG, encoding='utf8', errors='replace'):
        m = re.match(r'^(OK |MAL) c\d+f\d+ (\S+): (tesoro|SIN TESORO) · (\d+) s · limo (\d+)% · monedas (\d+)/(\d+)', ln)
        if m:
            out[m.group(2)] = dict(ok=m.group(1) == 'OK ', tesoro=m.group(3) == 'tesoro',
                                   seg=int(m.group(4)), limo=int(m.group(5)),
                                   cogidas=int(m.group(6)), total=int(m.group(7)))
    return out


def main():
    med, jug = medidas(), partidas()
    solo_caps = '--capitulos' in sys.argv
    por_cap = defaultdict(list)
    if not solo_caps:
        print('%-28s %5s %5s %4s %4s %5s %4s %4s %5s %4s %5s %5s %6s  %s' %
              ('piso', 'filas', 'largo', 'var', 'com', 'peli', 'tram', 'puz', 'mon', 'nota',
               'seg', 'limo', 'cofre', 'avisos'))
    for lid, m in med.items():
        p = jug.get(lid)
        por_cap[m['cap']].append((m, p))
        if solo_caps:
            continue
        print('%-28s %5d %5d %4d %4d %5.2f %4d %4d %5d %4d %5s %5s %6s  %s' %
              (lid, m['filas'], m['largo'], m['variedad'], m['combos'], m['peligro'],
               m['trampas'], m['puzles'], m['monedas'], m['nota'],
               p['seg'] if p else '-', ('%d%%' % p['limo']) if p else '-',
               ('sí' if p['tesoro'] else 'NO') if p else '-', m['avisos']))
    print()
    print('%-4s %5s %5s %5s %5s %5s %5s %5s %6s %6s' %
          ('cap', 'filas', 'largo', 'tram', 'puz', 'mon', 'nota', 'seg', 'limo', 'pasan'))
    for cap in sorted(por_cap):
        fs = por_cap[cap]
        n = len(fs)
        med_de = lambda k: sum(f[0][k] for f in fs) / n
        jugados = [f[1] for f in fs if f[1]]
        print('%-4d %5.0f %5.0f %5.1f %5.1f %5.1f %5.1f %5s %6s %6s' %
              (cap, med_de('filas'), med_de('largo'), med_de('trampas'), med_de('puzles'),
               med_de('monedas'), med_de('nota'),
               '%d' % (sum(j['seg'] for j in jugados) / len(jugados)) if jugados else '-',
               '%d%%' % (sum(j['limo'] for j in jugados) / len(jugados)) if jugados else '-',
               '%d/%d' % (sum(1 for j in jugados if j['ok']), n) if jugados else '-'))
    malos = [(lid, jug[lid]) for lid in med if lid in jug and not jug[lid]['ok']]
    if malos:
        print()
        for lid, p in malos:
            print('NO PASA %-26s %d s · limo %d%% · monedas %d/%d%s' %
                  (lid, p['seg'], p['limo'], p['cogidas'], p['total'], '' if p['tesoro'] else ' · SIN COFRE'))


if __name__ == '__main__':
    main()
