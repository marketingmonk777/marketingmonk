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

  /* ---------- Local demo store ---------- */
  class LocalStore {
    constructor() { this.key = 'mm_demo_v1'; this.db = JSON.parse(localStorage.getItem(this.key) || 'null') || this.seed(); this.save(); }
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
    reset() { this.db = this.seed(); this.save(); }
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
      else { lead = { ...lead, id: uid(), created_at: now, updated_at: now }; this.db.leads.push(lead); }
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
    async sendWhatsApp(conversation_id, body) { const { data, error } = await this.sb.functions.invoke('whatsapp-send', { body: { conversation_id, body } }); if (error) throw error; return data; }
  }

  /* ---------- State ---------- */
  const cfg = JSON.parse(localStorage.getItem('mm_supabase') || 'null');
  const cloud = cfg && window.supabase ? new SupaStore(cfg.url, cfg.key) : null;
  let store = null;
  const state = { stages: [], leads: [], tasks: [], convs: [], agent: null, activeConv: null, view: 'pipeline', editing: null };

  async function load() {
    [state.stages, state.leads, state.tasks, state.convs, state.agent] = await Promise.all([store.stages(), store.leads(), store.tasks(), store.conversations(), store.agentConfig()]);
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
    $('#view-title').textContent = { pipeline: 'Pipeline', inbox: 'Inbox', leads: 'Leads', tasks: 'Tasks', dashboard: 'Dashboard', agent: 'Monk AI', settings: 'Settings' }[state.view];
    const showFilters = ['pipeline', 'leads'].includes(state.view);
    $('#search').classList.toggle('hidden', !showFilters);
    $('#filter-score').classList.toggle('hidden', !showFilters);
    ({ pipeline: renderBoard, inbox: renderInbox, leads: renderTable, tasks: renderTasks, dashboard: renderDash, agent: renderAgent, settings: renderSettings })[state.view]();
    const unread = state.convs.filter((c) => c.unread).length; const ic = $('#inbox-count'); ic.textContent = unread; ic.classList.toggle('hidden', !unread);
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

  function renderDash() {
    const L = state.leads;
    const won = state.stages.find((s) => /won/i.test(s.name));
    const wonN = won ? L.filter((l) => l.stage_id === won.id).length : 0;
    const pipeVal = L.filter((l) => !won || l.stage_id !== won.id).reduce((a, l) => a + Number(l.value || 0), 0);
    const hot = L.filter((l) => l.score === 'hot').length;
    const week = L.filter((l) => Date.now() - new Date(l.created_at) < 7 * 864e5).length;
    const overdue = state.tasks.filter((t) => !t.done && t.due_at && new Date(t.due_at) < new Date()).length;
    $('#stats').innerHTML = [
      ['Total leads', L.length], ['New this week', week], ['Hot leads', hot],
      ['Win rate', L.length ? Math.round((wonN / L.length) * 100) + '%' : '0%'], ['Open pipeline', inr(pipeVal)], ['Overdue tasks', overdue],
    ].map(([k, v]) => `<div class="stat"><span class="muted small">${k}</span><b>${v}</b></div>`).join('');
    const max = Math.max(1, ...state.stages.map((s) => L.filter((l) => l.stage_id === s.id).length));
    $('#bars').innerHTML = state.stages.map((s) => { const n = L.filter((l) => l.stage_id === s.id).length; return `<div class="bar"><span>${esc(s.name)}</span><div><i style="width:${(n / max) * 100}%"></i></div><b>${n}</b></div>`; }).join('');
    const src = {}; L.forEach((l) => { src[l.source || 'Other'] = (src[l.source || 'Other'] || 0) + 1; });
    const smax = Math.max(1, ...Object.values(src));
    $('#sources').innerHTML = Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="bar teal"><span>${esc(k)}</span><div><i style="width:${(n / smax) * 100}%"></i></div><b>${n}</b></div>`).join('') || '<p class="empty">No leads yet.</p>';
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
    if (l) await renderNotes();
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
    const h = location.hash.slice(1); if (['pipeline', 'inbox', 'leads', 'tasks', 'dashboard', 'agent', 'settings'].includes(h)) state.view = h;
    try { await load(); } catch (err) { toast(err.message); }
  }

  async function boot() {
    bind(); bindAuth(); bindAI();
    if (cloud && (await cloud.session())) return start(cloud);
    if (!cloud && localStorage.getItem('mm_demo_on')) return start(new LocalStore());
    $('#auth').classList.remove('hidden');
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
