# Mesh

> Rapidly build Web3 apps on the Cardano blockchain

Explore the features on [Mesh Playground](https://mesh.martify.io/).

## Steps to get started building Web3 dApps with Mesh

#### 1. Create a new Next.js app:
```sh
yarn create next-app --typescript
```

#### 2. Install the `@martifylabs/mesh` package:
```sh
yarn add @martifylabs/mesh
```

#### 3. In `tsconfig.json`, add:
```js
const nextConfig = {
  ...
  "experiments": {
    "asyncWebAssembly": true,
    "topLevelAwait": true
  }
}
```

<details><summary>See example</summary>
<p>

Example of `tsconfig.json`:
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

#### 4. In `next.config.js`, add:
```js
{
  ...,
  webpack: function (config, options) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
      topLevelAwait: true,
    };
    config.resolve.fallback = { fs: false };
    return config;
  }
}
```

<details><summary>See example</summary>
<p>

Example of `next.config.js`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
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

#### 5. Import Mesh with `import Mesh from "@martifylabs/mesh";`

<details><summary>See example</summary>
<p>

Replace `pages/index.tsx` with:
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

Need more examples? Check the [demo](https://github.com/MartifyLabs/mesh/tree/main/demo).
</p>
</details>
