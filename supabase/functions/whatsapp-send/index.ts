// Supabase Edge Function: a signed-in rep replies to a lead from the Inbox.
// Called by the app with the user's session; checks the conversation belongs to them.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const userDb = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } });
  const { conversation_id, body } = await req.json();
  const { data: conv, error } = await userDb.from('conversations').select('*').eq('id', conversation_id).single();
  if (error || !conv) return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404, headers: cors });

  const r = await fetch(`https://graph.facebook.com/v21.0/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: conv.phone, type: 'text', text: { body } }),
  });
  if (!r.ok) return new Response(JSON.stringify({ error: await r.text() }), { status: 502, headers: cors });

  const messages = [...(conv.messages || []), { from: 'rep', body, at: new Date().toISOString() }];
  await userDb.from('conversations').update({ messages, status: conv.status === 'ai' ? 'human' : conv.status, unread: 0 }).eq('id', conv.id);
  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
