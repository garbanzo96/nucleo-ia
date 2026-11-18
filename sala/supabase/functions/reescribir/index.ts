import { cors, miembro, reply } from '../_shared/auth.ts';
import { cargarFuente, contexto, modeloJson, politica } from '../_shared/servicio.ts';
import { validarTexto, validarVerificacion } from '../_shared/editorial.mjs';

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='POST')return reply({error:'Método no permitido'},405);
  let db;try{db=await miembro(req)}catch{return reply({error:'Sin acceso a la sala'},403)}
  try {
    const b=await req.json();
    if(typeof b.fuente_primaria!=='string'||b.fuente_primaria.length>500||typeof b.formato!=='string'||typeof b.tipo_gancho!=='string'||!['lamina','gancho'].includes(b.tipo)||typeof b.instrucciones!=='string'||b.instrucciones.length>2000||!b.contenido||typeof b.contenido!=='object')return reply({error:'Solicitud inválida'},400);
    const ctx=await contexto(db,b.formato,b.tipo_gancho), fuente=await cargarFuente(b.fuente_primaria);
    const esquema=b.tipo==='gancho'?{texto:''}:{titulo:'',cuerpo:'',fuente:'',alt:''};
    const salida=await modeloJson(ctx.config.modelos.redactar,ctx.prompts.redactar+'\n'+politica+' Reescribe el contenido indicado y devuelve el esquema solicitado.',{fuente,contenido:b.contenido,instrucciones:b.instrucciones,esquema});
    const limpio=await modeloJson(ctx.config.modelos.voz,ctx.prompts.voz+'\n'+politica+' Conserva la estructura JSON, no incorpores hechos ni cifras y evita repetir el gancho o estructura de los ejemplos.',{fuente,contenido:salida,lista_negra:ctx.config.lista_negra,ejemplos_voz:ctx.ejemplos});
    const keys=b.tipo==='gancho'?['texto']:['titulo','cuerpo','fuente','alt'];
    if(!keys.every(k=>typeof limpio[k]==='string')||(b.tipo==='gancho'?!limpio.texto.trim():!limpio.titulo.trim()||!limpio.alt.trim()))throw new Error('Respuesta incompleta');
    const text=keys.map(k=>limpio[k]).join(' ');if(text.trim().split(/\s+/).length>40)throw new Error('Extensión excesiva');
    validarTexto(text,fuente.titulo+' '+fuente.resumen,fuente.url,ctx.config.lista_negra);
    const report=await modeloJson(ctx.config.modelos.verificar,ctx.prompts.verificar+'\n'+politica+' Responde {"laminas":[{"respaldada":true,"explicacion":"..."}],"descripcion_respaldada":true}. Usa false si algo no está respaldado.',{fuente,contenido:limpio});
    validarVerificacion(report,1);
    return reply({tipo:b.tipo,contenido:limpio,fuente:{...fuente,alcance:'resumen'},revision:report,advertencia:'La revisión automática puede equivocarse; verifica el contenido con la fuente antes de aprobar.'});
  }catch{return reply({error:'No se pudo reescribir. Comprueba la fuente, la rotación y la configuración; la acción sigue sujeta a revisión humana.'},422)}
});
