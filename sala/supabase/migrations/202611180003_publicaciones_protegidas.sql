-- Estado e instantánea de aprobación solo los modifica el servidor.
alter table public.posts add column if not exists fuente_primaria text;
alter table public.posts add column if not exists revision integer not null default 1;
alter table public.posts add column if not exists aprobacion jsonb;
alter table public.posts add column if not exists imagenes_aprobadas jsonb;
alter table public.posts drop constraint if exists posts_estado_check;
alter table public.posts add constraint posts_estado_check check (estado in ('borrador','aprobado','publicando','publicado'));

-- Solo una publicación a la vez evita carreras en la rotación y el índice web.
create table public.publicacion_lock (id boolean primary key default true check (id), post_id uuid references public.posts(id));
insert into public.publicacion_lock(id,post_id) values (true,null);
alter table public.publicacion_lock enable row level security;
revoke all on public.publicacion_lock from public, anon, authenticated;

create function public.tomar_publicacion(p_id uuid, p_revision integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(9210441);
  if exists(select 1 from public.publicacion_lock where post_id is not null) then return false; end if;
  update public.posts set estado='publicando' where id=p_id and revision=p_revision and estado='aprobado';
  if not found then return false; end if;
  update public.publicacion_lock set post_id=p_id where id=true;
  return true;
end $$;

create function public.soltar_publicacion(p_id uuid, p_publicado boolean, p_url text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(9210441);
  if not exists(select 1 from public.publicacion_lock where post_id=p_id) then return false; end if;
  if p_publicado then
    update public.posts set estado='publicado', publicado_en=pg_catalog.now(), url_web=p_url where id=p_id and estado='publicando';
  else
    update public.posts set estado='aprobado' where id=p_id and estado='publicando';
  end if;
  if not found then return false; end if;
  update public.publicacion_lock set post_id=null where id=true;
  return true;
end $$;
revoke all on function public.tomar_publicacion(uuid,integer) from public, anon, authenticated;
revoke all on function public.soltar_publicacion(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.tomar_publicacion(uuid,integer) to service_role;
grant execute on function public.soltar_publicacion(uuid,boolean,text) to service_role;
-- La cuenta la completa Gabriel; null mantiene bloqueada la aprobación.
insert into public.config(clave,valor) values ('cuenta_instagram','"@nucleo.ia_"'::jsonb) on conflict (clave) do nothing;
