# DNS runbook — Stay OS subdomains on thefloridahavens.com (Wix DNS)

**Audience:** a browser-driving agent (or a human) with access to the Wix account
that manages DNS for `thefloridahavens.com`, plus the Vercel dashboard for the
`media-haven` project.

**Goal:** point three subdomains at the Stay OS deployment without touching the
live marketing site or email.

| Subdomain | Purpose |
|-----------|---------|
| `tv.thefloridahavens.com` | TV / device endpoint (Shield, signage panels) |
| `host.thefloridahavens.com` | Host backend (`/host` dashboard, fleet, calendar) |
| `media.thefloridahavens.com` | Admin / media backend |

---

## 🛑 Hard rules — read before touching anything

`thefloridahavens.com` is a **live revenue-generating business domain**. Its
apex and `www` serve the Wix marketing site that takes direct bookings, and its
MX records carry company email. A careless DNS edit takes down bookings, email,
or both.

**You may ONLY add new CNAME records for the three names above.**

Do **NOT**, under any circumstances:

- modify or delete the **apex (`@`)** or **`www`** records — that is the live site
- change **nameservers**
- modify or delete any **MX** record — that is email
- modify or delete any **TXT** record — those carry SPF/DKIM/domain verification
- delete *any* existing record, for any reason
- "clean up", reorder, or normalise anything you were not asked to add

**STOP and report instead of proceeding if:**

- a record already exists for `tv`, `host`, or `media`
- the DNS editor is read-only, or Wix says the domain uses external nameservers
- you cannot find the DNS editor after following §2
- anything on screen warns that a change will affect the site or email
- you are about to click a red/destructive button

Adding a record is reversible. Deleting one may not be. When unsure: stop.

---

## 1 · Vercel first — get the real CNAME target

Order matters. Vercel tells you the exact target to use, and it is **not always**
`cname.vercel-dns.com` (newer accounts get region-specific targets like
`cname.vercel-dns-###.com`). Do not guess it.

1. Open `https://vercel.com/dcbolt-projects/media-haven/settings/domains`.
2. For each of the three names, click **Add Domain**, type the full hostname
   (e.g. `tv.thefloridahavens.com`), and submit.
3. Vercel will show the required DNS record. **Record the exact `Type`, `Name`,
   and `Value` it displays for each.** Screenshot or copy verbatim.
4. Expect all three to read "Invalid Configuration" for now — that is correct
   until §3 is done.

**Report the three exact target values before continuing.** Everything below
depends on them.

> **Confirmed 2026-08-10** — Vercel asked for one shared, region-specific
> target for all three names:
>
> ```
> c676f10764c14672.vercel-dns-016.com.
> ```
>
> Note it is **not** the generic `cname.vercel-dns.com`, exactly the gotcha this
> section exists for. Vercel noted the legacy `cname.vercel-dns.com` /
> `76.76.21.21` would also work; use the recommended value above instead.
>
> Treat this as a record of what was issued, **not** as a value to reuse blindly —
> re-read it from the dashboard for any new domain, since it is per-project.

---

## 2 · Find the Wix DNS editor

1. Go to `https://manage.wix.com/`.
2. Open the account-level **Domains** area (not a single site's settings):
   `https://manage.wix.com/account/domains`.
3. Click `thefloridahavens.com`.
4. Look for **Advanced** → **Edit DNS** (Wix has also labelled this "DNS
   Records" or "Advanced DNS"). Wix moves this around; if the wording differs,
   find the screen that lists existing A / CNAME / MX / TXT records.

**Branch check — do this before editing:**

- If the screen lists the domain's records and they are editable → Wix manages
  DNS. **Continue to §3.**
- If Wix says the domain uses **external nameservers**, or points you to another
  registrar → DNS is *not* at Wix. **STOP and report which registrar Wix names.**
  The records must be added there instead, and that is a different runbook.

**Before adding anything, capture the current state:** screenshot the full
existing record list. If anything later goes wrong, that screenshot is the
rollback reference.

---

## 3 · Add the three CNAME records

For each of `tv`, `host`, `media`:

1. Click **Add Record** (or **+ Add**).
2. **Type:** `CNAME`
3. **Host name / Name:** just the label — `tv` — **not** the full
   `tv.thefloridahavens.com`. Wix appends the domain automatically. If the field
   shows a `.thefloridahavens.com` suffix beside it, enter only `tv`.
4. **Value / Points to:** the exact target from §1 step 3 (e.g.
   `cname.vercel-dns.com`). Include the trailing dot only if Wix's other records
   show one.
5. **TTL:** leave the default (Wix commonly defaults to 1 hour).
6. Save.

Repeat for `host` and `media`. **Three new records total. Nothing else changes.**

Then screenshot the record list again so before/after can be compared.

---

## 4 · Verify — do not assume

DNS is not done when the form saves. Confirm all three:

**a. Resolution** (from any shell):

```bash
for s in tv host media; do
  echo "== $s =="
  dig +short CNAME $s.thefloridahavens.com
done
```

Each should return the Vercel target. Empty output means it has not propagated
yet — wait and re-check. Wix's default TTL means this can take up to ~1 hour,
occasionally longer.

**b. Vercel** — back on the domains settings page, each of the three should flip
to **Valid Configuration** with a certificate issued. Vercel re-checks
automatically; a manual **Refresh** is available.

**c. End to end** — once Vercel shows valid:

```bash
for s in tv host media; do
  echo -n "$s/tv → "; curl -s -o /dev/null -w "%{http_code}\n" https://$s.thefloridahavens.com/tv
done
```

All three should return **200**. (Every hostname serves the whole app; the
subdomains are human-friendly entry points, not separate deployments.)

**d. Nothing broke** — the part people forget:

```bash
curl -s -o /dev/null -w "apex %{http_code}\n" https://thefloridahavens.com/
curl -s -o /dev/null -w "www  %{http_code}\n" https://www.thefloridahavens.com/
dig +short MX thefloridahavens.com
```

Apex and `www` must still serve the Wix marketing site, and the MX records must
be unchanged from the §2 screenshot. **If either regressed, report immediately** —
that is a live-site or email outage.

---

## 5 · Report back

1. The three exact CNAME targets Vercel asked for.
2. Before/after screenshots of the Wix record list.
3. Output of all four verification blocks in §4.
4. Anything you skipped, and why.

---

## 6 · Not DNS — the follow-ups these domains unblock

DNS alone doesn't finish the migration. These are separate, and mostly Devin's:

| Step | Where | Why |
|------|-------|-----|
| `NEXT_PUBLIC_PORTAL_URL` env var | Vercel → Settings → Environment Variables | `portalBaseUrl()` drives **every QR code and guest link**. Until it is set, they keep pointing at the `.vercel.app` host. See the open question below. |
| Google OAuth redirect URIs | Google Cloud console | Host sign-in on a new hostname fails until each origin is registered. `requestOrigin()` already sends the callback back to whichever host was opened, so this is console-only. |
| Supabase Auth redirect allow-list | Supabase dashboard | Same reason. |
| Fully Kiosk **Start URL** on every paired device | at each TV | `SHIELD-SETUP.md` §3b. Changing this re-mints the device identity (`localStorage` is per-origin), so **each TV will show a fresh pairing code and must be re-paired.** Plan it as a deliberate pass, not a surprise. |

> ### ⚠ Open question before setting `NEXT_PUBLIC_PORTAL_URL`
> All three names above are back-of-house (`tv` / `host` / `media`). None is a
> guest-facing name, but `portalBaseUrl()` is what guests see — it builds the
> `/welcome` links and the `/go/<slug>` QR targets that go on **printed** cards.
> Pointing those at `media.` or `host.` would read oddly to a guest and is
> expensive to undo once cards are printed.
>
> Recommend adding a fourth CNAME — `stay.thefloridahavens.com` — and setting
> `NEXT_PUBLIC_PORTAL_URL=https://stay.thefloridahavens.com`.
>
> **Status 2026-08-10: Devin declined for now.** The first Wix pass added `tv`,
> `host` and `media` only. `NEXT_PUBLIC_PORTAL_URL` is therefore still unset,
> which means **guest links and every `/go/<slug>` QR target continue to point at
> the `.vercel.app` host** — the new domains exist but guests don't use them yet.
> That is a deliberate hold, not an oversight. Do not add `stay` or set the env
> var without a fresh explicit go-ahead.
