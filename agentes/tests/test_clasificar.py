import unittest
from unittest.mock import patch
from clasificar import aplicar_clasificacion, generar

class Clasificacion(unittest.TestCase):
    def test_aplica_solo_respuestas_validas(self):
        items=[{'url':'https://ejemplo.test/a','titulo':'Uno','resumen':'Resumen','puntaje':4,'angulo':None,'gancho':None}]
        raw={'resultados':[{'url':items[0]['url'],'puntaje':8,'angulo':'Una tensión concreta','gancho':'Una pregunta precisa'}, {'url':'https://otro.test','puntaje':9,'angulo':'x','gancho':'y'}]}
        self.assertEqual(aplicar_clasificacion(items,raw),1)
        self.assertEqual(items[0]['puntaje'],8)
        self.assertEqual(items[0]['gancho'],'Una pregunta precisa')
    def test_sin_confirmacion_no_llama_al_proveedor(self):
        with patch.dict('os.environ', {'GEMINI_API_KEY':'clave'}, clear=True), patch('clasificar.urlopen') as request:
            self.assertIsNone(generar({'proveedor':'gemini','modelo':'gemini-2.5-flash'},'instrucciones',{}))
            request.assert_not_called()
