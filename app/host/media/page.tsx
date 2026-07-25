import { redirect } from "next/navigation";
import { blobToken } from "@/lib/blob-token";
import { isHostAuthenticated } from "@/lib/host-auth";
import { driveConfigured, listScreensavers } from "@/lib/screensavers";
import { within } from "@/lib/tv";
import UploadForm from "./upload-form";

export default async function MediaPage() {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const configured = Boolean(blobToken());
  const drive = driveConfigured();
  const driveFolder = process.env.GDRIVE_MEDIA_FOLDER_ID;
  // Same liveness budget as the TV state API — a wedged storage listing must
  // not hang the whole page (observed live 2026-07-16).
  const current = await within(listScreensavers(null), 8000, [], "screensavers-admin");

  return (
    <main className="mx-auto max-w-3xl p-4 pb-12 sm:p-6">
      <h1 className="text-3xl font-bold text-ocean-700">Screensaver media</h1>
      <p className="mt-2 text-ocean-900/70">
        4K photos and videos shown on TVs between stays. Videos play muted and
        loop through the set; images rotate every 45 seconds.
      </p>

      <section className="mt-6 rounded-2xl bg-white p-6 shadow-md">
        {configured ? (
          <UploadForm />
        ) : (
          <p className="text-ocean-900/80">
            Storage isn&apos;t connected yet. In Vercel: Storage → your Blob
            store → <strong>Connect Project</strong> → select{" "}
            <span className="font-mono">media-haven</span>, then redeploy.
            This page turns into a drag-and-drop uploader once the token is
            present.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-2xl bg-white p-6 shadow-md">
        <h2 className="text-xl font-bold text-ocean-700">Google Drive library</h2>
        {drive ? (
          <p className="mt-2 text-ocean-900/80">
            Connected — everything in{" "}
            <a
              href={`https://drive.google.com/drive/folders/${driveFolder}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-ocean-500 hover:text-ocean-700"
            >
              the media folder
            </a>{" "}
            joins the rotation within a minute of being added. No storage caps,
            no deploys. Keep videos under ~100&nbsp;MB each so Google streams
            them without its virus-scan page.
          </p>
        ) : (
          <div className="mt-2 space-y-1 text-ocean-900/80">
            <p>
              Use a Drive folder as the media library — drop files in, TVs pick
              them up, no storage caps. One-time setup:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Create a Drive folder and set sharing to{" "}
                <strong>Anyone with the link — Viewer</strong>.
              </li>
              <li>
                In Google Cloud Console, enable the <strong>Drive API</strong>{" "}
                and create an <strong>API key</strong>.
              </li>
              <li>
                In Vercel env vars set{" "}
                <span className="font-mono">GDRIVE_MEDIA_FOLDER_ID</span> (the
                part after <span className="font-mono">/folders/</span> in the
                folder URL) and{" "}
                <span className="font-mono">GOOGLE_API_KEY</span>, then
                redeploy.
              </li>
            </ol>
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-bold text-ocean-700">
          In rotation ({current.length})
        </h2>
        <ul className="mt-3 space-y-2">
          {current.map((a) => (
            <li
              key={a.url}
              className="flex items-center gap-4 rounded-xl bg-white p-3 shadow-sm"
            >
              {/* Thumbnail (host 2026-07-24): the media itself, not a URL.
                  Videos render their first frame (faststart moves the moov
                  atom up, so metadata is one small fetch). */}
              <span className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-ocean-900/10 ring-1 ring-black/5">
                {a.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <video
                    src={a.url}
                    preload="metadata"
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-sm">
                {a.url}
              </span>
              <span className="shrink-0 rounded-full bg-ocean-100 px-3 py-1 text-sm font-semibold text-ocean-700">
                {a.type}
              </span>
            </li>
          ))}
          {current.length === 0 && (
            <li className="text-ocean-900/60">
              Nothing yet — TVs show a black standby screen with a clock.
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}
