"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="mt-6 rounded-full bg-ocean-500 px-8 py-3 text-lg font-semibold text-white transition hover:bg-ocean-700 print:hidden"
    >
      Print this card
    </button>
  );
}
