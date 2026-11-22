/**
 * Mailchimp double opt-in contract (mocked fetch — no live account).
 * node --experimental-strip-types tests/mailchimp-double-optin.mjs
 */

async function main() {
  let captured = null;
  const mockFetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ status: "pending" }), { status: 200 });
  };

  const { subscribeGuideSignup, setMailchimpFetchForTests, resetMailchimpFetchForTests } =
    await import("../lib/mailchimp.ts");

  const prevKey = process.env.MAILCHIMP_API_KEY;
  const prevAud = process.env.MAILCHIMP_AUDIENCE_ID;
  process.env.MAILCHIMP_API_KEY = "test-us19";
  process.env.MAILCHIMP_AUDIENCE_ID = "list123";

  setMailchimpFetchForTests(mockFetch);
  try {
    const r = await subscribeGuideSignup({
      email: "guest@example.com",
      property: "The Dunes",
    });
    if (!r.ok) throw new Error("subscribe failed");
    if (captured?.body?.status !== "pending") {
      throw new Error(`expected pending status, got ${captured?.body?.status}`);
    }
    if (captured?.body?.merge_fields?.MMERGE7 !== "The Dunes") {
      throw new Error("MMERGE7 property merge missing");
    }
    if (!captured?.body?.tags?.includes("Guide Signup")) {
      throw new Error("Guide Signup tag missing");
    }
    console.log("ok: mailchimp double opt-in mock");
  } finally {
    resetMailchimpFetchForTests();
    if (prevKey === undefined) delete process.env.MAILCHIMP_API_KEY;
    else process.env.MAILCHIMP_API_KEY = prevKey;
    if (prevAud === undefined) delete process.env.MAILCHIMP_AUDIENCE_ID;
    else process.env.MAILCHIMP_AUDIENCE_ID = prevAud;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});