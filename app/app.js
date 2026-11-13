/* MarketingMonk app – Part 2: auth + lead CRM.
   Two data backends behind one interface:
   - LocalStore: demo mode, saved in this browser (localStorage)
   - SupaStore: Supabase (auth + Postgres with row-level security) */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
  const fmtDT = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'No due date');
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const SCORE = { hot: '🔥 Hot', warm: '🌤️ Warm', cold: '❄️ Cold' };
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200); };

  const DEFAULT_STAGES = ['New', 'Contacted', 'Qualified', 'Demo booked', 'Won', 'Lost'];

  const DEFAULT_SEQS = () => [
    { id: uid(), name: 'New lead nurture', stop_on_reply: true, steps: [
      { delay_days: 0, body: 'Hi {name}, thanks for your interest in {business}! Here is a quick overview. Any questions, just reply here. 🙏' },
      { delay_days: 1, body: 'Hi {name}, did you get a chance to look? I can hold a quick call slot for you: {booking_link}' },
      { delay_days: 3, body: '{name}, many of our customers started exactly where you are. Happy to share a few examples, shall I?' },
      { delay_days: 7, body: 'Last check-in from {business}, {name}. If now is not the right time, no problem. Just reply "later" and we will reach out next month.' },
    ] },
    { id: uid(), name: 'No-show rescue', stop_on_reply: true, steps: [
      { delay_days: 0, body: 'Hi {name}, we missed you on the call today. Want to pick a new time? {booking_link}' },
      { delay_days: 2, body: 'Hi {name}, just making sure this did not slip. Book any slot that suits you: {booking_link}' },
    ] },
  ];
  const DEFAULT_AVAIL = { title: 'Discovery call', slug: 'marketingmonk', days: [1, 2, 3, 4, 5, 6], start: '10:00', end: '18:00', slot_minutes: 30, window_days: 14, note: 'A quick, friendly call to understand what you need.', tz: Intl.DateTimeFormat().resolvedOptions().timeZone };

  /* ---------- Local demo store ---------- */
  class LocalStore {
    constructor() {
      this.key = 'mm_demo_v1'; this.db = JSON.parse(localStorage.getItem(this.key) || 'null') || this.seed();
      const d = this.db; d.convs ||= []; d.seqs ||= DEFAULT_SEQS(); d.enrolls ||= []; d.avail ||= { ...DEFAULT_AVAIL }; d.bookings ||= [];
      if (!d.p4seed) { d.p4seed = 1; const l = d.leads; const h = (x) => new Date(Date.now() + x * 3600e3).toISOString();
        if (l[1]) d.enrolls.push({ id: uid(), lead_id: l[1].id, sequence_id: d.seqs[0].id, step: 1, next_at: h(-1), status: 'active', created_at: h(-25) });
        if (l[4]) d.enrolls.push({ id: uid(), lead_id: l[4].id, sequence_id: d.seqs[0].id, step: 0, next_at: h(-0.2), status: 'active', created_at: h(-0.3) });
        if (l[3]) d.enrolls.push({ id: uid(), lead_id: l[3].id, sequence_id: d.seqs[0].id, step: 2, next_at: h(30), status: 'active', created_at: h(-40) });
        const tmr = new Date(); tmr.setDate(tmr.getDate() + 1); tmr.setHours(11, 0, 0, 0);
        if (l[2]) d.bookings.push({ id: uid(), lead_id: l[2].id, name: l[2].name, phone: l[2].phone, email: '', starts_at: tmr.toISOString(), ends_at: new Date(+tmr + 30 * 6e4).toISOString(), note: 'Wants to discuss the clinic package', status: 'booked', created_at: h(-2) });
      }
      this.save();
    }
    get mode() { return 'demo'; }
    save() { localStorage.setItem(this.key, JSON.stringify(this.db)); }
    seed() {
      const stages = DEFAULT_STAGES.map((name, i) => ({ id: uid(), name, position: i }));
      const s = (n) => stages[n].id;
      const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
      const leads = [
        ['Ananya Rao', '+919800000001', 'Meta ads', 'hot', s(2), '2BHK apartment', '₹60–75L', 'This month', 'Priya', 6500000, 3],
        ['Vikram Shetty', '+919800000002', 'Google ads', 'warm', s(1), 'Gym annual plan', '₹18k', 'Next month', 'Rahul', 18000, 20],
        ['Meera Joshi', '+919800000003', 'Website', 'hot', s(3), 'Clinic consultation', '₹2,500', 'This week', 'Priya', 2500, 30],
        ['Arjun Patil', '+919800000004', 'WhatsApp', 'cold', s(0), 'Coaching course', 'Not shared', 'Just browsing', '', 12000, 2],
        ['Sneha Kulkarni', '+919800000005', 'Referral', 'warm', s(0), 'Interior design', '₹4–6L', '3 months', 'Rahul', 500000, 1],
        ['Farhan Sheikh', '+919800000006', 'Meta ads', 'hot', s(4), 'Yoga studio membership', '₹9k', 'Immediate', 'Priya', 9000, 72],
        ['Kavya Hegde', '+919800000007', 'Walk-in', 'cold', s(5), 'Home cleaning', '₹3k', 'Unsure', 'Rahul', 3000, 120],
      ].map(([name, phone, source, score, stage_id, interest, budget, timeline, assigned_to, value, h]) => ({ id: uid(), name, phone, email: '', source, score, stage_id, interest, budget, timeline, assigned_to, value, tags: [], created_at: ago(h), updated_at: ago(h) }));
      const notes = [{ id: uid(), lead_id: leads[0].id, kind: 'whatsapp', body: 'Asked for floor plans. Sent brochure PDF.', created_at: ago(2) }];
      const tasks = [
        { id: uid(), lead_id: leads[0].id, title: 'Call Ananya with floor plans', due_at: new Date(Date.now() + 3 * 3600e3).toISOString(), done: false, created_at: ago(1) },
        { id: uid(), lead_id: leads[2].id, title: 'Confirm Meera’s consultation slot', due_at: new Date(Date.now() - 2 * 3600e3).toISOString(), done: false, created_at: ago(5) },
      ];
      const conv = { id: uid(), lead_id: leads[0].id, name: 'Ananya Rao', phone: '+919800000001', channel: 'whatsapp', status: 'human', score: 'hot', step: 9, answers: { interest: '2BHK apartment', budget: '₹60–75L', timeline: 'This month' }, unread: 1, updated_at: ago(0.5),
        messages: [
          { from: 'lead', body: 'Hi, I saw your ad for the new apartments near the ring road. What is the starting price?', at: ago(3) },
          { from: 'ai', body: 'Namaste! 🙏 Thanks for reaching out. 2BHKs start at ₹58L. Do you have a budget in mind?', at: ago(3) },
          { from: 'lead', body: 'Around 60 to 75 lakhs', at: ago(2.9) },
          { from: 'ai', body: 'When are you hoping to move in?', at: ago(2.9) },
          { from: 'lead', body: 'This month if possible', at: ago(2.8) },
          { from: 'ai', body: 'Perfect, thank you! Priya from our team will call you shortly. 📞', at: ago(2.8) },
          { from: 'lead', body: 'Can she share the floor plans first?', at: ago(0.5) },
        ] };
      return { stages, leads, notes, tasks, convs: [conv], agent: null };
    }
    reset() { localStorage.removeItem(this.key); this.db = new LocalStore().db; }
    async session() { return localStorage.getItem('mm_demo_on') ? { email: 'demo@marketingmonk' } : null; }
    async signOut() { localStorage.removeItem('mm_demo_on'); }
    async stages() { return [...this.db.stages].sort((a, b) => a.position - b.position); }
    async addStage(name) { const st = { id: uid(), name, position: this.db.stages.length }; this.db.stages.push(st); this.save(); return st; }
    async updateStage(id, patch) { Object.assign(this.db.stages.find((s) => s.id === id), patch); this.save(); }
    async deleteStage(id) { this.db.stages = this.db.stages.filter((s) => s.id !== id); this.db.leads.forEach((l) => { if (l.stage_id === id) l.stage_id = null; }); this.save(); }
    async leads() { return [...this.db.leads].sort((a, b) => b.created_at.localeCompare(a.created_at)); }
    async saveLead(lead) {
      const now = new Date().toISOString();
      if (lead.id) { Object.assign(this.db.leads.find((l) => l.id === lead.id), lead, { updated_at: now }); }
      else {
        lead = { ...lead, id: uid(), created_at: now, updated_at: now }; this.db.leads.push(lead);
        const hook = this.db.integ?.webhook_out; // demo stand-in for the database trigger used in cloud mode
        if (hook) fetch(hook, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ event: 'lead.created', lead }) }).catch(() => {});
      }
      this.save(); return lead;
    }
    async deleteLead(id) { this.db.leads = this.db.leads.filter((l) => l.id !== id); this.db.notes = this.db.notes.filter((n) => n.lead_id !== id); this.db.tasks = this.db.tasks.filter((t) => t.lead_id !== id); this.save(); }
    async notes(leadId) { return this.db.notes.filter((n) => n.lead_id === leadId).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
    async addNote(n) { this.db.notes.push({ ...n, id: uid(), created_at: new Date().toISOString() }); this.save(); }
    async tasks() { return [...this.db.tasks]; }
    async addTask(t) { this.db.tasks.push({ ...t, id: uid(), done: false, created_at: new Date().toISOString() }); this.save(); }
    async updateTask(id, patch) { Object.assign(this.db.tasks.find((t) => t.id === id), patch); this.save(); }
    async deleteTask(id) { this.db.tasks = this.db.tasks.filter((t) => t.id !== id); this.save(); }
    async agentConfig() { return this.db.agent || { ...window.MonkEngine.DEFAULT_AGENT }; }
    async saveAgentConfig(a) { this.db.agent = a; this.save(); }
    async conversations() { return [...(this.db.convs || [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)); }
    async saveConversation(c) {
      this.db.convs = this.db.convs || []; c = { ...c, updated_at: new Date().toISOString() };
      if (!c.id) { c.id = uid(); this.db.convs.push(c); } else { const i = this.db.convs.findIndex((x) => x.id === c.id); if (i < 0) this.db.convs.push(c); else this.db.convs[i] = c; }
      this.save(); return c;
    }
    async sendWhatsApp() { return { simulated: true }; }
    async sequences() { return this.db.seqs; }
    async saveSequence(q) { if (!q.id) { q = { ...q, id: uid() }; this.db.seqs.push(q); } else this.db.seqs = this.db.seqs.map((x) => (x.id === q.id ? q : x)); this.save(); return q; }
    async deleteSequence(id) { this.db.seqs = this.db.seqs.filter((x) => x.id !== id); this.db.enrolls = this.db.enrolls.filter((e) => e.sequence_id !== id); this.save(); }
    async enrollments() { return this.db.enrolls; }
    async enroll(e) { const r = { ...e, id: uid(), created_at: new Date().toISOString() }; this.db.enrolls.push(r); this.save(); return r; }
    async updateEnrollment(id, patch) { Object.assign(this.db.enrolls.find((e) => e.id === id), patch); this.save(); }
    async availability() { return this.db.avail; }
    async saveAvailability(a) { this.db.avail = a; this.save(); }
    async bookings() { return [...this.db.bookings].sort((a, b) => a.starts_at.localeCompare(b.starts_at)); }
    async updateBooking(id, patch) { Object.assign(this.db.bookings.find((b) => b.id === id), patch); this.save(); }
    async integrations() { return this.db.integ || {}; }
    async saveIntegrations(c) { this.db.integ = c; this.save(); }
  }

  /* ---------- Supabase store ---------- */
  class SupaStore {
    constructor(url, key) { this.sb = window.supabase.createClient(url, key); }
    get mode() { return 'cloud'; }
    chk({ data, error }) { if (error) throw error; return data; }
    async session() { const { data } = await this.sb.auth.getSession(); return data.session ? { email: data.session.user.email } : null; }
    async signIn(email, password) { this.chk(await this.sb.auth.signInWithPassword({ email, password })); }
    async signUp(email, password) { return this.chk(await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } })); }
    async signOut() { await this.sb.auth.signOut(); }
    async stages() {
      let rows = this.chk(await this.sb.from('stages').select('*').order('position'));
      if (!rows.length) { rows = this.chk(await this.sb.from('stages').insert(DEFAULT_STAGES.map((name, position) => ({ name, position }))).select('*').order('position')); }
      return rows;
    }
    async addStage(name) { const n = (await this.stages()).length; return this.chk(await this.sb.from('stages').insert({ name, position: n }).select().single()); }
    async updateStage(id, patch) { this.chk(await this.sb.from('stages').update(patch).eq('id', id)); }
    async deleteStage(id) { this.chk(await this.sb.from('stages').delete().eq('id', id)); }
    async leads() { return this.chk(await this.sb.from('leads').select('*').order('created_at', { ascending: false })); }
    async saveLead(lead) {
      const { id, created_at, updated_at, owner, ...row } = lead;
      if (id) return this.chk(await this.sb.from('leads').update(row).eq('id', id).select().single());
      return this.chk(await this.sb.from('leads').insert(row).select().single());
    }
    async deleteLead(id) { this.chk(await this.sb.from('leads').delete().eq('id', id)); }
    async notes(leadId) { return this.chk(await this.sb.from('notes').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })); }
    async addNote(n) { this.chk(await this.sb.from('notes').insert(n)); }
    async tasks() { return this.chk(await this.sb.from('tasks').select('*').order('due_at', { ascending: true, nullsFirst: false })); }
    async addTask(t) { this.chk(await this.sb.from('tasks').insert(t)); }
    async updateTask(id, patch) { this.chk(await this.sb.from('tasks').update(patch).eq('id', id)); }
    async deleteTask(id) { this.chk(await this.sb.from('tasks').delete().eq('id', id)); }
    async agentConfig() { const r = this.chk(await this.sb.from('agent_config').select('config').maybeSingle()); return r?.config || { ...window.MonkEngine.DEFAULT_AGENT }; }
    async saveAgentConfig(config) { this.chk(await this.sb.from('agent_config').upsert({ config })); }
    async conversations() { return this.chk(await this.sb.from('conversations').select('*').order('updated_at', { ascending: false })); }
    async saveConversation(c) {
      const { id, owner, created_at, updated_at, ...row } = c;
      if (id) return this.chk(await this.sb.from('conversations').update(row).eq('id', id).select().single());
      return this.chk(await this.sb.from('conversations').insert(row).select().single());
    }
    async sequences() { return this.chk(await this.sb.from('sequences').select('*').order('created_at')); }
    async saveSequence(q) { const { id, owner, created_at, ...row } = q; return id ? this.chk(await this.sb.from('sequences').update(row).eq('id', id).select().single()) : this.chk(await this.sb.from('sequences').insert(row).select().single()); }
    async deleteSequence(id) { this.chk(await this.sb.from('sequences').delete().eq('id', id)); }
    async enrollments() { return this.chk(await this.sb.from('enrollments').select('*')); }
    async enroll(e) { return this.chk(await this.sb.from('enrollments').insert(e).select().single()); }
    async updateEnrollment(id, patch) { this.chk(await this.sb.from('enrollments').update(patch).eq('id', id)); }
    async availability() { const r = this.chk(await this.sb.from('availability').select('*').maybeSingle()); return r ? { ...r.config, slug: r.slug } : { ...DEFAULT_AVAIL, slug: 'mm-' + Math.random().toString(36).slice(2, 8) }; }
    async saveAvailability(a) { const { slug, ...config } = a; this.chk(await this.sb.from('availability').upsert({ slug, config })); }
    async bookings() { return this.chk(await this.sb.from('bookings').select('*').order('starts_at')); }
    async updateBooking(id, patch) { this.chk(await this.sb.from('bookings').update(patch).eq('id', id)); }
    async integrations() { const r = this.chk(await this.sb.from('integrations').select('config').maybeSingle()); return r?.config || {}; }
    async saveIntegrations(config) { this.chk(await this.sb.from('integrations').upsert({ config })); }
    async sendWhatsApp(conversation_id, body) { const { data, error } = await this.sb.functions.invoke('whatsapp-send', { body: { conversation_id, body } }); if (error) throw error; return data; }
  }

  /* ---------- State ---------- */
  let cfg = null, cloud = null, bootIssue = '';
  try { cfg = JSON.parse(localStorage.getItem('mm_supabase') || 'null'); } catch { localStorage.removeItem('mm_supabase'); }
  if (cfg) {
    cfg.url = String(cfg.url || '').trim().replace(/\/+$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(cfg.url || '')) bootIssue = 'The saved Project URL looks wrong. It should look like https://abcd1234.supabase.co (Project Settings → API).';
    else if (!window.supabase) bootIssue = 'Couldn\'t load the Supabase library. Check your connection or ad blocker, then refresh.';
    else { try { cloud = new SupaStore(cfg.url, cfg.key); } catch (e) { bootIssue = 'Couldn\'t connect to Supabase: ' + e.message; } }
  }
  let store = null;
  const state = { stages: [], leads: [], tasks: [], convs: [], agent: null, seqs: [], enrolls: [], avail: null, bookings: [], activeSeq: null, activeConv: null, view: 'pipeline', editing: null };

  async function load() {
    [state.stages, state.leads, state.tasks, state.convs, state.agent, state.seqs, state.enrolls, state.avail, state.bookings, state.integ] = await Promise.all([store.stages(), store.leads(), store.tasks(), store.conversations(), store.agentConfig(), store.sequences(), store.enrollments(), store.availability(), store.bookings(), store.integrations()]);
    render();
  }

  function filtered() {
    const q = $('#search').value.trim().toLowerCase();
    const sc = $('#filter-score').value;
    return state.leads.filter((l) => (!sc || l.score === sc) && (!q || [l.name, l.phone, l.email, l.interest, l.assigned_to, l.source].join(' ').toLowerCase().includes(q)));
  }
  const stageName = (id) => state.stages.find((s) => s.id === id)?.name || 'Unsorted';

  /* ---------- Render ---------- */
  function render() {
    $$('.view').forEach((v) => v.classList.add('hidden'));
    $('#view-' + state.view).classList.remove('hidden');
    $$('.side nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === state.view));
    $('#view-title').textContent = { pipeline: 'Pipeline', inbox: 'Inbox', leads: 'Leads', followups: 'Follow-ups', bookings: 'Bookings', tasks: 'Tasks', dashboard: 'Insights', agent: 'Monk AI', integrations: 'Integrations', settings: 'Settings' }[state.view];
    const showFilters = ['pipeline', 'leads'].includes(state.view);
    $('#search').classList.toggle('hidden', !showFilters);
    $('#filter-score').classList.toggle('hidden', !showFilters);
    ({ pipeline: renderBoard, inbox: renderInbox, leads: renderTable, followups: renderFollowups, bookings: renderBookings, tasks: renderTasks, dashboard: renderDash, agent: renderAgent, integrations: renderIntegrations, settings: renderSettings })[state.view]();
    const unread = state.convs.filter((c) => c.unread).length; const ic = $('#inbox-count'); ic.textContent = unread; ic.classList.toggle('hidden', !unread);
    const due = dueEnrollments().length; const dc = $('#due-count'); dc.textContent = due; dc.classList.toggle('hidden', !due);
  }

  function card(l) {
    const open = state.tasks.filter((t) => t.lead_id === l.id && !t.done).length;
    return `<article class="card" draggable="true" data-id="${l.id}">
      <div class="card-top"><b>${esc(l.name)}</b><span class="score ${l.score}">${SCORE[l.score] || ''}</span></div>
      <p class="muted small">${esc(l.interest || '—')}</p>
      <div class="card-meta"><span>${esc(l.source || '')}</span>${l.value ? `<span>${inr(l.value)}</span>` : ''}</div>
      <div class="card-meta"><span>${l.assigned_to ? '👤 ' + esc(l.assigned_to) : 'Unassigned'}</span>${open ? `<span class="pill">⏰ ${open}</span>` : ''}</div>
    </article>`;
  }

  function renderBoard() {
    const leads = filtered();
    const cols = [...state.stages];
    if (leads.some((l) => !state.stages.find((s) => s.id === l.stage_id))) cols.push({ id: null, name: 'Unsorted' });
    $('#board').innerHTML = cols.map((s) => {
      const items = leads.filter((l) => (s.id ? l.stage_id === s.id : !state.stages.find((x) => x.id === l.stage_id)));
      const total = items.reduce((a, l) => a + Number(l.value || 0), 0);
      return `<div class="col" data-stage="${s.id ?? ''}"><div class="col-head"><span>${esc(s.name)}</span><span class="muted small">${items.length} · ${inr(total)}</span></div><div class="col-body">${items.map(card).join('') || '<p class="empty">Drop leads here</p>'}</div></div>`;
    }).join('');
  }

  function renderTable() {
    const rows = filtered();
    $('#leads-body').innerHTML = rows.length ? rows.map((l) => `<tr data-id="${l.id}"><td><b>${esc(l.name)}</b><br><span class="muted small">${esc(l.phone || '')}</span></td><td><span class="score ${l.score}">${SCORE[l.score] || ''}</span></td><td>${esc(stageName(l.stage_id))}</td><td>${esc(l.source || '')}</td><td>${esc(l.interest || '')}</td><td>${esc(l.assigned_to || '—')}</td><td>${fmtDate(l.created_at)}</td></tr>`).join('') : '<tr><td colspan="7" class="empty">No leads match.</td></tr>';
  }

  function renderTasks() {
    const now = Date.now();
    const ts = [...state.tasks].sort((a, b) => a.done - b.done || (a.due_at || '9').localeCompare(b.due_at || '9'));
    $('#task-list').innerHTML = ts.length ? ts.map((t) => {
      const lead = state.leads.find((l) => l.id === t.lead_id);
      const overdue = !t.done && t.due_at && new Date(t.due_at).getTime() < now;
      return `<li class="${t.done ? 'done' : ''} ${overdue ? 'overdue' : ''}" data-id="${t.id}"><input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Done"><div><b>${esc(t.title)}</b><span class="small muted">${fmtDT(t.due_at)}${lead ? ' · ' + esc(lead.name) : ''}${overdue ? ' · Overdue' : ''}</span></div><button class="x" title="Delete">×</button></li>`;
    }).join('') : '<li class="empty">No tasks yet. Add your first follow-up.</li>';
  }



  function renderSettings() {
    $('#stage-list').innerHTML = state.stages.map((s, i) => `<li data-id="${s.id}"><input value="${esc(s.name)}" aria-label="Stage name"><button class="link up" ${i === 0 ? 'disabled' : ''}>↑</button><button class="link down" ${i === state.stages.length - 1 ? 'disabled' : ''}>↓</button><button class="x del" title="Delete stage">×</button></li>`).join('');
    $('#reset-demo').closest('.panel').classList.toggle('hidden', store.mode !== 'demo');
  }

  /* ---------- Drawer ---------- */
  function fillStageSelect(val) { $('#stage-select').innerHTML = state.stages.map((s) => `<option value="${s.id}" ${s.id === val ? 'selected' : ''}>${esc(s.name)}</option>`).join(''); }
  async function openLead(id) {
    const l = id ? state.leads.find((x) => x.id === id) : null;
    state.editing = l;
    const f = $('#lead-form');
    f.reset();
    fillStageSelect(l?.stage_id || state.stages[0]?.id);
    if (l) for (const [k, v] of Object.entries(l)) if (f.elements[k] && k !== 'stage_id') f.elements[k].value = Array.isArray(v) ? v.join(', ') : v ?? '';
    $('#drawer-title').textContent = l ? l.name : 'New lead';
    $('#delete-lead').classList.toggle('hidden', !l);
    const wa = $('#wa-link'); const digits = (l?.phone || '').replace(/\D/g, '');
    wa.classList.toggle('hidden', !digits); if (digits) wa.href = `https://wa.me/${digits}`;
    $('#lead-extra').classList.toggle('hidden', !l);
    if (l) { await renderNotes(); renderLeadSeq(); }
    $('#drawer').classList.remove('hidden'); $('#scrim').classList.remove('hidden');
    f.elements.name.focus();
  }
  function closeLead() { $('#drawer').classList.add('hidden'); $('#scrim').classList.add('hidden'); state.editing = null; }
  async function renderNotes() {
    const ns = await store.notes(state.editing.id);
    const icon = { note: '📝', call: '📞', whatsapp: '💬', email: '✉️' };
    $('#note-list').innerHTML = ns.map((n) => `<li><span>${icon[n.kind] || '📝'}</span><div>${esc(n.body)}<span class="small muted">${fmtDT(n.created_at)}</span></div></li>`).join('') || '<li class="empty">No activity yet.</li>';
  }

  /* ---------- Events ---------- */
  function bind() {
    $$('.side nav a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); state.view = a.dataset.view; location.hash = state.view; render(); }));
    $('#search').addEventListener('input', render);
    $('#filter-score').addEventListener('change', render);
    $('#new-lead').addEventListener('click', () => openLead(null));
    $('#drawer-close').addEventListener('click', closeLead);
    $('#scrim').addEventListener('click', closeLead);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLead(); });

    $('#board').addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) openLead(c.dataset.id); });
    $('#leads-body').addEventListener('click', (e) => { const r = e.target.closest('tr[data-id]'); if (r) openLead(r.dataset.id); });

    // Drag and drop between stages
    let dragId = null;
    $('#board').addEventListener('dragstart', (e) => { const c = e.target.closest('.card'); if (!c) return; dragId = c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    $('#board').addEventListener('dragend', (e) => { e.target.closest?.('.card')?.classList.remove('dragging'); $$('.col').forEach((c) => c.classList.remove('over')); });
    $('#board').addEventListener('dragover', (e) => { const col = e.target.closest('.col'); if (!col) return; e.preventDefault(); $$('.col').forEach((c) => c.classList.toggle('over', c === col)); });
    $('#board').addEventListener('drop', async (e) => {
      const col = e.target.closest('.col'); if (!col || !dragId) return; e.preventDefault();
      const lead = state.leads.find((l) => l.id === dragId); const to = col.dataset.stage || null;
      if (lead && lead.stage_id !== to) { lead.stage_id = to; render(); try { await store.saveLead({ id: lead.id, stage_id: to }); toast(`Moved to ${stageName(to)}`); } catch (err) { toast(err.message); load(); } }
      dragId = null;
    });

    $('#lead-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      fd.value = Number(fd.value || 0);
      fd.tags = (fd.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
      if (state.editing) fd.id = state.editing.id;
      try { await store.saveLead(fd); toast(state.editing ? 'Lead updated' : 'Lead added'); closeLead(); load(); } catch (err) { toast(err.message); }
    });
    $('#delete-lead').addEventListener('click', async () => { if (!state.editing || !confirm(`Delete ${state.editing.name}?`)) return; await store.deleteLead(state.editing.id); closeLead(); toast('Lead deleted'); load(); });
    $('#note-form').addEventListener('submit', async (e) => { e.preventDefault(); await store.addNote({ lead_id: state.editing.id, kind: $('#note-kind').value, body: $('#note-body').value.trim() }); $('#note-body').value = ''; renderNotes(); });
    $('#lead-task-form').addEventListener('submit', async (e) => { e.preventDefault(); const due = $('#lead-task-due').value; await store.addTask({ lead_id: state.editing.id, title: $('#lead-task-title').value.trim(), due_at: due ? new Date(due).toISOString() : null }); e.target.reset(); toast('Reminder added'); load(); });

    $('#task-form').addEventListener('submit', async (e) => { e.preventDefault(); const due = $('#task-due').value; await store.addTask({ lead_id: null, title: $('#task-title').value.trim(), due_at: due ? new Date(due).toISOString() : null }); e.target.reset(); load(); });
    $('#task-list').addEventListener('click', async (e) => {
      const li = e.target.closest('li[data-id]'); if (!li) return;
      if (e.target.matches('input[type=checkbox]')) { await store.updateTask(li.dataset.id, { done: e.target.checked }); load(); }
      if (e.target.matches('.x')) { await store.deleteTask(li.dataset.id); load(); }
    });

    $('#stage-form').addEventListener('submit', async (e) => { e.preventDefault(); await store.addStage($('#stage-name').value.trim()); e.target.reset(); load(); });
    $('#stage-list').addEventListener('change', async (e) => { const li = e.target.closest('li'); if (li && e.target.value.trim()) { await store.updateStage(li.dataset.id, { name: e.target.value.trim() }); toast('Stage renamed'); load(); } });
    $('#stage-list').addEventListener('click', async (e) => {
      const li = e.target.closest('li'); if (!li) return; const i = state.stages.findIndex((s) => s.id === li.dataset.id);
      if (e.target.matches('.del')) { if (confirm('Delete this stage? Its leads move to Unsorted.')) { await store.deleteStage(li.dataset.id); load(); } return; }
      const j = e.target.matches('.up') ? i - 1 : e.target.matches('.down') ? i + 1 : -1; if (j < 0 || j >= state.stages.length) return;
      const a = state.stages[i], b = state.stages[j];
      await Promise.all([store.updateStage(a.id, { position: j }), store.updateStage(b.id, { position: i })]); load();
    });
    $('#reset-demo').addEventListener('click', async () => { if (confirm('Reset all demo data?')) { store.reset(); load(); toast('Demo data reset'); } });

    $('#signout').addEventListener('click', async () => { await store.signOut(); location.hash = ''; location.reload(); });
    const openConnect = (e) => { e?.preventDefault(); $('#sb-url').value = cfg?.url || ''; $('#sb-key').value = cfg?.key || ''; $('#connect').showModal(); };
    $('#open-connect').addEventListener('click', openConnect);
    $('#settings-connect').addEventListener('click', openConnect);
    $('#connect').addEventListener('close', () => {
      const v = $('#connect').returnValue;
      if (v === 'save') { const url = $('#sb-url').value.trim().replace(/\/$/, ''); const key = $('#sb-key').value.trim(); if (url && key) { localStorage.setItem('mm_supabase', JSON.stringify({ url, key })); localStorage.removeItem('mm_demo_on'); location.reload(); } }
      if (v === 'clear') { localStorage.removeItem('mm_supabase'); location.reload(); }
    });
  }

  /* ---------- Inbox ---------- */
  const STATUS = { ai: '🧘 Monk AI', human: '👤 Needs you', done: '✓ Done' };
  const timeAgo = (d) => { const m = Math.round((Date.now() - new Date(d)) / 6e4); return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; };
  function renderInbox() {
    const q = $('#search').value.trim().toLowerCase();
    const cs = state.convs.filter((c) => !q || (c.name + ' ' + c.phone).toLowerCase().includes(q));
    $('#conv-list').innerHTML = cs.length ? cs.map((c) => {
      const last = (c.messages || []).at(-1);
      return `<button class="conv ${c.id === state.activeConv ? 'active' : ''} ${c.unread ? 'unread' : ''}" data-id="${c.id}">
        <div class="conv-top"><b>${esc(c.name || c.phone)}</b><span class="small muted">${last ? timeAgo(last.at) : ''}</span></div>
        <p class="small muted">${esc(last ? (last.from === 'lead' ? '' : last.from === 'ai' ? 'AI: ' : 'You: ') + last.body : '')}</p>
        <div class="conv-tags"><span class="st ${c.status}">${STATUS[c.status] || ''}</span>${c.score ? `<span class="score ${c.score}">${SCORE[c.score]}</span>` : ''}${c.channel === 'simulator' ? '<span class="st">Test</span>' : ''}</div>
      </button>`;
    }).join('') : '<p class="empty">No conversations yet. Try the Monk AI test chat.</p>';
    renderThread();
  }
  function renderThread() {
    const c = state.convs.find((x) => x.id === state.activeConv);
    if (!c) { $('#thread').innerHTML = '<p class="empty">Pick a conversation. New WhatsApp chats land here, and Monk AI answers them first.</p>'; return; }
    const who = { lead: '', ai: 'Monk AI', rep: 'You' };
    $('#thread').innerHTML = `<div class="thread-head"><div><b>${esc(c.name || c.phone)}</b><span class="small muted">${esc(c.phone || '')} · ${STATUS[c.status] || ''}</span></div>
      <div class="drawer-actions">${c.lead_id ? '<button class="btn btn-ghost btn-sm" id="t-lead">Open lead</button>' : ''}<button class="btn btn-ghost btn-sm" id="t-toggle">${c.status === 'ai' ? 'Take over' : 'Let Monk AI reply'}</button></div></div>
      ${Object.keys(c.answers || {}).length ? `<div class="answers">${Object.entries(c.answers).map(([k, v]) => `<span><b>${esc(k)}</b> ${esc(v)}</span>`).join('')}</div>` : ''}
      <div class="bubbles" id="bubbles">${(c.messages || []).map((m) => `<div class="bub ${m.from}">${who[m.from] ? `<i>${who[m.from]}</i>` : ''}${esc(m.body)}<span>${fmtDT(m.at)}</span></div>`).join('')}</div>
      <form id="reply-form" class="sim-form"><input id="reply-input" placeholder="Reply on WhatsApp…" autocomplete="off" required><button class="btn btn-sm">Send</button></form>`;
    const b = $('#bubbles'); b.scrollTop = b.scrollHeight;
  }

  /* ---------- Monk AI setup + simulator ---------- */
  function qRow(q = { key: '', question: '' }) { return `<div class="q-row"><input class="q-key" placeholder="field (budget)" value="${esc(q.key)}"><input class="q-text" placeholder="Question to ask" value="${esc(q.question)}"><button type="button" class="x">×</button></div>`; }
  function renderAgent() {
    const a = state.agent || {}; const f = $('#agent-form');
    ['business_name', 'rep_name', 'about', 'greeting', 'hot_words', 'cold_words', 'handoff_hot', 'handoff_other'].forEach((k) => { f.elements[k].value = a[k] || ''; });
    $('#q-list').innerHTML = (a.questions || []).map(qRow).join('');
    if (!sim.started) simReset();
  }
  const sim = { conv: null, started: false, busy: false };
  function simBubble(from, body) { const el = document.createElement('div'); el.className = 'bub ' + from; el.innerHTML = (from === 'ai' ? '<i>Monk AI</i>' : '') + esc(body); $('#sim-body').append(el); $('#sim-body').scrollTop = 1e6; }
  function simReset() { sim.started = true; sim.conv = { step: -1, answers: {}, status: 'ai', messages: [] }; $('#sim-body').innerHTML = '<p class="empty small">Say hi the way a customer would, e.g. "Hi, I saw your ad".</p>'; $('#sim-note').textContent = 'Finished chats create a scored lead in your pipeline and inbox.'; $('#sim-input').disabled = false; }
  async function simSend(text) {
    if (sim.busy) return; sim.busy = true;
    if (sim.conv.step === -1) $('#sim-body').innerHTML = '';
    const now = () => new Date().toISOString();
    simBubble('lead', text); sim.conv.messages.push({ from: 'lead', body: text, at: now() });
    const r = window.MonkEngine.nextTurn(sim.conv, text, state.agent);
    sim.conv = { ...r.conv, messages: sim.conv.messages };
    for (const reply of r.replies) {
      const typing = document.createElement('div'); typing.className = 'bub ai typing'; typing.innerHTML = '<i>Monk AI</i><b>•••</b>'; $('#sim-body').append(typing); $('#sim-body').scrollTop = 1e6;
      await new Promise((ok) => setTimeout(ok, 650)); typing.remove();
      simBubble('ai', reply); sim.conv.messages.push({ from: 'ai', body: reply, at: now() });
    }
    if (r.done) {
      const ans = sim.conv.answers;
      const qualified = state.stages.find((s) => /qualif/i.test(s.name)) || state.stages[0];
      const stage = r.score === 'hot' ? qualified : state.stages[0];
      const name = 'Test lead ' + new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
      try {
        const lead = await store.saveLead({ name, phone: '', email: '', source: 'WhatsApp', score: r.score, stage_id: stage?.id || null, interest: ans.interest || '', budget: ans.budget || '', timeline: ans.timeline || '', assigned_to: r.score === 'hot' ? (state.agent?.rep_name || '') : '', value: 0, tags: ['monk-ai'] });
        await store.saveConversation({ lead_id: lead.id, name, phone: '', channel: 'simulator', status: sim.conv.status, score: r.score, step: sim.conv.step, answers: ans, unread: r.score === 'hot' ? 1 : 0, messages: sim.conv.messages });
        if (r.score === 'hot') await store.addTask({ lead_id: lead.id, title: `Call ${name} (hot lead from Monk AI)`, due_at: new Date(Date.now() + 15 * 6e4).toISOString() });
        $('#sim-note').innerHTML = `Lead created: <span class="score ${r.score}">${SCORE[r.score]}</span> in ${esc(stage?.name || 'pipeline')}. <a href="#" id="sim-restart">Test again</a>`;
        $('#sim-input').disabled = true;
        await load();
      } catch (err) { toast(err.message); }
    }
    sim.busy = false;
  }

  function bindAI() {
    $('#conv-list').addEventListener('click', async (e) => {
      const b = e.target.closest('.conv'); if (!b) return; state.activeConv = b.dataset.id;
      const c = state.convs.find((x) => x.id === b.dataset.id);
      if (c?.unread) { c.unread = 0; render(); try { await store.saveConversation({ ...c }); } catch {} } else renderInbox();
    });
    $('#thread').addEventListener('click', async (e) => {
      const c = state.convs.find((x) => x.id === state.activeConv); if (!c) return;
      if (e.target.id === 't-lead') openLead(c.lead_id);
      if (e.target.id === 't-toggle') { c.status = c.status === 'ai' ? 'human' : 'ai'; await store.saveConversation({ ...c }); toast(c.status === 'ai' ? 'Monk AI will reply' : 'You have taken over'); load(); }
    });
    $('#thread').addEventListener('submit', async (e) => {
      if (e.target.id !== 'reply-form') return; e.preventDefault();
      const c = state.convs.find((x) => x.id === state.activeConv); const body = $('#reply-input').value.trim(); if (!c || !body) return;
      c.messages = [...(c.messages || []), { from: 'rep', body, at: new Date().toISOString() }];
      if (c.status === 'ai') c.status = 'human';
      try {
        if (c.channel === 'whatsapp' && store.mode === 'cloud') await store.sendWhatsApp(c.id, body);
        else await store.saveConversation({ ...c });
        if (c.lead_id) await store.addNote({ lead_id: c.lead_id, kind: 'whatsapp', body: 'Replied: ' + body });
      } catch (err) { toast('Not sent: ' + err.message); }
      load();
    });
    $('#add-q').addEventListener('click', () => $('#q-list').insertAdjacentHTML('beforeend', qRow()));
    $('#q-list').addEventListener('click', (e) => { if (e.target.matches('.x')) e.target.closest('.q-row').remove(); });
    $('#agent-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target; const a = {};
      ['business_name', 'rep_name', 'about', 'greeting', 'hot_words', 'cold_words', 'handoff_hot', 'handoff_other'].forEach((k) => { a[k] = f.elements[k].value.trim(); });
      a.questions = $$('.q-row').map((r) => ({ key: r.querySelector('.q-key').value.trim().toLowerCase().replace(/\s+/g, '_') || 'answer', question: r.querySelector('.q-text').value.trim() })).filter((q) => q.question);
      try { await store.saveAgentConfig(a); state.agent = a; toast('Monk AI saved'); simReset(); } catch (err) { toast(err.message); }
    });
    $('#sim-form').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#sim-input').value.trim(); if (!v || $('#sim-input').disabled) return; $('#sim-input').value = ''; simSend(v); });
    $('#sim-reset').addEventListener('click', simReset);
    $('#sim-note').addEventListener('click', (e) => { if (e.target.id === 'sim-restart') { e.preventDefault(); simReset(); } });
  }

  /* ---------- Follow-up sequences ---------- */
  const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'there';
  function bookingUrl() {
    const base = new URL('../book/', location.href).href;
    if (store.mode === 'demo') return base + '?demo=1';
    const c = JSON.parse(localStorage.getItem('mm_supabase') || '{}');
    return `${base}?b=${encodeURIComponent(state.avail?.slug || '')}#${btoa(JSON.stringify({ u: c.url, k: c.key }))}`;
  }
  const personalise = (body, lead) => String(body || '').replaceAll('{name}', first(lead?.name)).replaceAll('{business}', state.agent?.business_name || 'our team').replaceAll('{booking_link}', bookingUrl());
  const seqById = (id) => state.seqs.find((q) => q.id === id);
  const leadById = (id) => state.leads.find((l) => l.id === id);
  function dueEnrollments() { const now = Date.now(); return state.enrolls.filter((e) => e.status === 'active' && new Date(e.next_at) <= now && seqById(e.sequence_id) && leadById(e.lead_id)); }
  function nextAt(seq, step, fromISO) {
    const cur = seq.steps[step - 1], nxt = seq.steps[step];
    if (!nxt) return null;
    return new Date(new Date(fromISO).getTime() + Math.max(0, (nxt.delay_days - (cur?.delay_days || 0))) * 86400e3).toISOString();
  }
  async function advance(e, how) {
    const seq = seqById(e.sequence_id); const lead = leadById(e.lead_id); const step = seq.steps[e.step];
    if (how === 'sent') await store.addNote({ lead_id: lead.id, kind: 'whatsapp', body: `Follow-up (${seq.name}, step ${e.step + 1}): ${personalise(step.body, lead)}` });
    const n = e.step + 1; const at = nextAt(seq, n, new Date().toISOString());
    await store.updateEnrollment(e.id, at ? { step: n, next_at: at } : { step: n, status: 'done', next_at: null });
  }
  async function startSequence(lead_id, sequence_id) {
    const seq = seqById(sequence_id); if (!seq?.steps?.length) return toast('That sequence has no steps');
    await Promise.all(state.enrolls.filter((e) => e.lead_id === lead_id && e.status === 'active').map((e) => store.updateEnrollment(e.id, { status: 'stopped' })));
    await store.enroll({ lead_id, sequence_id, step: 0, status: 'active', next_at: new Date(Date.now() + seq.steps[0].delay_days * 86400e3).toISOString() });
    toast(`${seq.name} started`);
  }
  function renderFollowups() {
    const due = dueEnrollments();
    $('#due-list').innerHTML = due.length ? due.map((e) => {
      const seq = seqById(e.sequence_id), lead = leadById(e.lead_id), msg = personalise(seq.steps[e.step].body, lead), digits = (lead.phone || '').replace(/\D/g, '');
      return `<div class="due" data-id="${e.id}"><div class="due-who"><b>${esc(lead.name)}</b><span class="small muted">${esc(seq.name)} · step ${e.step + 1} of ${seq.steps.length}</span></div>
        <p class="due-msg">${esc(msg)}</p>
        <div class="drawer-actions">${digits ? `<a class="btn btn-sm" data-act="send" href="https://wa.me/${digits}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Send on WhatsApp</a>` : '<span class="small muted">No phone number</span>'}<button class="btn btn-ghost btn-sm" data-act="skip">Skip</button><button class="btn btn-danger btn-sm" data-act="stop">Stop</button></div></div>`;
    }).join('') : '<p class="empty">All caught up. 🧘 Nothing due right now.</p>';
    if (!seqById(state.activeSeq)) state.activeSeq = state.seqs[0]?.id || null;
    $('#seq-list').innerHTML = state.seqs.map((q) => { const n = state.enrolls.filter((e) => e.sequence_id === q.id && e.status === 'active').length;
      return `<button class="seq ${q.id === state.activeSeq ? 'active' : ''}" data-id="${q.id}"><b>${esc(q.name)}</b><span class="small muted">${q.steps.length} steps · ${n} active</span></button>`; }).join('') || '<p class="empty small">No sequences yet.</p>';
    fillSeqForm(seqById(state.activeSeq));
  }
  const stepRow = (st = { delay_days: 0, body: '' }) => `<div class="step-row"><label class="small">Day<input type="number" min="0" max="90" class="st-day" value="${st.delay_days}"></label><textarea class="st-body" rows="2" placeholder="Message">${esc(st.body)}</textarea><button type="button" class="x">×</button></div>`;
  function fillSeqForm(q) {
    const f = $('#seq-form'); f.dataset.id = q?.id || '';
    f.elements.name.value = q?.name || ''; f.elements.stop_on_reply.checked = q ? !!q.stop_on_reply : true;
    $('#step-list').innerHTML = (q?.steps || [{ delay_days: 0, body: '' }]).map(stepRow).join('');
    $('#del-seq').classList.toggle('hidden', !q);
    const en = q ? state.enrolls.filter((e) => e.sequence_id === q.id && e.status !== 'stopped' && leadById(e.lead_id)) : [];
    $('#enrolled-list').innerHTML = en.map((e) => `<li><a href="#" data-lead="${e.lead_id}">${esc(leadById(e.lead_id).name)}</a><span class="small muted">${e.status === 'done' ? 'Finished' : `Step ${e.step + 1} · ${fmtDT(e.next_at)}`}</span></li>`).join('') || '<li class="empty small">Nobody yet. Start this from any lead.</li>';
  }
  function renderLeadSeq() {
    const l = state.editing; if (!l) return;
    const act = state.enrolls.find((e) => e.lead_id === l.id && e.status === 'active');
    const seq = act && seqById(act.sequence_id);
    $('#lead-seq').innerHTML = seq
      ? `<div class="row-form"><span class="pill-seq">🔁 ${esc(seq.name)} · step ${act.step + 1} of ${seq.steps.length}, next ${fmtDT(act.next_at)}</span><button type="button" class="btn btn-danger btn-sm" id="lead-seq-stop" data-id="${act.id}">Stop</button></div>`
      : `<div class="row-form"><select id="lead-seq-pick">${state.seqs.map((q) => `<option value="${q.id}">${esc(q.name)}</option>`).join('')}</select><button type="button" class="btn btn-sm" id="lead-seq-start" ${state.seqs.length ? '' : 'disabled'}>Start</button></div>`;
  }

  /* ---------- Bookings ---------- */
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function renderBookings() {
    const now = Date.now();
    const bs = state.bookings.filter((b) => b.status !== 'cancelled' && new Date(b.ends_at || b.starts_at) >= now - 864e5);
    $('#booking-list').innerHTML = bs.map((b) => { const d = new Date(b.starts_at);
      return `<li class="booking ${b.status}" data-id="${b.id}"><div class="bdate"><b>${d.getDate()}</b><span>${d.toLocaleDateString('en-IN', { month: 'short' })}</span></div>
        <div><b>${esc(b.name)}</b><span class="small muted">${d.toLocaleDateString('en-IN', { weekday: 'short' })}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · ${esc(b.phone || b.email || '')}</span>${b.note ? `<span class="small">${esc(b.note)}</span>` : ''}</div>
        <div class="drawer-actions">${b.lead_id ? '<button class="btn btn-ghost btn-sm" data-act="lead">Lead</button>' : ''}${b.status === 'booked' ? '<button class="btn btn-ghost btn-sm" data-act="done">Done</button><button class="btn btn-danger btn-sm" data-act="noshow">No-show</button>' : `<span class="st">${b.status === 'done' ? '✓ Done' : 'No-show'}</span>`}</div></li>`; }).join('') || '<li class="empty">No calls booked yet. Share your booking page.</li>';
    const a = state.avail || DEFAULT_AVAIL, f = $('#avail-form');
    ['title', 'slug', 'start', 'end', 'note'].forEach((k) => { f.elements[k].value = a[k] ?? ''; });
    f.elements.slot_minutes.value = String(a.slot_minutes); f.elements.window_days.value = String(a.window_days);
    f.elements.slug.disabled = store.mode === 'demo';
    $('#days').innerHTML = DAYS.map((d, i) => `<label class="day"><input type="checkbox" value="${i}" ${a.days.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('');
    $('#book-url').value = bookingUrl(); $('#open-book').href = bookingUrl();
  }

  function bindP4() {
    $('#due-list').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return; const en = state.enrolls.find((x) => x.id === b.closest('.due').dataset.id);
      if (b.dataset.act === 'stop') await store.updateEnrollment(en.id, { status: 'stopped' });
      else await advance(en, b.dataset.act === 'send' ? 'sent' : 'skip');
      toast({ send: 'Logged and moved to the next step', skip: 'Skipped', stop: 'Sequence stopped' }[b.dataset.act]); load();
    });
    $('#seq-list').addEventListener('click', (e) => { const b = e.target.closest('.seq'); if (b) { state.activeSeq = b.dataset.id; renderFollowups(); } });
    $('#new-seq').addEventListener('click', () => { state.activeSeq = null; $$('.seq').forEach((x) => x.classList.remove('active')); fillSeqForm(null); $('#seq-form').elements.name.focus(); });
    $('#add-step').addEventListener('click', () => { const last = $$('.st-day').at(-1); $('#step-list').insertAdjacentHTML('beforeend', stepRow({ delay_days: last ? +last.value + 2 : 0, body: '' })); });
    $('#step-list').addEventListener('click', (e) => { if (e.target.matches('.x') && $$('.step-row').length > 1) e.target.closest('.step-row').remove(); });
    $('#seq-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      const steps = $$('.step-row').map((r) => ({ delay_days: Math.max(0, +r.querySelector('.st-day').value || 0), body: r.querySelector('.st-body').value.trim() })).filter((s) => s.body).sort((a, b) => a.delay_days - b.delay_days);
      if (!steps.length) return toast('Add at least one message');
      try { const q = await store.saveSequence({ ...(f.dataset.id ? seqById(f.dataset.id) : {}), name: f.elements.name.value.trim(), stop_on_reply: f.elements.stop_on_reply.checked, steps }); state.activeSeq = q.id; toast('Sequence saved'); load(); } catch (err) { toast(err.message); }
    });
    $('#del-seq').addEventListener('click', async () => { const q = seqById($('#seq-form').dataset.id); if (q && confirm(`Delete "${q.name}"? Leads in it will stop.`)) { await store.deleteSequence(q.id); state.activeSeq = null; load(); } });
    $('#enrolled-list').addEventListener('click', (e) => { const a = e.target.closest('[data-lead]'); if (a) { e.preventDefault(); openLead(a.dataset.lead); } });
    $('#lead-seq').addEventListener('click', async (e) => {
      if (e.target.id === 'lead-seq-start') { await startSequence(state.editing.id, $('#lead-seq-pick').value); }
      else if (e.target.id === 'lead-seq-stop') { await store.updateEnrollment(e.target.dataset.id, { status: 'stopped' }); toast('Sequence stopped'); }
      else return;
      await load(); renderLeadSeq();
    });
    $('#booking-list').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return; const bk = state.bookings.find((x) => x.id === b.closest('.booking').dataset.id);
      if (b.dataset.act === 'lead') return openLead(bk.lead_id);
      await store.updateBooking(bk.id, { status: b.dataset.act === 'done' ? 'done' : 'noshow' });
      if (bk.lead_id) await store.addNote({ lead_id: bk.lead_id, kind: 'call', body: b.dataset.act === 'done' ? `Call held (${fmtDT(bk.starts_at)})` : `No-show for ${fmtDT(bk.starts_at)}` });
      if (b.dataset.act === 'noshow' && bk.lead_id) { const ns = state.seqs.find((q) => /no.?show/i.test(q.name)); if (ns) await startSequence(bk.lead_id, ns.id); }
      toast(b.dataset.act === 'done' ? 'Marked done' : 'Marked no-show'); load();
    });
    $('#avail-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      const a = { title: f.elements.title.value.trim(), slug: f.elements.slug.value.trim() || state.avail.slug, start: f.elements.start.value, end: f.elements.end.value, slot_minutes: +f.elements.slot_minutes.value, window_days: +f.elements.window_days.value, note: f.elements.note.value.trim(), days: $$('#days input:checked').map((c) => +c.value), tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
      if (a.start >= a.end) return toast('The day must end after it starts');
      try { await store.saveAvailability(a); toast('Availability saved'); load(); } catch (err) { toast(/duplicate|unique/i.test(err.message) ? 'That handle is taken, try another' : err.message); }
    });
    $('#copy-book').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#book-url').value); toast('Link copied'); } catch { $('#book-url').select(); } });
  }

  /* ---------- Insights ---------- */
  state.range = 30;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
  const dur = (ms) => { if (ms == null) return '–'; const m = Math.round(ms / 6e4); return m < 1 ? '< 1 min' : m < 60 ? m + ' min' : m < 1440 ? (m / 60).toFixed(1) + ' h' : (m / 1440).toFixed(1) + ' d'; };
  const inRange = (d) => !state.range || (d && Date.now() - new Date(d) <= state.range * 864e5);
  function firstResponse(c) {
    const ms = c.messages || []; const i = ms.findIndex((m) => m.from === 'lead'); if (i < 0) return null;
    const r = ms.slice(i + 1).find((m) => m.from !== 'lead'); return r ? new Date(r.at) - new Date(ms[i].at) : null;
  }
  const median = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  function renderDash() {
    $$('#range button').forEach((b) => b.classList.toggle('on', +b.dataset.d === state.range));
    const L = state.leads.filter((l) => inRange(l.created_at));
    const won = state.stages.find((s) => /won/i.test(s.name)), lost = state.stages.find((s) => /lost/i.test(s.name));
    const isWon = (l) => won && l.stage_id === won.id;
    const wonL = L.filter(isWon), wonVal = wonL.reduce((a, l) => a + Number(l.value || 0), 0);
    const convs = state.convs.filter((c) => inRange(c.updated_at));
    const bks = state.bookings.filter((b) => inRange(b.created_at));
    const held = bks.filter((b) => b.status === 'done').length, noshow = bks.filter((b) => b.status === 'noshow').length;
    const resp = median(convs.map(firstResponse));
    $('#stats').innerHTML = [
      ['New leads', L.length], ['Hot leads', `${L.filter((l) => l.score === 'hot').length} <small>${pct(L.filter((l) => l.score === 'hot').length, L.length)}</small>`],
      ['Won', `${wonL.length} <small>${pct(wonL.length, L.length)}</small>`], ['Revenue won', inr(wonVal)],
      ['Median first reply', dur(resp)], ['Calls booked', bks.length],
    ].map(([k, v]) => `<div class="stat"><span class="muted small">${k}</span><b>${v}</b></div>`).join('');
    // trend
    const days = state.range || 30; const today = new Date(); today.setHours(0, 0, 0, 0);
    const buckets = Array.from({ length: days }, (_, i) => ({ d: new Date(+today - (days - 1 - i) * 864e5), n: 0, hot: 0 }));
    state.leads.forEach((l) => { const d = new Date(l.created_at); d.setHours(0, 0, 0, 0); const b = buckets.find((x) => +x.d === +d); if (b) { b.n++; if (l.score === 'hot') b.hot++; } });
    const bmax = Math.max(1, ...buckets.map((b) => b.n));
    $('#trend').innerHTML = `<div class="cols" style="--n:${days}">${buckets.map((b) => `<div class="colb" title="${fmtDate(b.d)}: ${b.n} leads, ${b.hot} hot"><i style="height:${(b.n / bmax) * 100}%"><em style="height:${b.n ? (b.hot / b.n) * 100 : 0}%"></em></i></div>`).join('')}</div>
      <div class="axis"><span>${fmtDate(buckets[0].d)}</span><span><i class="lg"></i>All leads <i class="lg hot"></i>Hot</span><span>${fmtDate(buckets.at(-1).d)}</span></div>`;
    // funnel: reached stage i or beyond (Lost excluded)
    const order = state.stages.filter((s) => s !== lost);
    const pos = (l) => order.findIndex((s) => s.id === l.stage_id);
    const reach = order.map((s, i) => L.filter((l) => pos(l) >= i).length);
    $('#bars').innerHTML = order.map((s, i) => `<div class="bar"><span>${esc(s.name)}</span><div><i style="width:${(reach[i] / Math.max(1, reach[0])) * 100}%"></i></div><b>${reach[i]}</b></div>`).join('')
      + (lost ? `<p class="small muted">Lost: ${L.filter((l) => l.stage_id === lost.id).length}</p>` : '');
    // sources
    const src = {}; L.forEach((l) => { const k = l.source || 'Other'; const r = (src[k] ||= { n: 0, hot: 0, won: 0, val: 0 }); r.n++; if (l.score === 'hot') r.hot++; if (isWon(l)) { r.won++; r.val += Number(l.value || 0); } });
    $('#sources').innerHTML = '<tr><th>Source</th><th>Leads</th><th>Hot</th><th>Won</th><th>Revenue</th></tr>' + (Object.entries(src).sort((a, b) => b[1].n - a[1].n).map(([k, r]) => `<tr><td>${esc(k)}</td><td>${r.n}</td><td>${pct(r.hot, r.n)}</td><td>${r.won}</td><td>${inr(r.val)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No leads in this period.</td></tr>');
    // AI
    const scored = convs.filter((c) => c.score);
    const kv = (rows) => rows.map(([k, v]) => `<div><span class="muted">${k}</span><b>${v}</b></div>`).join('');
    $('#ai-stats').innerHTML = kv([
      ['Conversations', convs.length], ['Fully qualified', `${scored.length} (${pct(scored.length, convs.length)})`],
      ['🔥 / 🌤️ / ❄️', ['hot', 'warm', 'cold'].map((s) => scored.filter((c) => c.score === s).length).join(' · ')],
      ['Handed to your team', convs.filter((c) => c.status === 'human').length], ['Median first reply', dur(resp)],
    ]);
    const en = state.enrolls.filter((e) => inRange(e.created_at));
    $('#fu-stats').innerHTML = kv([
      ['Leads in sequences', en.length], ['Active now', en.filter((e) => e.status === 'active').length],
      ['Stopped (replied or booked)', en.filter((e) => e.status === 'stopped').length], ['Completed', en.filter((e) => e.status === 'done').length],
      ['Calls held / no-shows', `${held} / ${noshow}`], ['Show-up rate', pct(held, held + noshow)],
    ]);
    // team
    const team = {}; L.forEach((l) => { const k = l.assigned_to || 'Unassigned'; const r = (team[k] ||= { n: 0, hot: 0, won: 0, val: 0 }); r.n++; if (l.score === 'hot') r.hot++; if (isWon(l)) { r.won++; r.val += Number(l.value || 0); } });
    $('#team').innerHTML = '<tr><th>Rep</th><th>Leads</th><th>Hot</th><th>Won</th><th>Win rate</th><th>Revenue</th></tr>' + (Object.entries(team).sort((a, b) => b[1].val - a[1].val || b[1].n - a[1].n).map(([k, r], i) => `<tr><td>${i === 0 && r.won ? '🏆 ' : ''}${esc(k)}</td><td>${r.n}</td><td>${r.hot}</td><td>${r.won}</td><td>${pct(r.won, r.n)}</td><td>${inr(r.val)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No leads in this period.</td></tr>');
  }

  /* ---------- CSV ---------- */
  function toCSV(rows) { return rows.map((r) => r.map((v) => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\n'); }
  function parseCSV(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true; else if (c === ',' || c === '\t') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim()));
  }
  function exportCSV() {
    const head = ['name', 'phone', 'email', 'source', 'score', 'stage', 'interest', 'budget', 'timeline', 'assigned_to', 'value', 'tags', 'created_at'];
    const rows = state.leads.map((l) => [l.name, l.phone, l.email, l.source, l.score, stageName(l.stage_id), l.interest, l.budget, l.timeline, l.assigned_to, l.value, (l.tags || []).join('; '), l.created_at]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + toCSV([head, ...rows])], { type: 'text/csv' }));
    a.download = `marketingmonk-leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); toast(`Exported ${rows.length} leads`);
  }
  const ALIASES = { name: ['name', 'full name', 'full_name', 'lead name', 'customer name', 'contact name'], first: ['first name', 'first_name', 'firstname'], last: ['last name', 'last_name', 'lastname'],
    phone: ['phone', 'phone number', 'phone_number', 'mobile', 'mobile number', 'whatsapp', 'whatsapp number', 'contact number'], email: ['email', 'email address', 'e-mail'],
    source: ['source', 'lead source', 'platform', 'campaign_name', 'campaign'], interest: ['interest', 'requirement', 'product', 'service', 'looking for'], budget: ['budget'], timeline: ['timeline', 'when'], assigned_to: ['assigned to', 'owner', 'rep'], value: ['value', 'deal value', 'amount'] };
  async function importCSV(file) {
    const rows = parseCSV(await file.text()); if (rows.length < 2) return ($('#import-msg').textContent = 'That file has no rows to import.');
    const head = rows[0].map((h) => h.trim().toLowerCase().replace(/^\ufeff/, ''));
    const col = (k) => head.findIndex((h) => ALIASES[k].includes(h));
    const idx = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, col(k)]));
    if (idx.name < 0 && idx.first < 0 && idx.phone < 0) return ($('#import-msg').textContent = 'Could not find a name or phone column.');
    const seen = new Set(state.leads.map((l) => (l.phone || '').replace(/\D/g, '').slice(-10)).filter(Boolean));
    let added = 0, dup = 0;
    for (const r of rows.slice(1)) {
      const g = (k) => (idx[k] >= 0 ? (r[idx[k]] || '').trim() : '');
      const name = g('name') || [g('first'), g('last')].filter(Boolean).join(' ') || g('phone');
      const phone = g('phone').replace(/^p:/, ''); const key = phone.replace(/\D/g, '').slice(-10);
      if (!name) continue; if (key && seen.has(key)) { dup++; continue; } if (key) seen.add(key);
      await store.saveLead({ name, phone, email: g('email'), source: g('source') || 'CSV import', score: 'warm', stage_id: state.stages[0]?.id || null, interest: g('interest'), budget: g('budget'), timeline: g('timeline'), assigned_to: g('assigned_to'), value: Number(g('value').replace(/[^\d.]/g, '')) || 0, tags: ['imported'] });
      added++;
    }
    $('#import-msg').textContent = `Imported ${added} lead${added === 1 ? '' : 's'}${dup ? `, skipped ${dup} already in your CRM` : ''}.`;
    toast(`Imported ${added} leads`); load();
  }

  /* ---------- Integrations ---------- */
  const conn = () => JSON.parse(localStorage.getItem('mm_supabase') || '{}');
  const handle = () => state.avail?.slug || '';
  function captureUrl() {
    const base = new URL('../capture/', location.href).href;
    return store.mode === 'demo' ? base + '?demo=1' : `${base}?b=${encodeURIComponent(handle())}#${btoa(JSON.stringify({ u: conn().url, k: conn().key }))}`;
  }
  function renderIntegrations() {
    const ig = state.integ || {};
    $('#embed-code').value = `<iframe src="${captureUrl()}" title="Contact form" style="width:100%;max-width:480px;height:560px;border:0;border-radius:16px"></iframe>`;
    $('#open-capture').href = captureUrl();
    if (!$('#wa-num').value && ig.wa_number) $('#wa-num').value = ig.wa_number;
    updateWa();
    $('#hook-out').value = ig.webhook_out || '';
    const intake = store.mode === 'cloud' && conn().url ? `${conn().url}/functions/v1/lead-intake?key=${ig.intake_key || '(save once to create)'}` : '';
    $('#hook-in').value = intake || 'Available once Supabase is connected';
    $('#hook-in-note').textContent = store.mode === 'cloud' ? 'POST JSON like {"name","phone","email","source"}. Keep this URL private: the key lets anyone add leads.' : 'Connect Supabase in Settings to receive leads from Zapier, Make, or Meta and Google lead ads.';
    const items = [
      ['Supabase (cloud sync)', store.mode === 'cloud', store.mode === 'cloud' ? 'Connected' : 'Demo mode. Connect in Settings'],
      ['WhatsApp Cloud API', ig.wa_cloud === true, 'Set up on the server; see README "Go live on WhatsApp"'],
      ['Gemini (smarter Monk AI replies)', ig.gemini === true, 'Optional, free key from Google AI Studio'],
      ['Booking page', !!handle(), handle() ? 'Live at your handle "' + esc(handle()) + '"' : 'Set it up in Bookings'],
      ['Outgoing webhook', !!ig.webhook_out, ig.webhook_out ? 'Sending new leads' : 'Not set'],
    ];
    $('#conn').innerHTML = items.map(([n, on, d]) => `<li><span class="dot ${on ? 'on' : ''}"></span><b>${n}</b><span class="small muted">${d}</span></li>`).join('');
  }
  function updateWa() {
    const n = $('#wa-num').value.replace(/\D/g, ''); const out = n.length >= 8 ? `https://wa.me/${n}?text=${encodeURIComponent($('#wa-msg').value.trim())}` : '';
    $('#wa-link-out').value = out;
    const qr = out ? `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=10&color=1E1B4B&data=${encodeURIComponent(out)}` : '';
    $('#wa-qr').classList.toggle('hidden', !qr); $('#wa-qr-dl').classList.toggle('hidden', !qr);
    if (qr) { $('#wa-qr').src = qr; $('#wa-qr-dl').href = qr; }
  }
  function leadPayload(l) { return { event: 'lead.created', lead: { name: l.name, phone: l.phone, email: l.email, source: l.source, score: l.score, stage: stageName(l.stage_id), interest: l.interest, budget: l.budget, timeline: l.timeline, created_at: l.created_at } }; }

  function bindP5() {
    $('#range').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { state.range = +b.dataset.d; renderDash(); } });
    $('#export-csv').addEventListener('click', exportCSV);
    $('#csv-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importCSV(f); e.target.value = ''; });
    const drop = $('#drop');
    ['dragover', 'dragenter'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) importCSV(f); });
    $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => { const el = $('#' + b.dataset.copy); if (!el.value) return; try { await navigator.clipboard.writeText(el.value); toast('Copied'); } catch { el.select(); } }));
    $('#wa-num').addEventListener('input', updateWa); $('#wa-msg').addEventListener('input', updateWa);
    $('#wa-num').addEventListener('change', async () => { await store.saveIntegrations({ ...state.integ, wa_number: $('#wa-num').value.trim() }); state.integ = await store.integrations(); });
    $('#save-hook').addEventListener('click', async () => {
      const url = $('#hook-out').value.trim(); if (url && !/^https:\/\//.test(url)) return toast('Use an https:// webhook URL');
      const ig = { ...state.integ, webhook_out: url }; if (!ig.intake_key) ig.intake_key = (crypto.randomUUID ? crypto.randomUUID() : uid()).replace(/-/g, '');
      try { await store.saveIntegrations(ig); state.integ = await store.integrations(); toast('Saved'); renderIntegrations(); } catch (err) { toast(err.message); }
    });
    $('#test-hook').addEventListener('click', async () => {
      const url = $('#hook-out').value.trim(); if (!url) return toast('Add a webhook URL first');
      const sample = state.leads[0] || { name: 'Test Lead', phone: '+919800000000', source: 'Test', score: 'hot', created_at: new Date().toISOString() };
      try { await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ ...leadPayload(sample), test: true }) }); toast('Test lead sent. Check your Zap or scenario'); } catch { toast('Could not reach that URL'); }
    });
  }

  /* ---------- Auth ---------- */
  function bindAuth() {
    let signup = false;
    if (!cloud) { $('#auth-form').classList.add('hidden'); $('#auth-toggle').classList.add('hidden'); $('#auth-sub').textContent = 'Try the full CRM in demo mode, or connect your free Supabase project to sign in with real accounts.'; $('.divider').classList.add('hidden'); }
    $('#auth-toggle').addEventListener('click', (e) => { e.preventDefault(); signup = !signup; $('#auth-submit').textContent = signup ? 'Create account' : 'Sign in'; $('#auth-toggle').textContent = signup ? 'Have an account? Sign in' : 'New here? Create an account'; });
    $('#auth-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const email = $('#auth-email').value.trim(), pass = $('#auth-pass').value; $('#auth-msg').textContent = '';
      try {
        if (signup) { const r = await cloud.signUp(email, pass); if (!r.session) { $('#auth-msg').textContent = 'Check your inbox to confirm your email, then sign in.'; return; } }
        else await cloud.signIn(email, pass);
        start(cloud);
      } catch (err) { $('#auth-msg').textContent = err.message; }
    });
    $('#demo-btn').addEventListener('click', () => { localStorage.setItem('mm_demo_on', '1'); start(new LocalStore()); });
  }

  async function start(s) {
    store = s;
    const sess = await store.session();
    $('#auth').classList.add('hidden'); $('#shell').classList.remove('hidden');
    $('#mode-badge').textContent = store.mode === 'demo' ? 'Demo mode' : 'Cloud sync';
    $('#mode-badge').className = 'badge ' + store.mode;
    $('#user-email').textContent = sess?.email || '';
    const h = location.hash.slice(1); if (['pipeline', 'inbox', 'leads', 'followups', 'bookings', 'tasks', 'dashboard', 'agent', 'integrations', 'settings'].includes(h)) state.view = h;
    try { await load(); } catch (err) {
      console.error(err); try { render(); } catch (e2) { console.error(e2); }
      const m = String(err.message || err);
      toast(/schema cache|does not exist|relation/i.test(m) ? 'Your database tables are missing. Run supabase/schema.sql in the Supabase SQL Editor, then refresh.' : m);
    }
  }

  function showAuth(msg) {
    $('#shell').classList.add('hidden'); $('#auth').classList.remove('hidden');
    if (msg) { $('#auth-msg').textContent = msg; $('#reset-conn').classList.remove('hidden'); }
  }
  async function boot() {
    const rc = $('#reset-conn');
    rc.addEventListener('click', (e) => { e.preventDefault(); localStorage.removeItem('mm_supabase'); location.reload(); });
    try {
      bind(); bindAuth(); bindAI(); bindP4(); bindP5();
      if (bootIssue) return showAuth(bootIssue);
      if (cloud) {
        let sess = null;
        try { sess = await Promise.race([cloud.session(), new Promise((_, r) => setTimeout(() => r(new Error('Supabase didn\'t respond. Check the Project URL, or that the project isn\'t paused.')), 10000))]); }
        catch (e) { return showAuth(e.message); }
        if (sess) return await start(cloud);
      }
      if (!cloud && localStorage.getItem('mm_demo_on')) return await start(new LocalStore());
      showAuth();
    } catch (e) { console.error(e); showAuth('Something went wrong while starting: ' + e.message); }
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
