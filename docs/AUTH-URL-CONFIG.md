# Auth runbook — Supabase URL Configuration for the Stay OS subdomains

**Audience:** a browser-driving agent (or a human) with access to the Supabase
dashboard for the `media-haven` project.

**Goal:** let host sign-in work on the new subdomains. Google OAuth currently
fails on `host.thefloridahavens.com` because Supabase only allow-lists the old
`.vercel.app` callback, and its Site URL still points at a local dev server.

**Page — the only page you may change:**
`https://supabase.com/dashboard/project/woleywnwgjfcvowqyyix/auth/url-configuration`

**Related:** [`DNS-SUBDOMAINS.md`](./DNS-SUBDOMAINS.md) (the DNS half, already done)

---

## Target end state

| Field | Value |
|-------|-------|
| **Site URL** | `https://host.thefloridahavens.com` |
| **Redirect URLs** | `https://media-haven-lilac.vercel.app/host/login/google` ← **existing, keep** |
| | `https://host.thefloridahavens.com/host/login/google` ← add |
| | `https://media.thefloridahavens.com/host/login/google` ← add |
| | `https://tv.thefloridahavens.com/host/login/google` ← add |

**Success criterion: `Total URLs: 4`.** If it reads anything else when you
finish, something went wrong — report it.

---

## 🛑 Hard rules

This project is the live Stay OS backing six rental properties. Auth
misconfiguration locks the owner out of his own dashboard.

**You may change exactly two things: the Site URL field, and adding three
redirect URLs.**

Do **NOT**:

- **delete or edit the existing `media-haven-lilac.vercel.app` redirect URL** —
  that is the currently-working sign-in path; removing it locks everyone out
- delete or edit any other redirect URL you find
- touch anything else in the Authentication section — **Sign In / Providers**,
  **Sessions**, **Rate Limits**, **Multi-Factor**, **Attack Protection**,
  **Auth Hooks**, **Emails**, **Users**, **Policies**, **OAuth Apps/Server**
- change anything outside Authentication (Database, Storage, Edge Functions,
  project settings)
- disable or re-enable any auth provider

**STOP and report instead of proceeding if:**

- **Site URL is not `http://localhost:3000`** — someone changed it since this was
  written; do not overwrite an unknown value
- a redirect URL for any of the three new hosts already exists
- the page is read-only, or saving errors
- the redirect list contains entries you were not told about *and* you are unsure
  whether they matter — report them rather than tidying
- you are about to click anything red or labelled Delete / Remove / Revoke

---

## 1 · Capture the before state

Screenshot the full URL Configuration page, showing the Site URL value and the
complete redirect list including `Total URLs`. This is the rollback reference.

Confirm Site URL currently reads exactly `http://localhost:3000`. If not, stop
(see above).

---

## 2 · Site URL

1. Clear the Site URL field and enter exactly:

   ```
   https://host.thefloridahavens.com
   ```

   No trailing slash. No wildcards — the field does not accept them.
2. Click **Save changes** and confirm it persists (reload the page and re-read
   the field).

*Why:* Site URL is where Supabase sends the browser when a `redirect_to` is
missing or not allow-listed. Pointing at `localhost:3000` is why the failure was
silent — the browser was sent to a dev server that isn't running, so no error
page from the app ever rendered.

---

## 3 · Add the three redirect URLs

For each of the three, click **Add URL**, paste the value exactly, and save:

```
https://host.thefloridahavens.com/host/login/google
https://media.thefloridahavens.com/host/login/google
https://tv.thefloridahavens.com/host/login/google
```

Notes:
- **Exact paths, not wildcards.** `https://*.thefloridahavens.com/**` would work
  but permits auth redirects to *any* path on those hosts. The existing entry is
  an exact path; match that convention.
- No trailing slashes.
- The path is `/host/login/google` on every host — that is the app's OAuth
  landing route, and it is the same on all of them.

---

## 4 · Verify what you can

**You can verify:** reload the page and confirm

- Site URL reads `https://host.thefloridahavens.com`
- the redirect list contains all four URLs above, spelled exactly
- `Total URLs: 4`
- nothing else on the page changed versus your before-screenshot

**You cannot verify the sign-in itself** — completing Google OAuth needs the
owner's Google credentials. Do not attempt it. Report the config state and hand
the sign-in test back.

Also confirm you did not visit or alter any other Authentication page.

---

## 5 · Report back

1. Before and after screenshots of the URL Configuration page.
2. The final Site URL value and the full redirect list with the total count.
3. Anything you skipped or stopped on, and why.
4. Confirmation that the existing `.vercel.app` entry is still present.

---

## 6 · Background — why this is needed

OAuth here is **brokered by Supabase**, which is easy to misdiagnose:

- `/host/login` sends the browser to `{SUPABASE_URL}/auth/v1/authorize`.
- The `redirect_uri` Google validates is
  `https://woleywnwgjfcvowqyyix.supabase.co/auth/v1/callback` — Supabase's own,
  already registered, never changes. **The Google Cloud console needs no change.**
- Our hostname travels as `redirect_to`, and **Supabase** validates that against
  the Redirect URLs list on this page. That is the only gate.

Symptom when a host is missing from the list: Google authenticates fine, Supabase
discards the `redirect_to`, and the browser goes to Site URL instead — so the
app's own error page never runs and the user just sees the login screen again.

The host **email** allow-list is separate and already correct (`devin@`,
`properties@`, `cody@`, `caitlin@` — managed at `/host/users`). Nothing on this
page affects it.

---

## 7 · Known gap left open deliberately

Vercel **preview deployments** cannot do Google sign-in — their URLs are not
allow-listed and each preview gets a new hostname. Fixing that needs a wildcard
like `https://media-haven-*-dcbolt-projects.vercel.app/host/login/google`.
**Do not add it as part of this task**; it widens the allow-list and is Devin's
call. Note it in your report if he wants it later.
