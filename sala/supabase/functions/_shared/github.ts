import {indiceNotas,paginaNota} from './publicacion.mjs';
const base='https://api.github.com/repos/garbanzo96/nucleo-ia';
function b64(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s)}
export async function crearNota(post:any,fuente:any,imagenes:Uint8Array[],alIntentarRef:()=>void){
 const token=Deno.env.get('GITHUB_PUBLICAR_TOKEN');if(!token)throw Error('Falta configurar el token de publicación');
 const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
 async function call(path:string,method='GET',body?:unknown){
   const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(25000)});
   if(!r.ok)throw Error(`GitHub respondió HTTP ${r.status}`);return await r.json();
 }
 const ref=await call('/git/ref/heads/main'),head=ref.object.sha;
 if(!/^[0-9a-f]{40}$/.test(head))throw Error('Referencia de repositorio inválida');
 const commit=await call('/git/commits/'+head);if(!/^[0-9a-f]{40}$/.test(commit.tree.sha))throw Error('Árbol inválido');
 const idxResponse=await fetch(base+'/contents/notas/index.json?ref='+head,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
 let index:any[]=[];
 if(idxResponse.status!==404){if(!idxResponse.ok)throw Error('No se pudo leer el índice');const obj=await idxResponse.json();if(obj.encoding!=='base64'||typeof obj.content!=='string'||obj.content.length>1_000_000)throw Error('Índice inválido');index=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(obj.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));}
 if(!Array.isArray(index)||index.some(n=>!n||typeof n.slug!=='string'||!/^[a-z0-9-]+$/.test(n.slug)||typeof n.titulo!=='string'||n.titulo.length>400)||index.some(n=>n.slug===post.id))throw Error('Índice inválido o nota ya existente');
 index.unshift({slug:post.id,titulo:post.laminas[0].titulo});
 const nota={titulo:post.laminas[0].titulo,descripcion:post.descripcion,// La nota es pública: no lleva las rutas de las fotos privadas.
  laminas:post.laminas.map(({imagen,encuadre,oscurecimiento,...l}:any)=>l),credito_imagen:post.credito_imagen,referencias:[{titulo:fuente.titulo,autores:fuente.autores,fecha:fuente.fecha,doi:fuente.doi,url:fuente.url}],post_id:post.id,revision:post.revision};
 const encoder=new TextEncoder(),files:{path:string,content:Uint8Array}[]=[
  {path:'notas/index.json',content:encoder.encode(JSON.stringify(index,null,2)+'\n')},
  {path:'notas/index.html',content:encoder.encode(indiceNotas(index))},
  {path:`notas/${post.id}/index.html`,content:encoder.encode(paginaNota(post,fuente,post.id))},
  {path:`notas/${post.id}/nota.json`,content:encoder.encode(JSON.stringify(nota,null,2)+'\n')},
  ...imagenes.map((img,i)=>({path:`notas/${post.id}/lamina-${String(i+1).padStart(2,'0')}.jpg`,content:img}))
 ];
 const tree=[];for(const f of files){const blob=await call('/git/blobs','POST',{content:b64(f.content),encoding:'base64'});tree.push({path:f.path,mode:'100644',type:'blob',sha:blob.sha})}
 const newtree=await call('/git/trees','POST',{base_tree:commit.tree.sha,tree});
 const next=await call('/git/commits','POST',{message:`Publicar nota ${post.id}`,tree:newtree.sha,parents:[head]});
 alIntentarRef();
 // Una falla o timeout en este paso puede ser ambigua. El llamador conserva el bloqueo para revisión.
 const result=await call('/git/refs/heads/main','PATCH',{sha:next.sha,force:false});
 if(result.object?.sha!==next.sha)throw Error('No se pudo confirmar la publicación');
 return {sha:next.sha,url:`https://garbanzo96.github.io/nucleo-ia/notas/${post.id}/`};
}
