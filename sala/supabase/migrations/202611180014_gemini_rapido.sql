-- Probado el 18-nov-2026 desde Supabase: gemini-3.8-flash saturado (503) y gemini-3.5-flash lento (88 s).
-- gemini-3.1-flash-lite responde en ~1,5 s y gemini-3.5-flash-lite en ~5 s.
update public.config set valor = jsonb_set(valor, '{gemini}', jsonb_build_object(
  'redactar','gemini-3.5-flash-lite','verificar','gemini-3.5-flash-lite','voz','gemini-3.5-flash-lite','filtrar','gemini-3.1-flash-lite'
)) where clave = 'modelos';
