# Configurar la sala

La implementación está preparada para revisión. Antes de usarla con información real, prueba las migraciones, el acceso, Storage y la publicación en un proyecto y repositorio de prueba. Las claves no se pegan en el chat ni se guardan en el código.

## 1. Crear el proyecto y la cuenta compartida

1. Crea un proyecto gratuito en Supabase, sin activar facturación. En el editor SQL ejecuta en orden todos los archivos de `supabase/migrations/`. Comprueba que se creen las tablas y los buckets.
2. En Authentication, crea un usuario con un correo fijo y una contraseña compartida. Desactiva el registro público de usuarios.
3. En el editor SQL, reemplaza el correo por el que elegiste y ejecuta:

   ```sql
   insert into public.miembros_sala(usuario)
   select id from auth.users where email = 'correo-de-la-sala@ejemplo.cl';
   ```

   Debe agregarse una fila. La contraseña se escribe únicamente en Supabase y en la pantalla de acceso.
4. En la sala, completa una vez la URL del proyecto, la clave pública `anon`, el correo fijo y el nombre de quien está usando la sala. La clave pública puede estar en el navegador; la clave `service_role` no.

## 2. Guardar claves y activar solo lo probado

En los secretos de GitHub Actions agrega `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `GEMINI_API_KEY`. En los secretos de las funciones de Supabase agrega `GEMINI_API_KEY`, `GITHUB_DISPATCH_TOKEN` y `GITHUB_PUBLICAR_TOKEN`. Los dos tokens de GitHub deben ser fine-grained y limitarse al repositorio de la web; el de publicación necesita permiso de lectura y escritura de contenido. Supabase entrega a sus funciones las variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` automáticamente.

Para usar Gemini, confirma que la clave pertenece a un proyecto sin facturación. Solo entonces agrega `GEMINI_FREE_TIER_CONFIRMED=true` como secreto de Supabase y variable de Actions. Para habilitar la redacción, después de probarla, agrega también `ENABLE_DRAFT_GENERATION=true` en Supabase. Sin esas opciones no se llama a Gemini.

Claude es opcional y requiere aprobación de presupuesto. Solo después de esa aprobación agrega `ANTHROPIC_API_KEY` a Supabase y Actions, y `ALLOW_PAID_MODELS=true` como secreto de Supabase y variable de Actions. Selecciona los modelos por paso en Configuración. No hay cambio automático a Claude.

## 3. Desplegar y verificar

Con la herramienta oficial de Supabase conectada al proyecto, despliega las funciones desde la carpeta `sala/supabase/functions/`. Prueba primero el acceso de un miembro y el rechazo de un usuario ajeno; después, prueba los radares y el guardado privado de imágenes. Comprueba el ZIP y la revisión humana con datos de prueba.

Configura `cuenta_instagram` en la sala con el formato `"@cuenta"`. La publicación web requiere `ENABLE_WEB_PUBLICATION=true` en Supabase: déjala apagada hasta probar el flujo completo, incluido un commit en un repositorio de prueba y la recuperación ante errores. El botón de Instagram directo sigue desactivado.

## 4. Cambiar la contraseña

En Authentication, cambia la contraseña del usuario compartido y cierra sus sesiones activas. Comparte la nueva contraseña solo con los integrantes vigentes.

## 5. Preparar Instagram para después

Se necesitarán una cuenta profesional y una aplicación Meta con el permiso de publicación correspondiente al método de acceso. La API requiere imágenes JPEG con URL públicas. Antes de activar la publicación, consulta `content_publishing_limit` y revisa la [documentación oficial de Meta](https://developers.facebook.com/documentation/instagram-platform/content-publishing). No se ha activado esta fase.

GitHub Pages sirve el `robots.txt` de este proyecto bajo `/nucleo-ia/`, pero los buscadores consultan el de la raíz del dominio. La sala incluye `noindex`; ninguna de las dos medidas reemplaza el acceso autenticado. El modelo semántico configurado es `gemini-embedding-2` con 768 dimensiones, según la [guía de Google](https://ai.google.dev/gemini-api/docs/embeddings).
