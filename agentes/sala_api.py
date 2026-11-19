"""Conexión del radar con la sala sin secretos: GitHub Actions entrega un token OIDC firmado
que la función radar_api verifica. Fuera de Actions (pruebas locales) no está activa."""
import json
import os
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

_token = {'valor': None, 'hasta': 0}


def activa():
    return bool(os.environ.get('SALA_API') and os.environ.get('ACTIONS_ID_TOKEN_REQUEST_URL'))


def _oidc():
    # Los tokens de GitHub duran pocos minutos; se renuevan antes de vencer.
    if _token['valor'] and time.time() < _token['hasta']:
        return _token['valor']
    req = Request(os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'] + '&audience=nucleo-sala',
                  headers={'Authorization': 'bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    with urlopen(req, timeout=20) as r:
        _token['valor'] = json.load(r)['value']
    _token['hasta'] = time.time() + 240
    return _token['valor']


def llamar(cuerpo, timeout=150):
    req = Request(os.environ['SALA_API'], data=json.dumps(cuerpo, ensure_ascii=False).encode(), method='POST',
                  headers={'Content-Type': 'application/json', 'x-github-oidc': _oidc()})
    try:
        with urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except HTTPError as e:
        destino = str(cuerpo.get('path') or cuerpo.get('op') or '').split('?')[0]
        try:
            detalle = e.read(600).decode('utf-8', 'replace')  # mensaje de PostgREST o de la sala, sin datos
        except OSError:
            detalle = ''
        raise RuntimeError(f'La sala rechazó {cuerpo.get("method") or ""} {destino} (HTTP {e.code}) {detalle}') from None


class SalaApi:
    """Misma interfaz que ejecutar.Supabase, pero a través de radar_api."""
    def request(self, method, path, body=None, prefer=None):
        return llamar({'method': method, 'path': path, 'body': body, 'prefer': prefer})

    def rows(self, table, select='*'):
        from urllib.parse import urlencode
        result = []; offset = 0
        while True:
            batch = self.request('GET', f'{table}?' + urlencode({'select': select, 'limit': 1000, 'offset': offset})) or []
            result.extend(batch)
            if len(batch) < 1000: return result
            offset += len(batch)

    def insert(self, table, rows, ignore=False):
        if rows: self.request('POST', table, rows, 'resolution=ignore-duplicates,return=minimal' if ignore else 'return=minimal')

    def update(self, table, row_id, values):
        self.request('PATCH', table + '?id=eq.' + str(row_id), values, 'return=minimal')
