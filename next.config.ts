import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  images: { remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org" }] },
};
export default config;
