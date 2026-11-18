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
