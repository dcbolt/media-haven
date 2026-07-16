import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { isHostAuthenticated } from "@/lib/host-auth";
import { portalBaseUrl } from "@/lib/tokens";

/**
 * Renders the guest-link QR as SVG. Host-gated: the QR encodes a live guest
 * token, so it must not be fetchable by arbitrary visitors.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(token)) {
    return NextResponse.json({ error: "bad token" }, { status: 400 });
  }

  const svg = await QRCode.toString(`${portalBaseUrl()}/welcome?token=${token}`, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#12333f", light: "#ffffff" },
  });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, no-store",
    },
  });
}
