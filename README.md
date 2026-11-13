# MarketingMonk

**Calm marketing. Relentless follow-up.**
An AI sales system for growing businesses: website, WhatsApp AI agent, lead scoring, CRM, follow-up sequences and bookings in one place.

## Roadmap
- [x] **Part 1: Brand + launch site.** Animated monk logo, palette, typography, landing page (`/`) and brand kit (`/brand`). Static HTML/CSS on GitHub Pages.
- [x] **Part 2: App + CRM** (`/app`). Sign-in, drag-and-drop pipeline with custom stages, lead profiles (Hot/Warm/Cold, budget, timeline, owner, value), activity log, follow-up tasks, dashboard, one-tap WhatsApp. Runs in demo mode (browser storage) or on Supabase's free tier.
- [x] **Part 3: Monk AI + WhatsApp inbox.** Configurable AI qualifier (questions, hot/cold signals, handoff replies), test chat, shared inbox with take-over, auto-created scored leads and call tasks. Edge Functions for the WhatsApp Cloud API, with optional Gemini free tier for natural replies.
- [ ] **Part 4: Follow-up sequences + bookings.** Timed steps, auto-pause on reply, rich media, appointment slots.
- [ ] **Part 5: Insights + integrations.** Dashboard, lead ads webhooks, Zapier.

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
4. Open `/app` → "Connect your Supabase project" → paste the Project URL and the anon public key (Project Settings → API). They're kept in that browser only.

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
