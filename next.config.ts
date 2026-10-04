import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/strategy", destination: "/", permanent: true }];
  },
};

export default nextConfig;
