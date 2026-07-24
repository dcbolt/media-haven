import { NextRequest, NextResponse } from "next/server";
import { recordScan, resolveScanDest, type ScanSlug } from "@/lib/qr-track";

/**
 * QR scan tracker: counts the scan, then 302s to the real destination.
 * Public on purpose — guests hit this mid-scan. Destinations are validated
 * against the qr-track host allowlist, so this can't be an open redirect;
 * anything bogus lands on the brand site instead of an error page.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const dest = resolveScanDest(slug, req.nextUrl.searchParams.get("to"));
  if (!dest) {
    return NextResponse.redirect("https://www.thefloridahavens.com", 302);
  }
  await recordScan(slug as ScanSlug);
  return NextResponse.redirect(dest, 302);
}
