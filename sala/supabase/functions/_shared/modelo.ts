import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { errorProveedor } from './ia.mjs';

export type IA = { clave: string; proveedor: 'claude' | 'gemini' | 'openai' };

// Llama al proveedor con la clave del miembro. La clave no se guarda ni aparece en errores.
const GEMINI_RESPALDO = 'gemini-3.1-flash-lite';

export async function generar(ia: IA, modelo: string, instruccion: string, datos: string, espera?: number, respaldo = espera): Promise<string> {
  if (ia.proveedor === 'gemini') {
    // Gemini a veces responde 503 (saturado) o 429: un reintento con el modelo rápido, que casi siempre está libre.
    const pedir = (m: string, ms = 60000) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(ms),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ia.clave },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: instruccion }] }, contents: [{ role: 'user', parts: [{ text: datos }] }], generationConfig: { responseMimeType: 'application/json', ...(/^gemini-3/.test(m) && !m.includes('lite') ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) } }),
    }).catch(() => null);
    let res = await pedir(modelo, espera);
    if ((!res || res.status === 503 || res.status === 429) && modelo !== GEMINI_RESPALDO) res = await pedir(GEMINI_RESPALDO, respaldo);
    if (!res?.ok) throw new Error(errorProveedor(res?.status ?? 0));
    const json = await res.json().catch(() => null);
    const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('');
    if (!text) throw new Error('El proveedor de IA devolvió una respuesta vacía');
    return text;
  }
  if (ia.proveedor === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(espera ?? 120000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ia.clave },
      body: JSON.stringify({ model: modelo, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: instruccion }, { role: 'user', content: datos }] }),
    }).catch(() => null);
    if (!res?.ok) throw new Error(errorProveedor(res?.status ?? 0));
    const text = (await res.json()).choices?.[0]?.message?.content;
    if (!text) throw new Error('El proveedor de IA devolvió una respuesta vacía');
    return text;
  }
  try {
    const message = await new Anthropic({ apiKey: ia.clave, maxRetries: espera ? 0 : 1, timeout: espera ?? 120000 }).messages.create({
      model: modelo, max_tokens: 8000, system: instruccion, messages: [{ role: 'user', content: datos }],
    });
    const text = message.content.map(p => p.type === 'text' ? p.text : '').join('');
    if (!text) throw new Error('El proveedor de IA devolvió una respuesta vacía');
    return text;
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw new Error(errorProveedor(err.status ?? 0));
    throw err;
  }
}
