import { cors, miembro, reply } from '../_shared/auth.ts';
import { iaDelPedido, modeloPara } from '../_shared/ia.mjs';
import { generar } from '../_shared/modelo.ts';
import { parseJson } from '../_shared/editorial.mjs';
import { lotes, guardar } from '../_shared/evaluacion.ts';
import { mensajeVisible } from '../_shared/redaccion.ts';

// Evalúa con la IA del miembro (clave en x-ia-clave) los temas que el radar recolectó sin IA.
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método no permitido' }, 405);
  let db; try { db = await miembro(req); } catch { return reply({ error: 'Sin acceso a la sala' }, 403); }
  try {
    const ia = iaDelPedido(req.headers, Deno.env.get('GEMINI_API_KEY'));
    const plan = await lotes(db);
    const modelo = modeloPara(plan.modelos, ia.proveedor, 'filtrar');
    let evaluados = 0;
    for (const l of plan.lotes) evaluados += await guardar(db, l.ids, parseJson(await generar(ia, modelo, l.sistema, JSON.stringify(l.datos))));
    return reply({ evaluados, pendientes: plan.pendientes });
  } catch (err) {
    return reply({ error: mensajeVisible(err, 'No se pudo evaluar el radar') }, 422);
  }
});
