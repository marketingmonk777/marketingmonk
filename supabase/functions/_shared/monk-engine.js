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
  language: 'auto',
  kb: 'price, rate, cost, kitna, कितना, ಬೆಲೆ, ભાવ | Prices depend on the exact product and quantity. Answer a couple of quick questions and we will send you an exact quote.',
};

const list = (s) => String(s || '').toLowerCase().split(',').map((w) => w.trim()).filter(Boolean);
const REP = { en: 'A specialist', hi: 'हमारे विशेषज्ञ', 'hi-Latn': 'Hamare expert', kn: 'ನಮ್ಮ ತಜ್ಞರು', gu: 'અમારા નિષ્ણાત' };
const fill = (t, a, lang = 'en') => String(t || '').replace('{business}', a.business_name || 'us').replace('{rep}', a.rep_name || REP[lang] || REP.en);
const realAnswers = (answers) => Object.fromEntries(Object.entries(answers || {}).filter(([k]) => !k.startsWith('_')));

/* ---------- Part 9: languages ---------- */
export const LANGS = { en: 'English', hi: 'हिन्दी', 'hi-Latn': 'Hinglish', kn: 'ಕನ್ನಡ', gu: 'ગુજરાતી' };
const HINGLISH = /\b(hai|hain|chahiye|chaiye|kya|kitna|kitne|kitni|mujhe|humko|hume|aap|aapka|bhai|bhaiya|nahi|nahin|karna|karo|batao|bataiye|bhejo|rate kya|kab tak|abhi|jaldi|accha|acha|theek)\b/i;
export function detectLang(text, prev) {
  const t = String(text || '');
  if (/[\u0C80-\u0CFF]/.test(t)) return 'kn';
  if (/[\u0A80-\u0AFF]/.test(t)) return 'gu';
  if (/[\u0900-\u097F]/.test(t)) return 'hi';
  if (prev && prev !== 'en') return prev;
  return (t.match(new RegExp(HINGLISH.source, 'gi')) || []).length >= 1 ? 'hi-Latn' : (prev || 'en');
}
// English source text -> translations. Covers the default agent and the industry presets;
// custom text you write yourself stays as written (or is translated by Gemini when on).
const T = {
  'Namaste! 🙏 Thanks for reaching out to {business}. I can help you right away.': {
    hi: 'नमस्ते! 🙏 {business} से संपर्क करने के लिए धन्यवाद। मैं अभी आपकी मदद कर सकता हूँ।',
    'hi-Latn': 'Namaste! 🙏 {business} se contact karne ke liye dhanyavaad. Main abhi aapki madad kar sakta hoon.',
    kn: 'ನಮಸ್ಕಾರ! 🙏 {business} ಅನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. ನಾನು ಈಗಲೇ ನಿಮಗೆ ಸಹಾಯ ಮಾಡಬಲ್ಲೆ.',
    gu: 'નમસ્તે! 🙏 {business} નો સંપર્ક કરવા બદલ આભાર. હું હમણાં જ તમારી મદદ કરી શકું છું.' },
  'What are you looking for today?': { hi: 'आज आप क्या ढूँढ रहे हैं?', 'hi-Latn': 'Aaj aap kya dhoondh rahe hain?', kn: 'ಇಂದು ನೀವು ಏನನ್ನು ಹುಡುಕುತ್ತಿದ್ದೀರಿ?', gu: 'આજે તમે શું શોધી રહ્યા છો?' },
  'Do you have a budget in mind?': { hi: 'क्या आपके मन में कोई बजट है?', 'hi-Latn': 'Kya aapke mann mein koi budget hai?', kn: 'ನಿಮ್ಮ ಮನಸ್ಸಿನಲ್ಲಿ ಯಾವುದಾದರೂ ಬಜೆಟ್ ಇದೆಯೇ?', gu: 'શું તમારા મનમાં કોઈ બજેટ છે?' },
  'When are you hoping to get started?': { hi: 'आप कब तक शुरू करना चाहेंगे?', 'hi-Latn': 'Aap kab tak shuru karna chahenge?', kn: 'ನೀವು ಯಾವಾಗ ಪ್ರಾರಂಭಿಸಲು ಬಯಸುತ್ತೀರಿ?', gu: 'તમે ક્યારે શરૂ કરવા માંગો છો?' },
  'Will you be making the decision, or is someone else involved?': { hi: 'फ़ैसला आप लेंगे, या कोई और भी शामिल है?', 'hi-Latn': 'Decision aap lenge, ya koi aur bhi involved hai?', kn: 'ನಿರ್ಧಾರ ನೀವೇ ತೆಗೆದುಕೊಳ್ಳುತ್ತೀರಾ, ಅಥವಾ ಬೇರೆ ಯಾರಾದರೂ ಇದ್ದಾರೆಯೇ?', gu: 'નિર્ણય તમે લેશો, કે બીજું કોઈ પણ સામેલ છે?' },
  'Perfect, thank you! {rep} from our team will call you shortly. 📞': { hi: 'बहुत बढ़िया, धन्यवाद! हमारी टीम से {rep} आपको जल्द ही कॉल करेंगे। 📞', 'hi-Latn': 'Bahut badhiya, dhanyavaad! Hamari team se {rep} aapko jaldi call karenge. 📞', kn: 'ಧನ್ಯವಾದಗಳು! ನಮ್ಮ ತಂಡದ {rep} ಶೀಘ್ರದಲ್ಲೇ ನಿಮಗೆ ಕರೆ ಮಾಡುತ್ತಾರೆ. 📞', gu: 'સરસ, આભાર! અમારી ટીમમાંથી {rep} તમને ટૂંક સમયમાં કૉલ કરશે. 📞' },
  'Thank you! I have shared this with our team, and we will follow up with details soon.': { hi: 'धन्यवाद! मैंने यह हमारी टीम को भेज दिया है, हम जल्द ही पूरी जानकारी के साथ संपर्क करेंगे।', 'hi-Latn': 'Dhanyavaad! Maine ye hamari team ko bhej diya hai, hum jaldi details ke saath contact karenge.', kn: 'ಧನ್ಯವಾದಗಳು! ಇದನ್ನು ನಮ್ಮ ತಂಡಕ್ಕೆ ಕಳುಹಿಸಿದ್ದೇನೆ, ಶೀಘ್ರದಲ್ಲೇ ವಿವರಗಳೊಂದಿಗೆ ಸಂಪರ್ಕಿಸುತ್ತೇವೆ.', gu: 'આભાર! મેં આ અમારી ટીમને મોકલી દીધું છે, અમે જલ્દી વિગતો સાથે સંપર્ક કરીશું.' },
  // PTFE preset
  'Namaste! 🙏 Thanks for contacting {business}. Share a few details and we will send you a quotation quickly.': { hi: 'नमस्ते! 🙏 {business} से संपर्क करने के लिए धन्यवाद। कुछ जानकारी दीजिए, हम जल्दी कोटेशन भेज देंगे।', 'hi-Latn': 'Namaste! 🙏 {business} se contact karne ke liye dhanyavaad. Thodi details dijiye, hum jaldi quotation bhej denge.', kn: 'ನಮಸ್ಕಾರ! 🙏 {business} ಅನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. ಕೆಲವು ವಿವರಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳಿ, ನಾವು ಬೇಗನೆ ಕೊಟೇಶನ್ ಕಳುಹಿಸುತ್ತೇವೆ.', gu: 'નમસ્તે! 🙏 {business} નો સંપર્ક કરવા બદલ આભાર. થોડી વિગતો આપો, અમે ઝડપથી ક્વોટેશન મોકલીશું.' },
  'Which PTFE product do you need? Sheets, rods, tubes, bushes, gaskets, bellows, tape, or a machined part?': { hi: 'आपको कौन-सा PTFE प्रोडक्ट चाहिए? शीट, रॉड, ट्यूब, बुश, गैस्केट, बेलो, टेप, या मशीन किया हुआ पार्ट?', 'hi-Latn': 'Aapko kaunsa PTFE product chahiye? Sheet, rod, tube, bush, gasket, bellow, tape, ya machined part?', kn: 'ನಿಮಗೆ ಯಾವ PTFE ಉತ್ಪನ್ನ ಬೇಕು? ಶೀಟ್, ರಾಡ್, ಟ್ಯೂಬ್, ಬುಷ್, ಗ್ಯಾಸ್ಕೆಟ್, ಬೆಲ್ಲೋಸ್, ಟೇಪ್, ಅಥವಾ ಮೆಷಿನ್ ಮಾಡಿದ ಭಾಗ?', gu: 'તમને કયું PTFE પ્રોડક્ટ જોઈએ છે? શીટ, રોડ, ટ્યુબ, બુશ, ગાસ્કેટ, બેલો, ટેપ, કે મશીન કરેલો પાર્ટ?' },
  'Which grade? Virgin, reprocessed, or filled (glass, carbon, bronze)? If you can, mention the application too.': { hi: 'कौन-सा ग्रेड? वर्जिन, रीप्रोसेस्ड, या फ़िल्ड (ग्लास, कार्बन, ब्रॉन्ज़)? हो सके तो एप्लिकेशन भी बताइए।', 'hi-Latn': 'Kaunsa grade? Virgin, reprocessed, ya filled (glass, carbon, bronze)? Ho sake to application bhi bataiye.', kn: 'ಯಾವ ಗ್ರೇಡ್? ವರ್ಜಿನ್, ರೀಪ್ರೊಸೆಸ್ಡ್, ಅಥವಾ ಫಿಲ್ಡ್ (ಗ್ಲಾಸ್, ಕಾರ್ಬನ್, ಬ್ರಾಂಜ್)? ಸಾಧ್ಯವಾದರೆ ಬಳಕೆಯನ್ನೂ ತಿಳಿಸಿ.', gu: 'કયો ગ્રેડ? વર્જિન, રીપ્રોસેસ્ડ, કે ફિલ્ડ (ગ્લાસ, કાર્બન, બ્રોન્ઝ)? શક્ય હોય તો ઉપયોગ પણ જણાવો.' },
  'What size? Thickness × width × length, or OD × ID × length. You can also send the drawing here.': { hi: 'साइज़ क्या है? मोटाई × चौड़ाई × लंबाई, या OD × ID × लंबाई। आप ड्रॉइंग भी यहीं भेज सकते हैं।', 'hi-Latn': 'Size kya hai? Thickness × width × length, ya OD × ID × length. Drawing bhi yahin bhej sakte hain.', kn: 'ಗಾತ್ರ ಎಷ್ಟು? ದಪ್ಪ × ಅಗಲ × ಉದ್ದ, ಅಥವಾ OD × ID × ಉದ್ದ. ಡ್ರಾಯಿಂಗ್ ಅನ್ನು ಇಲ್ಲೇ ಕಳುಹಿಸಬಹುದು.', gu: 'સાઇઝ શું છે? જાડાઈ × પહોળાઈ × લંબાઈ, કે OD × ID × લંબાઈ. ડ્રોઇંગ પણ અહીં મોકલી શકો છો.' },
  'How much do you need (pieces or kg)? Is it a one-time order or a regular requirement?': { hi: 'कितनी मात्रा चाहिए (पीस या किलो)? यह एक बार का ऑर्डर है या रेगुलर ज़रूरत?', 'hi-Latn': 'Kitni quantity chahiye (pieces ya kg)? Ek baar ka order hai ya regular requirement?', kn: 'ಎಷ್ಟು ಬೇಕು (ಪೀಸ್ ಅಥವಾ ಕೆಜಿ)? ಇದು ಒಂದು ಬಾರಿಯ ಆರ್ಡರ್ ಅಥವಾ ನಿಯಮಿತ ಅಗತ್ಯವೇ?', gu: 'કેટલું જોઈએ (પીસ કે કિલો)? આ એક વખતનો ઓર્ડર છે કે નિયમિત જરૂરિયાત?' },
  'When do you need delivery, and to which city?': { hi: 'डिलीवरी कब तक और किस शहर में चाहिए?', 'hi-Latn': 'Delivery kab tak aur kis city mein chahiye?', kn: 'ಡೆಲಿವರಿ ಯಾವಾಗ ಮತ್ತು ಯಾವ ನಗರಕ್ಕೆ ಬೇಕು?', gu: 'ડિલિવરી ક્યારે અને કયા શહેરમાં જોઈએ?' },
  'Last one: your company name and GST number, for the quotation?': { hi: 'आख़िरी सवाल: कोटेशन के लिए आपकी कंपनी का नाम और GST नंबर?', 'hi-Latn': 'Last sawaal: quotation ke liye company ka naam aur GST number?', kn: 'ಕೊನೆಯ ಪ್ರಶ್ನೆ: ಕೊಟೇಶನ್‌ಗಾಗಿ ನಿಮ್ಮ ಕಂಪನಿ ಹೆಸರು ಮತ್ತು GST ಸಂಖ್ಯೆ?', gu: 'છેલ્લો પ્રશ્ન: ક્વોટેશન માટે તમારી કંપનીનું નામ અને GST નંબર?' },
  'Thank you! {rep} from our sales team will call you shortly with pricing. 📞': { hi: 'धन्यवाद! हमारी सेल्स टीम से {rep} जल्द ही रेट के साथ आपको कॉल करेंगे। 📞', 'hi-Latn': 'Dhanyavaad! Hamari sales team se {rep} jaldi rate ke saath call karenge. 📞', kn: 'ಧನ್ಯವಾದಗಳು! ನಮ್ಮ ಸೇಲ್ಸ್ ತಂಡದ {rep} ಶೀಘ್ರದಲ್ಲೇ ದರದೊಂದಿಗೆ ನಿಮಗೆ ಕರೆ ಮಾಡುತ್ತಾರೆ. 📞', gu: 'આભાર! અમારી સેલ્સ ટીમમાંથી {rep} ટૂંક સમયમાં ભાવ સાથે કૉલ કરશે. 📞' },
  'Thank you! Our team is preparing your quotation and will share it here soon.': { hi: 'धन्यवाद! हमारी टीम आपका कोटेशन तैयार कर रही है और जल्द ही यहीं भेजेगी।', 'hi-Latn': 'Dhanyavaad! Hamari team aapka quotation bana rahi hai, jaldi yahin bhejegi.', kn: 'ಧನ್ಯವಾದಗಳು! ನಮ್ಮ ತಂಡ ನಿಮ್ಮ ಕೊಟೇಶನ್ ಸಿದ್ಧಪಡಿಸುತ್ತಿದೆ, ಶೀಘ್ರದಲ್ಲೇ ಇಲ್ಲೇ ಕಳುಹಿಸುತ್ತೇವೆ.', gu: 'આભાર! અમારી ટીમ તમારું ક્વોટેશન તૈયાર કરી રહી છે અને જલ્દી અહીં મોકલશે.' },
};
export const tr = (text, lang) => (lang && lang !== 'en' && T[String(text || '').trim()]?.[lang]) || text;

// Hot and cold signals in Hindi, Hinglish, Kannada and Gujarati, always on top of your own.
const HOT_I18N = 'abhi chahiye, turant, jaldi, aaj hi, is hafte, urgent hai, regular chahiye, har mahine, अभी चाहिए, तुरंत, जल्दी, आज ही, इस हफ्ते, हर महीने, ತಕ್ಷಣ, ಬೇಗ, ಇಂದೇ, ಈ ವಾರ, ಪ್ರತಿ ತಿಂಗಳು, તરત, જલ્દી, આજે જ, આ અઠવાડિયે, દર મહિને';
const COLD_I18N = 'baad mein, abhi nahi, sirf rate, bas dekh, pata nahi, बाद में, अभी नहीं, सिर्फ रेट, पता नहीं, ನಂತರ, ಈಗ ಬೇಡ, ಗೊತ್ತಿಲ್ಲ, પછી, હમણાં નહીં, ફક્ત ભાવ, ખબર નથી';

/* ---------- Scoring with reasons ---------- */
export function explainScore(answers, agent = DEFAULT_AGENT) {
  const a = realAnswers(answers);
  let text = Object.values(a).join(' ').toLowerCase();
  const coldHits = [...list(agent.cold_words), ...list(COLD_I18N)].filter((w) => text.includes(w));
  coldHits.forEach((w) => { text = text.split(w).join(' '); }); // "abhi nahi" must not count as "abhi"
  const hotHits = [...list(agent.hot_words), ...list(HOT_I18N)].filter((w) => text.includes(w));
  const size = a.budget || a.quantity; // quantity stands in for budget in B2B presets
  const hasBudget = size && !/^(no|not sure|none|don'?t know|na|n\/a|pata nahi|नहीं)\b/i.test(String(size).trim());
  const reasons = [];
  if (hotHits.length) reasons.push(`Urgent or repeat buyer: "${hotHits.slice(0, 2).join('", "')}"`);
  if (hasBudget) reasons.push(`${a.quantity ? 'Quantity' : 'Budget'} given: ${String(size).slice(0, 40)}`);
  else reasons.push(`No ${a.quantity !== undefined ? 'quantity' : 'budget'} yet`);
  if (coldHits.length) reasons.push(`Hesitant: "${coldHits.slice(0, 2).join('", "')}"`);
  let score;
  if (coldHits.length && !hotHits.length) score = 'cold';
  else if (hotHits.length && hasBudget) score = 'hot';
  else if (hotHits.length || hasBudget) score = 'warm';
  else score = 'cold';
  return { score, reasons };
}
export function scoreAnswers(answers, agent = DEFAULT_AGENT) { return explainScore(answers, agent).score; }

/* ---------- Knowledge base: "keywords | answer" per line ---------- */
export function kbMatch(text, kb) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  for (const line of String(kb || '').split('\n')) {
    const i = line.indexOf('|'); if (i < 0) continue;
    const keys = list(line.slice(0, i)); const ans = line.slice(i + 1).trim();
    if (ans && keys.some((k) => t.includes(k))) return ans;
  }
  return null;
}
const looksLikeQuestion = (t) => /\?|^(what|how|which|do you|can you|is there|kya|kitna|kitne|kab|kaise|क्या|कितना|कब|ಎಷ್ಟು|ಏನು|ಯಾವಾಗ|શું|કેટલ|ક્યારે)/i.test(String(t || '').trim()) || String(t || '').trim().split(/\s+/).length <= 2;

// conv: { messages:[{from,body,at}], answers:{}, step:number, status:'ai'|'human'|'done' }
// answers._lang keeps the customer's language. Returns { replies:[string], conv, done, score?, reasons?, lang }
export function nextTurn(conv, incoming, agent = DEFAULT_AGENT) {
  const a = { ...DEFAULT_AGENT, ...(agent || {}) };
  const qs = (a.questions || []).filter((q) => q.question);
  const c = { answers: {}, step: -1, status: 'ai', messages: [], ...conv };
  c.answers = { ...c.answers };
  const replies = [];
  if (c.status !== 'ai') return { replies, conv: c, done: c.status === 'done' };
  const lang = a.language && a.language !== 'auto' ? a.language : detectLang(incoming, c.answers._lang);
  c.answers._lang = lang;
  const say = (t) => replies.push(fill(tr(t, lang), a, lang));
  const kb = looksLikeQuestion(incoming) ? kbMatch(incoming, a.kb) : null;

  if (c.step === -1) {
    say(a.greeting);
    if (kb) { replies.push(fill(kb, a)); c.step = 0; }
    // Treat the first message as the answer to "what are you looking for" when it says something useful.
    else if (qs[0] && incoming && incoming.trim().split(/\s+/).length >= 4 && !/^(hi|hello|hey|namaste|नमस्ते|ನಮಸ್ಕಾರ|નમસ્તે)\b/i.test(incoming.trim())) {
      c.answers[qs[0].key] = incoming.trim();
      c.step = 1;
    } else c.step = 0;
  } else if (kb) {
    replies.push(fill(kb, a)); // answer their question, then ask ours again
  } else {
    const q = qs[c.step];
    if (q) c.answers[q.key] = (incoming || '').trim();
    c.step += 1;
  }

  if (c.step < qs.length) {
    say(qs[c.step].question);
    return { replies, conv: c, done: false, lang };
  }
  const { score, reasons } = explainScore(c.answers, a);
  say(score === 'hot' ? a.handoff_hot : a.handoff_other);
  c.status = score === 'hot' ? 'human' : 'done';
  c.score = score;
  return { replies, conv: c, done: true, score, reasons, lang };
}

// Maps qualifier answers onto the lead's columns, whatever the preset asked.
export function leadFields(answers = {}) {
  const a = realAnswers(answers);
  const interest = [a.interest, a.grade, a.size].filter(Boolean).join(' · ');
  return { interest: interest || null, budget: a.budget || a.quantity || null, timeline: a.timeline || null };
}
// One line per answer, for a note on the lead.
export function answersSummary(answers = {}, agent = DEFAULT_AGENT) {
  const label = Object.fromEntries((agent?.questions || []).map((q) => [q.key, q.label || q.key]));
  return Object.entries(realAnswers(answers)).filter(([, v]) => v).map(([k, v]) => `${label[k] || k}: ${v}`).join('\n');
}

if (typeof window !== 'undefined') window.MonkEngine = { DEFAULT_AGENT, nextTurn, scoreAnswers, explainScore, leadFields, answersSummary, detectLang, kbMatch, tr, LANGS };
