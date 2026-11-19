"""Ejecuta radares y guarda resultados en Supabase. Nunca publica ni llama modelos pagados."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
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
import sala_api
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
    items=[{**item,'fuente_id':fuente['id'],'resumen':texto(item.get('resumen'))} for item in radar.recolectar(feed)]
    # Como el Radar de la Fundación: de las fuentes generales solo entra lo que trata de IA.
    if fuente.get('feed') and fuente.get('tipo') not in ESPECIALIZADAS:
        items=[i for i in items if trata_de_ia((i.get('titulo') or '')+' '+(i.get('resumen') or ''))]
    return items


ESPECIALIZADAS={'laboratorio','repositorio','observatorio','newsletter','academica','centro-investigacion','datos'}
_IA=re.compile(r"\b(IA|AI|A\.I\.|LLMs?|GPT[-\w]*)\b|inteligencia artificial|artificial intelligence|machine learning|aprendizaje (autom[aá]tico|profundo)|deep learning|algoritm|chatbot|chatgpt|openai|anthropic|claude|gemini|copilot|deepseek|mistral|modelos? de lenguaje|language models?|deepfake|robot|automatizaci|reconocimiento facial|facial recognition|redes neuronales|neural net|generativ",re.I)


def trata_de_ia(texto_nota):
    return bool(_IA.search(texto_nota or ''))


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


def noticias(db, fuentes, seen, limit=0, desde=None, vistas_primarias=()):
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
    for item in output: item.pop('peso_fuente',None)
    # Sin vector, la noticia se guarda igual y se indexa en una corrida posterior.
    for item,value in zip(output,embeddings.vectores([i['titulo']+' '+(i.get('resumen') or '') for i in output])):
        if value is not None: item['embedding']=value
    # PostgREST exige las mismas columnas en todo el lote: lo que no tiene vector va con null y se indexa después.
    for item in output: item.setdefault('embedding',None)
    for start in range(0,len(output),100): db.insert('candidatos',output[start:start+100],True)
    return len(output),len(selected),fallos


def academicos(db, queries, expansion=(), ficha_modelo=None):
    existing=db.rows('papers','doi,url'); seen_doi={str(p['doi']).lower() for p in existing if p.get('doi')}; seen_url={p['url'] for p in existing if p.get('url')}; output=[]; fallos=0
    works=list(expansion)
    for term in queries:
        consultado=False
        for search in (academico.buscar,academico.buscar_semantic_scholar,academico.buscar_crossref,academico.buscar_pubmed,academico.buscar_arxiv):
            try: works.extend(search(term)); consultado=True
            except (HTTPError,URLError,ValueError,TimeoutError,OSError,ParseError): continue
        if not consultado: fallos+=1
    for work in works:
        doi=(work.get('doi') or '').lower()
        url = 'https://doi.org/' + doi if doi else work.get('url')
        if not url or (doi and doi in seen_doi) or url in seen_url or not radar.disponible(url): continue
        work['url'] = url
        if work.get('url_abierta') and not radar.disponible(work['url_abierta']): work['url_abierta'] = None
        if doi: seen_doi.add(doi)
        seen_url.add(url)
        academico.completar_ficha(work, **(ficha_modelo or {}))
        output.append(work)
    for work,value in zip(output,embeddings.vectores([w['titulo']+' '+(w.get('abstract') or '') for w in output])):
        if value is not None: work['embedding']=value  # sin vector queda para búsqueda textual
    for work in output: work.setdefault('embedding',None)
    for start in range(0,len(output),100): db.insert('papers',output[start:start+100],True)
    return len(output),len(queries),fallos


def _texto(x, n):
    return x.strip()[:n] if isinstance(x, str) else ''


FUSIONAR=("Recibes historias elegidas en lotes distintos. Agrupa las que cuentan el mismo hecho (el mismo estudio, ley, "
          "anuncio, acuerdo, informe o caso), aunque tengan otro titular. Temas parecidos con hechos distintos no se agrupan. "
          'Responde solo JSON: {"grupos": [["s0", "s7"]]} con un grupo por hecho repetido, la historia más completa primero. '
          'Si no hay repetidas: {"grupos": []}.')


def mesa_de_edicion(db, limite=400, dias=3):
    """Como la mesa del Radar de la Fundación: agrupa las notas recientes por hecho, elige historias
    y les hace una ficha en español. Dos llamadas a la IA de la sala por cada 100 notas."""
    if not sala_api.activa(): return 'Mesa de edición: solo corre en GitHub Actions.'
    prompts={p['agente']:p['contenido'] for p in db.rows('prompts','agente,contenido,activa') if p.get('activa')}
    if not prompts.get('mesa') or not prompts.get('radar_noticias'): return 'Mesa de edición: faltan sus prompts.'
    medios={f['id']:f.get('nombre') or f['id'] for f in db.rows('fuentes','id,nombre')}
    desde=(datetime.now(timezone.utc)-timedelta(days=dias)).isoformat()
    notas=[c for c in db.rows('candidatos','id,titulo,resumen,url,fuente_id,fuente_primaria,historia_id,estado,creado_en')
           if not c.get('historia_id') and c.get('estado')=='nuevo' and (c.get('creado_en') or '')>=desde]
    notas=sorted(notas,key=lambda c:c.get('creado_en') or '',reverse=True)[:limite]
    if not notas: return 'Mesa de edición: sin notas nuevas.'
    previas=sorted(db.rows('historias','titulo,creado_en'),key=lambda h:h.get('creado_en') or '',reverse=True)
    cubiertas=[h['titulo'] for h in previas[:60]]
    hoy=datetime.now(timezone.utc).date().isoformat(); elegidas=[]
    # 1. Mesa por lotes de 100 notas: agrupa por hecho y elige.
    for inicio in range(0,len(notas),100):
        ids={f'n{k}':c for k,c in enumerate(notas[inicio:inicio+100])}
        lineas=[f"[{k}] {(c.get('creado_en') or '')[:10]} · {medios.get(c.get('fuente_id'),'')} · {_texto(c.get('titulo'),200)} — {_texto(c.get('resumen'),220)}" for k,c in ids.items()]
        try: mesa=clasificar.generar({'proveedor':'sala'},prompts['mesa'],{'fecha':hoy,'notas':lineas,'ya_cubiertas':cubiertas}) or {}
        except RuntimeError as exc:
            print('Un lote de la mesa falló; sigue con el siguiente:',str(exc)[:300],file=sys.stderr); continue
        for h in mesa.get('historias',[]) if isinstance(mesa.get('historias'),list) else []:
            ns=[ids[n] for n in dict.fromkeys(h.get('notas',[]) if isinstance(h,dict) else []) if n in ids]
            if ns and _texto(h.get('titulo'),300): elegidas.append({'h':h,'notas':ns})
    # 2. Fusión: los lotes se agrupan por separado, así que el mismo hecho puede salir dos veces.
    if len(elegidas)>1:
        try:
            r=clasificar.generar({'proveedor':'sala'},FUSIONAR,{'historias':[{'id':f's{k}','titulo':e['h']['titulo'],'por_que':_texto(e['h'].get('por_que'),200)} for k,e in enumerate(elegidas)]}) or {}
            for grupo in r.get('grupos',[]) if isinstance(r.get('grupos'),list) else []:
                idx=[int(x[1:]) for x in grupo if isinstance(x,str) and x[1:].isdigit() and 0<=int(x[1:])<len(elegidas)]
                idx=[k for k in dict.fromkeys(idx) if elegidas[k] is not None]
                for k in idx[1:]:
                    elegidas[idx[0]]['notas']+=[c for c in elegidas[k]['notas'] if c not in elegidas[idx[0]]['notas']]; elegidas[k]=None
            elegidas=[e for e in elegidas if e]
        except RuntimeError as exc: print('Fusión no disponible:',str(exc)[:300],file=sys.stderr)
    # 3. Fichas de a 8 historias con el modelo de redacción (mejores ganchos), y guardar.
    creadas=0
    for inicio in range(0,len(elegidas),8):
        bloque=elegidas[inicio:inicio+8]
        expediente=[{'id':f'h{k}','titulo':e['h']['titulo'],'por_que':_texto(e['h'].get('por_que'),400),
                     'notas':[{'medio':medios.get(c.get('fuente_id'),''),'titular':_texto(c.get('titulo'),300),'resumen':_texto(c.get('resumen'),600),'fuente_primaria':c.get('fuente_primaria') or ''} for c in e['notas']]}
                    for k,e in enumerate(bloque)]
        try: fichas=clasificar.generar({'proveedor':'sala','tarea':'fichas'},prompts['radar_noticias'],{'historias':expediente}) or {}
        except RuntimeError as exc:
            print('Fichas no disponibles:',str(exc)[:300],file=sys.stderr); fichas={}
        porid={f.get('id'):f for f in fichas.get('historias',[]) if isinstance(f,dict)} if isinstance(fichas.get('historias'),list) else {}
        for k,e in enumerate(bloque):
            h,ns=e['h'],e['notas']; f=porid.get(f'h{k}',{}); pj=f.get('puntaje')
            primaria=next((c['fuente_primaria'] for c in ns if c.get('fuente_primaria')),None)
            fila={'titulo':_texto(h['titulo'],300),'por_que':_texto(h.get('por_que'),600),'categoria':_texto(h.get('categoria'),40),'nivel':_texto(h.get('nivel'),20),
                  'resumen':_texto(f.get('resumen'),1500),'angulo':_texto(f.get('angulo'),500),'gancho':_texto(f.get('gancho'),300),'tipo_gancho':_texto(f.get('tipo_gancho'),60),
                  'formato':_texto(f.get('formato'),60),'confianza':_texto(f.get('confianza'),10),
                  'puntaje':round(float(pj),1) if isinstance(pj,(int,float)) and not isinstance(pj,bool) and 0<=pj<=10 else None,
                  'cobertura':len({c.get('fuente_id') for c in ns}),'fuente_primaria':primaria,'fuente_url':primaria or ns[0]['url'],
                  'notas':[{'medio':medios.get(c.get('fuente_id'),''),'titulo':_texto(c.get('titulo'),300),'url':c['url']} for c in ns]}
            creada=db.request('POST','historias',fila,'return=representation')
            for c in ns: db.update('candidatos',c['id'],{'historia_id':creada[0]['id']})
            creadas+=1
    return f'Mesa de edición: {creadas} historias elegidas de {len(notas)} notas.'


def expansion_guardada(db):
    """Autores, venues y temas de lo que la sala guardó, usó o publicó; si OpenAlex falla, la corrida sigue."""
    urls=[c.get('fuente_primaria') for c in db.rows('candidatos','fuente_primaria,estado') if c.get('estado') in ('guardado','usado')]
    urls+=[p.get('fuente_primaria') for p in db.rows('posts','fuente_primaria')]
    desde=(datetime.now(timezone.utc)-timedelta(days=180)).date().isoformat()
    try: return academico.expandir_consultas([academico.doi_de(u) for u in urls if u],desde)
    except (HTTPError,URLError,ValueError,TimeoutError,OSError): return []


def indexar_pendientes(db, limite=300):
    """Completa gradualmente vectores pendientes, en lotes."""
    count = 0
    for table, field in (('candidatos','resumen'), ('papers','abstract')):
        filas=[r for r in db.rows(table, 'id,titulo,' + field + ',embedding') if r.get('embedding') is None][:limite-count]
        for row,value in zip(filas,embeddings.vectores([(r.get('titulo') or '')+' '+(r.get(field) or '') for r in filas])):
            if value is None: continue
            db.update(table, row['id'], {'embedding':value})
            count += 1
        if count >= limite: return count
    return count


def run(tipo, job_id=None, limite=0):
    if sala_api.activa():
        db=sala_api.SalaApi()  # GitHub Actions: sin secretos, con token OIDC
    else:
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
            trabajos=db.rows('trabajos','tipo,estado,terminado_en'); fechas=[fecha_parseada(t.get('terminado_en')) for t in trabajos if t.get('estado')=='completado' and t.get('tipo') in ('noticias','ambos')]
            desde=max((f for f in fechas if f),default=None)
            count,total,failed=noticias(db,fuentes,seen,limite,desde,[c['fuente_primaria'] for c in vistos if c.get('fuente_primaria')])
            if total and failed==total: raise RuntimeError('No se pudo consultar ninguna fuente de noticias.')
            detalle.append(f'Noticias: {count} temas nuevos; {failed} de {total} fuentes no respondieron.')
            detalle.append(mesa_de_edicion(db))
        if tipo in ('academico','ambos'):
            conf={r['clave']:r['valor'] for r in db.rows('config','clave,valor')}; queries=conf.get('consultas_academicas',[])
            if not isinstance(queries,list) or not all(isinstance(q,str) for q in queries): raise RuntimeError('Las consultas académicas no tienen un formato válido.')
            if limite: queries=queries[:limite]
            filtro={'proveedor':'sala'} if sala_api.activa() else conf.get('modelos',{}).get('filtrar'); prompt=next((p['contenido'] for p in db.rows('prompts','agente,contenido,activa') if p.get('agente')=='radar_academico' and p.get('activa')),None)
            ficha_modelo={'modelo':filtro,'prompt':prompt,'generar':clasificar.generar} if isinstance(filtro,dict) and prompt else None
            expansion=expansion_guardada(db)
            count,total,failed=academicos(db,queries,expansion,ficha_modelo)
            if total and failed==total: raise RuntimeError('No se pudo consultar OpenAlex.')
            detalle.append(f'Académico: {count} papers nuevos ({len(expansion)} propuestos por autores, venues y temas guardados); {failed} de {total} consultas fallaron.')
        if sala_api.activa() or (os.environ.get('GEMINI_FREE_TIER_CONFIRMED') == 'true' and os.environ.get('GEMINI_API_KEY')):
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
