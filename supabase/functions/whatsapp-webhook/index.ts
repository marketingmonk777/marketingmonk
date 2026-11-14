// Supabase Edge Function: receives WhatsApp Cloud API webhooks, lets Monk AI
// reply, scores the lead and keeps the CRM in sync.
// Secrets: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, OWNER_ID
// Optional: GEMINI_API_KEY (free tier) for natural, context-aware replies.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { DEFAULT_AGENT, nextTurn, scoreAnswers, leadFields, answersSummary } from '../_shared/monk-engine.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const OWNER = env('OWNER_ID');

export async function sendWhatsApp(to: string, body: string) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!r.ok) console.error('WhatsApp send failed', r.status, await r.text());
  return r.ok;
}

// Optional LLM polish: keeps the rule engine's plan but lets Gemini answer
// side questions naturally ("what's the price?") before asking the next question.
async function polish(agent: any, history: any[], planned: string[]): Promise<string[]> {
  const key = env('GEMINI_API_KEY');
  if (!key) return planned;
  const prompt = `You are Monk AI, a warm, concise WhatsApp sales assistant for ${agent.business_name}. About: ${agent.about}
Conversation so far:\n${history.map((m) => `${m.from === 'lead' ? 'Customer' : 'You'}: ${m.body}`).join('\n')}
Your next message must convey the following, in order, as ONE short WhatsApp message (max 60 words, no markdown). If the customer asked something you can answer from "About", answer it briefly first; never invent prices or facts.\n${planned.join('\n')}`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 200 } }),
    });
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text ? [text] : planned;
  } catch { return planned; }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env('WHATSAPP_VERIFY_TOKEN');
    return new Response(ok ? url.searchParams.get('hub.challenge') : 'Forbidden', { status: ok ? 200 : 403 });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const payload = await req.json().catch(() => ({}));
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg || msg.type !== 'text') return new Response('ignored');
  const phone = msg.from as string;
  const text = msg.text.body as string;
  const name = value?.contacts?.[0]?.profile?.name || phone;
  const at = new Date().toISOString();

  const { data: cfg } = await db.from('agent_config').select('config').eq('owner', OWNER).maybeSingle();
  const agent = { ...DEFAULT_AGENT, ...(cfg?.config || {}) };

  let { data: conv } = await db.from('conversations').select('*').eq('owner', OWNER).eq('channel', 'whatsapp').eq('phone', phone).maybeSingle();
  if (!conv) {
    const { data: stage } = await db.from('stages').select('id').eq('owner', OWNER).order('position').limit(1).maybeSingle();
    const { data: lead } = await db.from('leads').insert({ owner: OWNER, name, phone: '+' + phone, source: 'WhatsApp', score: 'warm', stage_id: stage?.id ?? null, tags: ['monk-ai'] }).select().single();
    ({ data: conv } = await db.from('conversations').insert({ owner: OWNER, lead_id: lead?.id, name, phone, channel: 'whatsapp' }).select().single());
  }

  // A reply pauses any follow-up sequence that is set to stop on reply.
  if (conv.lead_id) {
    const { data: active } = await db.from('enrollments').select('id, sequences(stop_on_reply)').eq('lead_id', conv.lead_id).eq('status', 'active');
    const stop = (active ?? []).filter((e: any) => e.sequences?.stop_on_reply).map((e: any) => e.id);
    if (stop.length) await db.from('enrollments').update({ status: 'stopped' }).in('id', stop);
  }

  const messages = [...(conv.messages || []), { from: 'lead', body: text, at }];
  let patch: Record<string, unknown> = { messages, unread: (conv.unread || 0) + 1 };

  if (conv.status === 'ai') {
    const turn = nextTurn({ step: conv.step, answers: conv.answers, status: conv.status }, text, agent);
    const replies = await polish(agent, messages, turn.replies);
    for (const r of replies) { await sendWhatsApp(phone, r); messages.push({ from: 'ai', body: r, at: new Date().toISOString() }); }
    patch = { ...patch, messages, step: turn.conv.step, answers: turn.conv.answers, status: turn.conv.status };
    if (turn.done) {
      const score = turn.score ?? scoreAnswers(turn.conv.answers, agent);
      patch.score = score;
      const leadPatch: Record<string, unknown> = { score, ...leadFields(turn.conv.answers) };
      const summary = answersSummary(turn.conv.answers, agent);
      if (conv.lead_id && summary) await db.from('notes').insert({ owner: OWNER, lead_id: conv.lead_id, kind: 'whatsapp', body: 'Monk AI collected:\n' + summary });
      if (score === 'hot') {
        const { data: q } = await db.from('stages').select('id').eq('owner', OWNER).or('name.ilike.%qualif%,name.ilike.%rfq%').limit(1).maybeSingle();
        if (q) leadPatch.stage_id = q.id;
        leadPatch.assigned_to = agent.rep_name || null;
        await db.from('tasks').insert({ owner: OWNER, lead_id: conv.lead_id, title: `Call ${name} (hot lead from Monk AI)`, due_at: new Date(Date.now() + 15 * 60e3).toISOString() });
      }
      if (conv.lead_id) await db.from('leads').update(leadPatch).eq('id', conv.lead_id);
    }
  }
  await db.from('conversations').update(patch).eq('id', conv.id);
  return new Response('ok');
});
