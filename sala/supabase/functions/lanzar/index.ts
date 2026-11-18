import { cors, miembro, reply } from '../_shared/auth.ts';
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método no permitido' }, 405);
  try {
    const db = await miembro(req);
    const body = await req.json();
    if (!['noticias', 'academico', 'ambos'].includes(body.tipo) || typeof body.nombre !== 'string' || !body.nombre.trim() || body.nombre.length > 100) return reply({ error: 'Solicitud inválida' }, 400);
    const token = Deno.env.get('GITHUB_DISPATCH_TOKEN');
    if (!token) return reply({ error: 'Falta configurar el token de lanzamiento' }, 503);
    const job = await db.from('trabajos').insert({ tipo: body.tipo, solicitado_por: body.nombre.trim() }).select('id').single();
    if (job.error) throw job.error;
    const response = await fetch('https://api.github.com/repos/garbanzo96/nucleo-ia/dispatches', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'investigar', client_payload: { tipo: body.tipo, trabajo_id: job.data.id } }),
    });
    if (!response.ok) {
      await db.from('trabajos').update({ estado: 'error', detalle: 'GitHub no aceptó la solicitud', terminado_en: new Date().toISOString() }).eq('id', job.data.id);
      return reply({ error: 'GitHub no aceptó la solicitud' }, 502);
    }
    return reply({ id: job.data.id });
  } catch { return reply({ error: 'No se pudo lanzar la investigación o no hay acceso' }, 403); }
});
