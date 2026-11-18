import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';

type Modelo = { proveedor: string; modelo: string };
export async function generar(modelo: Modelo, instruccion: string, datos: string): Promise<string> {
  if (modelo.proveedor === 'gemini') {
    if (Deno.env.get('GEMINI_FREE_TIER_CONFIRMED') !== 'true') throw new Error('Gemini requiere confirmación del nivel gratuito');
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) throw new Error('Falta la clave de Gemini');
    if (!/^gemini-[a-z0-9.-]+$/.test(modelo.modelo)) throw new Error('Modelo inválido');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo.modelo}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: instruccion }] }, contents: [{ role: 'user', parts: [{ text: datos }] }], generationConfig: { responseMimeType: 'application/json' } }),
    });
    if (!res.ok) throw new Error('El proveedor no respondió');
    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('');
    if (!text) throw new Error('Respuesta vacía');
    return text;
  }
  if (modelo.proveedor === 'claude') {
    if (Deno.env.get('ALLOW_PAID_MODELS') !== 'true') throw new Error('Claude requiere aprobación de presupuesto');
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('Falta la clave de Claude');
    if (!['claude-haiku-5-5', 'claude-sonnet-5-5'].includes(modelo.modelo)) throw new Error('Modelo inválido');
    const message = await new Anthropic({ apiKey }).messages.create({ model: modelo.modelo, max_tokens: 4000, system: instruccion, messages: [{ role: 'user', content: datos }] });
    const text = message.content.filter(p => p.type === 'text').map(p => p.type === 'text' ? p.text : '').join('');
    if (!text) throw new Error('Respuesta vacía');
    return text;
  }
  throw new Error('Proveedor desconocido');
}
