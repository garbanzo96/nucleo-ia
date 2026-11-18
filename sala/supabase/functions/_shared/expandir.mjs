export function identificador(input){
 if(typeof input!=='string'||input.length>300)throw Error('Identificador inválido');
 const x=input.trim().replace(/^https:\/\/doi\.org\//i,'').replace(/^DOI:/i,'');
 if(/^10\.\d{4,9}\/[a-z0-9._;()/:+-]+$/i.test(x))return 'DOI:'+x;
 if(/^[a-f0-9]{40}$/i.test(x))return x;
 throw Error('Se necesita un DOI o un identificador de Semantic Scholar');
}
export function ordenar(items,field){
 if(!Array.isArray(items))throw Error('Respuesta académica inválida');
 return items.map(x=>x?.[field]).filter(p=>p&&typeof p.title==='string').map(p=>({titulo:p.title,anio:Number.isInteger(p.year)?p.year:null,autores:Array.isArray(p.authors)?p.authors.map(a=>a?.name).filter(x=>typeof x==='string'):[],doi:typeof p.externalIds?.DOI==='string'?p.externalIds.DOI:null,citas:Number.isFinite(p.citationCount)?p.citationCount:0,url:null})).sort((a,b)=>b.citas-a.citas);
}
