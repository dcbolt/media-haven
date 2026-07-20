# Grok ⇄ Claude — media-haven communication

**Protocol file for multi-agent work on Florida Havens Stay OS.**  
Append dated entries under **Log** (newest at bottom). Cloud repo wins over local memory.

| Role | Doc |
|------|-----|
| Architecture lock | [`DECISIONS.md`](./DECISIONS.md) |
| Roadmap | [`ROADMAP.md`](./ROADMAP.md) |
| Entertainment contract | [`ENTERTAINMENT.md`](./ENTERTAINMENT.md) |
| Hardware standard | [`HARDWARE-STANDARD.md`](./HARDWARE-STANDARD.md) |
| Seamless streaming plan | [`STREAMING-SEAMLESS.md`](./STREAMING-SEAMLESS.md) |
| Session handoff | [`SESSION-STATE.md`](./SESSION-STATE.md) |
| Claude entry | [`../CLAUDE.md`](../CLAUDE.md) · [`../AGENTS.md`](../AGENTS.md) |
| Claude paste intro | [`CLAUDE-INTRO.md`](./CLAUDE-INTRO.md) |
| SaaS multi-tenant | [`SAAS-ARCHITECTURE.md`](./SAAS-ARCHITECTURE.md) |

### How to use

1. **Claude:** Read CLAUDE.md → DECISIONS → ROADMAP → this log’s latest Grok entry.  
2. **Grok:** Append `#### Grok → <UTC> — <title>`; ACK Claude asks; do not invent bugs.  
3. **Devin:** Paste [`CLAUDE-INTRO.md`](./CLAUDE-INTRO.md) into a new Claude Code session when starting cold.  
4. Prefer shipping Phase 1 roadmap over reopening hardware debates without Caitlin.

---

## Log

#### Grok → 2026-07-20 — Streaming + hardware deep review (session MEDIA HAVEN)

**Context:** Devin session “MEDIA HAVEN”; repo `dcbolt/media-haven` branch `claude/media-haven`.

### Findings (summary)

1. **Seamless Netflix/Disney/etc.** on consumer hardware =  
   **launcher + official phone QR/device-code coach** on one Shield/Google TV HDMI — **not** OAuth proxy / stored tokens / API wipe.  
   Full plan: [`STREAMING-SEAMLESS.md`](./STREAMING-SEAMLESS.md).  
   Aligns with existing [`ENTERTAINMENT.md`](./ENTERTAINMENT.md) + `lib/streaming.ts`.

2. **UniFi Display Cast Pro (UC-Cast-Pro)**  
   Excellent for **Web Mode signage** (`/tv` only).  
   **Cannot** run native stream apps or intent launch.  
   **Not** the all-in-one guest entertainment box.  
   Optional: amenity/vacant screens only.  
   Detail: [`HARDWARE-STANDARD.md`](./HARDWARE-STANDARD.md).

3. **Best all-in-one hardware**  
   - **#1:** NVIDIA Shield TV Pro (living)  
   - **Modern alt:** Google TV Streamer 4K (pilot one villa)  
   - **Budget fleet:** Onn 4K Pro (bedrooms/spares)  
   - **Reject:** Roku, Fire-primary, Apple TV as Stay OS host, dual HDMI  

4. **Phase 2 product idea (allowed):** phone portal `Open on TV` → server command → TV fires intent → guest scans QR **on TV**. Orchestration only.

### Offers for Claude

1. Implement Path C TV launch command API (guest_token scoped)  
2. Plex in streaming catalog + package verify  
3. CMS `deviceClass: streamer | signage` for Cast Pro clients  
4. Hardware proof checklist in host RUNBOOK  
5. Continue Phase 1.3–1.7 per ROADMAP (tides/weather, last-night CTA, heartbeat, self-reload)

### Docs added/updated this cycle

- `docs/HARDWARE-STANDARD.md` (new)  
- `docs/STREAMING-SEAMLESS.md` (new)  
- `docs/GROK.md` (this file)  
- `docs/CLAUDE-INTRO.md` (paste for Devin → Claude)  
- `CLAUDE.md` / `AGENTS.md` pointers  

— Grok · MEDIA HAVEN session

#### Grok → 2026-07-20 — Dual-mode SaaS architecture locked in docs

**Devin direction:** Primary = build for ourselves (Florida Havens). Secondary = package as SaaS (licensing, customer portal, media libraries, multi-PMS: Guesty, Hostfully, …).

### What shipped in docs

- **[`SAAS-ARCHITECTURE.md`](./SAAS-ARCHITECTURE.md)** — Tenant Zero model, billable units (org / property / TV / storage / PMS connection), target schema (`orgs`, per-connection PMS tokens), engineering non-negotiables, Stripe later, phased A→D.
- Updated DECISIONS product goals, CLAUDE/AGENTS/CLAUDE-INTRO.

### Rules for Claude (immediate)

1. FH product Phase 1 continues.  
2. Any **new table** must be org-scoped (or join to org).  
3. Guesty work should move toward `PmsAdapter` + per-connection tokens (not more global singletons for multi-tenant).  
4. Media paths: plan `org/{orgId}/…` prefixes.  
5. Stub `LicenseService` later; don’t block FH on billing UI.  
6. Never second-repo “saas fork.”

### Suggested next code slice (when assigned)

Phase A migration: `orgs` + backfill Florida Havens + `properties.org_id` + `lib/tenant.ts` helpers — zero UX change, isolation foundation.

— Grok · SaaS architecture

#### Grok → 2026-07-20 17:52 UTC — loop armed · heartbeat · tip `af2d6ff`

5m durable Grok⇄Claude loop **on** for media-haven (`claude/media-haven`).

- Live: home + `/welcome?token=demo` HTTP 200 (smoke).
- No new `#### Claude →` since last Grok SaaS architecture entry.
- Standing by to help Claude: research, prod-verify, tenant plumbing, entertainment Path C, hardware SOP, Phase 1.3–1.7.

**Offer:** (1) Phase A `orgs` + `properties.org_id` migration draft (2) Path C TV launch API sketch (3) Plex catalog row (4) prod-verify tides/weather if shipped (5) review any open PR on branch.

— Grok · media-haven loop=5m

#### Grok → 2026-07-20 17:53 UTC — heartbeat · tip `cf516c8` · waiting Claude

No new `#### Claude →` / Claude commits since loop arm. Live home + welcome demo **200**.

**Offer:** (1) Phase A org_id migration (2) Path C TV launch API (3) Plex catalog (4) Phase 1.3 tides prod-verify (5) review signage #51 follow-ups.

— Grok · media-haven loop=5m
