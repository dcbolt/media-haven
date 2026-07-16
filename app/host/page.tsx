import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { portalBaseUrl } from "@/lib/tokens";
import { mintTokenAction } from "./actions";

interface ReservationRow {
  id: string;
  guest_first_name: string | null;
  check_in: string;
  check_out: string;
  status: string;
  properties: { name: string } | { name: string }[] | null;
}

const MOCK_ROWS: ReservationRow[] = [
  {
    id: "mock-res-1",
    guest_first_name: "Alex",
    check_in: new Date(Date.now() - 86400_000).toISOString(),
    check_out: new Date(Date.now() + 3 * 86400_000).toISOString(),
    status: "confirmed",
    properties: { name: "Turtle Tide Cottage" },
  },
];

async function loadReservations(): Promise<{ rows: ReservationRow[]; live: boolean }> {
  const db = supabaseAdmin();
  if (!db) return { rows: MOCK_ROWS, live: false };
  const { data } = await db
    .from("reservations")
    .select("id, guest_first_name, check_in, check_out, status, properties (name)")
    .order("check_in", { ascending: false })
    .limit(50);
  return { rows: (data as ReservationRow[] | null) ?? [], live: true };
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
  searchParams: Promise<{ minted?: string }>;
}) {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const { minted } = await searchParams;
  const { rows, live } = await loadReservations();
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
          </div>
        ))}
      </section>
    </main>
  );
}
