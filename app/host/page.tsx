import { redirect } from "next/navigation";
import { signageName } from "@/lib/content";
import { isHostAuthenticated } from "@/lib/host-auth";
import { loadEmergencyTakeover } from "@/lib/takeover";
import { supabaseAdmin } from "@/lib/supabase";
import { portalBaseUrl } from "@/lib/tokens";
import { familyLabel, listTvDevices } from "@/lib/tv";
import ApiForm from "./api-form";
import StormPanel from "./storm-panel";

interface ReservationRow {
  id: string;
  guest_first_name: string | null;
  guest_last_name?: string | null;
  guest_label_override?: string | null;
  check_in: string;
  check_out: string;
  status: string;
  properties: { name: string } | { name: string }[] | null;
  guest_tokens?: { token: string; expires_at: string }[] | null;
}

const MOCK_ROWS: ReservationRow[] = [
  {
    id: "mock-res-1",
    guest_first_name: "Alex",
    check_in: new Date(Date.now() - 86400_000).toISOString(),
    check_out: new Date(Date.now() + 3 * 86400_000).toISOString(),
    status: "confirmed",
    properties: { name: "The Dunes" },
  },
];

/** Fleet health (ROADMAP 1.6 + S5.12): deployed TVs online right now plus
 *  the one-glance SLA numbers. A TV is online if it polled within 90s
 *  (poll interval is 10s). */
async function loadTvFleet(): Promise<{
  online: number;
  total: number;
  stale: number;
  occupied: number;
  vacant: number;
} | null> {
  const devices = await listTvDevices();
  const linked = devices.filter((d) => d.property_id);
  if (linked.length === 0) return null;
  const isOnline = (iso: string) =>
    Date.now() - new Date(iso).getTime() < 90_000;
  return {
    online: linked.filter((d) => isOnline(d.last_seen)).length,
    total: linked.length,
    stale: linked.filter((d) => !isOnline(d.last_seen)).length,
    occupied: linked.filter((d) => d.occupied === true).length,
    vacant: linked.filter((d) => d.occupied === false).length,
  };
}

async function loadProperties(): Promise<{ id: string; name: string }[]> {
  const db = supabaseAdmin();
  if (!db) return [{ id: "mock-prop-1", name: "The Dunes" }];
  const { data } = await db.from("properties").select("id, name").order("name");
  return data ?? [];
}

async function loadReservations(): Promise<{ rows: ReservationRow[]; live: boolean }> {
  const db = supabaseAdmin();
  if (!db) return { rows: MOCK_ROWS, live: false };
  // Operational view: active stays only (no inquiries/cancellations),
  // soonest check-in first, nothing already checked out.
  const columns =
    "id, guest_first_name, guest_last_name, guest_label_override, check_in, check_out, status, properties (name), guest_tokens (token, expires_at)";
  const query = (cols: string) =>
    db
      .from("reservations")
      .select(cols)
      .in("status", ["confirmed", "reserved", "checked_in"])
      .gte("check_out", new Date().toISOString())
      .order("check_in", { ascending: true })
      .limit(50);
  // Override/surname columns arrive with migrations 0014/0016.
  let { data, error } = await query(columns);
  if (error) ({ data } = await query(columns.replace(", guest_last_name, guest_label_override", "")));
  return { rows: (data as unknown as ReservationRow[] | null) ?? [], live: true };
}

function liveToken(row: ReservationRow): string | null {
  const now = Date.now();
  const match = (row.guest_tokens ?? []).find(
    (t) => new Date(t.expires_at).getTime() > now
  );
  return match?.token ?? null;
}

function propertyName(row: ReservationRow): string {
  if (!row.properties) return "—";
  const name = Array.isArray(row.properties)
    ? (row.properties[0]?.name ?? "—")
    : row.properties.name;
  return name === "—" ? name : signageName(name);
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function HostDashboard({
  searchParams,
}: {
  searchParams: Promise<{
    minted?: string;
    tv?: string;
    sync?: string;
    syncerr?: string;
    renamed?: string;
  }>;
}) {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const { minted, tv, sync, syncerr, renamed } = await searchParams;
  const [{ rows, live }, properties, fleet, takeover] = await Promise.all([
    loadReservations(),
    loadProperties(),
    loadTvFleet(),
    loadEmergencyTakeover(),
  ]);
  const base = portalBaseUrl();

  return (
    <main className="mx-auto max-w-3xl p-4 pb-12 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-bold text-ocean-700">Host dashboard</h1>
        {!live && (
          <span className="rounded-full bg-sand-100 px-3 py-1 text-sm font-semibold text-ocean-700">
            demo data — Supabase not configured
          </span>
        )}
      </header>

      {/* S5.12 fleet SLA at a glance: green all good, amber degraded, red
          emergency. Every chip clicks through to the fleet map. */}
      {fleet && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href="/host/tvs"
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              fleet.online === fleet.total
                ? "bg-seafoam-500/15 text-seafoam-500"
                : fleet.online > 0
                  ? "bg-amber-500/15 text-amber-600"
                  : "bg-red-500/15 text-red-600"
            }`}
            title="Deployed TVs polling within the last 90 seconds"
          >
            TVs {fleet.online}/{fleet.total} online
          </a>
          {fleet.stale > 0 && (
            <a
              href="/host/tvs"
              className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-600"
              title="Linked TVs that stopped polling"
            >
              {fleet.stale} stale
            </a>
          )}
          <a
            href="/host/tvs"
            className="rounded-full bg-sand-100 px-3 py-1 text-sm font-semibold text-ocean-700"
            title="In-house reservations vs empty homes right now"
          >
            {fleet.occupied} occupied · {fleet.vacant} vacant
          </a>
          {takeover && (
            <span
              className="rounded-full bg-red-500/15 px-3 py-1 text-sm font-bold text-red-600"
              title="Fleet emergency takeover is live on every TV and the guest portal"
            >
              ⚠ {takeover.kind === "water" ? "Water advisory" : "Storm mode"} LIVE
            </span>
          )}
        </div>
      )}

      <StormPanel initial={takeover} />

      {minted && (
        <section className="mt-6 rounded-2xl border-2 border-seafoam-500 bg-white p-6 shadow-md">
          <h2 className="text-xl font-bold text-ocean-700">Guest link ready</h2>
          <p className="mt-2 break-all font-mono text-lg">
            {base}/welcome?token={minted}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/host/qr/${minted}`}
              alt={`QR code for guest token ${minted}`}
              width={180}
              height={180}
              className="rounded-lg border border-sand-300"
            />
            <p className="text-ocean-900/70">
              Print this QR for the property. It resolves to the guest&apos;s
              personalized welcome and dies 24h after checkout.
              {!live && " (Demo mint — not persisted without Supabase.)"}
            </p>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl bg-white p-6 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ocean-700">Properties</h2>
            <p className="mt-1 text-ocean-900/60">
              {properties.length} in the portal. Guesty is the source of truth
              for names, photos, and per-property Wi-Fi once connected.
            </p>
          </div>
          <ApiForm
            op="sync"
            endpoint="/api/host/dashboard"
            className="shrink-0"
            successText="Synced"
          >
            <button
              type="submit"
              className="whitespace-nowrap rounded-full bg-ocean-500 px-6 py-2 font-semibold text-white transition hover:bg-ocean-700"
            >
              Sync from Guesty
            </button>
          </ApiForm>
        </div>
        {sync && (
          <p className="mt-2 font-semibold text-seafoam-500">
            Synced {sync} propert{sync === "1" ? "y" : "ies"} from Guesty.
          </p>
        )}
        {syncerr === "guesty-not-configured" && (
          <p className="mt-2 text-ocean-900/70">
            Guesty isn&apos;t connected yet — add GUESTY_CLIENT_ID and
            GUESTY_CLIENT_SECRET in Vercel once your Open API access is
            approved, and this button pulls all six listings automatically.
          </p>
        )}
        {syncerr && syncerr !== "guesty-not-configured" && (
          <p className="mt-2 font-semibold text-red-600">
            Sync failed: {syncerr}
          </p>
        )}
      </section>

      <section className="mt-6 rounded-2xl bg-white p-6 shadow-md">
        <h2 className="text-xl font-bold text-ocean-700">Pair a TV</h2>
        <p className="mt-1 text-ocean-900/60">
          Open <span className="font-mono">{base}/tv</span> on the TV&apos;s
          browser, then enter the 6-character code it shows.
        </p>
        {tv === "paired" && (
          <p className="mt-2 font-semibold text-seafoam-500">
            TV paired — it switches to signage in ~10 seconds.
          </p>
        )}
        {(tv === "failed" || tv === "invalid") && (
          <p className="mt-2 font-semibold text-red-600">
            That code didn&apos;t match an unpaired TV. Check the screen and try
            again{live ? "" : " (pairing needs Supabase configured)"}.
          </p>
        )}
        <ApiForm
          op="pair"
          endpoint="/api/host/dashboard"
          className="mt-4 flex flex-wrap items-center gap-3"
          successText="TV paired — signage in ~10s"
        >
          <input
            name="pairCode"
            placeholder="ABC123"
            required
            maxLength={6}
            className="w-36 rounded-xl border border-sand-300 p-3 font-mono text-lg uppercase tracking-widest outline-none focus:border-ocean-500"
          />
          <select
            name="propertyId"
            required
            className="min-w-0 max-w-full rounded-xl border border-sand-300 bg-white p-3 text-lg outline-none focus:border-ocean-500"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id} title={p.name}>
                {signageName(p.name)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full bg-ocean-500 px-6 py-2 font-semibold text-white transition hover:bg-ocean-700"
          >
            Pair TV
          </button>
        </ApiForm>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-xl font-bold text-ocean-700">Reservations</h2>
        {renamed && (
          <p className="rounded-xl bg-white p-3 font-semibold text-seafoam-500 shadow-sm">
            Signage name saved — TVs update in ~10 seconds. Blank restores the
            Guesty name.
          </p>
        )}
        {rows.length === 0 && (
          <p className="text-ocean-900/60">
            No reservations yet — they&apos;ll appear here once Guesty sync or
            manual entries land.
          </p>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-md"
          >
            <div>
              <p className="text-lg font-semibold">
                {row.guest_first_name ?? "Guest"} · {propertyName(row)}
              </p>
              <p className="text-ocean-900/60">
                {fmt(row.check_in)} → {fmt(row.check_out)} · {row.status}
              </p>
              <ApiForm
                op="rename-guest"
                endpoint="/api/host/dashboard"
                className="mt-2 flex flex-wrap items-center gap-2"
                successText="Signage name saved"
              >
                <input type="hidden" name="reservationId" value={row.id} />
                <input
                  name="label"
                  defaultValue={row.guest_label_override ?? ""}
                  placeholder={
                    familyLabel(
                      row.guest_first_name,
                      row.guest_last_name ?? null
                    ) ?? "Guest"
                  }
                  title='Name shown on the TV signage — blank uses the Guesty-derived family name (e.g. "The Wambolts")'
                  className="w-44 rounded-lg border border-sand-300 px-2.5 py-1.5 text-sm outline-none focus:border-ocean-500"
                />
                <button
                  type="submit"
                  className="rounded-full border border-sand-300 px-3 py-1.5 text-sm font-semibold text-ocean-700 transition hover:bg-sand-100"
                >
                  Save signage name
                </button>
              </ApiForm>
            </div>
            {liveToken(row) ? (
              <span className="flex flex-wrap gap-2">
                <a
                  href={`/host?minted=${encodeURIComponent(liveToken(row)!)}`}
                  className="rounded-full border border-seafoam-500 px-6 py-2 font-semibold text-ocean-700 transition hover:bg-ocean-50"
                >
                  Guest link ✓ — show QR
                </a>
                <a
                  href={`/host/print/${encodeURIComponent(liveToken(row)!)}`}
                  className="rounded-full border border-ocean-500 px-6 py-2 font-semibold text-ocean-700 transition hover:bg-ocean-50"
                >
                  Print card
                </a>
              </span>
            ) : (
              <ApiForm
                op="mint"
                endpoint="/api/host/dashboard"
                successText="Minted"
              >
                <input type="hidden" name="reservationId" value={row.id} />
                <input type="hidden" name="checkOut" value={row.check_out} />
                <button
                  type="submit"
                  className="rounded-full bg-ocean-500 px-6 py-2 font-semibold text-white transition hover:bg-ocean-700"
                >
                  Mint guest QR
                </button>
              </ApiForm>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
