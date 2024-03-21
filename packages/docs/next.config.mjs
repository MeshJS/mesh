/** @type {import('next').NextConfig} */
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

export default nextConfig;
