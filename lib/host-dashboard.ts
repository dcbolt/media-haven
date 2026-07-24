import { ACTIVE_STAY_STATUSES } from "./guesty";
import { loadJoinedGroups } from "./joined-stays";
import { supabaseAdmin } from "./supabase";

/**
 * Host-dashboard intel (host request 2026-07-24): the one-glance numbers a
 * host actually runs the day from. Units are the four rentable villas —
 * combined listings aren't counted as units, but their bookings occupy
 * both member villas (joinedStays config drives the expansion).
 *
 * "Flags" are what the synced Guesty data supports today: pending
 * inquiries, bookings created in the last 24h, and same-day turnovers.
 */

export interface StayBrief {
  guest: string;
  property: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
}

export interface DashboardIntel {
  units: { total: number; rentedTonight: number; openTonight: number };
  checkInsToday: StayBrief[];
  checkOutsToday: StayBrief[];
  /** Property names with a checkout AND a check-in today — cleaning crunch. */
  sameDayTurnovers: string[];
  /** Pending inquiries on upcoming dates (Guesty status "inquiry"). */
  inquiries: StayBrief[];
  /** Bookings that appeared in the last 24h. */
  newBookings: StayBrief[];
  /** Next 14 days: how many of the villas are booked each night. */
  occupancy: { date: string; occupied: number; total: number }[];
}

interface ResRow {
  property_id: string;
  guest_first_name: string | null;
  check_in: string;
  check_out: string;
  status: string;
  created_at?: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function loadDashboardIntel(): Promise<DashboardIntel | null> {
  const db = supabaseAdmin();
  if (!db) return null;

  const today = ymd(new Date());
  const stripEnd = ymd(new Date(Date.now() + 14 * 86_400_000));

  const [{ data: propData }, groups, { data: resRaw }, { data: inqRaw }] =
    await Promise.all([
      db.from("properties").select("id, name"),
      loadJoinedGroups(),
      db
        .from("reservations")
        .select("property_id, guest_first_name, check_in, check_out, status, created_at")
        .in("status", ACTIVE_STAY_STATUSES)
        .gte("check_out", today)
        .lte("check_in", stripEnd),
      db
        .from("reservations")
        .select("property_id, guest_first_name, check_in, check_out, status")
        .eq("status", "inquiry")
        .gte("check_out", today)
        .order("check_in")
        .limit(8),
    ]);

  const props = propData ?? [];
  const nameOf = new Map(
    props.map((p) => [p.id as string, String(p.name).split(" - ")[0].trim()])
  );

  // Units = villas that guests physically stay in. Combined listings are
  // sales wrappers, not extra beds — exclude them from the unit count and
  // expand their bookings onto both member villas instead.
  const comboIds = new Set(groups.map((g) => g.joinedPropertyId));
  const comboMembers = new Map(
    groups.map((g) => [g.joinedPropertyId, g.memberPropertyIds])
  );
  const unitIds = props
    .map((p) => p.id as string)
    .filter((id) => !comboIds.has(id));

  const stays = (resRaw ?? []) as ResRow[];
  /** Villa-level occupation ranges (combined bookings expanded). */
  const unitStays: { unit: string; start: string; end: string; row: ResRow }[] = [];
  for (const r of stays) {
    const units = comboMembers.get(r.property_id) ?? [r.property_id];
    for (const unit of units) {
      unitStays.push({
        unit,
        start: String(r.check_in).slice(0, 10),
        end: String(r.check_out).slice(0, 10),
        row: r,
      });
    }
  }

  const occupiedUnitsOn = (date: string) =>
    new Set(
      unitStays
        .filter((s) => s.start <= date && s.end > date)
        .map((s) => s.unit)
    );

  const brief = (r: ResRow): StayBrief => ({
    guest: r.guest_first_name ?? "Guest",
    property: nameOf.get(r.property_id) ?? "—",
    checkIn: String(r.check_in).slice(0, 10),
    checkOut: String(r.check_out).slice(0, 10),
  });

  const checkInsToday = stays
    .filter((r) => String(r.check_in).slice(0, 10) === today)
    .map(brief);
  const checkOutsToday = stays
    .filter((r) => String(r.check_out).slice(0, 10) === today)
    .map(brief);
  const outProps = new Set(checkOutsToday.map((s) => s.property));
  const sameDayTurnovers = [
    ...new Set(checkInsToday.map((s) => s.property).filter((p) => outProps.has(p))),
  ];

  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const newBookings = stays
    .filter((r) => r.created_at && r.created_at >= dayAgo)
    .map(brief);

  const rentedTonight = occupiedUnitsOn(today).size;

  const occupancy = Array.from({ length: 14 }, (_, i) => {
    const date = ymd(new Date(Date.now() + i * 86_400_000));
    return { date, occupied: occupiedUnitsOn(date).size, total: unitIds.length };
  });

  return {
    units: {
      total: unitIds.length,
      rentedTonight,
      openTonight: Math.max(0, unitIds.length - rentedTonight),
    },
    checkInsToday,
    checkOutsToday,
    sameDayTurnovers,
    inquiries: ((inqRaw ?? []) as ResRow[]).map(brief),
    newBookings,
    occupancy,
  };
}
