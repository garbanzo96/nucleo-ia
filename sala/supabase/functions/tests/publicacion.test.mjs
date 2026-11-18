import {test} from 'node:test';import assert from 'node:assert/strict';
import {validarPost,validarCuenta,validarChecklist,leerJpeg,leerJpegCompleto,sha256,huellaPost,huellaFuente,paginaNota,indiceNotas} from '../_shared/publicacion.mjs';
const fuente={titulo:'Análisis de un modelo',resumen:'El estudio incluye 20 personas y reconoce límites.',url:'https://arxiv.org/abs/2401.12345',autores:['Autora A'],fecha:'2026-01-01',doi:null};
const slide={titulo:'Un resultado',cuerpo:'El estudio incluye 20 personas.',fuente:'arXiv',alt:'Un resultado sobre 20 personas'};
function post(){return {formato:'paper en simple',tipo_gancho:'hallazgo contraintuitivo',laminas:Array.from({length:6},()=>({...slide})),descripcion:'El estudio incluye 20 personas.',credito_imagen:'Imagen: autora',checklist:{fuente_leida:true,cifras_verificadas:true,permiso_imagen:true,credito_imagen:true,sin_marcadores:true}}}
const jpeg=Uint8Array.from([0xff,0xd8,0xff,0xc0,0,11,8,0x05,0x46,0x04,0x38,1,1,0x11,0,0xff,0xd9]);
const encoded=b=>btoa(String.fromCharCode(...b));
test('fuente, cifras y checklist obligatorios',()=>{
 const p=post();assert(validarPost(p,fuente,[]));validarChecklist(p,'Ana');
 assert.throws(()=>validarPost({...p,laminas:p.laminas.slice(1)},fuente,[]));
 assert.throws(()=>validarPost({...p,descripcion:'El estudio incluye 50 personas.'},fuente,[]));
 assert.throws(()=>validarPost({...p,descripcion:'https://sitio-ejemplo.cl/'},fuente,[]));
 assert.throws(()=>validarChecklist({...p,checklist:{...p.checklist,permiso_imagen:false}},'Ana'));
 assert.throws(()=>validarChecklist({...p,checklist:{...p.checklist,credito_imagen:false}},'Ana'));assert.throws(()=>validarChecklist({...p,credito_imagen:''},'Ana'));assert.throws(()=>validarChecklist(p,''));
});
test('tamaño JPEG válido y hash para detectar cambios',async()=>{
 assert.equal(leerJpeg(encoded(jpeg)).length,jpeg.length);const wrong=jpeg.slice();wrong[10]=0x39;assert.throws(()=>leerJpeg(encoded(wrong)));
 assert.throws(()=>leerJpeg(encoded(jpeg.slice(0,-2))));assert.notEqual(await sha256(jpeg),await sha256(wrong));
});
test('las notas indexables escapan texto y mantienen referencia',()=>{
 const p=post();p.laminas[0].titulo='<script>alert(1)</script>';const html=paginaNota(p,fuente,'123');
 assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('Autora A'));assert(html.includes('https://arxiv.org/abs/2401.12345'));
 assert(indiceNotas([{slug:'123',titulo:'<img>'}]).includes('&lt;img&gt;'));
 assert.throws(()=>paginaNota(p,{...fuente,autores:[]},'123'));
});

test('cualquier edición de contenido o fuente cambia la huella aprobada',async()=>{
 const p={...post(),fuente_primaria:fuente.url};
 assert.notEqual(await huellaPost(p),await huellaPost({...p,descripcion:'Cambio'}));
 assert.notEqual(await huellaPost(p),await huellaPost({...p,checklist:{...p.checklist,sin_marcadores:false}}));
 assert.notEqual(await huellaFuente(fuente),await huellaFuente({...fuente,resumen:'Fuente actualizada'}));
});

test('la cuenta debe estar configurada antes de aprobar o publicar',()=>{assert.equal(validarCuenta('@nucleo_ia'),'@nucleo_ia');for(const s of [null,'','@[cuenta]','cuenta','@nombre con espacios'])assert.throws(()=>validarCuenta(s));});

test('el JPEG debe poder decodificarse por completo',()=>{
 assert.throws(()=>leerJpegCompleto(encoded(jpeg),()=>{throw Error('datos truncados')}));
 assert.throws(()=>leerJpegCompleto(encoded(jpeg),()=>({width:1080,height:1350,data:new Uint8Array(2)})));
 let opciones;const decoder=(_,o)=>{opciones=o;return {width:1080,height:1350,data:new Uint8Array(1080*1350*4)}};
 assert.equal(leerJpegCompleto(encoded(jpeg),decoder).length,jpeg.length);
 assert.equal(opciones.tolerantDecoding,false);
});

test('el crédito puede incluir versión de licencia sin atribuir una cifra al estudio',()=>{
 const p=post();p.credito_imagen='Fotografía: Ana Pérez, CC BY 4.0';
 assert(validarPost(p,fuente,[]));
});

test('la imagen de fondo solo apunta a un archivo privado válido y conserva ajustes',async()=>{
 const {validarFondo}=await import('../_shared/fondo.mjs');
 assert.deepEqual(validarFondo({imagen_privada:'fondos/11111111-1111-4111-8111-111111111111.jpg',encuadre:30,oscurecimiento:45}),{imagen_privada:'fondos/11111111-1111-4111-8111-111111111111.jpg',encuadre:30,oscurecimiento:45});
 assert.throws(()=>validarFondo({imagen_privada:'../publico/foto.jpg'}));
 assert.throws(()=>validarFondo({encuadre:101}));
 assert.throws(()=>validarFondo({oscurecimiento:-1}));
});
