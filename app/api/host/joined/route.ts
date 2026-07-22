import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { getFloridaHavensOrgId } from "@/lib/org";
import {
  joinedGroupsStatus,
  loadJoinedGroups,
  sanitizeJoinedGroup,
  saveJoinedGroups,
  type JoinedMode,
} from "@/lib/joined-stays";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * J1 joined stays — manage the dual-property groups ("The Havens at the
 * Dunes", "The Havens at Beach Street").
 * GET  — groups with live activity + all properties (for the pickers)
 * POST — { op: "upsert", group } | { op: "set-mode", key, mode } |
 *        { op: "delete", key }
 */

export async function GET() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = getFloridaHavensOrgId();
  const groups = await joinedGroupsStatus(orgId);
  const db = supabaseAdmin();
  const { data } = db
    ? await db.from("properties").select("id, name").order("name")
    : { data: null };
  return NextResponse.json({ ok: true, groups, properties: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = getFloridaHavensOrgId();
  const body = (await req.json().catch(() => ({}))) as {
    op?: string;
    key?: string;
    mode?: string;
    group?: unknown;
  };

  const groups = await loadJoinedGroups(orgId);

  if (body.op === "upsert") {
    const group = sanitizeJoinedGroup(body.group);
    if (!group) {
      return NextResponse.json(
        { error: "invalid group (need key, name, joined property, members)" },
        { status: 400 }
      );
    }
    const next = groups.filter((g) => g.key !== group.key).concat(group);
    const result = await saveJoinedGroups(next, orgId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, groups: await joinedGroupsStatus(orgId) });
  }

  if (body.op === "set-mode") {
    const key = String(body.key ?? "").trim().toLowerCase();
    const modeRaw = String(body.mode ?? "");
    const mode: JoinedMode | null =
      modeRaw === "auto" || modeRaw === "on" || modeRaw === "off"
        ? modeRaw
        : null;
    const target = groups.find((g) => g.key === key);
    if (!target || !mode) {
      return NextResponse.json({ error: "unknown group or mode" }, { status: 400 });
    }
    target.mode = mode;
    const result = await saveJoinedGroups(groups, orgId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, groups: await joinedGroupsStatus(orgId) });
  }

  if (body.op === "delete") {
    const key = String(body.key ?? "").trim().toLowerCase();
    const next = groups.filter((g) => g.key !== key);
    if (next.length === groups.length) {
      return NextResponse.json({ error: "unknown group" }, { status: 400 });
    }
    const result = await saveJoinedGroups(next, orgId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, groups: await joinedGroupsStatus(orgId) });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
