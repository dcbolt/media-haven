# Wi-Fi captive portal (pilot — DUNES GUEST)

Served at **`wifi.thefloridahavens.com`** (host rewrite `/` → `/portal`).

## UniFi external portal

Guest hit receives query params (names vary by firmware):

| Param | Meaning |
|-------|---------|
| `id` | Client MAC (transient — used only for authorize POST, never stored) |
| `ap` | AP MAC (ignored for storage) |
| `ssid` | WLAN name — maps pilot SSID → property |
| `url` | Original destination (validated; success UX uses `/portal/welcome`) |

## Legal-safe consent

- **Email required** for Wi-Fi (transactional).
- **Marketing checkbox optional** — never required for access.
- `consentMarketing: false` → `transactional/no-marketing`, no Mailchimp.

## Node authorizer contract

`POST {NODE_AUTHORIZER_URL}` with headers:

- `Content-Type: application/json`
- `X-Timestamp` — unix seconds
- `X-Signature` — `HMAC-SHA256(secret, "{timestamp}.{body}")` hex

Body:

```json
{
  "mac": "aa:bb:cc:dd:ee:ff",
  "minutes": 4320,
  "ssid": "DUNES GUEST",
  "propertySlug": "dunes"
}
```

Reference implementation: `tools/wifi-authorizer/`.

Minutes = until checkout from `lib/wifi-checkout.ts` (stub today; 7-day cap).

## FAIL-OPEN

If Vercel page, Supabase, Mailchimp, or node authorizer fails, **still authorize** the guest (UniFi path). Kill-switches:

- `PORTAL_MODE=open` — skip form; authorize when MAC present
- `PORTAL_MODE=closed` — maintenance message (no authorize)

## Devin GO checklist

1. UniFi: external portal URL → `https://wifi.thefloridahavens.com/portal`
2. Generate UniFi API key on-site; install `tools/wifi-authorizer` as systemd service
3. Set env: `NODE_AUTHORIZER_URL`, `NODE_AUTHORIZER_SECRET`, `PORTAL_MODE=normal`
4. Apply migration `0025_consent_log.sql`
5. DNS: `wifi.thefloridahavens.com` → Vercel
6. Point **DUNES GUEST** WLAN to external portal (pilot)
7. Merge PR-B after PR-A migration path is live