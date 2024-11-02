# Giftcard

Giftcard contract allows users to create a transactions to lock assets into the smart contract, which can be redeemed by any user.


Creating a giftcard will mint a token and send the assets to the contract. While redeeming will burn the token and send the assets to the redeemer.

There are 2 actions (or endpoints) available to interact with this smart contract:

- create giftcard
- redeem giftcard

[Read more and live demo](https://meshjs.dev/smart-contracts/giftcard)

## Usage

To initialize the escrow, we need to initialize a provider, MeshTxBuilder and MeshGiftCardContract.

```
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';
import { MeshGiftCardContract } from '@meshsdk/contracts';
import { useWallet } from '@meshsdk/react';

const { connected, wallet } = useWallet();

const blockchainProvider = new BlockfrostProvider(APIKEY);

const meshTxBuilder = new MeshTxBuilder({
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
});

const contract = new MeshGiftCardContract({
  mesh: meshTxBuilder,
  fetcher: blockchainProvider,
  wallet: wallet,
  networkId: 0,
});
```