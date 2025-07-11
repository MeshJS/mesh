[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / BigNum

# Class: BigNum

Defined in: utils/big-num.ts:1

## Constructors

### Constructor

> **new BigNum**(`value?`): `BigNum`

Defined in: utils/big-num.ts:4

#### Parameters

##### value?

`string` | `number` | `bigint`

#### Returns

`BigNum`

## Properties

### value

> **value**: `bigint`

Defined in: utils/big-num.ts:2

## Methods

### checkedAdd()

> **checkedAdd**(`other`): `BigNum`

Defined in: utils/big-num.ts:31

#### Parameters

##### other

`BigNum`

#### Returns

`BigNum`

***

### checkedMul()

> **checkedMul**(`other`): `BigNum`

Defined in: utils/big-num.ts:26

#### Parameters

##### other

`BigNum`

#### Returns

`BigNum`

***

### checkedSub()

> **checkedSub**(`other`): `BigNum`

Defined in: utils/big-num.ts:36

#### Parameters

##### other

`BigNum`

#### Returns

`BigNum`

***

### clampedSub()

> **clampedSub**(`other`): `BigNum`

Defined in: utils/big-num.ts:41

#### Parameters

##### other

`BigNum`

#### Returns

`BigNum`

***

### compare()

> **compare**(`other`): `-1` \| `0` \| `1`

Defined in: utils/big-num.ts:53

#### Parameters

##### other

`BigNum`

#### Returns

`-1` \| `0` \| `1`

***

### divFloor()

> **divFloor**(`other`): `BigNum`

Defined in: utils/big-num.ts:21

#### Parameters

##### other

`BigNum`

#### Returns

`BigNum`

***

### lessThan()

> **lessThan**(`other`): `boolean`

Defined in: utils/big-num.ts:49

#### Parameters

##### other

`BigNum`

#### Returns

`boolean`

***

### toString()

> **toString**(): `string`

Defined in: utils/big-num.ts:65

#### Returns

`string`

***

### new()

> `static` **new**(`value`): `BigNum`

Defined in: utils/big-num.ts:12

#### Parameters

##### value

`undefined` | `string` | `number` | `bigint`

#### Returns

`BigNum`
