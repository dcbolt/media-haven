import WifiPortalForm from "@/components/wifi-portal-form";
import { authorizeGuestOnNode } from "@/lib/node-authorizer";
import { guestAuthorizeMinutes } from "@/lib/wifi-checkout";
import {
  parseUniFiPortalParams,
  portalModeFromEnv,
  propertyForSsid,
} from "@/lib/wifi-portal";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Wi‑Fi — The Florida Havens",
  description: "Guest Wi‑Fi welcome",
};

/** Captive portal — tuned for iOS captive sheet (system fonts, light JS). */
export default async function CaptivePortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v)) params.set(k, v[0] ?? "");
  }

  const uni = parseUniFiPortalParams(params);
  const property = propertyForSsid(uni.ssid);
  const mode = portalModeFromEnv();

  if (mode === "closed") {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-10 font-sans text-slate-900">
        <h1 className="text-2xl font-semibold">Wi‑Fi temporarily unavailable</h1>
        <p className="mt-3 text-base text-slate-600">
          Please contact your host for assistance.
        </p>
      </main>
    );
  }

  if (mode === "open") {
    if (uni.clientMac) {
      const minutes = await guestAuthorizeMinutes(property.slug);
      await authorizeGuestOnNode({
        clientMac: uni.clientMac,
        minutes,
        ssid: uni.ssid,
        propertySlug: property.slug,
      });
    }
    redirect(
      `/portal/welcome?property=${encodeURIComponent(property.slug)}&from=open`
    );
  }

  return (
    <main
      className="mx-auto min-h-screen max-w-md px-5 py-10 font-sans text-slate-900"
      data-wifi-portal=""
    >
      <h1 className="text-2xl font-semibold text-slate-900">Welcome</h1>
      <p className="mt-2 text-base text-slate-600">
        {property.name} guest Wi‑Fi
        {uni.ssid ? (
          <>
            {" "}
            · <span className="font-medium">{uni.ssid}</span>
          </>
        ) : null}
      </p>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <WifiPortalForm
          propertyName={property.name}
          clientMac={uni.clientMac}
          apMac={uni.apMac}
          ssid={uni.ssid}
          redirectUrl={uni.redirectUrl}
        />
      </div>
    </main>
  );
}