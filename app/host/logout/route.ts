import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { HOST_COOKIE_NAME } from "@/lib/host-auth";

/** Sign out: drop the host session cookie and land on the login page. */
export async function GET(req: NextRequest) {
  const store = await cookies();
  store.delete(HOST_COOKIE_NAME);
  return NextResponse.redirect(new URL("/host/login", req.url));
}
