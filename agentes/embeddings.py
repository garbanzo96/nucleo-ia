"""Embeddings opcionales para búsqueda semántica, solo con nivel gratuito confirmado."""
import json
import math
import os
from urllib.request import Request, urlopen

import sala_api


def vector(texto):
    if sala_api.activa():  # la sala calcula el vector con su clave
        values = (sala_api.llamar({'op': 'vector', 'texto': texto[:15000]}) or {}).get('vector')
        return values if isinstance(values, list) and len(values) == 768 else None
    key = os.environ.get('GEMINI_API_KEY')
    if not key or os.environ.get('GEMINI_FREE_TIER_CONFIRMED') != 'true': return None
    payload = {'content': {'parts': [{'text': 'title: none | text: ' + texto[:15000]}]}, 'output_dimensionality': 768}
    req = Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent',
                  data=json.dumps(payload).encode(), method='POST',
                  headers={'Content-Type':'application/json','x-goog-api-key':key})
    with urlopen(req, timeout=20) as response:
        values = json.loads(response.read(300000)).get('embedding',{}).get('values')
    if not isinstance(values, list) or len(values) != 768 or any(not isinstance(x,(int,float)) or not math.isfinite(x) for x in values):
        raise ValueError('El proveedor devolvió un vector inválido')
    return values


def vectores(textos):
    """Vectores en lotes de 100 vía la sala (un pedido por lote). Fuera de Actions, uno por uno."""
    import time
    if not sala_api.activa():
        salida = []
        for t in textos:
            try: salida.append(vector(t))
            except (OSError, ValueError): salida.append(None)
        return salida
    salida = []
    for i in range(0, len(textos), 100):
        if i: time.sleep(2)  # el nivel gratuito limita pedidos por minuto
        try:
            lote = (sala_api.llamar({'op': 'vectores', 'textos': [t[:15000] for t in textos[i:i + 100]]}) or {}).get('vectores')
        except RuntimeError:
            lote = None
        lote = lote if isinstance(lote, list) and len(lote) == len(textos[i:i + 100]) else [None] * len(textos[i:i + 100])
        salida.extend(v if isinstance(v, list) and len(v) == 768 else None for v in lote)
    return salida
