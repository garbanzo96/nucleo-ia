import test from 'node:test';
import assert from 'node:assert/strict';
import { validarUrlOficial, leerOficial } from '../_shared/oficial.mjs';

test('la redacción acepta prensa pública, pero no destinos internos', async () => {
  assert.throws(() => validarUrlOficial('https://www.latercera.com/nota'), /Solo se admiten/);
  assert.equal(validarUrlOficial('https://www.latercera.com/nota', true).dominio, null);
  assert.throws(() => validarUrlOficial('http://www.latercera.com/nota', true), /HTTPS/);
  await assert.rejects(leerOficial('https://interno.ejemplo.cl/x', { abierta: true, resolver: async () => ['10.0.0.5'], fetcher: async () => { throw Error('no debía pedir'); } }), /no público/);
});
