// Supabase Edge Function: sends follow-up steps that are due, then schedules the next one.
// Run it every 15 minutes with pg_cron (see README). Same secrets as whatsapp-webhook,
// plus CRON_SECRET to keep strangers from triggering it.
// Note: WhatsApp only allows free-form text within 24h of the lead's last message.
// Outside that window set WHATSAPP_TEMPLATE to an approved template name with one {{1}} body variable.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const first = (n: string) => (n || '').trim().split(/\s+/)[0] || 'there';
const DAY = 86400e3;

async function send(to: string, body: string, lastInboundAt: string | null) {
  const inWindow = lastInboundAt && Date.now() - new Date(lastInboundAt).getTime() < DAY - 5 * 60e3;
  const tpl = env('WHATSAPP_TEMPLATE');
  const message = inWindow || !tpl
    ? { type: 'text', text: { body } }
    : { type: 'template', template: { name: tpl, language: { code: env('WHATSAPP_TEMPLATE_LANG') || 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: body.slice(0, 1000) }] }] } };
  const r = await fetch(`https://graph.facebook.com/v21.0/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), ...message }),
  });
  return r.ok ? null : await r.text();
}

Deno.serve(async (req) => {
  if (env('CRON_SECRET') && req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return new Response('Forbidden', { status: 403 });
  const { data: due } = await db.from('enrollments').select('*, leads(name, phone), sequences(name, steps)').eq('status', 'active').lte('next_at', new Date().toISOString()).limit(50);
  let sent = 0, failed = 0;
  for (const e of due ?? []) {
    const steps = e.sequences?.steps ?? []; const step = steps[e.step];
    if (!step || !e.leads?.phone) { await db.from('enrollments').update({ status: 'done' }).eq('id', e.id); continue; }
    const [{ data: cfg }, { data: avail }, { data: conv }] = await Promise.all([
      db.from('agent_config').select('config').eq('owner', e.owner).maybeSingle(),
      db.from('availability').select('slug').eq('owner', e.owner).maybeSingle(),
      db.from('conversations').select('id, messages').eq('owner', e.owner).eq('channel', 'whatsapp').eq('phone', e.leads.phone.replace(/\D/g, '')).maybeSingle(),
    ]);
    const link = avail?.slug && env('BOOKING_BASE_URL') ? `${env('BOOKING_BASE_URL')}?b=${avail.slug}#${btoa(JSON.stringify({ u: env('SUPABASE_URL'), k: env('SUPABASE_ANON_KEY') }))}` : '';
    const body = String(step.body).replaceAll('{name}', first(e.leads.name)).replaceAll('{business}', cfg?.config?.business_name || 'our team').replaceAll('{booking_link}', link);
    const lastIn = [...(conv?.messages ?? [])].reverse().find((m: any) => m.from === 'lead')?.at ?? null;
    const err = await send(e.leads.phone, body, lastIn);
    if (err) { failed++; await db.from('notes').insert({ owner: e.owner, lead_id: e.lead_id, kind: 'note', body: `Follow-up not sent (${e.sequences.name}, step ${e.step + 1}): ${err.slice(0, 200)}` }); await db.from('enrollments').update({ next_at: new Date(Date.now() + 6 * 3600e3).toISOString() }).eq('id', e.id); continue; }
    sent++;
    await db.from('notes').insert({ owner: e.owner, lead_id: e.lead_id, kind: 'whatsapp', body: `Follow-up (${e.sequences.name}, step ${e.step + 1}): ${body}` });
    if (conv) await db.from('conversations').update({ messages: [...conv.messages, { from: 'ai', body, at: new Date().toISOString() }] }).eq('id', conv.id);
    const nxt = steps[e.step + 1];
    await db.from('enrollments').update(nxt ? { step: e.step + 1, next_at: new Date(Date.now() + Math.max(0, nxt.delay_days - step.delay_days) * DAY).toISOString() } : { step: e.step + 1, status: 'done', next_at: null }).eq('id', e.id);
  }
  return Response.json({ due: due?.length ?? 0, sent, failed });
});
