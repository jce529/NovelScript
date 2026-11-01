import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return ['/oauth/consent', '/oauth/consent/:path*'].map(source => ({
      source,
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }));
  },
};

export default nextConfig;
