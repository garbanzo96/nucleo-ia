# Web de Núcleo IA

Sitio estático de una página: `index.html`, `styles.css`, `app.js` y `assets/`. Sin compilación, dependencias, analítica ni cookies.

## Ver en local

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Luego abre http://127.0.0.1:4173.

## Publicar en GitHub Pages

Sube esta carpeta como raíz del repositorio. En GitHub: Settings → Pages → Deploy from a branch → `main` / root. Las rutas son relativas, así que funciona tanto en `usuario.github.io/repo` como en un dominio propio.

## Editar

- Noticias: en `index.html`, sección `#noticias`. La nota principal es el `<article class="nota-principal">`; las demás son bloques `<details class="nota">` que se copian y pegan.
- Programas, webinars y fichas del observatorio: listas en `index.html`, una línea por ítem.
- Correo de contacto: el `mailto:` de la sección `#contacto`.
- Colores, radios y tipografía (manual de marca v3): variables al inicio de `styles.css`.
- Figuras de puntos: funciones de `formas` en `app.js`. Cada `<canvas class="figura">` elige la suya con `data-forma`.

## Créditos

Marca: archivos del kit de identidad de Núcleo IA. Fotografías de Wikimedia Commons, con autor y licencia en el pie del sitio y en `assets/credits.json`.
