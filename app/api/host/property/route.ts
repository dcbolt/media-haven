import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import {
  addSection,
  cloneFromProperty,
  deleteSection,
  moveSection,
  updateProperty,
  updateSection,
  type EditResult,
} from "@/lib/property-edit";

/**
 * Host CMS edits (property fields + guide sections). A plain API route on
 * purpose — server actions are deployment-bound and a host's long-lived
 * editor tab silently dropped edits after every deploy (see the signage
 * publish incident, 2026-07-20). The form posts multipart FormData with an
 * `op` field; the ApiForm client wrapper shows the JSON result in place.
 */

const OPS: Record<string, (fd: FormData) => Promise<EditResult>> = {
  "update-property": updateProperty,
  "add-section": addSection,
  "update-section": updateSection,
  "delete-section": deleteSection,
  "move-section": moveSection,
  "clone-from": cloneFromProperty,
};

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) {
    return NextResponse.json({ error: "bad form data" }, { status: 400 });
  }
  const op = OPS[String(fd.get("op") ?? "")];
  if (!op) {
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  }
  const result = await op(fd);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
