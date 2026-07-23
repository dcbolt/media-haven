import { redirect } from "next/navigation";
import { getReservationSources } from "@/lib/guesty";
import { isHostAuthenticated } from "@/lib/host-auth";
import { loadJoinedGroups } from "@/lib/joined-stays";
import { supabaseAdmin } from "@/lib/supabase";
import MultiCalendar, {
  type BookingSource,
  type CalBooking,
  type CalListing,
} from "./calendar";

export const dynamic = "force-dynamic";

/**
 * Multi-calendar (ported from HavenOps): every listing's bookings on one
 * horizontally scrollable timeline. Rows come from the properties table —
 * joined listings ("The Havens at the Dunes") render as bold Combined rows
 * with their member villas beneath, per the joinedStays config. Bookings
 * come from the Guesty-synced reservations table (live, read-only).
 */

interface PropRow {
  id: string;
  name: string;
  hero_image_url: string | null;
}

interface ResRow {
  id: string;
  guesty_id: string | null;
  property_id: string;
  guest_first_name: string | null;
  guest_last_name?: string | null;
  check_in: string;
  check_out: string;
  status: string;
}

function shortName(name: string): string {
  return name.split(" - ")[0].trim() || name;
}

/** Guesty source strings → our display buckets (mirrors HavenOps). */
function mapSource(src: string | undefined): BookingSource {
  const s = (src ?? "").toLowerCase();
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("vrbo") || s.includes("homeaway") || s.includes("expedia")) return "vrbo";
  if (s.includes("booking")) return "booking";
  return "direct";
}

export default async function CalendarPage() {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const db = supabaseAdmin();
  const serverToday = new Date().toISOString().slice(0, 10);
  if (!db) {
    return (
      <main className="mx-auto max-w-6xl p-4 pb-12 sm:p-6">
        <h1 className="text-3xl font-bold text-ocean-700">Multi-Calendar</h1>
        <p className="mt-4 text-ocean-900/60">
          Supabase isn&apos;t configured — the calendar needs the database.
        </p>
      </main>
    );
  }

  const windowStart = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const windowEnd = new Date(Date.now() + 141 * 86_400_000).toISOString();

  const [{ data: propData }, groups, resResult, sources] = await Promise.all([
    db.from("properties").select("id, name, hero_image_url").order("name"),
    loadJoinedGroups(),
    db
      .from("reservations")
      .select("id, guesty_id, property_id, guest_first_name, guest_last_name, check_in, check_out, status")
      .neq("status", "canceled")
      .lte("check_in", windowEnd)
      .gte("check_out", windowStart)
      .order("check_in"),
    getReservationSources(windowStart.slice(0, 10)),
  ]);
  // guest_last_name arrives with migration 0014; retry without it until then.
  let resData = resResult.data as ResRow[] | null;
  if (resResult.error) {
    resData = (
      await db
        .from("reservations")
        .select("id, guesty_id, property_id, guest_first_name, check_in, check_out, status")
        .neq("status", "canceled")
        .lte("check_in", windowEnd)
        .gte("check_out", windowStart)
        .order("check_in")
    ).data as ResRow[] | null;
  }

  const props = (propData ?? []) as PropRow[];
  const byId = new Map(props.map((p) => [p.id, p]));

  // Row order: each joined group (combined listing first, members after),
  // then remaining standalone properties alphabetically.
  const listings: CalListing[] = [];
  const placed = new Set<string>();
  for (const g of groups) {
    const parent = byId.get(g.joinedPropertyId);
    if (parent && !placed.has(parent.id)) {
      listings.push({
        id: parent.id,
        name: shortName(parent.name),
        kind: "combo",
        thumbUrl: parent.hero_image_url,
      });
      placed.add(parent.id);
    }
    for (const mid of g.memberPropertyIds) {
      const member = byId.get(mid);
      if (member && !placed.has(member.id)) {
        listings.push({
          id: member.id,
          name: shortName(member.name),
          kind: "single",
          thumbUrl: member.hero_image_url,
        });
        placed.add(member.id);
      }
    }
  }
  for (const p of props) {
    if (!placed.has(p.id)) {
      listings.push({
        id: p.id,
        name: shortName(p.name),
        kind: "single",
        thumbUrl: p.hero_image_url,
      });
    }
  }

  const bookings: CalBooking[] = ((resData ?? []) as ResRow[]).map((r) => ({
    id: r.id,
    listingId: r.property_id,
    guest:
      [r.guest_first_name, r.guest_last_name ? `${r.guest_last_name[0]}.` : null]
        .filter(Boolean)
        .join(" ") || "Guest",
    source: mapSource(r.guesty_id ? sources.get(r.guesty_id) : undefined),
    start: String(r.check_in).slice(0, 10),
    end: String(r.check_out).slice(0, 10),
  }));

  return (
    <main className="mx-auto max-w-6xl p-4 pb-12 sm:p-6">
      <header>
        <h1 className="text-3xl font-bold text-ocean-700">Multi-Calendar</h1>
        <p className="mt-1 text-sm text-ocean-900/60">
          {listings.length} listings · live from Guesty sync · scroll sideways
          to see the months ahead.
        </p>
      </header>
      <div className="mt-6">
        <MultiCalendar
          listings={listings}
          bookings={bookings}
          serverToday={serverToday}
        />
      </div>
    </main>
  );
}
