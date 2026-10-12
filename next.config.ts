import type { NextConfig } from "next";
import { getLocalDevOrigins } from "./lib/dev-origins";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: getLocalDevOrigins(),
  images: { remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org" }] },
};
export default config;
