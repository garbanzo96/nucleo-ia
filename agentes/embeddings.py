"""Embeddings opcionales para búsqueda semántica, solo con nivel gratuito confirmado."""
import json
import math
import os
from urllib.request import Request, urlopen


def vector(texto):
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
