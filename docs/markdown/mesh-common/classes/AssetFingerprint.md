[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / AssetFingerprint

# Class: AssetFingerprint

Defined in: utils/asset-fingerprint.ts:15

## Properties

### hashBuf

> `readonly` **hashBuf**: `Uint8Array`

Defined in: utils/asset-fingerprint.ts:16

## Methods

### checksum()

> **checksum**(): `string`

Defined in: utils/asset-fingerprint.ts:62

#### Returns

`string`

***

### fingerprint()

> **fingerprint**(): `string`

Defined in: utils/asset-fingerprint.ts:48

#### Returns

`string`

***

### hash()

> **hash**(): `string`

Defined in: utils/asset-fingerprint.ts:53

#### Returns

`string`

***

### prefix()

> **prefix**(): `string`

Defined in: utils/asset-fingerprint.ts:57

#### Returns

`string`

***

### fromBech32()

> `static` **fromBech32**(`fingerprint`): `AssetFingerprint`

Defined in: utils/asset-fingerprint.ts:38

#### Parameters

##### fingerprint

`string`

#### Returns

`AssetFingerprint`

***

### fromHash()

> `static` **fromHash**(`hash`): `AssetFingerprint`

Defined in: utils/asset-fingerprint.ts:22

#### Parameters

##### hash

`Uint8Array`

#### Returns

`AssetFingerprint`

***

### fromParts()

> `static` **fromParts**(`policyId`, `assetName`): `AssetFingerprint`

Defined in: utils/asset-fingerprint.ts:26

#### Parameters

##### policyId

`Uint8Array`

##### assetName

`Uint8Array`

#### Returns

`AssetFingerprint`
