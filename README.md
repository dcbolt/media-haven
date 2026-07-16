# media-haven

Guest welcome portal for The Florida Havens short-term rentals.
Next.js 15 (App Router, TypeScript) · Supabase (Postgres + RLS) · Tailwind 4 · Vercel · Guesty Open API.

**This runs standalone on mock data** — nothing is blocked on Guesty API approval or Supabase setup. Visit `/welcome?token=demo` for the full guest flow with zero configuration.

## Run locally

```bash
npm install
cp .env.example .env.local   # can stay blank for mock mode
npm run dev                  # http://localhost:3000
```

## Architecture decisions (read before extending)

**Streaming is an instruction screen, not an integration.** Roku Guest Mode already does per-guest sign-in + automatic wipe on the checkout date, but it has no public API for this portal to control, streaming apps cannot be iframed (DRM + `frame-ancestors`), and client-side storage clearing can't touch a TV app's login. The buildable 100% is `app/welcome/streaming-guide.tsx`: a walkthrough of Guest Mode with the guest's actual checkout date filled in. Operational prerequisite: standardize on Roku hardware and enable Guest Mode as a turnover checklist item.

**QR codes carry opaque tokens, never Guesty reservation IDs.** Anyone can photograph a QR code; raw reservation IDs would be enumerable. The `guest_tokens` table maps short tokens → reservations, with expiry. Checkout revokes the token.

**One Guesty token, cached in Postgres.** Guesty allows only **5 access-token requests per key per 24h**. On serverless, minting per-request bricks the integration in minutes. `lib/guesty.ts` caches the token in the `guesty_tokens` table so all invocations share it (~1 request/day). Never bypass this.

**RLS is default-deny.** No anon/authenticated policies exist. All data access goes through the service-role client in server code, gated by token resolution. Guests never hold a database session.

## Setup — Supabase

1. Create a project at supabase.com, run the two migrations in `supabase/migrations/` (SQL editor or `supabase db push`).
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
| `app/welcome/` | Guest arrival flow: token → personalized welcome, one-tap Wi-Fi copy, Roku Guest Mode walkthrough |
| `app/api/guesty/webhook/route.ts` | Check-out webhook: revokes guest tokens, marks reservation checked out (portal data only — TV logins are Roku Guest Mode's job) |
| `lib/guesty.ts` | Guesty client — mock until credentials exist, DB-cached OAuth token |
| `lib/reservations.ts` | Token → reservation resolution (the guest privacy boundary) |
| `supabase/migrations/` | Schema, RLS default-deny, token cache |

## Roadmap

- **Phase 1**: host dashboard (create properties, mint QR tokens per reservation), QR generation, richer content sections
- **Phase 2**: Guesty reservation sync (webhook upsert + cron polling fallback), auto-minted tokens per booking
- **Phase 3**: TV/kiosk display mode, PWA manifest + offline caching, analytics
