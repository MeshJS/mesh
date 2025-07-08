[**@meshsdk/core-cst**](../README.md)

***

[@meshsdk/core-cst](../globals.md) / CoseSign1

# Class: CoseSign1

Defined in: packages/mesh-core-cst/src/message-signing/cose-sign1.ts:22

## Constructors

### Constructor

> **new CoseSign1**(`payload`): `CoseSign1`

Defined in: packages/mesh-core-cst/src/message-signing/cose-sign1.ts:31

#### Parameters

##### payload

###### payload

`null` \| `CborBytes`

###### protectedMap

`CborMap`

###### signature?

`CborBytes`

###### unProtectedMap

`CborMap`

#### Returns

`CoseSign1`

## Methods

### buildMessage()

> **buildMessage**(`signature`): `Buffer`

Defined in: packages/mesh-core-cst/src/message-signing/cose-sign1.ts:114

#### Parameters

##### signature

`Buffer`

#### Returns

`Buffer`

***

### createSigStructure()

> **createSigStructure**(`externalAad`): `Buffer`

Defined in: packages/mesh-core-cst/src/message-signing/cose-sign1.ts:93

#### Parameters

##### externalAad

`Buffer` = `...`

#### Returns

`Buffer`

***

### getAddress()

> **getAddress**(): `Buffer`

Defined in: packages/mesh-core-cst/src/message-signing/cose-sign1.ts:190

#### Returns

`Buffer`

***

### getPayload()

> **getPayload**(): `null` \| `Buffer`

Defined in: packages/mesh-core-cst/src/message-signing/cose-sign1.ts:213

#### Returns

`null` \| `Buffer`

***

### getPublicKey()

> **getPublicKey**(): `Buffer`

Defined in: packages/mesh-core-cst/src/message-signing/cose-sign1.ts:201

#### Returns

`Buffer`

***

### getSignature()

> **getSignature**(): `undefined` \| `Buffer`

Defined in: packages/mesh-core-cst/src/message-signing/cose-sign1.ts:209

#### Returns

`undefined` \| `Buffer`

***

### hashPayload()

> **hashPayload**(): `void`

Defined in: packages/mesh-core-cst/src/message-signing/cose-sign1.ts:160

#### Returns

`void`

***

### verifySignature()

> **verifySignature**(`__namedParameters`): `boolean`

Defined in: packages/mesh-core-cst/src/message-signing/cose-sign1.ts:136

#### Parameters

##### \_\_namedParameters

###### externalAad?

`Buffer` = `...`

###### publicKeyBuffer?

`Buffer`

#### Returns

`boolean`

***

### fromCbor()

> `static` **fromCbor**(`cbor`): `CoseSign1`

Defined in: packages/mesh-core-cst/src/message-signing/cose-sign1.ts:58

#### Parameters

##### cbor

`string`

#### Returns

`CoseSign1`
