# Mesh

> Rapidly build Web3 apps on the Cardano blockchain

## Some features currently:
- connect wallet to dApps and execute wallet functions
- create, sign and submit transactions
- query Blockfrost to access blockchain information
- upload files to Infura IPFS

## Steps to get started

1. Create a new Next.js app:
```sh
yarn create next-app --typescript
```

2. Install the `@martifylabs/mesh` package:
```sh
yarn add yarn install @martifylabs/mesh
```

3. In `tsconfig.json`, add:
```js
const nextConfig = {
  ...
  "experiments": {
    "asyncWebAssembly": true,
    "topLevelAwait": true
  }
}
```

<details><summary>Example `tsconfig.json`</summary>
<p>

```js
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"],
  "experiments": {
    "asyncWebAssembly": true,
    "topLevelAwait": true
  },
}
```
</p>
</details>

4. In `next.config.js`, add:
```js
{
  ...,
  webpack: function (config, options) {
    config.experiments = { asyncWebAssembly: true, layers: true };
    config.resolve.fallback = { fs: false };
    return config;
  }
}
```

<details><summary>Example `next.config.js`</summary>
<p>

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  webpack: function (config, options) {
    config.experiments = { asyncWebAssembly: true, layers: true };
    config.resolve.fallback = { fs: false };
    return config;
  },
}
module.exports = nextConfig
```
</p>
</details>

5. Import Mesh with `import Mesh from "@martifylabs/mesh";`

<details><summary>Example `pages/index.tsx`</summary>
<p>

```js
import { useState } from "react";
import type { NextPage } from "next";
import Mesh from "@martifylabs/mesh";

const Home: NextPage = () => {
  const [assets, setAssets] = useState<null | any>(null);

  async function connectWallet(walletName: string) {
    let connected = await Mesh.wallet.enable({ walletName: walletName });
    const _assets = await Mesh.wallet.getAssets({});
    setAssets(_assets);
  }

  return (
    <div>
      <button type="button" onClick={() => connectWallet("ccvault")}>
        Connect Wallet
      </button>
      <pre>
        <code className="language-js">{JSON.stringify(assets, null, 2)}</code>
      </pre>
    </div>
  );
};

export default Home;
```

Start the server:
```sh
yarn run dev
```
</p>
</details>

## How can you contribute?
- star the [Github repo](https://github.com/MartifyLabs/mesh) and tell others about this
- try Mesh by implementing your Web3 project
- design a nice logo for Mesh, and a hero image for Mesh playground
- documentations write up
- improve Mesh Playground
- beef up readme.md and contribute.md
