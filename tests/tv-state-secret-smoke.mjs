/**
 * MH185-1 TV state bearer secret — unit smoke (no Supabase / no prod).
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const {
  attachStateSecretIfDelivering,
  evaluateTvStateAuth,
  hashTvStateSecret,
  mintTvStateSecret,
  resetTvStateLegacyAuthCountForTests,
  responseHasGuestSecrets,
  stripTvContentGuestSecrets,
  tvStateLegacyAuthCount,
  tvStateRequireSecretEnabled,
  verifyTvStateSecret,
} = await import("../lib/tv-state-secret.ts");
const {
  hashTvStatePickupToken,
  mintTvStatePickupToken,
  pollMayReturnStateSecret,
  responseHasStateSecret,
  verifyTvStatePickupToken,
} = await import("../lib/tv-state-pickup-policy.ts");

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

resetTvStateLegacyAuthCountForTests();

const { secret, hash } = mintTvStateSecret();
check("mint secret", secret.length >= 32 && hash.length === 64);
check("verify correct", verifyTvStateSecret(secret, hash));
check("verify wrong secret", !verifyTvStateSecret("wrong", hash));
const wrongHash = createHash("sha256")
  .update(`${secret}-mutant-wrong-digest`, "utf8")
  .digest("hex");
check("verify wrong hash", !verifyTvStateSecret(secret, wrongHash));
let loopOk = true;
for (let i = 0; i < 200; i++) {
  const { secret: s2 } = mintTvStateSecret();
  const bad = createHash("sha256")
    .update(`${s2}-mutant-wrong-digest`, "utf8")
    .digest("hex");
  if (verifyTvStateSecret(s2, bad)) {
    loopOk = false;
    break;
  }
}
check("verify wrong hash x200", loopOk);
check(
  "constant-time path unequal length",
  !verifyTvStateSecret(secret, "abc")
);

const prevReq = process.env.TV_STATE_REQUIRE_SECRET;
process.env.TV_STATE_REQUIRE_SECRET = "";
check("require flag off", !tvStateRequireSecretEnabled());
process.env.TV_STATE_REQUIRE_SECRET = "true";
check("require flag on", tvStateRequireSecretEnabled());

process.env.TV_STATE_REQUIRE_SECRET = "";
resetTvStateLegacyAuthCountForTests();
const grace = evaluateTvStateAuth({
  requireSecret: false,
  storedHash: null,
  pendingHash: null,
  headerSecret: null,
  secretRequiredAt: null,
});
check("grace uuid-only authorized", grace.authorized && grace.legacy);
check("legacy count", tvStateLegacyAuthCount() === 1);

const graceBad = evaluateTvStateAuth({
  requireSecret: false,
  storedHash: hash,
  pendingHash: null,
  headerSecret: "not-the-secret",
  secretRequiredAt: null,
});
check(
  "enrolled wrong header is 401 (ratchet)",
  !graceBad.authorized
);

resetTvStateLegacyAuthCountForTests();
const strictMissing = evaluateTvStateAuth({
  requireSecret: true,
  storedHash: hash,
  pendingHash: null,
  headerSecret: null,
  secretRequiredAt: null,
});
check("require secret blocks uuid-only", !strictMissing.authorized);

const strictOk = evaluateTvStateAuth({
  requireSecret: true,
  storedHash: hash,
  pendingHash: null,
  headerSecret: secret,
  secretRequiredAt: null,
});
check("require secret accepts header", strictOk.authorized && !strictOk.legacy);

const demoContent = {
  propertyName: "Demo",
  occupied: true,
  wifiSsid: "FH",
  wifiPassword: "secret-wifi",
  wifiQr: "data:image/png",
  sections: [],
  guestFirstName: "Pat",
  guestLabel: "The Patts",
  checkIn: "2026-01-01",
  checkOut: "2026-01-05",
  portalQr: "data:image/png",
  guestBook: { title: "x", url: "https://example.com", qr: "q" },
  bookUrl: "https://book",
  bookQr: "q",
  timing: { slideMs: 1, fadeMs: 1 },
  ambience: { tracks: [] },
  showTurtles: true,
  photos: [],
  screensavers: [],
  streaming: [],
  forecast: null,
  tides: null,
  launches: null,
  heroPhoto: null,
  logoUrl: null,
  deviceLabel: null,
  weather: null,
  sun: null,
  nextYear: null,
  extendStay: null,
  upsell: null,
  playlist: null,
  takeover: null,
  vacantPlaylist: null,
};

const stripped = stripTvContentGuestSecrets(demoContent);
check("strip guest name", stripped.guestFirstName === null);
check("strip wifi password", stripped.wifiPassword === null);
check("strip portal qr", stripped.portalQr === null);
check("strip occupied false", stripped.occupied === false);
check(
  "401 body has no guest secrets",
  !responseHasGuestSecrets({ mode: "active", content: stripped })
);
check(
  "detects guest leak",
  responseHasGuestSecrets({ mode: "active", content: demoContent })
);

// Timing probe: many compares should not throw.
for (let i = 0; i < 50; i++) {
  verifyTvStateSecret(i % 2 ? secret : "x", hash);
}
check("hash stable", hashTvStateSecret(secret) === hash);

// UUID-only grace poll must never attach stateSecret without pickup redemption.
evaluateTvStateAuth({
  requireSecret: false,
  storedHash: null,
  pendingHash: null,
  headerSecret: null,
  secretRequiredAt: null,
});
const legacyBody = attachStateSecretIfDelivering(
  { mode: "pairing", pairCode: "ABCDEF" },
  false,
  null
);
check(
  "uuid-only poll never returns stateSecret",
  !responseHasStateSecret(legacyBody)
);
check(
  "uuid-only poll policy gate",
  !pollMayReturnStateSecret({
    pickupTokenPresent: false,
    pickupRedeemed: false,
  })
);
const withPickupRedeem = attachStateSecretIfDelivering(
  { mode: "active", content: stripped },
  pollMayReturnStateSecret({
    pickupTokenPresent: true,
    pickupRedeemed: true,
  }),
  "synthetic-redacted-secret"
);
check(
  "pickup redeem may return stateSecret",
  responseHasStateSecret(withPickupRedeem)
);
check(
  "pickup present but not redeemed",
  !pollMayReturnStateSecret({
    pickupTokenPresent: true,
    pickupRedeemed: false,
  })
);

const pickup = mintTvStatePickupToken();
const pickupHash = hashTvStatePickupToken(pickup);
const exp = new Date(Date.now() + 60_000).toISOString();
check("pickup verify ok", verifyTvStatePickupToken(pickup, pickupHash, exp));
check(
  "pickup expired",
  !verifyTvStatePickupToken(
    pickup,
    pickupHash,
    new Date(Date.now() - 1000).toISOString()
  )
);

process.env.TV_STATE_REQUIRE_SECRET = prevReq ?? "";

process.exit(failed);