"use server";

import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { signagePlaylist } from "@/lib/tv";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(propertyId: string, result: string): never {
  redirect(`/host/signage?property=${propertyId}&${result}`);
}

/** Publish the timeline: settings.playlist = { items, photos }, or null to
 *  restore the default rotation. TVs pick the change up within one poll. */
export async function publishPlaylistAction(formData: FormData) {
  if (!(await isHostAuthenticated())) redirect("/host/login");
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!UUID_RE.test(propertyId)) redirect("/host/signage?err=bad-property");
  const db = supabaseAdmin();
  if (!db) redirect("/host/signage?err=no-db");

  let playlist: unknown = null;
  if (formData.get("reset") !== "1") {
    try {
      playlist = signagePlaylist(
        JSON.parse(String(formData.get("playlist") ?? "null"))
      );
    } catch {
      back(propertyId, "err=bad-playlist");
    }
    if (!playlist) back(propertyId, "err=empty-playlist");
  }

  // Merge over stored settings — this action owns only the playlist key.
  const { data: row } = await db
    .from("properties")
    .select("settings")
    .eq("id", propertyId)
    .maybeSingle();
  const prev =
    row?.settings && typeof row.settings === "object"
      ? (row.settings as Record<string, unknown>)
      : {};
  const { error } = await db
    .from("properties")
    .update({ settings: { ...prev, playlist } })
    .eq("id", propertyId);
  back(
    propertyId,
    error ? "err=save-failed" : playlist ? "ok=published" : "ok=reset"
  );
}
