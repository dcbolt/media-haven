import Link from "next/link";
import { trackedUrl } from "@/lib/qr-track";
import { portalBaseUrl } from "@/lib/tokens";
import { propertyForSsid } from "@/lib/wifi-portal";

const GUEST_STORY_URL = "https://www.thefloridahavens.com/guest-story-entry-form";
const GOOGLE_REVIEW_URL = "https://share.google/E1dS6Xok5feaJqujS";
const BOOK_URL = "https://www.thefloridahavens.com/book-the-dunes";

const PROPERTY_NAMES: Record<string, string> = {
  dunes: "The Dunes",
};

export default async function PortalWelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const slug =
    (typeof sp.property === "string" ? sp.property : "dunes").toLowerCase();
  const name = PROPERTY_NAMES[slug] ?? propertyForSsid(null).name;

  const story = trackedUrl("story", GUEST_STORY_URL);
  const review = trackedUrl("review", GOOGLE_REVIEW_URL);
  const book = trackedUrl("book", BOOK_URL);

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-10 font-sans text-slate-900">
      <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">
        {name}
      </p>
      <h1 className="mt-1 text-2xl font-semibold">You&apos;re online</h1>
      <p className="mt-2 text-base text-slate-600">
        Your house guide, guest book, and booking links — attribution consistent
        with our QR analytics.
      </p>
      <ul className="mt-6 space-y-3">
        <li>
          <a
            className="block rounded-xl bg-sky-700 px-4 py-3 text-center font-semibold text-white"
            href={story}
          >
            Sign the story book
          </a>
        </li>
        <li>
          <a
            className="block rounded-xl border border-slate-300 px-4 py-3 text-center font-semibold text-sky-800"
            href={review}
          >
            Share a review
          </a>
        </li>
        <li>
          <a
            className="block rounded-xl border border-slate-300 px-4 py-3 text-center font-semibold text-sky-800"
            href={book}
          >
            Book direct
          </a>
        </li>
      </ul>
      <p className="mt-8 text-sm text-slate-500">
        Full guide on your TV or scan the welcome QR in the home.{" "}
        <Link href="/privacy" className="text-sky-700 underline">
          Privacy
        </Link>
      </p>
      <p className="mt-2 text-xs text-slate-400">{portalBaseUrl()}</p>
    </main>
  );
}