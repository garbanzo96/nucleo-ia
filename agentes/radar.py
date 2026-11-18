"""Recolección inicial de fuentes RSS. Las notas sin primaria quedan pendientes de revisión."""
import argparse
import json
import os
import ipaddress
import socket
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import quote, urlsplit
from xml.etree import ElementTree
from nucleo import deduplicar, resolver_primaria

HEADERS = {'User-Agent': 'NucleoIA-Radar/1.0 (investigacion editorial)'}

def validar_destino(url, resolver=socket.getaddrinfo):
    parts = urlsplit(url)
    if parts.scheme not in ('http', 'https') or not parts.hostname or parts.username or parts.password:
        raise ValueError('Destino de red inválido')
    if parts.port not in (None, 80, 443): raise ValueError('Puerto no permitido')
    try: addresses = resolver(parts.hostname, parts.port or (443 if parts.scheme == 'https' else 80), type=socket.SOCK_STREAM)
    except OSError as exc: raise ValueError('No se pudo resolver el dominio') from exc
    if not addresses or any(not ipaddress.ip_address(x[4][0]).is_global for x in addresses):
        raise ValueError('Destino de red no público')

class RedireccionPublica(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validar_destino(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def abrir_seguro(request, timeout):
    validar_destino(request.full_url)
    return build_opener(RedireccionPublica()).open(request, timeout=timeout)

def leer(url):
    request = Request(url, headers=HEADERS)
    with abrir_seguro(request, timeout=15) as response:
        return response.read(2_000_000), response.geturl()

def disponible(url):
    try:
        request = Request(url, method='GET', headers={**HEADERS, 'Range': 'bytes=0-0'})
        with abrir_seguro(request, timeout=10) as response: return response.status < 400
    except (HTTPError, URLError, ValueError, TimeoutError): return False

def recolectar(feed):
    contenido, _ = leer(feed)
    root = ElementTree.fromstring(contenido)
    items = []
    for item in root.findall('.//item')[:8]:
        link = (item.findtext('link') or '').strip()
        title = (item.findtext('title') or '').strip()
        if link.startswith(('https://', 'http://')) and title:
            items.append({'titulo': title, 'url': link, 'resumen': (item.findtext('description') or '')[:1000], 'fecha': item.findtext('pubDate') or ''})
    ns = '{http://www.w3.org/2005/Atom}'
    for item in root.findall('.//' + ns + 'entry')[:8]:
        link = item.find(ns + 'link')
        href = link.get('href', '') if link is not None else ''
        if href.startswith(('https://', 'http://')):
            items.append({'titulo': (item.findtext(ns + 'title') or '').strip(), 'url': href, 'resumen': (item.findtext(ns + 'summary') or '')[:1000], 'fecha': item.findtext(ns+'published') or item.findtext(ns+'updated') or ''})
    return items

def ejemplo():
    items = [{'titulo': 'Ejemplo: estudio sobre sistemas de IA', 'url': 'https://example.org/noticia?utm_source=ejemplo', 'resumen': 'Dato de prueba, no es un hallazgo real.'}, {'titulo':'Duplicado de prueba', 'url':'https://example.org/noticia'}]
    return deduplicar(items)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ejemplo', action='store_true')
    parser.add_argument('--limite', type=int, default=0, help='Máximo de fuentes; cero usa todas')
    args = parser.parse_args()
    if args.ejemplo:
        print(json.dumps(ejemplo(), ensure_ascii=False, indent=2)); return
    fuentes = json.loads(Path(__file__).with_name('fuentes.json').read_text())
    if args.limite: fuentes = fuentes[:args.limite]
    items = []
    for fuente in fuentes:
        feed = fuente.get('feed')
        if not feed:
            from urllib.parse import urlsplit
            domain = urlsplit(fuente['url']).hostname
            if not domain: continue
            feed = 'https://news.google.com/rss/search?q=' + quote('site:' + domain + ' inteligencia artificial OR artificial intelligence') + '&hl=es-419&gl=CL&ceid=CL:es-419'
        try:
            for item in recolectar(feed):
                item['fuente_id'] = fuente['id']
                items.append(item)
        except (HTTPError, URLError, ValueError, TimeoutError, ElementTree.ParseError) as exc:
            print('No se pudo leer la fuente:', fuente['nombre'], type(exc).__name__, file=__import__('sys').stderr)
    for item in deduplicar(items):
        try:
            raw, final = leer(item['url'])
            item['fuente_primaria'] = resolver_primaria(final, raw.decode('utf-8', 'replace'), disponible)
        except (HTTPError, URLError, ValueError, TimeoutError): item['fuente_primaria'] = None
        print(json.dumps(item, ensure_ascii=False))

if __name__ == '__main__': main()
