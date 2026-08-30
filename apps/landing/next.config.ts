import type { NextConfig } from "next";

const IMMUTABLE_ASSET_CACHE = "public, max-age=31536000, immutable";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ],
    },
    {
      source: "/hare/:path*",
      headers: [{ key: "Cache-Control", value: IMMUTABLE_ASSET_CACHE }],
    },
  ],
};

export default nextConfig;
