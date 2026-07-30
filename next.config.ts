import type { NextConfig } from "next";

/**
 * Security headers (G6 · audit v2 · Claude assign 2026-07-25).
 *
 * Frame policy is SAMEORIGIN (not DENY): fleet thumbnails on /host/tvs
 * embed same-origin /tv?property= iframes. CSP starts Report-Only so we
 * can tighten without blanking TV/host surfaces.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Same-origin iframes OK (fleet live previews); cross-origin embedding blocked.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Guest portal renders on hotel-grade TV browsers; keep the payload lean.
  reactStrictMode: true,
  /**
   * Lint is reported by its own non-blocking CI job, not by the build.
   *
   * `next build` runs ESLint automatically as soon as a config exists and
   * fails the build on any error. When H1 added `eslint.config.mjs` that
   * turned the 14-error backlog into a hard deploy blocker through the back
   * door — production could not deploy for two days — even though the H1
   * intent (AGENTS.md rule 6) was explicitly "non-blocking until the
   * burn-down is near-zero".
   *
   * The backlog is almost entirely `react-hooks/set-state-in-effect` and
   * `immutability` findings in the TV kiosk's poll/rotation effects. Those
   * are exactly the paths the never-blank guarantee depends on, so they get
   * fixed deliberately one at a time — never in a sweep to turn CI green.
   * Typecheck still gates the build; lint gates nothing until we promote it.
   */
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
