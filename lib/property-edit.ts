import { STREAMING_SERVICES } from "./streaming";
import { supabaseAdmin } from "./supabase";

/**
 * Property/section edit operations for the host CMS, extracted from the old
 * server actions in app/host/properties/actions.ts. Plain functions called
 * from POST /api/host/property — server actions are bound to a deployment
 * via encrypted action ids, and with our merge-to-deploy cadence a host's
 * open editor tab went stale mid-session and edits silently dropped (the
 * exact failure that ate signage publishes, host 2026-07-20).
 *
 * Each op returns { ok } or { ok: false, error } — no redirects; the client
 * form wrapper shows the result in place and refreshes the page data.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EditResult = { ok: true } | { ok: false; error: string };

/** null when blank so cleared fields store NULL, not empty strings. */
function text(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v.length > 0 ? v : null;
}

function category(formData: FormData): string | null {
  const v = String(formData.get("category") ?? "");
  return v === "dining" || v === "nearby" ? v : null;
}

function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return s || "section";
}

function ids(formData: FormData, withSection: boolean): string[] | null {
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!UUID_RE.test(propertyId)) return null;
  if (!withSection) return [propertyId];
  const sectionId = String(formData.get("sectionId") ?? "");
  if (!UUID_RE.test(sectionId)) return null;
  return [propertyId, sectionId];
}

export async function updateProperty(formData: FormData): Promise<EditResult> {
  const id = ids(formData, false);
  if (!id) return { ok: false, error: "bad property id" };
  const [propertyId] = id;
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "database unavailable" };

  const fields = {
    wifi_ssid: text(formData, "wifi_ssid"),
    wifi_password: text(formData, "wifi_password"),
    hero_image_url: text(formData, "hero_image_url"),
    logo_url: text(formData, "logo_url"),
    house_rules: text(formData, "house_rules"),
    local_guide: text(formData, "local_guide"),
    emergency_info: text(formData, "emergency_info"),
  };
  const num = (key: string): number | undefined => {
    const v = Number(String(formData.get(key) ?? "").trim());
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  // Merge over the stored settings: this form only edits some keys, and a
  // whole-object replace would silently wipe the others (e.g. the signage
  // editor's playlist + history).
  const { data: existingRow } = await db
    .from("properties")
    .select("settings")
    .eq("id", propertyId)
    .maybeSingle();
  const prevSettings =
    existingRow?.settings && typeof existingRow.settings === "object"
      ? (existingRow.settings as Record<string, unknown>)
      : {};
  const settings = {
    ...prevSettings,
    // Short signage title — TVs/portal show this instead of the SEO-length
    // Guesty listing name. Blank = auto-trim at the first dash.
    displayName: text(formData, "display_name"),
    // Rotation pacing; blanks fall back to the 20s / 2.5s defaults.
    signage: {
      slideSeconds: num("slide_seconds"),
      fadeSeconds: num("fade_seconds"),
    },
    feeds: {
      weather: formData.get("feed_weather") === "on",
      tides: formData.get("feed_tides") === "on",
      launches: formData.get("feed_launches") === "on",
      turtles: formData.get("feed_turtles") === "on",
    },
    streaming: Object.fromEntries(
      STREAMING_SERVICES.map((s) => [
        s.slug,
        formData.get(`stream_${s.slug}`) === "on",
      ])
    ),
  };
  let { error } = await db
    .from("properties")
    .update({ ...fields, settings })
    .eq("id", propertyId);
  if (error) {
    // settings column arrives with migration 0011 — until it runs, save the
    // rest and let the feed toggles no-op instead of failing the whole form.
    ({ error } = await db
      .from("properties")
      .update(fields)
      .eq("id", propertyId));
  }
  return error ? { ok: false, error: "save failed" } : { ok: true };
}

export async function addSection(formData: FormData): Promise<EditResult> {
  const id = ids(formData, false);
  if (!id) return { ok: false, error: "bad property id" };
  const [propertyId] = id;
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "database unavailable" };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return { ok: false, error: "title and body required" };

  const { data: existing } = await db
    .from("property_sections")
    .select("sort")
    .eq("property_id", propertyId)
    .order("sort", { ascending: false })
    .limit(1);
  const nextSort = (existing?.[0]?.sort ?? -1) + 1;

  const { error } = await db.from("property_sections").insert({
    property_id: propertyId,
    slug: slugify(title),
    title,
    body,
    sort: nextSort,
    show_on_tv: formData.get("show_on_tv") === "on",
    category: category(formData),
  });
  return error ? { ok: false, error: "add failed" } : { ok: true };
}

export async function updateSection(formData: FormData): Promise<EditResult> {
  const id = ids(formData, true);
  if (!id) return { ok: false, error: "bad id" };
  const [propertyId, sectionId] = id;
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "database unavailable" };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return { ok: false, error: "title and body required" };

  const { error } = await db
    .from("property_sections")
    .update({
      title,
      body,
      show_on_tv: formData.get("show_on_tv") === "on",
      category: category(formData),
    })
    .eq("id", sectionId)
    .eq("property_id", propertyId);
  return error ? { ok: false, error: "save failed" } : { ok: true };
}

export async function deleteSection(formData: FormData): Promise<EditResult> {
  const id = ids(formData, true);
  if (!id) return { ok: false, error: "bad id" };
  const [propertyId, sectionId] = id;
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "database unavailable" };

  const { error } = await db
    .from("property_sections")
    .delete()
    .eq("id", sectionId)
    .eq("property_id", propertyId);
  return error ? { ok: false, error: "delete failed" } : { ok: true };
}

export async function moveSection(formData: FormData): Promise<EditResult> {
  const id = ids(formData, true);
  if (!id) return { ok: false, error: "bad id" };
  const [propertyId, sectionId] = id;
  const dir = String(formData.get("dir") ?? "");
  if (!["up", "down"].includes(dir)) return { ok: false, error: "bad id" };
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "database unavailable" };

  const { data: sections } = await db
    .from("property_sections")
    .select("id, sort")
    .eq("property_id", propertyId)
    .order("sort");
  const list = sections ?? [];
  const idx = list.findIndex((s) => s.id === sectionId);
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapWith < 0 || swapWith >= list.length) {
    return { ok: true }; // already at the edge — nothing to do
  }

  // Normalize sorts to their index first so duplicate values can't wedge
  // the ordering, then swap the two neighbors.
  const updates = list.map((s, i) => ({ id: s.id, sort: i }));
  updates[idx].sort = swapWith;
  updates[swapWith].sort = idx;
  for (const u of updates) {
    await db.from("property_sections").update({ sort: u.sort }).eq("id", u.id);
  }
  return { ok: true };
}
