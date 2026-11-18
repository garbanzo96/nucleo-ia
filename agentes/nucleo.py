"""Reglas compartidas de los radares y la sala."""
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
import json
import re
from pathlib import Path

# La lista blanca vive junto a las funciones Edge para que sala y radares usen la misma.
PRIMARY_DOMAINS = set(json.loads((Path(__file__).resolve().parents[1] / 'sala/supabase/functions/_shared/primarias.json').read_text()))

def canonical_url(url):
    parts = urlsplit(url.strip())
    if parts.scheme not in ('http', 'https') or not parts.hostname: raise ValueError('URL inválida')
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not k.lower().startswith('utm_') and k.lower() not in ('fbclid', 'gclid')]
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip('/') or '/', urlencode(sorted(query)), ''))

def es_primaria(url):
    host = (urlsplit(url).hostname or '').lower()
    return any(host == domain or host.endswith('.' + domain) for domain in PRIMARY_DOMAINS)

class Enlaces(HTMLParser):
    def __init__(self): super().__init__(); self.hrefs = []
    def handle_starttag(self, tag, attrs):
        if tag == 'a' and dict(attrs).get('href'): self.hrefs.append(dict(attrs)['href'])

def resolver_primaria(url, html, verificar):
    if es_primaria(url) and verificar(url): return canonical_url(url)
    enlaces = Enlaces(); enlaces.feed(html)
    for href in enlaces.hrefs:
        posible = urljoin(url, href)
        if es_primaria(posible) and verificar(posible): return canonical_url(posible)
    return None

def deduplicar(items, vistas=()):
    seen = {canonical_url(url) for url in vistas}; resultado = []
    for item in items:
        url = canonical_url(item['url'])
        if url not in seen: resultado.append({**item, 'url': url}); seen.add(url)
    return resultado

def validar_rotacion(formato, gancho, recientes, n):
    for post in recientes[:n]:
        if formato == post.get('formato') or gancho == post.get('tipo_gancho'): raise ValueError('Formato o gancho repetido')

def texto_contenido(valor):
    if isinstance(valor, str): return valor
    if isinstance(valor, dict): return ' '.join(texto_contenido(v) for v in valor.values())
    if isinstance(valor, list): return ' '.join(texto_contenido(v) for v in valor)
    return ''

def validar_publicacion(post):
    if post.get('estado') != 'aprobado' or not str(post.get('aprobado_por') or '').strip(): raise ValueError('Falta aprobación humana')
    checks = post.get('checklist') or {}
    if not all(checks.get(k) is True for k in ('fuente_leida','cifras_verificadas','permiso_imagen','credito_imagen','sin_marcadores')): raise ValueError('Falta completar el checklist')
    if not post.get('fuente_primaria'): raise ValueError('Falta fuente primaria')
    if re.search(r'\[[^\]]+\]|\b(?:TODO|TBD)\b', texto_contenido(post.get('laminas', [])) + ' ' + texto_contenido(post.get('descripcion', '')), re.I): raise ValueError('Quedan marcadores pendientes')
