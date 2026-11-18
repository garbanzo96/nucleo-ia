-- Ejecutar en el editor SQL de Supabase. El acceso se habilita después de crear el usuario.
create extension if not exists vector with schema extensions;
create table public.miembros_sala (usuario uuid primary key references auth.users(id) on delete cascade);
alter table public.miembros_sala enable row level security;
create or replace function public.es_miembro_sala() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.miembros_sala where usuario = (select auth.uid())) $$;
revoke all on function public.es_miembro_sala() from public;
grant execute on function public.es_miembro_sala() to authenticated;

create table public.fuentes (
  id text primary key, nombre text not null, url text not null, feed text,
  tipo text not null, peso numeric not null default 1 check (peso between 0 and 10),
  aceptados integer not null default 0, descartados integer not null default 0
);
create table public.candidatos (
  id uuid primary key default gen_random_uuid(), titulo text not null,
  url text not null unique, fuente_id text references public.fuentes(id),
  fuente_primaria text, resumen text, puntaje numeric, angulo text,
  gancho text, estado text not null default 'nuevo' check (estado in ('nuevo','guardado','descartado','usado')),
  motivo_descarte text, decidido_por text, creado_en timestamptz not null default now(),
  embedding extensions.vector(768)
);
create table public.papers (
  id uuid primary key default gen_random_uuid(), doi text unique, titulo text not null,
  autores jsonb not null default '[]', venue text, anio integer, abstract text,
  url_abierta text, url text, pregunta text, metodo text, n text, hallazgo text,
  limites text, importancia text, potencial text, ficha_basada_en_abstract boolean not null default true,
  embedding extensions.vector(768), creado_en timestamptz not null default now()
);
create table public.posts (
  id uuid primary key default gen_random_uuid(), candidato_id uuid references public.candidatos(id),
  formato text not null, tipo_gancho text not null, laminas jsonb not null default '[]',
  descripcion text not null default '', sugerencia_imagen jsonb, credito_imagen text,
  checklist jsonb not null default '{}', estado text not null default 'borrador'
    check (estado in ('borrador','aprobado','publicado')),
  aprobado_por text, aprobado_en timestamptz, url_web text, instagram_id text,
  borrador_original jsonb, diff jsonb, creado_en timestamptz not null default now()
);
create table public.prompts (
  id bigint generated always as identity primary key, agente text not null, version integer not null,
  contenido text not null, activa boolean not null default false,
  creado_en timestamptz not null default now(), unique(agente, version)
);
create unique index prompts_una_activa on public.prompts(agente) where activa;
create function public.prompts_inmutables() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.agente <> old.agente or new.version <> old.version or new.contenido <> old.contenido then
    raise exception 'Las versiones de prompts son inmutables';
  end if;
  return new;
end $$;
create trigger prompts_no_sobrescribir before update or delete on public.prompts
for each row execute function public.prompts_inmutables();
create table public.config (clave text primary key, valor jsonb not null);
create table public.trabajos (
  id uuid primary key default gen_random_uuid(), tipo text not null, estado text not null default 'pendiente',
  solicitado_por text, detalle text, creado_en timestamptz not null default now(), terminado_en timestamptz
);
do $$ declare t text; begin
  foreach t in array array['fuentes','candidatos','papers','posts','prompts','config','trabajos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy acceso_sala on public.%I for all to authenticated using (public.es_miembro_sala()) with check (public.es_miembro_sala())', t);
  end loop;
end $$;
create index candidatos_texto on public.candidatos using gin(to_tsvector('spanish', coalesce(titulo,'') || ' ' || coalesce(resumen,'')));
create index papers_texto on public.papers using gin(to_tsvector('english', coalesce(titulo,'') || ' ' || coalesce(abstract,'')));
insert into storage.buckets (id, name, public) values ('laminas-publicadas','laminas-publicadas',true), ('imagenes-privadas','imagenes-privadas',false);
create policy imagenes_privadas_sala on storage.objects for all to authenticated
  using (bucket_id = 'imagenes-privadas' and public.es_miembro_sala())
  with check (bucket_id = 'imagenes-privadas' and public.es_miembro_sala());
-- Solo el servidor publica imágenes: no se da permiso de escritura al navegador en el bucket público.
insert into public.config values
('modelos', '{"redactar":{"proveedor":"gemini","modelo":"gemini-2.5-flash"},"verificar":{"proveedor":"gemini","modelo":"gemini-2.5-flash"},"voz":{"proveedor":"gemini","modelo":"gemini-2.5-flash"},"filtrar":{"proveedor":"gemini","modelo":"gemini-2.5-flash"},"embeddings":{"proveedor":"gemini","modelo":"gemini-embedding-2","dimensiones":768}}'),
('rotacion', '{"ultimos":5}'),
('consultas_academicas', '["AI agency", "AI consciousness", "AI responsibility", "AI ethics", "AI safety", "AI welfare", "AI governance", "AI regulation", "AI use and perception", "cognitive impact of AI", "large language models", "AI robotics", "agentic workflows"]'),
('lista_negra', '["en un mundo donde", "fascinante", "sumérgete", "¿qué opinas?", "esto lo cambia todo", "nadie habla de esto"]'),
('mezcla_editorial', '["Chile y América Latina","casos e incidentes","verificación","historia","educación","trabajo y economía","costo ambiental","convocatorias","preguntas de seguidores","producción propia"]'),
('formatos', '["noticia explicada","paper en simple","dos posturas en debate","norma en claro","mito y evidencia","historia","dato raro o sorprendente","concepto clave","cómo funciona","5 lecturas","producción del Núcleo"]');
insert into public.prompts(agente,version,activa,contenido) values
('radar_noticias',1,true,'Evalúa novedad, relevancia para investigación y formación, conversación y rigor. Identifica la fuente primaria y no inventes datos.'),
('radar_academico',1,true,'Para cada trabajo identifica pregunta, método, n, hallazgo, límites, relevancia y potencial. Si solo hay abstract, no afirmes más de lo que dice.'),
('redactar',1,true,'Escribe en español de Chile un carrusel de 6 a 10 láminas, una idea por lámina y máximo 40 palabras. Abre con dos ganchos, muestra fuentes cortas en los datos, reserva la penúltima para límites y cierra con una pregunta concreta. Ofrece 3 a 5 ganchos distintos, descripción, texto alternativo, sugerencia de imagen y licencia a revisar. No inventes fuentes ni cifras.'),
('verificar',1,true,'Contrasta cada afirmación y cifra con la fuente primaria entregada. Marca lo que no esté respaldado. No completes vacíos con suposiciones.'),
('voz',1,true,'Corrige con lenguaje claro y serio. Evita falsos suspensos, fórmulas gastadas, tríadas forzadas, alarmismo, mayúsculas sostenidas y llamados genéricos. Compara con los últimos diez posts y las correcciones humanas.');

create function public.buscar_similares(consulta_vector extensions.vector(768))
returns table(tipo text, id uuid, titulo text, url text, similitud double precision)
language sql stable security invoker set search_path = '' as $$
  -- El alias es obligatorio: el ORDER BY de un UNION solo ve los nombres de la primera consulta.
  select 'candidato'::text as tipo, c.id, c.titulo, c.url, 1 - (c.embedding operator(extensions.<=>) consulta_vector) as similitud
  from public.candidatos c where c.embedding is not null and c.estado = 'guardado'
  union all
  select 'paper'::text, p.id, p.titulo, p.url, 1 - (p.embedding operator(extensions.<=>) consulta_vector)
  from public.papers p where p.embedding is not null
  order by similitud desc limit 20
$$;
revoke all on function public.buscar_similares(extensions.vector) from public;
grant execute on function public.buscar_similares(extensions.vector) to authenticated;

-- Cambiar o restaurar un prompt siempre crea una versión nueva y activa.
create function public.nueva_version_prompt(nombre_agente text, texto text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare siguiente integer; nuevo_id bigint;
begin
  if not public.es_miembro_sala() then raise exception 'Acceso denegado'; end if;
  if length(trim(nombre_agente)) = 0 or length(trim(texto)) = 0 or length(texto) > 50000 then
    raise exception 'Agente o contenido inválido';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(nombre_agente));
  if not exists(select 1 from public.prompts where agente = nombre_agente) then
    raise exception 'Agente desconocido';
  end if;
  select coalesce(max(version), 0) + 1 into siguiente from public.prompts where agente = nombre_agente;
  update public.prompts set activa = false where agente = nombre_agente and activa;
  insert into public.prompts(agente, version, contenido, activa)
    values(nombre_agente, siguiente, texto, true) returning id into nuevo_id;
  return nuevo_id;
end $$;
revoke all on function public.nueva_version_prompt(text,text) from public;
grant execute on function public.nueva_version_prompt(text,text) to authenticated;
-- Los clientes solo pueden leer prompts; la RPC aplica el cambio completo.
revoke insert, update, delete on public.prompts from public, anon, authenticated;
alter function public.nueva_version_prompt(text,text) security definer;
-- La publicación necesita una operación del servidor aún pendiente de validar.
-- Hasta implementarla, ningún cliente autenticado puede fabricar aprobaciones.
revoke insert, update, delete on public.posts from public, anon, authenticated;
