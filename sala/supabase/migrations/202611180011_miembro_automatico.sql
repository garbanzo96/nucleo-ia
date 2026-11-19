-- El usuario compartido de la sala queda como miembro al crearlo en el panel, sin SQL a mano.
-- El correo no es secreto (va en conexion.js) y no necesita existir: Supabase no le envía nada con Auto Confirm.
create or replace function public.agregar_miembro_sala() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) = 'sala@nucleo-ia.cl' then
    insert into public.miembros_sala(usuario) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.agregar_miembro_sala() from public, anon, authenticated;
create trigger sala_miembro_automatico after insert on auth.users
  for each row execute function public.agregar_miembro_sala();
-- Por si el usuario ya existía.
insert into public.miembros_sala(usuario)
select id from auth.users where lower(email) = 'sala@nucleo-ia.cl' on conflict do nothing;
