# Sala en modo CLI

Para quien prefiere usar su suscripción de Claude o de ChatGPT en vez de una clave de API. La sala entrega los prompts maestros, la fuente y las reglas; tu Claude Code o tu Codex hace el trabajo en tu computador; la sala valida el resultado y lo guarda. Es el mismo arnés que usa la web.

## Una vez

1. Instala Python 3 (ya viene en Mac) y uno de estos dos, con tu sesión iniciada:
   - Claude Code: `npm install -g @anthropic-ai/claude-code` y luego `claude` para iniciar sesión.
   - Codex: `npm install -g @openai/codex` y luego `codex` para iniciar sesión.
2. Descarga el script:

   ```sh
   curl -fsSLO https://garbanzo96.github.io/nucleo-ia/sala/cli/nucleo.py
   ```

## Cada vez

```sh
python3 nucleo.py temas              # temas nuevos del radar, con su código
python3 nucleo.py evaluar            # tu IA puntúa los temas nuevos
python3 nucleo.py redactar 1a2b3c4d  # redacta el tema con ese código y lo guarda como borrador
python3 nucleo.py redactar https://arxiv.org/abs/2401.12345 --gancho "cifra concreta"
python3 nucleo.py opciones           # formatos y tipos de gancho válidos
```

Pide la contraseña de la sala al empezar. Después abre la sala en el navegador: el borrador aparece en Editor → Borradores guardados, donde se revisa, se pone la imagen y se aprueba como siempre.

Opciones: `--ia claude` o `--ia codex` (por defecto usa el que encuentre), `--modelo` para elegir modelo, `--formato` y `--gancho`.

## Qué hace y qué no

- Tu IA corre sin herramientas: no lee tus archivos, no navega y no ejecuta comandos. Solo recibe el texto del paso y devuelve JSON.
- Cada respuesta vuelve a la sala, que aplica las mismas validaciones que la web: cifras presentes en la fuente, enlaces, lista negra, rotación de ganchos y verificación lámina por lámina.
- No usa ni guarda claves de API. El consumo sale de tu plan de Claude o de ChatGPT, con sus límites.
- Reescribir una lámina con IA se hace en la web (con clave de API) o a mano en el editor.
