# Configurar la sala

Las claves no pasan por el chat, por archivos del repo ni por ningún agente. Tú inicias sesión una vez en tu terminal; el token queda en el llavero del Mac y desde ahí cualquier agente que trabaje en este computador puede aplicar migraciones y desplegar funciones sin ver la clave. Los secretos los escribes tú.

Todos los comandos se corren en Terminal desde la carpeta `sala/` del repo:

```sh
cd "/Users/gabrielsalas/Desktop/enigma/proyecto IA/03_Nucleo_IA/Web_Nucleo_IA/nucleo-ia-web/sala"
```

## 1. Supabase: proyecto y conexión

1. En supabase.com crea un proyecto gratuito, sin facturación. Anota el identificador del proyecto (Project Settings → General → Reference ID, 20 letras).
2. Inicia sesión en la CLI. Se abre el navegador para autorizar y el token queda en el llavero:

   ```sh
   npx -y supabase@2.40.7 login
   ```

3. Vincula la carpeta con el proyecto (reemplaza `REF` por el identificador):

   ```sh
   npx -y supabase@2.40.7 link --project-ref REF
   ```

   Si pide la contraseña de la base de datos, escríbela ahí mismo. No se guarda en el repo (la carpeta `supabase/.temp` está en `.gitignore`).

Desde aquí cualquier agente puede correr, en esta carpeta, `npx -y supabase@2.40.7 db push` (migraciones) y `npx -y supabase@2.40.7 functions deploy` (funciones). Pídele que antes corra las pruebas locales de `LEEME.md`.

## 2. Usuario compartido de la sala

1. En el panel de Supabase, Authentication → Users → Add user: un correo fijo (por ejemplo `sala@tu-dominio.cl`) y la contraseña compartida. En Authentication → Sign In / Providers desactiva el registro público.
2. En SQL Editor, con el correo que elegiste:

   ```sql
   insert into public.miembros_sala(usuario)
   select id from auth.users where email = 'sala@tu-dominio.cl';
   ```

   Debe decir que agregó una fila.
3. En la sala, la primera vez, completa la URL del proyecto, la clave pública `anon` (Project Settings → API), el correo fijo y tu nombre. La clave `anon` es pública por diseño; la `service_role` nunca va al navegador.

## 3. Secretos de las funciones

Cada secreto se escribe sin que quede en el historial de la terminal: `read -rs` lo pide sin mostrarlo y el comando solo ve la variable.

```sh
read -rs V && npx -y supabase@2.40.7 secrets set GEMINI_API_KEY="$V"; unset V
read -rs V && npx -y supabase@2.40.7 secrets set GITHUB_DISPATCH_TOKEN="$V"; unset V
read -rs V && npx -y supabase@2.40.7 secrets set GITHUB_PUBLICAR_TOKEN="$V"; unset V
```

- `GEMINI_API_KEY`: de Google AI Studio, en un proyecto sin facturación.
- Los dos tokens de GitHub son fine-grained (GitHub → Settings → Developer settings → Fine-grained tokens), solo para el repo `garbanzo96/nucleo-ia`. El de lanzamiento necesita permiso de Contents en lectura y escritura para `repository_dispatch`; el de publicación, Contents en lectura y escritura.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` las pone Supabase solo; no se cargan.

Interruptores, que no son claves (actívalos solo cuando lo hayas probado):

```sh
npx -y supabase@2.40.7 secrets set GEMINI_FREE_TIER_CONFIRMED=true
npx -y supabase@2.40.7 secrets set ENABLE_DRAFT_GENERATION=true
npx -y supabase@2.40.7 secrets set ENABLE_WEB_PUBLICATION=true
```

Claude es opcional y requiere tu aprobación de presupuesto. Solo después carga `ANTHROPIC_API_KEY` con el mismo `read -rs` y `ALLOW_PAID_MODELS=true`.

## 4. Secretos de GitHub Actions

En github.com/garbanzo96/nucleo-ia → Settings → Secrets and variables → Actions:

1. Pestaña Secrets, New repository secret: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API) y `GEMINI_API_KEY`. Si aprobaste Claude, también `ANTHROPIC_API_KEY`.
2. Pestaña Variables: `GEMINI_FREE_TIER_CONFIRMED` con valor `true` cuando confirmes que la clave es gratuita. `ALLOW_PAID_MODELS` solo si aprobaste Claude.

GitHub guarda los secretos cifrados y no los vuelve a mostrar. Nadie más tiene que verlos.

## 5. Desplegar y probar

1. Un agente (o tú) corre `npx -y supabase@2.40.7 db push` y luego `npx -y supabase@2.40.7 functions deploy`.
2. Entra a la sala con la contraseña y prueba: un tema del radar, guardar un borrador, subir una imagen y descargar el ZIP.
3. En Configuración, revisa que `cuenta_instagram` diga `"@nucleo.ia_"`.
4. Lanza una investigación desde la sala y revisa la corrida en la pestaña Actions de GitHub.
5. Activa `ENABLE_WEB_PUBLICATION` solo después de probar una publicación completa. La publicación en Instagram sigue apagada.

## 6. Cambiar la contraseña

Cuando alguien sale del Núcleo: Authentication → Users → el usuario de la sala → Reset password o cambio directo, y luego cierra sus sesiones. Comparte la nueva contraseña solo con quienes siguen.

Si quieres revocar el acceso de la CLI en este Mac: `npx -y supabase@2.40.7 logout`.

## 7. Instagram, más adelante

Hará falta una cuenta profesional y una aplicación de Meta con el permiso `instagram_business_content_publish`. La API acepta carruseles de hasta 20 JPEG en URL públicas y tiene un tope diario que se consulta en `content_publishing_limit`. Revisa la [documentación de Meta](https://developers.facebook.com/docs/instagram-platform/content-publishing/) antes de activarla. Esta fase no está activa.

Nota: GitHub Pages sirve el `robots.txt` del proyecto bajo `/nucleo-ia/`, pero los buscadores leen el de la raíz del dominio. La sala lleva `noindex`; ninguna de las dos cosas reemplaza el acceso con contraseña. El modelo de embeddings es `gemini-embedding-2` con 768 dimensiones, según la [guía de Google](https://ai.google.dev/gemini-api/docs/embeddings).
