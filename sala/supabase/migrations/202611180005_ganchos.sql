-- Las alternativas propuestas forman parte del borrador editable.
alter table public.posts add column if not exists ganchos jsonb not null default '[]'::jsonb;
alter table public.posts add constraint posts_ganchos_arreglo check (jsonb_typeof(ganchos) = 'array');
