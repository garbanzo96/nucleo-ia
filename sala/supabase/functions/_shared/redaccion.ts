import { cargarFuente, contexto, exigirTexto, instrucciones, politica } from './servicio.ts';
import { validarBorrador, validarVerificacion } from './editorial.mjs';

// Arnés de redacción en tres pasos (borrador → voz → verificación). Lo usan `redactar` (IA llamada desde
// el servidor con la clave del miembro) y `arnes` (IA ejecutada en el CLI del miembro). Mismo contenido, mismas reglas.
export type Paso = { sistema: string; datos: unknown };

export async function preparar(db: any, body: any) {
  if (typeof body.fuente_primaria !== 'string' || body.fuente_primaria.length > 500 || typeof body.formato !== 'string' || typeof body.tipo_gancho !== 'string') throw new Error('Faltan fuente, formato o tipo de gancho');
  const ctx = await contexto(db, body.formato, body.tipo_gancho);
  const fuente = exigirTexto(await cargarFuente(body.fuente_primaria));
  return { ctx, fuente, formato: body.formato as string, gancho: body.tipo_gancho as string };
}
type Prep = Awaited<ReturnType<typeof preparar>>;

export function pasoBorrador({ ctx, fuente, formato, gancho }: Prep): Paso {
  const esquema = { laminas: [{ titulo: '', cuerpo: '', fuente: '', alt: '' }], ganchos: [{ tipo: '', texto: '' }], descripcion: '', sugerencia_imagen: { mostrar: '', terminos: '', donde: '', licencia: '' } };
  return {
    sistema: instrucciones(ctx.prompts.redactar + '\n' + politica),
    datos: { fuente, formato, tipo_gancho: gancho, tipos_recientes: ctx.anteriores.map((p: any) => p.tipo_gancho), esquema, limites: '6 a 10 láminas, 3 a 5 ganchos de tipos distintos, máximo 40 palabras por lámina y máximo 12 palabras en el primer título. La penúltima lámina explica límites. La descripción no contiene enlaces adicionales ni DOI.' },
  };
}

export function pasoVoz({ ctx, fuente }: Prep, borrador: unknown): Paso {
  return {
    sistema: instrucciones(ctx.prompts.voz + '\n' + politica + ' Conserva la estructura JSON, no incorpores hechos ni cifras y compara el gancho y estructura con los ejemplos para evitar repeticiones.'),
    datos: { fuente, borrador, lista_negra: ctx.config.lista_negra, ejemplos_voz: ctx.ejemplos },
  };
}

// Valida el borrador corregido antes de verificarlo.
export function pasoVerificar({ ctx, fuente, formato, gancho }: Prep, corregido: any): Paso {
  validarBorrador(corregido, fuente.titulo + ' ' + fuente.resumen, fuente.url, ctx.config.lista_negra, ctx.anteriores, formato, gancho);
  return {
    sistema: instrucciones(ctx.prompts.verificar + '\n' + politica + ' Responde {"laminas":[{"respaldada":true,"explicacion":"..."}],"descripcion_respaldada":true}; una entrada por lámina en orden. Si cualquier afirmación carece de apoyo, usa false.'),
    datos: { fuente, borrador: corregido },
  };
}

export function cerrar({ fuente }: Prep, corregido: any, informe: unknown) {
  validarVerificacion(informe, corregido.laminas.length);
  return { borrador: corregido, fuente: { ...fuente, alcance: fuente.tipo === 'oficial' ? 'texto de la página' : 'resumen' }, revision: informe, estado: 'borrador', advertencia: 'La revisión automática puede equivocarse. Una persona debe leer la fuente y verificar cada afirmación y cifra antes de aprobar.' };
}

// Errores que se pueden mostrar tal cual: no contienen claves ni datos internos.
export const erroresVisibles = ['Faltan fuente', 'Falta configurar la IA', 'La clave de IA', 'La cuenta de IA', 'Tu clave de IA', 'El proveedor de IA', 'Falta configurar el modelo', 'Solo se admiten enlaces', 'El enlace debe apuntar', 'El formato o el gancho', 'Hay publicaciones sin fecha', 'Falta aplicar la migración', 'La segunda pasada', 'El borrador', 'Una lámina', 'Los ganchos', 'Falta el tipo', 'Formato usado', 'Hay una cifra', 'El texto contiene', 'El texto incumple', 'La fuente no encontró', 'El resumen de la fuente', 'No se pudo comprobar', 'La fuente es un PDF', 'La fuente oficial', 'Destino de red', 'Tipo de contenido', 'Demasiadas redirecciones', 'El modelo no entregó', 'Lote inválido', 'No se pudo leer el radar'];
export const mensajeVisible = (err: unknown, otro: string) => { const m = err instanceof Error ? err.message : ''; return erroresVisibles.some(s => m.startsWith(s)) ? m : otro; };
