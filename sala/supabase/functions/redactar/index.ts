import { cors, miembro, reply } from '../_shared/auth.ts';
import { modelosDe, modeloJson } from '../_shared/servicio.ts';
import { claveDelPedido } from '../_shared/ia.mjs';
import { preparar, pasoBorrador, pasoVoz, pasoVerificar, cerrar, mensajeVisible } from '../_shared/redaccion.ts';

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='POST')return reply({error:'Método no permitido'},405);
  let db;try{db=await miembro(req)}catch{return reply({error:'Sin acceso a la sala'},403)}
  try {
    const ia=claveDelPedido(req.headers);
    const prep=await preparar(db,await req.json()), modelos=modelosDe(prep.ctx.config,ia);
    const correr=(m:string,p:{sistema:string,datos:unknown})=>modeloJson(ia,m,p.sistema,p.datos);
    const borrador=await correr(modelos.redactar,pasoBorrador(prep));
    const corregido=await correr(modelos.voz,pasoVoz(prep,borrador));
    const informe=await correr(modelos.verificar,pasoVerificar(prep,corregido));
    return reply(cerrar(prep,corregido,informe));
  }catch(err){
    return reply({error:mensajeVisible(err,'No se pudo generar el borrador. Revisa la configuración y la fuente.')},422);
  }
});
