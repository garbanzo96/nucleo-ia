-- "Conoce las razones…" apareció como relleno en una prueba: se suma a la lista negra de la sala.
update public.config set valor = (
  select jsonb_agg(distinct x) from jsonb_array_elements(coalesce(valor,'[]'::jsonb) || '["Conoce las razones","Te explicamos","Te contamos","Sigue leyendo","Desliza para saber"]'::jsonb) x
) where clave = 'lista_negra';
