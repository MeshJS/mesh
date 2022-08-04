# Mesh

> Rapidly build Web3 apps on the Cardano blockchain

Explore the features on [Mesh Playground](https://mesh.martify.io/).

## Steps to get started building Web3 dApps with Mesh

#### 1. Create a new Next.js app:
```sh
yarn create next-app --typescript .
```

#### 2. Install the `@martifylabs/mesh` package:
```sh
yarn add @martifylabs/mesh
```

#### 3. In `next.config.js`, add:
```js
const nextConfig = {
  ...
  webpack: function (config, options) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
      topLevelAwait: true,
    };
    config.resolve.fallback = { fs: false };
    return config;
  },
};
```

<details><summary>See example</summary>
<p>

Example of `next.config.js`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: function (config, options) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
      topLevelAwait: true,
    };
    config.resolve.fallback = { fs: false };
    return config;
  },
};
module.exports = nextConfig;
```
</p>
</details>

#### 4. Import Mesh and start development

Check the [guides](https://mesh.martify.io/guides) to learn more.
