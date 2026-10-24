/**
 * Host media library rules — placeholders, trash filter, usage index.
 */
import {
  canPurgeBlobAtSource,
  filterMediaLibrary,
  isMediaTrashed,
  isPlaceholderMedia,
  mediaSourceKind,
  placeholderUrls,
} from "../lib/media-library.ts";
import {
  buildMediaUsageIndex,
  stripUrlsFromPlaylists,
  stripUrlsFromRawPlaylist,
} from "../lib/media-usage.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check(
  "detect hex placeholder title",
  isPlaceholderMedia("https://x.blob.vercel-storage.com/7ee72d.png", "7ee72d")
);
check(
  "detect fd0c50 placeholder",
  isPlaceholderMedia("https://x.blob.vercel-storage.com/fd0c50.png", "fd0c50")
);
check(
  "detect blob photo placeholder",
  isPlaceholderMedia("https://x.blob.vercel-storage.com/a.png", "BLOB Photo")
);
check(
  "real photo not placeholder",
  !isPlaceholderMedia("https://x.blob.vercel-storage.com/beach.jpg", "Sunset")
);

check(
  "blob vs listing source kind",
  canPurgeBlobAtSource("https://a.blob.vercel-storage.com/x.jpg") &&
    !canPurgeBlobAtSource("https://cdn.guesty.com/photo.jpg") &&
    mediaSourceKind("https://cdn.guesty.com/photo.jpg") === "listing"
);

const items = [
  { url: "https://a.blob.vercel-storage.com/1.jpg", title: "a", trashedAt: null },
  { url: "https://a.blob.vercel-storage.com/2.jpg", title: "7ee72d", trashedAt: null },
  { url: "https://a.blob.vercel-storage.com/3.jpg", title: "b", trashedAt: "2020-01-01T00:00:00.000Z" },
];
const placeholders = placeholderUrls(items, (m) => m.title);
check("cleanup placeholders selects hex tile", placeholders.includes(items[1].url));

const filtered = filterMediaLibrary(items, {
  filter: "placeholder",
  query: "",
  tagFilter: null,
  timelineUrls: new Set(),
  showTrashed: false,
  titleOf: (m) => m.title,
  tagsOf: () => [],
});
check("placeholder filter", filtered.length === 1 && filtered[0].url === items[1].url);

const usage = buildMediaUsageIndex([
  {
    id: "p1",
    name: "Shell",
    settings: {
      playlist: {
        items: [{ key: "media-x", url: "https://a.blob.vercel-storage.com/1.jpg" }],
        photos: false,
      },
      playlistHistory: [
        {
          at: "2026-01-01T12:00:00.000Z",
          playlist: {
            items: [
              {
                key: "hist",
                url: "https://a.blob.vercel-storage.com/hist.jpg",
              },
            ],
            photos: false,
          },
        },
      ],
    },
  },
], [
  {
    id: "c1",
    name: "Launch week",
    playlist: {
      items: [{ key: "c", url: "https://a.blob.vercel-storage.com/camp.jpg" }],
      photos: false,
    },
  },
]);
check(
  "usage index finds guest playlist",
  usage["https://a.blob.vercel-storage.com/1.jpg"]?.[0]?.propertyName === "Shell"
);
check(
  "usage index finds publish history",
  usage["https://a.blob.vercel-storage.com/hist.jpg"]?.[0]?.playlist === "guest-history"
);
check(
  "usage index finds campaign",
  usage["https://a.blob.vercel-storage.com/camp.jpg"]?.[0]?.playlist === "campaign"
);

{
  const keepUrl = "https://a.blob.vercel-storage.com/keep.jpg";
  const dropUrl = "https://a.blob.vercel-storage.com/drop.jpg";
  const { next, changed } = stripUrlsFromRawPlaylist(
    {
      items: [
        {
          key: "a",
          url: keepUrl,
          seconds: 12,
          transition: "fade",
          mediaType: "video",
          daypart: "evening",
        },
        {
          key: "b",
          url: dropUrl,
          seconds: 8,
          transition: "cut",
          mediaType: "image",
        },
      ],
      photos: false,
    },
    new Set([dropUrl])
  );
  const kept = next.items[0];
  check("strip removes dropped url only", changed && next.items.length === 1);
  check("strip preserves seconds", kept.seconds === 12);
  check("strip preserves transition", kept.transition === "fade");
  check("strip preserves mediaType", kept.mediaType === "video");
  check("strip preserves daypart", kept.daypart === "evening");
}

const stripped = stripUrlsFromPlaylists(
  {
    playlist: {
      items: [
        { key: "a", url: "https://keep.jpg", seconds: 5 },
        { key: "b", url: "https://drop.jpg", seconds: 9 },
      ],
      photos: false,
    },
  },
  new Set(["https://drop.jpg"])
);
check(
  "strip url from property playlist",
  stripped.changed &&
    stripped.next.playlist.items.length === 1 &&
    stripped.next.playlist.items[0].url === "https://keep.jpg" &&
    stripped.next.playlist.items[0].seconds === 5
);

check(
  "trashed media excluded from library grid",
  isMediaTrashed({ url: "https://x/y.jpg", trashedAt: "2020-01-01T00:00:00.000Z" })
);
check(
  "hidden drive media treated as trashed",
  isMediaTrashed({ url: "https://drive/x.jpg", hidden: true })
);

process.exit(failed);
