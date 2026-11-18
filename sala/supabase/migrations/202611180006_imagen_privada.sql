alter table public.posts add column if not exists imagen_privada text;
alter table public.posts add column if not exists encuadre integer not null default 50 check (encuadre between 0 and 100);
alter table public.posts add column if not exists oscurecimiento integer not null default 20 check (oscurecimiento between 0 and 85);
