-- Cada campo de la ficha (pregunta, método, n, hallazgo, límites) guarda la cita textual que lo respalda.
alter table public.papers add column if not exists citas jsonb not null default '{}'::jsonb;
alter table public.papers add column if not exists texto_fuente text;
