"use server";

import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { STREAMING_SERVICES } from "@/lib/streaming";
import { supabaseAdmin } from "@/lib/supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(): Promise<void> {
  if (!(await isHostAuthenticated())) redirect("/host/login");
}

function back(propertyId: string, result: string): never {
  redirect(`/host/properties/${propertyId}?${result}`);
}

/** null when blank so cleared fields store NULL, not empty strings. */
function text(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v.length > 0 ? v : null;
}

export async function updatePropertyAction(formData: FormData) {
  await guard();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!UUID_RE.test(propertyId)) redirect("/host/properties?err=bad-property");
  const db = supabaseAdmin();
  if (!db) redirect("/host/properties?err=no-db");

  const fields = {
    wifi_ssid: text(formData, "wifi_ssid"),
    wifi_password: text(formData, "wifi_password"),
    hero_image_url: text(formData, "hero_image_url"),
    logo_url: text(formData, "logo_url"),
    house_rules: text(formData, "house_rules"),
    local_guide: text(formData, "local_guide"),
    emergency_info: text(formData, "emergency_info"),
  };
  const settings = {
    feeds: {
      weather: formData.get("feed_weather") === "on",
      tides: formData.get("feed_tides") === "on",
      launches: formData.get("feed_launches") === "on",
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
    ({ error } = await db.from("properties").update(fields).eq("id", propertyId));
  }
  back(propertyId, error ? "err=save-failed" : "ok=saved");
}

function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return s || "section";
}

export async function addSectionAction(formData: FormData) {
  await guard();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!UUID_RE.test(propertyId)) redirect("/host/properties?err=bad-property");
  const db = supabaseAdmin();
  if (!db) redirect("/host/properties?err=no-db");

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) back(propertyId, "err=title-and-body-required");

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
  });
  back(propertyId, error ? "err=add-failed" : "ok=section-added");
}

export async function updateSectionAction(formData: FormData) {
  await guard();
  const propertyId = String(formData.get("propertyId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  if (!UUID_RE.test(propertyId) || !UUID_RE.test(sectionId))
    redirect("/host/properties?err=bad-id");
  const db = supabaseAdmin();
  if (!db) redirect("/host/properties?err=no-db");

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) back(propertyId, "err=title-and-body-required");

  const { error } = await db
    .from("property_sections")
    .update({ title, body, show_on_tv: formData.get("show_on_tv") === "on" })
    .eq("id", sectionId)
    .eq("property_id", propertyId);
  back(propertyId, error ? "err=save-failed" : "ok=section-saved");
}

export async function deleteSectionAction(formData: FormData) {
  await guard();
  const propertyId = String(formData.get("propertyId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  if (!UUID_RE.test(propertyId) || !UUID_RE.test(sectionId))
    redirect("/host/properties?err=bad-id");
  const db = supabaseAdmin();
  if (!db) redirect("/host/properties?err=no-db");

  const { error } = await db
    .from("property_sections")
    .delete()
    .eq("id", sectionId)
    .eq("property_id", propertyId);
  back(propertyId, error ? "err=delete-failed" : "ok=section-deleted");
}

export async function moveSectionAction(formData: FormData) {
  await guard();
  const propertyId = String(formData.get("propertyId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  const dir = String(formData.get("dir") ?? "");
  if (!UUID_RE.test(propertyId) || !UUID_RE.test(sectionId) || !["up", "down"].includes(dir))
    redirect("/host/properties?err=bad-id");
  const db = supabaseAdmin();
  if (!db) redirect("/host/properties?err=no-db");

  const { data: sections } = await db
    .from("property_sections")
    .select("id, sort")
    .eq("property_id", propertyId)
    .order("sort");
  const list = sections ?? [];
  const idx = list.findIndex((s) => s.id === sectionId);
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapWith < 0 || swapWith >= list.length) {
    back(propertyId, "ok=saved"); // already at the edge — nothing to do
  }

  // Normalize sorts to their index first so duplicate values can't wedge
  // the ordering, then swap the two neighbors.
  const updates = list.map((s, i) => ({ id: s.id, sort: i }));
  updates[idx].sort = swapWith;
  updates[swapWith].sort = idx;
  for (const u of updates) {
    await db.from("property_sections").update({ sort: u.sort }).eq("id", u.id);
  }
  back(propertyId, "ok=saved");
}
