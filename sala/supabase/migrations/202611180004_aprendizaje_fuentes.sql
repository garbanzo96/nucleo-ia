-- Ajusta los contadores al cambiar una decisión; pasar de guardado a usado no cuenta dos veces.
create function public.ajustar_fuente_por_decision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_accept integer := 0; old_reject integer := 0; new_accept integer := 0; new_reject integer := 0;
begin
  if old.fuente_id is distinct from new.fuente_id then
    raise exception 'La fuente de un candidato no se modifica al registrar una decisión';
  end if;
  if new.fuente_id is null or old.estado = new.estado then return new; end if;
  old_accept := (old.estado in ('guardado', 'usado'))::integer;
  new_accept := (new.estado in ('guardado', 'usado'))::integer;
  old_reject := (old.estado = 'descartado')::integer;
  new_reject := (new.estado = 'descartado')::integer;
  update public.fuentes set
    aceptados = greatest(0, aceptados + new_accept - old_accept),
    descartados = greatest(0, descartados + new_reject - old_reject)
  where id = new.fuente_id;
  update public.fuentes set peso = greatest(0.25, least(2.0,
    2.0 * (aceptados + 1) / (aceptados + descartados + 2)))
  where id = new.fuente_id;
  return new;
end $$;
create trigger candidatos_decisiones after update of estado, fuente_id on public.candidatos
for each row execute function public.ajustar_fuente_por_decision();
