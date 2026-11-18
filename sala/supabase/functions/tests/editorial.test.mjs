import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arxivId,arxivFuente,rotacion,validarTexto,validarBorrador,validarVerificacion} from '../_shared/editorial.mjs';

test('solo admite el resumen HTTPS de arXiv sin credenciales, puerto, consulta ni redirecciones elegidas por usuario',()=>{
 assert.equal(arxivId('https://arxiv.org/abs/2401.12345'),'2401.12345');
 for(const url of ['http://arxiv.org/abs/2401.12345','https://arxiv.org.evil.test/abs/2401.12345','https://arxiv.org@evil.test/abs/2401.12345','https://arxiv.org:444/abs/2401.12345','https://arxiv.org/abs/2401.12345?next=foo','https://127.0.0.1/abs/2401.12345'])assert.throws(()=>arxivId(url));
});
test('comprueba trabajo y resumen antes de generar',()=>{
 const xml='<feed><entry><id>http://arxiv.org/abs/2401.12345v1</id><title>Un estudio</title><summary>Este es un resumen suficientemente largo para que no se use como respaldo un texto incompleto de una línea.</summary></entry></feed>';
 assert.equal(arxivFuente(xml,'2401.12345').titulo,'Un estudio'); assert.throws(()=>arxivFuente(xml,'2402.12345')); assert.throws(()=>arxivFuente('<!DOCTYPE a>'+xml,'2401.12345'));
});
test('rota con fecha de publicación y falla ante datos históricos incompletos',()=>{
 const p=[{formato:'historia',tipo_gancho:'cifra concreta',publicado_en:'2026-11-18T00:00:00Z'}];
 assert.throws(()=>rotacion('historia','dilema con un caso',p,1)); assert.throws(()=>rotacion('concepto','cifra concreta',p,1)); assert.throws(()=>rotacion('concepto','dilema con un caso',[{...p[0],publicado_en:null}],1)); assert.equal(rotacion('concepto','dilema con un caso',p,1).length,1);
});
test('bloquea cifras, DOI, URLs o frases no respaldadas',()=>{
 const ev='El estudio encuestó a 20 personas'; const src='https://arxiv.org/abs/2401.12345';
 validarTexto('El estudio encuestó a 20 personas',ev,src,[]);
 for(const str of ['Participaron 21 personas','Ver https://evil.test/x','DOI 10.1111/abc','Esto es fascinante'])assert.throws(()=>validarTexto(str,ev,src,['fascinante']));
});
test('validación de borrador y segunda pasada no concede aprobación',()=>{
 const lamina={titulo:'Una pregunta',cuerpo:'Una idea',fuente:'arXiv',alt:'Una pregunta y una idea'};
 const data={laminas:Array.from({length:6},()=>({...lamina})),ganchos:[{tipo:'hallazgo contraintuitivo',texto:'Una idea'},{tipo:'pregunta filosófica directa',texto:'Una pregunta'},{tipo:'mito contra evidencia',texto:'Un caso'}],descripcion:'Una idea',sugerencia_imagen:{mostrar:'Un libro',terminos:'Libro',donde:'Openverse',licencia:'Revisar licencia'}};
 assert.equal(validarBorrador(data,'Una idea','https://arxiv.org/abs/2401.12345',[],[],'concepto clave','mito contra evidencia'),data);
 assert.throws(()=>validarBorrador({...data,laminas:data.laminas.slice(1)},'Una idea','https://arxiv.org/abs/2401.12345',[],[],'concepto clave','mito contra evidencia'));
 assert.throws(()=>validarVerificacion({laminas:[{respaldada:false,explicacion:'sin fuente'}],descripcion_respaldada:true},1));
 validarVerificacion({laminas:[{respaldada:true,explicacion:'El resumen lo indica'}],descripcion_respaldada:true},1);
});

test('admite DOI verificables sin abrir destinos arbitrarios',async()=>{
 const {doiId,crossrefFuente,validarTexto}=await import('../_shared/editorial.mjs');
 assert.equal(doiId('https://doi.org/10.1234/abc'), '10.1234/abc');
 for(const u of ['http://doi.org/10.1234/abc','https://evil.test/10.1234/abc','https://doi.org/10.1234/abc?x=1'])assert.throws(()=>doiId(u));
 const obj={message:{DOI:'10.1234/abc',title:['Un estudio'],abstract:'<jats:p>Un resumen suficientemente largo para proporcionar evidencia verificable y presentar los límites del estudio.</jats:p>',author:[{given:'Ana',family:'Pérez'}],published:{'date-parts':[[2025]]},'container-title':['Revista']}};
 const f=crossrefFuente(obj,'10.1234/abc');assert.equal(f.url,'https://doi.org/10.1234/abc');assert.deepEqual(f.autores,['Ana Pérez']);assert.equal(f.origen,'Revista');
 validarTexto('Fuente: https://doi.org/10.1234/abc',f.titulo+' '+f.resumen,f.url,[]);
 assert.throws(()=>crossrefFuente({...obj,message:{...obj.message,DOI:'10.1234/otro'}},'10.1234/abc'));
});
