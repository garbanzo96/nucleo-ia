import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';import * as editorial from '../_shared/editorial.mjs';import * as publicacion from '../_shared/publicacion.mjs';import * as fondo from '../_shared/fondo.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=fs.readFileSync(new URL('../_shared/posts.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};new Function('require','exports','module',compiled)(name=>name==='npm:@supabase/supabase-js@2.49.8'?{createClient(){}}:name==='./editorial.mjs'?editorial:name==='./publicacion.mjs'?publicacion:name==='./fondo.mjs'?fondo:require(name),m.exports,m);
const fuente={titulo:'Estudio',resumen:'Analizó 20 casos.',url:'https://arxiv.org/abs/2401.12345'};
const base={formato:'paper en simple',tipo_gancho:'cifra concreta',laminas:[{titulo:'Hallazgo',cuerpo:'Analizó 20 casos.',fuente:'arXiv',alt:'Hallazgo'}],descripcion:'Analizó 20 casos.',credito_imagen:'Una autora',checklist:{}};
const ganchos=[{tipo:'cifra concreta',texto:'Analizó 20 casos.'}],sugerencia_imagen={mostrar:'Una persona leyendo',busqueda:'person reading',prompt_ia:'Una persona leyendo, estilo editorial, 4:5'};
test('postEntrada conserva apoyos ya validados',()=>{const input={...base,ganchos,sugerencia_imagen};const stored=m.exports.postEntrada(input);assert.deepEqual(stored.ganchos,ganchos);assert.deepEqual(stored.sugerencia_imagen,sugerencia_imagen)});
test('guardar un borrador no exige fuente ni cifras respaldadas; aprobar sí',()=>{
 const libre={...base,fuente_primaria:'',laminas:[{titulo:'',cuerpo:'Afecta a 300 personas [revisar]',fuente:'Senado, 2026',alt:''}],sugerencia_imagen:{mostrar:'una sala'}};
 const s=m.exports.postEntrada(libre);assert.equal(s.fuente_primaria,null);assert.equal(s.laminas[0].cuerpo,'Afecta a 300 personas [revisar]');assert.equal(s.sugerencia_imagen.busqueda,'');
 const p={...base,laminas:Array.from({length:6},()=>({...base.laminas[0]}))},f={...fuente,fecha:'2026-01-01'};
 assert(publicacion.validarPost({...p,laminas:p.laminas.map(l=>({...l,fuente:'arXiv, 2026'}))},f,[]));
 assert.throws(()=>publicacion.validarPost({...p,laminas:p.laminas.map((l,i)=>i===2?{...l,cuerpo:'Fueron 300'}:l)},f,[]),/Lámina 3: .*300/);
});
test('guardar rechaza con un mensaje claro lo que no tiene forma de borrador',()=>{
 for(const [cambio,msg] of [[{laminas:[]},/entre 1 y 10/],[{formato:''},/formato/],[{fuente_primaria:'javascript:alert(1)'},/https/],[{laminas:[{titulo:1}]},/incompleta/]])assert.throws(()=>m.exports.postEntrada({...base,...cambio}),msg);
});

test('postEntrada conserva la imagen privada y sus ajustes; rechaza rutas inválidas',()=>{
 const input={...base,imagen_privada:'fondos/11111111-1111-4111-8111-111111111111.png',encuadre:32,oscurecimiento:44};
 const stored=m.exports.postEntrada(input);assert.equal(stored.imagen_privada,input.imagen_privada);assert.equal(stored.encuadre,32);assert.equal(stored.oscurecimiento,44);
 assert.throws(()=>m.exports.postEntrada({...input,imagen_privada:'../publica.png'},fuente,[]));
});
