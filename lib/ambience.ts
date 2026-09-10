/**
 * Signage ambience — calm looping beds under `/tv` (occupied + vacant).
 *
 * Devin ask 2026-09-10: soft ocean + resonant sound-bath beds while guests
 * view the house guide. No commercial tracks, no YouTube rips. Every sample
 * is synthesized in-page with Web Audio (see `app/tv/ambience-player.tsx`
 * and `docs/AMBIENCE.md` for provenance).
 *
 * Client-safe: types, sanitizer, URL overrides, fixtures. Do not import
 * `lib/tv.ts` from here.
 *
 * Hypotheses
 *   H1  Fully Kiosk usually allows unmuted Web Audio; if the context starts
 *       suspended, the first remote/pointer event or a periodic resume
 *       recovers so a kiosk is never stuck silent.
 *   H2  Switching the TV to Roku (other HDMI) naturally silences Cast Pro.
 *       We still suspend on pagehide / hidden so we don't keep a graph
 *       running when this input isn't on screen.
 *   H3  Procedural filtered noise + sine clusters are calm enough — no
 *       binary WAV/MP3 in the repo.
 *   H4  Host CMS thumbnails (`?property=` / `?slide=`) stay silent so the
 *       editor doesn't blast office speakers. Real TV previews
 *       (`?preview=standby`) still play.
 */

export const AMBIENCE_BED_IDS = ["ocean", "bath", "horizon"] as const;
export type AmbienceBedId = (typeof AMBIENCE_BED_IDS)[number];
export type AmbienceBedChoice = "rotate" | AmbienceBedId;

export interface AmbienceSettings {
  /** Default on — hosts opt out per property. */
  enabled: boolean;
  /** Master gain 0–0.4. Default 0.16 is living-room quiet. */
  volume: number;
  /** `rotate` crossfades ocean ↔ baths every few minutes. */
  bed: AmbienceBedChoice;
}

export const DEFAULT_AMBIENCE: AmbienceSettings = {
  enabled: true,
  volume: 0.16,
  bed: "rotate",
};

/** How long a rotate dwell lasts before the next bed (ms). */
export const AMBIENCE_ROTATE_MS = 9 * 60_000;
/** Crossfade when rotating or the host picks a new bed (ms). */
export const AMBIENCE_FADE_MS = 16_000;

export const AMBIENCE_BEDS: {
  id: AmbienceBedId;
  label: string;
  blurb: string;
}[] = [
  {
    id: "ocean",
    label: "Ocean surf",
    blurb: "Soft barrier-island wash — low rumble, mid foam, no crash.",
  },
  {
    id: "bath",
    label: "Tide bowl",
    blurb: "Gentle 174 / 348 / 528 Hz sine cluster — sound-bath quiet.",
  },
  {
    id: "horizon",
    label: "Horizon bath",
    blurb: "285 / 396 Hz stack with a distant surf bed underneath.",
  },
];

export function isAmbienceBedId(v: unknown): v is AmbienceBedId {
  return (
    typeof v === "string" &&
    (AMBIENCE_BED_IDS as readonly string[]).includes(v)
  );
}

export function isAmbienceBedChoice(v: unknown): v is AmbienceBedChoice {
  return v === "rotate" || isAmbienceBedId(v);
}

/** Clamp host-entered JSON. Bad shapes become the quiet default — a
 *  broken knob must never blank or crash a TV. */
export function sanitizeAmbience(raw: unknown): AmbienceSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_AMBIENCE };
  const o = raw as Record<string, unknown>;
  const vol = Number(o.volume);
  let volume = DEFAULT_AMBIENCE.volume;
  if (Number.isFinite(vol)) {
    // Host form stores 0–40 as percent; API/settings store 0–0.4 gain.
    // Accept either so an older hand-edit still works.
    volume = vol > 1 ? vol / 100 : vol;
    volume = Math.min(0.4, Math.max(0, volume));
  }
  const bed = isAmbienceBedChoice(o.bed) ? o.bed : DEFAULT_AMBIENCE.bed;
  const enabled = o.enabled !== false && o.enabled !== 0 && o.enabled !== "off";
  return { enabled, volume, bed };
}

/**
 * URL overrides for kiosk QA and the smoke suite (no hardware):
 *   ?ambience=off|mute|0
 *   ?ambience=on
 *   ?ambience=ocean|bath|horizon|rotate
 *   ?volume=12   (percent, 0–40)
 *
 * A bed id forces playback even if the host muted — that's the demo/QA
 * path. `off` always wins.
 */
export function parseAmbienceQuery(
  search: string | URLSearchParams | null | undefined
): Partial<AmbienceSettings> | null {
  if (search == null) return null;
  const q =
    typeof search === "string"
      ? new URLSearchParams(
          search.startsWith("?") ? search.slice(1) : search
        )
      : search;
  const raw = (q.get("ambience") ?? "").trim().toLowerCase();
  const volRaw = q.get("volume");
  if (!raw && (volRaw == null || volRaw === "")) return null;

  const out: Partial<AmbienceSettings> = {};
  if (raw === "off" || raw === "mute" || raw === "0" || raw === "false") {
    out.enabled = false;
  } else if (raw === "on" || raw === "1" || raw === "true") {
    out.enabled = true;
  } else if (isAmbienceBedChoice(raw)) {
    out.enabled = true;
    out.bed = raw;
  }

  if (volRaw != null && volRaw !== "") {
    const n = Number(volRaw);
    if (Number.isFinite(n)) {
      const gain = n > 1 ? n / 100 : n;
      out.volume = Math.min(0.4, Math.max(0, gain));
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Host settings + optional URL override. `silent` (host thumbs) wins. */
export function resolveAmbience(
  raw: unknown,
  search?: string | URLSearchParams | null,
  silent = false
): AmbienceSettings {
  const base = sanitizeAmbience(raw);
  if (silent) return { ...base, enabled: false };
  const over = parseAmbienceQuery(search ?? null);
  if (!over) return base;
  return {
    enabled: over.enabled ?? base.enabled,
    volume: over.volume ?? base.volume,
    bed: over.bed ?? base.bed,
  };
}

export function firstRotateBed(): AmbienceBedId {
  return "ocean";
}

export function nextRotateBed(current: AmbienceBedId): AmbienceBedId {
  const i = AMBIENCE_BED_IDS.indexOf(current);
  return AMBIENCE_BED_IDS[(i + 1) % AMBIENCE_BED_IDS.length];
}

export type AmbienceFixtureResult = {
  name: string;
  pass: boolean;
  detail?: string;
};

/** Pure fixtures for `tests/ambience-smoke.mjs` (no browser, no Web Audio). */
export function runAmbienceFixtures(): AmbienceFixtureResult[] {
  const results: AmbienceFixtureResult[] = [];
  const check = (name: string, pass: boolean, detail = "") => {
    results.push({ name, pass, detail });
  };

  const d = sanitizeAmbience(null);
  check(
    "ambience default on + rotate",
    d.enabled && d.bed === "rotate" && d.volume === 0.16,
    `enabled=${d.enabled} bed=${d.bed} vol=${d.volume}`
  );
  check(
    "ambience host off",
    sanitizeAmbience({ enabled: false }).enabled === false
  );
  check(
    "ambience volume percent → gain",
    sanitizeAmbience({ volume: 20 }).volume === 0.2
  );
  check(
    "ambience volume clamp",
    sanitizeAmbience({ volume: 80 }).volume === 0.4
  );
  check(
    "ambience bad bed → rotate",
    sanitizeAmbience({ bed: "death-metal" }).bed === "rotate"
  );
  check(
    "ambience catalog has ocean + bath",
    AMBIENCE_BEDS.some((b) => b.id === "ocean") &&
      AMBIENCE_BEDS.some((b) => b.id === "bath")
  );

  const off = resolveAmbience({ enabled: true }, "ambience=off");
  check("ambience query off", off.enabled === false);

  const ocean = resolveAmbience({ enabled: false, bed: "rotate" }, "?ambience=ocean");
  check(
    "ambience query ocean forces on",
    ocean.enabled && ocean.bed === "ocean",
    `enabled=${ocean.enabled} bed=${ocean.bed}`
  );

  const bath = resolveAmbience(null, "ambience=bath");
  check("ambience query bath", bath.enabled && bath.bed === "bath");

  const silent = resolveAmbience(null, "ambience=ocean", true);
  check(
    "ambience thumbs stay silent",
    silent.enabled === false,
    `enabled=${silent.enabled}`
  );

  check(
    "ambience rotate order",
    nextRotateBed("ocean") === "bath" && nextRotateBed("horizon") === "ocean"
  );

  return results;
}
