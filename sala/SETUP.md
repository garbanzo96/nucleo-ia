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

1. En el panel de Supabase: Authentication → Users → Add user → Create new user.
   - Email: `sala@nucleo-ia.cl`. No tiene que existir ni ser tuyo: es solo el nombre interno del usuario y no se le envía ningún correo.
   - Password: la contraseña compartida que darás a los miembros.
   - Marca Auto Confirm User.
2. Authentication → Sign In / Providers: desactiva Allow new users to sign up.

Al crearlo queda como miembro de la sala por sí solo. Los miembros solo abren el enlace y escriben su nombre y la contraseña.

## 3. La IA de la sala

La sala trae IA propia: usa la clave de Gemini del Núcleo, en el nivel gratuito, para ordenar los temas del radar, hacer las fichas de papers, redactar, ajustar la voz y verificar. Nadie más necesita cuentas ni claves.

Cada miembro puede, si quiere, conectar su propia IA en Configuración → Tu IA (clave de API de Claude, ChatGPT o Gemini). Entonces sus borradores salen con su cuenta. La clave queda solo en su navegador. Quien prefiera usar su suscripción de Claude o ChatGPT sin clave de API tiene el modo CLI (`sala/cli/LEEME.md`).

## 4. Secretos (una sola vez)

En la terminal, desde `sala/`, cada comando pide el valor sin mostrarlo:

```sh
read -rs "V?Token de GitHub: " && npx -y supabase@2.40.7 secrets set GITHUB_PUBLICAR_TOKEN="$V" GITHUB_DISPATCH_TOKEN="$V"; unset V
read -rs "V?Clave de Gemini: " && npx -y supabase@2.40.7 secrets set GEMINI_API_KEY="$V" GEMINI_FREE_TIER_CONFIRMED=true; unset V
```

- Token de GitHub: github.com/settings/personal-access-tokens/new, solo para `garbanzo96/nucleo-ia`, permiso Contents en lectura y escritura. Sirve para lanzar la investigación y publicar notas.
- Clave de Gemini: aistudio.google.com → Get API key, en un proyecto sin facturación.

GitHub no necesita secretos: el radar corre en GitHub Actions y se identifica ante la sala con un token firmado por GitHub (OIDC), que la función `radar_api` verifica.

## 5. Uso

1. Radar → Investigar. En 5 a 15 minutos aparecen los temas, ordenados, con ángulo y gancho propuestos. También corre solo todos los días.
2. Hacer borrador en el tema elegido: la sala redacta, ajusta la voz y verifica contra la fuente.
3. Editor: revisar, subir imagen con su crédito, completar la lista de control, guardar y aprobar.
4. Publicar en la web, y Descargar para subir los JPEG a Instagram a mano.

Los prompts maestros se editan en Configuración → Prompts; cada cambio crea una versión nueva.

## 6. Cambiar la contraseña

Cuando alguien sale del Núcleo: Authentication → Users → el usuario de la sala → Reset password o cambio directo, y luego cierra sus sesiones. Comparte la nueva contraseña solo con quienes siguen.

Si quieres revocar el acceso de la CLI en este Mac: `npx -y supabase@2.40.7 logout`.

## 7. Instagram, más adelante

Hará falta una cuenta profesional y una aplicación de Meta con el permiso `instagram_business_content_publish`. La API acepta carruseles de hasta 20 JPEG en URL públicas y tiene un tope diario que se consulta en `content_publishing_limit`. Revisa la [documentación de Meta](https://developers.facebook.com/docs/instagram-platform/content-publishing/) antes de activarla. Esta fase no está activa.

Nota: GitHub Pages sirve el `robots.txt` del proyecto bajo `/nucleo-ia/`, pero los buscadores leen el de la raíz del dominio. La sala lleva `noindex`; ninguna de las dos cosas reemplaza el acceso con contraseña. El modelo de embeddings es `gemini-embedding-2` con 768 dimensiones, según la [guía de Google](https://ai.google.dev/gemini-api/docs/embeddings).
