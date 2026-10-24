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

check("blob purge allowed", canPurgeBlobAtSource("https://a.blob.vercel-storage.com/x.jpg"));
check(
  "listing hide only",
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
    },
  },
]);
check(
  "usage index finds guest playlist",
  usage["https://a.blob.vercel-storage.com/1.jpg"]?.[0]?.propertyName === "Shell"
);

const stripped = stripUrlsFromPlaylists(
  {
    playlist: {
      items: [
        { key: "a", url: "https://keep.jpg" },
        { key: "b", url: "https://drop.jpg" },
      ],
      photos: false,
    },
  },
  new Set(["https://drop.jpg"])
);
check(
  "strip url from playlist",
  stripped.changed &&
    stripped.next.playlist.items.length === 1 &&
    stripped.next.playlist.items[0].url === "https://keep.jpg"
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
