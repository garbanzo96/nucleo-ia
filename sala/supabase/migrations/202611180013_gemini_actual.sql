-- IA de la sala: modelo Gemini vigente en la cuenta del Núcleo (lista consultada el 18-nov-2026).
update public.config set valor = jsonb_set(valor, '{gemini}', jsonb_build_object(
  'redactar','gemini-3.8-flash','verificar','gemini-3.8-flash','voz','gemini-3.8-flash','filtrar','gemini-3.8-flash'
)) where clave = 'modelos';
