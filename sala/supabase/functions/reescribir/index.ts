import { cors, miembro, reply } from '../_shared/auth.ts';
import { cargarFuente, contexto, modelosDe, instrucciones, exigirTexto, modeloJson, politica } from '../_shared/servicio.ts';
import { iaDelPedido } from '../_shared/ia.mjs';
import { mensajeVisible } from '../_shared/redaccion.ts';
import { validarTexto, evidenciaDe, TIPOS_LAMINA, PALABRAS_LAMINA } from '../_shared/editorial.mjs';

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='POST')return reply({error:'Método no permitido'},405);
  let db;try{db=await miembro(req)}catch{return reply({error:'Sin acceso a la sala'},403)}
  const hasta=Date.now()+120_000;
  try {
    const b=await req.json();
    if(typeof b.fuente_primaria!=='string'||!b.fuente_primaria.trim()||b.fuente_primaria.length>500)throw new Error('Falta el enlace de la fuente');
    if(typeof b.formato!=='string'||typeof b.tipo_gancho!=='string'||!['lamina','gancho'].includes(b.tipo)||typeof b.instrucciones!=='string'||b.instrucciones.length>2000||!b.contenido||typeof b.contenido!=='object')return reply({error:'Solicitud inválida'},400);
    const ia=iaDelPedido(req.headers, Deno.env.get('GEMINI_API_KEY')), ctx=await contexto(db,b.formato,b.tipo_gancho,false), modelos=modelosDe(ctx.config,ia), fuente=exigirTexto(await cargarFuente(b.fuente_primaria));
    const pedir=(m:string,sistema:string,datos:unknown)=>modeloJson(ia,m,instrucciones(sistema),datos,Math.min(45_000,(hasta-Date.now())*0.6),Math.min(25_000,(hasta-Date.now())*0.35));
    const esGancho=b.tipo==='gancho',keys=esGancho?['texto']:['titulo','cuerpo','fuente','alt'],esquema=Object.fromEntries(keys.map(k=>[k,'']));
    // Solo textos; un título vacío es válido en una lámina que no lo usa.
    const limpiar=(r:any)=>{const o=r?.contenido??r;return o&&typeof o==='object'?Object.fromEntries(keys.map(k=>[k,typeof o[k]==='string'?o[k].trim():''])) as Record<string,string>:null};
    const sirve=(o:Record<string,string>|null)=>!!o&&(esGancho?!!o.texto:!!(o.titulo||o.cuerpo));
    const salida=limpiar(await pedir(modelos.redactar,ctx.prompts.redactar+'\n'+politica+' Reescribe solo el contenido indicado siguiendo las instrucciones y devuelve el esquema solicitado. Si el título viene vacío, déjalo vacío.',{fuente,contenido:b.contenido,instrucciones:b.instrucciones,esquema}));
    if(!sirve(salida))throw new Error('El modelo no entregó texto. Intenta de nuevo.');
    // La pasada de voz mejora, pero si falla queda la reescritura.
    const voz=await pedir(modelos.voz,ctx.prompts.voz+'\n'+politica+' Conserva la estructura JSON, no incorpores hechos ni cifras y evita repetir el gancho o estructura de los ejemplos.',{fuente,contenido:salida,lista_negra:ctx.config.lista_negra,ejemplos_voz:ctx.ejemplos}).then(limpiar).catch(()=>null);
    const limpio=sirve(voz)?voz!:salida!;
    if(!esGancho&&!limpio.alt)limpio.alt=[limpio.titulo,limpio.cuerpo].filter(Boolean).join('. ');
    // Como al redactar: lo que no cumple se avisa y se corrige antes de aprobar, sin botar el texto.
    const alertas:string[]=[],n=(esGancho?limpio.texto:limpio.titulo+' '+limpio.cuerpo).trim().split(/\s+/).length,max=esGancho?12:PALABRAS_LAMINA;
    if(n>max)alertas.push(`Tiene ${n} palabras y el máximo es ${max}`);
    try{validarTexto(keys.map(k=>limpio[k]).join(' '),evidenciaDe(fuente),fuente.url,ctx.config.lista_negra)}catch(e){alertas.push((e as Error).message)}
    const informe=hasta-Date.now()<12_000?null:await pedir(modelos.verificar,ctx.prompts.verificar+'\n'+politica+' Responde {"laminas":[{"respaldada":true,"explicacion":"..."}],"descripcion_respaldada":true}. Usa false si algo no está respaldado.',{fuente,contenido:limpio}).catch(()=>null);
    if(!informe)alertas.push('No se alcanzó a verificar contra la fuente');
    else if(informe.laminas?.[0]?.respaldada!==true)alertas.push('Revisar contra la fuente: '+String(informe.laminas?.[0]?.explicacion||'sin detalle').slice(0,300));
    const contenido=esGancho?limpio:{...(TIPOS_LAMINA.includes(b.contenido.tipo)?{tipo:b.contenido.tipo}:{}),...limpio};
    return reply({tipo:b.tipo,contenido,alertas,advertencia:alertas.length?'Texto reescrito. Por revisar: '+alertas.join(' · '):'Texto reescrito. Verifícalo con la fuente antes de aprobar.'});
  }catch(err){return reply({error:mensajeVisible(err,'Intenta de nuevo en un momento.')},422)}
});
