import { cors, miembro, reply } from '../_shared/auth.ts';
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método no permitido' }, 405);
  try {
    const db = await miembro(req);
    const { consulta } = await req.json();
    if (typeof consulta !== 'string' || !consulta.trim() || consulta.length > 1000) return reply({ error: 'Consulta inválida' }, 400);
    const key = Deno.env.get('GEMINI_API_KEY');
    if (Deno.env.get('GEMINI_FREE_TIER_CONFIRMED') !== 'true') return reply({ error: 'Falta confirmar el nivel gratuito de Gemini' }, 503);
    if (!key) return reply({ error: 'Falta configurar Gemini' }, 503);
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ content: { parts: [{ text: `task: search result | query: ${consulta}` }] }, output_dimensionality: 768 }),
    });
    if (!response.ok) return reply({ error: 'No se pudo calcular la búsqueda' }, 502);
    const json = await response.json();
    if (!Array.isArray(json.embedding?.values) || json.embedding.values.length !== 768) return reply({ error: 'El vector recibido es inválido' }, 502);
    const results = await db.rpc('buscar_similares', { consulta_vector: json.embedding.values });
    if (results.error) return reply({ error: 'No se pudo consultar la biblioteca' }, 500);
    return reply({ resultados: results.data });
  } catch { return reply({ error: 'No se pudo buscar o no hay acceso' }, 403); }
});
