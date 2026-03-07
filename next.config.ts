import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./vendor/yt-dlp/**/*"],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
