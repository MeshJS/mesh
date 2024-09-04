const withMDX = require("@next/mdx")();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: function (config, options) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
    };
    return config;
  },
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
};
module.exports = withMDX(nextConfig);
