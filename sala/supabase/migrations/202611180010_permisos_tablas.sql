-- Los proyectos nuevos de Supabase no otorgan permisos de tabla por defecto. RLS decide qué filas ve
-- cada rol; estos grants solo abren las tablas al rol con sesión y al de servicio. anon queda sin acceso.
grant select, insert, update, delete on public.fuentes, public.candidatos, public.papers, public.config, public.trabajos to authenticated;
-- posts y prompts solo cambian por el servidor o por nueva_version_prompt (ver 202611180001).
grant select on public.posts, public.prompts to authenticated;
grant select, insert, update, delete on public.fuentes, public.candidatos, public.papers, public.posts, public.prompts,
  public.config, public.trabajos, public.miembros_sala, public.publicacion_lock to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
