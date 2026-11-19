import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import { generar } from '../_shared/modelo.ts';
import { parseJson } from '../_shared/editorial.mjs';

// Puerta del radar (GitHub Actions) a la base, sin secretos en GitHub: Actions presenta un token OIDC
// firmado por GitHub; aquí se verifica que venga de garbanzo96/nucleo-ia en main. Luego se usa la
// clave de servicio que Supabase da a la función. Solo tablas y métodos que el radar necesita.
const JWKS = createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
const PERMITIDO: Record<string, string[]> = {
  GET: ['fuentes', 'candidatos', 'config', 'prompts', 'trabajos', 'papers', 'posts', 'historias'],
  POST: ['fuentes', 'candidatos', 'papers', 'trabajos', 'historias'],
  PATCH: ['trabajos', 'candidatos', 'papers', 'historias'],
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

async function desdeGithub(req: Request) {
  const token = req.headers.get('x-github-oidc') || '';
  const { payload } = await jwtVerify(token, JWKS, { issuer: 'https://token.actions.githubusercontent.com', audience: 'nucleo-sala' });
  if (payload.repository !== 'garbanzo96/nucleo-ia' || payload.ref !== 'refs/heads/main') throw new Error('origen');
}

async function vector(texto: string) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') || '' },
    body: JSON.stringify({ content: { parts: [{ text: 'title: none | text: ' + texto.slice(0, 15000) }] }, output_dimensionality: 768 }),
  });
  const valores = res.ok ? (await res.json()).embedding?.values : null;
  return Array.isArray(valores) && valores.length === 768 ? valores : null;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  try { await desdeGithub(req); } catch { return json({ error: 'Origen no autorizado' }, 403); }
  const url = Deno.env.get('SUPABASE_URL')!, servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  try {
    const b = await req.json();
    if (b.op === 'vector') {
      if (!Deno.env.get('GEMINI_API_KEY') || typeof b.texto !== 'string') return json({ vector: null });
      return json({ vector: await vector(b.texto) });
    }
    if (b.op === 'vectores') {
      // Hasta 100 textos por pedido: el nivel gratuito limita pedidos por minuto, no textos por pedido.
      if (!Deno.env.get('GEMINI_API_KEY') || !Array.isArray(b.textos) || b.textos.length > 100 || !b.textos.every((t: unknown) => typeof t === 'string')) return json({ vectores: null });
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')! },
        body: JSON.stringify({ requests: b.textos.map((t: string) => ({ model: 'models/gemini-embedding-2', content: { parts: [{ text: 'title: none | text: ' + t.slice(0, 15000) }] }, output_dimensionality: 768 })) }),
      });
      const lista = res.ok ? (await res.json()).embeddings : null;
      return json({ vectores: Array.isArray(lista) ? lista.map((e: any) => Array.isArray(e?.values) && e.values.length === 768 ? e.values : null) : null, status: res.status });
    }
    if (b.op === 'generar') {
      // IA de la sala (Gemini) para ordenar temas y completar fichas; mismo arnés que clasificar.py.
      const clave = Deno.env.get('GEMINI_API_KEY');
      if (!clave || typeof b.instrucciones !== 'string') return json({ resultado: null });
      const conf = await fetch(`${url}/rest/v1/config?clave=eq.modelos&select=valor`, { headers: { apikey: servicio, Authorization: 'Bearer ' + servicio } }).then(r => r.json());
      // Fichas con el modelo de ganchos (mejor escritura); mesa y fusión con el rápido.
      const g = conf?.[0]?.valor?.gemini || {};
      const modelo = (b.tarea === 'fichas' ? g.ganchos || g.redactar : g.filtrar) || 'gemini-3.1-flash-lite';
      try {
        return json({ resultado: parseJson(await generar({ clave, proveedor: 'gemini' }, modelo, b.instrucciones, JSON.stringify(b.datos ?? {}), 130000)) });
      } catch (err) {
        // Mensajes de errorProveedor o de parseJson: no incluyen la clave.
        return json({ error: (err instanceof Error ? err.message : 'Error de IA') + ' · modelo ' + modelo }, 502);
      }
    }
    // Paso directo a PostgREST, restringido.
    const metodo = String(b.method), ruta = String(b.path || ''), tabla = ruta.split('?')[0];
    if (!PERMITIDO[metodo]?.includes(tabla) || /[\s#]/.test(ruta) || (metodo === 'PATCH' && !/[?&]id=eq\.[0-9a-f-]{36}$/.test(ruta))) return json({ error: 'Operación no permitida' }, 400);
    const headers: Record<string, string> = { apikey: servicio, Authorization: 'Bearer ' + servicio, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (typeof b.prefer === 'string' && /^[a-z=,-]+$/.test(b.prefer)) headers.Prefer = b.prefer;
    const res = await fetch(`${url}/rest/v1/${ruta}`, { method: metodo, headers, body: b.body == null || metodo === 'GET' ? undefined : JSON.stringify(b.body) });
    const texto = await res.text();
    // 204 no admite cuerpo: PostgREST lo usa en PATCH con return=minimal.
    if (res.status === 204) return new Response(null, { status: 204 });
    return new Response(texto || 'null', { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return json({ error: 'La sala no pudo procesar el pedido del radar' }, 500);
  }
});
