"""Recolección inicial de fuentes RSS. Las notas sin primaria quedan pendientes de revisión."""
import argparse
import json
import os
import ipaddress
import socket
import ssl
import http.client
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import quote, urlsplit, urljoin, urlunsplit
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
    return [x[4][0] for x in addresses]


def conexion_publica(host, port, ip, https, timeout):
    # La conexión usa la IP validada, sin volver a resolver el dominio.
    if https:
        class Segura(http.client.HTTPSConnection):
            def connect(self):
                raw=socket.create_connection((ip,port),timeout)
                try: self.sock=self._context.wrap_socket(raw,server_hostname=host)
                except Exception: raw.close(); raise
        return Segura(host,port,timeout=timeout,context=ssl.create_default_context())
    class Publica(http.client.HTTPConnection):
        def connect(self): self.sock=socket.create_connection((ip,port),timeout)
    return Publica(host,port,timeout=timeout)


def obtener_publico(url, limite=2_000_000, timeout=15, resolver=socket.getaddrinfo, fabrica=conexion_publica):
    for _ in range(6):
        ips=validar_destino(url,resolver);parts=urlsplit(url);port=parts.port or (443 if parts.scheme=='https' else 80)
        connection=fabrica(parts.hostname,port,ips[0],parts.scheme=='https',timeout)
        try:
            path=urlunsplit(('', '', parts.path or '/', parts.query, ''))
            connection.request('GET',path,headers={**HEADERS,'Range':f'bytes=0-{max(0,limite-1)}'})
            response=connection.getresponse()
            if response.status in (301,302,303,307,308):
                location=response.getheader('Location')
                if not location: raise ValueError('Redirección sin destino')
                url=urljoin(url,location);continue
            if response.status>=400: raise HTTPError(url,response.status,response.reason,None,None)
            return response.read(limite),url
        finally: connection.close()
    raise ValueError('Demasiadas redirecciones')


def leer(url): return obtener_publico(url)

def disponible(url):
    try: obtener_publico(url,limite=1,timeout=10);return True
    except (HTTPError,URLError,ValueError,TimeoutError,OSError,http.client.HTTPException): return False

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
