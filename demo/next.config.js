/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: function (config, options) {
    config.experiments = { asyncWebAssembly: true, layers: true };
    config.resolve.fallback = { fs: false };
    return config;
  },
};
module.exports = nextConfig;
