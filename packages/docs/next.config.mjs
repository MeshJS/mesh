/** @type {import('next').NextConfig} */
import withSearch from './src/mdx/search.mjs'

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'meshjs.dev',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack5: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false };
    return config;
  },
};

export default withSearch(nextConfig);
