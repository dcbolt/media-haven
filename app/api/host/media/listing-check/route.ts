import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { screensaverListingContainsUrl } from "@/lib/screensavers";

/** After Blob upload — confirm URL appears in a fresh listing (cache bypass). */
export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url.startsWith("http")) {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  const listed = await screensaverListingContainsUrl(url, null);
  return NextResponse.json({ ok: true, listed, url });
}
