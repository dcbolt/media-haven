# Path C e2e test plan — office Shield “Open on TV”

**Status:** PLAN ONLY — **do not insert live commands or fire this test until Devin explicitly says go.**  
**Author:** Grok · 2026-07-21  
**Spec:** [`PATH-C-TV-LAUNCH.md`](./PATH-C-TV-LAUNCH.md) · code: `lib/tv-commands.ts`, `app/api/tv/command`, `/tv` client, `app/welcome/open-on-tv.tsx`  
**Locks:** ENTERTAINMENT · STREAMING-SEAMLESS — native intent + provider QR only; **no** stream OAuth store; never claim “we signed you in.”  
**Live:** https://media-haven-lilac.vercel.app  

---

## 0. What “success” means

Guest phone on the office Wi‑Fi (or phone hotspot matching the Shield) taps **Open Netflix on TV** on the real guest portal. Within **~10–20s** (one poll cycle + a little slack), the office **Shield** leaves the signage kiosk browser and opens the **native Netflix app**. Guest sees the app’s own sign-in UI (device code / QR). Command row ends `done` (or `failed` with a readable error if the intent cannot fire).

**Not success:** silent no-op, wrong property’s TV, launch after TTL (60s), credential storage, dual-HDMI box, or “demo token” path.

---

## 1. Preconditions (checklist)

| # | Check | How |
|---|--------|-----|
| 1 | Prod green | `curl -s -o /dev/null -w '%{http_code}' https://media-haven-lilac.vercel.app/` → **200** |
| 2 | Migration **0020** applied | `tv_commands` table exists (service role / MCP). If missing: **stop** — Path C cannot run. |
| 3 | Office Shield paired | Host `/host/tvs`: device shows **online** (`last_seen` &lt; 90s), linked to the **test property** (same property as the guest reservation). |
| 4 | Fully Kiosk (or equivalent) | Browser kiosk on `/tv` full-screen; Android intents allowed (Fully: “Open external links” / intent permissions as in HARDWARE-STANDARD). |
| 5 | Netflix installed | Shield has `com.netflix.ninja` (or current Netflix Android TV package from `lib/streaming.ts`). |
| 6 | In-house reservation | Guesty (or DB) reservation on that property with **check_in ≤ now ≤ check_out**, not checked out. |
| 7 | Real guest token | Host dashboard → mint / copy guest portal link for that reservation — **not** `token=demo`. |
| 8 | Network | Phone can reach prod URL; Shield can reach prod poll endpoint; phone and TV on network that doesn’t block HTTPS. |
| 9 | Devin go | Explicit verbal/chat approval to run live insert. **Without this, stay plan-only.** |

---

## 2. Roles & safety

| Role | Does | Does not |
|------|------|----------|
| **Devin** | Approves go; watches Shield; can abort | Share guest tokens in public channels |
| **Operator (Grok/Claude assist)** | Follow this plan; paste only redacted IDs in GROK | Invent DB rows without go; spam commands |
| **Guest token** | Only property-scoped enqueue | Target other villas |

**Rollback always available** (section 6) — safe to abort mid-test.

---

## 3. Exact steps (when Devin says “fire”)

### 3.1 Baseline snapshot

1. Open host fleet: `https://media-haven-lilac.vercel.app/host/tvs`  
2. Note: device label, pair_code, property name, **online** dot, `last_seen` freshness.  
3. On Shield: confirm kiosk shows FH signage (welcome / Wi‑Fi / etc.), not pairing code.  
4. Optional SQL (service role) — count open commands:

```sql
select id, status, payload->>'slug' as slug, expires_at, created_at
from tv_commands
where property_id = '<TEST_PROPERTY_UUID>'
  and created_at > now() - interval '1 hour'
order by created_at desc
limit 10;
```

Expect: no stuck `pending`/`claimed` rows younger than TTL, or clean them (section 6).

### 3.2 Portal enqueue (happy path — Netflix)

1. On phone: open guest portal  
   `https://media-haven-lilac.vercel.app/welcome?token=<REAL_TOKEN>`  
2. Confirm guest name / property matches test stay.  
3. Scroll to **Streaming** / **Open on TV** panel.  
4. If multi-TV picker: select the office Shield label.  
5. Tap **Open Netflix** (or service button that calls Path C for `netflix`).  
6. UI should show something like:  
   `Opening Netflix on <Living Room>… Look at the TV — scan the QR if it asks you to sign in.`  
   **Must not** say we signed the guest into Netflix.

### 3.3 Expected TV behavior (within ~20s)

| t | Expected |
|---|----------|
| 0–10s | Shield continues signage; next poll to `/api/tv/state` claims command |
| claim | Row: `pending` → `claimed`, `claimed_by_device_id` = Shield id |
| launch | Browser navigates to Android intent URL (`appLaunchUrl` / `pendingCommand.launchUrl`) |
| app | Netflix native UI foreground |
| ack | Client POSTs done (or equivalent complete path); row → `done`, `completed_at` set |

If after **30s** still only signage: see section 5 failures.

### 3.4 Optional second service

Repeat 3.2–3.3 with **YouTube** or **Disney+** (package must exist on Shield). Proves slug routing, not Netflix-only hardcoding.

### 3.5 Negative checks (quick)

| Case | Action | Expect |
|------|--------|--------|
| Demo token | `/welcome?token=demo` | No real Open on TV enqueue (“Demo stay…”) |
| Offline TV | Pause kiosk / unplug network briefly | Portal: “No TV online…” / 404 path |
| Expired command | Enqueue then wait &gt;60s without poll | Row `expired`; no late surprise launch |
| Wrong property token | Token for different villa | 401 or no launch on office Shield |

---

## 4. Observability during the test

| Signal | Where |
|--------|-------|
| Portal message | Phone UI copy |
| Command row | `tv_commands` status / error / payload.slug |
| Fleet online | `/host/tvs` last_seen |
| TV console | Fully remote debugger / chrome://inspect if needed (optional) |
| Prod logs | Vercel function logs for `/api/tv/command` and `/api/tv/state` |

**Never** capture occupied guest-room screenshots for proof — office is host-owned; still prefer command-row + visual observation.

---

## 5. Failure matrix

| Symptom | Likely cause | Fix / next |
|---------|--------------|------------|
| Portal “no TV online” | `last_seen` stale (&gt;~2 min online window) | Confirm kiosk polling `/tv`; check Wi‑Fi |
| Portal 401 | Bad/expired guest token; stay not in-house | Re-mint token; check reservation window |
| Portal 409 rate limit | &gt;5 launches / 10 min / property | Wait window or clean test spam |
| Command stays `pending` | TV not polling or wrong property_id | Pairing; property link; Fully still on `/tv` |
| `claimed` but no app | Intent blocked by kiosk / package missing | Fully external intents; install Netflix |
| App opens then kiosk steals focus | Fully “return to home” too aggressive | Soften Fully settings for test |
| Wrong TV | Multi-device without picker | Force `tvDeviceId` in picker |
| Late launch after 60s | Bug (should expire) | File bug; expireStaleCommands path |

---

## 6. Rollback / abort

| Situation | Action |
|-----------|--------|
| Abort before claim | Wait 60s TTL **or** set row `status='expired'` / delete test rows |
| Abort after claim | On Shield: Back / Home → Fully returns to `/tv`; mark command `failed` if stuck |
| Spammed rows | |

```sql
-- Service role only. Prefer expire over hard delete for audit.
update tv_commands
set status = 'expired', completed_at = now()
where property_id = '<TEST_PROPERTY_UUID>'
  and status in ('pending', 'claimed')
  and created_at > now() - interval '1 day';
```

| Kiosk recovery | Fully reload URL → `https://media-haven-lilac.vercel.app/tv` |
| Guest token leak | Rotate / mint new token; treat old as burned |

No schema rollback required — Path C is additive.

---

## 7. Success criteria (sign-off)

All must be true:

- [ ] **S1** Real guest token enqueue returns **201** with `commandId` + `targetHint`  
- [ ] **S2** Within **20s**, Shield shows **native** Netflix (or chosen app), not only a web tab  
- [ ] **S3** Command row reaches **`done`** (or documented `failed` + `error` text if intent blocked)  
- [ ] **S4** Portal copy never claims OAuth / stored passwords  
- [ ] **S5** Demo token cannot enqueue against prod TVs  
- [ ] **S6** After test, kiosk returns to never-blank signage; no stuck `pending` rows  

**Sign-off line for GROK / Devin:**  
`Path C e2e PASS <UTC> · property <name> · device <label> · slug netflix · command <id> · done`

---

## 8. One-command helpers (after go only)

### 8.1 Health (safe anytime)

```bash
curl -s -o /dev/null -w "home:%{http_code}\n" https://media-haven-lilac.vercel.app/
curl -s -o /dev/null -w "welcome_demo:%{http_code}\n" \
  "https://media-haven-lilac.vercel.app/welcome?token=demo"
```

### 8.2 List online TVs for a token (safe read)

```bash
# REAL_TOKEN from host mint — do not commit tokens into git
curl -sS "https://media-haven-lilac.vercel.app/api/tv/command?token=REAL_TOKEN" | jq .
```

### 8.3 Enqueue Netflix (only after Devin go)

```bash
curl -sS -X POST https://media-haven-lilac.vercel.app/api/tv/command \
  -H 'content-type: application/json' \
  -d '{"token":"REAL_TOKEN","slug":"netflix","tvDeviceId":"OPTIONAL_DEVICE_UUID"}' | jq .
```

Expect **201** + `commandId`. Watch Shield.

### 8.4 “One command” when Devin is ready

There is no single shell that includes a secret token in-repo. The operator sequence is:

```text
1) Devin: "fire Path C e2e"
2) Operator: mint token + confirm Shield online on /host/tvs
3) Operator: run 8.2 then 8.3 (or phone UI 3.2)
4) Devin: visual confirm Netflix on Shield
5) Operator: confirm tv_commands status=done
6) Paste sign-off line into docs/GROK.md
```

---

## 9. Out of scope for this e2e

- Plex / non-catalog packages  
- Multi-property fan-out  
- Push/WebSocket delivery (poll-only v1)  
- Automated Playwright intent (needs real Android device farm)  
- Storing provider sessions  

---

## 10. Ask for Devin

When ready: **“fire Path C e2e”** + which property / Shield label.  
We execute sections 3–7, then report PASS/FAIL with command id. Until then: **no live inserts.**

— Grok · 2026-07-21 · Path C e2e plan only
