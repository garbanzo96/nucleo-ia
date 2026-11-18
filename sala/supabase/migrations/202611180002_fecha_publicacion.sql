-- El orden de rotación debe usar la fecha de publicación, no la de creación.
alter table public.posts add column if not exists publicado_en timestamptz;
