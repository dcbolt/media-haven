# media-haven — Dual-mode architecture (internal → multi-tenant SaaS)

**Status:** CANONICAL product strategy + engineering constraints (Grok / Devin 2026-07-20)  
**Primary goal:** Build and dogfood for **The Florida Havens** (internal).  
**Secondary goal:** Package the same product as **multi-tenant SaaS** (license endpoints, customer portal, media libraries, multi-PMS).  
**Does not reopen:** hardware / streaming locks in [`DECISIONS.md`](./DECISIONS.md) · [`ENTERTAINMENT.md`](./ENTERTAINMENT.md) · [`HARDWARE-STANDARD.md`](./HARDWARE-STANDARD.md).

---

## North star

```
                    ┌─────────────────────────────────────┐
                    │         media-haven platform        │
                    │  (one codebase · multi-tenant core) │
                    └─────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
 ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
 │ Tenant: Florida │       │ Tenant: Customer│       │ Tenant: …       │
 │ Havens (zero)   │       │ B (SaaS)        │       │                 │
 │ dogfood / truth │       │ paid seats      │       │                 │
 └─────────────────┘       └─────────────────┘       └─────────────────┘
          │                           │
          ▼                           ▼
   Guests + TVs + Host          Same product surfaces
   thefloridahavens.com         customer branding + PMS
```

| Priority | Goal | Metric |
|----------|------|--------|
| **P0** | FH works end-to-end on live villas | OTA→direct, 5★, zero stream/Wi‑Fi tickets |
| **P1** | Same code path serves N orgs safely | Isolation tests, no cross-tenant data |
| **P2** | Bill + self-serve onboarding | MRR, properties/TVs licensed, churn |

**Rule:** Florida Havens is **Tenant Zero**, not a fork. Features ship if they help FH **or** cleanly generalize. Never hardcode “only one operator forever” in schema or auth.

---

## What we sell (SaaS packaging later)

### Billable units (license structure — v1 draft)

| Unit | Definition | Why |
|------|------------|-----|
| **Org (account)** | Paying customer / operator | Root tenant |
| **Property** | One listing / villa | Maps to PMS listing |
| **TV endpoint** | One paired `tv_devices` row (active last 30d) | Core cost + value |
| **Guest portal** | Included per property (or metered active tokens) | Default included |
| **Media library storage** | GB stored (Blob / Supabase storage) | Real cost |
| **PMS connection** | Guesty / Hostfully / … OAuth app link | Integration value |
| **Seats (host users)** | Dashboard logins | Optional later |

**Pricing psychology (attack WelcomeScreen):**  
Charge for **TVs + properties**, not generic “Pro templates.” Optional storage tiers. **No forced ad/Viator marketplace** as core monetization — optional partner modules later.

### Customer-facing portals (SaaS)

| Surface | Audience | Purpose |
|---------|----------|---------|
| **Marketing site** | Prospects | Pricing, demo |
| **Customer / billing portal** | Org owner | Plan, invoices, licenses, cancel |
| **Operator host dashboard** | Cleaners / hosts / owners | Same as `/host` today, tenant-scoped |
| **Guest portal + TV** | Guests | Unchanged product surfaces |
| **Admin (DCBolt)** | Us | Impersonate tenant, support, feature flags |

Today’s `/host` **becomes** the operator dashboard for every tenant. Billing UI can be Stripe Customer Portal + thin app pages.

---

## Domain model (target)

```
orgs
  id, name, slug, plan_id, status, branding_json, created_at

org_members
  org_id, user_id, role (owner|admin|host|viewer)

licenses / subscriptions
  org_id, stripe_customer_id, stripe_subscription_id
  max_properties, max_tvs, max_storage_gb, features_json

pms_connections
  org_id, provider (guesty|hostfully|…), credentials_ref, status, last_sync_at

properties
  id, org_id  ← REQUIRED for SaaS
  external_id (PMS listing id), name, media…, settings

reservations
  property_id → org via property
  external_id, guest_*, dates

guest_tokens, tv_devices, property_sections, media_assets
  all reachable → org_id (column or join)

usage_events  (optional metering)
  org_id, kind (tv_heartbeat|portal_open|media_bytes|api_call), qty, at
```

### Current state → migration path

| Today | Tomorrow |
|-------|----------|
| Single implicit org (all rows) | `orgs` + `properties.org_id` |
| `guesty_id` on property | `pms_connections` + `external_id` + provider |
| Singleton `guesty_tokens` | **Per-connection** token cache |
| Host auth = shared code / Google allowlist | Org members + invite |
| Service-role only RLS | Still service-role OK, but **every query filters `org_id`** |
| Media under global prefixes | `orgs/{orgId}/properties/{propertyId}/…` |

**Bootstrap:** One migration creates `orgs` row **“Florida Havens”** (`slug=florida-havens`) and backfills `org_id` on all existing tables. Zero product downtime.

---

## Engineering non-negotiables (start now)

Even before multi-tenant UI ships, **all new code** must:

1. **Resolve tenant context** at the edge of every request  
   - Guest token → reservation → property → `org_id`  
   - TV device → property → `org_id`  
   - Host session → `org_id` (+ membership)  
   - Cron/webhook → connection → `org_id`

2. **Never query without org scope** once `org_id` exists  
   Helper: `withOrg(orgId).from('properties')…`  
   Forbid `select * from properties` without filter in app code.

3. **PMS behind an interface**  
   ```ts
   interface PmsAdapter {
     provider: 'guesty' | 'hostfully' | string;
     syncListings(conn): Promise<void>;
     syncReservations(conn): Promise<void>;
     // token cache is per connection
   }
   ```  
   `lib/guesty.ts` becomes `lib/pms/guesty.ts` implementing the adapter. Hostfully = second adapter. Mock adapter for demos.

4. **Media libraries are tenant-owned**  
   Paths: `org/{orgId}/shared/…` and `org/{orgId}/property/{propertyId}/…`  
   Quota check before upload (license `max_storage_gb`).

5. **Billable endpoint registry**  
   Every pairable TV, property create, and PMS connection writes/reads license limits. Soft block + upgrade CTA when over limit.

6. **Feature flags per org**  
   `orgs.features` or `licenses.features_json` — FH can enable experimental panels without shipping to all SaaS customers.

7. **Branding per org**  
   Logo, colors, book-direct base URL, support email — no hardcode `thefloridahavens.com` without fallback from org settings (FH values = defaults for tenant zero).

8. **Secrets isolation**  
   PMS client secrets in env **or** per-connection encrypted vault; never one global Guesty key for all SaaS customers in production multi-tenant mode.

9. **Observability**  
   Logs/metrics tagged `org_id`. Support can filter one tenant.

10. **Dogfood first**  
    SaaS admin features that FH doesn’t need wait; isolation and `org_id` plumbing do **not** wait.

---

## Licensing & metering (implementation sketch)

### Plans (illustrative — not final pricing)

| Plan | Properties | TVs | Storage | PMS |
|------|------------|-----|---------|-----|
| Starter | 1–3 | 3 | 5 GB | 1 connection |
| Growth | 10 | 20 | 50 GB | 2 providers |
| Portfolio | custom | custom | custom | multi |

### Enforcement points

| Action | Check |
|--------|--------|
| Claim TV to property | `count(tv_devices active in org) < max_tvs` |
| Create / sync property | `count(properties) < max_properties` |
| Upload media | `sum(bytes) < max_storage_gb` |
| Add PMS connection | plan allows provider |
| API abuse | rate limit per `org_id` |

### Stripe (later)

- Customer + Subscription on `org`  
- Webhooks update `licenses`  
- Customer Portal for payment methods / cancel  
- Usage-based overage optional (storage)

Do **not** block FH ship on Stripe. Stub `LicenseService.allow(orgId, 'claim_tv')` → always true for tenant zero until billing ships.

---

## Customer portal modules (SaaS backlog)

| Module | Priority after FH dogfood | Notes |
|--------|---------------------------|--------|
| Signup / invite members | High | Auth (Supabase Auth or Clerk) |
| Connect Guesty | High | OAuth app per env; per-org tokens |
| Connect Hostfully | Medium | Same adapter interface |
| Media library UI | High | Already half-built as `/host/media` — scope to org |
| License & billing | Medium | Stripe |
| Domain / custom book URL | Medium | Org branding |
| White-label guest domain | Low | `guide.customer.com` |
| Usage dashboard | Medium | TVs online, portal opens |
| DCBolt super-admin | Medium | Support impersonation |

---

## API / surface map (tenant-aware)

| Surface | Tenant resolution |
|---------|-------------------|
| `GET /tv?device=` | device → property → org |
| `GET /welcome?token=` | token → reservation → property → org |
| `/host/*` | session user → org_members |
| `/api/guesty/*` | → `/api/pms/[provider]/*` + connection.org_id |
| `/api/media/upload` | host session org + quota |
| Webhooks | provider signature → connection → org |
| Cron sync | iterate connections, not global Guesty only |

---

## Phased delivery

### Phase A — Tenant Zero plumbing (do while shipping FH Phase 1)

- Migration: `orgs`, `org_id` on properties (+ backfill FH)  
- `lib/tenant.ts`: `getFloridaHavensOrg()`, `requireOrgFromHost()`, `requireOrgFromGuestToken()`  
- Guesty client accepts `connectionId` (default = FH connection)  
- Media paths prefix with `orgId` (migrate existing blobs lazily or rewrite)  
- **No** multi-tenant signup UI yet  

### Phase B — Hardening isolation

- Integration tests: two fake orgs cannot read each other’s properties/TVs  
- Host auth = real users + org_members (replace shared `demo` code)  
- Per-org feature flags  

### Phase C — SaaS packaging

- Stripe plans + Customer Portal  
- Signup funnel  
- Hostfully adapter  
- Marketing site  

### Phase D — Scale

- Custom domains, SSO, reseller, usage-based storage  

**FH Phase 1 product work (tides, last-night CTA, heartbeats) continues in parallel** and must use tenant helpers once they exist.

---

## What not to do

| Anti-pattern | Why |
|--------------|-----|
| Second repo “media-haven-saas” | Divergence kills dogfood |
| Hardcode Florida Havens in every string | Blocks resale |
| Global Guesty token for all customers | Security + rate limits |
| Billing before isolation | Can’t charge safely |
| Ad/Viator-first monetization | Strategy conflict with DECISIONS |
| Skip `org_id` “until later” on new tables | Retrofit cost explodes |

---

## Agent rules

1. New tables: include `org_id` (or FK chain that reaches org) from day one.  
2. New host APIs: authorize via org membership.  
3. New PMS code: implement `PmsAdapter`, not more Guesty-only globals.  
4. Copy/branding: read from org settings with FH defaults.  
5. When unsure: implement for **multi-tenant**, configure **one tenant** (FH).  

---

## Related docs

| Doc | Relationship |
|-----|----------------|
| [`DECISIONS.md`](./DECISIONS.md) | Hardware/streaming lock; product goals for FH |
| [`ROADMAP.md`](./ROADMAP.md) | FH competitive phases; SaaS is **packaging layer** on top |
| [`HARDWARE-STANDARD.md`](./HARDWARE-STANDARD.md) | Same streamer story for every tenant |
| [`STREAMING-SEAMLESS.md`](./STREAMING-SEAMLESS.md) | Guest entertainment UX (tenant-agnostic) |
| [`GROK.md`](./GROK.md) | Agent log |

---

## History

| Date | Note |
|------|------|
| 2026-07-20 | Devin: primary = internal FH; secondary = multi-tenant SaaS with licensing, portal, media libraries, multi-PMS. Grok documents architecture. |
