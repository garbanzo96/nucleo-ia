import { cors, miembro, reply } from '../_shared/auth.ts';
import { cargarFuente, contexto, modeloJson, politica } from '../_shared/servicio.ts';
import { validarBorrador, validarVerificacion } from '../_shared/editorial.mjs';

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='POST')return reply({error:'Método no permitido'},405);
  let db;try{db=await miembro(req)}catch{return reply({error:'Sin acceso a la sala'},403)}
  try {
    const body=await req.json();
    if(typeof body.fuente_primaria!=='string'||body.fuente_primaria.length>500||typeof body.formato!=='string'||typeof body.tipo_gancho!=='string')return reply({error:'Faltan fuente, formato o tipo de gancho'},400);
    const ctx=await contexto(db,body.formato,body.tipo_gancho);
    const fuente=await cargarFuente(body.fuente_primaria);
    const esquema={laminas:[{titulo:'',cuerpo:'',fuente:'',alt:''}],ganchos:[{tipo:'',texto:''}],descripcion:'',sugerencia_imagen:{mostrar:'',terminos:'',donde:'',licencia:''}};
    const pedido={fuente,formato:body.formato,tipo_gancho:body.tipo_gancho,tipos_recientes:ctx.anteriores.map((p:any)=>p.tipo_gancho),esquema,limites:'6 a 10 láminas, 3 a 5 ganchos de tipos distintos, máximo 40 palabras por lámina y máximo 12 palabras en el primer título. La penúltima lámina explica límites. La descripción no contiene enlaces adicionales ni DOI.'};
    const borrador=await modeloJson(ctx.config.modelos.redactar,ctx.prompts.redactar+'\n'+politica,pedido);
    const corregido=await modeloJson(ctx.config.modelos.voz,ctx.prompts.voz+'\n'+politica+' Conserva exactamente la estructura JSON entregada. No incorpores hechos ni cifras.',{fuente,borrador,lista_negra:ctx.config.lista_negra});
    validarBorrador(corregido,fuente.titulo+' '+fuente.resumen,fuente.url,ctx.config.lista_negra,ctx.anteriores,body.formato,body.tipo_gancho);
    const informe=await modeloJson(ctx.config.modelos.verificar,ctx.prompts.verificar+'\n'+politica+' Responde {"laminas":[{"respaldada":true,"explicacion":"..."}],"descripcion_respaldada":true}; una entrada por lámina en orden. Si cualquier afirmación carece de apoyo, usa false.',{fuente,borrador:corregido});
    validarVerificacion(informe,corregido.laminas.length);
    return reply({borrador:corregido,fuente:{...fuente,alcance:'resumen'},revision:informe,estado:'borrador',advertencia:'La revisión automática puede equivocarse. Una persona debe leer la fuente y verificar cada afirmación y cifra antes de aprobar.'});
  }catch(err){
    const msg=err instanceof Error?err.message:'';
    const permitidas=['La generación está desactivada','Solo se admiten enlaces','El enlace debe apuntar','El formato o el gancho','Hay publicaciones sin fecha','Falta aplicar la migración','La segunda pasada','El borrador','Una lámina','Los ganchos','Falta el tipo','Formato usado','Hay una cifra','El texto contiene','El texto incumple','La fuente no encontró','El resumen de la fuente','No se pudo comprobar'];
    return reply({error:permitidas.some(s=>msg.startsWith(s))?msg:'No se pudo generar el borrador. Revisa la configuración y la fuente.'},422);
  }
});
