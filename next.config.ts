import type { NextConfig } from "next";

// Baseline security headers for every response.
const securityHeaders = [
  // Never render inside someone else's frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Don't sniff content types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send no referrer to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This app needs none of these browser features.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      // /embed/* pages render inside same-origin iframes (Manage Images
      // modal), so they allow framing by this app only.
      {
        source: "/embed/:path*",
        headers: securityHeaders.map((h) =>
          h.key === "X-Frame-Options" ? { ...h, value: "SAMEORIGIN" } : h,
        ),
      },
      { source: "/((?!embed/).*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
