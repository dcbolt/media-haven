"use client";

function thumbUrl(url: string): string {
  if (url.includes("drive.google.com") || url.includes("googleusercontent.com")) {
    return url.replace(/\/view(\?.*)?$/i, "/preview").replace(/\/uc\?.*$/, "/preview");
  }
  return url;
}

function videoPoster(url: string): string | null {
  if (url.includes("blob.vercel-storage.com")) return null;
  if (url.includes("image.mux.com")) return `${url.split("?")[0]}/thumbnail.jpg`;
  return null;
}

export default function MediaThumb({
  url,
  type,
  width,
  className,
}: {
  url: string;
  type: "image" | "video";
  width: number;
  className: string;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-ocean-900 ${className}`}
      style={{ width, height: Math.round((width * 1080) / 1920) }}
    >
      {type === "video" ? (
        videoPoster(url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={videoPoster(url)!}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <video
            src={url}
            muted
            preload="metadata"
            className="h-full w-full object-cover"
          />
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl(url)}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      )}
      {type === "video" && (
        <span className="absolute bottom-1 right-1 rounded bg-ocean-900/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
          ▶ video
        </span>
      )}
    </div>
  );
}
