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
"experiments": {
  "asyncWebAssembly": true,
  "topLevelAwait": true
},
```

4. In `next.config.js`, add:
```js
webpack: function (config, options) {
  config.experiments = { asyncWebAssembly: true, layers: true };
  config.resolve.fallback = { fs: false };
  return config;
},
```

5. Try this by replacing `pages/index.tsx` with:
```js
import type { NextPage } from "next";
import Mesh from "@martifylabs/mesh";

const Home: NextPage = () => {
  async function connectWallet(walletName: string) {
    let connected = await Mesh.wallet.enable({ walletName: walletName });
    console.log("Wallet connected", connected);
    const assets = await Mesh.wallet.getAssets({});
    console.log("assets", assets);
  }

  return (
    <div>
      <button type="button" onClick={() => connectWallet("ccvault")}>
        Connect Wallet
      </button>
    </div>
  );
};

export default Home;
```

6. Start the server:
```sh
yarn run dev
```

## How can you contribute?
- star the [Github repo](https://github.com/MartifyLabs/mesh) and tell others about this
- try Mesh by implementing your Web3 project
- design a nice logo for Mesh, and a hero image for Mesh playground
- documentations write up
- improve Mesh Playground
- beef up readme.md and contribute.md
