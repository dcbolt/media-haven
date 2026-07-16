import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { listScreensavers } from "@/lib/screensavers";
import UploadForm from "./upload-form";

export default async function MediaPage() {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const configured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const current = await listScreensavers(null);

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

      <section className="mt-6">
        <h2 className="text-xl font-bold text-ocean-700">
          In rotation ({current.length})
        </h2>
        <ul className="mt-3 space-y-2">
          {current.map((a) => (
            <li
              key={a.url}
              className="flex items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm"
            >
              <span className="truncate font-mono text-sm">{a.url}</span>
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
