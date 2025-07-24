[**@meshsdk/contract**](../README.md)

***

[@meshsdk/contract](../globals.md) / MeshContentOwnershipContract

# Class: MeshContentOwnershipContract

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:71

Mesh Content Ownership Contract

This contract is used to manage the ownership of content.
It facilitates on-chain record of content (i.e. file on IPFS) ownership and transfer.
While one cannot prefer others from obtaining a copy of the content, the app owner of the
contract can serve the single source of truth of who owns the content. With the blockchain
trace and record in place, it provides a trustless way to verify the ownership of the content
and facilitates further application logics such as royalties, licensing, etc.

## Example

```typescript
 const meshTxBuilder = new MeshTxBuilder({
  fetcher: provider, // one of the Providers
  submitter: provider,
  verbose: true,
});

const contract = new MeshContentOwnershipContract(
  {
    mesh: meshTxBuilder,
    fetcher: provider,
    wallet: wallet,
    networkId: 0,
  },
  {
    operationAddress: operationAddress, // the address of the app owner, where most of the actions should be signed by the spending key of this address
    paramUtxo: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" }, // you can get this from the output of `mintOneTimeMintingPolicy()` transaction
    refScriptUtxos?: { // you can get these from the output of `sendRefScriptOnchain()` transactions
      contentRegistry: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" },
      contentRefToken: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" },
      ownershipRegistry: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" },
      ownershipRefToken: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" },
    },
  },
);
```

## Extends

- `MeshTxInitiator`

## Constructors

### Constructor

> **new MeshContentOwnershipContract**(`inputs`, `contract`): `MeshContentOwnershipContract`

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:105

#### Parameters

##### inputs

`MeshTxInitiatorInput`

##### contract

###### operationAddress

`string`

###### paramUtxo?

`TxInput`

###### refScriptUtxos?

\{ `contentRefToken`: `TxInput`; `contentRegistry`: `TxInput`; `ownershipRefToken`: `TxInput`; `ownershipRegistry`: `TxInput`; \}

###### refScriptUtxos.contentRefToken

`TxInput`

###### refScriptUtxos.contentRegistry

`TxInput`

###### refScriptUtxos.ownershipRefToken

`TxInput`

###### refScriptUtxos.ownershipRegistry

`TxInput`

#### Returns

`MeshContentOwnershipContract`

#### Overrides

`MeshTxInitiator.constructor`

## Properties

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

### operationAddress

> **operationAddress**: `string`

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:102

***

### opsKey

> **opsKey**: `string`

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:103

***

### paramUtxo

> **paramUtxo**: `object`

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:72

#### outputIndex

> **outputIndex**: `number` = `0`

#### txHash

> **txHash**: `string` = `"0000000000000000000000000000000000000000000000000000000000000000"`

***

### refScriptUtxos

> **refScriptUtxos**: `object`

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:80

#### contentRefToken

> **contentRefToken**: `object`

##### contentRefToken.outputIndex

> **outputIndex**: `number` = `0`

##### contentRefToken.txHash

> **txHash**: `string` = `"0000000000000000000000000000000000000000000000000000000000000000"`

#### contentRegistry

> **contentRegistry**: `object`

##### contentRegistry.outputIndex

> **outputIndex**: `number` = `0`

##### contentRegistry.txHash

> **txHash**: `string` = `"0000000000000000000000000000000000000000000000000000000000000000"`

#### ownershipRefToken

> **ownershipRefToken**: `object`

##### ownershipRefToken.outputIndex

> **outputIndex**: `number` = `0`

##### ownershipRefToken.txHash

> **txHash**: `string` = `"0000000000000000000000000000000000000000000000000000000000000000"`

#### ownershipRegistry

> **ownershipRegistry**: `object`

##### ownershipRegistry.outputIndex

> **outputIndex**: `number` = `0`

##### ownershipRegistry.txHash

> **txHash**: `string` = `"0000000000000000000000000000000000000000000000000000000000000000"`

***

### scriptInfo

> **scriptInfo**: `object`

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:76

#### contentRefToken

> **contentRefToken**: `object`

##### contentRefToken.cbor

> **cbor**: `string`

##### contentRefToken.hash

> **hash**: `string`

#### contentRegistry

> **contentRegistry**: `object`

##### contentRegistry.address

> **address**: `string` = `""`

##### contentRegistry.cbor

> **cbor**: `string`

##### contentRegistry.hash

> **hash**: `string`

#### oracleNFT

> **oracleNFT**: `object`

##### oracleNFT.cbor

> **cbor**: `string`

##### oracleNFT.hash

> **hash**: `string`

#### oracleValidator

> **oracleValidator**: `object`

##### oracleValidator.address

> **address**: `string` = `""`

##### oracleValidator.cbor

> **cbor**: `string`

##### oracleValidator.hash

> **hash**: `string`

#### ownershipRefToken

> **ownershipRefToken**: `object`

##### ownershipRefToken.cbor

> **cbor**: `string`

##### ownershipRefToken.hash

> **hash**: `string`

#### ownershipRegistry

> **ownershipRegistry**: `object`

##### ownershipRegistry.address

> **address**: `string` = `""`

##### ownershipRegistry.cbor

> **cbor**: `string`

##### ownershipRegistry.hash

> **hash**: `string`

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

### createContent()

> **createContent**(`ownerAssetHex`, `contentHashHex`, `registryNumber`): `Promise`\<`string`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:543

#### Parameters

##### ownerAssetHex

`string`

##### contentHashHex

`string`

##### registryNumber

`number` = `0`

#### Returns

`Promise`\<`string`\>

***

### createContentRegistry()

> **createContentRegistry**(): `Promise`\<`string`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:317

[Setup phase]
This is the next transaction you need to setup the contract after completing all the `sendRefScriptOnchain` transactions.

This transaction creates one content registry. Each registry should comes in pair with one ownership registry and
each pair of registry serves around 50 records of content ownership. The application can be scaled indefinitely
according to the number of parallelization needed and volumes of content expected to be managed.

Note: You must provide the `paramUtxo` from the `mintOneTimeMintingPolicy` transaction.
Note: You must provide the txHash for `ContentRegistry`, `ContentRefToken`, `OwnershipRegistry`, `OwnershipRefToken`

#### Returns

`Promise`\<`string`\>

#### Example

```typescript
const txHex = await contract.createContentRegistry();
const signedTx = await wallet.signTx(txHex);
const txHash = await wallet.submitTx(signedTx);
```

***

### createOwnershipRegistry()

> **createOwnershipRegistry**(): `Promise`\<`string`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:398

[Setup phase]
This is the last transaction you need to setup the contract after completing all the `sendRefScriptOnchain` transactions.

This transaction creates one content registry. Each registry should comes in pair with one content registry and
each pair of registry serves around 50 records of content ownership. The application can be scaled indefinitely
according to the number of parallelization needed and volumes of content expected to be managed.

Note: You must provide the `paramUtxo` from the `mintOneTimeMintingPolicy` transaction.
Note: You must provide the txHash for `ContentRegistry`, `ContentRefToken`, `OwnershipRegistry`, `OwnershipRefToken`

#### Returns

`Promise`\<`string`\>

#### Example

```typescript
const txHex = await contract.createOwnershipRegistry();
const signedTx = await wallet.signTx(txHex);
const txHash = await wallet.submitTx(signedTx);
```

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

### getContent()

> **getContent**(`registryNumber`, `contentNumber`): `Promise`\<`string`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:647

Get the content at the registry given the registry number and content number.

#### Parameters

##### registryNumber

`number`

##### contentNumber

`number`

#### Returns

`Promise`\<`string`\>

***

### getContentDatum()

> `protected` **getContentDatum**(`contentArray`): `MConStr0`\<(`number` \| `string`[])[]\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:979

#### Parameters

##### contentArray

`string`[]

#### Returns

`MConStr0`\<(`number` \| `string`[])[]\>

***

### getCurrentOracleDatum()

> `protected` **getCurrentOracleDatum**(`utxos?`): `Promise`\<`OracleDatum`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:934

#### Parameters

##### utxos?

`UTxO`[]

#### Returns

`Promise`\<`OracleDatum`\>

***

### getOracleData()

> **getOracleData**(): `Promise`\<\{ `contentNumber`: `number`; `ownershipNumber`: `number`; \}\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:471

Get the current oracle data.

#### Returns

`Promise`\<\{ `contentNumber`: `number`; `ownershipNumber`: `number`; \}\>

#### Example

```typescript
const oracleData = await contract.getOracleData();
```

***

### getOracleDatum()

> `protected` **getOracleDatum**(`contentRegistryCount`, `ownershipRegistryCount`): `MConStr0`\<(`string` \| `number` \| `MScriptAddress`)[]\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:948

#### Parameters

##### contentRegistryCount

`number`

##### ownershipRegistryCount

`number`

#### Returns

`MConStr0`\<(`string` \| `number` \| `MScriptAddress`)[]\>

***

### getOwnerNativeScript()

> **getOwnerNativeScript**(): `object`

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:135

#### Returns

`object`

##### nativeScript

> **nativeScript**: `object`

###### nativeScript.scripts

> **scripts**: `NativeScript`[]

###### nativeScript.type

> **type**: `"all"` \| `"any"`

##### scriptAddress

> **scriptAddress**: `string`

***

### getOwnershipDatum()

> `protected` **getOwnershipDatum**(`ownershipArray`): `MConStr0`\<(`number` \| \[`string`, `string`\][])[]\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:983

#### Parameters

##### ownershipArray

\[`string`, `string`\][]

#### Returns

`MConStr0`\<(`number` \| \[`string`, `string`\][])[]\>

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

### getScriptUtxos()

> **getScriptUtxos**(`registryNumber`, `toFetch`): `Promise`\<(`undefined` \| `UTxO`)[]\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:987

#### Parameters

##### registryNumber

`number`

##### toFetch

(`"oracle"` \| `"content"` \| `"ownership"`)[] = `...`

#### Returns

`Promise`\<(`undefined` \| `UTxO`)[]\>

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

### mintOneTimeMintingPolicy()

> **mintOneTimeMintingPolicy**(): `Promise`\<\{ `paramUtxo`: `TxInput`; `tx`: `string`; \}\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:177

[Setup phase]
This is the first transaction you need to setup the contract.

This transaction mints the one-time minting policy (a NFT) for the contract.
It will be attached with the datum which serves as the single source of truth for the contract oracle.

Note: You must save the `paramUtxo` for future transactions.

#### Returns

`Promise`\<\{ `paramUtxo`: `TxInput`; `tx`: `string`; \}\>

#### Example

```typescript
const { tx, paramUtxo } = await contract.mintOneTimeMintingPolicy();
const signedTx = await wallet.signTx(tx);
const txHash = await wallet.submitTx(signedTx);
```

***

### mintUserToken()

> **mintUserToken**(`tokenName`, `tokenMetadata`): `Promise`\<`string`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:505

[User]

This transaction mints a user token which can be used to represent the ownership of the content. This token is used in `createContent()` transaction.

#### Parameters

##### tokenName

`string`

The name of the token that you can specify.

##### tokenMetadata

The metadata of the token that you can specify.

#### Returns

`Promise`\<`string`\>

#### Example

```typescript
const tx = await contract.mintUserToken("MeshContentOwnership", {
  name: "Mesh Content Ownership",
  description: "Demo at https://meshjs.dev/smart-contracts/content-ownership",
});
const signedTx = await wallet.signTx(tx, true);
const txHash = await wallet.submitTx(signedTx);

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

### sendRefScriptOnchain()

> **sendRefScriptOnchain**(`scriptIndex`): `Promise`\<`string`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:285

[Setup phase]
This are the next transactions you need to setup the contract.
You need to run once for each script, and you would likely have to run one after the previous one is confirmed.

This transaction sends the reference scripts to the blockchain for later transactions,
boosting efficiency and avoid exceeding 16kb of transaction size limits enforced by protocol parameter.

Note: You must provide the `paramUtxo` from the `mintOneTimeMintingPolicy` transaction.
Note: You must save txHash (after signed and submitted) for `ContentRegistry`, `ContentRefToken`, `OwnershipRegistry`, `OwnershipRefToken` transactions for future transactions.

#### Parameters

##### scriptIndex

`ScriptIndex`

"OracleNFT" | "OracleValidator" | "ContentRegistry" | "ContentRefToken" | "OwnershipRegistry" | "OwnershipRefToken"

#### Returns

`Promise`\<`string`\>

#### Example

```typescript
const txHexOracleNFT = await contract.sendRefScriptOnchain("OracleNFT");
const signedTxOracleNFT = await wallet.signTx(txHexOracleNFT);
const txHashOracleNFT = await wallet.submitTx(signedTxOracleNFT);

const txHexOracleValidator = await contract.sendRefScriptOnchain("OracleValidator");
... // repeat for each script

const txHexOwnershipRefToken = await contract.sendRefScriptOnchain("OwnershipRefToken");
const signedTxOwnershipRefToken = await wallet.signTx(txHexOwnershipRefToken);
const txHashOwnershipRefToken = await wallet.submitTx(signedTxOwnershipRefToken);
```

***

### setupOracleUtxo()

> **setupOracleUtxo**(): `Promise`\<`string`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:243

[Setup phase]
This is the second transaction you need to setup the contract.

This transaction send the NFT to a oracle contract locking the datum,
which serves as the single source of truth for the contract oracle with data integrity.

Note: You must provide the `paramUtxo` from the `mintOneTimeMintingPolicy` transaction.

#### Returns

`Promise`\<`string`\>

#### Example

```typescript
const txHex = await contract.setupOracleUtxo();
const signedTx = await wallet.signTx(txHex);
const txHash = await wallet.submitTx(signedTx);
```

***

### signSubmitReset()

> `protected` **signSubmitReset**(): `Promise`\<`undefined` \| `string`\>

Defined in: mesh-contract/src/common.ts:78

#### Returns

`Promise`\<`undefined` \| `string`\>

#### Inherited from

`MeshTxInitiator.signSubmitReset`

***

### stopContentRegistry()

> **stopContentRegistry**(`registryNumber`): `Promise`\<`string`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:798

#### Parameters

##### registryNumber

`number`

#### Returns

`Promise`\<`string`\>

***

### stopOracle()

> **stopOracle**(`txInHash`, `txInId`): `Promise`\<`string`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:896

#### Parameters

##### txInHash

`string`

##### txInId

`number`

#### Returns

`Promise`\<`string`\>

***

### stopOwnershipRegistry()

> **stopOwnershipRegistry**(`registryNumber`): `Promise`\<`string`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:847

#### Parameters

##### registryNumber

`number`

#### Returns

`Promise`\<`string`\>

***

### transferContent()

> **transferContent**(`__namedParameters`): `Promise`\<`string`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:730

#### Parameters

##### \_\_namedParameters

`TransferContent`

#### Returns

`Promise`\<`string`\>

***

### updateContent()

> **updateContent**(`__namedParameters`): `Promise`\<`string`\>

Defined in: mesh-contract/src/content-ownership/offchain/offchain.ts:666

#### Parameters

##### \_\_namedParameters

`UpdateContent`

#### Returns

`Promise`\<`string`\>
