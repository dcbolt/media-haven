/**
 * Tenant / org helpers (SAAS-ARCHITECTURE Phase A).
 *
 * Today there is one production org — Florida Havens (Tenant Zero). All
 * existing host/guest/TV paths resolve through that org. Multi-tenant SaaS
 * will pass real org ids from host sessions and PMS connections; until then
 * callers should use getFloridaHavensOrgId() for Tenant-Zero defaults.
 *
 * Never query properties/reservations/tvs across orgs without an org filter
 * once multi-tenant hosts exist. Service-role still bypasses RLS; isolation
 * is enforced in application code via these helpers.
 */

import { supabaseAdmin } from "./supabase";

/** Stable UUID from migration 0019_orgs_tenant_zero.sql */
export const FLORIDA_HAVENS_ORG_ID =
  "11111111-1111-4111-8111-111111111111" as const;

export const FLORIDA_HAVENS_SLUG = "florida-havens" as const;

export type OrgRow = {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
};

/** Tenant Zero id for FH paths (no DB round-trip). */
export function getFloridaHavensOrgId(): string {
  return FLORIDA_HAVENS_ORG_ID;
}

/**
 * Load an org by id. Returns null if Supabase is unconfigured or the row
 * is missing (e.g. migration 0019 not applied yet).
 */
export async function getOrgById(orgId: string): Promise<OrgRow | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data, error } = await db
    .from("orgs")
    .select("id, name, slug, settings, created_at")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  return data as OrgRow;
}

/** Resolve Florida Havens org row (or a synthetic stub when DB is mock). */
export async function getFloridaHavensOrg(): Promise<OrgRow> {
  const row = await getOrgById(FLORIDA_HAVENS_ORG_ID);
  if (row) return row;
  return {
    id: FLORIDA_HAVENS_ORG_ID,
    name: "Florida Havens",
    slug: FLORIDA_HAVENS_SLUG,
    settings: {
      bookBaseUrl: "https://www.thefloridahavens.com",
      brand: "florida-havens",
    },
    created_at: new Date(0).toISOString(),
  };
}

/**
 * Guard for host/API handlers: ensure a property belongs to the expected org.
 * Returns false if the property is missing or org_id mismatches.
 */
export async function propertyBelongsToOrg(
  propertyId: string,
  orgId: string
): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { data, error } = await db
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .maybeSingle();
  return !error && !!data;
}

/** Scope helper for queries that list properties for Tenant Zero. */
export function floridaHavensPropertyFilter(): {
  column: "org_id";
  value: string;
} {
  return { column: "org_id", value: FLORIDA_HAVENS_ORG_ID };
}
