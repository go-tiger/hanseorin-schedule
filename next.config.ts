import type { NextConfig } from "next";

const basePath = "/hanseorin-schedule";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
