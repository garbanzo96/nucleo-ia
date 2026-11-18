import test from 'node:test';
import assert from 'node:assert/strict';
import { proveedorDeClave, claveDelPedido, modeloPara, errorProveedor, validarEvaluacion } from '../_shared/ia.mjs';

test('reconoce el proveedor por la forma de la clave', () => {
  assert.equal(proveedorDeClave('sk-ant-api03-' + 'a'.repeat(40)), 'claude');
  assert.equal(proveedorDeClave('AIza' + 'b'.repeat(35)), 'gemini');
  assert.throws(() => proveedorDeClave('sk-otro-123'), /formato reconocido/);
  assert.throws(() => proveedorDeClave('sk-ant-x\nInyeccion'), /formato reconocido/);
});

test('sin cabecera de clave pide configurarla', () => {
  assert.throws(() => claveDelPedido(new Headers()), /Falta tu clave/);
  assert.equal(claveDelPedido(new Headers({ 'x-ia-clave': ' AIza' + 'c'.repeat(35) + ' ' })).proveedor, 'gemini');
});

test('el modelo sale de la configuración del proveedor del miembro', () => {
  const modelos = { claude: { redactar: 'claude-sonnet-5-5' }, gemini: { redactar: 'gemini-2.5-flash' } };
  assert.equal(modeloPara(modelos, 'claude', 'redactar'), 'claude-sonnet-5-5');
  assert.equal(modeloPara(modelos, 'gemini', 'redactar'), 'gemini-2.5-flash');
  assert.throws(() => modeloPara(modelos, 'claude', 'voz'), /Falta configurar/);
  assert.throws(() => modeloPara({ claude: { voz: 'gemini-2.5-flash' } }, 'claude', 'voz'), /Falta configurar/);
});

test('los errores del proveedor no exponen detalles', () => {
  assert.match(errorProveedor(401), /no fue aceptada/);
  assert.match(errorProveedor(429), /límite/);
  assert.match(errorProveedor(500), /no respondió/);
});

test('la evaluación solo acepta puntajes y textos válidos de candidatos pedidos', () => {
  const candidatos = [{ id: '1', url: 'https://a.cl/x' }, { id: '2', url: 'https://b.cl/y' }];
  const r = validarEvaluacion(candidatos, { resultados: [
    { url: 'https://a.cl/x', puntaje: 7.26, angulo: 'Ángulo', gancho: 'Gancho' },
    { url: 'https://a.cl/x', puntaje: 9, angulo: 'Repetido', gancho: 'Repetido' },
    { url: 'https://b.cl/y', puntaje: 11, angulo: 'Fuera de rango', gancho: 'x' },
    { url: 'https://c.cl/z', puntaje: 5, angulo: 'No pedido', gancho: 'x' },
    { url: 'https://b.cl/y', puntaje: 5, angulo: 'Ver https://spam.cl', gancho: 'x' },
  ] });
  assert.deepEqual(r, [{ id: '1', puntaje: 7.3, angulo: 'Ángulo', gancho: 'Gancho' }]);
  assert.deepEqual(validarEvaluacion(candidatos, null), []);
});
