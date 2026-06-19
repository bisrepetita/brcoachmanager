import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // firebase-admin et stripe sont des packages Node.js natifs — ne pas les bundler
  serverExternalPackages: ['firebase-admin', 'stripe'],
}

export default nextConfig
