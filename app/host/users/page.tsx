import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import ApiForm from "../api-form";

const KEY = "host_allowed_emails";

async function loadAllowlist(): Promise<{
  emails: string[];
  source: "db" | "env" | "empty";
  live: boolean;
}> {
  const db = supabaseAdmin();
  let raw = "";
  let source: "db" | "env" | "empty" = "empty";
  if (db) {
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    raw = data?.value ?? "";
    if (raw) source = "db";
  }
  if (!raw) {
    raw = process.env.HOST_ALLOWED_EMAILS ?? "";
    if (raw) source = "env";
  }
  const emails = [
    ...new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  return { emails, source, live: Boolean(db) };
}

/**
 * Host Users UI (G9 · audit P2 · 2026-07-26). API shipped in #130; this
 * page is the operator surface — list Google allowlist emails and add/remove
 * without a deploy. Nav link under Host.
 */
export default async function HostUsersPage() {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const { emails, source, live } = await loadAllowlist();

  return (
    <main className="mx-auto max-w-2xl p-4 pb-12 sm:p-6">
      <h1 className="text-3xl font-bold text-ocean-700">Host users</h1>
      <p className="mt-2 text-ocean-900/70">
        Google accounts allowed to sign into the host CMS. Access-code login
        is separate (shared code). Removing the last email is blocked so you
        cannot lock every Google host out.
      </p>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-md">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-ocean-700">
            Allowlist ({emails.length})
          </h2>
          <p className="text-xs text-ocean-900/50">
            {source === "db"
              ? "stored in app_config"
              : source === "env"
                ? "from HOST_ALLOWED_EMAILS env (first edit saves to DB)"
                : live
                  ? "empty — add someone or set env"
                  : "demo / no database"}
          </p>
        </div>

        {!live && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Database isn&apos;t connected — list is read-only in this
            environment. Connect Supabase to edit.
          </p>
        )}

        {emails.length === 0 ? (
          <p className="mt-4 text-ocean-900/60">No emails on the allowlist yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {emails.map((email) => (
              <li
                key={email}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sand-200 bg-sand-50/50 px-4 py-3"
              >
                <span className="min-w-0 truncate font-mono text-sm text-ocean-900">
                  {email}
                </span>
                {live && (
                  <ApiForm
                    op="remove"
                    endpoint="/api/host/users"
                    successText="Removed"
                    confirmText={`Remove ${email} from host Google sign-in?`}
                    className="shrink-0"
                  >
                    <input type="hidden" name="email" value={email} />
                    <button
                      type="submit"
                      className="rounded-full border border-sand-300 px-3 py-1.5 text-sm font-semibold text-ocean-900/60 transition hover:bg-sand-100"
                    >
                      Remove
                    </button>
                  </ApiForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {live && (
        <section className="mt-4 rounded-2xl bg-white p-5 shadow-md">
          <h2 className="text-lg font-bold text-ocean-700">Add email</h2>
          <ApiForm
            op="add"
            endpoint="/api/host/users"
            successText="Added"
            className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input
              type="email"
              name="email"
              required
              placeholder="host@example.com"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-sand-300 bg-white px-4 py-3 text-base outline-none focus:border-ocean-500"
            />
            <button
              type="submit"
              className="shrink-0 rounded-full bg-ocean-500 px-5 py-3 font-semibold text-white transition hover:bg-ocean-700"
            >
              Add
            </button>
          </ApiForm>
        </section>
      )}
    </main>
  );
}
