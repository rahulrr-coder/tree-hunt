import type { NextConfig } from "next";

const config: NextConfig = {
  turbopack: { root: __dirname },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Camera and location only for this site; nothing else may ask.
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(), payment=()" },
        ],
      },
    ];
  },
};
export default config;
