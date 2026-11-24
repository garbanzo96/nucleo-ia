import { cargarFuente, contexto, exigirTexto, instrucciones, politica } from './servicio.ts';
import { problemasBorrador, tiposGancho, TIPOS_LAMINA, evidenciaDe } from './editorial.mjs';

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

// Muchos medios bloquean la lectura automática (openai.com, Reuters, NYT): se prueban en paralelo la fuente
// y las otras notas del mismo hecho, y gana la primera legible en el orden dado.
export async function primeraLegible(lista: unknown[], cargar: (u: string) => Promise<any> = cargarFuente) {
  const urls = [...new Set(lista.filter((u): u is string => typeof u === 'string' && u.startsWith('https://') && u.length <= 500))].slice(0, 6);
  if (!urls.length) throw new Error('Falta la fuente');
  const r = await Promise.allSettled(urls.map(async u => exigirTexto(await cargar(u))));
  const i = r.findIndex(x => x.status === 'fulfilled');
  if (i >= 0) return { fuente: (r[i] as PromiseFulfilledResult<any>).value, url: urls[i] };
  const motivo = (x: PromiseSettledResult<unknown>) => (x as PromiseRejectedResult).reason?.message || 'error';
  if (urls.length === 1) throw new Error(motivo(r[0]));
  throw new Error(`Ninguno de los ${urls.length} enlaces de esta historia se pudo leer (${r.map(motivo).join('; ')}). Pega otro enlace de la misma noticia.`);
}

export async function preparar(db: any, body: any) {
  if (typeof body.fuente_primaria !== 'string' || body.fuente_primaria.length > 500) throw new Error('Falta la fuente');
  const { f, g } = await rotacionLibre(db, corto(body.formato, 80), corto(body.tipo_gancho, 80));
  const ctx = await contexto(db, f, g);
  const { fuente, url } = await primeraLegible([body.fuente_primaria, ...(Array.isArray(body.alternativas) ? body.alternativas : [])]);
  const t = body.tema && typeof body.tema === 'object' ? body.tema : {};
  const tema = { resumen: corto(t.resumen, 1500), angulo: corto(t.angulo, 500), gancho: corto(t.gancho, 300) };
  return { ctx, fuente, url, formato: f, gancho: g, tema };
}
type Prep = Awaited<ReturnType<typeof preparar>>;

export const ESQUEMA = { laminas: [{ tipo: 'gancho | hecho | contexto | dato | cita | implicancias | reflexion | limites | pregunta', titulo: '', cuerpo: '', fuente: '', alt: '' }], ganchos: [{ tipo: tiposGancho.join(' | '), texto: '' }], descripcion: '', sugerencia_imagen: { mostrar: '', busqueda: '', prompt_ia: '' } };

export function pasoBorrador({ ctx, fuente, formato, gancho, tema }: Prep): Paso {
  const esquema = ESQUEMA;
  return {
    sistema: instrucciones(ctx.prompts.redactar + '\n\n' + ctx.prompts.voz + '\n\n' + politica),
    datos: {
      fuente, formato, tipo_gancho: gancho, tema_sugerido_por_el_radar: tema,
      tipos_de_gancho_usados_hace_poco: ctx.anteriores.map((p: any) => p.tipo_gancho),
      lista_negra: ctx.config.lista_negra, ejemplos_de_voz: ctx.ejemplos, esquema,
    },
  };
}

// Algunos modelos envuelven la respuesta ({"borrador": {...}}): se desenvuelve antes de validar.
export function normalizar(r: any) {
  if (r && typeof r === 'object' && !Array.isArray(r.laminas)) { const v = Object.values(r).find((x: any) => x && typeof x === 'object' && Array.isArray(x.laminas)); if (v) r = v; }
  // Variantes frecuentes de los modelos: {tipo_gancho, gancho}, {type, text}.
  if (r && Array.isArray(r.ganchos)) r = { ...r, ganchos: r.ganchos.map((g: any) => g && typeof g === 'object' ? { tipo: g.tipo ?? g.tipo_gancho ?? g.type, texto: g.texto ?? g.gancho ?? g.text } : g) };
  // La sala espera textos en todos los campos: lo que falte queda vacío y lo marca la revisión, no la pantalla.
  const t = (x: unknown) => typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : '';
  if (r && Array.isArray(r.laminas)) r = { ...r, laminas: r.laminas.filter((l: any) => l && typeof l === 'object').slice(0, 10).map((l: any, i: number) => {
    const tipo = TIPOS_LAMINA.includes(l.tipo) ? l.tipo : i === 0 ? 'gancho' : 'contexto';
    return { tipo, titulo: t(l.titulo), cuerpo: t(l.cuerpo), fuente: t(l.fuente), alt: t(l.alt) || [t(l.titulo), t(l.cuerpo)].filter(Boolean).join('. ') };
  }) };
  return r;
}

// Paso del gancho: 6 alternativas de tipos distintos y la mejor queda en la lámina 1.
export function pasoGanchos(p: Prep, borrador: any): Paso | null {
  if (!p.ctx.prompts.ganchos || !Array.isArray(borrador?.laminas)) return null;
  return {
    sistema: instrucciones(p.ctx.prompts.ganchos + '\n\n' + politica),
    datos: { fuente: p.fuente, tipo_pedido: p.gancho, tipos: tiposGancho, usados_hace_poco: p.ctx.anteriores.map((x: any) => x.tipo_gancho), borrador: { laminas: borrador.laminas } },
  };
}
export function aplicarGanchos(p: Prep, borrador: any, r: any) {
  const recientes = new Set(p.ctx.anteriores.map((x: any) => x.tipo_gancho));
  const lista = (Array.isArray(r?.ganchos) ? r.ganchos : []).filter((g: any) => g && tiposGancho.includes(g.tipo) && !recientes.has(g.tipo) && typeof g.texto === 'string' && g.texto.trim());
  if (!lista.length || !Array.isArray(borrador?.laminas) || !borrador.laminas.length) return borrador;
  const mejor = lista[Number.isInteger(r.mejor) && r.ganchos[r.mejor] && lista.includes(r.ganchos[r.mejor]) ? lista.indexOf(r.ganchos[r.mejor]) : 0];
  const orden = [mejor, ...lista.filter((g: any) => g.tipo === p.gancho), ...lista];
  const ganchos: any[] = []; for (const g of orden) if (!ganchos.some(x => x.tipo === g.tipo)) ganchos.push({ tipo: g.tipo, texto: g.texto.trim() });
  if (ganchos.length < 3) return borrador; // mejor conservar los del borrador que quedar bajo el mínimo
  return { ...borrador, laminas: [{ ...borrador.laminas[0], titulo: mejor.texto.trim() }, ...borrador.laminas.slice(1)], ganchos: ganchos.slice(0, 5) };
}

export function problemas(p: Prep, borrador: unknown): string[] {
  return problemasBorrador(borrador, evidenciaDe(p.fuente), p.fuente.url, p.ctx.config.lista_negra, p.ctx.anteriores, p.formato, p.gancho);
}

export function pasoCorregir(p: Prep, borrador: unknown, lista: string[]): Paso {
  return {
    sistema: instrucciones(p.ctx.prompts.redactar + '\n\n' + p.ctx.prompts.voz + '\n\n' + politica +
      '\n\nAhora corriges tu propio borrador. Arregla cada problema de la lista sin introducir otros: si una cifra no está en la fuente, sácala o reemplázala por una que sí esté; si una lámina es larga, acórtala o divídela; si faltan láminas, agrégalas con contenido de la fuente; cada lámina conserva un "tipo" válido. Devuelve el borrador completo con el mismo esquema.'),
    datos: { fuente: p.fuente, formato: p.formato, tipo_gancho: p.gancho, tipos_de_gancho: tiposGancho, problemas: lista, borrador, esquema: ESQUEMA },
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
  return { borrador, formato: p.formato, tipo_gancho: p.gancho, fuente_primaria: p.url, fuente: { ...p.fuente, alcance }, revision: informe, alertas, estado: 'borrador',
    advertencia: alertas.length ? `La verificación marcó ${alertas.length} punto(s) para revisar.` : 'La verificación no encontró problemas, pero una persona debe leer la fuente antes de aprobar.' };
}

// Supabase corta cada pedido a los 150 s. El borrador es lo único obligatorio: ganchos, correcciones y verificación
// se hacen si alcanza el plazo, y lo que falte vuelve como alerta. Un borrador escrito nunca se pierde.
export const PLAZO = 130_000;
export type Correr = (paso: Paso, espera?: number, respaldo?: number) => Promise<any>;
export async function redactarCompleto(p: Prep, correr: Correr, verificador: Correr = correr, ganchador: Correr = correr, hasta = Date.now() + PLAZO, ahora = Date.now) {
  const queda = () => hasta - ahora(), valido = (b: any) => Array.isArray(b?.laminas) && b.laminas.length > 0;
  const obligatorio = async () => {
    const b = normalizar(await correr(pasoBorrador(p), Math.min(65_000, queda() * 0.6), Math.min(40_000, queda() * 0.35)));
    if (!valido(b)) throw new Error('El modelo no entregó láminas. Intenta de nuevo.');
    return b;
  };
  let borrador: any;
  // Una respuesta mal formada se pide de nuevo una vez antes de rendirse.
  try { borrador = await obligatorio(); }
  catch (e) { if (!(e instanceof Error && e.message.startsWith('El modelo no entregó')) || queda() < 45_000) throw e; borrador = await obligatorio(); }
  const extra = async (f: Correr, paso: Paso, minimo: number) => {
    if (queda() < minimo) return null;
    try { return await f(paso, Math.min(45_000, queda() * 0.6), Math.min(25_000, queda() * 0.35)); } catch { return null; }
  };
  const pg = pasoGanchos(p, borrador);
  if (pg) { const r = await extra(ganchador, pg, 45_000); if (r) borrador = aplicarGanchos(p, borrador, normalizar(r)); }
  let lista = problemas(p, borrador);
  for (let i = 0; i < MAX_CORRECCIONES && lista.length; i++) {
    const c = normalizar(await extra(correr, pasoCorregir(p, borrador, lista), 40_000));
    if (!valido(c)) break;
    const restantes = problemas(p, c);
    if (restantes.length > lista.length) break; // la corrección empeoró: queda la versión anterior
    borrador = c; lista = restantes;
  }
  const informe = await extra(verificador, pasoVerificar(p, borrador), 12_000);
  const final = cerrar(p, borrador, informe ?? { laminas: [] });
  if (informe === null) final.alertas.push('No se alcanzó a verificar contra la fuente: revisa cada dato antes de aprobar');
  if (lista.length) final.alertas.push(...lista.slice(0, 6).map(x => 'Por corregir antes de aprobar: ' + x));
  if (final.alertas.length) final.advertencia = `Borrador listo. Quedan ${final.alertas.length} punto(s) por revisar.`;
  return final;
}

// Se muestran los errores que escribe la sala (Error simple, en español, sin claves ni datos internos).
// Los de librerías, red o base de datos traen su propia clase y quedan ocultos tras el mensaje general.
export const mensajeVisible = (err: unknown, otro: string) => {
  if (err instanceof DOMException && err.name === 'TimeoutError') return 'La fuente o el servicio tardó demasiado en responder. Intenta de nuevo.';
  return err instanceof Error && err.constructor === Error && err.message ? err.message : otro;
};
