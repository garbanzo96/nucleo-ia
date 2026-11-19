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

1. En el panel de Supabase, Authentication → Users → Add user → Create new user. Correo: `sala@nucleo-ia.cl` (es el que trae `conexion.js`; no necesita existir, no se le envía nada). Contraseña: la contraseña compartida. Marca Auto Confirm User.
2. Authentication → Sign In / Providers: desactiva Allow new users to sign up.
3. SQL Editor → New query:

   ```sql
   insert into public.miembros_sala(usuario)
   select id from auth.users where email = 'sala@nucleo-ia.cl';
   ```

   Debe decir que agregó una fila.

Los miembros solo abren el enlace de la sala y escriben su nombre y la contraseña. La URL y la clave pública del proyecto ya vienen en `conexion.js`; la clave `anon` es pública por diseño y sin la contraseña no da acceso a nada.

## 3. Quién paga qué

La sala aporta el arnés: fuentes, prompts maestros, reglas, verificación y publicación. La IA la pone cada miembro con su propia cuenta (paso 5). Lo único común es la búsqueda semántica, que necesita un solo modelo de embeddings para que los vectores sean comparables: usa tu clave de Gemini en el nivel gratuito.

## 4. Secretos de la infraestructura común

Cada secreto se escribe sin que quede en el historial de la terminal: `read -rs` lo pide sin mostrarlo.

```sh
read -rs V && npx -y supabase@2.40.7 secrets set GEMINI_API_KEY="$V"; unset V
npx -y supabase@2.40.7 secrets set GEMINI_FREE_TIER_CONFIRMED=true
read -rs V && npx -y supabase@2.40.7 secrets set GITHUB_DISPATCH_TOKEN="$V"; unset V
read -rs V && npx -y supabase@2.40.7 secrets set GITHUB_PUBLICAR_TOKEN="$V"; unset V
```

- `GEMINI_API_KEY`: de Google AI Studio, en un proyecto sin facturación. Solo calcula embeddings.
- Los dos tokens de GitHub son fine-grained (GitHub → Settings → Developer settings → Fine-grained tokens), solo para `garbanzo96/nucleo-ia`, con permiso Contents en lectura y escritura. El primero permite lanzar la búsqueda de temas; el segundo, publicar notas en la web.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` las pone Supabase solo.

En github.com/garbanzo96/nucleo-ia → Settings → Secrets and variables → Actions:

1. Secrets: `SUPABASE_URL` (`https://mntbswehkqcndbbmnwmn.supabase.co`), `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API Keys → service_role) y `GEMINI_API_KEY`.
2. Variables: `GEMINI_FREE_TIER_CONFIRMED` = `true`.

La recolección de temas corre en GitHub Actions sin IA (gratis): lee las fuentes, busca la fuente primaria, quita duplicados y calcula embeddings. Corre sola todos los días y también cuando alguien aprieta «Buscar temas nuevos».

## 5. Cada miembro: su IA

En la sala, Configuración → Tu IA, cada persona pega su clave:

- Claude: console.anthropic.com → API Keys. La suscripción de Claude no sirve; la API se paga aparte. Conviene fijar un tope mensual en Billing → Spend limits.
- Gemini: aistudio.google.com → Get API key. Tiene nivel gratuito con límites.

La clave queda solo en ese navegador (o solo en la pestaña, si no marca «Recordar»). Viaja a la sala únicamente al evaluar el radar o pedir un borrador, se usa para ese pedido y no se guarda ni se registra. Los modelos por tarea se ajustan en Configuración → Ajustes → `modelos`.

Sin clave de API también se puede: el modo CLI usa Claude Code o Codex con la suscripción de cada uno (`sala/cli/LEEME.md`).

Con la clave puesta: «Evaluar con mi IA» puntúa los temas nuevos del radar y propone ángulo y gancho; «Redactar» arma el borrador, lo corrige con la voz del Núcleo y lo verifica contra la fuente.

## 5b. Probar

1. Entra a la sala con la contraseña.
2. «Buscar temas nuevos» y revisa la corrida en la pestaña Actions de GitHub.
3. Pon tu clave y aprieta «Evaluar con mi IA». Elige un tema, redacta, guarda, sube una imagen y descarga el ZIP.
4. Activa la publicación web solo después de probar una completa: `npx -y supabase@2.40.7 secrets set ENABLE_WEB_PUBLICATION=true`. Instagram sigue apagado.

## 6. Cambiar la contraseña

Cuando alguien sale del Núcleo: Authentication → Users → el usuario de la sala → Reset password o cambio directo, y luego cierra sus sesiones. Comparte la nueva contraseña solo con quienes siguen.

Si quieres revocar el acceso de la CLI en este Mac: `npx -y supabase@2.40.7 logout`.

## 7. Instagram, más adelante

Hará falta una cuenta profesional y una aplicación de Meta con el permiso `instagram_business_content_publish`. La API acepta carruseles de hasta 20 JPEG en URL públicas y tiene un tope diario que se consulta en `content_publishing_limit`. Revisa la [documentación de Meta](https://developers.facebook.com/docs/instagram-platform/content-publishing/) antes de activarla. Esta fase no está activa.

Nota: GitHub Pages sirve el `robots.txt` del proyecto bajo `/nucleo-ia/`, pero los buscadores leen el de la raíz del dominio. La sala lleva `noindex`; ninguna de las dos cosas reemplaza el acceso con contraseña. El modelo de embeddings es `gemini-embedding-2` con 768 dimensiones, según la [guía de Google](https://ai.google.dev/gemini-api/docs/embeddings).
