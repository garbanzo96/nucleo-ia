import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import { generar } from '../_shared/modelo.ts';
import { parseJson } from '../_shared/editorial.mjs';

// Puerta del radar (GitHub Actions) a la base, sin secretos en GitHub: Actions presenta un token OIDC
// firmado por GitHub; aquí se verifica que venga de garbanzo96/nucleo-ia en main. Luego se usa la
// clave de servicio que Supabase da a la función. Solo tablas y métodos que el radar necesita.
const JWKS = createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
const PERMITIDO: Record<string, string[]> = {
  GET: ['fuentes', 'candidatos', 'config', 'prompts', 'trabajos', 'papers', 'posts'],
  POST: ['fuentes', 'candidatos', 'papers', 'trabajos'],
  PATCH: ['trabajos', 'candidatos', 'papers'],
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
    if (b.op === 'generar') {
      // IA de la sala (Gemini) para ordenar temas y completar fichas; mismo arnés que clasificar.py.
      const clave = Deno.env.get('GEMINI_API_KEY');
      if (!clave || typeof b.instrucciones !== 'string') return json({ resultado: null });
      const conf = await fetch(`${url}/rest/v1/config?clave=eq.modelos&select=valor`, { headers: { apikey: servicio, Authorization: 'Bearer ' + servicio } }).then(r => r.json());
      const modelo = conf?.[0]?.valor?.gemini?.filtrar || 'gemini-2.5-flash';
      return json({ resultado: parseJson(await generar({ clave, proveedor: 'gemini' }, modelo, b.instrucciones, JSON.stringify(b.datos ?? {}))) });
    }
    // Paso directo a PostgREST, restringido.
    const metodo = String(b.method), ruta = String(b.path || ''), tabla = ruta.split('?')[0];
    if (!PERMITIDO[metodo]?.includes(tabla) || /[\s#]/.test(ruta) || (metodo === 'PATCH' && !/[?&]id=eq\.[0-9a-f-]{36}$/.test(ruta))) return json({ error: 'Operación no permitida' }, 400);
    const headers: Record<string, string> = { apikey: servicio, Authorization: 'Bearer ' + servicio, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (typeof b.prefer === 'string' && /^[a-z=,-]+$/.test(b.prefer)) headers.Prefer = b.prefer;
    const res = await fetch(`${url}/rest/v1/${ruta}`, { method: metodo, headers, body: b.body === undefined ? undefined : JSON.stringify(b.body) });
    const texto = await res.text();
    return new Response(texto || 'null', { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return json({ error: 'La sala no pudo procesar el pedido del radar' }, 500);
  }
});
