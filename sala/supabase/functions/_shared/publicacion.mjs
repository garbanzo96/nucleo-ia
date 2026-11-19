import {validarTexto,tiposGancho,PALABRAS_LAMINA} from './editorial.mjs';
export function validarPost(post,fuente,prohibidas=[]){
  if(!post||typeof post!=='object'||typeof post.formato!=='string'||!tiposGancho.includes(post.tipo_gancho))throw Error('Formato o gancho inválido');
  if(!Array.isArray(post.laminas)||post.laminas.length<6||post.laminas.length>10)throw Error('Se requieren de 6 a 10 láminas');
  if(typeof post.descripcion!=='string'||!post.descripcion.trim()||post.descripcion.length>12000)throw Error('La descripción está vacía o excede el límite');
  const evidence=fuente.titulo+' '+fuente.resumen;
  for(const [index,l] of post.laminas.entries()){
    if(!l||!['titulo','cuerpo','fuente','alt'].every(k=>typeof l[k]==='string'&&l[k].length<=4000)||!(l.titulo.trim()||l.cuerpo.trim())||!l.alt.trim()||(index===0&&!l.titulo.trim()))throw Error('Faltan título o texto alternativo');
    const count=s=>s.trim().split(/\s+/).filter(Boolean).length;
    if(count(l.titulo+' '+l.cuerpo)>PALABRAS_LAMINA || (index===0&&count(l.titulo)>12))throw Error('Una lámina supera el límite de palabras');
    validarTexto([l.titulo,l.cuerpo,l.fuente,l.alt].join(' '),evidence,fuente.url,prohibidas);
  }
  validarTexto(post.descripcion,evidence,fuente.url,prohibidas);
  if(typeof post.credito_imagen!=='string'||post.credito_imagen.length>500)throw Error('Crédito de imagen inválido');
  validarTexto(post.credito_imagen,evidence+' '+post.credito_imagen,fuente.url,prohibidas);
  return true;
}
export function validarCuenta(cuenta){if(typeof cuenta!=='string'||!/^@[a-z0-9._]{1,30}$/i.test(cuenta))throw Error('Falta configurar la cuenta de Instagram');return cuenta}
export function validarChecklist(post,nombre){
  if(typeof nombre!=='string'||!nombre.trim()||nombre.length>100)throw Error('Falta el nombre de quien aprueba');
  if(!post.checklist||!['fuente_leida','cifras_verificadas','sin_marcadores'].every(k=>post.checklist[k]===true))throw Error('Falta completar el checklist');
}
export function leerJpeg(base64){
  if(typeof base64!=='string'||base64.length>2_800_000||!/^[a-zA-Z0-9+/]*={0,2}$/.test(base64))throw Error('JPEG inválido o demasiado grande');
  let raw;try{raw=atob(base64)}catch{throw Error('JPEG inválido')}
  const b=Uint8Array.from(raw,c=>c.charCodeAt(0));
  if(b.length<10||b.length>2_000_000||b[0]!==0xff||b[1]!==0xd8||b[b.length-2]!==0xff||b[b.length-1]!==0xd9)throw Error('El archivo no es JPEG');
  for(let i=2;i+8<b.length;){
    if(b[i]!==0xff)throw Error('JPEG inválido');while(i<b.length&&b[i]===0xff)i++;
    const m=b[i++];if(m===0xda||m===0xd9)break;if(m===0x01||(m>=0xd0&&m<=0xd7))continue;
    if(i+1>=b.length)break;const len=(b[i]<<8)|b[i+1];if(len<2||i+len>b.length)throw Error('JPEG truncado');
    if((m>=0xc0&&m<=0xcf)&&![0xc4,0xc8,0xcc].includes(m)){
      if(len<8)throw Error('JPEG inválido');const h=(b[i+3]<<8)|b[i+4],w=(b[i+5]<<8)|b[i+6];
      if(w!==1080||h!==1350)throw Error('Cada imagen debe medir 1080 × 1350');return b;
    }
    i+=len;
  }
  throw Error('No se encontró el tamaño del JPEG');
}
export async function sha256(data){const hash=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')}
export async function huellaPost(p){return sha256(new TextEncoder().encode(JSON.stringify({formato:p.formato,tipo_gancho:p.tipo_gancho,laminas:p.laminas,descripcion:p.descripcion,credito_imagen:p.credito_imagen,checklist:p.checklist,fuente_primaria:p.fuente_primaria,imagen_privada:p.imagen_privada,encuadre:p.encuadre,oscurecimiento:p.oscurecimiento})))}
export async function huellaFuente(f){return sha256(new TextEncoder().encode(JSON.stringify(f)))}
export function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export function paginaNota(post,fuente,slug){
  // Un documento oficial puede no declarar fecha; se cita como «s. f.» en vez de inventarla.
  if(!fuente.autores?.length||(!/^\d{4}-\d\d-\d\d/.test(fuente.fecha||'')&&fuente.tipo!=='oficial'))throw Error('Faltan autores o fecha de la fuente');
  const referencia=`${fuente.autores.join(', ')}. ${fuente.titulo}. ${fuente.fecha?fuente.fecha.slice(0,4):'s. f.'}. ${fuente.origen||'arXiv'}. ${fuente.doi?'DOI: '+fuente.doi+'. ':''}${fuente.url}`;
  const slides=post.laminas.map((l,i)=>`<figure><img src="./lamina-${String(i+1).padStart(2,'0')}.jpg" alt="${esc(l.alt)}"><figcaption><h2>${esc(l.titulo)}</h2><p>${esc(l.cuerpo)}</p><small>${esc(l.fuente)}</small></figcaption></figure>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(post.laminas[0].titulo)} · Núcleo IA</title><meta name="description" content="${esc(post.descripcion.slice(0,160))}"><link rel="stylesheet" href="../../styles.css"><style>main{max-width:850px;margin:4rem auto;padding:0 1.5rem}figure{margin:2rem 0}figure img{max-width:540px}figcaption{padding:1rem 0}p{white-space:pre-wrap}small{color:#a8b5c7}</style></head><body><main><p><a href="../">Notas</a></p><h1>${esc(post.laminas[0].titulo)}</h1><p>${esc(post.descripcion)}</p>${slides}<h2>Fuente primaria</h2><p>${esc(referencia)}</p><p><a href="${esc(fuente.url)}">Leer la fuente ↗</a></p><p>Crédito de imagen: ${esc(post.credito_imagen)}</p></main></body></html>`;
}
export function indiceNotas(items){
  const rows=items.map(n=>`<li><a href="./${esc(n.slug)}/">${esc(n.titulo)}</a></li>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notas · Núcleo IA</title><link rel="stylesheet" href="../styles.css"><style>main{max-width:850px;margin:4rem auto;padding:0 1.5rem}li{margin:1rem 0}</style></head><body><main><p><a href="../">Núcleo IA</a></p><h1>Notas</h1><ul>${rows}</ul></main></body></html>`;
}

// Decodificación estricta: una cabecera válida no demuestra que el JPEG esté completo.
export function leerJpegCompleto(base64, decode){
  const bytes=leerJpeg(base64);
  if(typeof decode!=='function')throw Error('Falta el decodificador JPEG');
  let imagen;
  try{imagen=decode(bytes,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:2,maxMemoryUsageInMB:64})}
  catch{throw Error('JPEG dañado o incompleto')}
  if(imagen.width!==1080||imagen.height!==1350||!imagen.data||imagen.data.length!==1080*1350*4)throw Error('JPEG inválido');
  return bytes;
}
