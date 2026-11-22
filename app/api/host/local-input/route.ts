import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated, hostIdentity } from "@/lib/host-auth";
import { readLocalInput, resolveUnlockUntil, setLocalInput } from "@/lib/local-input";

/** Host: read state / unlock / re-lock one TV. Cookie-authenticated, intent only. */
export async function GET() {
  if (!(await isHostAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await readLocalInput());
}

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    kiosk?: string; action?: string; minutes?: number; checkOut?: string; switchHdmi2?: boolean;
  };
  const by = (await hostIdentity()) ?? "host";
  if (b.action === "lock") {
    const r = await setLocalInput({ kiosk: String(b.kiosk), action: "lock", by });
    return NextResponse.json(r.ok ? { ok: true } : { error: r.error }, { status: r.ok ? 200 : 400 });
  }
  if (b.action !== "unlock") return NextResponse.json({ error: "bad action" }, { status: 400 });
  // Default end = the stay's checkOut, supplied by the page from the property's current stay;
  // the server only trusts it as a hint and clamps it.
  const end = resolveUnlockUntil({ checkOutIso: b.checkOut, minutes: b.minutes ?? null });
  if (!end.ok) return NextResponse.json({ error: end.error }, { status: 400 });
  const r = await setLocalInput({ kiosk: String(b.kiosk), action: "unlock", until: end.until, switchHdmi2: !!b.switchHdmi2, by });
  return NextResponse.json(r.ok ? { ok: true, until: end.until } : { error: r.error }, { status: r.ok ? 200 : 400 });
}
