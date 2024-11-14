# Marketplace

This marketplace allows anyone to buy and sell native assets such as NFTs.

The marketplace smart contract allows users to buy and sell NFTs. A seller list an NFT for sales by specifying a certain price, and anyone can buy it by paying the demanded price.

There are 4 actions (or endpoints) available to interact with this smart contract:

- list asset
- buy asset
- updating listing
- cancel listing

[Read more and live demo](https://meshjs.dev/smart-contracts/marketplace)

## Usage

Utilizing the Marketplace contract requires a blockchain provider and a connected browser wallet. Here is an example how we can initialize the Marketplace.

```
import { MeshMarketplaceContract } from '@meshsdk/contracts';
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';

const blockchainProvider = new BlockfrostProvider(APIKEY);

const meshTxBuilder = new MeshTxBuilder({
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
});

const contract = new MeshMarketplaceContract(
  {
    mesh: meshTxBuilder,
    fetcher: blockchainProvider,
    wallet: wallet,
    networkId: 0,
  },
  'addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv06fwlvuacpyv59g3a3w2fhk7daa8aepvacnpamyhyyxrgnscrfpsa',
  200
);
```

To initialize the Marketplace, we import the MeshMarketplaceContract. The first JSON object is the inputs for the MeshTxInitiatorInput, this requires a MeshTxBuilder, a Provider, a Wallet, and define the network ID.

Second and third parameters are the ownerAddress and feePercentageBasisPoint. The ownerAddress is the address of the marketplace owner which will receive the marketplace fee. The feePercentageBasisPoint is the percentage of the sale price that the marketplace owner will take. The fee numerator is in the order of hundreds, for example 200 implies a fee of 2%.
