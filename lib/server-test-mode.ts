import { isHostAuthenticated } from "./host-auth.ts";

/** Host-preview / QA traffic — verified `fh_host` session via isHostAuthenticated(). */
export async function isServerTestTraffic(): Promise<boolean> {
  return isHostAuthenticated();
}