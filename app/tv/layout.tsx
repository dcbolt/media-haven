import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Florida Havens — TV",
};

/** TV signage chrome: fill the screen, hide the cursor, never scroll.
 *  All type on this route is sized in vw so HD and 4K render identically. */
export default function TvLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 cursor-none select-none overflow-hidden bg-ocean-900 text-white">
      {children}
    </div>
  );
}
