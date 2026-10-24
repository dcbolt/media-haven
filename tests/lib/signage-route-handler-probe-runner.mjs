import { fileURLToPath } from "node:url";

const propertyId =
  process.env.SIGNAGE_PROBE_PROPERTY ??
  "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const base =
  process.env.SIGNAGE_PROBE_BASE ??
  "https://woleywnwgjfcvowqyyix.supabase.co/storage/v1/object/public/screensavers/shared";
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://woleywnwgjfcvowqyyix.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "smoke-service-role-key";
process.env.SIGNAGE_PROBE_HUGE = process.env.SIGNAGE_PROBE_HUGE ?? "157286442";

const body = {
  propertyId,
  playlist: {
    items: [
      { key: "media-ok", url: `${base}/ok.mp4`, mediaType: "video" },
      { key: "media-big", url: `${base}/big.mp4`, mediaType: "video" },
      { key: "welcome", seconds: 12 },
    ],
    photos: true,
  },
};

try {
  const { POST } = await import(
    fileURLToPath(new URL("../../app/api/host/signage/route.ts", import.meta.url))
  );
  const req = { json: async () => body };
  const res = await POST(req);
  const json = await res.json();
  const savedPlaylist = globalThis.__signageCapturedSettings?.playlist ?? null;
  console.log(
    JSON.stringify({
      ok: res.ok,
      droppedOversized: json.droppedOversized,
      savedPlaylist,
      error: json.error,
    })
  );
  process.exit(res.ok ? 0 : 1);
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String(e) }));
  process.exit(1);
}
