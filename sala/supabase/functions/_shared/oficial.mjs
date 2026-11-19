// Lectura de leyes, organismos y documentos oficiales. La lista blanca es la misma que usan los radares en Python.
import primarias from './primarias.json' with {type: 'json'};

const CON_CARGADOR_PROPIO = ['doi.org', 'arxiv.org'];
const TIPOS = ['text/html', 'application/xhtml+xml', 'text/plain', 'application/pdf'];

export function dominioPrimario(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  return Object.keys(primarias).find(d => h === d || h.endsWith('.' + d)) || null;
}

// abierta: acepta cualquier página pública (prensa, blogs), con las mismas protecciones de red.
export function validarUrlOficial(url, abierta = false) {
  let u; try { u = new URL(url) } catch { throw Error('Enlace de fuente inválido') }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) throw Error('Solo se admiten enlaces HTTPS sin credenciales ni puertos');
  const dominio = dominioPrimario(u.hostname);
  if (dominio && CON_CARGADOR_PROPIO.includes(dominio)) throw Error('Solo se admiten arXiv, DOI o fuentes oficiales de la lista');
  if (!dominio && !abierta) throw Error('Solo se admiten arXiv, DOI o fuentes oficiales de la lista');
  return {u, dominio};
}

// Solo IP globales. En IPv6 se acepta 2000::/3 menos los bloques de documentación, Teredo/IETF y 6to4.
export function ipPublica(ip) {
  const v4 = String(ip).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b, c] = v4.slice(1).map(Number);
    if (v4.slice(1).some(x => Number(x) > 255)) return false;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  if (!String(ip).includes(':') || String(ip).includes('.')) return false;
  const [izq, der = ''] = String(ip).toLowerCase().split('::');
  const partes = s => s ? s.split(':') : [];
  const grupos = String(ip).includes('::') ? [...partes(izq), ...Array(8 - partes(izq).length - partes(der).length).fill('0'), ...partes(der)] : partes(izq);
  if (grupos.length !== 8 || grupos.some(g => !/^[0-9a-f]{1,4}$/.test(g))) return false;
  const [g0, g1] = grupos.map(g => parseInt(g, 16));
  return (g0 & 0xe000) === 0x2000 && !(g0 === 0x2001 && (g1 < 0x200 || g1 === 0xdb8)) && g0 !== 0x2002;
}

async function resolverDns(host) {
  const consultar = tipo => Deno.resolveDns(host, tipo).catch(() => []);
  return [...await consultar('A'), ...await consultar('AAAA')];
}

export async function leerLimitado(body, max) {
  const reader = body.getReader(), partes = []; let n = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    n += value.length; if (n > max) { await reader.cancel(); throw Error('La respuesta de la fuente es demasiado grande') }
    partes.push(value);
  }
  const bytes = new Uint8Array(n); let i = 0; for (const p of partes) { bytes.set(p, i); i += p.length }
  return bytes;
}

// shortcut: fetch vuelve a resolver el dominio después del chequeo (rebinding); el riesgo queda acotado a dominios
// oficiales de la lista. Si Supabase expone un cliente HTTP con IP fija, conectar a la IP validada.
export async function leerOficial(url, {fetcher = fetch, resolver = resolverDns, limite = 3_000_000, timeout = 15000, saltos = 5, abierta = false} = {}) {
  const signal = AbortSignal.timeout(timeout);
  for (let i = 0; i <= saltos; i++) {
    const {u, dominio} = validarUrlOficial(url, abierta);
    const ips = await resolver(u.hostname);
    if (!ips.length || !ips.every(ipPublica)) throw Error('Destino de red no público');
    const r = await fetcher(u.href, {redirect: 'manual', signal, headers: {Accept: 'text/html,application/xhtml+xml,application/pdf,text/plain;q=0.8', 'User-Agent': 'NucleoIA-Sala/1.0'}});
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      await r.body?.cancel(); const destino = r.headers.get('location');
      if (!destino) throw Error('Redirección sin destino');
      url = new URL(destino, u).href; continue;
    }
    if (!r.ok || !r.body) throw Error('La fuente oficial no respondió');
    const [tipo, ...params] = (r.headers.get('content-type') || '').toLowerCase().split(';').map(s => s.trim());
    if (!TIPOS.includes(tipo)) { await r.body.cancel(); throw Error('Tipo de contenido no admitido') }
    if (tipo === 'application/pdf') { await r.body.cancel(); return {url: u.href, dominio, tipo, bytes: null} }
    const charset = params.find(p => p.startsWith('charset='))?.slice(8).replace(/"/g, '');
    return {url: u.href, dominio, tipo, charset, bytes: await leerLimitado(r.body, limite)};
  }
  throw Error('Demasiadas redirecciones');
}

function decodificar(bytes, charset) {
  const sniff = new TextDecoder('latin1').decode(bytes.subarray(0, 4096)).match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try { return new TextDecoder(charset || sniff || 'utf-8').decode(bytes) } catch { return new TextDecoder().decode(bytes) }
}
const entidades = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|[a-z]+);/gi, (m, x) => {
  const nombradas = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', ordm: 'º', ordf: 'ª', iexcl: '¡', iquest: '¿'};
  if (x[0] !== '#') return nombradas[x] ?? m;
  const n = x[1].toLowerCase() === 'x' ? parseInt(x.slice(2), 16) : parseInt(x.slice(1), 10);
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
});
const limpio = s => entidades(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function textoHtml(html) {
  const meta = nombre => {
    const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${nombre}["'][^>]*>`, 'i'))?.[0];
    return tag ? limpio(tag.match(/content=["']([^"']*)["']/i)?.[1] || '') : '';
  };
  const titulo = meta('citation_title') || meta('og:title') || limpio(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || limpio(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  const fecha = ['citation_publication_date', 'citation_date', 'article:published_time', 'dcterms.date', 'DC.date', 'date']
    .map(meta).map(f => f.replace(/\//g, '-')).find(f => /^\d{4}-\d\d-\d\d/.test(f))?.slice(0, 10) || '';
  const autores = [...html.matchAll(/<meta[^>]+name=["']citation_author["'][^>]*>/gi)].map(m => limpio(m[0].match(/content=["']([^"']*)["']/i)?.[1] || '')).filter(Boolean);
  let cuerpo = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ');
  const aTexto = h => entidades(h.replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<\/?(p|div|li|h[1-6]|br|tr|section|article|blockquote)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  // El bloque principal más largo (main o article); si es corto, una tarjeta suelta, se usa toda la página.
  const principal = [...cuerpo.matchAll(/<(main|article)\b[\s\S]*?<\/\1>/gi)].map(m => aTexto(m[0])).sort((a, b) => b.length - a.length)[0] || '';
  const texto = principal.length >= 500 ? principal : aTexto(cuerpo);
  return {titulo, fecha, autores, texto};
}

// Fuente oficial con el mismo formato que arXiv y Crossref. Un PDF no se interpreta: queda para lectura humana.
export async function fuenteOficial(url, opciones) {
  const r = await leerOficial(url, opciones);
  const origen = primarias[r.dominio] || new URL(r.url).hostname.replace(/^www\./, '');
  const tipoFuente = r.dominio ? 'oficial' : 'prensa';
  if (!r.bytes) {
    const archivo = decodeURIComponent(new URL(r.url).pathname.split('/').pop() || 'documento.pdf');
    return {titulo: archivo, resumen: '', autores: [origen], fecha: '', doi: null, url: r.url, origen, tipo: tipoFuente, requiere_lectura_humana: true};
  }
  const html = decodificar(r.bytes, r.charset);
  const d = r.tipo === 'text/plain' ? {titulo: html.split('\n')[0].trim().slice(0, 300), fecha: '', autores: [], texto: html.trim()} : textoHtml(html);
  if (!d.titulo || d.texto.length < 200) throw Error('La fuente oficial no tiene texto legible');
  return {titulo: d.titulo.slice(0, 500), resumen: d.texto.slice(0, 100_000), autores: d.autores.length ? d.autores : [origen], fecha: d.fecha, doi: null, url: r.url, origen, tipo: tipoFuente};
}
