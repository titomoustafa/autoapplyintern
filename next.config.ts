import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These run on the server only and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;
