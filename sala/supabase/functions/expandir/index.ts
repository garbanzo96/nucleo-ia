import {cors,miembro,reply} from '../_shared/auth.ts';
import {identificador,ordenar} from '../_shared/expandir.mjs';
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({error:'Método no permitido'},405);
 try{
  await miembro(req);const body=await req.json(),id=identificador(body.identificador);
  const base='https://api.semanticscholar.org/graph/v1/paper/'+encodeURIComponent(id);
  async function cargar(rel:string,key:string){
   const url=base+'/'+rel+'?fields=title,year,authors,externalIds,citationCount&limit=100';
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('No se pudo consultar Semantic Scholar');
   const body=await response.text();if(body.length>1000000)throw Error('Respuesta demasiado grande');return ordenar(JSON.parse(body).data,key);
  }
  const [referencias,citas]=await Promise.all([cargar('references','citedPaper'),cargar('citations','citingPaper')]);
  return reply({referencias,citas});
 }catch{return reply({error:'No se pudo expandir el trabajo. Comprueba el DOI o intenta de nuevo.'},422)}
});
