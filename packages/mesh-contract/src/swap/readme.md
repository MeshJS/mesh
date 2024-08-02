# Swap

Swap contract facilitates the exchange of assets between two parties. This contract is designed to be used in a peer-to-peer exchange scenario where two parties agree to exchange assets. The contract ensures that the assets are locked up until it is accepted by the other party. At any point before it is accepted, one can cancel the swap to retrieve the assets.

[Demo](https://meshjs.dev/smart-contracts/swap)

There are 2 actions (or endpoints) available to interact with this smart contract:

- initiate swap
- accept asset
- cancel swap

To initialize the swap, we need to initialize a provider, MeshTxBuilder and MeshSwapContract.

```typescript
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';
import { MeshSwapContract } from '@meshsdk/contracts';
import { useWallet } from '@meshsdk/react';

const { connected, wallet } = useWallet();

const blockchainProvider = new BlockfrostProvider(APIKEY);

const meshTxBuilder = new MeshTxBuilder({
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
});

const contract = new MeshSwapContract({
  mesh: meshTxBuilder,
  fetcher: blockchainProvider,
  wallet: wallet,
  networkId: 0,
});
```
