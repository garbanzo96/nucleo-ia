import { cors, miembro, reply } from '../_shared/auth.ts';
import { modelosDe, modeloJson } from '../_shared/servicio.ts';
import { iaDelPedido } from '../_shared/ia.mjs';
import { preparar, redactarCompleto, mensajeVisible, PLAZO } from '../_shared/redaccion.ts';

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='POST')return reply({error:'Método no permitido'},405);
  let db;try{db=await miembro(req)}catch{return reply({error:'Sin acceso a la sala'},403)}
  const hasta=Date.now()+PLAZO;
  try {
    const ia=iaDelPedido(req.headers, Deno.env.get('GEMINI_API_KEY'));
    const prep=await preparar(db,await req.json()), modelos=modelosDe(prep.ctx.config,ia);
    const con=(m:string)=>(p:{sistema:string,datos:unknown},espera?:number,respaldo?:number)=>modeloJson(ia,m,p.sistema,p.datos,espera,respaldo);
    return reply(await redactarCompleto(prep,con(modelos.redactar),con(modelos.verificar),con(modelos.ganchos),hasta));
  }catch(err){
    return reply({error:mensajeVisible(err,'No se pudo generar el borrador. Revisa la configuración y la fuente.')},422);
  }
});
