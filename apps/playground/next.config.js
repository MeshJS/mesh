const withMDX = require("@next/mdx")();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    // "@meshsdk/react",
    // "@cardano-sdk/core",
    // "@cardano-sdk/crypto",
    // "@cardano-sdk/util",
  ],
  webpack: function (config, options) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
    };
    return config;
  },
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};
module.exports = withMDX(nextConfig);
