import assert from 'node:assert/strict';
import { redactarCompleto, normalizar, mensajeVisible } from '../_shared/redaccion.ts';
import { tiposGancho } from '../_shared/editorial.mjs';

const p: any = { ctx: { prompts: { redactar: 'r', voz: 'v', verificar: 'x', ganchos: 'g' }, anteriores: [], ejemplos: [], config: { lista_negra: [] } }, formato: 'noticia explicada', gancho: tiposGancho[0], tema: {}, url: 'https://x.cl/a',
  fuente: { titulo: 'Senado discute ley', resumen: 'El Senado revisa una ley.', fecha: '2026-11-18', url: 'https://x.cl/a', tipo: 'prensa' } };
const bueno = () => ({ laminas: Array.from({ length: 6 }, (_, i) => ({ tipo: i ? 'hecho' : 'gancho', titulo: 'El Senado revisa una ley', cuerpo: '', fuente: 'Senado, 2026', alt: 'a' })), ganchos: tiposGancho.slice(0, 3).map((tipo: string) => ({ tipo, texto: 'El Senado revisa una ley' })), descripcion: 'El Senado revisa una ley.', sugerencia_imagen: { mostrar: 'a', busqueda: 'b', prompt_ia: 'c' } });
const informe = { laminas: Array.from({ length: 6 }, () => ({ respaldada: true, explicacion: 'ok' })), descripcion_respaldada: true };
const esVerificar = (paso: any) => !paso.datos.esquema && paso.datos.borrador && !paso.datos.tipos;

Deno.test('camino normal: sin alertas y cada llamada lleva plazo', async () => {
  const esperas: number[] = [];
  const r = await redactarCompleto(p, async (paso, e) => { esperas.push(e!); return esVerificar(paso) ? informe : paso.datos && (paso.datos as any).tipos ? {} : bueno(); });
  assert.deepEqual(r.alertas, []); assert.equal(r.borrador.laminas.length, 6); assert.ok(esperas.every(e => e > 0 && e <= 65_000));
});
Deno.test('una cifra sin respaldo que no se corrige llega como alerta, no como error', async () => {
  const malo = bueno(); malo.laminas[3].cuerpo = 'Afecta a 300 personas';
  const r = await redactarCompleto(p, async paso => esVerificar(paso) ? informe : malo);
  assert.equal(r.borrador.laminas[3].cuerpo, 'Afecta a 300 personas'); assert.match(r.alertas.join(), /Lámina 4: .*300/);
});
Deno.test('si se acaba el plazo después del borrador, se entrega igual y avisa', async () => {
  let t = 0, llamadas = 0;
  const r = await redactarCompleto(p, async () => { llamadas++; t += 125_000; return bueno(); }, undefined, undefined, 130_000, () => t);
  assert.equal(llamadas, 1); assert.equal(r.borrador.laminas.length, 6); assert.match(r.alertas.join(), /No se alcanzó a verificar/);
});
Deno.test('si ganchos, corrección y verificación fallan por límite de la IA, el borrador queda', async () => {
  let n = 0; const malo = bueno(); malo.laminas[1].cuerpo = 'Son 77';
  const r = await redactarCompleto(p, async () => { if (n++) throw new Error('La cuenta de IA alcanzó su límite de uso'); return malo; });
  assert.equal(r.borrador.laminas.length, 6); assert.match(r.alertas.join(), /77/);
});
Deno.test('una corrección peor no reemplaza el borrador', async () => {
  const malo = bueno(); malo.laminas[1].cuerpo = 'Son 77'; const peor = bueno(); peor.laminas.forEach(l => l.cuerpo = 'Son 99');
  const r = await redactarCompleto(p, async paso => esVerificar(paso) ? informe : (paso.datos as any).problemas ? peor : malo);
  assert.equal(r.borrador.laminas[0].cuerpo, '');
});
Deno.test('respuesta sin láminas: reintenta una vez y si no, error claro', async () => {
  let n = 0; await assert.rejects(redactarCompleto(p, async () => { n++; return { hola: 1 }; }), /no entregó láminas/); assert.equal(n, 2);
});
Deno.test('normalizar completa campos que faltan y descarta basura', () => {
  const r = normalizar({ borrador: { laminas: [{ titulo: 'Hola', cuerpo: 5 }, null, { cuerpo: 'x', tipo: 'raro' }] } });
  assert.deepEqual(r.laminas, [{ tipo: 'gancho', titulo: 'Hola', cuerpo: '5', fuente: '', alt: 'Hola. 5' }, { tipo: 'contexto', titulo: '', cuerpo: 'x', fuente: '', alt: 'x' }]);
});
Deno.test('solo se muestran los errores propios de la sala', () => {
  assert.equal(mensajeVisible(new Error('La fuente no respondió'), 'otro'), 'La fuente no respondió');
  assert.equal(mensajeVisible(new TypeError('fetch https://host/secreto'), 'otro'), 'otro');
  assert.equal(mensajeVisible({ message: 'duplicate key' }, 'otro'), 'otro');
});
