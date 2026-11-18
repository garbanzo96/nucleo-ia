# Funciones de redacción: estado de desarrollo

`redactar` y `reescribir` requieren una sesión autorizada, las migraciones de la sala, los prompts y modelos configurados y el secreto `ENABLE_DRAFT_GENERATION=true`. Esa opción debe mantenerse ausente hasta que se compruebe el entorno y se autorice el uso del proveedor. Claude requiere, además, la aprobación de presupuesto y `ALLOW_PAID_MODELS=true`. No hay cambio automático a un proveedor pagado.

Por ahora se aceptan enlaces directos a resúmenes de arXiv y DOI en `https://doi.org/` que tengan un resumen en Crossref. La función consulta servicios fijos sin seguir redirecciones y rechaza URLs arbitrarias. El resultado aclara que se basa solo en el resumen. Otras fuentes se rechazan hasta contar con extracción segura y pruebas de integración.

`redactar` recibe `{fuente_primaria, formato, tipo_gancho}`. `reescribir` recibe `{fuente_primaria, formato, tipo_gancho, tipo, instrucciones, contenido}`, con `tipo` igual a `lamina` o `gancho`. Ambas devuelven contenido y un informe de una segunda pasada, nunca publican ni guardan ni aprueban un post. La interfaz llama a estas funciones, pero la generación permanece apagada por configuración.

Se controla por código la forma del resultado, rotación por fecha real de publicación, cifras presentes en el resumen, enlaces, DOI y una parte de la lista negra. Que una cifra aparezca en el resumen no garantiza que se haya interpretado correctamente; tampoco la segunda pasada garantiza que una afirmación esté respaldada. Una persona debe leer la fuente y verificar hechos y cifras antes de aprobar. Si hay posts publicados sin `publicado_en`, no se genera contenido hasta corregir esas fechas.

La migración y las funciones no han sido probadas con Supabase, Deno, Gemini, Claude ni red real. Las pruebas locales de las reglas usan `node --test sala/supabase/functions/tests/editorial.test.mjs` desde la raíz del repositorio. No activarlas en producción hasta probar autenticación, límites, conectividad, privacidad y validación de extremo a extremo.

Pendiente: comparar el estilo y la estructura con los últimos diez posts, usar correcciones humanas como ejemplos y ampliar las fuentes primarias admitidas. Las pruebas automáticas cubren reglas puras; no verifican que el modelo interprete correctamente la evidencia ni que el despliegue funcione.

## Guardado, aprobación y web: implementación sin activar

Aplicar en orden las migraciones `202611180002_fecha_publicacion.sql` y `202611180003_publicaciones_protegidas.sql` después de la inicial. El servidor exige sesión de miembro; los permisos directos de escritura en `posts` siguen retirados. `guardar_post` acepta los campos del borrador, fuente primaria y, para una edición, `id` y `revision`. La edición invalida cualquier aprobación anterior.

`aprobar_post` recibe `{id, revision, nombre, imagenes}`. Cada imagen es un JPEG en base64, con un máximo de 2 MB por imagen y 9 MB en total. La cantidad debe coincidir con las láminas. Se debe guardar primero el checklist completo y el crédito. La aprobación registra las huellas del contenido, fuente y JPEG y guarda los JPEG en el bucket privado. El control comprueba cabecera y dimensiones y decodifica el JPEG completo. No detecta texto incrustado. Una persona debe comprobar los JPEG, incluyendo que no queden marcadores visibles.

`publicar_web` recibe `{id, revision}`. Solo opera cuando `ENABLE_WEB_PUBLICATION=true` y existe `GITHUB_PUBLICAR_TOKEN` como secreto de Supabase con permisos fine-grained de lectura y escritura de contenido en el repositorio indicado. No habilitarlo hasta completar las pruebas de integración. Toma un bloqueo global, vuelve a validar fuente y checklist, comprueba las huellas y crea un commit que incluye una página indexable, `nota.json`, las láminas y el índice de notas. No fuerza el avance de `main`.

La escritura en GitHub y el cambio de estado en la base son operaciones separadas. Si falla el intento de actualizar la referencia de GitHub o confirmar la base, el resultado podría ser ambiguo: el post queda en `publicando` y el bloqueo permanece tomado. Antes de reintentar, una persona con acceso administrativo debe revisar el head del repositorio y confirmar si existe la nota correspondiente; solo después debe reconciliar el estado usando la operación administrativa de recuperación. No liberar el bloqueo automáticamente ante esa situación.

Quedan pendientes las pruebas con una base y repositorio de prueba, manejo de errores de red, revisión visual de las imágenes y pruebas de integración de la interfaz. No se probó ni habilitó publicación real.

Para aprobar, `config.cuenta_instagram` debe contener una cadena JSON como `"@cuenta"`; el valor inicial es `null`. La cuenta se guarda con la aprobación y un cambio posterior bloquea la publicación. La comprobación del crédito tiene dos partes: la casilla `credito_imagen` debe estar marcada y el campo de crédito debe contener texto. La cuenta debe aparecer correctamente en el JPEG revisado por la persona; eso aún no se verifica por lectura de imagen.
