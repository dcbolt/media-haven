import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { portalBaseUrl } from "@/lib/tokens";
import { mintTokenAction, pairTvAction, syncGuestyAction } from "./actions";

interface ReservationRow {
  id: string;
  guest_first_name: string | null;
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
  const { data } = await db
    .from("reservations")
    .select(
      "id, guest_first_name, check_in, check_out, status, properties (name), guest_tokens (token, expires_at)"
    )
    .in("status", ["confirmed", "reserved", "checked_in"])
    .gte("check_out", new Date().toISOString())
    .order("check_in", { ascending: true })
    .limit(50);
  return { rows: (data as ReservationRow[] | null) ?? [], live: true };
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
  return Array.isArray(row.properties)
    ? (row.properties[0]?.name ?? "—")
    : row.properties.name;
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
  }>;
}) {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const { minted, tv, sync, syncerr } = await searchParams;
  const [{ rows, live }, properties] = await Promise.all([
    loadReservations(),
    loadProperties(),
  ]);
  const base = portalBaseUrl();

  return (
    <main className="mx-auto max-w-3xl p-4 pb-12 sm:p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold text-ocean-700">Host dashboard</h1>
        {!live && (
          <span className="rounded-full bg-sand-100 px-3 py-1 text-sm font-semibold text-ocean-700">
            demo data — Supabase not configured
          </span>
        )}
      </header>

      {minted && (
        <section className="mt-6 rounded-2xl border-2 border-seafoam-500 bg-white p-6 shadow-md">
          <h2 className="text-xl font-bold text-ocean-700">Guest link ready</h2>
          <p className="mt-2 break-all font-mono text-lg">
            {base}/welcome?token={minted}
          </p>
          <div className="mt-4 flex items-center gap-6">
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
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ocean-700">Properties</h2>
            <p className="mt-1 text-ocean-900/60">
              {properties.length} in the portal. Guesty is the source of truth
              for names, photos, and per-property Wi-Fi once connected.
            </p>
          </div>
          <form action={syncGuestyAction}>
            <button
              type="submit"
              className="rounded-full bg-ocean-500 px-6 py-2 font-semibold text-white transition hover:bg-ocean-700"
            >
              Sync from Guesty
            </button>
          </form>
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
            TV paired — it switches to signage within 30 seconds.
          </p>
        )}
        {(tv === "failed" || tv === "invalid") && (
          <p className="mt-2 font-semibold text-red-600">
            That code didn&apos;t match an unpaired TV. Check the screen and try
            again{live ? "" : " (pairing needs Supabase configured)"}.
          </p>
        )}
        <form action={pairTvAction} className="mt-4 flex flex-wrap items-center gap-3">
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
            className="rounded-xl border border-sand-300 bg-white p-3 text-lg outline-none focus:border-ocean-500"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full bg-ocean-500 px-6 py-2 font-semibold text-white transition hover:bg-ocean-700"
          >
            Pair TV
          </button>
        </form>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-xl font-bold text-ocean-700">Reservations</h2>
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
              <form action={mintTokenAction}>
                <input type="hidden" name="reservationId" value={row.id} />
                <input type="hidden" name="checkOut" value={row.check_out} />
                <button
                  type="submit"
                  className="rounded-full bg-ocean-500 px-6 py-2 font-semibold text-white transition hover:bg-ocean-700"
                >
                  Mint guest QR
                </button>
              </form>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
