import { randomBytes } from "crypto";
import {
  propertySlugFromName,
  sanitizeAttributionTag,
} from "./qr-attribution-core.ts";
import { supabaseAdmin } from "./supabase.ts";

export interface PairedTvRef {
  deviceId: string;
  attributionTag: string;
  propertyId: string | null;
  propertySlug: string;
  orgId: string | null;
}

export function generateAttributionTag(): string {
  for (let i = 0; i < 8; i++) {
    const raw = randomBytes(8).toString("base64url").toLowerCase();
    const tag = raw.replace(/[^a-z0-9]/g, "").slice(0, 12);
    if (tag.length >= 10) return tag;
  }
  return randomBytes(6).toString("hex").slice(0, 12);
}

export async function ensureDeviceAttributionTag(
  deviceId: string
): Promise<string | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from("tv_devices")
    .select("attribution_tag")
    .eq("id", deviceId)
    .maybeSingle();
  const existing = sanitizeAttributionTag(data?.attribution_tag ?? null);
  if (existing) return existing;
  const tag = generateAttributionTag();
  const { data: updated, error } = await db
    .from("tv_devices")
    .update({ attribution_tag: tag })
    .eq("id", deviceId)
    .select("attribution_tag")
    .maybeSingle();
  if (error) {
    const msg = `${error.code ?? ""} ${error.message ?? ""}`;
    if (/attribution_tag/i.test(msg) || error.code === "PGRST204") return null;
    return null;
  }
  return sanitizeAttributionTag(updated?.attribution_tag ?? tag);
}

export async function resolvePairedTvByTag(
  rawTag: string | null | undefined
): Promise<PairedTvRef | null> {
  const tag = sanitizeAttributionTag(rawTag);
  if (!tag) return null;
  const db = supabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from("tv_devices")
    .select("id, attribution_tag, property_id")
    .eq("attribution_tag", tag)
    .maybeSingle();
  if (!data?.id || !data.property_id) return null;
  const { data: property } = await db
    .from("properties")
    .select("org_id, name")
    .eq("id", data.property_id)
    .maybeSingle();
  return {
    deviceId: String(data.id),
    attributionTag: String(data.attribution_tag),
    propertyId: String(data.property_id),
    propertySlug: property?.name
      ? propertySlugFromName(String(property.name))
      : "unknown",
    orgId: property?.org_id ? String(property.org_id) : null,
  };
}

export async function resolvePairedTvByDeviceId(
  deviceId: string | null | undefined
): Promise<PairedTvRef | null> {
  if (!deviceId) return null;
  const db = supabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from("tv_devices")
    .select("id, attribution_tag, property_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!data?.id || !data.property_id) return null;
  const tag = sanitizeAttributionTag(data.attribution_tag) ?? "";
  const { data: property } = await db
    .from("properties")
    .select("org_id, name")
    .eq("id", data.property_id)
    .maybeSingle();
  return {
    deviceId: String(data.id),
    attributionTag: tag,
    propertyId: String(data.property_id),
    propertySlug: property?.name
      ? propertySlugFromName(String(property.name))
      : "unknown",
    orgId: property?.org_id ? String(property.org_id) : null,
  };
}