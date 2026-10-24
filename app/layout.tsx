import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import {
  TV_BLANK_PAINT_BG,
  TV_BLANK_PAINT_CRITICAL_CSS,
} from "@/lib/tv-blank-paint";
import "./globals.css";

/* Brand typography mirrors www.thefloridahavens.com (Wix): Cormorant
 * Garamond for display serif, Avenir Light for body. Avenir isn't freely
 * licensable — Montserrat (300/light-forward) is the standard stand-in and
 * also covers the site's Futura accents. Self-hosted woff2 — no build-time
 * Google fetch (F-903). */
const cormorant = localFont({
  src: [
    {
      path: "../public/fonts/cormorant-garamond-300.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/cormorant-garamond-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/cormorant-garamond-600.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

const montserrat = localFont({
  src: [
    {
      path: "../public/fonts/montserrat-300.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/montserrat-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/montserrat-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/montserrat-600.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/montserrat-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-montserrat",
  display: "swap",
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
  themeColor: TV_BLANK_PAINT_BG,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${montserrat.variable}`}
      style={{ backgroundColor: TV_BLANK_PAINT_BG }}
    >
      <head>
        <meta name="theme-color" content={TV_BLANK_PAINT_BG} />
        <style dangerouslySetInnerHTML={{ __html: TV_BLANK_PAINT_CRITICAL_CSS }} />
      </head>
      <body
        className="min-h-screen font-sans antialiased"
        style={{ backgroundColor: TV_BLANK_PAINT_BG }}
      >
        {children}
      </body>
    </html>
  );
}
