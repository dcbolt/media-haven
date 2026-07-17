# media-haven

Guest welcome portal + TV ambient media center for **The Florida Havens** short-term rentals (Melbourne Beach / Space Coast).

Next.js (App Router, TypeScript) · Supabase (Postgres + RLS) · Tailwind · Vercel · Guesty (mock until Open API).

**This runs standalone on mock data** — nothing is blocked on Guesty API approval or Supabase setup. Visit `/welcome?token=demo` for the guest phone flow with zero configuration.

---

## 🔒 Locked decisions (read first)

**Agents and humans:** product + hardware decisions are locked in:

### → [`docs/DECISIONS.md`](./docs/DECISIONS.md) · [`docs/ROADMAP.md`](./docs/ROADMAP.md)

| | |
|--|--|
| Architecture lock | https://github.com/dcbolt/media-haven/blob/claude/media-haven/docs/DECISIONS.md |
| Full roadmap (vs WelcomeScreen) | https://github.com/dcbolt/media-haven/blob/claude/media-haven/docs/ROADMAP.md |
| Raw DECISIONS | https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/DECISIONS.md |
| Raw ROADMAP | https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/ROADMAP.md |
| Agent entrypoints | [`AGENTS.md`](./AGENTS.md) · [`CLAUDE.md`](./CLAUDE.md) |

**Summary (2026-07-16):** one streamer per TV (Shield living / Google TV bedrooms), one HDMI forever. `/tv` is boot + idle home; **Home** opens streaming apps with guest accounts; cast targets named by room; checkout wipe = turnover checklist. Dual-input, Roku-primary, and BrightSign-as-primary are **out**.

---

## Run locally

```bash
npm install
cp .env.example .env.local   # can stay blank for mock mode
npm run dev                  # http://localhost:3000
```

## Architecture decisions (code constraints)

Full narrative: **`docs/DECISIONS.md`**. Engineering constraints that remain true:

**Streaming is native apps + instruction UI, not an integration.** No public API creates/wipes Netflix logins per stay on consumer hardware. Apps cannot be iframed (DRM + `frame-ancestors`). The portal gives Wi‑Fi, cast help, and TV-code activation links; the TV kiosk shows how-to + ambient brand (launches, welcome). **Wipe = cleaner/host checklist**, not software magic.

**Hardware standard:** NVIDIA Shield TV Pro (primary) / Chromecast with Google TV 4K (bedrooms), Fully Kiosk (or equivalent) pointing at `/tv`. Not Roku-as-browser (no real browser for `/tv`).

**QR codes carry opaque tokens, never Guesty reservation IDs.** Anyone can photograph a QR code; raw reservation IDs would be enumerable. The `guest_tokens` table maps short tokens → reservations, with expiry. Checkout revokes the token.

**One Guesty token, cached in Postgres.** Guesty allows only **5 access-token requests per key per 24h**. On serverless, minting per-request bricks the integration in minutes. `lib/guesty.ts` caches the token in the `guesty_tokens` table so all invocations share it (~1 request/day). Never bypass this.

**RLS is default-deny.** No anon/authenticated policies exist. All data access goes through the service-role client in server code, gated by token resolution. Guests never hold a database session.

**TV never shows an error page.** Weather, launches, PMS are optional; last-good cache always.

## Setup — Supabase

1. Create a project at supabase.com, run the migrations in `supabase/migrations/` (SQL editor, `supabase db push`, or the in-app runner at `/api/admin/migrate`).
2. Copy Project Settings → API values into `.env.local` (and later, Vercel → Settings → Environment Variables):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Setup — Guesty (when you have Open API access)

1. **Confirm access first**: Guesty dashboard → Integrations → API & Webhooks. If you can "Create a new API application," you have Open API access. If the section is missing, your plan tier doesn't include it — that's a call to Guesty, not a code fix.
2. Create an API application → copy Client ID + Client Secret into `GUESTY_CLIENT_ID` / `GUESTY_CLIENT_SECRET`.
3. Register the webhook URL (`https://<your-domain>/api/guesty/webhook`) with a shared secret; set the same value as `GUESTY_WEBHOOK_SECRET`.

The Guesty client (`lib/guesty.ts`) auto-switches from mock to live the moment credentials exist — no code changes.

## Deploy — Vercel

Import the GitHub repo at vercel.com/new, add the env vars above, deploy. Every push to a branch gets a preview URL; the default branch deploys to production.

## What's here

| Path | Purpose |
| --- | --- |
| `docs/DECISIONS.md` | **Locked product/hardware decisions** (agent source of truth) |
| `AGENTS.md` / `CLAUDE.md` | Short entrypoints pointing at DECISIONS |
| `app/welcome/` | Guest phone portal: token → welcome, Wi‑Fi, streaming activation guidance |
| `app/api/guesty/webhook/route.ts` | Check-out webhook: revokes guest tokens (portal data only) |
| `lib/guesty.ts` | Guesty client — mock until credentials exist, DB-cached OAuth token |
| `lib/reservations.ts` | Token → reservation resolution (guest privacy boundary) |
| `supabase/migrations/` | Schema, RLS default-deny, token cache |

## Roadmap (aligned with DECISIONS + competitive plan)

Canonical: **[`docs/ROADMAP.md`](./docs/ROADMAP.md)** (WelcomeScreen teardown + Elon Stay OS doctrine).

| Phase | Status | Focus |
|-------|--------|--------|
| **0** | **Shipped** | Never-blank TV, cast naming, Guesty, host CMS, streaming catalog, wipe checklist |
| **1** | **Next** | Tides/weather → last-night direct CTA → heartbeats → self-reload → portal parity |
| **2** | Later | Grounded AI, launch planner, first-party extras store (not Viator-first) |
| **3–4** | Later | All 6 Havens SOP, Space Coast moats, optional multi-tenant |

See `docs/DECISIONS.md` for architecture locks; do not re-open dual HDMI / Roku-primary.
