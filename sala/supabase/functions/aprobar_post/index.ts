import jpeg from 'npm:jpeg-js@0.4.4';
import {cors,miembro,reply} from '../_shared/auth.ts';
import {cargarFuente,contexto} from '../_shared/servicio.ts';
import {mensajeVisible} from '../_shared/redaccion.ts';
import {adminClient,leerBody,datosPost,comprobarDoi,cuentaInstagram} from '../_shared/posts.ts';
import {validarPost,validarChecklist,leerJpegCompleto,sha256,paginaNota,huellaPost,huellaFuente} from '../_shared/publicacion.mjs';
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return reply({error:'Método no permitido'},405);
 let client;try{client=await miembro(req)}catch{return reply({error:'Sin acceso'},403)}
 try{
  const b=await leerBody(req),db=adminClient(),post=await datosPost(db,b.id);
  if(post.estado!=='borrador'||post.revision!==b.revision)throw Error('El borrador cambió. Ábrelo de nuevo desde la lista');
  validarChecklist(post,b.nombre);const cuenta=await cuentaInstagram(client);if(!post.fuente_primaria)throw Error('Falta el enlace de la fuente');const ctx=await contexto(client,post.formato,post.tipo_gancho),fuente=await cargarFuente(post.fuente_primaria);
  validarPost(post,fuente,ctx.config.lista_negra);await comprobarDoi(fuente.doi);paginaNota(post,fuente,post.id);
  if(!Array.isArray(b.imagenes)||b.imagenes.length!==post.laminas.length)throw Error('Faltan imágenes');
  const images=b.imagenes.map((data:string)=>leerJpegCompleto(data,jpeg.decode));if(images.reduce((n:number,x:Uint8Array)=>n+x.length,0)>9_000_000)throw Error('Imágenes demasiado grandes');
  const nonce=crypto.randomUUID(),manifest=[];
  for(let i=0;i<images.length;i++){
    const hash=await sha256(images[i]);const path=`aprobaciones/${post.id}/${nonce}/${String(i+1).padStart(2,'0')}.jpg`;
    const {error}=await db.storage.from('imagenes-privadas').upload(path,images[i],{contentType:'image/jpeg',upsert:false});if(error)throw Error('No se pudo guardar la imagen');manifest.push({path,sha256:hash});
  }
  const approval={revision:post.revision,usuario:b.nombre.trim(),fecha:new Date().toISOString(),cuenta_instagram:cuenta,fuente:fuente.url,fuente_sha256:await huellaFuente(fuente),contenido_sha256:await huellaPost(post),imagenes:manifest};
  const {data,error}=await db.from('posts').update({estado:'aprobado',aprobado_por:b.nombre.trim(),aprobado_en:approval.fecha,aprobacion:approval,imagenes_aprobadas:manifest}).eq('id',post.id).eq('revision',post.revision).eq('estado','borrador').select('id,revision').maybeSingle();
  if(error||!data)throw Error('El borrador cambió durante la aprobación');return reply({id:post.id,revision:post.revision,estado:'aprobado'});
 }catch(err){return reply({error:mensajeVisible(err,'Comprueba la revisión, la fuente, las cifras, el checklist y las imágenes.')},422)}
});
