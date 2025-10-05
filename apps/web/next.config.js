/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@skymanuals/ui', '@skymanuals/types'],
  experimental: {
    serverComponentsExternalPackages: ['@skymanuals/ui'],
  },
  images: {
    domains: ['localhost'],
  },
};

module.exports = nextConfig;






