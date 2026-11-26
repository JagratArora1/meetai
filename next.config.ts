import type { NextConfig } from "next";

// Sent with every response. Vercel already adds Strict-Transport-Security.
const securityHeaders = [
  // Stop browsers from guessing a different content type than the one sent.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send only the origin, not full URLs with meeting and agent ids, to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app is never meant to be shown inside another site's frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Calls use the camera, microphone and screen sharing on this origin only; nothing needs location.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), display-capture=(self), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
