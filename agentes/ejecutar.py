"""Ejecuta radares y guarda resultados en Supabase. Nunca publica ni llama modelos pagados."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import html
import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen
from xml.etree.ElementTree import ParseError

import academico
import clasificar
import embeddings
import radar
from nucleo import canonical_url, deduplicar, resolver_primaria

class Supabase:
    def __init__(self, url, key):
        self.url = url.rstrip('/') + '/rest/v1/'
        self.key = key
    def request(self, method, path, body=None, prefer=None):
        headers = {'apikey':self.key, 'Authorization':'Bearer '+self.key, 'Content-Type':'application/json', 'Accept':'application/json'}
        if prefer: headers['Prefer'] = prefer
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
        req = Request(self.url+path, data=data, headers=headers, method=method)
        try:
            with urlopen(req, timeout=30) as res:
                raw=res.read(); return json.loads(raw) if raw else None
        except HTTPError as e:
            raise RuntimeError(f'Supabase rechazó {method} {path.split("?")[0]} (HTTP {e.code})') from None
    def rows(self, table, select='*'):
        result=[]; offset=0
        while True:
            batch=self.request('GET', f'{table}?'+urlencode({'select':select, 'limit':1000,'offset':offset})) or []
            result.extend(batch)
            if len(batch)<1000: return result
            offset+=len(batch)
    def insert(self, table, rows, ignore=False):
        if not rows: return
        self.request('POST', table, rows, 'resolution=ignore-duplicates,return=minimal' if ignore else 'return=minimal')
    def update(self, table, row_id, values):
        self.request('PATCH', table+'?id=eq.'+quote(str(row_id),safe=''), values, 'return=minimal')


def texto(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', s or ''))).strip()[:1000]


def recoger_fuente(fuente):
    feed=fuente.get('feed')
    if not feed:
        domain=urlsplit(fuente.get('url','')).hostname
        if not domain: return []
        feed='https://news.google.com/rss/search?'+urlencode({'q':f'site:{domain} ("inteligencia artificial" OR "artificial intelligence")','hl':'es-419','gl':'CL','ceid':'CL:es-419'})
    return [{**item,'fuente_id':fuente['id'],'resumen':texto(item.get('resumen'))} for item in radar.recolectar(feed)]


def analizar_noticia(item, fuente):
    try:
        raw, final=radar.leer(item['url'])
        primary=resolver_primaria(final,raw.decode('utf-8','replace'),radar.disponible)
    except (HTTPError,URLError,ValueError,TimeoutError,OSError): primary=None
    return {**item,'fuente_primaria':primary,'puntaje':None,'angulo':None,'gancho':None,'peso_fuente':float(fuente.get('peso',1))}


def fecha_parseada(value):
    if not value: return None
    try:
        date = datetime.fromisoformat(value.replace('Z','+00:00'))
    except ValueError:
        try: date = parsedate_to_datetime(value)
        except (TypeError,ValueError,OverflowError): return None
    if date.tzinfo is None: date=date.replace(tzinfo=timezone.utc)
    return date


def noticias(db, fuentes, seen, limit=0, desde=None, vistas_primarias=(), clasificacion=None):
    selected=fuentes[:limit] if limit else fuentes
    found=[]; fallos=0
    with ThreadPoolExecutor(max_workers=12) as pool:
        pending={pool.submit(recoger_fuente, f):f for f in selected}
        for task in as_completed(pending):
            try: found.extend(task.result())
            except (HTTPError,URLError,ValueError,TimeoutError,OSError,ParseError): fallos+=1
    # Las entradas sin fecha se evalúan por URL para no perder hallazgos.
    if desde: found=[i for i in found if not fecha_parseada(i.get('fecha')) or fecha_parseada(i.get('fecha')) > desde]
    fresh=deduplicar(found,seen)
    byid={f['id']:f for f in fuentes}; output=[]
    with ThreadPoolExecutor(max_workers=12) as pool:
        pending=[pool.submit(analizar_noticia, i, byid[i['fuente_id']]) for i in fresh]
        for task in as_completed(pending): output.append(task.result())
    # Una fuente primaria compartida identifica el mismo hecho; no se inventa agrupación cuando falta.
    primary_seen=set(vistas_primarias); grouped=[]
    for item in output:
        item.pop('fecha',None)
        primary=item.get('fuente_primaria')
        if primary and primary in primary_seen: continue
        if primary: primary_seen.add(primary)
        grouped.append(item)
    output=grouped
    if clasificacion:
        try:
            clasificar.clasificar(output,clasificacion['modelo'],clasificacion['prompt'],clasificacion['ejemplos'])
        except Exception:
            print('Clasificación no disponible; los temas quedan pendientes de evaluar.',file=sys.stderr)
    for item in output:
        item.pop('peso_fuente',None)
        try:
            value = embeddings.vector(item['titulo'] + ' ' + (item.get('resumen') or ''))
            if value is not None: item['embedding'] = value
        except (HTTPError, URLError, ValueError, TimeoutError, OSError):
            pass  # La noticia se guarda sin vector y puede indexarse más tarde.
    for start in range(0,len(output),100): db.insert('candidatos',output[start:start+100],True)
    return len(output),len(selected),fallos


def academicos(db, queries):
    existing=db.rows('papers','doi,url'); seen_doi={str(p['doi']).lower() for p in existing if p.get('doi')}; seen_url={p['url'] for p in existing if p.get('url')}; output=[]; fallos=0
    for term in queries:
        works=[]; consultado=False
        for search in (academico.buscar,academico.buscar_semantic_scholar,academico.buscar_crossref,academico.buscar_pubmed,academico.buscar_arxiv):
            try: works.extend(search(term)); consultado=True
            except (HTTPError,URLError,ValueError,TimeoutError,OSError,ParseError): continue
        if not consultado: fallos+=1; continue
        for work in works:
            doi=(work.get('doi') or '').lower()
            url = 'https://doi.org/' + doi if doi else work.get('url')
            if not url or (doi and doi in seen_doi) or url in seen_url or not radar.disponible(url): continue
            work['url'] = url
            if work.get('url_abierta') and not radar.disponible(work['url_abierta']): work['url_abierta'] = None
            if doi: seen_doi.add(doi)
            seen_url.add(url)
            try:
                value = embeddings.vector(work['titulo'] + ' ' + (work.get('abstract') or ''))
                if value is not None: work['embedding'] = value
            except (HTTPError, URLError, ValueError, TimeoutError, OSError):
                pass  # La ficha queda disponible para búsqueda textual.
            output.append(work)
    for start in range(0,len(output),100): db.insert('papers',output[start:start+100],True)
    return len(output),len(queries),fallos


def indexar_pendientes(db, limite=40):
    """Completa gradualmente vectores antiguos; nunca indexa sin la opción gratuita habilitada."""
    count = 0
    for table, field in (('candidatos','resumen'), ('papers','abstract')):
        for row in db.rows(table, 'id,titulo,' + field + ',embedding'):
            if row.get('embedding') is not None: continue
            try:
                value = embeddings.vector((row.get('titulo') or '') + ' ' + (row.get(field) or ''))
            except (HTTPError, URLError, ValueError, TimeoutError, OSError):
                continue
            if value is None: return count
            db.update(table, row['id'], {'embedding':value})
            count += 1
            if count >= limite: return count
    return count


def run(tipo, job_id=None, limite=0):
    url,key=os.environ.get('SUPABASE_URL'),os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key: raise RuntimeError('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY; no se ejecutó el radar.')
    if not url.startswith('https://'): raise RuntimeError('La URL de Supabase debe usar HTTPS.')
    db=Supabase(url,key)
    if not job_id:
        created=db.request('POST','trabajos',{'tipo':tipo,'estado':'pendiente','solicitado_por':'Programado'},'return=representation');job_id=created[0]['id']
    db.update('trabajos',job_id,{'estado':'en_curso'})
    try:
        detalle=[]
        if tipo in ('noticias','ambos'):
            catalog=json.loads(Path(__file__).with_name('fuentes.json').read_text())
            db.insert('fuentes',[{k:f.get(k) for k in ('id','nombre','url','feed','tipo')} for f in catalog],True)
            fuentes=db.rows('fuentes'); vistos=db.rows('candidatos','url,fuente_primaria,titulo,resumen,estado,creado_en'); seen=[c['url'] for c in vistos]
            cfg={r['clave']:r['valor'] for r in db.rows('config','clave,valor')}
            prompts=db.rows('prompts','agente,contenido,activa')
            radar_prompt=next((p['contenido'] for p in prompts if p.get('agente')=='radar_noticias' and p.get('activa')),None)
            ejemplos=sorted((c for c in vistos if c.get('estado') in ('guardado','usado','descartado')),key=lambda c:c.get('creado_en') or '',reverse=True)[:20]
            muestras=[{'titulo':c.get('titulo'),'resumen':(c.get('resumen') or '')[:300],'estado':c['estado']} for c in ejemplos]
            filtro=cfg.get('modelos',{}).get('filtrar')
            clasificacion={'modelo':filtro,'prompt':radar_prompt,'ejemplos':muestras} if isinstance(filtro,dict) and radar_prompt else None
            trabajos=db.rows('trabajos','tipo,estado,terminado_en'); fechas=[fecha_parseada(t.get('terminado_en')) for t in trabajos if t.get('estado')=='completado' and t.get('tipo') in ('noticias','ambos')]
            desde=max((f for f in fechas if f),default=None)
            count,total,failed=noticias(db,fuentes,seen,limite,desde,[c['fuente_primaria'] for c in vistos if c.get('fuente_primaria')],clasificacion)
            if total and failed==total: raise RuntimeError('No se pudo consultar ninguna fuente de noticias.')
            detalle.append(f'Noticias: {count} temas nuevos; {failed} de {total} fuentes no respondieron.')
        if tipo in ('academico','ambos'):
            conf={r['clave']:r['valor'] for r in db.rows('config','clave,valor')}; queries=conf.get('consultas_academicas',[])
            if not isinstance(queries,list) or not all(isinstance(q,str) for q in queries): raise RuntimeError('Las consultas académicas no tienen un formato válido.')
            if limite: queries=queries[:limite]
            count,total,failed=academicos(db,queries)
            if total and failed==total: raise RuntimeError('No se pudo consultar OpenAlex.')
            detalle.append(f'Académico: {count} papers nuevos; {failed} de {total} consultas fallaron.')
        if os.environ.get('GEMINI_FREE_TIER_CONFIRMED') == 'true' and os.environ.get('GEMINI_API_KEY'):
            detalle.append(f'Indexación semántica: {indexar_pendientes(db)} pendientes completados.')
        db.update('trabajos',job_id,{'estado':'completado','detalle':' '.join(detalle),'terminado_en':datetime.now(timezone.utc).isoformat()})
        return detalle
    except Exception:
        try: db.update('trabajos',job_id,{'estado':'error','detalle':'La investigación no pudo completarse. Revisa la ejecución de GitHub Actions.','terminado_en':datetime.now(timezone.utc).isoformat()})
        except Exception: pass
        raise


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--tipo',choices=['noticias','academico','ambos'],default='ambos');parser.add_argument('--trabajo-id');parser.add_argument('--limite',type=int,default=0);parser.add_argument('--ejemplo',action='store_true'); args=parser.parse_args()
    if args.ejemplo:
        print(json.dumps({'ejemplo':True,'noticias':radar.ejemplo(),'papers':[academico.ficha({'display_name':'Ejemplo: trabajo ficticio','doi':'https://doi.org/10.0000/ejemplo','authorships':[]})]},ensure_ascii=False,indent=2));return
    try: print('\n'.join(run(args.tipo,args.trabajo_id,args.limite)))
    except Exception as exc: print('La investigación terminó con error:',str(exc),file=sys.stderr);sys.exit(1)

if __name__=='__main__': main()
