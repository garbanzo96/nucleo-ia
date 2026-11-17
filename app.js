// Núcleo IA · movimiento. Sin dependencias. Si este archivo falla, el contenido sigue visible salvo las entradas.
(() => {
  'use strict';
  const raiz = document.documentElement;
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pausado = reducido;

  // 1. Entradas: cada parte de una sección aparece al entrar en pantalla, escalonada.
  const partes = [...document.querySelectorAll('[data-rev]')];
  if ('IntersectionObserver' in window && !reducido) {
    const vigia = new IntersectionObserver(es => {
      es.filter(e => e.isIntersecting).forEach((e, i) => {
        e.target.style.transitionDelay = i * 70 + 'ms';
        e.target.classList.add('visto');
        vigia.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    partes.forEach(el => vigia.observe(el));
  } else partes.forEach(el => el.classList.add('visto'));

  // 2. Matrices 10 × 10: un punto encendido por cada punto porcentual.
  const AZUL = [7, 91, 255], CIAN = [0, 181, 232], CLARO = [110, 226, 255];
  const mezcla = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  document.querySelectorAll('.matriz').forEach(m => {
    const n = +m.dataset.n;
    for (let i = 0; i < 100; i++) {
      const p = document.createElement('i');
      p.style.setProperty('--i', i);
      if (i < n) { p.className = 'on'; p.style.setProperty('--c', `rgb(${mezcla(AZUL, CIAN, i / n)})`); }
      m.append(p);
    }
  });

  // 3. Figuras de puntos. Cada forma lleva (u, v, t) a un punto [x, y, z] en torno a ±1.
  const TAU = Math.PI * 2;
  const mitad = v => (v * 2) % 1 - .5; // dos cintas dentro de una misma grilla
  const formas = {
    cinta(u, v, t) { const a = u * TAU, g = a + t * .35, w = (v - .5) * .58, r = 1 + .1 * Math.sin(3 * a + t * .4) + .05 * Math.sin(2 * a - t * .3) + w * Math.cos(g); return [r * Math.cos(a), w * Math.sin(g), r * Math.sin(a)]; },
    esfera(u, v, t) { const a = u * TAU, b = (.04 + v * .92) * Math.PI, r = .98 + .08 * Math.sin(b) * Math.sin(5 * b + t) * Math.sin(3 * a + t * .5); return [r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a)]; },
    toro(u, v, t) { const a = u * TAU, b = v * TAU + t * .5, r = .74 + .3 * Math.cos(b); return [r * Math.cos(a), .3 * Math.sin(b), r * Math.sin(a)]; },
    malla(u, v, t) { const x = (u - .5) * 2.1, z = (v - .5) * 2.1; return [x, .2 * Math.sin(3 * x + t) * Math.cos(2.6 * z + t * .7), z]; },
    anillos(u, v, t) { const a = u * TAU + t * .2, w = mitad(v) * .3, c = .8 * Math.cos(a), s = .8 * Math.sin(a); return v < .5 ? [c - .4, w, s] : [c + .4, s, w]; },
    helice(u, v, t) { const a = u * TAU * 2 + t * .4 + (v < .5 ? 0 : Math.PI); return [.5 * Math.cos(a), (u - .5) * 2.1 + mitad(v) * .3, .5 * Math.sin(a)]; },
    columna(u, v, t) { const a = u * TAU, r = .5 + .05 * Math.cos(8 * a) + .04 * Math.sin(v * 6 + t); return [r * Math.cos(a), (v - .5) * 2, r * Math.sin(a)]; },
  };
  const PALETA = Array.from({ length: 32 }, (_, i) => {
    const d = i / 31;
    return `rgb(${d < .72 ? mezcla(AZUL, CIAN, d / .72) : mezcla(CIAN, CLARO, (d - .72) / .28)})`;
  });

  let tiempo = 8, previo = 0, cuadro = 0, px = 0, py = 0, sx = 0, sy = 0;

  class Figura {
    constructor(lienzo) {
      this.c = lienzo; this.g = lienzo.getContext('2d');
      this.cols = +lienzo.dataset.cols; this.filas = +lienzo.dataset.filas;
      this.de = this.a = lienzo.dataset.forma; this.k = 1; this.visible = false;
      this.portada = lienzo.classList.contains('portada-cinta');
      new ResizeObserver(() => this.medir()).observe(lienzo);
    }
    medir() {
      const d = Math.min(devicePixelRatio || 1, 2);
      this.w = this.c.clientWidth; this.h = this.c.clientHeight;
      this.c.width = this.w * d; this.c.height = this.h * d;
      this.g.setTransform(d, 0, 0, d, 0, 0);
      this.dibujar();
    }
    cambiar(forma) {
      if (forma === this.a || !formas[forma]) return;
      this.de = this.a; this.a = forma; this.k = pausado ? 1 : 0;
      if (pausado) this.dibujar();
    }
    dibujar() {
      const { g, w, h, cols, filas } = this, t = tiempo;
      if (!w || !h) return;
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      if (this.k < 1) this.k = Math.min(1, this.k + .026);
      const k = this.k * this.k * (3 - 2 * this.k);
      const A = formas[this.a], D = formas[this.de];
      const giro = t * .16 + sx * .3, incl = (this.portada ? 1.0 : .48) + sy * .14;
      const cg = Math.cos(giro), sg = Math.sin(giro), ci = Math.cos(incl), si = Math.sin(incl);
      const S = Math.min(w, h) * (this.portada ? .31 : .36), cx = w * (this.portada && innerWidth > 960 ? .64 : .5), cy = h * .5;
      for (let i = 0; i < cols; i++) for (let j = 0; j < filas; j++) {
        const u = i / cols, v = j / (filas - 1);
        let [x, y, z] = A(u, v, t);
        if (k < 1) { const q = D(u, v, t); x = q[0] + (x - q[0]) * k; y = q[1] + (y - q[1]) * k; z = q[2] + (z - q[2]) * k; }
        const x1 = x * cg + z * sg, z1 = z * cg - x * sg;
        const y2 = y * ci - z1 * si, z2 = y * si + z1 * ci;
        const f = 3 / (3 - z2), d = Math.max(0, Math.min(1, (z2 + 1.25) / 2.5));
        const r = Math.max(.6, S * .011 * (.3 + d * 1.3) * f);
        const X = cx + x1 * f * S, Y = cy - y2 * f * S;
        g.fillStyle = PALETA[(d * 31) | 0];
        if (d > .6) { g.globalAlpha = .07; g.beginPath(); g.arc(X, Y, r * 2.8, 0, TAU); g.fill(); } // halo de los puntos cercanos
        g.globalAlpha = .3 + d * .7;
        g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
  }

  const figuras = [...document.querySelectorAll('canvas.figura')].map(c => new Figura(c));
  const enVista = new IntersectionObserver(es => es.forEach(e => {
    const f = figuras.find(f => f.c === e.target);
    f.visible = e.isIntersecting;
    if (f.visible && pausado) f.dibujar();
  }));
  figuras.forEach(f => enVista.observe(f.c));

  function ciclo(ahora) {
    tiempo += Math.min(.05, (ahora - previo) / 1000); previo = ahora;
    sx += (px - sx) * .05; sy += (py - sy) * .05;
    for (const f of figuras) if (f.visible) f.dibujar();
    cuadro = pausado ? 0 : requestAnimationFrame(ciclo);
  }
  function andar() {
    if (pausado || cuadro) return;
    previo = performance.now(); cuadro = requestAnimationFrame(ciclo);
  }
  addEventListener('pointermove', e => { px = e.clientX / innerWidth * 2 - 1; py = e.clientY / innerHeight * 2 - 1; }, { passive: true });

  // 4. Pausa visible del movimiento (regla del manual de marca).
  const boton = document.querySelector('.pausa-btn');
  const pintarPausa = () => {
    raiz.classList.toggle('pausa', pausado);
    boton.title = pausado ? 'Reanudar movimiento' : 'Pausar movimiento';
    boton.setAttribute('aria-label', boton.title);
  };
  boton.addEventListener('click', () => { pausado = !pausado; pintarPausa(); andar(); });
  pintarPausa(); andar();

  // 5. Diplomado: al abrir un módulo, los puntos del disco se reordenan en su figura.
  const disco = figuras.find(f => f.c.id === 'disco-figura');
  document.querySelectorAll('#modulos details').forEach(d =>
    d.addEventListener('toggle', () => { if (d.open) disco.cambiar(d.dataset.forma); }));

  // 6. Menú en móvil.
  const menuBtn = document.querySelector('.menu-btn'), menu = document.getElementById('menu');
  const abrir = si => { menu.classList.toggle('abierto', si); menuBtn.setAttribute('aria-expanded', si); };
  menuBtn.addEventListener('click', () => abrir(!menu.classList.contains('abierto')));
  menu.addEventListener('click', e => { if (e.target.closest('a')) abrir(false); });
})();
