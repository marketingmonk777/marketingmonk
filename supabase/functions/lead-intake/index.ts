// Supabase Edge Function: receive leads from Zapier, Make, Meta or Google lead ads.
// POST https://<project>.supabase.co/functions/v1/lead-intake?key=<your intake key>
// Body (JSON or form): { name, phone, email?, source?, interest?, budget?, timeline? }
// Meta-style field names (full_name, phone_number) are accepted too.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const key = new URL(req.url).searchParams.get('key') ?? '';
  if (key.length < 20) return json({ error: 'missing key' }, 401);
  const { data: ig } = await db.from('integrations').select('owner').eq('config->>intake_key', key).maybeSingle();
  if (!ig) return json({ error: 'invalid key' }, 401);

  const ct = req.headers.get('content-type') ?? '';
  const raw: Record<string, any> = ct.includes('json') ? await req.json().catch(() => ({})) : Object.fromEntries(await req.formData().catch(() => new FormData()));
  const b = raw.lead ?? raw;
  const pick = (...ks: string[]) => { for (const k of ks) if (b[k] != null && String(b[k]).trim()) return String(b[k]).trim(); return ''; };
  const name = pick('name', 'full_name', 'fullName') || [pick('first_name'), pick('last_name')].filter(Boolean).join(' ');
  const phone = pick('phone', 'phone_number', 'mobile', 'whatsapp').replace(/^p:/, '');
  if (!name && !phone) return json({ error: 'name or phone required' }, 400);

  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits) {
    const { data: ex } = await db.from('leads').select('id, phone').eq('owner', ig.owner).ilike('phone', `%${digits.slice(-6)}%`);
    const hit = (ex ?? []).find((l) => (l.phone || '').replace(/\D/g, '').slice(-10) === digits);
    if (hit) { await db.from('notes').insert({ owner: ig.owner, lead_id: hit.id, kind: 'note', body: `New enquiry via ${pick('source') || 'integration'}: ${pick('interest', 'message') || '(no message)'}` }); return json({ ok: true, lead_id: hit.id, duplicate: true }); }
  }
  const { data: stage } = await db.from('stages').select('id').eq('owner', ig.owner).order('position').limit(1).maybeSingle();
  const { data: lead, error } = await db.from('leads').insert({
    owner: ig.owner, name: (name || phone).slice(0, 120), phone, email: pick('email') || null, source: pick('source', 'platform') || 'Integration', score: 'warm',
    stage_id: stage?.id ?? null, interest: pick('interest', 'message', 'requirement') || null, budget: pick('budget') || null, timeline: pick('timeline') || null, tags: ['intake'],
  }).select('id').single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, lead_id: lead.id });
});
