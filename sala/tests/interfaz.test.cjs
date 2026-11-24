const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {webcrypto}=require('node:crypto');const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'), html=fs.readFileSync(path.join(root,'index.html'),'utf8'),source=fs.readFileSync(path.join(root,'sala.js'),'utf8');
function setup(){
 const dom=new JSDOM(html,{url:'https://test.local/sala/',runScripts:'outside-only'}),w=dom.window;w.ResizeObserver=class{observe(){}};w.confirm=()=>true;w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLImageElement.prototype.decode=async()=>{};w.structuredClone=structuredClone;Object.defineProperty(w,'crypto',{value:webcrypto});w.sessionStorage.setItem('nucleo-sala-clave-ia','sk-ant-api03-'+'x'.repeat(40));
 const calls=[],uploads=[],files=new Map(),rows={candidatos:[],papers:[],trabajos:[],prompts:[{id:1,agente:'redactar',version:1,activa:true,contenido:'Original'}],config:[{clave:'cuenta_instagram',valor:'@nucleo'},{clave:'formatos',valor:['paper en simple']}],fuentes:[],posts:[]};
 const db={functions:{async invoke(name,{body,headers}){calls.push({name,body,headers});if(name==='guardar_post'){serverPost={...body,id:'11111111-1111-4111-8111-111111111111',revision:body.id?body.revision+1:1,estado:'borrador',aprobacion:null,imagenes_aprobadas:null};rows.posts=[serverPost];return {data:{id:serverPost.id,revision:serverPost.revision,estado:'borrador'}}}if(name==='aprobar_post'){serverPost={...serverPost,estado:'aprobado',aprobacion:{cuenta_instagram:'@nucleo'},imagenes_aprobadas:body.imagenes.map((_,i)=>({path:`aprobaciones/${serverPost.id}/${i}.jpg`,sha256:'0'.repeat(64)}))};rows.posts=[serverPost];return {data:{id:serverPost.id,revision:1,estado:'aprobado'}}}if(name==='redactar')return {data:{borrador:{laminas:[{titulo:'Nuevo',cuerpo:'texto',fuente:'arXiv',alt:'Descripción'}],descripcion:'Texto',ganchos:[{tipo:'hallazgo contraintuitivo',texto:'Una idea inesperada'},{tipo:'pregunta filosófica directa',texto:'Una pregunta'}],sugerencia_imagen:{mostrar:'Una persona leyendo',busqueda:'lectura',prompt_ia:'Openverse'}},advertencia:'Revisa la fuente.'}};if(name==='reescribir')return {data:{contenido:{titulo:'Reescrito',cuerpo:'texto',fuente:'arXiv',alt:'Descripción'},advertencia:'Revisa la fuente.'}};if(name==='expandir')return {data:{referencias:[{titulo:'<script>Referencia</script>',anio:2025,autores:['Investigadora'],doi:'10.1234/test',citas:3}],citas:[{titulo:'Trabajo posterior',anio:2026,autores:[],doi:null,citas:1}]}};if(name==='publicar_web')return {error:{context:{clone:()=>({json:async()=>({error:'La publicación web está desactivada'})})}}};return {data:{}}}},
 from(table){return {select(){return this},eq(){return this},in(){return this},order(){return this},limit(){return this},single:async()=>({data:table==='config'?rows.config[0]:serverPost,error:null}),then(ok,fail){return Promise.resolve({data:rows[table],error:null}).then(ok,fail)}}},rpc:async(name,body)=>{calls.push({name,body});return {data:2,error:null}},storage:{from(){return {upload:async(path,file)=>{uploads.push(path);files.set(path,file);return {error:null}},download:async(path)=>({data:files.get(path)||{arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer},error:null})}}}};
 let serverPost=null;
 w.eval(source+'\nwindow.__test={setDb(x){db=x;usuario="Ana";config=[{clave:"cuenta_instagram",valor:"@nucleo"},{clave:"formatos",valor:["paper en simple"]}];renderConfig([])},setPost(x){post=x;dirty=true;current=0;fillEditor();syncControls()},prepareFake(){prepared=Array(post.laminas.length).fill("ZmFrZQ==");preparedVersion=visualVersion;preparedAccount=cuentaActual();syncControls()},getPost(){return post},load:refresh,recuperar:recuperarBorrador,images:imagenesAprobadas};');w.__test.setDb(db);
 const slide={titulo:'Una idea',cuerpo:'Texto',fuente:'arXiv',alt:'Una idea'};const post={laminas:Array.from({length:6},()=>({...slide})),descripcion:'Descripción',formato:'paper en simple',tipo_gancho:'hallazgo contraintuitivo',credito_imagen:'Autora',fuente_primaria:'https://arxiv.org/abs/2401.12345',checklist:{fuente_leida:true,cifras_verificadas:true,permiso_imagen:true,credito_imagen:true,sin_marcadores:true},estado:'borrador'};w.__test.setPost(post);return {w,db,calls,rows,uploads,setServer(x){serverPost={...serverPost,...x}}};
}
test('guardar y aprobar envía la revisión y las imágenes revisadas; al editar se bloquea publicación',async()=>{
 const {w,calls}=setup(),d=w.document;await d.getElementById('guardar-post').onclick();assert.equal(w.__test.getPost().revision,1);assert(d.getElementById('aprobar').disabled);
 w.__test.prepareFake();assert(!d.getElementById('aprobar').disabled);await d.getElementById('aprobar').onclick();const approval=calls.find(x=>x.name==='aprobar_post');assert.equal(approval.body.revision,1);assert.equal(approval.body.nombre,'Ana');assert.equal(approval.body.imagenes.length,6);assert.equal(w.__test.getPost().estado,'aprobado');assert(!d.getElementById('publicar-web').disabled);
 d.getElementById('fuente-primaria').value='https://arxiv.org/abs/2401.54321';d.getElementById('fuente-primaria').dispatchEvent(new w.Event('input'));assert(d.getElementById('publicar-web').disabled);assert(d.getElementById('descargar').disabled);
});
test('redacción y reescritura llaman al contrato y dejan cambios pendientes',async()=>{
 const {w,calls}=setup(),d=w.document;await d.getElementById('redactar').onclick();assert.equal(calls[0].name,'redactar');assert.match(calls[0].headers['x-ia-clave'],/^sk-ant-/);assert.equal(w.__test.getPost().laminas[0].titulo,'Nuevo');assert(d.getElementById('publicar-web').disabled);
 await d.getElementById('reescribir-lamina').onclick();assert.equal(calls.at(-1).body.tipo,'lamina');assert.equal(w.__test.getPost().laminas[0].titulo,'Reescrito');
});
test('el servidor desactivado informa el error, sin marcar como publicado',async()=>{
 const {w}=setup(),d=w.document;await d.getElementById('guardar-post').onclick();w.__test.prepareFake();await d.getElementById('aprobar').onclick();await d.getElementById('publicar-web').onclick();assert.match(d.getElementById('notice').textContent,/desactivada/);assert.equal(w.__test.getPost().estado,'aprobado');
});
test('restaurar prompt usa RPC y crea una versión, no sobrescribe',async()=>{const {w,calls}=setup();await w.__test.load();await w.document.getElementById('prompt-activar').onclick();const rpc=calls.find(x=>x.name==='nueva_version_prompt');assert.equal(rpc.body.texto,'Original');assert.equal(rpc.body.nombre_agente,'redactar');});
test('si una imagen privada cambia se bloquea la descarga',async()=>{const {w}=setup();await w.document.getElementById('guardar-post').onclick();w.__test.prepareFake();await w.document.getElementById('aprobar').onclick();await assert.rejects(()=>w.__test.images(),/cambió desde la aprobación/);});

test('una aprobación cambiada en otra sesión impide la descarga',async()=>{const {w,setServer}=setup();await w.document.getElementById('guardar-post').onclick();w.__test.prepareFake();await w.document.getElementById('aprobar').onclick();setServer({estado:'borrador',revision:2});await assert.rejects(()=>w.__test.images(),/aprobación cambió/);});
test('una cuenta cambiada en otra sesión impide la descarga',async()=>{const {w,rows}=setup();await w.document.getElementById('guardar-post').onclick();w.__test.prepareFake();await w.document.getElementById('aprobar').onclick();rows.config[0].valor='@otra';await assert.rejects(()=>w.__test.images(),/cuenta configurada cambió/);});

test('ganchos y sugerencia persisten al guardar y reabrir el borrador',async()=>{
 const {w,calls}=setup(),d=w.document;await d.getElementById('redactar').onclick();await d.getElementById('guardar-post').onclick();
 const payload=calls.find(x=>x.name==='guardar_post').body;assert.equal(payload.ganchos.length,2);assert.equal(payload.sugerencia_imagen.prompt_ia,'Openverse');
 d.getElementById('nuevo-post').onclick();d.getElementById('post-lista').value=payload.id||'11111111-1111-4111-8111-111111111111';d.getElementById('abrir-post').onclick();
 assert.equal(d.getElementById('ganchos').options.length,3);assert.equal(d.getElementById('idea-prompt_ia').value,'Openverse');
});
test('editar sugerencia invalida aprobación y guardar aumenta revisión',async()=>{
 const {w}=setup(),d=w.document;await d.getElementById('redactar').onclick();await d.getElementById('guardar-post').onclick();w.__test.prepareFake();await d.getElementById('aprobar').onclick();assert.equal(w.__test.getPost().estado,'aprobado');
 d.getElementById('idea-busqueda').value='biblioteca';d.getElementById('idea-busqueda').dispatchEvent(new w.Event('input'));assert.equal(w.__test.getPost().estado,'borrador');assert(d.getElementById('publicar-web').disabled);
 await d.getElementById('guardar-post').onclick();assert.equal(w.__test.getPost().revision,2);assert.equal(w.__test.getPost().sugerencia_imagen.busqueda,'biblioteca');assert.match(d.getElementById('buscar-google').href,/tbm=isch&q=biblioteca/);
});

test('guardar y reabrir conserva imagen privada, encuadre y oscurecimiento',async()=>{
 const {File}=require('node:buffer'),{w,calls,uploads}=setup(),d=w.document;
 const file=new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'fondo.png',{type:'image/png'});
 Object.defineProperty(d.getElementById('imagen'),'files',{value:[file],configurable:true});
 await d.getElementById('imagen').onchange();
 d.getElementById('encuadre').value='32';d.getElementById('encuadre').dispatchEvent(new w.Event('input'));
 d.getElementById('oscurecer').value='44';d.getElementById('oscurecer').dispatchEvent(new w.Event('input'));
 await d.getElementById('guardar-post').onclick();
 const saved=calls.find(x=>x.name==='guardar_post').body;
 assert.equal(uploads.length,1);assert.equal(saved.imagen_privada,uploads[0]);assert.equal(saved.encuadre,32);assert.equal(saved.oscurecimiento,44);
 d.getElementById('nuevo-post').onclick();d.getElementById('post-lista').value=saved.id||'11111111-1111-4111-8111-111111111111';
 await d.getElementById('abrir-post').onclick();
 assert.equal(d.getElementById('encuadre').value,'32');assert.equal(d.getElementById('oscurecer').value,'44');
 assert.match(d.querySelector('.slide-photo').style.backgroundImage,/blob:test/);
});

test('un archivo inválido no reemplaza la imagen ni se envía a Storage',async()=>{
 const {File}=require('node:buffer'),{w,uploads}=setup(),d=w.document;
 const file=new File([new Uint8Array(16)],'falso.png',{type:'image/png'});
 Object.defineProperty(d.getElementById('imagen'),'files',{value:[file],configurable:true});
 await d.getElementById('imagen').onchange();assert.match(d.getElementById('notice').textContent,/contenido no corresponde/);
 await d.getElementById('guardar-post').onclick();assert.equal(uploads.length,0);
});
test('quitar imagen después de aprobar invalida la publicación',async()=>{
 const {w}=setup(),d=w.document;await d.getElementById('guardar-post').onclick();w.__test.prepareFake();await d.getElementById('aprobar').onclick();
 assert.equal(w.__test.getPost().estado,'aprobado');d.getElementById('quitar-imagen').onclick();
 assert.equal(w.__test.getPost().estado,'borrador');assert.equal(w.__test.getPost().imagen_privada,null);assert(d.getElementById('publicar-web').disabled);
});

test('expandir muestra referencias y citas de forma segura',async()=>{
 const {w,rows,calls}=setup(),d=w.document;rows.papers=[{id:'papera',titulo:'Paper',doi:'10.1234/test',abstract:'Resumen',ficha_basada_en_abstract:true,hallazgo:'no consta',pregunta:'¿Sirve?',citas:{pregunta:'¿Sirve?'},texto_fuente:'resumen'}];
 await w.__test.load();const box=d.getElementById('resultados-biblioteca'),button=box.querySelector('[data-expandir]');assert(button);
 assert.match(box.querySelector('details').textContent,/Pregunta¿Sirve\?/);assert.match(box.querySelector('details').textContent,/Hallazgono consta/);assert.match(box.textContent,/Ficha desde resumen/);
 await box.onclick({target:button});const call=calls.find(x=>x.name==='expandir');assert.equal(call.body.identificador,'10.1234/test');
 assert.match(box.textContent,/Referencia/);assert.match(box.textContent,/Trabajo posterior/);assert.equal(box.querySelector('script'),null);
});

test('no permite guardar ni aprobar mientras valida una imagen nueva',async()=>{
 const {File}=require('node:buffer'),{w,calls}=setup(),d=w.document;let release;
 w.HTMLImageElement.prototype.decode=()=>new Promise(resolve=>{release=resolve});
 const file=new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'fondo.png',{type:'image/png'});
 Object.defineProperty(d.getElementById('imagen'),'files',{value:[file],configurable:true});
 const pending=d.getElementById('imagen').onchange();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(d.getElementById('guardar-post').disabled,true);await d.getElementById('guardar-post').onclick();
 assert.equal(calls.some(c=>c.name==='guardar_post'),false);assert(d.getElementById('aprobar').disabled);
 release();await pending;assert.equal(d.getElementById('guardar-post').disabled,false);
});
test('sin clave propia se usa la IA de la sala; la clave solo viaja a funciones con IA',async()=>{
 const {w,calls}=setup(),d=w.document;await d.getElementById('guardar-post').onclick();assert.equal(calls.at(-1).headers?.['x-ia-clave'],undefined);
 d.getElementById('borrar-clave').onclick();assert.match(d.getElementById('estado-clave').textContent,/IA del Núcleo/);
 w.__test.setPost({...w.__test.getPost(),laminas:[{titulo:'',cuerpo:'',fuente:'',alt:''}]});await d.getElementById('redactar').onclick();
 const r=calls.filter(x=>x.name==='redactar').at(-1);assert.ok(r);assert.equal(r.headers['x-ia-clave'],undefined);
 assert.equal(d.getElementById('evaluar'),null);
});
test('las historias del radar muestran cobertura; guardadas siguen en el radar y desde la biblioteca se redactan con su contexto',async()=>{
 const {w,calls,rows}=setup(),d=w.document;
 rows.historias=[
  {id:'h1',titulo:'La UE multa a una empresa por su IA',resumen:'Según la UE…',angulo:'Qué cambia',gancho:'La primera multa',formato:'paper en simple',tipo_gancho:'cifra concreta',estado:'guardado',puntaje:8,cobertura:3,fuente_url:'https://prensa.cl/nota',fuente_primaria:null,notas:[{medio:'A',titulo:'t1',url:'https://a.cl/1'},{medio:'B',titulo:'t2',url:'https://b.cl/2'},{medio:'C',titulo:'t3',url:'https://c.cl/3'}]},
  {id:'h2',titulo:'Otra historia',estado:'nuevo',puntaje:5,cobertura:1,fuente_url:'https://x.cl',notas:[]},
  {id:'h3',titulo:'Descartada',estado:'descartado',puntaje:9,cobertura:1,fuente_url:'https://y.cl',notas:[]}];
 await w.__test.load();
 d.getElementById('ver-historias').click();
 const radar=d.getElementById('candidatos').textContent;
 assert.match(radar,/3 medios/);assert.match(radar,/Guardada/);assert.doesNotMatch(radar,/Descartada/);
 assert.ok(radar.indexOf('La UE multa')<radar.indexOf('Otra historia'));
 assert.match(d.getElementById('resultados-biblioteca').textContent,/La UE multa/);
 d.getElementById('resultados-biblioteca').querySelector('button[data-accion="usar"]').click();
 await new Promise(r=>setTimeout(r,0));
 const r=calls.filter(x=>x.name==='redactar').at(-1);
 assert.equal(r.body.fuente_primaria,'https://prensa.cl/nota');assert.equal(r.body.tema.angulo,'Qué cambia');assert.equal(r.body.tipo_gancho,'cifra concreta');
});
test('la vista de todas las notas muestra lo recolectado en español y las notas guardadas vuelven a la biblioteca',async()=>{
 const {w,calls,rows}=setup(),d=w.document;
 rows.candidatos=[{id:'c1',titulo:'AI models cost more in Spanish',titulo_es:'Los modelos de IA cuestan más en español',resumen:'r',url:'https://a.cl/1',estado:'guardado',creado_en:'2026-11-18'},{id:'c2',titulo:'Otra',url:'https://b.cl/2',estado:'nuevo',creado_en:'2026-11-17'},{id:'c3',titulo:'Descartada',url:'https://c.cl/3',estado:'descartado'}];
 await w.__test.load();
 const radar=d.getElementById('candidatos').textContent;
 assert.match(radar,/Los modelos de IA cuestan más en español/);assert.match(radar,/AI models cost more/);assert.doesNotMatch(radar,/Descartada/);
 assert.match(d.getElementById('ver-notas').textContent,/\(2\)/);
 d.getElementById('radar-buscar').value='otra';d.getElementById('radar-buscar').dispatchEvent(new w.Event('input'));
 assert.doesNotMatch(d.getElementById('candidatos').textContent,/cuestan/);
 assert.match(d.getElementById('resultados-biblioteca').textContent,/cuestan más en español/);
 d.getElementById('resultados-biblioteca').querySelector('button[data-c="c1"][data-accion="usar"]').click();
 await new Promise(r=>setTimeout(r,0));
 assert.equal(calls.filter(x=>x.name==='redactar').at(-1).body.fuente_primaria,'https://a.cl/1');
});
test('pegar una imagen en el editor la usa como fondo',async()=>{
 const {w}=setup(),d=w.document;d.getElementById('editor').hidden=false;
 const archivo=new w.File([new Uint8Array([0xff,0xd8,0xff])],'pegada.jpg',{type:'image/jpeg'});
 const ev=new w.Event('paste',{bubbles:true,cancelable:true});ev.clipboardData={items:[{kind:'file',getAsFile:()=>archivo}]};
 d.body.dispatchEvent(ev);
 assert.ok(ev.defaultPrevented);assert.match(d.getElementById('notice').textContent,/Imagen pegada/);
 const texto=new w.Event('paste',{bubbles:true,cancelable:true});texto.clipboardData={items:[{kind:'string',getAsFile:()=>null}]};
 d.body.dispatchEvent(texto);assert.ok(!texto.defaultPrevented);
});

test('si una tabla falla, el resto de la sala carga igual y se avisa cuál',async()=>{
 const {w,db,rows}=setup(),d=w.document,from=db.from;rows.historias=[];
 rows.candidatos=[{id:'c1',titulo:'Nota viva',url:'https://a.cl',estado:'nuevo',creado_en:'2026-11-18'}];
 db.from=t=>t==='papers'?{select(){return this},order(){return this},then(ok){return Promise.resolve({data:null,error:{message:'timeout'}}).then(ok)}}:from(t);
 await w.__test.load();assert.match(d.getElementById('candidatos').textContent,/Nota viva/);assert.match(d.getElementById('notice').textContent,/papers/);
});
test('un borrador sin guardar vuelve al entrar y se limpia al guardar',async()=>{
 const {w}=setup(),d=w.document;d.getElementById('titulo').value='Texto a medias';d.getElementById('titulo').dispatchEvent(new w.Event('input'));
 assert.match(w.localStorage.getItem('nucleo-sala-respaldo'),/Texto a medias/);
 const respaldo=w.localStorage.getItem('nucleo-sala-respaldo');
 await d.getElementById('guardar-post').onclick();assert.equal(w.localStorage.getItem('nucleo-sala-respaldo'),null);
 d.getElementById('nuevo-post').onclick();w.localStorage.setItem('nucleo-sala-respaldo',respaldo);
 await w.__test.recuperar();assert.equal(w.__test.getPost().laminas[0].titulo,'Texto a medias');assert.match(d.getElementById('notice').textContent,/Recuperé/);
});
test('mientras se redacta no parte otro borrador y sin fuente no se llama al servidor',async()=>{
 const {w,db,calls,rows}=setup(),d=w.document;let soltar;const inv=db.functions.invoke;
 rows.candidatos=[{id:'c1',titulo:'Uno',url:'https://a.cl/1',estado:'nuevo',creado_en:'2026-11-18'}];rows.historias=[];await w.__test.load();
 w.__test.setPost({...w.__test.getPost(),laminas:[{titulo:'',cuerpo:'',fuente:'',alt:''}],fuente_primaria:''});
 await d.getElementById('redactar').onclick();assert.equal(calls.filter(c=>c.name==='redactar').length,0);assert.match(d.getElementById('notice').textContent,/enlace de la fuente/);
 db.functions.invoke=async(n,o)=>{if(n==='redactar')await new Promise(r=>{soltar=r});return inv(n,o)};
 const b=()=>d.querySelector('button[data-c="c1"][data-accion="usar"]').click();b();await new Promise(r=>setTimeout(r,0));b();await new Promise(r=>setTimeout(r,0));
 assert.match(d.getElementById('notice').textContent,/en proceso/);soltar();await new Promise(r=>setTimeout(r,5));assert.equal(calls.filter(c=>c.name==='redactar').length,1);
});
test('los errores del servidor se explican: sesión vencida, demora y causa propia',async()=>{
 const {w,db}=setup(),d=w.document,caso=async(status,body)=>{db.functions.invoke=async()=>({error:{context:{status,clone:()=>({json:async()=>body})}}});await d.getElementById('guardar-post').onclick();return d.getElementById('notice').textContent};
 assert.match(await caso(401,{}),/sesión terminó/);assert.match(await caso(403,{error:'Sin acceso'}),/sesión terminó/);assert.match(await caso(504,{}),/tardó demasiado/);assert.match(await caso(422,{error:'Otra persona guardó'}),/Otra persona guardó/);
});
test('recargar el radar no cierra las notas abiertas y el almacenamiento dañado no impide abrir',async()=>{
 const {w,rows}=setup(),d=w.document;rows.historias=[];rows.candidatos=[{id:'c1',titulo:'Uno',url:'https://a.cl/1',estado:'nuevo',creado_en:'2026-11-18'}];
 await w.__test.load();d.querySelector('[data-fila="c1"]').open=true;await w.__test.load();assert(d.querySelector('[data-fila="c1"]').open);
 w.localStorage.setItem('nucleo-sala-respaldo','{roto');await w.__test.recuperar();
});
test('reescribir conserva el tipo de lámina y no se pasa de 10 láminas',async()=>{
 const {w}=setup(),d=w.document;w.__test.getPost().laminas[0].tipo='dato';await d.getElementById('reescribir-lamina').onclick();assert.equal(w.__test.getPost().laminas[0].tipo,'dato');
 for(let i=0;i<8;i++)d.getElementById('agregar').onclick();assert.equal(w.__test.getPost().laminas.length,10);assert.match(d.getElementById('notice').textContent,/10 láminas/);
});
test('la foto general llega a todas las láminas y cada foto va a las láminas que se elijan',async()=>{
 const {File}=require('node:buffer'),{w,calls,uploads}=setup(),d=w.document,$=id=>d.getElementById(id);let n=0;w.URL.createObjectURL=()=>'blob:'+(++n);
 const pegar=async()=>{Object.defineProperty($('imagen'),'files',{value:[new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'f.png',{type:'image/png'})],configurable:true});await $('imagen').onchange()};
 const ir=i=>{for(let k=0;k<10;k++)$('anterior').onclick();for(let k=0;k<i;k++)$('siguiente').onclick()};
 const modo=v=>{$('imagen-destino').value=v;$('imagen-destino').onchange()};
 const mapa=()=>[...$('foto-laminas').children].map(b=>b.style.backgroundImage.match(/blob:(\d)/)?.[1]||'-').join('');
 const marcadas=()=>[...$('foto-laminas').children].map(b=>b.getAttribute('aria-pressed')==='true'?'x':'.').join('');
 const prev=()=>$('preview').dataset;
 assert.equal($('imagen-destino').value,'todas');await pegar();assert.equal(mapa(),'111111');
 for(let i=0;i<6;i++){ir(i);assert.match(d.querySelector('.slide-photo').style.backgroundImage,/blob:1/);assert.ok(prev().foto)}
 assert.equal($('siguiente').hidden,true);assert.equal($('anterior').hidden,false);
 ir(3);assert.equal($('imagen-destino').value,'esta');assert.equal(marcadas(),'...x..');await pegar();assert.equal(mapa(),'111211');
 $('encuadre').value='10';$('encuadre').dispatchEvent(new w.Event('input'));
 ir(2);assert.equal(prev().mitad,undefined);assert.equal($('encuadre').value,'50');ir(0);assert.equal(prev().mitad,'izq');
 await $('guardar-post').onclick();const saved=calls.find(x=>x.name==='guardar_post').body;
 assert.equal(uploads.length,2);assert.deepEqual([saved.imagen_privada,saved.laminas[3].imagen],uploads);assert.equal(saved.laminas[3].encuadre,10);assert.equal(saved.laminas[2].imagen,undefined);
 await $('guardar-post').onclick();assert.equal(uploads.length,2);
 // De aquí en adelante: foto nueva desde la lámina 5; seguidas, se reparten mitad y mitad.
 ir(4);modo('adelante');assert.equal(marcadas(),'....xx');await pegar();assert.equal(mapa(),'111233');assert.equal(prev().mitad,'izq');ir(5);assert.equal(prev().mitad,'der');
 $('encuadre').value='80';$('encuadre').dispatchEvent(new w.Event('input'));assert.equal(w.__test.getPost().laminas[4].encuadre,80);
 // Esta y otra: elegir láminas sueltas y poner una foto que ya está en el borrador.
 ir(1);$('foto-laminas').children[4].onclick();assert.equal($('imagen-destino').value,'elegir');assert.equal(marcadas(),'.x..x.');ir(3);assert.equal(marcadas(),'.x..x.');
 $('foto-usadas').children[1].onclick();assert.equal(mapa(),'121223');assert.equal(w.__test.getPost().laminas[1].encuadre,10);assert.match($('notice').textContent,/láminas 2 y 5/);
 // Quitar deja la lámina sin foto, y la general se puede volver a poner.
 ir(2);$('quitar-imagen').onclick();assert.equal(mapa(),'12-223');assert.equal(prev().foto,undefined);$('foto-usadas').children[0].onclick();assert.equal(mapa(),'121223');assert.equal(w.__test.getPost().laminas[2].imagen,undefined);
 $('foto-laminas').children[2].onclick();await pegar();assert.match($('notice').textContent,/Marca al menos una/);
 modo('todas');$('foto-usadas').children[2].onclick();assert.equal(mapa(),'333333');assert.ok(w.__test.getPost().laminas.every(l=>!l.imagen));
});
test('las flechas del teclado cambian de lámina salvo al escribir',()=>{
 const {w}=setup(),d=w.document;d.getElementById('app').hidden=false;d.getElementById('editor').hidden=false;const tecla=(el,key)=>el.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
 tecla(d.body,'ArrowRight');assert.equal(d.getElementById('contador').textContent,'2 / 6');tecla(d.getElementById('titulo'),'ArrowRight');assert.equal(d.getElementById('contador').textContent,'2 / 6');tecla(d.body,'ArrowLeft');assert.equal(d.getElementById('contador').textContent,'1 / 6');
});
test('el respaldo local no guarda referencias a fotos que no se subieron',async()=>{
 const {File}=require('node:buffer'),{w}=setup(),d=w.document;
 Object.defineProperty(d.getElementById('imagen'),'files',{value:[new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'f.png',{type:'image/png'})],configurable:true});
 await d.getElementById('imagen').onchange();assert.ok(w.__test.getPost().imagen_privada);
 const r=()=>JSON.parse(w.localStorage.getItem('nucleo-sala-respaldo')).post;assert.equal(r().imagen_privada,null);
 await d.getElementById('guardar-post').onclick();d.getElementById('credito').oninput();assert.match(r().imagen_privada,/^fondos/);
});
