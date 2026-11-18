import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ia-clave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
export async function miembro(req: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = req.headers.get('Authorization');
  if (!url || !key || !authorization?.startsWith('Bearer ')) throw new Error('Sin sesión');
  const client = createClient(url, key, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sin sesión');
  const member = await client.rpc('es_miembro_sala');
  if (member.error || member.data !== true) throw new Error('Sin acceso a la sala');
  return client;
}
