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
  if (!verifyAccessCode(code)) {
    redirect("/host/login?error=1");
  }
  const store = await cookies();
  store.set(HOST_COOKIE_NAME, sessionCookieValue(), {
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
      {!isCustomAccessCode() && (
        <p className="text-center text-sm text-ocean-900/50">
          Demo mode code: <code className="font-mono">demo</code> (until
          HOST_ACCESS_CODE is set)
        </p>
      )}
    </main>
  );
}
