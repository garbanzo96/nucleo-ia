import unittest
from unittest.mock import patch
from datetime import datetime, timezone
from ejecutar import fecha_parseada, noticias, academicos, texto
from nucleo import es_primaria

class DB:
    def __init__(self): self.insertadas=[]
    def insert(self, table, rows, ignore=False): self.insertadas.extend(rows)
    def rows(self, table, select='*'): return [{'doi':'10.1/visto'}]

class Ejecucion(unittest.TestCase):
    def test_fechas_y_texto_de_rss(self):
        self.assertEqual(fecha_parseada('2026-11-18T10:00:00Z'),datetime(2026,11,18,10,tzinfo=timezone.utc))
        self.assertIsNone(fecha_parseada('sin fecha'))
        self.assertEqual(texto('<p>A &amp; B</p>'),'A & B')

    def test_agrupa_primarias_y_descarta_anteriores(self):
        db=DB(); fuentes=[{'id':'a','peso':1}]
        items=[{'url':'https://test.cl/a','titulo':'A','fecha':'2026-11-18T10:00:00Z','fuente_id':'a'},
               {'url':'https://test.cl/b','titulo':'B','fecha':'2026-11-18T10:00:00Z','fuente_id':'a'},
               {'url':'https://test.cl/c','titulo':'Viejo','fecha':'2026-11-16T10:00:00Z','fuente_id':'a'}]
        def analizar(item, _): return {**item,'fuente_primaria':'https://doi.org/10.1/igual'}
        with patch('ejecutar.recoger_fuente',return_value=items), patch('ejecutar.analizar_noticia',side_effect=analizar):
            n,total,failed=noticias(db,fuentes,[],desde=datetime(2026,11,17,tzinfo=timezone.utc))
        self.assertEqual((n,total,failed),(1,1,0)); self.assertNotIn('fecha',db.insertadas[0])

    def test_academico_deduplica_doi_y_no_acepta_enlaces_caidos(self):
        db=DB(); works=[{'titulo':'Nuevo','doi':'10.1/nuevo'},{'titulo':'Ya visto','doi':'10.1/visto'},{'titulo':'Caído','doi':'10.1/caido'},{'titulo':'sin doi','doi':None}]
        with patch('ejecutar.academico.buscar',return_value=works), patch('ejecutar.academico.buscar_semantic_scholar',return_value=works), patch('ejecutar.academico.buscar_crossref',return_value=[]), patch('ejecutar.academico.buscar_pubmed',return_value=[]), patch('ejecutar.academico.buscar_arxiv',return_value=[]), patch('ejecutar.radar.disponible',side_effect=lambda u:'caido' not in u):
            count,total,failed=academicos(db,['IA'])
        self.assertEqual((count,total,failed),(1,1,0)); self.assertEqual(db.insertadas[0]['titulo'],'Nuevo')

    def test_catalogos_no_son_fuente_primaria(self):
        self.assertFalse(es_primaria('https://openalex.org/W123'))
        self.assertFalse(es_primaria('https://pubmed.ncbi.nlm.nih.gov/123'))
        self.assertTrue(es_primaria('https://doi.org/10.1/test'))

if __name__=='__main__': unittest.main()

class Destinos(unittest.TestCase):
    def test_bloquea_redes_privadas_y_credenciales(self):
        from radar import validar_destino
        privado=lambda *a,**k:[(None,None,None,None,('127.0.0.1',80))]
        publico=lambda *a,**k:[(None,None,None,None,('1.1.1.1',443))]
        with self.assertRaises(ValueError): validar_destino('http://ejemplo.test/',privado)
        with self.assertRaises(ValueError): validar_destino('https://usuario:clave@ejemplo.test/',publico)
        with self.assertRaises(ValueError): validar_destino('https://ejemplo.test:8080/',publico)
        validar_destino('https://ejemplo.test/',publico)
