import unittest
from datetime import datetime, timezone
from unittest import mock

import ejecutar


class DbFalsa:
    def __init__(self):
        ahora = datetime.now(timezone.utc).isoformat()
        self.tablas = {
            'prompts': [{'agente': 'mesa', 'contenido': 'M', 'activa': True}, {'agente': 'radar_noticias', 'contenido': 'F', 'activa': True}],
            'fuentes': [{'id': 'a', 'nombre': 'Medio A'}, {'id': 'b', 'nombre': 'Medio B'}],
            'candidatos': [
                {'id': 'c1', 'titulo': 'EU fines X', 'resumen': 'r', 'url': 'https://a/1', 'fuente_id': 'a', 'fuente_primaria': None, 'historia_id': None, 'estado': 'nuevo', 'creado_en': ahora},
                {'id': 'c2', 'titulo': 'La UE multa a X', 'resumen': 'r', 'url': 'https://b/2', 'fuente_id': 'b', 'fuente_primaria': 'https://eur-lex.europa.eu/x', 'historia_id': None, 'estado': 'nuevo', 'creado_en': ahora},
                {'id': 'c3', 'titulo': 'Nota vieja', 'resumen': 'r', 'url': 'https://a/3', 'fuente_id': 'a', 'fuente_primaria': None, 'historia_id': None, 'estado': 'nuevo', 'creado_en': '2020-01-01T00:00:00+00:00'},
            ],
            'historias': [],
        }
        self.actualizados = []

    def rows(self, tabla, select='*'):
        return self.tablas[tabla]

    def request(self, metodo, tabla, fila, prefer=None):
        self.tablas[tabla].append({**fila, 'id': 'h-1'})
        return [{'id': 'h-1'}]

    def update(self, tabla, fila_id, valores):
        self.actualizados.append((tabla, fila_id, valores))


class MesaTest(unittest.TestCase):
    def test_agrupa_ficha_y_cobertura(self):
        db = DbFalsa()
        respuestas = [
            {'historias': [{'notas': ['n0', 'n1', 'n9'], 'titulo': 'La UE multa a X', 'por_que': 'Primera multa', 'categoria': 'regulacion', 'nivel': 'global'}]},
            {'historias': [{'id': 'h0', 'resumen': 'Según la UE…', 'angulo': 'Qué cambia', 'gancho': 'La primera multa', 'tipo_gancho': 'qué cambió con una norma', 'formato': 'norma en claro', 'confianza': 'alta', 'puntaje': 8.24}]},
        ]
        with mock.patch.object(ejecutar.sala_api, 'activa', return_value=True), mock.patch.object(ejecutar.clasificar, 'generar', side_effect=respuestas) as gen:
            resultado = ejecutar.mesa_de_edicion(db)
        self.assertIn('1 historias', resultado)
        h = db.tablas['historias'][0]
        self.assertEqual(h['cobertura'], 2)
        self.assertEqual(h['fuente_url'], 'https://eur-lex.europa.eu/x')
        self.assertEqual(h['puntaje'], 8.2)
        self.assertEqual(h['resumen'], 'Según la UE…')
        self.assertEqual([n['medio'] for n in h['notas']], ['Medio A', 'Medio B'])
        self.assertEqual({a[1] for a in db.actualizados}, {'c1', 'c2'})
        self.assertEqual(len(gen.call_args_list[0].args[2]['notas']), 2)  # la nota vieja no entra

    def test_sin_respuesta_de_la_mesa_no_crea_nada(self):
        db = DbFalsa()
        with mock.patch.object(ejecutar.sala_api, 'activa', return_value=True), mock.patch.object(ejecutar.clasificar, 'generar', return_value=None):
            ejecutar.mesa_de_edicion(db)
        self.assertEqual(db.tablas['historias'], [])


    def test_filtro_de_ia(self):
        self.assertTrue(ejecutar.trata_de_ia('Senado aprueba ley de inteligencia artificial'))
        self.assertTrue(ejecutar.trata_de_ia('OpenAI firma acuerdo con el Ministerio'))
        self.assertTrue(ejecutar.trata_de_ia('La IA en las aulas chilenas'))
        self.assertFalse(ejecutar.trata_de_ia('Dólar sobre los $1.000 preocupa a exportadores'))
        self.assertFalse(ejecutar.trata_de_ia('Hidratación: claves para el verano'))  # "IA" dentro de palabra no cuenta

if __name__ == '__main__':
    unittest.main()
