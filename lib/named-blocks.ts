/**
 * Guesty calendar **manual blocks** → occupancy.
 *
 * Hypothesis (2026-09-10): hosts paint real in-house stays (owner friends,
 * comps) as Guesty *manual blocks* and put the guest name in the block
 * title/note — e.g. "Patrick Dunn" on The Dunes / Turtle / Shell. Those
 * events live on the availability calendar (`blocks.m` + `note`), not the
 * reservations API, so reservation sync/webhooks never see them and /tv
 * stays vacant.
 *
 * Rule:
 *   - A calendar block of type `m` (manual), `o` (owner), or `ic` (iCal)
 *     whose note/title looks like a **person name** is treated as a guest
 *     stay (same occupancy window + welcome as a reservation).
 *   - Unnamed / operational blocks (empty note, "maintenance", "blocked",
 *     "owner stay", …) stay **vacant**. They are availability holds only.
 *   - Reservation-backed refs (`b` / `r`, or any ref with reservationId)
 *     are ignored here — the reservations table already owns those.
 *
 * Storage (no new table — DB hands-off): upsert into `reservations` with
 * `guesty_id = gblock:{blockId}` and status `confirmed`, so every existing
 * occupancy consumer (TV, mode-hooks, joined-stays auto, fleet) just works.
 * Listing → property mapping is the same `properties.guesty_id` join used
 * for bookings (Dunes combo vs Turtle/Shell members included).
 */

export const GUESTY_BLOCK_PREFIX = "gblock:";

/** Block types that can carry a host-typed title (not a booking). */
export const NAMED_BLOCK_TYPES = new Set(["m", "o", "ic"]);

const OPERATIONAL_WORDS = new Set([
  "block",
  "blocked",
  "blocking",
  "unavailable",
  "maintenance",
  "owner",
  "owners",
  "owner's",
  "cleaning",
  "turnover",
  "prep",
  "prepare",
  "hold",
  "held",
  "closed",
  "close",
  "repair",
  "repairs",
  "renovation",
  "reno",
  "reserved",
  "reserve",
  "internal",
  "offline",
  "down",
  "paint",
  "painting",
  "inspection",
  "placeholder",
  "test",
  "testing",
  "tbd",
  "n/a",
  "na",
  "xxx",
  "stay",
  "stays",
  "manual",
  "calendar",
  "update",
  "updated",
  "comp",
  "complimentary",
  "friends",
  "family",
  "guest",
  "guests",
  "holdover",
]);

const TITLE_PREFIXES = new Set(["dr", "mr", "mrs", "ms", "miss", "prof", "sir"]);

const NOTE_PREFIX_RE =
  /^(owner|owners|block|blocked|comp|complimentary|friends?|family|guest|hold|manual)\s*[-–—:|/]\s*/i;

export type NamedBlockStay = {
  blockId: string;
  listingId: string;
  note: string;
  guestFirstName: string;
  guestLastName: string | null;
  /** Inclusive stay start (ISO). */
  checkIn: string;
  /** Exclusive-ish checkout (ISO) — occupied while now <= checkOut. */
  checkOut: string;
};

export function isGuestyBlockId(guestyId: string | null | undefined): boolean {
  return Boolean(guestyId?.startsWith(GUESTY_BLOCK_PREFIX));
}

export function blockGuestyId(blockId: string): string {
  return blockId.startsWith(GUESTY_BLOCK_PREFIX)
    ? blockId
    : `${GUESTY_BLOCK_PREFIX}${blockId}`;
}

export function looksLikePersonName(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const text = raw.trim();
  if (!text || !/[A-Za-z]/.test(text)) return false;

  const cleaned = text.replace(NOTE_PREFIX_RE, "").trim();
  if (!cleaned) return false;

  const tokens = cleaned
    .split(/[\s,;/|]+/)
    .map((t) => t.replace(/^[("']+|[)"'.]+$/g, ""))
    .filter(Boolean);
  const meaningful = tokens.filter((t) => {
    const key = t.toLowerCase().replace(/[.]/g, "");
    return !OPERATIONAL_WORDS.has(key) && !TITLE_PREFIXES.has(key);
  });
  if (meaningful.length === 0) return false;

  const nameLike = meaningful.filter(
    (t) => t.length >= 2 && /^[A-Za-z][A-Za-z'.\-]*$/.test(t)
  );
  if (nameLike.length === 0) return false;
  if (nameLike.length >= 2) return true;

  // Single leftover token: require Title-case (Patrick, McKenna, O'Brien).
  const one = nameLike[0];
  return /^[A-Z]([a-z].+|[A-Z][a-z].*|[a-z]*[''][A-Z].+)$/.test(one);
}

export function parseGuestFromNote(note: string): {
  first: string;
  last: string | null;
} {
  const cleaned = note.trim().replace(NOTE_PREFIX_RE, "").trim() || note.trim();
  const words = cleaned
    .split(/[\s,;/|]+/)
    .map((t) => t.replace(/^[("']+|[)"'.]+$/g, ""))
    .filter(Boolean)
    .filter((t) => {
      const key = t.toLowerCase().replace(/[.]/g, "");
      return !OPERATIONAL_WORDS.has(key) && !TITLE_PREFIXES.has(key);
    });
  if (words.length === 0) {
    const fallback = cleaned.split(/\s+/)[0] ?? "Guest";
    return { first: fallback, last: null };
  }
  if (words.length === 1) return { first: words[0], last: null };
  return { first: words[0], last: words[words.length - 1] };
}

/** Florida Havens civil time → ISO. Used when Guesty only gives date-only. */
export function floridaCivilIso(
  ymd: string,
  hour: number,
  minute: number
): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  for (const offset of ["-04:00", "-05:00"] as const) {
    const dt = new Date(`${ymd}T${hh}:${mm}:00${offset}`);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(dt);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    if (
      get("year") === String(y) &&
      get("month") === String(mo).padStart(2, "0") &&
      get("day") === String(d).padStart(2, "0") &&
      get("hour") === hh &&
      get("minute") === mm
    ) {
      return dt.toISOString();
    }
  }
  return new Date(`${ymd}T${hh}:${mm}:00-04:00`).toISOString();
}

function asYmd(isoOrDate: string): string {
  const slice = isoOrDate.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : "";
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function stayWindow(startYmd: string, lastNightYmd: string): {
  checkIn: string;
  checkOut: string;
} {
  const last = lastNightYmd >= startYmd ? lastNightYmd : startYmd;
  return {
    checkIn: floridaCivilIso(startYmd, 16, 0),
    checkOut: floridaCivilIso(addDaysYmd(last, 1), 10, 0),
  };
}

export function isInHouse(
  checkIn: string,
  checkOut: string,
  now: Date = new Date()
): boolean {
  const t = now.getTime();
  return new Date(checkIn).getTime() <= t && t <= new Date(checkOut).getTime();
}

type LooseRef = {
  _id?: string;
  id?: string;
  listingId?: string;
  type?: string;
  note?: string;
  title?: string;
  name?: string;
  comment?: string;
  startDate?: string;
  endDate?: string;
  reservationId?: string;
  reservation?: { _id?: string; guest?: { fullName?: string; firstName?: string } };
};

type LooseDay = {
  date?: string;
  listingId?: string;
  note?: string;
  title?: string;
  status?: string;
  blocks?: Record<string, boolean> | unknown;
  blockRefs?: LooseRef[];
  blockIds?: string[];
  reservationId?: string;
};

function refNote(ref: LooseRef): string {
  return String(ref.note ?? ref.title ?? ref.name ?? ref.comment ?? "").trim();
}

function refType(ref: LooseRef): string {
  return String(ref.type ?? "").toLowerCase();
}

function isReservationBacked(ref: LooseRef): boolean {
  const t = refType(ref);
  if (t === "b" || t === "r") return true;
  return Boolean(ref.reservationId || ref.reservation?._id);
}

function blockIdFor(ref: LooseRef, fallback: string): string {
  return String(ref._id ?? ref.id ?? fallback);
}

function collectDays(payload: unknown): {
  days: LooseDay[];
  blocks: Record<string, LooseRef>;
  listingId: string;
} {
  const blocks: Record<string, LooseRef> = {};
  let listingId = "";
  let days: LooseDay[] = [];

  if (!payload || typeof payload !== "object") {
    return { days, blocks, listingId };
  }
  const root = payload as Record<string, unknown>;

  if (typeof root.listingId === "string") listingId = root.listingId;
  const listing = root.listing;
  if (listing && typeof listing === "object") {
    const lid = (listing as { _id?: string })._id;
    if (lid && !listingId) listingId = lid;
  }

  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  const minified =
    data.days && typeof data.days === "object" && !Array.isArray(data.days)
      ? (data.days as Record<string, unknown>)
      : root.days && typeof root.days === "object" && !Array.isArray(root.days)
        ? (root.days as Record<string, unknown>)
        : null;

  if (minified) {
    if (typeof minified.listingId === "string" && !listingId) {
      listingId = minified.listingId;
    }
    if (Array.isArray(minified.calendar)) {
      days = minified.calendar as LooseDay[];
    }
    if (minified.blocks && typeof minified.blocks === "object") {
      Object.assign(blocks, minified.blocks as Record<string, LooseRef>);
    }
  }

  const arrayDays = Array.isArray(data.days)
    ? (data.days as LooseDay[])
    : Array.isArray(root.days)
      ? (root.days as LooseDay[])
      : Array.isArray(root.calendar)
        ? (root.calendar as LooseDay[])
        : [];
  if (arrayDays.length && days.length === 0) days = arrayDays;

  if (root.blocks && typeof root.blocks === "object" && !Array.isArray(root.blocks)) {
    Object.assign(blocks, root.blocks as Record<string, LooseRef>);
  }

  for (const day of days) {
    if (day.listingId && !listingId) listingId = day.listingId;
    for (const ref of day.blockRefs ?? []) {
      const id = ref._id ?? ref.id;
      if (id && !blocks[id]) blocks[id] = { ...ref, listingId: ref.listingId ?? day.listingId };
    }
  }

  return { days, blocks, listingId };
}

function dayIsManual(day: LooseDay): boolean {
  const b = day.blocks;
  if (b && typeof b === "object" && !Array.isArray(b)) {
    return Boolean((b as Record<string, boolean>).m);
  }
  return (day.blockRefs ?? []).some((r) => refType(r) === "m");
}

function namedStayFromRef(
  ref: LooseRef,
  listingId: string,
  occupiedYmds: string[]
): NamedBlockStay | null {
  if (isReservationBacked(ref)) return null;
  if (refType(ref) && !NAMED_BLOCK_TYPES.has(refType(ref))) return null;
  const note = refNote(ref);
  if (!looksLikePersonName(note)) return null;

  const dates = occupiedYmds.filter(Boolean).sort();
  const startFromRef = asYmd(ref.startDate ?? "");
  const endFromRef = asYmd(ref.endDate ?? "");
  const start = dates[0] || startFromRef;
  let lastNight = dates.length ? dates[dates.length - 1] : endFromRef || start;
  // Guesty block endDate is often the last occupied night (same as start
  // for a 1-night hold). If we only have start/end and end > start, treat
  // end as last night (not exclusive checkout).
  if (!dates.length && startFromRef && endFromRef && endFromRef < startFromRef) {
    lastNight = startFromRef;
  }
  if (!start) return null;

  const guest = parseGuestFromNote(note);
  const { checkIn, checkOut } = stayWindow(start, lastNight || start);
  const fallbackKey = `${listingId}:${start}:${lastNight}:${note.toLowerCase()}`;
  return {
    blockId: blockIdFor(ref, fallbackKey.replace(/[^a-z0-9:_-]+/gi, "-").slice(0, 64)),
    listingId: ref.listingId || listingId,
    note,
    guestFirstName: guest.first,
    guestLastName: guest.last,
    checkIn,
    checkOut,
  };
}

/**
 * Pull named guest-stays out of any Guesty calendar payload we know about:
 * legacy `days[]` + `blockRefs`, minified `view=full` `{ calendar, blocks }`,
 * or `listing.calendar.updated` webhook `{ calendar: [...] }`.
 */
export function namedBlocksFromCalendar(payload: unknown): NamedBlockStay[] {
  const { days, blocks, listingId } = collectDays(payload);
  const datesByBlock = new Map<string, Set<string>>();

  const remember = (id: string, date: string) => {
    if (!id || !date) return;
    const set = datesByBlock.get(id) ?? new Set<string>();
    set.add(date);
    datesByBlock.set(id, set);
  };

  for (const day of days) {
    const ymd = asYmd(day.date ?? "");
    for (const ref of day.blockRefs ?? []) {
      const id = ref._id ?? ref.id;
      if (id) remember(id, ymd);
    }
    for (const id of day.blockIds ?? []) remember(id, ymd);
  }

  const out = new Map<string, NamedBlockStay>();

  const consider = (ref: LooseRef) => {
    const id = ref._id ?? ref.id ?? "";
    const ymds = id ? [...(datesByBlock.get(id) ?? [])] : [];
    const stay = namedStayFromRef(ref, listingId, ymds);
    if (!stay) return;
    out.set(stay.blockId, stay);
  };

  for (const ref of Object.values(blocks)) consider(ref);
  for (const day of days) {
    for (const ref of day.blockRefs ?? []) consider(ref);
  }

  // Day-level notes with blocks.m and no structured ref (PUT calendar note).
  type Run = { note: string; listingId: string; dates: string[] };
  const runs: Run[] = [];
  let current: Run | null = null;
  const sortedDays = [...days].sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? "")
  );
  for (const day of sortedDays) {
    const ymd = asYmd(day.date ?? "");
    const note = String(day.note ?? day.title ?? "").trim();
    const covered = (day.blockIds ?? []).length > 0 || (day.blockRefs ?? []).length > 0;
    if (!ymd || covered || !dayIsManual(day) || !looksLikePersonName(note)) {
      if (current) {
        runs.push(current);
        current = null;
      }
      continue;
    }
    const lid = day.listingId || listingId;
    if (
      current &&
      current.note === note &&
      current.listingId === lid &&
      addDaysYmd(current.dates[current.dates.length - 1], 1) === ymd
    ) {
      current.dates.push(ymd);
    } else {
      if (current) runs.push(current);
      current = { note, listingId: lid, dates: [ymd] };
    }
  }
  if (current) runs.push(current);

  for (const run of runs) {
    const guest = parseGuestFromNote(run.note);
    const { checkIn, checkOut } = stayWindow(
      run.dates[0],
      run.dates[run.dates.length - 1]
    );
    const blockId = `day:${run.listingId}:${run.dates[0]}:${run.dates[run.dates.length - 1]}:${run.note.toLowerCase()}`
      .replace(/[^a-z0-9:_-]+/gi, "-")
      .slice(0, 80);
    if (!out.has(blockId)) {
      out.set(blockId, {
        blockId,
        listingId: run.listingId,
        note: run.note,
        guestFirstName: guest.first,
        guestLastName: guest.last,
        checkIn,
        checkOut,
      });
    }
  }

  return [...out.values()];
}

/** Occupancy pick used by fixtures: first in-house stay at `now`. */
export function inHouseNamedBlock(
  stays: NamedBlockStay[],
  now: Date = new Date()
): NamedBlockStay | null {
  const hits = stays.filter((s) => isInHouse(s.checkIn, s.checkOut, now));
  hits.sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  return hits[0] ?? null;
}

export type NamedBlockFixtureResult = {
  name: string;
  pass: boolean;
  detail?: string;
};

/** Deterministic fixtures — Patrick Dunn / unnamed vacant. */
export function runNamedBlockFixtures(): NamedBlockFixtureResult[] {
  const results: NamedBlockFixtureResult[] = [];
  const check = (name: string, pass: boolean, detail = "") => {
    results.push({ name, pass, detail });
  };

  check("person: Patrick Dunn", looksLikePersonName("Patrick Dunn"));
  check("person: Lili McDonald", looksLikePersonName("Lili McDonald"));
  check("person: Owner - Patrick Dunn", looksLikePersonName("Owner - Patrick Dunn"));
  check("person: single Patrick", looksLikePersonName("Patrick"));
  check("reject: empty", !looksLikePersonName(""));
  check("reject: maintenance", !looksLikePersonName("maintenance"));
  check("reject: Owner stay", !looksLikePersonName("Owner stay"));
  check("reject: Blocked", !looksLikePersonName("Blocked"));
  check("reject: test", !looksLikePersonName("test"));

  const now = new Date("2026-09-11T16:00:00-04:00");
  const minified = {
    days: {
      listingId: "listing-dunes",
      calendar: [
        { date: "2026-09-10", blocks: { m: true }, blockIds: ["blk-patrick"] },
        { date: "2026-09-11", blocks: { m: true }, blockIds: ["blk-patrick"] },
        { date: "2026-09-12", blocks: { m: true }, blockIds: ["blk-patrick"] },
        { date: "2026-09-13", blocks: { m: true }, blockIds: ["blk-patrick"] },
        { date: "2026-09-14", blocks: {}, blockIds: [] },
      ],
      blocks: {
        "blk-patrick": {
          _id: "blk-patrick",
          listingId: "listing-dunes",
          startDate: "2026-09-10T00:00:00.000Z",
          endDate: "2026-09-13T00:00:00.000Z",
          type: "m",
          note: "Patrick Dunn",
        },
      },
    },
  };
  const named = namedBlocksFromCalendar(minified);
  const hit = inHouseNamedBlock(named, now);
  check(
    "named block → guest view",
    Boolean(
      hit &&
        hit.guestFirstName === "Patrick" &&
        hit.guestLastName === "Dunn" &&
        isInHouse(hit.checkIn, hit.checkOut, now)
    ),
    hit
      ? `${hit.guestFirstName} ${hit.guestLastName} ${hit.checkIn.slice(0, 10)}→${hit.checkOut.slice(0, 10)}`
      : `stays=${named.length}`
  );

  const unnamed = namedBlocksFromCalendar({
    days: {
      listingId: "listing-turtle",
      calendar: [
        { date: "2026-09-10", blocks: { m: true }, blockIds: ["blk-maint"] },
        { date: "2026-09-11", blocks: { m: true }, blockIds: ["blk-maint"] },
      ],
      blocks: {
        "blk-maint": {
          _id: "blk-maint",
          listingId: "listing-turtle",
          startDate: "2026-09-10T00:00:00.000Z",
          endDate: "2026-09-11T00:00:00.000Z",
          type: "m",
          note: "maintenance",
        },
      },
    },
  });
  check(
    "unnamed block → vacant",
    unnamed.length === 0 && inHouseNamedBlock(unnamed, now) === null,
    `stays=${unnamed.length}`
  );

  const emptyNote = namedBlocksFromCalendar({
    calendar: [
      {
        date: "2026-09-11",
        listingId: "listing-shell",
        status: "unavailable",
        blocks: { m: true },
        blockRefs: [
          {
            _id: "blk-empty",
            type: "m",
            note: "",
            startDate: "2026-09-10",
            endDate: "2026-09-12",
          },
        ],
      },
    ],
    event: "listing.calendar.updated",
  });
  check("empty-note manual block → vacant", emptyNote.length === 0);

  const reservationRef = namedBlocksFromCalendar({
    data: {
      days: [
        {
          date: "2026-09-11",
          listingId: "listing-beach",
          blocks: { b: true },
          blockRefs: [
            {
              _id: "ref-res",
              type: "b",
              reservationId: "res-1",
              reservation: { _id: "res-1", guest: { fullName: "Calvina Bratcher" } },
              startDate: "2026-09-10",
              endDate: "2026-09-12",
            },
          ],
        },
      ],
    },
  });
  check(
    "reservation blockRef ignored (already a booking)",
    reservationRef.length === 0
  );

  return results;
}
