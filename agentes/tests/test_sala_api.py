import os
import unittest
from unittest import mock

import clasificar
import embeddings
import sala_api


class SalaApiTest(unittest.TestCase):
    def test_inactiva_fuera_de_actions(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertFalse(sala_api.activa())
            self.assertIsNone(clasificar.generar({'proveedor': 'sala'}, 'x', {}))

    def test_misma_interfaz_que_supabase(self):
        api = sala_api.SalaApi()
        with mock.patch.object(sala_api, 'llamar', return_value=None) as llamar:
            api.update('trabajos', 'abc', {'estado': 'en_curso'})
            api.insert('candidatos', [{'url': 'u'}], True)
            api.insert('candidatos', [])
        self.assertEqual(llamar.call_args_list[0].args[0]['path'], 'trabajos?id=eq.abc')
        self.assertEqual(llamar.call_args_list[1].args[0]['prefer'], 'resolution=ignore-duplicates,return=minimal')
        self.assertEqual(llamar.call_count, 2)

    def test_rows_pagina(self):
        lotes = [[{'id': i} for i in range(1000)], [{'id': 'x'}]]
        with mock.patch.object(sala_api, 'llamar', side_effect=lotes):
            self.assertEqual(len(sala_api.SalaApi().rows('candidatos')), 1001)

    def test_ia_y_vectores_pasan_por_la_sala(self):
        env = {'SALA_API': 'https://x.supabase.co/functions/v1/radar_api', 'ACTIONS_ID_TOKEN_REQUEST_URL': 'https://t'}
        with mock.patch.dict(os.environ, env), mock.patch.object(sala_api, 'llamar', side_effect=[{'resultado': {'resultados': []}}, {'vector': [0.1] * 768}, {'vector': [1]}]) as llamar:
            self.assertEqual(clasificar.generar({'proveedor': 'sala'}, 'P', {'a': 1}), {'resultados': []})
            self.assertEqual(len(embeddings.vector('texto')), 768)
            self.assertIsNone(embeddings.vector('vector inválido'))
        self.assertTrue(llamar.call_args_list[0].args[0]['instrucciones'].startswith('P'))


if __name__ == '__main__':
    unittest.main()
