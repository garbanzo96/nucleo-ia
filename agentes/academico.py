"""Consulta inicial a OpenAlex; no genera fichas sin respaldo."""
import argparse
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def reconstruir_abstract(indice):
    if not indice: return None
    posiciones = [(p, palabra) for palabra, lista in indice.items() for p in lista if isinstance(p, int) and 0 <= p < 100000]
    if not posiciones: return None
    return ' '.join(palabra for _, palabra in sorted(posiciones))


def ficha(work):
    origen = work.get('primary_location') or {}
    source = origen.get('source') or {}
    abierto = work.get('open_access') or {}
    return {
        'titulo': work.get('display_name') or '', 'doi': (work.get('doi') or '').removeprefix('https://doi.org/') or None,
        'url': work.get('doi') or work.get('id'), 'autores': [a.get('author', {}).get('display_name') for a in work.get('authorships', []) if a.get('author', {}).get('display_name')],
        'venue': source.get('display_name'), 'anio': work.get('publication_year'),
        'abstract': reconstruir_abstract(work.get('abstract_inverted_index')),
        'url_abierta': abierto.get('oa_url'), 'ficha_basada_en_abstract': True,
    }


def buscar(consulta):
    url = 'https://api.openalex.org/works?' + urlencode({'search': consulta, 'per-page': 20, 'sort': 'publication_date:desc'})
    with urlopen(Request(url, headers={'User-Agent':'NucleoIA/1.0 (investigacion)'}), timeout=20) as res:
        return [ficha(w) for w in json.load(res).get('results', [])]


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--ejemplo',action='store_true'); parser.add_argument('--consulta', default='AI governance'); args=parser.parse_args()
    if args.ejemplo:
        data=[ficha({'display_name':'Ejemplo: estudio ficticio','doi':'https://doi.org/10.0000/ejemplo','abstract_inverted_index':{'Un':[0],'ejemplo':[1]},'authorships':[]})]
    else: data=buscar(args.consulta)
    print(json.dumps(data,ensure_ascii=False,indent=2))
if __name__=='__main__': main()


def buscar_semantic_scholar(consulta):
    """Búsqueda pública; se conservan solo los campos que entrega el servicio."""
    params={'query':consulta,'limit':20,'fields':'title,authors,year,abstract,venue,externalIds,openAccessPdf,url'}
    url='https://api.semanticscholar.org/graph/v1/paper/search?'+urlencode(params)
    with urlopen(Request(url,headers={'User-Agent':'NucleoIA/1.0 (investigacion)'}),timeout=20) as res:
        works=json.load(res).get('data',[])
    return [{'titulo':w.get('title') or '', 'doi':(w.get('externalIds') or {}).get('DOI'),
             'url':w.get('url'), 'autores':[a['name'] for a in w.get('authors',[]) if a.get('name')],
             'venue':w.get('venue'), 'anio':w.get('year'), 'abstract':w.get('abstract'),
             'url_abierta':(w.get('openAccessPdf') or {}).get('url'), 'ficha_basada_en_abstract':True} for w in works]


def expandir_semantic_scholar(paper_id):
    """Devuelve referencias y citas del proveedor; no las convierte en evidencia verificada."""
    from urllib.parse import quote
    base='https://api.semanticscholar.org/graph/v1/paper/'+quote(paper_id,safe=':')
    result={}
    for relation in ('references','citations'):
        url=base+'/'+relation+'?'+urlencode({'fields':'title,year,authors,externalIds,url,citationCount','limit':50})
        with urlopen(Request(url,headers={'User-Agent':'NucleoIA/1.0 (investigacion)'}),timeout=20) as res:
            result[relation]=json.load(res).get('data',[])
    return result


def ficha_crossref(work):
    """Solo metadatos entregados por Crossref; el resumen no es texto completo."""
    import html
    import re
    doi = work.get('DOI')
    fechas = (work.get('published') or {}).get('date-parts') or [[]]
    autores = [' '.join(filter(None, [a.get('given'), a.get('family')])) for a in work.get('author', [])]
    resumen = work.get('abstract')
    if resumen:
        resumen = ' '.join(html.unescape(re.sub(r'<[^>]*>', ' ', resumen)).split()) or None
    return {'titulo': (work.get('title') or [''])[0], 'doi': doi,
            'url': 'https://doi.org/' + doi if doi else None, 'autores': [a for a in autores if a],
            'venue': (work.get('container-title') or [None])[0], 'anio': fechas[0][0] if fechas[0] else None,
            'abstract': resumen, 'url_abierta': None, 'ficha_basada_en_abstract': True}


def buscar_crossref(consulta):
    url='https://api.crossref.org/works?'+urlencode({'query.bibliographic':consulta,'rows':20,'sort':'published','order':'desc'})
    with urlopen(Request(url,headers={'User-Agent':'NucleoIA/1.0 (investigacion)'}),timeout=20) as res:
        return [ficha_crossref(w) for w in json.load(res).get('message',{}).get('items',[])]


def fichas_pubmed(xml):
    from xml.etree import ElementTree as ET
    root = ET.fromstring(xml)
    results = []
    for article in root.findall('.//PubmedArticle'):
        pmid = article.findtext('.//MedlineCitation/PMID')
        node = article.find('.//Article/ArticleTitle')
        title = ''.join(node.itertext()).strip() if node is not None else ''
        doi = next((x.text for x in article.findall('.//ArticleId') if x.get('IdType') == 'doi'), None)
        abstracts = [' '.join(x.itertext()).strip() for x in article.findall('.//Abstract/AbstractText')]
        authors = []
        for a in article.findall('.//AuthorList/Author'):
            name = ' '.join(filter(None, [a.findtext('ForeName'), a.findtext('LastName')])) or a.findtext('CollectiveName')
            if name: authors.append(name)
        year = article.findtext('.//Journal/JournalIssue/PubDate/Year')
        results.append({'titulo': title, 'doi': doi, 'url': 'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/' if pmid else None,
                        'autores': authors, 'venue': article.findtext('.//Journal/Title'),
                        'anio': int(year) if year and year.isdigit() else None, 'abstract': ' '.join(abstracts) or None,
                        'url_abierta': None, 'ficha_basada_en_abstract': True})
    return results


def buscar_pubmed(consulta):
    import time
    base='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/'
    headers={'User-Agent':'NucleoIA/1.0 (investigacion)'}
    url=base+'esearch.fcgi?'+urlencode({'db':'pubmed','term':consulta,'retmode':'json','retmax':20,'sort':'pub_date'})
    with urlopen(Request(url,headers=headers),timeout=20) as res:
        ids=json.load(res).get('esearchresult',{}).get('idlist',[])
    if not ids: return []
    time.sleep(.4)  # Sin clave NCBI: menos de tres consultas por segundo.
    url=base+'efetch.fcgi?'+urlencode({'db':'pubmed','id':','.join(ids),'retmode':'xml'})
    with urlopen(Request(url,headers=headers),timeout=20) as res:
        return fichas_pubmed(res.read(2_000_000))


def fichas_arxiv(xml):
    from xml.etree import ElementTree as ET
    ns={'a':'http://www.w3.org/2005/Atom','arxiv':'http://arxiv.org/schemas/atom'}
    results=[]
    for entry in ET.fromstring(xml).findall('a:entry',ns):
        url=(entry.findtext('a:id','',ns)).replace('http://arxiv.org/', 'https://arxiv.org/', 1)
        if not url.startswith('https://arxiv.org/abs/'): continue
        publicado=entry.findtext('a:published','',ns)
        results.append({'titulo':' '.join(entry.findtext('a:title','',ns).split()),'doi':entry.findtext('arxiv:doi',None,ns),
                        'url':url,'autores':[a.findtext('a:name','',ns) for a in entry.findall('a:author',ns)],
                        'venue':entry.findtext('arxiv:journal_ref',None,ns), 'anio':int(publicado[:4]) if publicado[:4].isdigit() else None,
                        'abstract':' '.join(entry.findtext('a:summary','',ns).split()) or None,
                        'url_abierta':url.replace('/abs/','/pdf/')+'.pdf','ficha_basada_en_abstract':True})
    return results


def buscar_arxiv(consulta):
    categories=' OR '.join('cat:'+category for category in ('cs.AI','cs.CL','cs.CY','cs.HC','cs.RO'))
    query='all:"'+consulta.replace('"','')+'" AND ('+categories+')'
    url='https://export.arxiv.org/api/query?'+urlencode({'search_query':query,'start':0,'max_results':20,'sortBy':'submittedDate','sortOrder':'descending'})
    with urlopen(Request(url,headers={'User-Agent':'NucleoIA/1.0 (investigacion)'}),timeout=20) as res:
        return fichas_arxiv(res.read(2_000_000))


# Ficha académica: cada campo es una cita textual del texto accesible o "no consta". Nunca se completa por inferencia.
NO_CONSTA = 'no consta'
PATRONES = {
    'pregunta': r'\?|\b(?:we|this (?:paper|study|article|work))\s+(?:ask|investigate|examine|explore|stud(?:y|ies)|address|analy[sz]e|assess)|\b(?:aims? to|objective|purpose|research questions?)\b|\b(?:este (?:trabajo|estudio|artículo)|objetivo)\b',
    'metodo': r'\b(?:survey|experiment|interview|randomi[sz]ed|qualitative|quantitative|meta-analy|systematic (?:review|literature)|case stud|benchmark|dataset|simulation|regression|thematic analysis|mixed[- ]methods?|ethnograph|we (?:use|conduct|employ|propose|develop|train|evaluate|collect|draw on)|encuesta|entrevista|experimento|revisión sistemática)',
    'n': r'\b[Nn]\s*=\s*\d|\b\d[\d,.]*\s+(?:participants|respondents|subjects|students|users|patients|people|adults|children|workers|interviews|articles|papers|studies|documents|models|countries|teachers|experts|prompts|conversations|participantes|encuestados|estudiantes|personas|entrevistas)\b',
    'hallazgo': r'\b(?:we (?:find|found|show|demonstrate|observe|report)|(?:results?|findings?|analys[ie]s) (?:show|indicate|suggest|reveal|demonstrate)|los resultados (?:muestran|indican|sugieren))',
    'limites': r'\b(?:limitations?|limited (?:by|to)|caveats?|future (?:work|research)|remains? unclear|generali[sz]ability|(?:may|might|do|does|did) not generali[sz]e|small sample|cannot (?:establish|determine)|further research|limitaci[oó]n)',
}
CAMPOS = tuple(PATRONES)


def oraciones(texto):
    import re
    return [o.strip() for o in re.split(r'(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ0-9"“(])', ' '.join((texto or '').split())) if 15 <= len(o.strip()) <= 600]


def ficha_determinista(abstract, texto_completo=None):
    """Busca primero en el resumen y después en el texto completo; la cita es la oración tal cual."""
    import re
    citas = {}
    for campo, patron in PATRONES.items():
        for texto in (abstract, texto_completo):
            cita = next((o for o in oraciones(texto) if re.search(patron, o, re.I)), None)
            if cita: citas[campo] = cita; break
    return {**{campo: citas.get(campo, NO_CONSTA) for campo in CAMPOS}, 'citas': citas}


def ficha_con_modelo(texto, modelo, prompt, generar):
    """Opcional: el modelo resume cada campo, pero solo se acepta si la cita está literal en el texto."""
    import re
    salida = generar(modelo, prompt, {'texto': texto[:20000], 'campos': list(CAMPOS),
                                      'salida': {c: {'resumen': 'una frase en español', 'cita': 'oración copiada literal del texto'} for c in CAMPOS}})
    if not isinstance(salida, dict): return None
    plano = ' '.join(texto.split()); ficha = {'citas': {}}
    for campo in CAMPOS:
        x = salida.get(campo) if isinstance(salida.get(campo), dict) else {}
        cita, resumen = ' '.join(str(x.get('cita') or '').split()), str(x.get('resumen') or '').strip()
        ok = 15 <= len(cita) <= 600 and cita in plano and 0 < len(resumen) <= 400 and not re.search(r'https?://', resumen)
        ficha[campo] = resumen if ok else NO_CONSTA
        if ok: ficha['citas'][campo] = cita
    return ficha


def texto_europepmc(doi):
    """Resumen y, si es acceso abierto en Europe PMC, texto completo. Devuelve (resumen, texto_completo, url_abierta)."""
    from xml.etree import ElementTree as ET
    if not doi: return None, None, None
    url = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?' + urlencode({'query': f'DOI:"{doi}"', 'format': 'json', 'resultType': 'core', 'pageSize': 1})
    with urlopen(Request(url, headers={'User-Agent': 'NucleoIA/1.0 (investigacion)'}), timeout=20) as res:
        hits = json.load(res).get('resultList', {}).get('result', [])
    hit = next((h for h in hits if str(h.get('doi', '')).lower() == doi.lower()), None)
    if not hit: return None, None, None
    import html, re
    resumen = ' '.join(html.unescape(re.sub(r'<[^>]*>', ' ', hit.get('abstractText') or '')).split()) or None
    pmcid = hit.get('pmcid')
    if not (pmcid and hit.get('isOpenAccess') == 'Y' and hit.get('inEPMC') == 'Y'): return resumen, None, None
    with urlopen(Request(f'https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML', headers={'User-Agent': 'NucleoIA/1.0 (investigacion)'}), timeout=30) as res:
        body = ET.fromstring(res.read(5_000_000)).find('.//body')
    completo = '\n'.join(' '.join(''.join(p.itertext()).split()) for p in body.iter('p')) if body is not None else None
    return resumen, completo or None, 'https://europepmc.org/article/PMC/' + pmcid


def abstract_semantic_scholar(doi):
    """Resumen público de Semantic Scholar cuando OpenAlex y Europe PMC no lo traen."""
    from urllib.parse import quote
    url = 'https://api.semanticscholar.org/graph/v1/paper/DOI:' + quote(doi, safe='/') + '?fields=abstract'
    with urlopen(Request(url, headers={'User-Agent': 'NucleoIA/1.0 (investigacion)'}), timeout=20) as res:
        return (json.load(res).get('abstract') or '').strip() or None


def completar_ficha(work, modelo=None, prompt=None, generar=None, europepmc=None, semantic_scholar=None):
    """Agrega pregunta, método, n, hallazgo, límites y citas. Sin clave de modelo, solo la parte determinista."""
    completo = None
    try:
        resumen, completo, abierta = (europepmc or texto_europepmc)(work.get('doi'))
        if resumen and not work.get('abstract'): work['abstract'] = resumen
        if abierta and not work.get('url_abierta'): work['url_abierta'] = abierta
    except (OSError, ValueError):
        pass  # Europe PMC es un extra: sin él la ficha usa el resumen.
    if not work.get('abstract') and work.get('doi'):
        try: work['abstract'] = (semantic_scholar or abstract_semantic_scholar)(work['doi'])
        except (OSError, ValueError): pass
    texto = '\n'.join(t for t in (work.get('abstract'), completo) if t)
    ficha = None
    if modelo and prompt and generar and texto:
        try: ficha = ficha_con_modelo(texto, modelo, prompt, generar)
        except Exception: ficha = None
    ficha = ficha or ficha_determinista(work.get('abstract'), completo)
    work.update(ficha)
    work['ficha_basada_en_abstract'] = not completo
    work['texto_fuente'] = 'texto completo (Europe PMC)' if completo else ('resumen' if work.get('abstract') else 'sin texto accesible')
    return work


def doi_de(url):
    """DOI desde un enlace doi.org o arXiv (arXiv registra sus trabajos como 10.48550/arXiv.ID)."""
    import re
    from urllib.parse import unquote
    m = re.match(r'^https://doi\.org/(10\.\d{4,9}/\S+)$', url or '', re.I)
    if m: return unquote(m.group(1)).lower()
    m = re.match(r'^https://(?:www\.)?arxiv\.org/abs/(\d{4}\.\d{4,5})(?:v\d+)?/?$', url or '')
    return '10.48550/arxiv.' + m.group(1) if m else None


def expandir_consultas(dois, desde, abrir=urlopen):
    """Trabajos recientes de los autores, venues y temas más repetidos en lo que la sala guardó o usó."""
    from collections import Counter
    dois = [d for d in dict.fromkeys(dois) if d and ',' not in d and '|' not in d][:50]
    if not dois: return []
    def pedir(params):
        url = 'https://api.openalex.org/works?' + urlencode(params)
        with abrir(Request(url, headers={'User-Agent': 'NucleoIA/1.0 (investigacion)'}), timeout=20) as res:
            return json.load(res).get('results', [])
    corto = lambda x: str(x or '').rsplit('/', 1)[-1]
    guardados = pedir({'filter': 'doi:' + '|'.join(dois), 'per-page': 50})
    autores = Counter(corto(a.get('author', {}).get('id')) for w in guardados for a in w.get('authorships', [])[:10] if (a.get('author') or {}).get('id'))
    venues = Counter(corto(((w.get('primary_location') or {}).get('source') or {}).get('id')) for w in guardados if ((w.get('primary_location') or {}).get('source') or {}).get('id'))
    temas = Counter(corto(t.get('id')) for w in guardados for t in (w.get('topics') or [])[:3] if t.get('id'))
    consultas = [({'filter': f'authorships.author.id:{"|".join(a for a, _ in autores.most_common(5))},from_publication_date:{desde}'}, autores),
                 ({'filter': f'primary_location.source.id:{"|".join(v for v, _ in venues.most_common(3))},from_publication_date:{desde}', 'search': 'artificial intelligence'}, venues),
                 ({'filter': f'topics.id:{"|".join(t for t, _ in temas.most_common(3))},from_publication_date:{desde}'}, temas)]
    vistos = set(dois); resultado = []
    for params, conteo in consultas:
        if not conteo: continue
        for w in pedir({**params, 'sort': 'publication_date:desc', 'per-page': 20}):
            f = ficha(w)
            if f['doi'] and f['doi'].lower() in vistos: continue
            vistos.add((f['doi'] or '').lower()); resultado.append(f)
    return resultado
