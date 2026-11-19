-- Pedido de Gabriel (19-nov-2026): no todas las láminas necesitan título; solo la 1 (el gancho).
create or replace function pg_temp.nuevo_prompt(nombre text, texto text) returns void language plpgsql as $$
declare v integer;
begin
  select coalesce(max(version), 0) + 1 into v from public.prompts where agente = nombre;
  update public.prompts set activa = false where agente = nombre and activa;
  insert into public.prompts(agente, version, activa, contenido) values (nombre, v, true, texto);
end $$;

select pg_temp.nuevo_prompt('redactar', (select contenido from public.prompts where agente = 'redactar' and activa) || $p$

## Título opcional

Solo la lámina 1 (el gancho) exige título. En las demás, el título es opcional: úsalo cuando ayude a leer (un dato, una cita, la pregunta final) y déjalo vacío ("") en al menos tres láminas de tipo hecho, contexto, implicancias, reflexion o limites, que entonces llevan todo en el cuerpo (25 a 45 palabras). Así el carrusel no repite la misma forma en cada lámina.$p$);
