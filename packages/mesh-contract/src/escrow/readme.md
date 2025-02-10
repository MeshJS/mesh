# Escrow

Escrow contract facilitates the secure exchange of assets between two parties by acting as a trusted intermediary that holds the assets until the conditions of the agreement are met.

The escrow smart contract allows two parties to exchange assets securely. The contract holds the assets until both parties agree and sign off on the transaction.

There are 4 actions available to interact with this smart contract:

- initiate escrow and deposit assets
- deposit assets
- complete escrow
- cancel escrow

[Read more and live demo](https://meshjs.dev/smart-contracts/escrow)

## Usage

To initialize the escrow, we need to initialize a provider, MeshTxBuilder and MeshEscrowContract.

```
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';
import { MeshEscrowContract } from '@meshsdk/contracts';
import { useWallet } from '@meshsdk/react';

const { connected, wallet } = useWallet();

const blockchainProvider = new BlockfrostProvider(APIKEY);

const meshTxBuilder = new MeshTxBuilder({
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
});

const contract = new MeshEscrowContract({
  mesh: meshTxBuilder,
  fetcher: blockchainProvider,
  wallet: wallet,
  networkId: 0,
});
```