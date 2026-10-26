import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standard build output — `npm run build` + `npm run start` work on any OS.
  // (The previous `output: "standalone"` setting was specific to the original
  // preview deployment and is not needed for local development or typical
  // Node.js hosting. Re-add it only if you deploy with a standalone server.)
  typescript: {
    // Keep type checking ON during production builds so type errors fail the
    // build instead of being silently ignored.
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
