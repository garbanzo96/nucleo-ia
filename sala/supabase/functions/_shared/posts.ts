import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { validarTexto, validarApoyos, TIPOS_LAMINA } from './editorial.mjs';
import { validarCuenta } from './publicacion.mjs';
import { validarFondo } from './fondo.mjs';
export function adminClient(){
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)throw Error('Falta configurar el servidor');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function leerBody(req:Request,max=12_000_000){
  if(Number(req.headers.get('content-length')||0)>max||!req.body)throw Error('Solicitud demasiado grande');
  const reader=req.body.getReader();const parts:Uint8Array[]=[];let n=0;
  while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>max){await reader.cancel();throw Error('Solicitud demasiado grande')}parts.push(value)}
  const all=new Uint8Array(n);let i=0;for(const p of parts){all.set(p,i);i+=p.length}return JSON.parse(new TextDecoder().decode(all));
}
export function postEntrada(raw:any,fuente:any,prohibidas:string[]){
  if(!raw||typeof raw!=='object'||typeof raw.formato!=='string'||typeof raw.tipo_gancho!=='string'||!Array.isArray(raw.laminas)||raw.laminas.length<1||raw.laminas.length>10||typeof raw.descripcion!=='string'||raw.descripcion.length>12000)throw Error('Borrador inválido');
  if(raw.laminas.some((l:any)=>!l||!['titulo','cuerpo','fuente','alt'].every(k=>typeof l[k]==='string'&&l[k].length<=4000)))throw Error('Láminas inválidas');
  if(typeof raw.credito_imagen!=='string'||raw.credito_imagen.length>500)throw Error('Crédito inválido');
  const evidence=fuente.titulo+' '+fuente.resumen;
  for(const l of raw.laminas)validarTexto([l.titulo,l.cuerpo,l.fuente,l.alt].join(' '),evidence,fuente.url,prohibidas);
  validarTexto(raw.descripcion,evidence,fuente.url,prohibidas);
  const apoyos=validarApoyos(raw.ganchos,raw.sugerencia_imagen,evidence,fuente.url,prohibidas);
  const checks=raw.checklist||{};
  return {...apoyos,...validarFondo(raw),formato:raw.formato,tipo_gancho:raw.tipo_gancho,laminas:raw.laminas.map((l:any)=>({...(TIPOS_LAMINA.includes(l.tipo)?{tipo:l.tipo}:{}),titulo:l.titulo,cuerpo:l.cuerpo,fuente:l.fuente,alt:l.alt})),descripcion:raw.descripcion,credito_imagen:raw.credito_imagen,checklist:Object.fromEntries(['fuente_leida','cifras_verificadas','permiso_imagen','credito_imagen','sin_marcadores'].map(k=>[k,checks[k]===true])),fuente_primaria:fuente.url};
}
export async function datosPost(db:any,id:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||''))throw Error('Post inválido');
  const {data,error}=await db.from('posts').select('*').eq('id',id).maybeSingle();if(error||!data)throw Error('No se encontró el borrador');return data;
}
export async function comprobarDoi(doi:string|null){
  if(!doi)return;
  if(!/^10\.\d{4,9}\/[a-z0-9._;()/:+-]+$/i.test(doi)||doi.length>300)throw Error('DOI inválido');
  const r=await fetch('https://api.crossref.org/works/'+encodeURIComponent(doi),{redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
  if(!r.ok||!r.body)throw Error('No se pudo comprobar el DOI');
  const reader=r.body.getReader(),chunks:Uint8Array[]=[];let n=0;
  while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>524288){await reader.cancel();throw Error('Respuesta de DOI demasiado grande')}chunks.push(value)}
  const bytes=new Uint8Array(n);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  const obj=JSON.parse(new TextDecoder().decode(bytes));if(String(obj?.message?.DOI||'').toLowerCase()!==doi.toLowerCase())throw Error('El DOI no coincide');
}

export async function cuentaInstagram(db:any){
  const {data,error}=await db.from('config').select('valor').eq('clave','cuenta_instagram').maybeSingle();
  if(error)throw Error('No se pudo leer la cuenta de Instagram');
  return validarCuenta(data?.valor);
}
