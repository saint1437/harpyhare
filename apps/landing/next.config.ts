import type { NextConfig } from "next";

const IMMUTABLE_ASSET_CACHE = "public, max-age=31536000, immutable";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The workspace packages ship TypeScript source rather than a build step of
  // their own, so Next has to compile them like the app's own files.
  transpilePackages: ["@harpyhare/platform", "@harpyhare/release-contract"],
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
      // The decorative sprites live in `public/linocut/`; this rule used to point at
      // `/hare/`, a directory the redesign removed, so nothing was ever cached by it.
      source: "/linocut/:path*",
      headers: [{ key: "Cache-Control", value: IMMUTABLE_ASSET_CACHE }],
    },
  ],
};

export default nextConfig;
