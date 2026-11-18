# Configuración de la sala

La sala aún no está lista para instalar ni publicar. Este archivo registra lo que se necesitará una vez completada y probada la implementación.

1. Crear un proyecto gratuito en Supabase y ejecutar la migración validada en `supabase/migrations/`.
2. Crear un usuario de acceso con correo fijo y contraseña compartida. Después, habilitar solo su identificador en `miembros_sala` desde el editor SQL de Supabase. Desactivar el registro público de usuarios. En el editor SQL, reemplazar el correo de ejemplo por el correo fijo real y ejecutar:

   ```sql
   insert into public.miembros_sala(usuario)
   select id from auth.users where email = 'correo-de-la-sala@ejemplo.cl';
   ```

   Comprobar que se agregó exactamente una fila. El correo identifica el usuario compartido; la contraseña se crea en Supabase y no se escribe en el código.
3. Configurar la URL y la clave pública de Supabase en la aplicación. La clave `service_role` solo va en los secretos de GitHub Actions; nunca en archivos del sitio. Configurar `GEMINI_API_KEY` en los secretos de Supabase y GitHub. Para habilitar Gemini, primero confirmar que la clave esté en un proyecto sin facturación y definir `GEMINI_FREE_TIER_CONFIRMED=true` como secreto en Supabase y como variable de Actions. Sin esa confirmación no se enviarán solicitudes a Gemini. `ANTHROPIC_API_KEY` es opcional y requiere aprobación de presupuesto. Configurar también `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y un token de GitHub con permisos restringidos para los pasos que corresponda.
4. Desplegar las funciones terminadas y configurar el token para lanzar trabajos como secreto `GITHUB_DISPATCH_TOKEN` de Supabase. Las funciones actuales dependen de componentes que todavía faltan: no desplegarlas aún.
5. Para retirar acceso, cambiar la contraseña del usuario en Supabase y cerrar sus sesiones activas. Compartir la nueva contraseña únicamente con los integrantes vigentes.
6. Fase 3: se necesitará una cuenta profesional de Instagram y una aplicación Meta con el permiso de publicación correspondiente al método de acceso elegido. La API requiere imágenes JPEG accesibles públicamente. Antes de activar la publicación, consultar el límite vigente mediante `content_publishing_limit` y revisar la [documentación oficial de Meta](https://developers.facebook.com/documentation/instagram-platform/content-publishing). No se ha activado esta fase.

En GitHub Pages de proyecto, el archivo `robots.txt` de este repositorio se sirve bajo `/nucleo-ia/`, pero los buscadores consultan el de la raíz del dominio. La etiqueta `noindex` de la sala sigue siendo necesaria; ninguna de las dos medidas reemplaza el acceso autenticado.

Google documenta `gemini-embedding-2` con salida configurable de 768 dimensiones en su [guía de embeddings](https://ai.google.dev/gemini-api/docs/embeddings). Antes de usar cualquier proveedor, confirmar su nivel gratuito y sus límites actuales.
