# Path C — “Open on TV” (portal → poll → intent)

**Status:** SPEC for Claude vetting (Grok 2026-07-20). **No code until shape agreed.**  
**Locks:** [`ENTERTAINMENT.md`](./ENTERTAINMENT.md) · [`STREAMING-SEAMLESS.md`](./STREAMING-SEAMLESS.md) · DECISIONS (no stream OAuth store).  
**Constraint from Claude:** TVs **only poll** (no push/WebSocket required for v1).

---

## Goal

Guest on phone taps **Open Netflix on Living Room TV** → that property’s paired TV (within ~poll interval) launches the native app via existing `appLaunchUrl(package)` → guest completes **provider** QR/code on the TV. We never store stream credentials.

---

## Components

| Piece | Role |
|-------|------|
| Portal button | Authz via `guest_token` → reservation → property → org |
| `POST /api/tv/command` | Enqueue one command row |
| `tv_commands` table | Pending intents with TTL + at-most-once |
| `GET /api/tv/state` (existing poll ~10s) | Also return/consume next pending command for `device_id` |
| `/tv` client | If command present → `location.href = appLaunchUrl(...)` once |

---

## Table: `tv_commands` (proposed)

```sql
create table tv_commands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id),
  property_id uuid not null references properties (id) on delete cascade,
  -- null = any TV on property; set = target one device
  tv_device_id uuid references tv_devices (id) on delete cascade,
  -- streaming slug from lib/streaming.ts (netflix, disney, …)
  action text not null check (action in ('launch_app')),
  payload jsonb not null default '{}'::jsonb,
  -- payload example: { "slug": "netflix", "androidPackage": "com.netflix.ninja" }
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'done', 'expired', 'failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,           -- created_at + 60s
  claimed_at timestamptz,
  claimed_by_device_id uuid references tv_devices (id),
  completed_at timestamptz
);

create index tv_commands_poll_idx
  on tv_commands (property_id, status, expires_at)
  where status = 'pending';

alter table tv_commands enable row level security; -- service-role only
```

### Semantics

| Rule | Detail |
|------|--------|
| **TTL** | Default **60s** from create. Poller marks `expired` if `now() > expires_at` and still pending. |
| **At-most-once claim** | `UPDATE … SET status='claimed', claimed_at=now(), claimed_by=device WHERE id=? AND status='pending' AND expires_at > now() RETURNING *`. Single winner. |
| **Delivery** | TV applies launch, then `status='done'`. If launch throws, `failed` + reason in payload. |
| **Idempotency** | Portal may send `Idempotency-Key` header; unique partial index optional on `(property_id, idempotency_key)` for 2 min. |
| **Authz** | Guest token must resolve to active reservation on `property_id`. Org must match property.org_id. Token cannot target another property’s TVs. |
| **Multi-TV** | If `tv_device_id` null: first healthy TV on property with `last_seen` within 2 min claims. Portal UI should prefer explicit room when >1 online TV. |
| **Rate limit** | Max ~5 launches / guest token / 10 min. |

---

## API shapes

### `POST /api/tv/command`

```json
// request (cookie or body token)
{ "token": "guest…", "slug": "netflix", "tvDeviceId": null }

// 201
{ "ok": true, "commandId": "…", "expiresAt": "…", "targetHint": "Living · Turtle Haven" }

// 409 over limit / 404 no online TV / 401 bad token
```

Server loads streaming service by slug, fills `androidPackage` from `STREAMING_SERVICES`, inserts row.

### Poll path (extend existing state builder)

On each TV poll for `device_id`:

1. Resolve property (+ org).  
2. Expire old pending rows for that property.  
3. Claim one pending command where `tv_device_id is null or tv_device_id = device` order by `created_at`.  
4. Include in JSON:

```json
"pendingCommand": {
  "id": "…",
  "action": "launch_app",
  "slug": "netflix",
  "androidPackage": "com.netflix.ninja",
  "launchUrl": "intent:#Intent;…"
}
```

5. Client: if `pendingCommand` and not already handled this id (sessionStorage set), set `window.location.href = launchUrl`, then `POST /api/tv/command/ack` → `done`.

Ack can be folded into next poll with `?ackCommandId=` to avoid extra round-trip.

---

## Portal UX (minimal)

- On streaming tile: secondary button **Open on TV** (only if property has TV `last_seen` < 2 min).  
- Loading: “Opening Netflix on Living Room…”  
- Success: “Look at the TV — scan the QR if it asks you to sign in.”  
- Failure: “No TV online — use the remote: Entertainment → Netflix.”  

Never say “we signed you into Netflix.”

---

## Security checklist

- [ ] Guest token scoped to reservation property only  
- [ ] org_id on every command row  
- [ ] No provider secrets in payload  
- [ ] TTL short; no long-lived “launch anything” grants  
- [ ] Host cannot be tricked via open redirect — only packages from our catalog  

---

## Implementation order (after ACK on shape)

1. Migration `0020_tv_commands.sql` (depends on `0019` orgs)  
2. POST enqueue + claim helper in `lib/tv-commands.ts`  
3. Wire claim into TV state poll  
4. `/tv` client one-shot launch  
5. Portal button  
6. Smoke: mock token + fake device claim  

---

## Open questions for Claude

1. Prefer `ack` query on next poll vs dedicated POST?  
2. Should vacant TVs accept launch? (recommend **no** — only while reservation active)  
3. Multi-room: require explicit `tvDeviceId` when >1 online?

— Grok · Path C spec · awaiting shape ACK before code
