import Link from "next/link";
import { redirect } from "next/navigation";
import { signageName } from "@/lib/content";
import { isHostAuthenticated } from "@/lib/host-auth";
import { STREAMING_SERVICES } from "@/lib/streaming";
import { supabaseAdmin } from "@/lib/supabase";
import ApiForm from "../api-form";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PropertyRow {
  id: string;
  name: string;
  wifi_ssid: string | null;
  wifi_password: string | null;
  hero_image_url: string | null;
  logo_url: string | null;
  house_rules: string | null;
  local_guide: string | null;
  emergency_info: string | null;
  settings?: {
    displayName?: string | null;
    feeds?: Record<string, boolean>;
    streaming?: Record<string, boolean>;
    signage?: { slideSeconds?: number; fadeSeconds?: number };
  } | null;
}

interface SectionRow {
  id: string;
  slug: string;
  title: string;
  body: string;
  sort: number;
  show_on_tv: boolean;
  category: string | null;
}

function CategorySelect({ value }: { value: string | null }) {
  return (
    <select
      name="category"
      defaultValue={value ?? ""}
      className="rounded-xl border border-sand-300 bg-white p-2 outline-none focus:border-ocean-500"
      title="TV menu category"
    >
      <option value="">General guide</option>
      <option value="dining">Dining</option>
      <option value="nearby">Nearby</option>
    </select>
  );
}

const OK_MESSAGES: Record<string, string> = {
  saved: "Saved — TVs pick it up in ~10 seconds.",
  "section-added": "Section added.",
  "section-saved": "Section saved.",
  "section-deleted": "Section deleted.",
};

function Field({
  label,
  name,
  defaultValue,
  hint,
  textarea = false,
}: {
  label: string;
  name: string;
  defaultValue: string | null;
  hint?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-semibold text-ocean-700">{label}</span>
      {hint && <span className="ml-2 text-sm text-ocean-900/50">{hint}</span>}
      {textarea ? (
        <textarea
          name={name}
          defaultValue={defaultValue ?? ""}
          rows={4}
          className="mt-1 w-full rounded-xl border border-sand-300 p-3 outline-none focus:border-ocean-500"
        />
      ) : (
        <input
          name={name}
          defaultValue={defaultValue ?? ""}
          className="mt-1 w-full rounded-xl border border-sand-300 p-3 outline-none focus:border-ocean-500"
        />
      )}
    </label>
  );
}

export default async function PropertyEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  if (!(await isHostAuthenticated())) redirect("/host/login");
  const { id } = await params;
  if (!UUID_RE.test(id)) redirect("/host/properties");
  const { ok, err } = await searchParams;

  const db = supabaseAdmin();
  if (!db) redirect("/host/properties");

  // settings arrives with migration 0011; fall back gracefully until it runs.
  let property: PropertyRow | null = null;
  const withSettings = await db
    .from("properties")
    .select(
      "id, name, wifi_ssid, wifi_password, hero_image_url, logo_url, house_rules, local_guide, emergency_info, settings"
    )
    .eq("id", id)
    .maybeSingle();
  if (withSettings.error) {
    const retry = await db
      .from("properties")
      .select(
        "id, name, wifi_ssid, wifi_password, hero_image_url, logo_url, house_rules, local_guide, emergency_info"
      )
      .eq("id", id)
      .maybeSingle();
    property = retry.data as PropertyRow | null;
  } else {
    property = withSettings.data as PropertyRow | null;
  }
  if (!property) redirect("/host/properties");

  const { data: sectionData } = await db
    .from("property_sections")
    .select("id, slug, title, body, sort, show_on_tv, category")
    .eq("property_id", id)
    .order("sort");
  const sections = (sectionData ?? []) as SectionRow[];

  // S4.12 clone sources: every other property, for the copy-setup picker.
  const { data: otherProps } = await db
    .from("properties")
    .select("id, name")
    .neq("id", id)
    .order("name");
  const others = otherProps ?? [];

  const feeds = property.settings?.feeds ?? {};
  const feedOn = (k: string) => feeds[k] !== false;

  return (
    <main className="mx-auto max-w-4xl p-4 pb-12 sm:p-6">
      <header>
        <p className="text-sm text-ocean-900/50">
          <Link
            href="/host/properties"
            className="font-semibold text-ocean-500 hover:text-ocean-700"
          >
            Properties
          </Link>{" "}
          / edit
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ocean-700">{property.name}</h1>
        <p className="mt-1 text-sm text-ocean-900/60">
          Name, photo set, and hero photo sync from Guesty on every &quot;Sync
          from Guesty&quot; — everything else here is portal-owned and survives
          syncs.
        </p>
      </header>

      {ok && (
        <p className="mt-4 rounded-xl bg-white p-3 font-semibold text-seafoam-500 shadow-sm">
          {OK_MESSAGES[ok] ?? "Saved."}
        </p>
      )}
      {err && (
        <p className="mt-4 rounded-xl bg-white p-3 font-semibold text-red-600 shadow-sm">
          That didn&apos;t work ({err}).
        </p>
      )}

      {/* ---- S4.12 clone setup (SaaS onboarding) ------------------------ */}
      {others.length > 0 && (
        <ApiForm
          op="clone-from"
          successText="Setup copied — review below."
          confirmText="Copy setup from that property? Only gaps are filled: guide sections you don't have yet, empty content fields, and the signage playlists (with a rollback snapshot). Wi-Fi is never copied."
          className="mt-6 rounded-2xl border-2 border-dashed border-sand-300 bg-white p-5"
        >
          <input type="hidden" name="propertyId" value={property.id} />
          <h2 className="text-lg font-bold text-ocean-700">Copy setup from…</h2>
          <p className="mt-1 text-sm text-ocean-900/60">
            Onboard this listing from a proven one. Non-destructive: adds only
            the guide sections it lacks, fills empty fields, and copies the
            signage rotations with a one-click-undo history snapshot. Wi-Fi
            stays untouched.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              name="sourceId"
              required
              className="min-w-0 max-w-full rounded-xl border border-sand-300 bg-white p-2.5 outline-none focus:border-ocean-500"
            >
              {others.map((p) => (
                <option key={p.id} value={p.id} title={p.name}>
                  {signageName(p.name)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-full border border-ocean-500 px-5 py-2 font-semibold text-ocean-700 transition hover:bg-ocean-50"
            >
              Copy setup
            </button>
          </div>
        </ApiForm>
      )}

      {/* ---- Property details + feeds ---------------------------------- */}
      <ApiForm op="update-property" className="mt-6 rounded-2xl bg-white p-6 shadow-md">
        <input type="hidden" name="propertyId" value={property.id} />
        <h2 className="text-xl font-bold text-ocean-700">Details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Display name"
            name="display_name"
            defaultValue={property.settings?.displayName ?? null}
            hint={`what TVs & the guest portal show — blank = "${signageName(property.name)}" (the listing name up to its first dash; the full SEO title stays on Guesty)`}
          />
          <div className="hidden sm:block" />
          <Field label="Wi-Fi network" name="wifi_ssid" defaultValue={property.wifi_ssid} />
          <Field label="Wi-Fi password" name="wifi_password" defaultValue={property.wifi_password} />
          <Field
            label="Hero photo URL"
            name="hero_image_url"
            defaultValue={property.hero_image_url}
            hint="resynced from Guesty on Sync"
          />
          <Field
            label="Logo URL"
            name="logo_url"
            defaultValue={property.logo_url}
            hint="blank = auto-match by name"
          />
        </div>
        <div className="mt-4 grid gap-4">
          <Field label="House rules" name="house_rules" defaultValue={property.house_rules} textarea />
          <Field label="Local guide" name="local_guide" defaultValue={property.local_guide} textarea />
          <Field label="Emergency info" name="emergency_info" defaultValue={property.emergency_info} textarea />
        </div>

        <h3 className="mt-6 text-lg font-bold text-ocean-700">TV feeds</h3>
        <p className="text-sm text-ocean-900/60">
          Live data slides on this property&apos;s TVs. Turning one off removes
          its slide in ~10 seconds.
        </p>
        <div className="mt-3 flex flex-wrap gap-6">
          {(
            [
              ["feed_weather", "Weather & sun", feedOn("weather")],
              ["feed_tides", "Tides (Beach day)", feedOn("tides")],
              ["feed_launches", "Rocket launches", feedOn("launches")],
              ["feed_turtles", "Sea turtles", feedOn("turtles")],
            ] as const
          ).map(([name, label, on]) => (
            <label key={name} className="flex items-center gap-2 font-semibold text-ocean-900/80">
              <input type="checkbox" name={name} defaultChecked={on} className="h-5 w-5" />
              {label}
            </label>
          ))}
        </div>

        <h3 className="mt-6 text-lg font-bold text-ocean-700">Signage pacing</h3>
        <p className="text-sm text-ocean-900/60">
          How long each slide rests, and how long the fade between slides
          takes. Blank = defaults (20s / 2.5s). TVs apply changes in ~10
          seconds.
        </p>
        <div className="mt-3 grid max-w-md grid-cols-2 gap-4">
          <label className="block">
            <span className="font-semibold text-ocean-700">Slide duration</span>
            <span className="ml-2 text-sm text-ocean-900/50">seconds, 5–120</span>
            <input
              name="slide_seconds"
              type="number"
              min={5}
              max={120}
              step={1}
              defaultValue={property.settings?.signage?.slideSeconds ?? ""}
              placeholder="20"
              className="mt-1 w-full rounded-xl border border-sand-300 p-3 outline-none focus:border-ocean-500"
            />
          </label>
          <label className="block">
            <span className="font-semibold text-ocean-700">Fade length</span>
            <span className="ml-2 text-sm text-ocean-900/50">seconds, 0.2–8</span>
            <input
              name="fade_seconds"
              type="number"
              min={0.2}
              max={8}
              step={0.1}
              defaultValue={property.settings?.signage?.fadeSeconds ?? ""}
              placeholder="2.5"
              className="mt-1 w-full rounded-xl border border-sand-300 p-3 outline-none focus:border-ocean-500"
            />
          </label>
        </div>

        <h3 className="mt-6 text-lg font-bold text-ocean-700">
          Streaming services
        </h3>
        <p className="text-sm text-ocean-900/60">
          Shown on the TV&apos;s Streaming slide and the guest portal&apos;s
          one-tap sign-in list. Guests always stream with their own accounts —
          this only controls which services are advertised.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STREAMING_SERVICES.map((s) => (
            <label
              key={s.slug}
              className="flex items-center gap-2 font-semibold text-ocean-900/80"
            >
              <input
                type="checkbox"
                name={`stream_${s.slug}`}
                defaultChecked={property.settings?.streaming?.[s.slug] !== false}
                className="h-5 w-5"
              />
              {s.name}
            </label>
          ))}
        </div>

        <button
          type="submit"
          className="mt-6 rounded-full bg-ocean-500 px-6 py-2.5 font-semibold text-white transition hover:bg-ocean-700"
        >
          Save details
        </button>
      </ApiForm>

      {/* ---- Guide sections / TV slides -------------------------------- */}
      <section className="mt-6">
        <h2 className="text-xl font-bold text-ocean-700">
          Guide sections &amp; TV slides ({sections.length})
        </h2>
        <p className="mt-1 text-sm text-ocean-900/60">
          Shown on the guest portal in this order; sections marked &quot;show on
          TV&quot; also become signage slides.
        </p>

        <div className="mt-4 space-y-4">
          {sections.map((s, i) => (
            <div key={s.id} className="rounded-2xl bg-white p-5 shadow-md">
              <ApiForm op="update-section" successText="Section saved" className="space-y-3">
                <input type="hidden" name="propertyId" value={property.id} />
                <input type="hidden" name="sectionId" value={s.id} />
                <div className="flex items-center gap-2">
                  <input
                    name="title"
                    defaultValue={s.title}
                    className="min-w-0 flex-1 rounded-xl border border-sand-300 p-2.5 text-lg font-semibold outline-none focus:border-ocean-500"
                  />
                  <span className="shrink-0 font-mono text-xs text-ocean-900/40">{s.slug}</span>
                </div>
                <textarea
                  name="body"
                  defaultValue={s.body}
                  rows={3}
                  className="w-full rounded-xl border border-sand-300 p-3 outline-none focus:border-ocean-500"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 font-semibold text-ocean-900/80">
                    <input type="checkbox" name="show_on_tv" defaultChecked={s.show_on_tv} className="h-5 w-5" />
                    Show on TV
                  </label>
                  <CategorySelect value={s.category} />
                  <button
                    type="submit"
                    className="rounded-full bg-ocean-500 px-5 py-2 font-semibold text-white transition hover:bg-ocean-700"
                  >
                    Save
                  </button>
                </div>
              </ApiForm>
              <div className="mt-3 flex items-center gap-2 border-t border-sand-100 pt-3">
                {i > 0 && (
                  <ApiForm op="move-section" successText="Moved">
                    <input type="hidden" name="propertyId" value={property.id} />
                    <input type="hidden" name="sectionId" value={s.id} />
                    <input type="hidden" name="dir" value="up" />
                    <button className="rounded-full border border-sand-300 px-4 py-1.5 font-semibold text-ocean-700 transition hover:bg-sand-100">
                      ↑ Up
                    </button>
                  </ApiForm>
                )}
                {i < sections.length - 1 && (
                  <ApiForm op="move-section" successText="Moved">
                    <input type="hidden" name="propertyId" value={property.id} />
                    <input type="hidden" name="sectionId" value={s.id} />
                    <input type="hidden" name="dir" value="down" />
                    <button className="rounded-full border border-sand-300 px-4 py-1.5 font-semibold text-ocean-700 transition hover:bg-sand-100">
                      ↓ Down
                    </button>
                  </ApiForm>
                )}
                <ApiForm op="delete-section" successText="Deleted" confirmText="Delete this section? Guests lose it on the TV and portal immediately." className="ml-auto">
                  <input type="hidden" name="propertyId" value={property.id} />
                  <input type="hidden" name="sectionId" value={s.id} />
                  <button className="rounded-full border border-red-200 px-4 py-1.5 font-semibold text-red-600 transition hover:bg-red-50">
                    Delete
                  </button>
                </ApiForm>
              </div>
            </div>
          ))}
          {sections.length === 0 && (
            <p className="text-ocean-900/60">
              No custom sections yet — the portal shows the built-in
              house-rules / local-guide / emergency sections from the fields
              above until you add some.
            </p>
          )}
        </div>

        <ApiForm op="add-section" successText="Section added" className="mt-6 rounded-2xl border-2 border-dashed border-sand-300 bg-white p-5">
          <input type="hidden" name="propertyId" value={property.id} />
          <h3 className="text-lg font-bold text-ocean-700">Add a section</h3>
          <div className="mt-3 space-y-3">
            <input
              name="title"
              placeholder="Title (e.g. Pool & Spa)"
              required
              className="w-full rounded-xl border border-sand-300 p-2.5 outline-none focus:border-ocean-500"
            />
            <textarea
              name="body"
              placeholder="Body copy shown on the portal (and TV if enabled)"
              rows={3}
              required
              className="w-full rounded-xl border border-sand-300 p-3 outline-none focus:border-ocean-500"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 font-semibold text-ocean-900/80">
                <input type="checkbox" name="show_on_tv" defaultChecked className="h-5 w-5" />
                Show on TV
              </label>
              <CategorySelect value={null} />
              <button
                type="submit"
                className="rounded-full bg-ocean-500 px-5 py-2 font-semibold text-white transition hover:bg-ocean-700"
              >
                Add section
              </button>
            </div>
          </div>
        </ApiForm>
      </section>
    </main>
  );
}
