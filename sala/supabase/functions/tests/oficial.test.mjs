import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarUrlOficial, ipPublica, leerOficial, fuenteOficial, textoHtml} from '../_shared/oficial.mjs';

const publico = async () => ['200.10.20.30'];
const html = '<html><head><title>Ley 21.719</title><meta name="DC.date" content="2024/12/13"><script>alert(1)</script></head><body><nav>Menú</nav><main><h1>Ley 21.719</h1><p>Regula la protección de datos personales.</p><p>' + 'Artículo 1. Texto de la ley. '.repeat(10) + '</p></main><footer>Pie</footer></body></html>';
function respuesta(status, headers = {}, cuerpo = '') {
  return new Response(status >= 300 && status < 400 ? null : cuerpo, {status, headers});
}

test('solo HTTPS, sin credenciales ni puertos, y host exacto o subdominio de la lista', () => {
  for (const ok of ['https://www.bcn.cl/leychile/navegar?idNorma=1', 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj', 'https://www.planalto.gov.br/x', 'https://oecd.ai/en/'])
    assert.ok(validarUrlOficial(ok).dominio, ok);
  for (const malo of ['http://www.bcn.cl/', 'https://bcn.cl.evil.com/', 'https://evilbcn.cl/', 'https://usuario:clave@bcn.cl/', 'https://bcn.cl:8443/',
    'https://200.10.20.30/', 'https://example.com/', 'https://doi.org/10.1/x', 'https://arxiv.org/abs/2401.00001', 'file:///etc/passwd', 'no es url'])
    assert.throws(() => validarUrlOficial(malo), malo);
});

test('rechaza IP privadas, locales y reservadas en IPv4 e IPv6', () => {
  for (const ip of ['8.8.8.8', '200.10.20.30', '2001:4860:4860::8888', '2a00:1450:4001::1']) assert.equal(ipPublica(ip), true, ip);
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', '2001:db8::1', '2002:7f00:1::1', '2001::1', '300.1.1.1', 'abc'])
    assert.equal(ipPublica(ip), false, ip);
});

test('si el DNS entrega una sola IP privada no se conecta', async () => {
  let llamadas = 0; const fetcher = async () => { llamadas++; return respuesta(200, {'content-type': 'text/html'}, html) };
  await assert.rejects(leerOficial('https://www.bcn.cl/a', {fetcher, resolver: async () => ['200.10.20.30', '10.0.0.5']}), /no público/);
  await assert.rejects(leerOficial('https://www.bcn.cl/a', {fetcher, resolver: async () => []}), /no público/);
  assert.equal(llamadas, 0);
});

test('revalida cada redirección y corta en el tope', async () => {
  const pedidos = [];
  const ir = destino => async url => { pedidos.push(url); return respuesta(302, {location: destino}) };
  await assert.rejects(leerOficial('https://www.bcn.cl/a', {fetcher: ir('https://evil.test/'), resolver: publico}), /Solo se admiten/);
  await assert.rejects(leerOficial('https://www.bcn.cl/a', {fetcher: ir('http://www.bcn.cl/b'), resolver: publico}), /HTTPS/);
  const interno = async h => h === 'interno.senado.cl' ? ['127.0.0.1'] : ['200.10.20.30'];
  await assert.rejects(leerOficial('https://www.bcn.cl/a', {fetcher: ir('https://interno.senado.cl/'), resolver: interno}), /no público/);
  await assert.rejects(leerOficial('https://www.bcn.cl/a', {fetcher: ir('/otra'), resolver: publico, saltos: 3}), /Demasiadas redirecciones/);
  assert.equal(pedidos.at(-1), 'https://www.bcn.cl/otra');
  const final = await leerOficial('https://bcn.cl/a', {resolver: publico, fetcher: async url => url === 'https://bcn.cl/a' ? respuesta(301, {location: 'https://www.bcn.cl/b'}) : respuesta(200, {'content-type': 'text/html; charset=utf-8'}, html)});
  assert.equal(final.url, 'https://www.bcn.cl/b');
});

test('exige tipo de contenido admitido y tope de tamaño', async () => {
  await assert.rejects(leerOficial('https://www.bcn.cl/a', {resolver: publico, fetcher: async () => respuesta(200, {'content-type': 'image/png'}, 'x')}), /Tipo de contenido/);
  await assert.rejects(leerOficial('https://www.bcn.cl/a', {resolver: publico, fetcher: async () => respuesta(200, {'content-type': 'text/html'}, 'x'.repeat(5000)), limite: 1000}), /demasiado grande/);
  await assert.rejects(leerOficial('https://www.bcn.cl/a', {resolver: publico, fetcher: async () => respuesta(404, {'content-type': 'text/html'}, 'no')}), /no respondió/);
});

test('extrae texto de HTML y deja el PDF para lectura humana', async () => {
  const d = textoHtml(html);
  assert.equal(d.titulo, 'Ley 21.719'); assert.equal(d.fecha, '2024-12-13');
  assert.match(d.texto, /protección de datos/); assert.doesNotMatch(d.texto, /alert|Menú|Pie/);
  const f = await fuenteOficial('https://www.bcn.cl/leychile/navegar?idNorma=1', {resolver: publico, fetcher: async () => respuesta(200, {'content-type': 'text/html'}, html)});
  assert.deepEqual([f.tipo, f.origen, f.autores, f.doi], ['oficial', 'Biblioteca del Congreso Nacional de Chile', ['Biblioteca del Congreso Nacional de Chile'], null]);
  const pdf = await fuenteOficial('https://www.boe.es/doc/ley%2010.pdf', {resolver: publico, fetcher: async () => respuesta(200, {'content-type': 'application/pdf'}, '%PDF-1.7')});
  assert.equal(pdf.requiere_lectura_humana, true); assert.equal(pdf.resumen, ''); assert.equal(pdf.titulo, 'ley 10.pdf');
  await assert.rejects(fuenteOficial('https://www.bcn.cl/x', {resolver: publico, fetcher: async () => respuesta(200, {'content-type': 'text/html'}, '<title>Vacía</title><div id="app"></div>')}), /texto legible/);
});
