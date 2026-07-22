import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import PropertiesIndex, { type PropertyRow } from "./index-client";

interface Row {
  id: string;
  name: string;
  wifi_ssid: string | null;
  hero_image_url: string | null;
  property_sections: { count: number }[];
}

/** CMS index: every property with its content status, linking to the editor.
 *  J1b: member properties nest under their combined listing ("The Havens at
 *  the Dunes") — the nesting configures the joined-stays TV takeover. */
export default async function PropertiesPage() {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const db = supabaseAdmin();
  const { data } = db
    ? await db
        .from("properties")
        .select("id, name, wifi_ssid, hero_image_url, property_sections (count)")
        .order("name")
    : { data: null };
  const rows: PropertyRow[] = ((data ?? []) as Row[]).map((p) => ({
    id: p.id,
    name: p.name,
    wifi_ssid: p.wifi_ssid,
    hero_image_url: p.hero_image_url,
    sections: p.property_sections?.[0]?.count ?? 0,
  }));

  return (
    <main className="mx-auto max-w-4xl p-4 pb-12 sm:p-6">
      <header>
        <h1 className="text-3xl font-bold text-ocean-700">Properties</h1>
      </header>
      <p className="mt-2 text-ocean-900/70">
        Everything the TVs and guest portal show, editable per property — no
        deploys. Names and photo sets stay synced from Guesty. Nest two
        Havens under their combined listing and every TV at both houses
        switches to it while it&apos;s rented.
      </p>

      {!db && (
        <p className="mt-6 text-ocean-900/60">
          Supabase isn&apos;t configured — the property editor needs the
          database.
        </p>
      )}

      <PropertiesIndex rows={rows} />
    </main>
  );
}
