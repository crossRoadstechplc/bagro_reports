import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Database driver: load it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
