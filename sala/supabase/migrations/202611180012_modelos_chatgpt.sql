-- ChatGPT como tercera opción de IA propia. La IA por defecto de la sala sigue siendo Gemini.
update public.config set valor = valor || jsonb_build_object(
  'openai', jsonb_build_object('redactar','gpt-5','verificar','gpt-5','voz','gpt-5','filtrar','gpt-5-mini')
) where clave = 'modelos';
