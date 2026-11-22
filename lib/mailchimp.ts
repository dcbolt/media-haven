/**
 * Mailchimp Marketing API (double opt-in). Placeholder env until Devin arms
 * production keys — calls are skipped when unset (demo/mock).
 */

let mailchimpFetch: typeof fetch = (...args) => fetch(...args);

/** Test hook — inject mock fetch (no live Mailchimp). */
export function setMailchimpFetchForTests(fn: typeof fetch): void {
  mailchimpFetch = fn;
}

export function resetMailchimpFetchForTests(): void {
  mailchimpFetch = (...args) => fetch(...args);
}

export type MailchimpSubscribeResult =
  | { ok: true; skipped?: boolean; status?: string }
  | { ok: false; error: string };

function parseDatacenter(apiKey: string): string | null {
  const idx = apiKey.lastIndexOf("-");
  if (idx < 0) return null;
  return apiKey.slice(idx + 1) || null;
}

export async function subscribeGuideSignup(input: {
  email: string;
  property: string;
}): Promise<MailchimpSubscribeResult> {
  const apiKey = process.env.MAILCHIMP_API_KEY?.trim();
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID?.trim();
  if (!apiKey || !audienceId) {
    return { ok: true, skipped: true };
  }
  const dc = parseDatacenter(apiKey);
  if (!dc) return { ok: false, error: "invalid api key format" };

  const url = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members`;
  const auth = Buffer.from(`anystring:${apiKey}`, "utf8").toString("base64");

  const body = {
    email_address: input.email.trim().toLowerCase(),
    status: "pending",
    merge_fields: { MMERGE7: input.property.slice(0, 255) },
    tags: ["Guide Signup"],
  };

  const res = await mailchimpFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { status?: string };
    return { ok: true, status: data.status ?? "pending" };
  }

  // Already subscribed — treat as success for guest UX.
  if (res.status === 400) {
    const err = (await res.json().catch(() => ({}))) as {
      title?: string;
      detail?: string;
    };
    const detail = `${err.title ?? ""} ${err.detail ?? ""}`.toLowerCase();
    if (detail.includes("member exists")) {
      return { ok: true, status: "pending" };
    }
    return { ok: false, error: err.detail || err.title || "mailchimp rejected" };
  }

  return { ok: false, error: `mailchimp http ${res.status}` };
}