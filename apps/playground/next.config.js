const withMDX = require("@next/mdx")();
const CopyWebpackPlugin = require('copy-webpack-plugin');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: function (config, options) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
    };
    config.plugins.push(
      new CopyWebpackPlugin({
        patterns: [
          {
            from: '../../node_modules/@sidan-lab/sidan-csl-rs-browser/*.wasm',
            to: 'static/chunks/[name][ext]',
          },
          {
            from: '../../node_modules/@sidan-lab/sidan-csl-rs-nodejs/*.wasm',
            to: 'server/chunks/[name][ext]',
          },
        ],
      })
    );
    return config;
  },
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
};
module.exports = withMDX(nextConfig);
