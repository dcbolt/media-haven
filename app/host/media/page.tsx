import { redirect } from "next/navigation";
import { blobToken } from "@/lib/blob-token";
import { isHostAuthenticated } from "@/lib/host-auth";
import { allTags, loadMediaMeta } from "@/lib/media-meta";
import { loadCampaigns } from "@/lib/campaigns";
import { buildMediaUsageIndex } from "@/lib/media-usage";
import { getFloridaHavensOrgId } from "@/lib/org";
import { driveConfigured, listScreensavers } from "@/lib/screensavers";
import { supabaseAdmin } from "@/lib/supabase";
import type { MediaAsset } from "@/app/host/signage/editor";
import MediaLibraryClient from "./media-library-client";

async function loadOrgProperties() {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from("properties")
    .select("id, name, settings")
    .order("name");
  return data ?? [];
}

async function orgMediaPool(): Promise<MediaAsset[]> {
  const meta = await loadMediaMeta(getFloridaHavensOrgId());
  const screensavers = await listScreensavers(null);
  const seen = new Set<string>();
  return screensavers
    .filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    })
    .map((a) => {
      const m = meta[a.url];
      if (!m) return a;
      return {
        ...a,
        ...(m.title ? { title: m.title } : null),
        ...(m.tags.length ? { tags: m.tags } : null),
        ...(m.expiresAt ? { expiresAt: m.expiresAt } : null),
        ...(m.startsAt ? { startsAt: m.startsAt } : null),
        ...(m.trashedAt ? { trashedAt: m.trashedAt } : null),
        ...(m.hidden ? { hidden: m.hidden } : null),
        ...(m.createdAt ? { createdAt: m.createdAt } : null),
        ...(m.sizeBytes != null ? { sizeBytes: m.sizeBytes } : null),
      };
    });
}

export default async function MediaPage() {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const configured = Boolean(blobToken());
  const drive = driveConfigured();
  const driveFolder = process.env.GDRIVE_MEDIA_FOLDER_ID;
  const meta = await loadMediaMeta(getFloridaHavensOrgId());
  const pool = await orgMediaPool();
  const orgId = getFloridaHavensOrgId();
  const campaigns = await loadCampaigns(orgId);
  const usageByUrl = buildMediaUsageIndex(
    await loadOrgProperties(),
    campaigns.map((c) => ({ id: c.id, name: c.name, playlist: c.playlist }))
  );

  return (
    <main className="mx-auto max-w-6xl p-4 pb-12 sm:p-6">
      <h1 className="text-3xl font-bold text-ocean-700">Media library</h1>
      <p className="mt-2 text-ocean-900/70">
        Preview, tag, and manage screensaver media. Trash is restorable
        indefinitely. Drive and listing photos can only be hidden from rotation.
      </p>

      {!configured && (
        <p className="mt-4 rounded-xl bg-sand-100 p-4 text-sm text-ocean-900/80">
          Blob storage is not connected — uploads are disabled until Vercel Blob
          is linked to this project.
        </p>
      )}

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm text-sm text-ocean-900/80">
        <h2 className="font-bold text-ocean-700">Sources</h2>
        {drive ? (
          <p className="mt-1">
            Google Drive folder{" "}
            <a
              href={`https://drive.google.com/drive/folders/${driveFolder}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-ocean-500"
            >
              connected
            </a>{" "}
            — files cannot be deleted here, only hidden.
          </p>
        ) : (
          <p className="mt-1">Drive not configured (optional).</p>
        )}
      </section>

      {configured ? (
        <MediaLibraryClient
          initialPool={pool}
          usageByUrl={usageByUrl}
          knownTags={allTags(meta)}
        />
      ) : (
        <p className="mt-6 text-ocean-900/60">
          Connect Blob storage to enable the media manager UI.
        </p>
      )}
    </main>
  );
}
