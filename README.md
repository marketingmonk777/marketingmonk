# MarketingMonk

**Calm marketing. Relentless follow-up.**
An AI sales system for growing businesses: website, WhatsApp AI agent, lead scoring, CRM, follow-up sequences and bookings in one place.

## Roadmap
- [x] **Part 1: Brand + launch site.** Animated monk logo, palette, typography, landing page (`/`) and brand kit (`/brand`). Static HTML/CSS on GitHub Pages.
- [x] **Part 2: App + CRM** (`/app`). Sign-in, drag-and-drop pipeline with custom stages, lead profiles (Hot/Warm/Cold, budget, timeline, owner, value), activity log, follow-up tasks, dashboard, one-tap WhatsApp. Runs in demo mode (browser storage) or on Supabase's free tier.
- [x] **Part 3: Monk AI + WhatsApp inbox.** Configurable AI qualifier (questions, hot/cold signals, handoff replies), test chat, shared inbox with take-over, auto-created scored leads and call tasks. Edge Functions for the WhatsApp Cloud API, with optional Gemini free tier for natural replies.
- [x] **Part 4: Follow-ups + bookings.** Multi-step WhatsApp sequences (stop on reply, due-now queue, auto-send via `run-sequences`), public booking page at `/book/` with working hours, time zones and no double-booking, bookings view with done / no-show (no-show starts a rescue sequence).
- [x] **Part 5: Insights + integrations.** Insights (trend, funnel, sources, Monk AI, follow-ups, show-up rate, team leaderboard, date ranges, CSV export) and Integrations (embeddable website form at `/capture/`, WhatsApp link + QR, CSV import with Meta-style columns, outgoing webhook trigger, `lead-intake` endpoint for Zapier / Make / lead ads).

## Brand
| Colour | Hex |
|---|---|
| Deep Indigo | `#1E1B4B` |
| Monk Saffron | `#F28C28` |
| Ember | `#E5761C` |
| Zen Teal | `#14B8A6` |
| Lotus Cream | `#FFF7ED` |
| Ink | `#0F172A` |

Fonts: Plus Jakarta Sans (headlines), Inter (body).

Built clean-room: features inspired by the category, with original design, code and copy.

## Connect Supabase (free)
1. Create a free project at supabase.com.
2. SQL Editor → New query → paste `supabase/schema.sql` → Run. Every table has row-level security, so each user only sees their own data.
3. Authentication → URL Configuration → add your site URL (e.g. `https://marketingmonk777.github.io/marketingmonk/app/`).
4. Open `/app` → "Connect your Supabase project" → paste the Project URL and the publishable key, `sb_publishable_…` (the Connect button, or Project Settings → API Keys; the legacy anon key also works). They're kept in that browser only.

## Go live on WhatsApp (free tiers)
1. Run the updated `supabase/schema.sql` again (it adds `agent_config` and `conversations`).
2. In Meta for Developers, create an app → add **WhatsApp** → note the test **Phone number ID** and a **token**.
3. Install the Supabase CLI, then:
   ```bash
   supabase functions deploy whatsapp-webhook --no-verify-jwt
   supabase functions deploy whatsapp-send
   supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_VERIFY_TOKEN=pick-any-word OWNER_ID=<your auth user id>
   supabase secrets set GEMINI_API_KEY=...   # optional, free at aistudio.google.com
   ```
4. In Meta → WhatsApp → Configuration, set the callback URL to `https://<project>.supabase.co/functions/v1/whatsapp-webhook`, the verify token from step 3, and subscribe to `messages`.
5. Message your test number. Monk AI replies, scores the lead, and it appears in Inbox and Pipeline.

## Automate follow-ups and bookings (Part 4)
1. Run the updated `supabase/schema.sql` again (adds `sequences`, `enrollments`, `availability`, `bookings` and the two public booking functions).
2. Open **Bookings** in the app, pick a page handle and hours, save, and share the link it shows.
3. Deploy the sender and schedule it every 15 minutes:
   ```bash
   supabase functions deploy run-sequences --no-verify-jwt
   supabase secrets set CRON_SECRET=pick-a-long-random-word BOOKING_BASE_URL=https://marketingmonk777.github.io/marketingmonk/book/
   # optional, for messages sent more than 24h after the lead last wrote:
   supabase secrets set WHATSAPP_TEMPLATE=<approved template with one {{1}}> WHATSAPP_TEMPLATE_LANG=en
   ```
   Then in the SQL editor (enable the `pg_cron` and `pg_net` extensions first):
   ```sql
   select cron.schedule('mm-followups', '*/15 * * * *', $$
     select net.http_post(url := 'https://<project>.supabase.co/functions/v1/run-sequences',
       headers := '{"x-cron-secret":"<CRON_SECRET>","Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb) $$);
   ```
Without WhatsApp connected, the **Follow-ups → Due now** queue lets you send each message with one tap.

## Integrations (Part 5)
1. Run the updated `supabase/schema.sql` again (adds `integrations`, the website-form function and the new-lead webhook trigger). Enable `pg_net` for outgoing webhooks.
2. Website form: Integrations → copy the embed code onto any site. It uses your booking-page handle, so save Bookings first.
3. Incoming leads: `supabase functions deploy lead-intake --no-verify-jwt`, press Save under Zapier/Make once to create your private key, then point a Zap or Make scenario (for example "New Facebook Lead Ads lead") at the incoming URL shown.

## Industry presets (Part 6)

Settings → Industry preset sets up the CRM for a trade in one click: pipeline stages, Monk AI qualifier questions, follow-up sequences, booking page wording and lead-field labels. Leads are kept.

- **PTFE manufacturer**: stages New enquiry → Qualified RFQ → Sample sent → Quotation sent → Negotiation → Won – PO received → Lost. Monk AI asks for product, grade, size, quantity, delivery, and company + GST, then saves every answer as a note on the lead. Sequences: Quotation follow-up, Sample feedback, Repeat order reminder. CSV import understands IndiaMART exports (SENDER_NAME, SENDER_MOBILE, QUERY_PRODUCT_NAME…).
- **Real estate agent**: coming next.

After pulling this update, redeploy `whatsapp-webhook` so live WhatsApp chats use the same mapping.
