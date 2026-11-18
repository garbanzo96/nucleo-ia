import unittest
from nucleo import deduplicar, resolver_primaria, validar_rotacion, validar_publicacion

class Reglas(unittest.TestCase):
    def test_fuente_primaria_debe_existir(self):
        html = '<a href="https://doi.org/10.1000/xyz">paper</a>'
        self.assertEqual(resolver_primaria('https://noticias.test/a', html, lambda url: 'doi.org' in url), 'https://doi.org/10.1000/xyz')
        self.assertIsNone(resolver_primaria('https://noticias.test/a', html, lambda url: False))
        self.assertIsNone(resolver_primaria('https://evil-doi.org/x', '', lambda url: True))
    def test_deduplica_tracking_y_vistos(self):
        items = [{'url':'https://test.cl/a?utm_source=x'}, {'url':'https://test.cl/a'}, {'url':'https://test.cl/b'}]
        self.assertEqual(deduplicar(items, ['https://test.cl/b#parte']), [{'url':'https://test.cl/a'}])
    def test_rotacion(self):
        anteriores = [{'formato':'historia','tipo_gancho':'cifra'}]
        with self.assertRaises(ValueError): validar_rotacion('historia','pregunta',anteriores,1)
        with self.assertRaises(ValueError): validar_rotacion('norma','cifra',anteriores,1)
        validar_rotacion('norma','pregunta',anteriores,1)
    def test_publicacion(self):
        post = {'estado':'aprobado','aprobado_por':'Ana','fuente_primaria':'https://doi.org/x', 'laminas':[], 'checklist': dict.fromkeys(('fuente_leida','cifras_verificadas','permiso_imagen','credito_imagen','sin_marcadores'), True)}
        post['laminas'] = [{'titulo': 'Un resultado', 'texto': 'Una idea'}]
        validar_publicacion(post)
        for key in post['checklist']:
            post['checklist'][key] = False
            with self.assertRaises(ValueError): validar_publicacion(post)
            post['checklist'][key] = True
        post['descripcion'] = '[pendiente]'
        with self.assertRaises(ValueError): validar_publicacion(post)

if __name__ == '__main__': unittest.main()
