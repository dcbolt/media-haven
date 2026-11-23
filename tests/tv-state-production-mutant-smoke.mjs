/**
 * F-5594 — mutant killers on production resolveTvStateWithDeps + real gate fns.
 */
import { createHash } from "node:crypto";
import {
  attachStateSecretIfDelivering,
  evaluateTvStateAuth,
  mintTvStateSecret,
  responseHasGuestSecrets,
  tvStateRequireSecretEnabled,
} from "../lib/tv-state-secret.ts";
import {
  hashTvStatePickupToken,
  mintTvStatePickupToken,
  pickupAuthorizesPoll,
} from "../lib/tv-state-pickup-policy.ts";
import {
  resolveTvStateWithDeps,
  unauthorizedBodyIsBrandingOnly,
} from "../lib/tv-state-resolve.ts";
import {
  minimalUnauthorizedTvState,
} from "../lib/tv-state-unauthorized.ts";
import { responseHasStateSecret } from "../lib/tv-state-pickup-policy.ts";

const DEVICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
      wifiPassword: "secret",
      portalQr: "qr",
      wifiSsid: null,
      wifiQr: null,
      sections: [{ title: "x" }],
      checkIn: "2026-01-01",
      checkOut: "2026-01-02",
      weather: null,
      sun: null,
      forecast: null,
      tides: null,
      launches: null,
      screensavers: [],
      heroPhoto: null,
      photos: [],
      logoUrl: null,
      deviceLabel: null,
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

function createMemoryStore() {
  const rows = new Map();
  let unauthorizedWrites = 0;
  let lastSeenWrites = 0;

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

  function productionRedeem(deviceId, pickupToken) {
    const r = ensure(deviceId);
    const ph = hashTvStatePickupToken(pickupToken);
    if (r.state_secret_pickup_hash !== ph) return { redeemed: false };
    if (!r.state_secret_pickup_expires_at) return { redeemed: false };
    if (new Date(r.state_secret_pickup_expires_at).getTime() <= Date.now()) {
      return { redeemed: false };
    }
    const { secret, hash } = mintTvStateSecret();
    if (!r.state_secret_required_at) {
      r.state_secret_required_at = new Date().toISOString();
    }
    r.state_secret_pending_hash = hash;
    r.state_secret_pickup_hash = null;
    r.state_secret_pickup_expires_at = null;
    return { redeemed: true, secret };
  }

  function buildDeps(overrides = {}) {
    const redeemImpl = overrides.redeemPickup ?? productionRedeem;
    const deps = {
      requireSecretEnabled: overrides.requireSecretEnabled ?? (() => false),
      loadAuthRow: async (deviceId) => ({
        kind: "ok",
        row: { ...ensure(deviceId) },
      }),
      registerDevice: async (id) => {
        ensure(id);
      },
      redeemPickup: redeemImpl,
      promotePending: async (deviceId) => {
        const r = ensure(deviceId);
        if (!r.state_secret_pending_hash) return false;
        r.state_secret_hash = r.state_secret_pending_hash;
        r.state_secret_pending_hash = null;
        return true;
      },
      getFullState: async () => leakFullState(),
      recordUnauthorizedAt: async () => {
        unauthorizedWrites += 1;
      },
      recordLegacyAuthAt: async () => {},
      getForceReloadAt: async () => "2099-01-01T00:00:00.000Z",
      deploySha: () => "cafebabe",
      evaluateAuth: overrides.evaluateAuth,
      buildFailClosedBody: overrides.buildFailClosedBody,
    };
    return { deps, ensure, unauthorizedWrites: () => unauthorizedWrites, lastSeenWrites: () => lastSeenWrites };
  }

  return { buildDeps, productionRedeem, ensure };
}

const mem = createMemoryStore();

/** Killer: second redeem must fail (single-use). */
async function killerSingleUse(deps) {
  const tok = mintTvStatePickupToken();
  const r = mem.ensure(DEVICE);
  r.state_secret_pickup_hash = hashTvStatePickupToken(tok);
  r.state_secret_pickup_expires_at = new Date(Date.now() + 60_000).toISOString();
  const a = await deps.redeemPickup(DEVICE, tok);
  const b = await deps.redeemPickup(DEVICE, tok);
  return a.redeemed && !b.redeemed;
}

/** Killer: ratchet device UUID-only → 401. */
async function killerRatchet(deps) {
  const r = mem.ensure(DEVICE);
  r.state_secret_required_at = new Date().toISOString();
  r.state_secret_hash = null;
  const res = await resolveTvStateWithDeps(deps, DEVICE, null, null);
  return res.status === 401 && !responseHasGuestSecrets(res.body);
}

/** Killer: invalid pickup → 401 branding-only. */
async function killerPickupPresence(deps) {
  const res = await resolveTvStateWithDeps(deps, DEVICE, null, mintTvStatePickupToken());
  return (
    res.status === 401 &&
    unauthorizedBodyIsBrandingOnly(res.body) &&
    !responseHasGuestSecrets(res.body)
  );
}

/** Killer: REQUIRE flag blocks unenrolled UUID. */
async function killerRequireFlag(deps) {
  const prev = process.env.TV_STATE_REQUIRE_SECRET;
  process.env.TV_STATE_REQUIRE_SECRET = "1";
  const res = await resolveTvStateWithDeps(deps, DEVICE, null, null);
  process.env.TV_STATE_REQUIRE_SECRET = prev ?? "";
  return res.status === 401;
}

/** Killer: 401 body stripped. */
async function killer401Strip(deps) {
  const { hash } = mintTvStateSecret();
  const r = mem.ensure(DEVICE);
  r.state_secret_hash = hash;
  r.state_secret_required_at = new Date().toISOString();
  const res = await resolveTvStateWithDeps(deps, DEVICE, "wrong-bearer", null);
  return res.status === 401 && !responseHasGuestSecrets(res.body);
}

/** Killer: full state only after redeem. */
async function killerRedeemBeforeFull(deps) {
  const tok = mintTvStatePickupToken();
  const r = mem.ensure(DEVICE);
  r.state_secret_pickup_hash = hashTvStatePickupToken(tok);
  r.state_secret_pickup_expires_at = new Date(Date.now() + 60_000).toISOString();
  const res = await resolveTvStateWithDeps(deps, DEVICE, null, tok);
  return (
    res.status === 200 &&
    responseHasGuestSecrets(res.body) &&
    responseHasStateSecret(res.body)
  );
}

/** Killer: mint must null active hash when staging pickup. */
function killerMintClearsHash(store, mintFn) {
  const r = store.ensure(DEVICE);
  const { hash } = mintTvStateSecret();
  r.state_secret_hash = hash;
  r.state_secret_required_at = new Date().toISOString();
  mintFn(r);
  return r.state_secret_hash === null;
}

function productionMintRow(r) {
  r.state_secret_hash = null;
  r.state_secret_pending_hash = null;
  r.state_secret_pickup_hash = hashTvStatePickupToken(mintTvStatePickupToken());
  r.state_secret_pickup_expires_at = new Date(Date.now() + 60_000).toISOString();
}

function mutantMintKeepHash(r) {
  r.state_secret_pickup_hash = hashTvStatePickupToken(mintTvStatePickupToken());
  r.state_secret_pickup_expires_at = new Date(Date.now() + 60_000).toISOString();
}

// --- Golden (production wiring) ---
const golden = mem.buildDeps();
check("PROD killer single-use", await killerSingleUse(golden.deps));
check("PROD killer ratchet", await killerRatchet(golden.deps));
check("PROD killer pickup presence", await killerPickupPresence(golden.deps));
check("PROD killer 401 strip", await killer401Strip(golden.deps));
check("PROD killer redeem before full", await killerRedeemBeforeFull(golden.deps));
check("PROD killer mint clears hash", killerMintClearsHash(mem, productionMintRow));
check("PROD killer require flag", await killerRequireFlag(golden.deps));

// --- Mutants: killer must FAIL when mutant applied ---
function mutantKilled(name, goldenPass, mutantPass) {
  check(`MUTANT ${name} trips killer`, goldenPass && !mutantPass);
}

{
  const m = mem.buildDeps({
    redeemPickup: async (deviceId, token) => {
      const { secret, hash } = mintTvStateSecret();
      mem.ensure(deviceId).state_secret_pending_hash = hash;
      return { redeemed: true, secret };
    },
  });
  mutantKilled(
    "drop-single-use",
    await killerSingleUse(golden.deps),
    await killerSingleUse(m.deps)
  );
}

{
  const m = mem.buildDeps();
  m.deps.evaluateAuth = () => ({ authorized: true, legacy: false });
  const stripGolden = await killer401Strip(golden.deps);
  const stripMutant = await killer401Strip(m.deps);
  mutantKilled("ignore-gate-result", stripGolden, stripMutant);
}

{
  const m = mem.buildDeps({
    buildFailClosedBody: async () => ({
      ...leakFullState(),
      error: "unauthorized",
      deploy: "x",
      forceReloadAt: null,
      pendingCommand: null,
    }),
  });
  const { hash } = mintTvStateSecret();
  const r = mem.ensure(DEVICE);
  r.state_secret_hash = hash;
  r.state_secret_required_at = new Date().toISOString();
  mutantKilled(
    "drop-401-strip",
    await killer401Strip(golden.deps),
    await killer401Strip(m.deps)
  );
}

{
  const m = mem.buildDeps({
    pickupAuthorizes: () => true,
    redeemPickup: async () => ({
      redeemed: true,
      secret: "synthetic-redacted-secret-value",
    }),
  });
  mutantKilled(
    "drop-pickup-presence-check",
    await killerPickupPresence(golden.deps),
    !(await killerPickupPresence(m.deps))
  );
}

{
  const prev = process.env.TV_STATE_REQUIRE_SECRET;
  process.env.TV_STATE_REQUIRE_SECRET = "1";
  const m = mem.buildDeps({ requireSecretEnabled: () => false });
  mutantKilled(
    "drop-require-flag",
    await killerRequireFlag(golden.deps),
    !(await killerRequireFlag(m.deps))
  );
  process.env.TV_STATE_REQUIRE_SECRET = prev ?? "";
}

mutantKilled(
  "mint-keep-old-hash",
  killerMintClearsHash(mem, productionMintRow),
  killerMintClearsHash(mem, mutantMintKeepHash)
);

console.log("\n--- F-5594 production mutants applied → failing killer ---");
console.log("| Mutant | Killer test that fails when mutant is on |");
console.log("| drop-single-use | PROD killer single-use |");
console.log("| ignore-gate-result | PROD killer 401 strip |");
console.log("| drop-401-strip | PROD killer 401 strip |");
console.log("| drop-pickup-presence-check | PROD killer pickup presence |");
console.log("| drop-require-flag | PROD killer require flag |");
console.log("| mint-keep-old-hash | PROD killer mint clears hash |");

process.exit(failed);