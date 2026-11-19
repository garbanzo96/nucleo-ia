// Reglas deterministas: datos externos y texto generado se tratan como contenido, no como instrucciones.
export const tiposGancho=['hallazgo contraintuitivo','pregunta filosófica directa','cifra concreta','tensión entre dos hechos','escena o historia','cita textual de un investigador','qué cambió con una norma','mito contra evidencia','dilema con un caso'];
export function arxivId(url){
  let u; try{u=new URL(url)}catch{throw Error('Enlace de fuente inválido')}
  if(u.protocol!=='https:' || !['arxiv.org','www.arxiv.org'].includes(u.hostname) || u.username || u.password || u.port || u.search || u.hash) throw Error('Solo se admiten enlaces directos a resúmenes de arXiv');
  const match=u.pathname.match(/^\/abs\/(\d{4}\.\d{4,5}(?:v\d+)?)\/?$/);
  if(!match) throw Error('El enlace debe apuntar al resumen de un trabajo de arXiv');
  return match[1];
}
function unescapeXml(s){return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,x)=>{const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}; if(named[x])return named[x]; const n=x[1]?.toLowerCase()==='x'?parseInt(x.slice(2),16):parseInt(x.slice(1),10);return Number.isFinite(n)&&n>=0&&n<=0x10ffff?String.fromCodePoint(n):'';});}
export function arxivFuente(xml,id){
  if(typeof xml!=='string'||xml.length>524288||/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('Respuesta de fuente inválida');
  const entry=xml.match(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/i)?.[1];
  if(!entry) throw Error('La fuente no encontró el trabajo');
  const atomId=entry.match(/<id>([\s\S]*?)<\/id>/i)?.[1]?.trim();
  const pattern=id.replace('.','\\.')+(id.includes('v')?'':'(?:v\\d+)?');
  if(!atomId || !new RegExp('^https?://arxiv\\.org/abs/'+pattern+'/?$').test(atomId)) throw Error('La fuente devolvió otro trabajo');
  const get=tag=>unescapeXml((entry.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+tag+'>','i'))?.[1]||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
  const titulo=get('title'), resumen=get('summary');if(!titulo || resumen.length<60) throw Error('El resumen de la fuente no está disponible');
  const autores=[...entry.matchAll(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/gi)].map(x=>unescapeXml((x[1].match(/<name>([\s\S]*?)<\/name>/i)?.[1]||'').trim())).filter(Boolean);
  const fecha=get('published'); const doi=unescapeXml((entry.match(/<(?:arxiv:)?doi(?:\s[^>]*)?>([\s\S]*?)<\/(?:arxiv:)?doi>/i)?.[1]||'').trim())||null;
  return {titulo,resumen,autores,fecha,doi,url:'https://arxiv.org/abs/'+id};
}
export function doiId(url){
  let u;try{u=new URL(url)}catch{throw Error('Enlace de fuente inválido')}
  if(u.protocol!=='https:'||u.hostname!=='doi.org'||u.username||u.password||u.port||u.search||u.hash)throw Error('Solo se admiten enlaces HTTPS directos de DOI');
  let id;try{id=decodeURIComponent(u.pathname.slice(1))}catch{throw Error('DOI inválido')}
  if(id.length>300||!/^10\.\d{4,9}\/[a-z0-9._;()/:+-]+$/i.test(id))throw Error('DOI inválido');return id;
}
export function crossrefFuente(obj,id){
  const data=obj?.message;
  if(!data||String(data.DOI||'').toLowerCase()!==id.toLowerCase())throw Error('La fuente devolvió otro DOI');
  const titulo=typeof data.title?.[0]==='string'?data.title[0].trim():'';
  const resumen=unescapeXml(String(data.abstract||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
  if(!titulo||resumen.length<60)throw Error('El resumen de la fuente no está disponible');
  const autores=(Array.isArray(data.author)?data.author:[]).map(a=>[a?.given,a?.family].filter(x=>typeof x==='string'&&x.trim()).join(' ')).filter(Boolean);
  const parts=data.published?.['date-parts']?.[0]||[];const year=Number(parts[0]);
  const fecha=Number.isInteger(year)&&year>=1000&&year<=9999?`${year}-01-01`:'';
  const origen=typeof data['container-title']?.[0]==='string'?data['container-title'][0]:'Crossref';
  return {titulo,resumen,autores,fecha,doi:id,url:'https://doi.org/'+id,origen};
}
export function rotacion(formato,gancho,posts,n){
  if(!Number.isSafeInteger(n)||n<0||n>100) throw Error('La rotación no está configurada correctamente');
  if(posts.some(p=>!p.publicado_en))throw Error('Hay publicaciones sin fecha de publicación; completa sus fechas antes de generar');
  const recientes=[...posts].sort((a,b)=>b.publicado_en.localeCompare(a.publicado_en)).slice(0,n);
  if(recientes.some(p=>p.formato===formato||p.tipo_gancho===gancho))throw Error('El formato o el gancho se usó recientemente');
  return recientes;
}
function words(s){return s.trim().split(/\s+/u).filter(Boolean).length}
function textos(item){return [item.titulo,item.cuerpo,item.fuente,item.alt].filter(x=>typeof x==='string').join(' ')}
export function validarTexto(text, evidence, sourceUrl, prohibidas=[]){
  if(typeof text!=='string'||text.length>50000) throw Error('El texto generado no es válido');
  if(/\[[^\]]+\]|\b(?:TODO|TBD)\b/i.test(text)) throw Error('El borrador contiene marcadores pendientes');
  for(const link of text.match(/https?:\/\/[^\s<>)\]]+/gi)||[]) if(link.replace(/[.,;]+$/,'')!==sourceUrl) throw Error('El borrador contiene un enlace sin verificar');
  const clean=text.replace(/https?:\/\/[^\s<>)\]]+/gi,'');
  if(/\b10\.\d{4,9}\/[\w.()/:;-]+/i.test(clean)) throw Error('El borrador contiene un DOI sin verificar');
  const digits=clean.match(/\d+(?:[.,]\d+)?/g)||[];
  const sourceNumbers=new Set((evidence.match(/\d+(?:[.,]\d+)?/g)||[]).map(n=>n.replace(',','.')));
  const ajena=digits.find(n=>!sourceNumbers.has(n.replace(',','.')));if(ajena) throw Error(`Hay una cifra que no aparece en la fuente (${ajena})`);
  const normalized=text.toLocaleLowerCase('es');
  if(prohibidas.some(p=>typeof p==='string'&&p.trim()&&normalized.includes(p.toLocaleLowerCase('es')))) throw Error('El texto contiene una frase de la lista negra');
  if(/\bno\s+[^.!?\n]{1,120},?\s+sino\s+/i.test(text)) throw Error('El texto incumple las reglas de voz: usa "no X, sino Y"');
  if((text.match(/—/g)||[]).length>1) throw Error('El texto incumple las reglas de voz: más de una raya larga');
}
// Junta todos los problemas del borrador, con su ubicación, para devolvérselos al modelo y que corrija.
export function problemasBorrador(result,evidence,sourceUrl,prohibidas,recientes,formato,gancho){
  const p=[];const intentar=(donde,f)=>{try{f()}catch(e){p.push(donde+e.message)}};
  if(!result||typeof result!=='object'||!Array.isArray(result.laminas))return ['El borrador no trae la lista de láminas'];
  if(result.laminas.length<6||result.laminas.length>10)p.push(`El borrador debe tener entre 6 y 10 láminas y tiene ${result.laminas.length}`);
  if(!Array.isArray(result.ganchos)||result.ganchos.length<3||result.ganchos.length>5)p.push('El borrador debe ofrecer entre 3 y 5 ganchos');
  if(typeof result.descripcion!=='string'||!result.descripcion.trim())p.push('Falta la descripción');
  for(const [i,l] of result.laminas.entries()){
    if(!l||!['titulo','cuerpo','fuente','alt'].every(k=>typeof l[k]==='string')||!l.titulo.trim()||!l.alt.trim()){p.push(`Lámina ${i+1}: faltan título o texto alternativo`);continue}
    const n=words(l.titulo+' '+l.cuerpo);
    if(n>40)p.push(`Lámina ${i+1}: tiene ${n} palabras y el máximo es 40`);
    if(i===0&&words(l.titulo)>12)p.push(`Lámina 1: el título tiene ${words(l.titulo)} palabras y el máximo es 12`);
    intentar(`Lámina ${i+1}: `,()=>validarTexto(textos(l),evidence,sourceUrl,prohibidas));
  }
  const seen=new Set();
  for(const h of Array.isArray(result.ganchos)?result.ganchos:[]){
    if(!h||!tiposGancho.includes(h.tipo)||typeof h.texto!=='string'||!h.texto.trim()){p.push('Hay un gancho sin tipo válido o sin texto');continue}
    if(seen.has(h.tipo))p.push(`Gancho repetido: ${h.tipo}`);
    if(recientes.some(x=>x.tipo_gancho===h.tipo))p.push(`El tipo de gancho "${h.tipo}" se usó hace poco`);
    seen.add(h.tipo);intentar(`Gancho "${h.tipo}": `,()=>validarTexto(h.texto,evidence,sourceUrl,prohibidas));
  }
  if(Array.isArray(result.ganchos)&&!seen.has(gancho))p.push(`Falta un gancho del tipo pedido: ${gancho}`);
  if(recientes.some(x=>x.formato===formato))p.push('Formato usado recientemente');
  if(typeof result.descripcion==='string')intentar('Descripción: ',()=>validarTexto(result.descripcion,evidence,sourceUrl,prohibidas));
  if(!result.sugerencia_imagen)p.push('Falta la sugerencia de imagen');else intentar('Sugerencia de imagen: ',()=>validarApoyos([],result.sugerencia_imagen,evidence,sourceUrl,prohibidas));
  return p;
}
export function validarBorrador(result,evidence,sourceUrl,prohibidas,recientes,formato,gancho){
  const p=problemasBorrador(result,evidence,sourceUrl,prohibidas,recientes,formato,gancho);
  if(p.length)throw Error(p[0]);
  return result;
}
export function validarVerificacion(report,total){
  if(!report||!Array.isArray(report.laminas)||report.laminas.length!==total||report.laminas.some(x=>x?.respaldada!==true||typeof x?.explicacion!=='string'||!x.explicacion.trim())||report.descripcion_respaldada!==true)throw Error('La segunda pasada detectó afirmaciones sin respaldo o no pudo verificarlas');
}
export function parseJson(text){try{return JSON.parse(text.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,''))}catch{throw Error('El modelo no entregó JSON válido')}}

// Apoyos editoriales opcionales; se validan igual que el contenido antes de guardar.
export function validarApoyos(ganchos,imagen,evidence,sourceUrl,prohibidas=[]){
  if(ganchos==null)ganchos=[];
  if(!Array.isArray(ganchos)||ganchos.length>5)throw Error('Los ganchos deben ser una lista de hasta cinco alternativas');
  const vistos=new Set();
  const lista=ganchos.map(h=>{
    if(!h||typeof h!=='object'||Array.isArray(h)||!tiposGancho.includes(h.tipo)||typeof h.texto!=='string'||!h.texto.trim()||h.texto.length>1000||vistos.has(h.tipo))throw Error('Gancho inválido o repetido');
    vistos.add(h.tipo);validarTexto(h.texto,evidence,sourceUrl,prohibidas);return {tipo:h.tipo,texto:h.texto};
  });
  if(imagen==null)return {ganchos:lista,sugerencia_imagen:null};
  if(typeof imagen!=='object'||Array.isArray(imagen))throw Error('Sugerencia de imagen inválida');
  // mostrar: qué debe verse; busqueda: términos para Google Imágenes; prompt_ia: prompt para generarla.
  const claves=['mostrar','busqueda','prompt_ia'];
  if(!claves.every(k=>typeof imagen[k]==='string'&&imagen[k].trim()&&imagen[k].length<=1500))throw Error('Falta información de la sugerencia de imagen');
  if(claves.some(k=>/https?:\/\//i.test(imagen[k])))throw Error('La sugerencia de imagen no lleva enlaces');
  const sugerencia=Object.fromEntries(claves.map(k=>[k,imagen[k]]));
  validarTexto(sugerencia.mostrar,evidence,sourceUrl,prohibidas);
  return {ganchos:lista,sugerencia_imagen:sugerencia};
}

// Una versión antigua de la interfaz puede omitir los apoyos; omitirlos no los borra.
export function preservarApoyos(raw,actual){
  const ganchos=Object.hasOwn(raw,'ganchos')?raw.ganchos:actual?.ganchos;
  const sugerencia_imagen=Object.hasOwn(raw,'sugerencia_imagen')?raw.sugerencia_imagen:actual?.sugerencia_imagen;
  return {...raw,ganchos,sugerencia_imagen};
}

export function ejemplosVoz(posts){
  if(!Array.isArray(posts))return [];
  return posts.slice(0,10).map(p=>({formato:p.formato,tipo_gancho:p.tipo_gancho,descripcion:p.descripcion,laminas:p.laminas,diff:p.diff}));
}
