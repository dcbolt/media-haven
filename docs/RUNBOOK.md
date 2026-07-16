# media-haven — Operator Runbook

Day-to-day operations for hosts and cleaners. No code knowledge needed.
(Agents: product decisions live in `DECISIONS.md`, not here.)

**Host dashboard:** `https://media-haven-lilac.vercel.app/host`
(access code: the `HOST_ACCESS_CODE` value — `demo` until one is set)

---

## Set up a TV (once per TV, ~2 minutes)

1. On the TV's streamer (Shield / Google TV with Fully Kiosk), open the
   kiosk URL: `https://media-haven-lilac.vercel.app/tv`.
2. The screen shows a **6-character code**.
3. On your phone: dashboard → **TVs →** … or the **Pair a TV** card →
   enter the code → pick the property → **Pair TV**.
4. Within 30 seconds the TV switches to that property's guide.
5. On the TVs page, give it a name ("Living Room") so the fleet list
   stays readable.

**Move a TV to another property:** TVs page → pick the new property → Link.
**Retire a TV:** TVs page → Forget. (If it's still powered, it reappears
with a fresh code.)

## Print a guest welcome card (per stay)

1. Dashboard → find the reservation → **Guest link ✓** appears
   automatically once Guesty sync/webhooks are live (or press
   **Mint guest QR** for a manual booking).
2. Press **Print card** → browser print dialog → print, trim, place at
   the entry or kitchen counter.
3. The QR opens the guest's personalized portal: Wi-Fi, house guide,
   streaming sign-in links, launch alerts, direct-booking offer.
4. Links die on their own 24 hours after checkout — an old card from a
   past stay can never open a current guest's page (but print fresh per
   stay so the QR matches the current guest).

## Turnover (every checkout — the "we clear logins" promise)

Dashboard → **Turnover →**

1. Pick the property.
2. On the TV, press Home and open each streaming app the guest used —
   sign out (Netflix, Disney+, Hulu, Prime, Max, YouTube, anything else
   signed in).
3. Confirm the TV boots back to the house guide (`/tv`).
4. Confirm the remote is present with working batteries.
5. Check each item off, add notes if anything was odd, **Record turnover**.

The recent-turnovers list is the audit trail per property.

## Screensavers (the between-stays look)

- Dashboard → **Media →** upload 4K photos or videos (drag and drop).
- Between stays, TVs automatically show this media with a clock;
  during stays they show the guide.
- Preview instantly on any computer: `/tv?preview=standby`.

## Update house-guide content

Supabase → Table Editor → `property_sections` — edit any section's text.
TVs and the guest portal pick it up within about 30 seconds. No deploy.

Wi-Fi per property: `properties` table (`wifi_ssid`, `wifi_password`) —
or, once Guesty is connected, keep it in Guesty's custom fields and press
**Sync from Guesty** on the dashboard.

## When something looks wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| TV shows a pairing code mid-stay | Device row was unlinked or forgotten | TVs page → Link it back to the property |
| TV shows black screen + clock during a stay | No active reservation in the system for today | Check the reservation exists (Sync from Guesty, or add it manually in Supabase) |
| TV shows stale info | It re-polls every 30s and reloads every ~5h — give it a minute | Power-cycle the streamer if it persists |
| Guest says the QR "isn't active" | Token expired (24h past checkout) or wrong card | Print a fresh card from the current reservation |
| Dashboard shows "demo data" badge | App can't reach Supabase | Check the three Supabase env vars in Vercel, redeploy |
| Sync from Guesty errors | Credentials missing/expired or tier lacks Open API | Check `GUESTY_CLIENT_ID`/`SECRET` in Vercel |

## Emergency contacts for the stack

- **Hosting/deploys:** Vercel dashboard → media-haven (every push to
  `claude/media-haven` auto-deploys; use Instant Rollback if a deploy
  misbehaves)
- **Database:** Supabase dashboard → media-haven project
- **Guest media storage:** Vercel → Storage → Blob
