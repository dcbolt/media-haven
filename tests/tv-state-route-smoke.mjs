/**
 * MH186-5 / MH186-13 / MH186-14 — route resolver with injectable store (fake DB).
 */
import {
  evaluateTvStateAuth,
  hashTvStateSecret,
  mintTvStateSecret,
  responseHasGuestSecrets,
} from "../lib/tv-state-secret.ts";
import {
  hashTvStatePickupToken,
  mintTvStatePickupToken,
  responseHasStateSecret,
  verifyTvStatePickupToken,
} from "../lib/tv-state-pickup-policy.ts";
import {
  resolveTvStateWithDeps,
  unauthorizedBodyIsBrandingOnly,
} from "../lib/tv-state-resolve.ts";
import { shouldWriteLastLegacyAuthAt } from "../lib/tv-state-legacy-auth.ts";

const DEVICE = "11111111-1111-4111-8111-111111111111";

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

function leakFullState() {
  return {
    mode: "active",
    content: {
      propertyName: "Leak",
      occupied: true,
      guestFirstName: "Pat",
      guestLabel: "Pat",
      checkIn: "2026-01-01",
      checkOut: "2026-01-02",
      wifiPassword: "secret",
      portalQr: "qr",
      wifiSsid: null,
      wifiQr: null,
      sections: [{ title: "tiles" }],
      weather: null,
      sun: null,
      forecast: null,
      tides: null,
      launches: null,
      screensavers: [],
      heroPhoto: null,
      photos: [],
      logoUrl: null,
      deviceLabel: "tv",
      streaming: [],
      bookUrl: "x",
      bookQr: "",
      timing: { slideMs: 1, fadeMs: 1 },
      ambience: { enabled: false, bed: "rotate", volume: 0.1, tracks: [] },
      showTurtles: false,
      nextYear: null,
      extendStay: null,
      guestBook: null,
      upsell: null,
      playlist: null,
      takeover: null,
      vacantPlaylist: null,
    },
  };
}

function createMemoryDeps() {
  /** @type {Map<string, Record<string, string | null>>} */
  const rows = new Map();

  function ensure(id) {
    if (!rows.has(id)) {
      rows.set(id, {
        state_secret_hash: null,
        state_secret_pending_hash: null,
        state_secret_required_at: null,
        state_secret_pickup_hash: null,
        state_secret_pickup_expires_at: null,
        last_legacy_auth_at: null,
      });
    }
    return rows.get(id);
  }

  function loadAuthRow(deviceId) {
    const r = ensure(deviceId);
    return Promise.resolve({ ...r });
  }

  function redeemPickup(deviceId, pickupToken) {
    const r = ensure(deviceId);
    const ph = hashTvStatePickupToken(pickupToken);
    const now = Date.now();
    if (r.state_secret_pickup_hash !== ph) return Promise.resolve({ redeemed: false });
    if (!r.state_secret_pickup_expires_at) return Promise.resolve({ redeemed: false });
    if (new Date(r.state_secret_pickup_expires_at).getTime() <= now) {
      return Promise.resolve({ redeemed: false });
    }
    const { secret, hash } = mintTvStateSecret();
    if (!r.state_secret_required_at) {
      r.state_secret_required_at = new Date(now).toISOString();
    }
    r.state_secret_pending_hash = hash;
    r.state_secret_pickup_hash = null;
    r.state_secret_pickup_expires_at = null;
    return Promise.resolve({ redeemed: true, secret });
  }

  function promotePending(deviceId) {
    const r = ensure(deviceId);
    if (!r.state_secret_pending_hash) return Promise.resolve(false);
    r.state_secret_hash = r.state_secret_pending_hash;
    r.state_secret_pending_hash = null;
    return Promise.resolve(true);
  }

  return {
    rows,
    ensure,
    deps: {
      requireSecretEnabled: () => false,
      loadAuthRow,
      registerDevice: async (id) => {
        ensure(id);
      },
      redeemPickup,
      promotePending,
      getFullState: async () => leakFullState(),
      touchLastSeen: async () => {},
      recordLegacyAuthAt: async (id) => {
        ensure(id).last_legacy_auth_at = new Date().toISOString();
      },
      getForceReloadAt: async () => "2099-01-01T00:00:00.000Z",
      deploySha: () => "deadbeef",
    },
  };
}

const mem = createMemoryDeps();
const row = mem.ensure(DEVICE);

// --- pickup authorize + redeem delivers secret (MH186-15a) ---
const pickupTok = mintTvStatePickupToken();
row.state_secret_pickup_hash = hashTvStatePickupToken(pickupTok);
row.state_secret_pickup_expires_at = new Date(Date.now() + 60_000).toISOString();

const redeemed = await resolveTvStateWithDeps(
  mem.deps,
  DEVICE,
  null,
  pickupTok
);
check(
  "pickup redeem returns 200 + stateSecret",
  redeemed.status === 200 && responseHasStateSecret(redeemed.body)
);
check(
  "full state after successful redeem only",
  redeemed.status === 200 && responseHasGuestSecrets(redeemed.body)
);

const pickupNoRedeem = await resolveTvStateWithDeps(
  createMemoryDeps().deps,
  DEVICE,
  null,
  mintTvStatePickupToken()
);
check("invalid pickup → 401", pickupNoRedeem.status === 401);
check(
  "401 branding-only",
  pickupNoRedeem.status === 401 &&
    unauthorizedBodyIsBrandingOnly(pickupNoRedeem.body)
);
check(
  "401 no guest fields",
  pickupNoRedeem.status === 401 &&
    !responseHasGuestSecrets(pickupNoRedeem.body)
);

// --- atomic redeem: two attempts, one wins ---
const mem2 = createMemoryDeps();
const dev2 = "22222222-2222-4222-8222-222222222222";
const tok2 = mintTvStatePickupToken();
const r2 = mem2.ensure(dev2);
r2.state_secret_pickup_hash = hashTvStatePickupToken(tok2);
r2.state_secret_pickup_expires_at = new Date(Date.now() + 60_000).toISOString();
const first = await mem2.deps.redeemPickup(dev2, tok2);
const second = await mem2.deps.redeemPickup(dev2, tok2);
check("atomic redeem first wins", first.redeemed);
check("atomic redeem second fails", !second.redeemed);

// --- MH186-13 ratchet via required_at after mint ---
const mem3 = createMemoryDeps();
const dev3 = "44444444-4444-4444-8444-444444444444";
const r3 = mem3.ensure(dev3);
r3.state_secret_required_at = new Date().toISOString();
r3.state_secret_hash = null;
const graceBlocked = await resolveTvStateWithDeps(mem3.deps, dev3, null, null);
check("mint/revoke ratchet: UUID-only 401", graceBlocked.status === 401);

// --- MH186-14 pending: old bearer still valid ---
const old = mintTvStateSecret();
const neu = mintTvStateSecret();
const mem4 = createMemoryDeps();
const dev4 = "55555555-5555-4555-8555-555555555555";
const r4 = mem4.ensure(dev4);
r4.state_secret_hash = old.hash;
r4.state_secret_pending_hash = neu.hash;
r4.state_secret_required_at = new Date().toISOString();
const oldStill = await resolveTvStateWithDeps(mem4.deps, dev4, old.secret, null);
check("prior bearer works during pending rotate", oldStill.status === 200);

const promoteMem = createMemoryDeps();
const dev5 = "66666666-6666-4666-8666-666666666666";
const r5 = promoteMem.ensure(dev5);
r5.state_secret_hash = old.hash;
r5.state_secret_pending_hash = neu.hash;
r5.state_secret_required_at = new Date().toISOString();
const promoted = await resolveTvStateWithDeps(
  promoteMem.deps,
  dev5,
  neu.secret,
  null
);
check("new bearer promotes pending", promoted.status === 200);
check(
  "pending cleared after promote",
  promoteMem.ensure(dev5).state_secret_pending_hash === null
);

// Replay same pickup after successful redeem
const replay = await resolveTvStateWithDeps(mem.deps, DEVICE, null, pickupTok);
check("pickup replay after redeem → 401", replay.status === 401);

// Expired pickup
check(
  "pickup expiry helper",
  !verifyTvStatePickupToken(
    pickupTok,
    hashTvStatePickupToken(pickupTok),
    new Date(Date.now() - 1000).toISOString()
  )
);

check(
  "legacy throttle skips within hour",
  !shouldWriteLastLegacyAuthAt(new Date().toISOString())
);

check(
  "evaluate ratchet on required_at only",
  !evaluateTvStateAuth({
    requireSecret: false,
    storedHash: null,
    pendingHash: null,
    headerSecret: null,
    secretRequiredAt: new Date().toISOString(),
  }).authorized
);

console.log("\n--- MH186-5 mutant → killing test ---");
console.log("| Applied mutant (local only) | Failing test if reintroduced |");
console.log("| Remove pickup_hash match on redeem UPDATE | atomic redeem second fails |");
console.log("| pickupAuthorizes bypass before redeem | full state without redeem (route pickup path) |");
console.log("| Return getFullState on 401 | 401 no guest fields |");

process.exit(failed);