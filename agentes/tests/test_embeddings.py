import unittest
from unittest.mock import patch
from embeddings import vector

class Embeddings(unittest.TestCase):
    def test_no_genera_si_no_hay_confirmacion_de_nivel_gratuito(self):
        with patch.dict('os.environ', {'GEMINI_API_KEY':'key'}, clear=True), patch('embeddings.urlopen') as request:
            self.assertIsNone(vector('Prueba'))
            request.assert_not_called()
    def test_dimensiones_y_clave_en_header(self):
        class Respuesta:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self, _limit=-1): return ('{"embedding":{"values":['+','.join(['0.1']*768)+']}}').encode()
        with patch.dict('os.environ', {'GEMINI_API_KEY':'key','GEMINI_FREE_TIER_CONFIRMED':'true'}, clear=True), patch('embeddings.urlopen',return_value=Respuesta()) as request:
            self.assertEqual(len(vector('Prueba')),768)
            req=request.call_args.args[0]
            self.assertNotIn('key',req.full_url)
            self.assertEqual(req.get_header('X-goog-api-key'),'key')

class Indexacion(unittest.TestCase):
    def test_indexa_solo_filas_sin_vector_y_sin_revelar_credenciales(self):
        from ejecutar import indexar_pendientes
        class DB:
            def __init__(self): self.cambios=[]
            def rows(self, tabla, select='*'):
                return [{'id':'1','titulo':'Título','resumen':'Resumen','embedding':None}, {'id':'2','titulo':'Ya indexado','embedding':[0.1]}] if tabla=='candidatos' else []
            def update(self, tabla, fila_id, values): self.cambios.append((tabla,fila_id,values))
        db=DB()
        with patch('ejecutar.embeddings.vector',return_value=[0.2]*768):
            count=indexar_pendientes(db,limite=1)
        self.assertEqual(count,1)
        self.assertEqual(db.cambios[0][1],'1')
