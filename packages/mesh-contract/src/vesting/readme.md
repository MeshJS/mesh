# Vesting

Vesting contract is a smart contract that locks up funds for a period of time and allows the beneficiary to withdraw the funds after the lockup period.

When a new employee joins an organization, they typically receive a promise of compensation to be disbursed after a specified duration of employment. This arrangement often involves the organization depositing the funds into a vesting contract, with the employee gaining access to the funds upon the completion of a predetermined lockup period. Through the utilization of vesting contracts, organizations establish a mechanism to encourage employee retention by linking financial rewards to tenure.

There are 2 actions (or endpoints) available to interact with this smart contract:

- deposit asset
- withdraw asset

[Read more and live demo](https://meshjs.dev/smart-contracts/vesting)

## Usage

To initialize the escrow, we need to initialize a provider, MeshTxBuilder and MeshVestingContract.

```
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';
import { MeshVestingContract } from '@meshsdk/contracts';
import { useWallet } from '@meshsdk/react';

const { connected, wallet } = useWallet();

const blockchainProvider = new BlockfrostProvider(APIKEY);

const meshTxBuilder = new MeshTxBuilder({
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
});

const contract = new MeshVestingContract({
  mesh: meshTxBuilder,
  fetcher: blockchainProvider,
  wallet: wallet,
  networkId: 0,
});
```