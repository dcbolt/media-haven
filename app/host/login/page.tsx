import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  HOST_COOKIE_NAME,
  isCustomAccessCode,
  isHostAuthenticated,
  sessionCookieValue,
  verifyAccessCode,
} from "@/lib/host-auth";

async function login(formData: FormData) {
  "use server";
  const code = String(formData.get("code") ?? "");
  if (!(await verifyAccessCode(code))) {
    redirect("/host/login?error=1");
  }
  const store = await cookies();
  store.set(HOST_COOKIE_NAME, await sessionCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12, // 12h host session
    path: "/",
  });
  redirect("/host");
}

export default async function HostLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isHostAuthenticated()) redirect("/host");
  const { error } = await searchParams;
  const custom = await isCustomAccessCode();
  // Google OAuth via Supabase Auth: works the moment the Google provider is
  // enabled in the Supabase dashboard; until then the callback page explains.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use the host the user actually opened (lilac vs preview), not VERCEL_URL
  // alone — that was redirecting prod Google sign-in to an ephemeral deploy.
  const { requestOrigin } = await import("@/lib/tokens");
  const origin = await requestOrigin();
  const googleHref = supabaseUrl
    ? `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(
        `${origin}/host/login/google`
      )}`
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-center text-3xl font-bold text-ocean-700">Host access</h1>
      <form action={login} className="space-y-4">
        <input
          type="password"
          name="code"
          placeholder="Access code"
          required
          autoFocus
          className="w-full rounded-xl border border-sand-300 bg-white p-4 text-lg outline-none focus:border-ocean-500"
        />
        {error && (
          <p className="text-center text-red-600">That code didn&apos;t work.</p>
        )}
        <button
          type="submit"
          className="w-full rounded-full bg-ocean-500 py-3 text-lg font-semibold text-white transition hover:bg-ocean-700"
        >
          Sign in
        </button>
      </form>
      {googleHref && (
        <>
          <div className="flex items-center gap-3 text-sm text-ocean-900/40">
            <span className="h-px flex-1 bg-sand-300" />
            or
            <span className="h-px flex-1 bg-sand-300" />
          </div>
          <a
            href={googleHref}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-sand-300 bg-white py-3 text-lg font-semibold text-ocean-900/80 transition hover:border-ocean-500"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2 3.7-5 3.7-8.6z"/>
              <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.1 0-5.8-2.1-6.7-5l-3.9 3C3.4 21.3 7.4 24 12 24z"/>
              <path fill="#FBBC05" d="M5.3 14.4c-.3-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-3.9-3C.5 8.2 0 10 0 12s.5 3.8 1.4 5.4l3.9-3z"/>
              <path fill="#EA4335" d="M12 4.6c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.6l3.9 3c.9-2.9 3.6-5 6.7-5z"/>
            </svg>
            Continue with Google
          </a>
        </>
      )}
      {!custom && (
        <p className="text-center text-sm text-ocean-900/50">
          Demo mode code: <code className="font-mono">demo</code> (until the
          host access code is set)
        </p>
      )}
    </main>
  );
}
