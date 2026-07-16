import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold text-ocean-700">The Florida Havens</h1>
      <p className="text-lg text-ocean-900/80">
        Guest welcome portal. Guests arrive here by scanning the QR code at the
        property — each code carries a private token for that stay.
      </p>
      <Link
        href="/welcome?token=demo"
        className="rounded-full bg-ocean-500 px-8 py-4 text-lg font-semibold text-white shadow-lg transition hover:bg-ocean-700"
      >
        Preview the guest experience →
      </Link>
      <p className="text-sm text-ocean-900/50">
        (Demo token — shows mock reservation data)
      </p>
    </main>
  );
}
