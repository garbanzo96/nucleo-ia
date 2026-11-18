// Integración local de las migraciones con PGlite (Postgres en WASM con pgvector), sin cuentas ni red.
// Correr: PGLITE_DIR=/private/tmp/nucleo-pglite node --test sala/tests/integracion_db.test.mjs
// (PGLITE_DIR es una carpeta con `npm install @electric-sql/pglite`; no se agrega al repo.)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const dir = process.env.PGLITE_DIR;
const migraciones = new URL('../supabase/migrations/', import.meta.url);
const MIEMBRO = '11111111-1111-4111-8111-111111111111', AJENO = '22222222-2222-4222-8222-222222222222';
// Una fila válida por tabla: si el insert falla, es por permisos o RLS y no por restricciones.
const FILAS = {
  fuentes: `(id,nombre,url,tipo) values ('x','X','https://x.cl','n')`, candidatos: `(titulo,url) values ('X','https://x.cl/z')`,
  papers: `(titulo) values ('X')`, posts: `(formato,tipo_gancho) values ('historia','cifra concreta')`,
  prompts: `(agente,version,contenido) values ('x',1,'x')`, config: `values ('x','1')`, trabajos: `(tipo) values ('noticias')`,
  miembros_sala: `values ('${AJENO}')`, publicacion_lock: `(id) values (false)`,
};
const TABLAS = Object.keys(FILAS);

// Lo que Supabase da por hecho: roles, auth.uid() desde el JWT, storage y los permisos por defecto del esquema public.
const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets(id text primary key, name text not null, public boolean default false, allowed_mime_types text[], file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
-- Como en los proyectos nuevos de Supabase: sin grants de tabla por defecto; los da la migración 010.
alter default privileges in schema extensions grant all on functions to anon, authenticated, service_role;
`;

async function abrir() {
  const base = join(dir, 'node_modules/@electric-sql/pglite/dist');
  const {PGlite} = await import(pathToFileURL(join(base, 'index.js')));
  const {vector} = await import(pathToFileURL(join(base, 'vector/index.js')));
  const db = new PGlite({extensions: {vector}});
  await db.exec(STUB);
  for (const f of readdirSync(migraciones).filter(f => f.endsWith('.sql')).sort())
    await db.exec(readFileSync(new URL(f, migraciones), 'utf8')).catch(e => { throw Error(`${f}: ${e.message}`); });
  await db.exec(`insert into auth.users values ('${MIEMBRO}'), ('${AJENO}'); insert into public.miembros_sala values ('${MIEMBRO}');
    insert into public.fuentes(id,nombre,url,tipo) values ('f1','Fuente','https://ejemplo.cl','noticias');
    insert into public.candidatos(titulo,url,fuente_id,estado,embedding) values ('Gobernanza de IA','https://ejemplo.cl/a','f1','guardado', array_fill(0.1::real, array[768])::extensions.vector);
    insert into public.papers(doi,titulo,embedding) values ('10.1/x','Paper cercano', array_fill(0.1::real, array[768])::extensions.vector), ('10.1/y','Paper lejano', (array[1::real] || array_fill(0::real, array[767]))::extensions.vector);`);
  return db;
}

// Ejecuta como un rol con el JWT simulado; siempre vuelve a superusuario.
async function como(db, rol, uid, sql, params) {
  await db.exec(`set role ${rol}; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
const falla = (p, re) => assert.rejects(p, re);

test('migraciones y políticas de la sala', {skip: !dir && 'Falta PGLITE_DIR'}, async t => {
  const db = await abrir();

  await t.test('anon no lee ni escribe ninguna tabla', async () => {
    for (const tabla of TABLAS) {
      const {rows} = await como(db, 'anon', null, `select count(*)::int n from public.${tabla}`).catch(() => ({rows: [{n: 0}]}));
      assert.equal(rows[0].n, 0, tabla);
      await falla(como(db, 'anon', null, `insert into public.${tabla} ${FILAS[tabla]}`), /row-level security|permission denied/);
      assert.equal((await como(db, 'anon', null, `delete from public.${tabla} returning 1`).catch(() => ({rows: []}))).rows.length, 0, tabla);
    }
    assert.equal((await como(db, 'anon', null, 'select public.es_miembro_sala() m')).rows[0].m, false);
    await falla(como(db, 'anon', null, `select public.nueva_version_prompt('redactar','x')`), /Acceso denegado/);
    await falla(como(db, 'anon', null, `select count(*)::int n from public.buscar_similares(array_fill(0.1::real, array[768])::extensions.vector)`), /permission denied/);
  });

  await t.test('autenticado sin membresía no ve ni escribe', async () => {
    for (const tabla of TABLAS) assert.equal((await como(db, 'authenticated', AJENO, `select count(*)::int n from public.${tabla}`).catch(() => ({rows: [{n: 0}]}))).rows[0].n, 0, tabla);
    for (const tabla of TABLAS) await falla(como(db, 'authenticated', AJENO, `insert into public.${tabla} ${FILAS[tabla]}`), /row-level security|permission denied/);
    await falla(como(db, 'authenticated', AJENO, `select public.nueva_version_prompt('redactar','x')`), /Acceso denegado/);
    await falla(como(db, 'authenticated', AJENO, `insert into storage.objects(bucket_id,name) values ('imagenes-privadas','fondos/a.jpg')`), /row-level security/);
  });

  await t.test('miembro opera según las políticas', async () => {
    assert.equal((await como(db, 'authenticated', MIEMBRO, 'select count(*)::int n from public.candidatos')).rows[0].n, 1);
    await como(db, 'authenticated', MIEMBRO, `insert into public.trabajos(tipo, solicitado_por) values ('academico','Ana')`);
    await como(db, 'authenticated', MIEMBRO, `update public.candidatos set estado = 'descartado', decidido_por = 'Ana'`);
    const fuente = (await db.query(`select aceptados, descartados, peso::float from public.fuentes where id = 'f1'`)).rows[0];
    assert.deepEqual(fuente, {aceptados: 0, descartados: 1, peso: 0.6666666666666666});
    // posts y prompts solo cambian por el servidor o la RPC versionada.
    await falla(como(db, 'authenticated', MIEMBRO, `insert into public.posts(formato,tipo_gancho) values ('historia','cifra concreta')`), /permission denied/);
    await falla(como(db, 'authenticated', MIEMBRO, `update public.prompts set activa = false`), /permission denied/);
    await como(db, 'authenticated', MIEMBRO, `select public.nueva_version_prompt('redactar','Versión nueva')`);
    const activos = (await db.query(`select version from public.prompts where agente = 'redactar' and activa`)).rows;
    assert.deepEqual(activos, [{version: 2}]);
    await falla(db.query(`update public.prompts set contenido = 'otro' where agente = 'redactar' and version = 1`), /inmutables/);
    // Storage: el miembro sube al bucket privado, nunca al público.
    await como(db, 'authenticated', MIEMBRO, `insert into storage.objects(bucket_id,name) values ('imagenes-privadas','fondos/a.jpg')`);
    await falla(como(db, 'authenticated', MIEMBRO, `insert into storage.objects(bucket_id,name) values ('laminas-publicadas','x.jpg')`), /row-level security/);
    await falla(como(db, 'authenticated', MIEMBRO, 'select public.tomar_publicacion(gen_random_uuid(), 1)'), /permission denied/);
  });

  await t.test('el bucket público solo acepta JPEG', async () => {
    const {rows} = await db.query(`select public, allowed_mime_types, file_size_limit::int from storage.buckets where id = 'laminas-publicadas'`);
    assert.deepEqual(rows[0], {public: true, allowed_mime_types: ['image/jpeg'], file_size_limit: 2000000});
  });

  await t.test('búsqueda vectorial', async () => {
    const vec = 'array_fill(0.1::real, array[768])::extensions.vector';
    const {rows} = await como(db, 'authenticated', MIEMBRO, `select tipo, titulo, round(similitud::numeric, 3)::float s from public.buscar_similares(${vec})`);
    // El candidato quedó descartado en la prueba anterior: solo vuelven los papers, el cercano primero.
    assert.deepEqual(rows.map(r => r.titulo), ['Paper cercano', 'Paper lejano']);
    assert.equal(rows[0].s, 1);
  });

  await t.test('publicaciones protegidas', async () => {
    const id = (await db.query(`insert into public.posts(formato,tipo_gancho,estado,revision) values ('historia','cifra concreta','aprobado',3) returning id`)).rows[0].id;
    const otro = (await db.query(`insert into public.posts(formato,tipo_gancho,estado) values ('historia','cifra concreta','aprobado') returning id`)).rows[0].id;
    const rpc = (sql, p) => como(db, 'service_role', null, sql, p).then(r => Object.values(r.rows[0])[0]);
    assert.equal(await rpc('select public.tomar_publicacion($1, 2)', [id]), false, 'revisión vieja');
    assert.equal(await rpc('select public.tomar_publicacion($1, 3)', [id]), true);
    assert.equal(await rpc('select public.tomar_publicacion($1, 1)', [otro]), false, 'bloqueo tomado');
    assert.equal(await rpc('select public.soltar_publicacion($1, true, $2)', [otro, null]), false, 'no es dueño del bloqueo');
    assert.equal(await rpc(`select public.soltar_publicacion($1, true, 'https://garbanzo96.github.io/nucleo-ia/notas/x/')`, [id]), true);
    const post = (await db.query('select estado, url_web, publicado_en is not null fecha from public.posts where id = $1', [id])).rows[0];
    assert.deepEqual(post, {estado: 'publicado', url_web: 'https://garbanzo96.github.io/nucleo-ia/notas/x/', fecha: true});
    assert.equal(await rpc('select public.tomar_publicacion($1, 1)', [otro]), true, 'el bloqueo quedó libre');
    await falla(db.query(`update public.posts set estado = 'otro' where id = $1`, [otro]), /posts_estado_check/);
  });
  await db.close();
});
