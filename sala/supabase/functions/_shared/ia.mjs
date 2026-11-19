// Cada miembro usa su propia cuenta de IA. La sala pone el arnés (prompts, fuentes, validaciones);
// la clave llega en la cabecera x-ia-clave de cada pedido y nunca se guarda ni se registra.

/** @param {string} clave @returns {'claude'|'gemini'|'openai'} */
export function proveedorDeClave(clave) {
  if (/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(clave)) return 'claude';
  if (/^(AIza[0-9A-Za-z_-]{30,}|AQ\.[0-9A-Za-z_.-]{30,})$/.test(clave)) return 'gemini';
  if (/^sk-[A-Za-z0-9_-]{20,}$/.test(clave)) return 'openai';
  throw new Error('Tu clave de IA no tiene un formato reconocido: usa una clave de Claude (sk-ant-…), ChatGPT (sk-…) o Gemini (AIza…)');
}

// Sin clave propia se usa la IA de la sala (Gemini, clave del Núcleo en el servidor).
/** @param {Headers} headers @param {string|undefined} claveSala @returns {{clave: string, proveedor: 'claude'|'gemini'|'openai'}} */
export function iaDelPedido(headers, claveSala) {
  const clave = (headers.get('x-ia-clave') || '').trim();
  if (clave) return { clave, proveedor: proveedorDeClave(clave) };
  if (!claveSala) throw new Error('Falta configurar la IA de la sala');
  return { clave: claveSala, proveedor: 'gemini' };
}

// config.modelos = { claude: { redactar, verificar, voz, filtrar }, gemini: {...}, embeddings: {...} }
export function modeloPara(modelos, proveedor, tarea) {
  const modelo = modelos?.[proveedor]?.[tarea];
  const patron = { claude: /^claude-[a-z0-9.-]+$/, gemini: /^gemini-[a-z0-9.-]+$/, openai: /^(gpt|o)[a-z0-9.-]*$/ }[proveedor];
  if (typeof modelo !== 'string' || !patron || !patron.test(modelo)) throw new Error(`Falta configurar el modelo de ${proveedor} para ${tarea}`);
  return modelo;
}

// Traduce errores del proveedor sin exponer la clave ni el detalle crudo.
export function errorProveedor(status) {
  if (status === 401 || status === 403) return 'La clave de IA no fue aceptada. Revísala en Configuración → Tu IA';
  if (status === 429) return 'La cuenta de IA alcanzó su límite de uso. Espera un momento o conecta tu propia IA en Configuración';
  if (status === 400 || status === 402 || status === 404) return 'La cuenta de IA rechazó el pedido: revisa que tenga saldo y que el modelo exista';
  return 'El proveedor de IA no respondió. Intenta de nuevo';
}

// Misma regla que agentes/clasificar.py: solo puntajes 0–10 y textos cortos sin enlaces ni marcadores.
export function validarEvaluacion(candidatos, respuesta) {
  if (!respuesta || !Array.isArray(respuesta.resultados)) return [];
  const disponibles = new Map(candidatos.map(c => [c.url, c]));
  const vistos = new Set();
  const salida = [];
  for (const fila of respuesta.resultados) {
    if (!fila || typeof fila !== 'object') continue;
    const { url, puntaje, angulo, gancho } = fila;
    if (!disponibles.has(url) || vistos.has(url) || typeof puntaje !== 'number' || !(puntaje >= 0 && puntaje <= 10)) continue;
    if (![angulo, gancho].every(x => typeof x === 'string' && x.trim().length > 0 && x.trim().length <= 500 && !/https?:\/\/|\[[^\]]+\]/.test(x))) continue;
    vistos.add(url);
    salida.push({ id: disponibles.get(url).id, puntaje: Math.round(puntaje * 10) / 10, angulo: angulo.trim(), gancho: gancho.trim() });
  }
  return salida;
}
