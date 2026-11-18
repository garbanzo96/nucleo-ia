# Sala de redacción

## Abrir la demostración

En Mac, haz doble clic en `ABRIR_DEMO.command`. Se abrirá la sala en el navegador con datos ficticios. La demostración no necesita cuentas, no guarda cambios y no publica. Cierra la ventana de Terminal para detenerla.

Si macOS no abre el archivo, desde Terminal ejecuta:

```sh
cd "$(dirname '/Users/gabrielsalas/Desktop/enigma/proyecto IA/03_Nucleo_IA/Web_Nucleo_IA/nucleo-ia-web/sala/ABRIR_DEMO.command')"
python3 preview.py
```

## Estado

La sala aún no está lista para uso real. Tiene interfaz, migraciones, radares y funciones de redacción, guardado, aprobación y publicación. Las pruebas locales usan datos ficticios, respuestas simuladas y una base PGlite; no prueban Supabase Auth, Storage real, GitHub ni modelos. Las funciones de redacción y publicación están apagadas en el servidor y no se ha desplegado nada.

Para revisar las pruebas desde la raíz del sitio:

```sh
PYTHONPATH=agentes python3 -m unittest discover -s agentes/tests -v
PYTHONPATH=agentes python3 agentes/ejecutar.py --ejemplo
node --test sala/supabase/functions/tests/*.test.mjs
NODE_PATH=$(npm root -g) node --test sala/tests/interfaz.test.cjs   # requiere jsdom global
PGLITE_DIR=/private/tmp/nucleo-pglite node --test sala/tests/integracion_db.test.mjs
```

La última prueba aplica las migraciones en PGlite (Postgres con pgvector, sin cuentas) y revisa RLS, membresía, Storage, búsqueda vectorial y publicaciones protegidas. Para prepararla: `mkdir -p /private/tmp/nucleo-pglite && cd /private/tmp/nucleo-pglite && npm install @electric-sql/pglite@0.3.16`. No reemplaza una prueba con Supabase real.

La configuración futura está en `SETUP.md`. La foto y sus ajustes se guardan en el bucket privado cuando la sala está configurada; hace falta probarlo con Storage real. El estado detallado y las tareas pendientes están en `../../../LEEME_sala_y_marca.md`.
