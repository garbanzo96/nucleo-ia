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


class Fichas(unittest.TestCase):
    RESUMEN = ('We investigate whether chatbots change how students write essays. '
               'We conducted a randomized experiment with 412 students at three universities. '
               'Results show that essays written with assistance were rated higher but less original. '
               'The sample is limited to one country, so findings may not generalize.')

    def test_cada_campo_es_una_cita_literal_o_no_consta(self):
        from academico import ficha_determinista
        f = ficha_determinista(self.RESUMEN)
        self.assertTrue(f['pregunta'].startswith('We investigate whether'))
        self.assertIn('randomized experiment', f['metodo']); self.assertIn('412 students', f['n'])
        self.assertTrue(f['hallazgo'].startswith('Results show')); self.assertIn('limited', f['limites'])
        for campo, cita in f['citas'].items(): self.assertIn(cita, self.RESUMEN); self.assertEqual(f[campo], cita)
        vacia = ficha_determinista('A short note about policy.')
        self.assertEqual(vacia['hallazgo'], 'no consta'); self.assertEqual(vacia['citas'], {})

    def test_texto_completo_completa_lo_que_falta(self):
        from academico import ficha_determinista
        f = ficha_determinista('We study AI tutors.', 'Our analysis covered 30 classrooms. One limitation is the short follow-up period.')
        self.assertEqual(f['limites'], 'One limitation is the short follow-up period.')

    def test_modelo_solo_vale_con_cita_literal(self):
        from academico import ficha_con_modelo
        def generar(*_):
            return {'pregunta': {'resumen': 'Si los chatbots cambian la escritura.', 'cita': 'We investigate whether chatbots change how students write essays.'},
                    'hallazgo': {'resumen': 'Mejoran la nota.', 'cita': 'Chatbots doubled grades.'}}
        f = ficha_con_modelo(self.RESUMEN, {'proveedor': 'gemini'}, 'p', generar)
        self.assertEqual(f['pregunta'], 'Si los chatbots cambian la escritura.')
        self.assertEqual(f['hallazgo'], 'no consta'); self.assertNotIn('hallazgo', f['citas'])
        self.assertIsNone(ficha_con_modelo(self.RESUMEN, {}, 'p', lambda *_: None))

    def test_completar_sin_modelo_usa_texto_completo_de_europe_pmc(self):
        from academico import completar_ficha
        w = completar_ficha({'doi': '10.1/x', 'abstract': None}, semantic_scholar=lambda d: None, europepmc=lambda doi: (self.RESUMEN, 'One limitation is cost.', 'https://europepmc.org/article/PMC/PMC1'))
        self.assertEqual(w['abstract'], self.RESUMEN); self.assertFalse(w['ficha_basada_en_abstract'])
        self.assertEqual(w['texto_fuente'], 'texto completo (Europe PMC)'); self.assertEqual(w['url_abierta'], 'https://europepmc.org/article/PMC/PMC1')

    def test_expansion_desde_lo_guardado(self):
        import io, json
        from academico import doi_de, expandir_consultas
        self.assertEqual(doi_de('https://arxiv.org/abs/2401.12345v2'), '10.48550/arxiv.2401.12345')
        self.assertEqual(doi_de('https://doi.org/10.1000/ABC'), '10.1000/abc'); self.assertIsNone(doi_de('https://bcn.cl/x'))
        pedidos = []
        guardado = {'authorships': [{'author': {'id': 'https://openalex.org/A1'}}], 'primary_location': {'source': {'id': 'https://openalex.org/S9'}}, 'topics': [{'id': 'https://openalex.org/T5'}]}
        class R(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): pass
        def abrir(req, timeout):
            pedidos.append(req.full_url)
            datos = [guardado] if 'filter=doi' in req.full_url else [{'display_name': 'Nuevo', 'doi': 'https://doi.org/10.2/n'}, {'display_name': 'Ya guardado', 'doi': 'https://doi.org/10.1/a'}]
            return R(json.dumps({'results': datos}).encode())
        res = expandir_consultas(['10.1/a', None, '10.1/a'], '2026-05-01', abrir)
        self.assertEqual([w['titulo'] for w in res], ['Nuevo'])
        self.assertTrue(any('authorships.author.id%3AA1' in u for u in pedidos)); self.assertTrue(any('primary_location.source.id%3AS9' in u for u in pedidos)); self.assertTrue(any('topics.id%3AT5' in u for u in pedidos))
        self.assertEqual(expandir_consultas([], '2026-05-01', abrir), [])
