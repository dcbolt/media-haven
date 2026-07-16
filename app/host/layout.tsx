import { isHostAuthenticated } from "@/lib/host-auth";
import HostNav from "./nav";

/** Wraps every /host page. The nav renders only for an authenticated host —
 *  the login page stays chrome-free — and hides itself when printing so
 *  guest cards come out clean. */
export default async function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await isHostAuthenticated();
  return (
    <>
      {authed && <HostNav />}
      {children}
    </>
  );
}
