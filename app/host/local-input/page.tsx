import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { readLocalInput, DUNES_KIOSK_IDS } from "@/lib/local-input";
import LocalInputClient from "./client";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await isHostAuthenticated())) redirect("/host/login");
  const state = await readLocalInput();
  return <LocalInputClient kiosks={[...DUNES_KIOSK_IDS]} initial={state} />;
}
