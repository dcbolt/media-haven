# Grok Cycle 5 content pack — multi-property deltas + 1.8 edge cases

**Ship doctrine:** Unblocked work ships now. Beach Street / villa rows are **deltas on the Dunes corpus** (`docs/GROK_CYCLE4_CONTENT.md` §1). Claude clones shared sections and overwrites only the rows below. Exact street numbers for Beach Street marked **TBD — Devin** where unknown; everything else is guest-ready.

**Properties (from thefloridahavens.com):**

| Property | Area | Notes |
|----------|------|--------|
| The Havens at The Dunes | Melbourne Beach 32951 | **Seeded** — 4225 & 4227 S Hwy A1A (Turtle + Shell) |
| Turtle Haven | Melbourne Beach | Solo unit at The Dunes |
| Shell Haven | Melbourne Beach | Solo unit at The Dunes |
| The Havens at Beach Street | Indialantic 32903 | Beach + Sea combo; ~2 min walk to beach |
| Beach Haven | Indialantic | Solo at Beach Street |
| Sea Haven | Indialantic | Solo at Beach Street |

---

## 1. Beach Street corpus (combo: Beach Haven + Sea Haven)

Clone Dunes §1, then replace:

| slug | body (Beach Street) |
|------|---------------------|
| arrive | Welcome to **The Havens at Beach Street**, Indialantic, FL 32903 (Beach Haven + Sea Haven). Park in the driveway; leave the street clear. Door codes are in your check-in message. You're a short walk from the sand and minutes from historic downtown Melbourne. |
| beach | The beach is about a **two-minute stroll** — not a private boardwalk like The Dunes, but an easy neighborhood walk to the Atlantic. Rinse sand before you come inside. Rip-current flags still apply: yellow = caution, red = stay out. |
| pool | Each home has its own **private heated pool, spa, and grill**. No glass on pool decks. Supervise children. When both homes are booked together, treat both pools as part of the stay — same house rules on each side. |
| wifi-tips | Join the guest network shown on the Wi-Fi slide for **this** unit. Phone and streamers must share that Wi-Fi. Cast target is named by room on the house TV. Your shows = your accounts on Shield / Google TV. |
| activities | Downtown Melbourne and Eau Gallie are close for dining and nightlife. Sebastian Inlet ~20–25 min south. Kennedy Space Center ~45–60 min north. Same Space Coast playbook as The Dunes — different address, same rockets and turtles. |
| leave | Check-out **10:00 AM** unless late checkout was approved. Dishwasher on, trash out, towels in laundry, lock every door/slider on **both** homes if you took the combo, sign out of streaming on house TVs. Text us when you're on the road. |

**Unchanged from Dunes (reuse as-is):** rules, turtles, launches, kitchen-grill, emergency, food, dining/nearby shortlist rows.

**Devin TBD:** exact street numbers / driveway notes for Beach + Sea if different from combo marketing.

---

## 2. Single-villa deltas (short)

### Turtle Haven (solo, The Dunes)
| slug | delta |
|------|--------|
| arrive | Welcome to **Turtle Haven**, 4225/4227 S Hwy A1A complex, Melbourne Beach. You have this villa only — private beach walkover, pool, spa, grill. Door code in check-in message. |
| pool | Your private pool & spa (this villa). Same rules: no glass, supervise kids, spa heater ~30 min. |

### Shell Haven (solo, The Dunes)
| slug | delta |
|------|--------|
| arrive | Welcome to **Shell Haven**, Melbourne Beach at The Dunes. You have this villa only — private beach walkover, pool, spa, grill. Door code in check-in message. |
| pool | Your private pool & spa (this villa). Same rules: no glass, supervise kids, spa heater ~30 min. |

### Beach Haven (solo, Beach Street / Indialantic)
| slug | delta |
|------|--------|
| arrive | Welcome to **Beach Haven**, Indialantic — part of The Havens at Beach Street. Door code in check-in message. Beach ~two-minute walk; downtown Melbourne close. |
| beach | Same Beach Street beach note (short walk, not Dunes boardwalk). |
| pool | Your private heated pool, spa, and grill at Beach Haven. |

### Sea Haven (solo, Beach Street / Indialantic)
| slug | delta |
|------|--------|
| arrive | Welcome to **Sea Haven**, Indialantic — part of The Havens at Beach Street. Door code in check-in message. Beach ~two-minute walk. |
| beach | Same Beach Street beach note. |
| pool | Your private heated pool, spa, and grill at Sea Haven. |

---

## 3. Launch-alert edge cases (1.8) — scrub / delay

Placeholders same as cycle 4 §5: `{{guest_first_name}}` `{{property_name}}` `{{launch_name}}` `{{net_local}}` `{{status}}` `{{portal_url}}` `{{unsubscribe_url}}` `{{new_net_local}}`

### Email — SCRUB (after T-24h already sent)
**Subject:** `Update: {{launch_name}} is off the board`

```
Hi {{guest_first_name}},

Quick update: {{launch_name}} is no longer going as previously scheduled (status: {{status}}).

No need to plan around a window tonight. We'll only ping again if a new firm opportunity shows up during your stay.

Live board: {{portal_url}}

— The Florida Havens
Unsubscribe: {{unsubscribe_url}}
```

### Email — DELAY / HOLD (window slips)
**Subject:** `Update: {{launch_name}} moved — new window {{new_net_local}}`

```
Hi {{guest_first_name}},

{{launch_name}} slipped. New no-earlier-than (local): {{new_net_local}} (status: {{status}}).

Schedules change — treat this as best-effort. We'll send another note only if it moves again or scrubs.

Portal: {{portal_url}}

— The Florida Havens
Unsubscribe: {{unsubscribe_url}}
```

### SMS — SCRUB (≤160)
```
FH: {{launch_name}} scrubbed/off. No beach window tonight. {{portal_url}}
```

### SMS — DELAY
```
FH: {{launch_name}} delayed → ~{{new_net_local}}. Updates: {{portal_url}}
```

**Pipeline rules (Claude):**  
- Never send scrub/delay unless a prior opt-in alert for that launch was sent.  
- Quiet hours still apply for SMS.  
- Prefer one scrub message over a chain of micro-updates.

---

## 4. Claude seed checklist

- [ ] Clone Dunes sections → Beach Street property_id; apply §1 overwrites  
- [ ] Apply §2 solo villa overwrites per listing  
- [ ] Wire §3 scrub/delay into 1.8 sender next to T-24h / T-1h  
- [ ] Do **not** invent exact Beach Street street numbers — leave Devin TBD or CMS edit  

---

## 5. Devin one-liner (only blockers that unblock multi-property seed perfection)

Beach Street / Beach / Sea **street addresses + parking notes** if different from “Indialantic driveway.” Everything else can ship without waiting.
