import {test} from 'node:test';import assert from 'node:assert/strict';import {validarApoyos,preservarApoyos} from '../_shared/editorial.mjs';
const fuente='El estudio examinó 20 casos.',url='https://arxiv.org/abs/2401.12345';
const g=[{tipo:'cifra concreta',texto:'El estudio examinó 20 casos.'},{tipo:'pregunta filosófica directa',texto:'¿Qué significa actuar?'}];
const idea={mostrar:'Una persona leyendo',terminos:'lectura',donde:'Openverse',licencia:'Revisar licencia de la imagen'};
test('conserva ganchos y sugerencia válidos sin campos adicionales',()=>{
 const result=validarApoyos(g,{...idea,inesperado:'ignorar'},fuente,url,[]);assert.deepEqual(result.ganchos,g);assert.deepEqual(result.sugerencia_imagen,idea);assert.deepEqual(validarApoyos(null,null,fuente,url,[]),{ganchos:[],sugerencia_imagen:null});
});
test('rechaza tipos duplicados, cifras sin respaldo y estructuras inválidas',()=>{
 for(const x of [[g[0],g[0]],[{tipo:'otro',texto:'Una idea'}],[{tipo:'cifra concreta',texto:'Examinó 50 casos'}],Array(6).fill(g[0]),'texto'])assert.throws(()=>validarApoyos(x,idea,fuente,url,[]));
});
test('rechaza una sugerencia incompleta, enlaces desconocidos o lista negra',()=>{
 for(const x of [{...idea,licencia:''},{...idea,donde:'https://evil.test'}, {...idea,mostrar:'fascinante'},[],{...idea,terminos:'x'.repeat(1001)}])assert.throws(()=>validarApoyos(g,x,fuente,url,['fascinante']));
});

test('un cliente anterior conserva apoyos omitidos; vaciarlos es explícito',()=>{
 const actual={ganchos:g,sugerencia_imagen:idea},cambios={descripcion:'Editada'};
 const preservado=preservarApoyos(cambios,actual);assert.deepEqual(preservado.ganchos,g);assert.deepEqual(preservado.sugerencia_imagen,idea);
 const borrado=preservarApoyos({...cambios,ganchos:[],sugerencia_imagen:null},actual);assert.deepEqual(borrado.ganchos,[]);assert.equal(borrado.sugerencia_imagen,null);
});
