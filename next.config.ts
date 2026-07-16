import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Guest portal renders on hotel-grade TV browsers; keep the payload lean.
  reactStrictMode: true,
};

export default nextConfig;
