import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native modules — leave as runtime require() calls instead of bundling.
  // Required because @napi-rs/canvas ships a .node binary and sharp uses
  // prebuilt binaries that the bundler can't process.
  serverExternalPackages: ["@napi-rs/canvas", "sharp"],

  async rewrites() {
    return [
      // Cards rendered on Node (Skia, Sharp) live under /api/n/ internally.
      // Rewriting from the public /api/ path keeps the URL contract uniform
      // regardless of which runtime renders the card. Add new node cards
      // to the regex group below.
      {
        source: "/api/:user/:stat((?:streak|portrait)\\.(?:svg|png|webp|avif))",
        destination: "/api/n/:user/:stat",
      },
    ];
  },
};

export default nextConfig;
