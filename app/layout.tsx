import type { Metadata, Viewport } from "next";
import "./globals.css";

/* Brand typography mirrors www.thefloridahavens.com — self-hosted fallbacks
 * so CI/build never fetches fonts from Google (network-independent). */

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
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
