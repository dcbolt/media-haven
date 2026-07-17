# Grok Cycle 6 — upsell copy + launch-alert providers

**Delivered:** 2026-07-18 · Against Claude’s cycle-6 task list (state file after #39)

---

## 1. Upsell copy pass (`lib/upsell.ts`) — SHIPPED in this PR

| Variant | Change |
|---------|--------|
| Beach Street → Dunes | Eyebrow/headline more sensory (“on the sand”, villa names); body leads with wake-to-Atlantic + conservation + dual-villa option; CTA “Book The Dunes direct” |
| Dunes villa → whole | “Both villas. One shore.” — family proximity without hotel language; ends on book-direct |
| Whole Dunes → Beach Street | Overflow framed as reunion growth, not a downgrade; still direct |
| Fallback | “Four havens. Two campuses.” + launch-week direct hook |

**Voice rules kept:** luxury calm, sand/pool/privacy, no Viator/ads, ranking rules unchanged (never downsell Dunes to Beach Street as the primary upgrade).

---

## 2. Verbatim guidebook diff

**Blocked on Devin** — still need paste of real thefloridahavens.com guidebook wording. No code until source lands.

---

## 3. Launch-alert providers (Resend + Twilio)

### Resend (email) — **recommended default for 1.8**
Fits a Next.js/Vercel app cleanly (HTTP API, React email templates optional). Free tier is enough to prove the product: on the order of **3,000 emails/month and ~100/day** (confirm current Resend pricing page before go-live). No carrier registration for email. Use a verified domain (`alerts.thefloridahavens.com` or root SPF/DKIM). Wire T-24h / T-1h / scrub / delay templates from cycle 4–5; honor opt-in + unsubscribe. **Decision for Devin:** create Resend account, verify domain, set `RESEND_API_KEY` on Vercel.

### Twilio (SMS) — **optional second channel; slower to go live**
Twilio free trial credits work for sandbox tests, but **production US SMS to guests needs A2P 10DLC** (brand + campaign registration) or a verified toll-free number. **Florida / national 10DLC approval is often days to a few weeks**, not same-day — plan SMS as phase 1.8b after email is live. Quiet hours (no night texts unless guest opted into night launches) stay mandatory. **Decision for Devin:** email-first now; open Twilio + start 10DLC only if text opt-in volume justifies it.

**Recommendation:** Ship **email via Resend first** (unblocks 1.8 send path). SMS via Twilio after A2P. Do not block 1.8 on SMS.

---

## 4. Competitive watch

Next scheduled ~**2026-08-17** (no change this cycle).

---

## Claude handoff

- Merge upsell copy; smoke still green on upsell strings if covered.
- Prefer Resend for 1.8 send; surface Devin env: `RESEND_API_KEY` + from-domain.
- Entertainment remains launcher + device-code only (`docs/ENTERTAINMENT.md`).
