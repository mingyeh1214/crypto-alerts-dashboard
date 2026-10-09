import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/strategy", destination: "/", permanent: true },
      { source: "/replay", destination: "/signals", permanent: true },
      { source: "/replay/:path*", destination: "/signals", permanent: true },
      { source: "/params", destination: "/signals", permanent: true },
      { source: "/params/:path*", destination: "/signals", permanent: true },
      { source: "/backtest", destination: "/signals", permanent: true },
      { source: "/backtests", destination: "/signals", permanent: true },
      { source: "/backtests/:path*", destination: "/signals", permanent: true },
      { source: "/signals-perp", destination: "/signals", permanent: false },
      { source: "/sim", destination: "/", permanent: false },
      { source: "/reports/:path*", destination: "/signals", permanent: false },
    ];
  },
};

export default nextConfig;
