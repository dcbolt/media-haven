import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { resolveGuestToken } from "@/lib/reservations";
import { logoFor } from "@/lib/logos";
import { portalBaseUrl } from "@/lib/tokens";
import PrintButton from "./print-button";

/**
 * Print-ready guest card: property name, QR (Wi-Fi + guide + streaming
 * help), and the short URL as a fallback. Host-gated — the QR encodes a
 * live guest token. Print with the browser's print dialog; the card is
 * sized to read well cut down to roughly 5x7.
 */
export default async function PrintCardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(token)) redirect("/host");

  const view = await resolveGuestToken(token);
  if (!view) redirect("/host?error=token-not-found");

  const url = `${portalBaseUrl()}/welcome?token=${token}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center p-8 print:min-h-0 print:p-0">
      <div className="w-full rounded-3xl border-4 border-ocean-500 bg-white p-10 text-center print:rounded-none print:border-2">
        <p className="text-lg tracking-widest text-ocean-500">
          THE FLORIDA HAVENS
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoFor(view.property.name, "black")}
          alt=""
          className="mx-auto mt-2 h-24 w-auto object-contain"
        />
        <h1 className="mt-1 text-4xl font-bold text-ocean-700">
          {view.property.name}
        </h1>
        <p className="mt-4 text-xl text-ocean-900/80">
          Scan for Wi-Fi, the house guide, streaming sign-in help, and
          what&apos;s launching over the beach.
        </p>
        <div className="mt-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/host/qr/${token}`}
            alt="Guest welcome QR code"
            width={280}
            height={280}
            className="rounded-xl"
          />
        </div>
        <p className="mt-4 font-mono text-lg text-ocean-900/70">
          {url.replace(/^https?:\/\//, "")}
        </p>
        <p className="mt-6 text-ocean-900/60">
          Point your phone camera at the code — no app needed.
        </p>
      </div>

      <PrintButton />
    </main>
  );
}
