# Grok Cycle 4 content pack — for Claude seed / 1.8 pipeline

**Delivered:** 2026-07-17 · Agent: Grok · Tasks from `GROK_PROJECT_STATE` “Tasks for Grok (cycle 4)”  
**Source note:** `thefloridahavens.com/dunes-guide-book` is Wix-blocked for scrapers. Corpus below expands existing demo sections + host-known property facts + public Space Coast dining/attractions. Host should paste any verbatim guidebook wording that differs.

Claude can seed `property_sections` from §1–3 same-session; use §5 copy for launch-alert pipeline (1.8).

---

## 1. Dunes guidebook corpus (`property_sections`)

Shape: `{ slug, title, body, category: "general"|"dining"|"nearby"|null, show_on_tv }`

| slug | title | category | TV | body |
|------|-------|----------|----|------|
| arrive | When You Arrive | general | yes | Welcome to The Havens at The Dunes, 4225 & 4227 S Hwy A1A, Melbourne Beach. Park in the driveway and leave the street clear. Your door code is in your check-in message. Take a breath — the private beach walkover is steps away. |
| rules | House Rules | general | yes | No smoking on the property. No parties or events. Quiet hours after 10 PM — year-round neighbors share this coast. Pets only by prior arrangement. Barrier island rule: everything you take to the beach comes back with you. |
| beach | The Beach | general | yes | Your private walkover leads straight onto the sand. Rinse feet and gear at the outdoor shower before coming inside. Watch for rip currents — yellow flag means swim with caution near a lifeguard; red means stay out. Beach chairs and umbrellas are in the garage. |
| turtles | Sea Turtles | general | yes | This stretch is part of the Archie Carr National Wildlife Refuge — among the most important loggerhead nesting beaches in the world. Nesting season runs **March 1–October 31**. Lights out beachside after dark (close blinds; no white flashlights or phone lights on the sand). Never approach nesting turtles, nests, or hatchlings. Fill holes and remove chairs at night. Injured/disoriented turtle: **FWC 1-888-404-FWCC**. |
| launches | Rocket Launches | general | yes | You're on the Space Coast with front-row seats to Cape Canaveral and Kennedy Space Center. Watch from the beach or elevated decks for a clear view up the coast. Night launches are unforgettable. Schedules slip — use the in-app launch board and visitspacecoast.com/launches during your stay. |
| pool | The Pool & Spa | general | yes | The pool is serviced weekly. The spa heater takes about 30 minutes — switch is on the equipment panel by the pool. No glass on the pool deck. Supervise children at all times. |
| kitchen-grill | The Kitchen & Grill | general | no | The kitchen is fully stocked for cooking — help yourself to pantry staples. Gas grill is on the deck; spare propane is in the garage. Clean grates after use and close the tank valve. |
| wifi-tips | Wi-Fi & Casting | general | yes | Join the guest network on the Wi-Fi slide (or portal). Phone and streamers must share the same Wi-Fi — turn off VPN for casting. Cast target is named by room on the house TV. Prefer your own accounts on the Shield / Google TV (press Home). |
| emergency | Emergency & Contacts | general | yes | Life-threatening emergency: **911**. FWC wildlife (turtles, etc.): **1-888-404-FWCC**. Non-urgent host questions: use the number in your check-in message. Nearest ER and pharmacy: host can text directions on request. |
| leave | Before You Leave | general | yes | Check-out is **10:00 AM** unless late checkout was approved. Start the dishwasher, bag trash to outdoor bins, leave used towels in the laundry, lock all doors and sliders, and sign out of streaming apps on house TVs. Text us when you're on the road — safe travels. |
| food | Food & Dining | dining | yes | See the Dining shortlist on your phone portal for full picks. Quick hits: Southern Sisters (breakfast), Sand on the Beach (toes-in-the-sand), Djon's (steak & lobster night out). Publix is ~10 minutes north for groceries. |
| activities | Activities & Attractions | nearby | yes | Sebastian Inlet (~15–20 min) for surf and fishing. Barrier Island Center / Archie Carr for turtle education (walks book ahead in season). Kennedy Space Center ~45–60 min north. Downtown Melbourne and Eau Gallie for shops and nightlife. |

**Seed tip:** category `null` or `general` → Guidebook browser; `dining` / `nearby` power those TV filters when labeled.

---

## 2. Dining shortlist (Melbourne Beach / Indialantic / Melbourne)

Guest-ready blurbs (1–2 sentences). Prefer phone portal + guidebook dining category.

1. **Southern Sisters** — Local breakfast favorite; get there early on weekends.  
2. **Sand on the Beach** — Casual oceanfront dining with toes-in-the-sand energy.  
3. **Djon's Steak & Lobster House** — Classic night-out steakhouse for a special evening.  
4. **Ocean 302** — Elevated coastal plates; good date-night pick in Indialantic.  
5. **Matt's Casbah** — Fun, lively spot for dinner when you want more buzz than beach quiet.  
6. **El Ambia Cubano** — Hearty Cuban comfort food; solid lunch after a morning on the sand.  
7. **Long Doggers** — Casual local chain for quick beach-day burgers and dogs.  
8. **Squid Lips** — Waterfront seafood and sunset views on the Indian River (short drive).  
9. **Meg O'Malley's** — Downtown Melbourne pub fare when you want historic-district energy.  
10. **Publix (A1A / US-1)** — Full grocery run ~10 minutes; sushi and deli for easy villa dinners.

*Host should confirm hours/reservations seasonally — blurbs avoid claiming “best rates” or specific prices.*

---

## 3. Nearby attractions shortlist

1. **Sebastian Inlet State Park** (~20 min) — World-class surf, fishing jetties, and a wilder stretch of coast.  
2. **Barrier Island Center** — Best intro to Archie Carr turtles and barrier-island ecology; book guided walks in season.  
3. **Kennedy Space Center Visitor Complex** (~45–60 min) — Full day of rockets, history, and launch lore.  
4. **Port Canaveral** (~45 min) — Cruises, seafood, and pre/post-cruise beach days.  
5. **Historic Downtown Melbourne** — Walkable dining, shops, and nightlife a short drive inland.  
6. **Eau Gallie Arts District** — Galleries, murals, and a calmer evening stroll.  
7. **Brevard Zoo** (~20–25 min) — Family-friendly kayaking habitats and giraffe feedings.  
8. **USSSA Space Coast Complex** (~20 min) — Tournament hub if you're here for ball.  
9. **Paradise Beach / local public accesses** — Extra stretch of sand when you want a change of scene.  
10. **Indian River Lagoon boat day** — Rent or charter for dolphin watching and sunset on the water.

---

## 4. Turtle engine fact-check (`lib/turtles.ts`)

| Claim in code | Assessment | Action |
|---------------|------------|--------|
| Archie Carr = major loggerhead nesting beach | **Correct** (FWS: among most significant loggerhead sites worldwide) | Keep |
| Species: loggerhead, green, leatherback | **Correct** for this coast | Keep |
| Phases: Mar–Apr early, May–Jun nesting, Jul–Aug nest+hatch, Sep–Oct hatch, else off | **Aligned** with Space Coast season **Mar 1 – Oct 31** | Keep |
| ~60 day incubation / night emergence | **Correct** | Keep |
| Lights disorient hatchlings | **Correct** (FWC lighting guidance) | Keep |
| Rules: lights out after 9 PM, no approach, fill holes, remove gear, FWC line | **Correct tone**; FWC main line **1-888-404-FWCC** matches | Keep |
| Static guide section says “May through October” only | **Slightly narrow** vs Mar 1 start for leatherbacks / Atlantic season | **Nudge:** align static `turtles` section body to **March–October** (done in §1 above) |
| Melbourne Beach ordinance / “lights out” | Local rules often **9 PM–5 AM** style restrictions during season | Optional: add “close ocean-facing blinds” (already in rules) |

**Verdict:** Engine is guest-safe and scientifically sound. No code change required for phase windows; prefer static copy Mar–Oct for consistency with Visit Space Coast / FWC season framing.

---

## 5. Launch-alert templates (Phase 1.8)

Placeholders: `{{guest_first_name}}` `{{property_name}}` `{{launch_name}}` `{{net_local}}` `{{status}}` `{{portal_url}}` `{{unsubscribe_url}}`

### Email — T-24h (subject)
`Rocket watch tomorrow from {{property_name}}`

### Email — T-24h (body)
```
Hi {{guest_first_name}},

A launch is currently scheduled for tomorrow from the Cape — often visible from the beach at {{property_name}}.

• Mission: {{launch_name}}
• Window (local): {{net_local}}
• Status: {{status}}

Schedules slip. For the latest, open your stay portal: {{portal_url}}

Watch tip: ocean-facing deck or the sand, phone lights low if it's turtle season.

— The Florida Havens
Unsubscribe: {{unsubscribe_url}}
```

### Email — T-1h (subject)
`Launch window opening soon — {{property_name}}`

### Email — T-1h (body)
```
Hi {{guest_first_name}},

T-minus about an hour for {{launch_name}} ({{net_local}} local · {{status}}).

If the sky is clear, step outside — Melbourne Beach often gets a clean view up the coast.

Live details: {{portal_url}}

— The Florida Havens
Unsubscribe: {{unsubscribe_url}}
```

### SMS — T-24h (≤160 chars ideal)
```
FH: Launch tomorrow ~{{net_local}} ({{launch_name}}). Watch from {{property_name}} beach. Updates: {{portal_url}}
```

### SMS — T-1h
```
FH: Launch window ~now ({{launch_name}}). Look north from the beach/deck. {{portal_url}}
```

**Pipeline notes for Claude:** only send if `guest_subscribers` opted in; respect quiet hours for SMS (e.g. no T-1h texts 10 PM–8 AM local unless guest opted into night launches); never promise visibility — “often visible” only.

---

## 6. Competitive watch — WelcomeScreen (2026-07-17 re-scrape)

| Item | Status vs ROADMAP kill-table |
|------|------------------------------|
| Guidebook **$5.99**/listing/mo | Unchanged structure |
| TV **$9.99** · Pro **$14.99** (1–2 listings) | Unchanged; volume discounts still exist |
| Annual prepay options | Still marketed |
| AI trip planner / AI concierge | Still core marketing |
| Store / partner experiences · **~8%** activities | Still revenue path |
| PMS multi-vendor | Still breadth-first |
| Our edge | Own stack $0 SaaS tax · Guesty webhooks/minutes · never-blank · Shield path · Space Coast moat · direct rebook not Viator-first |

**No kill-table rewrite needed** — pricing/feature map still matches `docs/ROADMAP.md` (2026-07-17). Watch for Store upsell emphasis in guest UX (we still reject ad-first default).

---

## Hand-off checklist (Claude)

- [ ] Seed §1 rows into `property_sections` for Dunes (and clone categories for Beach Street with address swaps).  
- [ ] Optional: dining/nearby as individual section rows or CMS cards.  
- [ ] Align static turtles body to Mar–Oct if still “May–October” only.  
- [ ] Wire §5 templates into 1.8 sender.  
- [ ] No Grok code claim on 1.8 pipeline unless Claude requests assist.
