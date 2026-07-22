import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import JoinedStaysPanel from "./joined-panel";

interface Row {
  id: string;
  name: string;
  wifi_ssid: string | null;
  hero_image_url: string | null;
  property_sections: { count: number }[];
}

/** CMS index: every property with its content status, linking to the editor. */
export default async function PropertiesPage() {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const db = supabaseAdmin();
  const { data } = db
    ? await db
        .from("properties")
        .select("id, name, wifi_ssid, hero_image_url, property_sections (count)")
        .order("name")
    : { data: null };
  const rows = (data ?? []) as Row[];

  return (
    <main className="mx-auto max-w-4xl p-4 pb-12 sm:p-6">
      <header>
        <h1 className="text-3xl font-bold text-ocean-700">Properties</h1>
      </header>
      <p className="mt-2 text-ocean-900/70">
        Everything the TVs and guest portal show, editable per property — no
        deploys. Names and photo sets stay synced from Guesty.
      </p>

      {!db && (
        <p className="mt-6 text-ocean-900/60">
          Supabase isn&apos;t configured — the property editor needs the
          database.
        </p>
      )}

      <div className="mt-6 space-y-3">
        {rows.map((p) => {
          const sections = p.property_sections?.[0]?.count ?? 0;
          return (
            <a
              key={p.id}
              href={`/host/properties/${p.id}`}
              className="flex items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-md transition hover:shadow-lg"
            >
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{p.name}</p>
                <p className="mt-1 text-sm text-ocean-900/60">
                  {p.wifi_ssid ? `Wi-Fi: ${p.wifi_ssid}` : "No Wi-Fi set"} ·{" "}
                  {sections} guide section{sections === 1 ? "" : "s"}
                  {p.hero_image_url ? "" : " · no hero photo"}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-ocean-500">
                Edit →
              </span>
            </a>
          );
        })}
      </div>

      {db && <JoinedStaysPanel />}
    </main>
  );
}
