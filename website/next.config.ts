import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  transpilePackages: ["air-cursor"],
  devIndicators: false,
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
  webpack(config) {
    config.module.rules.push({
      test: /@mediapipe[\\/](hands|camera_utils|drawing_utils)[\\/].*\.js$/,
      type: "javascript/auto",
      use: [{ loader: path.resolve(process.cwd(), "loaders/mediapipe.cjs") }],
    });
    return config;
  },
};

export default config;
