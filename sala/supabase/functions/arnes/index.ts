import { cors, miembro, reply } from '../_shared/auth.ts';
import { parseJson, tiposGancho } from '../_shared/editorial.mjs';
import { lotes, guardar } from '../_shared/evaluacion.ts';
import { preparar, pasoBorrador, pasoCorregir, pasoVerificar, pasoGanchos, aplicarGanchos, normalizar, problemas, cerrar, mensajeVisible } from '../_shared/redaccion.ts';

// Modo CLI: la sala entrega cada paso (instrucciones de sistema + datos) y valida lo que vuelve;
// el modelo corre en el computador del miembro (Claude Code o Codex con su suscripción).
// Es el mismo arnés que usan `redactar` y `evaluar`; nada de esto ve claves de IA.
// Sin estado: cada paso se recalcula desde la base y la fuente, y las validaciones corren aquí.
const texto = (x: unknown) => typeof x === 'string' ? parseJson(x) : x;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método no permitido' }, 405);
  let db; try { db = await miembro(req); } catch { return reply({ error: 'Sin acceso a la sala' }, 403); }
  try {
    const b = await req.json();
    if (b.tarea === 'opciones') {
      const { data, error } = await db.from('config').select('valor').eq('clave', 'formatos').single();
      if (error) throw new Error('No se pudo leer el radar');
      return reply({ formatos: data.valor, ganchos: tiposGancho });
    }
    if (b.tarea === 'evaluar') {
      if (b.paso === 'lotes') { const { lotes: l, pendientes } = await lotes(db); return reply({ lotes: l, pendientes }); }
      if (b.paso === 'guardar') return reply({ evaluados: await guardar(db, b.ids, texto(b.respuesta)) });
    }
    if (b.tarea === 'redactar') {
      // El CLI pide el borrador, luego "revisar" (devuelve los problemas y el paso de corrección, o nada),
      // luego "verificar" y "cerrar". Cada paso se recalcula aquí: el cliente no puede saltarse las reglas.
      const prep = await preparar(db, b);
      if (b.paso === 'borrador') return reply({ paso: pasoBorrador(prep), formato: prep.formato, tipo_gancho: prep.gancho });
      if (b.paso === 'ganchos') return reply({ paso: pasoGanchos(prep, normalizar(texto(b.borrador))) });
      if (b.paso === 'aplicar_ganchos') return reply({ borrador: aplicarGanchos(prep, normalizar(texto(b.borrador)), texto(b.respuesta)) });
      if (b.paso === 'revisar') { const bo = texto(b.borrador), l = problemas(prep, bo); return reply({ problemas: l, paso: l.length ? pasoCorregir(prep, bo, l) : null }); }
      if (b.paso === 'verificar') { const bo = texto(b.borrador); if (problemas(prep, bo).length) throw new Error('El borrador todavía no cumple las reglas'); return reply({ paso: pasoVerificar(prep, bo) }); }
      if (b.paso === 'cerrar') { const bo = texto(b.borrador); if (problemas(prep, bo).length) throw new Error('El borrador todavía no cumple las reglas'); return reply(cerrar(prep, bo, texto(b.informe))); }
    }
    return reply({ error: 'Tarea o paso desconocido' }, 400);
  } catch (err) {
    return reply({ error: mensajeVisible(err, 'La sala no pudo procesar el paso') }, 422);
  }
});
