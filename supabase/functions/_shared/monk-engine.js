// Monk AI qualification engine. One source, used by the web app (simulator)
// and the Supabase Edge Function (live WhatsApp). Rule-based by default;
// the edge function can layer an LLM on top for more natural replies.

export const DEFAULT_AGENT = {
  business_name: 'MarketingMonk',
  about: 'We help growing businesses capture, qualify and close more leads.',
  greeting: 'Namaste! 🙏 Thanks for reaching out to {business}. I can help you right away.',
  questions: [
    { key: 'interest', question: 'What are you looking for today?' },
    { key: 'budget', question: 'Do you have a budget in mind?' },
    { key: 'timeline', question: 'When are you hoping to get started?' },
    { key: 'decision', question: 'Will you be making the decision, or is someone else involved?' },
  ],
  hot_words: 'today, now, asap, immediately, urgent, this week, this month, within a month, ready',
  cold_words: 'just looking, browsing, not sure, later, next year, no budget, maybe',
  handoff_hot: 'Perfect, thank you! {rep} from our team will call you shortly. 📞',
  handoff_other: 'Thank you! I have shared this with our team, and we will follow up with details soon.',
  rep_name: '',
};

const list = (s) => String(s || '').toLowerCase().split(',').map((w) => w.trim()).filter(Boolean);
const fill = (t, a) => String(t || '').replace('{business}', a.business_name || 'us').replace('{rep}', a.rep_name || 'Someone');

export function scoreAnswers(answers, agent = DEFAULT_AGENT) {
  const text = Object.values(answers || {}).join(' ').toLowerCase();
  const hot = list(agent.hot_words).some((w) => text.includes(w));
  const cold = list(agent.cold_words).some((w) => text.includes(w));
  if (cold && !hot) return 'cold';
  const hasBudget = answers?.budget && !/no|not sure|none|don'?t know/i.test(answers.budget);
  if (hot && hasBudget) return 'hot';
  if (hot || hasBudget) return 'warm';
  return 'cold';
}

// conv: { messages:[{from,body,at}], answers:{}, step:number, status:'ai'|'human'|'done' }
// Returns { replies:[string], conv, done:boolean, score?:string }
export function nextTurn(conv, incoming, agent = DEFAULT_AGENT) {
  const a = { ...DEFAULT_AGENT, ...(agent || {}) };
  const qs = (a.questions || []).filter((q) => q.question);
  const c = { answers: {}, step: -1, status: 'ai', messages: [], ...conv };
  c.answers = { ...c.answers };
  const replies = [];
  if (c.status !== 'ai') return { replies, conv: c, done: c.status === 'done' };

  if (c.step === -1) {
    replies.push(fill(a.greeting, a));
    // Treat the first message as the answer to "what are you looking for" when it says something useful.
    const firstQ = qs[0];
    if (firstQ && incoming && incoming.trim().split(/\s+/).length >= 4 && !/^(hi|hello|hey|namaste)\b/i.test(incoming.trim())) {
      c.answers[firstQ.key] = incoming.trim();
      c.step = 1;
    } else c.step = 0;
  } else {
    const q = qs[c.step];
    if (q) c.answers[q.key] = (incoming || '').trim();
    c.step += 1;
  }

  if (c.step < qs.length) {
    replies.push(qs[c.step].question);
    return { replies, conv: c, done: false };
  }
  const score = scoreAnswers(c.answers, a);
  replies.push(fill(score === 'hot' ? a.handoff_hot : a.handoff_other, a));
  c.status = score === 'hot' ? 'human' : 'done';
  c.score = score;
  return { replies, conv: c, done: true, score };
}

if (typeof window !== 'undefined') window.MonkEngine = { DEFAULT_AGENT, nextTurn, scoreAnswers };
