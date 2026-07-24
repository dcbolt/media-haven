/**
 * S4.1 priority-stack visual — "why is this slide showing?"
 *
 * Server-computed decision trace for a property. Mirrors TV precedence:
 *   emergency takeover > campaign > playlist (guest or vacant) > daypart
 *   filter > launch-weight boost > built-in default
 *
 * Pure helpers + one org/property read path; no device pixels (S4.6).
 */

import { ACTIVE_STAY_STATUSES } from "./guesty";
import {
  loadCampaigns,
  pickActiveCampaign,
  type Campaign,
} from "./campaigns";
import { daypartOf } from "./tv-now-playing";
import { loadEmergencyTakeover, type EmergencyTakeover } from "./takeover";
import { signagePlaylist, type SignagePlaylist } from "./tv";
import { supabaseAdmin } from "./supabase";

export type LayerStatus = "winning" | "shadowed" | "idle";

export type PriorityLayer = {
  /** 1 = highest precedence */
  rank: number;
  id: string;
  title: string;
  status: LayerStatus;
  detail: string;
};

export type PriorityStack = {
  propertyId: string;
  /** Human one-liner for the host. */
  summary: string;
  daypart: "morning" | "afternoon" | "evening";
  layers: PriorityLayer[];
};

function countActiveBlocks(pl: SignagePlaylist | null, daypart: string): number {
  if (!pl?.items?.length) return 0;
  return pl.items.filter((it) => !it.daypart || it.daypart === daypart).length;
}

/**
 * Build the decision stack for one property.
 * `occupied` false → vacant path; true → guest path.
 */
export function buildPriorityStack(args: {
  propertyId: string;
  occupied: boolean;
  settings: unknown;
  takeover: EmergencyTakeover | null;
  campaign: Campaign | null;
  now?: Date;
}): PriorityStack {
  const now = args.now ?? new Date();
  const daypart = daypartOf(now);
  const settings =
    args.settings && typeof args.settings === "object"
      ? (args.settings as Record<string, unknown>)
      : null;

  const guestPl = signagePlaylist(settings?.playlist);
  const vacantPl = signagePlaylist(settings?.vacantPlaylist);
  const campaign = args.campaign;
  const takeover = args.takeover;

  let winner: string | null = null;
  if (takeover) winner = "takeover";
  else if (!args.occupied) {
    winner = vacantPl?.items?.length ? "vacant" : "vacant-default";
  } else if (campaign) winner = "campaign";
  else if (guestPl?.items?.length) winner = "playlist";
  else winner = "default";

  const layers: PriorityLayer[] = [
    {
      rank: 1,
      id: "takeover",
      title: "Emergency takeover",
      status: takeover
        ? winner === "takeover"
          ? "winning"
          : "shadowed"
        : "idle",
      detail: takeover
        ? `${takeover.kind}: “${takeover.title}” until ${new Date(
            takeover.until
          ).toLocaleString()}`
        : "No active storm/water/custom message",
    },
    {
      rank: 2,
      id: "campaign",
      title: "Calendar campaign",
      status: !args.occupied
        ? "idle"
        : campaign
          ? winner === "campaign"
            ? "winning"
            : "shadowed"
          : "idle",
      detail: !args.occupied
        ? "Guest campaigns pause while vacant"
        : campaign
          ? `“${campaign.name}” ${campaign.startDate} → ${campaign.endDate} · ${campaign.playlist.items.length} blocks`
          : "No campaign window covers this property today",
    },
    {
      rank: 3,
      id: args.occupied ? "playlist" : "vacant",
      title: args.occupied ? "Published guest playlist" : "Vacant playlist",
      status: args.occupied
        ? guestPl?.items?.length
          ? winner === "playlist"
            ? "winning"
            : "shadowed"
          : "idle"
        : vacantPl?.items?.length
          ? winner === "vacant"
            ? "winning"
            : "shadowed"
          : "idle",
      detail: args.occupied
        ? guestPl?.items?.length
          ? `${guestPl.items.length} blocks published · ${countActiveBlocks(
              guestPl,
              daypart
            )} in ${daypart}`
          : "No custom playlist — falls through to default"
        : vacantPl?.items?.length
          ? `${vacantPl.items.length} vacant blocks`
          : "No vacant pack — standby ambience / photos",
    },
    {
      rank: 4,
      id: "daypart",
      title: "Daypart filter",
      status:
        winner === "playlist" || winner === "campaign"
          ? "winning"
          : "idle",
      detail: `Now: ${daypart} (morning 5–11 · afternoon 12–16 · evening 17+) — blocks outside the window park in the menu`,
    },
    {
      rank: 5,
      id: "launch-weight",
      title: "Launch-window auto-weight",
      status: "idle",
      detail:
        "When a Cape launch is within 24h, launch-board plays earlier/more often (S1.6) — does not change which playlist wins",
    },
    {
      rank: 6,
      id: "default",
      title: "Built-in default rotation",
      status: winner === "default" || winner === "vacant-default" ? "winning" : "idle",
      detail: args.occupied
        ? "Welcome · Wi‑Fi · beach · rockets · entertainment…"
        : "Screensavers / property photos when vacant pack is empty",
    },
  ];

  // Mark daypart as shadowed when a higher layer is winning (takeover).
  if (winner === "takeover") {
    for (const L of layers) {
      if (L.id === "daypart" && L.status === "winning") L.status = "shadowed";
    }
  }

  const win = layers.find((L) => L.status === "winning");
  const summary = win
    ? `Now deciding: ${win.title} — ${win.detail}`
    : "Now deciding: default rotation";

  return {
    propertyId: args.propertyId,
    summary,
    daypart,
    layers,
  };
}

/** Load stack for the signage editor (one property). */
export async function loadPriorityStackForProperty(
  propertyId: string
): Promise<PriorityStack | null> {
  const db = supabaseAdmin();
  if (!db) return null;

  const [{ data: prop }, takeover, campaigns] = await Promise.all([
    db.from("properties").select("id, settings").eq("id", propertyId).maybeSingle(),
    loadEmergencyTakeover(),
    loadCampaigns(),
  ]);
  if (!prop) return null;

  const nowIso = new Date().toISOString();
  const { data: stay } = await db
    .from("reservations")
    .select("id")
    .eq("property_id", propertyId)
    .in("status", ACTIVE_STAY_STATUSES)
    .lte("check_in", nowIso)
    .gte("check_out", nowIso)
    .limit(1)
    .maybeSingle();

  const occupied = Boolean(stay);
  const campaign = pickActiveCampaign(campaigns, propertyId);

  return buildPriorityStack({
    propertyId,
    occupied,
    settings: prop.settings,
    takeover,
    campaign,
  });
}
