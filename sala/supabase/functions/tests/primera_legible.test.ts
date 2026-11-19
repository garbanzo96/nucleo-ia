// deno test --node-modules-dir=none tests/primera_legible.test.ts
import { primeraLegible } from '../_shared/redaccion.ts';
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const cargar = async (u: string) => { if (u.includes('bloquea')) throw new Error('La fuente no respondió: openai.com devolvió HTTP 403, bloquea la lectura automática'); if (u.includes('pdf')) return { requiere_lectura_humana: true }; return { titulo: u, resumen: 'texto' }; };

Deno.test('gana la primera fuente legible en el orden dado', async () => {
  const r = await primeraLegible(['https://bloquea.com/a', 'https://doc.pdf/x', 'https://medio.cl/1', 'https://otro.cl/2'], cargar);
  assert(r.url === 'https://medio.cl/1', r.url);
});
Deno.test('si ninguna se lee, explica cada motivo', async () => {
  let m = '';
  try { await primeraLegible(['https://bloquea.com/a', 'https://bloquea.org/b', 'no-es-url'], cargar); } catch (e) { m = (e as Error).message; }
  assert(m.startsWith('Ninguno de los 2 enlaces') && m.includes('HTTP 403'), m);
});
Deno.test('una sola fuente conserva su mensaje', async () => {
  let m = '';
  try { await primeraLegible(['https://bloquea.com/a', 'https://bloquea.com/a'], cargar); } catch (e) { m = (e as Error).message; }
  assert(m.startsWith('La fuente no respondió'), m);
});
