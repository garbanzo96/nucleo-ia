import { cargarFuente, contexto, exigirTexto, instrucciones, politica } from './servicio.ts';
import { problemasBorrador, tiposGancho } from './editorial.mjs';

// Arnés de redacción: borrador (con la voz del Núcleo) → hasta dos correcciones con los problemas concretos
// que encontró el código → verificación contra la fuente, que avisa pero no bloquea. Lo usan `redactar`
// (la IA corre en el servidor) y `arnes` (la IA corre en el CLI del miembro). Mismo contenido, mismas reglas.
export type Paso = { sistema: string; datos: unknown };
export const MAX_CORRECCIONES = 2;
const corto = (x: unknown, n: number) => typeof x === 'string' ? x.trim().slice(0, n) : '';

// Si el formato o el gancho se usaron hace poco, o el formato no existe, se elige otro en vez de fallar.
async function rotacionLibre(db: any, formato: string, gancho: string) {
  const conf = await db.from('config').select('clave,valor').in('clave', ['rotacion', 'formatos']);
  if (conf.error) throw new Error('No se pudo leer la configuración');
  const c = Object.fromEntries(conf.data.map((x: any) => [x.clave, x.valor])) as any;
  const formatos: string[] = Array.isArray(c.formatos) ? c.formatos : [];
  const n = Number.isSafeInteger(c.rotacion?.ultimos) ? c.rotacion.ultimos : 0;
  const rec = n ? ((await db.from('posts').select('formato,tipo_gancho').eq('estado', 'publicado').order('publicado_en', { ascending: false }).limit(n)).data ?? []) : [];
  const usadosF = new Set(rec.map((p: any) => p.formato)), usadosG = new Set(rec.map((p: any) => p.tipo_gancho));
  const f = formatos.includes(formato) && !usadosF.has(formato) ? formato : formatos.find(x => !usadosF.has(x)) ?? formato;
  const g = tiposGancho.includes(gancho) && !usadosG.has(gancho) ? gancho : tiposGancho.find((x: string) => !usadosG.has(x)) ?? gancho;
  return { f, g };
}

export async function preparar(db: any, body: any) {
  if (typeof body.fuente_primaria !== 'string' || body.fuente_primaria.length > 500) throw new Error('Falta la fuente');
  const { f, g } = await rotacionLibre(db, corto(body.formato, 80), corto(body.tipo_gancho, 80));
  const ctx = await contexto(db, f, g);
  const fuente = exigirTexto(await cargarFuente(body.fuente_primaria));
  const t = body.tema && typeof body.tema === 'object' ? body.tema : {};
  const tema = { resumen: corto(t.resumen, 1500), angulo: corto(t.angulo, 500), gancho: corto(t.gancho, 300) };
  return { ctx, fuente, formato: f, gancho: g, tema };
}
type Prep = Awaited<ReturnType<typeof preparar>>;
const evidencia = (p: Prep) => p.fuente.titulo + ' ' + p.fuente.resumen;

export function pasoBorrador({ ctx, fuente, formato, gancho, tema }: Prep): Paso {
  const esquema = { laminas: [{ titulo: '', cuerpo: '', fuente: '', alt: '' }], ganchos: [{ tipo: '', texto: '' }], descripcion: '', sugerencia_imagen: { mostrar: '', busqueda: '', prompt_ia: '' } };
  return {
    sistema: instrucciones(ctx.prompts.redactar + '\n\n' + ctx.prompts.voz + '\n\n' + politica),
    datos: {
      fuente, formato, tipo_gancho: gancho, tema_sugerido_por_el_radar: tema,
      tipos_de_gancho_usados_hace_poco: ctx.anteriores.map((p: any) => p.tipo_gancho),
      lista_negra: ctx.config.lista_negra, ejemplos_de_voz: ctx.ejemplos, esquema,
    },
  };
}

export function problemas(p: Prep, borrador: unknown): string[] {
  return problemasBorrador(borrador, evidencia(p), p.fuente.url, p.ctx.config.lista_negra, p.ctx.anteriores, p.formato, p.gancho);
}

export function pasoCorregir(p: Prep, borrador: unknown, lista: string[]): Paso {
  return {
    sistema: instrucciones(p.ctx.prompts.redactar + '\n\n' + p.ctx.prompts.voz + '\n\n' + politica +
      '\n\nAhora corriges tu propio borrador. Arregla cada problema de la lista sin introducir otros: si una cifra no está en la fuente, sácala o reemplázala por una que sí esté; si una lámina es larga, acórtala o divídela; si faltan láminas, agrégalas con contenido de la fuente. Devuelve el borrador completo con el mismo esquema.'),
    datos: { fuente: p.fuente, formato: p.formato, tipo_gancho: p.gancho, problemas: lista, borrador },
  };
}

export function pasoVerificar(p: Prep, borrador: unknown): Paso {
  return {
    sistema: instrucciones(p.ctx.prompts.verificar + '\n' + politica + ' Responde {"laminas":[{"respaldada":true,"explicacion":"..."}],"descripcion_respaldada":true}; una entrada por lámina, en orden.'),
    datos: { fuente: p.fuente, borrador },
  };
}

// La verificación informa: las láminas sin respaldo vuelven marcadas para la revisión humana.
export function cerrar(p: Prep, borrador: any, informe: any) {
  const laminas = Array.isArray(informe?.laminas) ? informe.laminas : [];
  const alertas = laminas.map((x: any, i: number) => x?.respaldada === true ? null : `Lámina ${i + 1}: ${corto(x?.explicacion, 300) || 'revisar contra la fuente'}`).filter(Boolean);
  if (informe?.descripcion_respaldada === false) alertas.push('Descripción: revisar contra la fuente');
  const alcance = p.fuente.tipo === 'prensa' ? 'nota de prensa: si menciona un estudio o una ley, busca y cita ese original' : p.fuente.tipo === 'oficial' ? 'texto de la página' : 'resumen';
  return { borrador, formato: p.formato, tipo_gancho: p.gancho, fuente: { ...p.fuente, alcance }, revision: informe, alertas, estado: 'borrador',
    advertencia: alertas.length ? `La verificación marcó ${alertas.length} punto(s) para revisar.` : 'La verificación no encontró problemas, pero una persona debe leer la fuente antes de aprobar.' };
}

// Corre el arnés completo con una función que llama a la IA y devuelve JSON.
export async function redactarCompleto(p: Prep, correr: (paso: Paso) => Promise<any>, verificador: (paso: Paso) => Promise<any> = correr) {
  let borrador = await correr(pasoBorrador(p));
  for (let i = 0; ; i++) {
    const lista = problemas(p, borrador);
    if (!lista.length) break;
    if (i === MAX_CORRECCIONES) throw new Error('El borrador no cumplió las reglas después de dos correcciones: ' + lista.slice(0, 3).join('; '));
    borrador = await correr(pasoCorregir(p, borrador, lista));
  }
  return cerrar(p, borrador, await verificador(pasoVerificar(p, borrador)));
}

// Errores que se pueden mostrar tal cual: no contienen claves ni datos internos.
export const erroresVisibles = ['Falta la fuente', 'Falta configurar la IA', 'La clave de IA', 'La cuenta de IA', 'Tu clave de IA', 'El proveedor de IA', 'Falta configurar el modelo', 'Solo se admiten enlaces', 'El enlace debe apuntar', 'Hay publicaciones sin fecha', 'Falta aplicar la migración', 'El borrador', 'No se pudo comprobar', 'La fuente es un PDF', 'La fuente oficial', 'Destino de red', 'Tipo de contenido', 'Demasiadas redirecciones', 'El modelo no entregó', 'Lote inválido', 'No se pudo leer el radar', 'Enlace de fuente inválido', 'Redirección sin destino'];
export const mensajeVisible = (err: unknown, otro: string) => { const m = err instanceof Error ? err.message : ''; return erroresVisibles.some(s => m.startsWith(s)) ? m : otro; };
