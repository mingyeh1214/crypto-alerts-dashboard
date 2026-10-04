import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/strategy", destination: "/", permanent: true },
      { source: "/backtest", destination: "/signals", permanent: true },
      { source: "/backtests", destination: "/signals", permanent: true },
      { source: "/backtests/:path*", destination: "/signals", permanent: true },
    ];
  },
};

export default nextConfig;
