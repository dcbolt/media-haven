/**
 * MH186 / F-5594 — auth gate + fail-closed 401 shape (mutant killers).
 */
import {
  attachStateSecretIfDelivering,
  evaluateTvStateAuth,
  mintTvStateSecret,
  responseHasGuestSecrets,
  resetTvStateLegacyAuthCountForTests,
} from "../lib/tv-state-secret.ts";
import { pollMayReturnStateSecret } from "../lib/tv-state-pickup-policy.ts";
import {
  minimalUnauthorizedTvState,
  unauthorizedBodyIsBrandingOnly,
} from "../lib/tv-state-unauthorized.ts";

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

const { secret, hash } = mintTvStateSecret();
resetTvStateLegacyAuthCountForTests();

// --- F-5594 mutant: ignore gate (always authorize enrolled + wrong header) ---
const enrolledWrong = evaluateTvStateAuth({
  requireSecret: false,
  storedHash: hash,
  headerSecret: "wrong-bearer",
  pickupAuthorizes: false,
});
check("MUTANT ignore-gate killed", !enrolledWrong.authorized);

// --- F-5594 mutant: drop single-use pickup (deliver secret without redeem) ---
const correctNoRedeem = attachStateSecretIfDelivering(
  { mode: "pairing", pairCode: "ABCDEF" },
  pollMayReturnStateSecret({
    pickupTokenPresent: true,
    pickupRedeemed: false,
  }),
  secret
);
check(
  "MUTANT drop-single-use killed",
  !("stateSecret" in correctNoRedeem)
);

// --- F-5594 mutant: skip 401 strip (return guest payload on deny) ---
const minimal = minimalUnauthorizedTvState();
check("MUTANT drop-401-strip killed (branding only)", unauthorizedBodyIsBrandingOnly(minimal));
check("minimal has no guest secrets", !responseHasGuestSecrets(minimal));
const mutantFull = {
  mode: "active",
  content: {
    ...minimal.content,
    guestFirstName: "Leaked",
    wifiPassword: "leaked",
    sections: [{ title: "x" }],
  },
};
check(
  "full guest body fails branding-only check",
  !unauthorizedBodyIsBrandingOnly(mutantFull)
);

// F-5595 shape (no DB): reload + deploy keys allowed on synthetic 401 envelope
const unauthorizedEnvelope = {
  ...minimal,
  forceReloadAt: "2099-01-01T00:00:00.000Z",
  deploy: "abc123",
  pendingCommand: null,
  error: "unauthorized",
};
check("401 may include deploy", unauthorizedEnvelope.deploy === "abc123");
check("401 may include forceReloadAt", Boolean(unauthorizedEnvelope.forceReloadAt));
check("401 pendingCommand null", unauthorizedEnvelope.pendingCommand === null);
check(
  "401 envelope still branding-only",
  unauthorizedBodyIsBrandingOnly(unauthorizedEnvelope)
);

console.log("\n--- F-5594 mutant → test map ---");
console.log("| Mutant | Killing test |");
console.log("| Drop single-use pickup redeem gate | pickup present not redeemed → no secret |");
console.log("| Ignore evaluateTvStateAuth deny | MUTANT ignore-gate killed |");
console.log("| Skip 401 guest strip | MUTANT drop-401-strip killed (branding only) |");

process.exit(failed);