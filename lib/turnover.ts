import { supabaseAdmin } from "./supabase";

/**
 * Media-wipe turnover checklist (DECISIONS: "Turnover: sign out major apps;
 * confirm /tv still boots; remote present. Build into host dashboard. No v1
 * ADB productization."). Item list lives here so Grok/Caitlin can amend it
 * without schema changes — records store the items as answered.
 */

export const TURNOVER_ITEMS: { slug: string; label: string }[] = [
  { slug: "signout-netflix", label: "Netflix — signed out" },
  { slug: "signout-disney", label: "Disney+ — signed out" },
  { slug: "signout-hulu", label: "Hulu — signed out" },
  { slug: "signout-prime", label: "Prime Video — signed out" },
  { slug: "signout-max", label: "Max — signed out" },
  { slug: "signout-other", label: "YouTube & any other signed-in apps — signed out" },
  { slug: "tv-boots-guide", label: "TV boots back to the house guide (/tv)" },
  { slug: "remote-present", label: "Remote present, batteries good" },
];

export interface TurnoverRecord {
  id: string;
  property_id: string;
  property_name: string | null;
  items: Record<string, boolean>;
  notes: string | null;
  completed_at: string;
}

export async function recordTurnover(
  propertyId: string,
  items: Record<string, boolean>,
  notes: string | null
): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { error } = await db.from("turnover_checks").insert({
    property_id: propertyId,
    items,
    notes,
  });
  return !error;
}

export async function listRecentTurnovers(limit = 20): Promise<TurnoverRecord[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from("turnover_checks")
    .select("id, property_id, items, notes, completed_at, properties (name)")
    .order("completed_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const property = Array.isArray(r.properties) ? r.properties[0] : r.properties;
    return {
      id: r.id,
      property_id: r.property_id,
      property_name: property?.name ?? null,
      items: (r.items ?? {}) as Record<string, boolean>,
      notes: r.notes,
      completed_at: r.completed_at,
    };
  });
}
