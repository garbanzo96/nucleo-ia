import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { errorProveedor } from './ia.mjs';

export type IA = { clave: string; proveedor: 'claude' | 'gemini' | 'openai' };

// Llama al proveedor con la clave del miembro. La clave no se guarda ni aparece en errores.
export async function generar(ia: IA, modelo: string, instruccion: string, datos: string): Promise<string> {
  if (ia.proveedor === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(120000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ia.clave },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: instruccion }] }, contents: [{ role: 'user', parts: [{ text: datos }] }], generationConfig: { responseMimeType: 'application/json' } }),
    }).catch(() => null);
    if (!res?.ok) throw new Error(errorProveedor(res?.status ?? 0));
    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('');
    if (!text) throw new Error('El proveedor de IA devolvió una respuesta vacía');
    return text;
  }
  if (ia.proveedor === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(120000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ia.clave },
      body: JSON.stringify({ model: modelo, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: instruccion }, { role: 'user', content: datos }] }),
    }).catch(() => null);
    if (!res?.ok) throw new Error(errorProveedor(res?.status ?? 0));
    const text = (await res.json()).choices?.[0]?.message?.content;
    if (!text) throw new Error('El proveedor de IA devolvió una respuesta vacía');
    return text;
  }
  try {
    const message = await new Anthropic({ apiKey: ia.clave, maxRetries: 1, timeout: 120000 }).messages.create({
      model: modelo, max_tokens: 4000, system: instruccion, messages: [{ role: 'user', content: datos }],
    });
    const text = message.content.map(p => p.type === 'text' ? p.text : '').join('');
    if (!text) throw new Error('El proveedor de IA devolvió una respuesta vacía');
    return text;
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw new Error(errorProveedor(err.status ?? 0));
    throw err;
  }
}
