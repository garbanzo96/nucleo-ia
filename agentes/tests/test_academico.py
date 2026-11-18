import unittest
from academico import reconstruir_abstract, ficha

class Academico(unittest.TestCase):
    def test_reconstruye_abstract_en_orden(self):
        self.assertEqual(reconstruir_abstract({'mundo':[1], 'Hola':[0], 'otra':[2]}), 'Hola mundo otra')
        self.assertIsNone(reconstruir_abstract(None))
    def test_no_inventa_detalles(self):
        item=ficha({'display_name':'Trabajo', 'doi':'https://doi.org/10.123/x'})
        self.assertEqual(item['doi'], '10.123/x')
        self.assertIsNone(item['abstract'])
        self.assertTrue(item['ficha_basada_en_abstract'])
        self.assertNotIn('hallazgo', item)

class Crossref(unittest.TestCase):
    def test_ficha_crossref_con_doi_autores_y_solo_abstract(self):
        from academico import ficha_crossref
        result = ficha_crossref({'DOI':'10.1234/ejemplo','title':['Estudio'], 'author':[{'given':'Ana','family':'Pérez'}], 'container-title':['Revista'], 'published':{'date-parts':[[2025,1,1]]},'abstract':'<jats:p>Resultado <jats:italic>inicial</jats:italic></jats:p>'})
        self.assertEqual(result['doi'],'10.1234/ejemplo')
        self.assertEqual(result['autores'],['Ana Pérez'])
        self.assertEqual(result['abstract'],'Resultado inicial')
        self.assertTrue(result['ficha_basada_en_abstract'])
        self.assertIsNone(result['url_abierta'])
        self.assertNotIn('hallazgo',result)

class Arxiv(unittest.TestCase):
    def test_ficha_arxiv_sin_doi_se_conserva(self):
        from academico import fichas_arxiv
        xml='''<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2401.12345v1</id><title>Study</title><summary>Abstract</summary><published>2024-01-23T00:00:00Z</published><author><name>Test Author</name></author></entry></feed>'''
        item=fichas_arxiv(xml)[0]
        self.assertEqual(item['url'],'https://arxiv.org/abs/2401.12345v1')
        self.assertEqual(item['autores'],['Test Author'])
        self.assertIsNone(item['doi'])
        self.assertTrue(item['ficha_basada_en_abstract'])
