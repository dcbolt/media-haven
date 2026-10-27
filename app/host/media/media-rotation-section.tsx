import {
  enrichScreensaverAsset,
  type ScreensaverMediaItem,
} from "@/lib/screensaver-media-info";
import { loadScreensaverHiddenUrls } from "@/lib/screensaver-hidden";
import type { ScreensaverAsset } from "@/lib/screensavers-types";
import MediaRotationList from "./media-rotation-list";

export default async function MediaRotationSection({
  assets,
}: {
  assets: ScreensaverAsset[];
}) {
  const hidden = await loadScreensaverHiddenUrls();
  const items: ScreensaverMediaItem[] = assets.map((a) =>
    enrichScreensaverAsset(a, {
      hiddenFromRotation: hidden.has(a.url),
      name: a.name,
      driveFileId: a.driveFileId,
      addedAt: a.addedAt,
    })
  );
  const inRotation = items.filter(
    (a) => !a.tooLargeForTv && !a.hiddenFromRotation
  );
  const tooLarge = items.filter((a) => a.tooLargeForTv).length;
  const hiddenCount = items.filter((a) => a.hiddenFromRotation).length;

  return (
    <section className="mt-6">
      <h2 className="text-xl font-bold text-ocean-700">
        In rotation ({inRotation.length}
        {tooLarge > 0 ? ` · ${tooLarge} too large for TVs` : ""}
        {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""})
      </h2>
      <MediaRotationList items={items} />
    </section>
  );
}
