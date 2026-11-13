# MarketingMonk

**Calm marketing. Relentless follow-up.**
An AI sales system for growing businesses: website, WhatsApp AI agent, lead scoring, CRM, follow-up sequences and bookings in one place.

## Roadmap
- [x] **Part 1: Brand + launch site.** Animated monk logo, palette, typography, landing page (`/`) and brand kit (`/brand`). Static HTML/CSS on GitHub Pages.
- [x] **Part 2: App + CRM** (`/app`). Sign-in, drag-and-drop pipeline with custom stages, lead profiles (Hot/Warm/Cold, budget, timeline, owner, value), activity log, follow-up tasks, dashboard, one-tap WhatsApp. Runs in demo mode (browser storage) or on Supabase's free tier.
- [ ] **Part 3: WhatsApp AI agent.** Meta WhatsApp Cloud API, AI qualification with Hot/Warm/Cold scoring, handoff to reps.
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
