import jpeg from 'npm:jpeg-js@0.4.4';
import {cors,miembro,reply} from '../_shared/auth.ts';
import {cargarFuente,contexto} from '../_shared/servicio.ts';
import {mensajeVisible} from '../_shared/redaccion.ts';
import {adminClient,leerBody,datosPost,comprobarDoi,cuentaInstagram} from '../_shared/posts.ts';
import {validarPost,validarChecklist,leerJpegCompleto,sha256,huellaPost,huellaFuente} from '../_shared/publicacion.mjs';
import {crearNota} from '../_shared/github.ts';
function base64(a:Uint8Array){let s='';for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s)}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return reply({error:'Método no permitido'},405);
 let client;try{client=await miembro(req)}catch{return reply({error:'Sin acceso'},403)}
 if(Deno.env.get('ENABLE_WEB_PUBLICATION')!=='true')return reply({error:'La publicación web está desactivada'},503);
 let db:any,locked=false,refIntentada=false,id='';
 try{
  const b=await leerBody(req,5000);id=b.id;db=adminClient();const post=await datosPost(db,id);
  if(!Number.isSafeInteger(b.revision)||post.estado!=='aprobado'||post.revision!==b.revision||post.aprobacion?.revision!==post.revision)throw Error('Revisión no aprobada');
  const take=await db.rpc('tomar_publicacion',{p_id:id,p_revision:b.revision});if(take.error||take.data!==true)throw Error('Otra publicación está en curso o cambió el borrador');locked=true;
  validarChecklist(post,post.aprobado_por);if(await cuentaInstagram(client)!==post.aprobacion.cuenta_instagram)throw Error('Cambió o falta la cuenta');const ctx=await contexto(client,post.formato,post.tipo_gancho),fuente=await cargarFuente(post.fuente_primaria);
  if(post.aprobacion.fuente!==fuente.url||post.aprobacion.usuario!==post.aprobado_por||post.aprobacion.fuente_sha256!==await huellaFuente(fuente)||post.aprobacion.contenido_sha256!==await huellaPost(post))throw Error('Cambió el contenido o la fuente desde la aprobación');
  validarPost(post,fuente,ctx.config.lista_negra);await comprobarDoi(fuente.doi);
  const manifest=post.imagenes_aprobadas;
  if(!Array.isArray(manifest)||manifest.length!==post.laminas.length||JSON.stringify(manifest)!==JSON.stringify(post.aprobacion.imagenes))throw Error('Las imágenes no coinciden con la aprobación');
  const images=[];
  for(let i=0;i<manifest.length;i++){
    const m=manifest[i];if(typeof m?.path!=='string'||!m.path.startsWith(`aprobaciones/${id}/`)||!/^[0-9a-f]{64}$/.test(m.sha256))throw Error('Imagen aprobada inválida');
    const {data,error}=await db.storage.from('imagenes-privadas').download(m.path);if(error||!data)throw Error('No se pudo cargar la imagen aprobada');
    const bytes=new Uint8Array(await data.arrayBuffer());leerJpegCompleto(base64(bytes),jpeg.decode);if(await sha256(bytes)!==m.sha256)throw Error('Una imagen cambió desde la aprobación');images.push(bytes);
  }
  const result=await crearNota(post,fuente,images,()=>{refIntentada=true});
  const release=await db.rpc('soltar_publicacion',{p_id:id,p_publicado:true,p_url:result.url});if(release.error||release.data!==true)throw Error('La nota se publicó, pero falta reconciliar el estado');locked=false;
  return reply({estado:'publicado',url:result.url,commit:result.sha});
 }catch(err){
  if(locked&&!refIntentada){try{await db.rpc('soltar_publicacion',{p_id:id,p_publicado:false})}catch{/* requiere revisión */}}
  return reply({error:refIntentada?'El resultado de GitHub puede ser ambiguo. Revisa el repositorio y reconcilia el estado antes de reintentar.':mensajeVisible(err,'Revisa la aprobación, las imágenes y la configuración.')},refIntentada?503:422);
 }
});
