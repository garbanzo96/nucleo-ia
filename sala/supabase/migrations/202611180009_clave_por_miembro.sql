-- Cada miembro usa su propia cuenta de IA: los modelos se eligen por proveedor y tarea.
-- La configuración de embeddings no cambia (la búsqueda semántica usa la clave de Gemini de la sala).
update public.config set valor = jsonb_build_object(
  'claude', jsonb_build_object('redactar','claude-sonnet-5-5','verificar','claude-sonnet-5-5','voz','claude-sonnet-5-5','filtrar','claude-haiku-5-5'),
  'gemini', jsonb_build_object('redactar','gemini-2.5-flash','verificar','gemini-2.5-flash','voz','gemini-2.5-flash','filtrar','gemini-2.5-flash'),
  'embeddings', valor->'embeddings'
) where clave = 'modelos';
