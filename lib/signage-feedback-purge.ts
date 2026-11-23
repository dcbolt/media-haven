import { FEEDBACK_COMMENT_INSIGHT_RETENTION_DAYS } from "./signage-guards.ts";
import { supabaseAdmin } from "./supabase.ts";

/**
 * Deletes guest feedback rows older than the insight retention window.
 * **Disabled by default** — set ENABLE_SIGNAGE_FEEDBACK_PURGE=true only
 * after Devin explicitly approves (destructive).
 */
export async function purgeStaleFeedbackIfEnabled(): Promise<number> {
  if (process.env.ENABLE_SIGNAGE_FEEDBACK_PURGE !== "true") return 0;
  const db = supabaseAdmin();
  if (!db) return 0;
  const cutoff = new Date(
    Date.now() - FEEDBACK_COMMENT_INSIGHT_RETENTION_DAYS * 86_400_000
  ).toISOString();
  const { data, error } = await db
    .from("tv_feedback_submissions")
    .delete()
    .lt("created_at", cutoff)
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}