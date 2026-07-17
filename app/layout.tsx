import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import "./globals.css";

/* Brand typography mirrors www.thefloridahavens.com (Wix): Cormorant
 * Garamond for display serif, Avenir Light for body. Avenir isn't freely
 * licensable — Montserrat (300/light-forward) is the standard stand-in and
 * also covers the site's Futura accents. */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "500", "600"],
  variable: "--font-cormorant",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "The Florida Havens",
  description: "Guest welcome portal for The Florida Havens",
  appleWebApp: {
    capable: true,
    title: "Fla Havens",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2e7d9a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Font variables live on <html>: the @theme --font-* values reference
    // them and are substituted at :root — on <body> they'd resolve to
    // guaranteed-invalid and every font utility would silently fall back.
    <html lang="en" className={`${cormorant.variable} ${montserrat.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
