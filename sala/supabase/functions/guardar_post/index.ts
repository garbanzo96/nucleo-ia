import {cors,miembro,reply} from '../_shared/auth.ts';
import {mensajeVisible} from '../_shared/redaccion.ts';
import {adminClient,leerBody,postEntrada,datosPost} from '../_shared/posts.ts';
import {preservarApoyos} from '../_shared/editorial.mjs';
import {preservarFondo} from '../_shared/fondo.mjs';
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return reply({error:'Método no permitido'},405);
 try{await miembro(req)}catch{return reply({error:'Sin acceso'},403)}
 try{
  const b=await leerBody(req,1_000_000);
  const db=adminClient();let actual=null;
  if(b.id){if(!Number.isSafeInteger(b.revision)||b.revision<1)throw Error('Revisión inválida');actual=await datosPost(db,b.id);if(!['borrador','aprobado'].includes(actual.estado)||actual.revision!==b.revision)throw Error('Otra persona guardó una versión más nueva de este borrador, o ya está publicado. Ábrelo de nuevo desde la lista')}
  const entrada=postEntrada(actual?preservarFondo(preservarApoyos(b,actual),actual):b);
  if(!b.id){const original={laminas:entrada.laminas,descripcion:entrada.descripcion,ganchos:entrada.ganchos,sugerencia_imagen:entrada.sugerencia_imagen};
   const candidato=b.candidato_id;if(candidato!==undefined&&candidato!==null&&(typeof candidato!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidato)))throw Error('Candidato inválido');
   const {data,error}=await db.from('posts').insert({...entrada,candidato_id:candidato||null,borrador_original:original,diff:{},estado:'borrador'}).select('id,revision').single();if(error)throw error;return reply({id:data.id,revision:data.revision,estado:'borrador'})}
  const diff={antes:actual.borrador_original,despues:{laminas:entrada.laminas,descripcion:entrada.descripcion,ganchos:entrada.ganchos,sugerencia_imagen:entrada.sugerencia_imagen}};
  const {data,error}=await db.from('posts').update({...entrada,revision:b.revision+1,estado:'borrador',aprobado_por:null,aprobado_en:null,aprobacion:null,imagenes_aprobadas:null,diff}).eq('id',b.id).eq('revision',b.revision).in('estado',['borrador','aprobado']).select('id,revision').maybeSingle();
  if(error||!data)throw Error('Otra persona guardó este borrador al mismo tiempo. Ábrelo de nuevo desde la lista');return reply({id:data.id,revision:data.revision,estado:'borrador'});
 }catch(err){return reply({error:mensajeVisible(err,'La sala no pudo guardar el borrador. Intenta de nuevo en un momento.')},422)}
});
