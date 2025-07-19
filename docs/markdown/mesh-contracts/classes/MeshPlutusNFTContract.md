[**@meshsdk/contract**](../README.md)

***

[@meshsdk/contract](../globals.md) / MeshPlutusNFTContract

# Class: MeshPlutusNFTContract

Defined in: mesh-contract/src/plutus-nft/offchain.ts:37

Mesh Plutus NFT contract class

This NFT minting script enables users to mint NFTs with an automatically incremented index, which increases by one for each newly minted NFT. 

To facilitate this process, the first step is to set up a one-time minting policy by minting an oracle token. This oracle token is essential as it holds the current state and index of the NFTs, acting as a reference for the minting sequence. 

With each new NFT minted, the token index within the oracle is incremented by one, ensuring a consistent and orderly progression in the numbering of the NFTs.

## Extends

- `MeshTxInitiator`

## Constructors

### Constructor

> **new MeshPlutusNFTContract**(`inputs`, `contract`): `MeshPlutusNFTContract`

Defined in: mesh-contract/src/plutus-nft/offchain.ts:60

#### Parameters

##### inputs

`MeshTxInitiatorInput`

##### contract

###### collectionName

`string`

###### paramUtxo?

`TxInput`

#### Returns

`MeshPlutusNFTContract`

#### Overrides

`MeshTxInitiator.constructor`

## Properties

### collectionName

> **collectionName**: `string`

Defined in: mesh-contract/src/plutus-nft/offchain.ts:38

***

### fetcher?

> `optional` **fetcher**: `IFetcher`

Defined in: mesh-contract/src/common.ts:23

#### Inherited from

`MeshTxInitiator.fetcher`

***

### languageVersion

> **languageVersion**: `"V1"` \| `"V2"` \| `"V3"` = `"V2"`

Defined in: mesh-contract/src/common.ts:28

#### Inherited from

`MeshTxInitiator.languageVersion`

***

### mesh

> **mesh**: `MeshTxBuilder`

Defined in: mesh-contract/src/common.ts:22

#### Inherited from

`MeshTxInitiator.mesh`

***

### networkId

> **networkId**: `number` = `0`

Defined in: mesh-contract/src/common.ts:26

#### Inherited from

`MeshTxInitiator.networkId`

***

### oracleAddress

> **oracleAddress**: `string`

Defined in: mesh-contract/src/plutus-nft/offchain.ts:40

***

### paramUtxo

> **paramUtxo**: `TxInput`

Defined in: mesh-contract/src/plutus-nft/offchain.ts:39

***

### stakeCredential?

> `optional` **stakeCredential**: `string`

Defined in: mesh-contract/src/common.ts:25

#### Inherited from

`MeshTxInitiator.stakeCredential`

***

### version

> **version**: `number` = `2`

Defined in: mesh-contract/src/common.ts:27

#### Inherited from

`MeshTxInitiator.version`

***

### wallet?

> `optional` **wallet**: `IWallet`

Defined in: mesh-contract/src/common.ts:24

#### Inherited from

`MeshTxInitiator.wallet`

## Methods

### \_getUtxoByTxHash()

> `protected` **\_getUtxoByTxHash**(`txHash`, `scriptCbor?`): `Promise`\<`undefined` \| `UTxO`\>

Defined in: mesh-contract/src/common.ts:197

#### Parameters

##### txHash

`string`

##### scriptCbor?

`string`

#### Returns

`Promise`\<`undefined` \| `UTxO`\>

#### Inherited from

`MeshTxInitiator._getUtxoByTxHash`

***

### getAddressUtxosWithMinLovelace()

> `protected` **getAddressUtxosWithMinLovelace**(`walletAddress`, `lovelace`, `providedUtxos`): `Promise`\<`UTxO`[]\>

Defined in: mesh-contract/src/common.ts:147

#### Parameters

##### walletAddress

`string`

##### lovelace

`number`

##### providedUtxos

`UTxO`[] = `[]`

#### Returns

`Promise`\<`UTxO`[]\>

#### Inherited from

`MeshTxInitiator.getAddressUtxosWithMinLovelace`

***

### getAddressUtxosWithToken()

> `protected` **getAddressUtxosWithToken**(`walletAddress`, `assetHex`, `userUtxos`): `Promise`\<`UTxO`[]\>

Defined in: mesh-contract/src/common.ts:164

#### Parameters

##### walletAddress

`string`

##### assetHex

`string`

##### userUtxos

`UTxO`[] = `[]`

#### Returns

`Promise`\<`UTxO`[]\>

#### Inherited from

`MeshTxInitiator.getAddressUtxosWithToken`

***

### getNFTCbor()

> **getNFTCbor**(): `string`

Defined in: mesh-contract/src/plutus-nft/offchain.ts:52

#### Returns

`string`

***

### getOracleCbor()

> **getOracleCbor**(): `string`

Defined in: mesh-contract/src/plutus-nft/offchain.ts:42

#### Returns

`string`

***

### getOracleData()

> **getOracleData**(): `Promise`\<\{ `feeCollectorAddress`: `string`; `feeCollectorAddressObj`: `PubKeyAddress`; `lovelacePrice`: `number` \| `bigint`; `nftIndex`: `number` \| `bigint`; `oracleNftPolicyId`: `string`; `oracleUtxo`: `UTxO`; `policyId`: `string`; \}\>

Defined in: mesh-contract/src/plutus-nft/offchain.ts:233

Get the current oracle data.

#### Returns

`Promise`\<\{ `feeCollectorAddress`: `string`; `feeCollectorAddressObj`: `PubKeyAddress`; `lovelacePrice`: `number` \| `bigint`; `nftIndex`: `number` \| `bigint`; `oracleNftPolicyId`: `string`; `oracleUtxo`: `UTxO`; `policyId`: `string`; \}\>

- Oracle data

#### Example

```typescript
const oracleData = await contract.getOracleData();
```

***

### getOracleNFTCbor()

> **getOracleNFTCbor**(): `string`

Defined in: mesh-contract/src/plutus-nft/offchain.ts:46

#### Returns

`string`

***

### getScriptAddress()

> **getScriptAddress**(`scriptCbor`): `string`

Defined in: mesh-contract/src/common.ts:69

#### Parameters

##### scriptCbor

`string`

#### Returns

`string`

#### Inherited from

`MeshTxInitiator.getScriptAddress`

***

### getUtxoByTxHash()

> **getUtxoByTxHash**(`txHash`): `Promise`\<`undefined` \| `UTxO`\>

Defined in: mesh-contract/src/plutus-nft/offchain.ts:263

#### Parameters

##### txHash

`string`

#### Returns

`Promise`\<`undefined` \| `UTxO`\>

***

### getWalletCollateral()

> `protected` **getWalletCollateral**(): `Promise`\<`undefined` \| `UTxO`\>

Defined in: mesh-contract/src/common.ts:107

#### Returns

`Promise`\<`undefined` \| `UTxO`\>

#### Inherited from

`MeshTxInitiator.getWalletCollateral`

***

### getWalletDappAddress()

> `protected` **getWalletDappAddress**(): `Promise`\<`undefined` \| `string`\>

Defined in: mesh-contract/src/common.ts:93

#### Returns

`Promise`\<`undefined` \| `string`\>

#### Inherited from

`MeshTxInitiator.getWalletDappAddress`

***

### getWalletInfoForTx()

> `protected` **getWalletInfoForTx**(): `Promise`\<\{ `collateral`: `UTxO`; `utxos`: `UTxO`[]; `walletAddress`: `string`; \}\>

Defined in: mesh-contract/src/common.ts:181

#### Returns

`Promise`\<\{ `collateral`: `UTxO`; `utxos`: `UTxO`[]; `walletAddress`: `string`; \}\>

#### Inherited from

`MeshTxInitiator.getWalletInfoForTx`

***

### getWalletUtxosWithMinLovelace()

> `protected` **getWalletUtxosWithMinLovelace**(`lovelace`, `providedUtxos`): `Promise`\<`UTxO`[]\>

Defined in: mesh-contract/src/common.ts:115

#### Parameters

##### lovelace

`number`

##### providedUtxos

`UTxO`[] = `[]`

#### Returns

`Promise`\<`UTxO`[]\>

#### Inherited from

`MeshTxInitiator.getWalletUtxosWithMinLovelace`

***

### getWalletUtxosWithToken()

> `protected` **getWalletUtxosWithToken**(`assetHex`, `userUtxos`): `Promise`\<`UTxO`[]\>

Defined in: mesh-contract/src/common.ts:131

#### Parameters

##### assetHex

`string`

##### userUtxos

`UTxO`[] = `[]`

#### Returns

`Promise`\<`UTxO`[]\>

#### Inherited from

`MeshTxInitiator.getWalletUtxosWithToken`

***

### mintPlutusNFT()

> **mintPlutusNFT**(`assetMetadata?`): `Promise`\<`string`\>

Defined in: mesh-contract/src/plutus-nft/offchain.ts:158

Mint NFT token with an automatically incremented index, which increases by one for each newly minted NFT.

#### Parameters

##### assetMetadata?

`any`

Asset metadata

#### Returns

`Promise`\<`string`\>

- Transaction hex

#### Example

```typescript
const assetMetadata = {
 ...demoAssetMetadata,
name: `Mesh Token ${oracleData.nftIndex}`,
};
const tx = await contract.mintPlutusNFT(assetMetadata);
```

***

### queryUtxos()

> `protected` **queryUtxos**(`walletAddress`): `Promise`\<`UTxO`[]\>

Defined in: mesh-contract/src/common.ts:85

#### Parameters

##### walletAddress

`string`

#### Returns

`Promise`\<`UTxO`[]\>

#### Inherited from

`MeshTxInitiator.queryUtxos`

***

### setupOracle()

> **setupOracle**(`lovelacePrice`): `Promise`\<\{ `paramUtxo`: `TxInput`; `tx`: `string`; \}\>

Defined in: mesh-contract/src/plutus-nft/offchain.ts:92

Set up a one-time minting policy by minting an oracle token. This oracle token is essential as it holds the current state and index of the NFTs, acting as a reference for the minting sequence.

#### Parameters

##### lovelacePrice

`number`

Price of the NFT in lovelace

#### Returns

`Promise`\<\{ `paramUtxo`: `TxInput`; `tx`: `string`; \}\>

- Transaction hex and paramUtxo

#### Example

```typescript
const { tx, paramUtxo } = await contract.setupOracle(lovelacePrice);
```

***

### signSubmitReset()

> `protected` **signSubmitReset**(): `Promise`\<`undefined` \| `string`\>

Defined in: mesh-contract/src/common.ts:78

#### Returns

`Promise`\<`undefined` \| `string`\>

#### Inherited from

`MeshTxInitiator.signSubmitReset`
