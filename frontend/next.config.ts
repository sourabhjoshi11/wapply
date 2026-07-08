import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  /** Proxy /api/* to the Render backend so the backend URL is never exposed to the browser. */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_PROXY_TARGET || 'https://wapply-api.onrender.com'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
