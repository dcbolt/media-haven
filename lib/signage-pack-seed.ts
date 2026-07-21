/**
 * Server-only: seed S4.8 template packs into orgs.settings.channels.
 */

import { loadChannels, saveChannel } from "./channels";
import { SIGNAGE_PACKS, packToPlaylist } from "./signage-packs";

/** Idempotent — skips packs already present as channels. */
export async function seedTemplateChannels(): Promise<{
  seeded: string[];
  skipped: string[];
}> {
  const seeded: string[] = [];
  const skipped: string[] = [];
  const existing = await loadChannels();
  const have = new Set(existing.map((c) => c.id));

  for (const pack of SIGNAGE_PACKS) {
    if (have.has(pack.id)) {
      skipped.push(pack.id);
      continue;
    }
    const result = await saveChannel({
      id: pack.id,
      name: pack.name,
      playlist: packToPlaylist(pack),
      propertyIds: [],
    });
    if (result.ok) seeded.push(pack.id);
    else skipped.push(pack.id);
  }
  return { seeded, skipped };
}
