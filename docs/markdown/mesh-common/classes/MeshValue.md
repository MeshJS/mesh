[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / MeshValue

# Class: MeshValue

Defined in: data/value.ts:56

MeshValue provide utility to handle the Cardano value manipulation. It offers certain axioms:
1. No duplication of asset - adding assets with same asset name will increase the quantity of the asset in the same record.
2. No zero and negative entry - the quantity of the asset should not be zero or negative.
3. Sanitization of lovelace asset name - the class handle back and forth conversion of lovelace asset name to empty string.
4. Easy convertion to Cardano data - offer utility to convert into either Mesh Data type and JSON type for its Cardano data representation.

## Constructors

### Constructor

> **new MeshValue**(`value`): `MeshValue`

Defined in: data/value.ts:59

#### Parameters

##### value

`Record`\<`string`, `bigint`\> = `{}`

#### Returns

`MeshValue`

## Properties

### value

> **value**: `Record`\<`string`, `bigint`\>

Defined in: data/value.ts:57

## Methods

### addAsset()

> **addAsset**(`asset`): `this`

Defined in: data/value.ts:101

Add an asset to the Value class's value record.

#### Parameters

##### asset

[`Asset`](../type-aliases/Asset.md)

The asset to add

#### Returns

`this`

The updated MeshValue object

***

### addAssets()

> **addAssets**(`assets`): `this`

Defined in: data/value.ts:118

Add an array of assets to the Value class's value record.

#### Parameters

##### assets

[`Asset`](../type-aliases/Asset.md)[]

The assets to add

#### Returns

`this`

The updated MeshValue object

***

### eq()

> **eq**(`other`): `boolean`

Defined in: data/value.ts:241

Check if the value is equal to another value

#### Parameters

##### other

`MeshValue`

The value to compare against

#### Returns

`boolean`

boolean

***

### eqUnit()

> **eqUnit**(`unit`, `other`): `boolean`

Defined in: data/value.ts:251

Check if the specific unit of value is equal to that unit of another value

#### Parameters

##### unit

`string`

The unit to compare

##### other

`MeshValue`

The value to compare against

#### Returns

`boolean`

boolean

***

### geq()

> **geq**(`other`): `boolean`

Defined in: data/value.ts:197

Check if the value is greater than or equal to another value

#### Parameters

##### other

`MeshValue`

The value to compare against

#### Returns

`boolean`

boolean

***

### geqUnit()

> **geqUnit**(`unit`, `other`): `boolean`

Defined in: data/value.ts:207

Check if the specific unit of value is greater than or equal to that unit of another value

#### Parameters

##### unit

`string`

The unit to compare

##### other

`MeshValue`

The value to compare against

#### Returns

`boolean`

boolean

***

### get()

> **get**(`unit`): `bigint`

Defined in: data/value.ts:160

Get the quantity of asset object per unit

#### Parameters

##### unit

`string`

The unit to get the quantity of

#### Returns

`bigint`

The quantity of the asset

***

### getPolicyAssets()

> **getPolicyAssets**(`policyId`): [`Asset`](../type-aliases/Asset.md)[]

Defined in: data/value.ts:169

Get all assets that belong to a specific policy ID

#### Parameters

##### policyId

`string`

The policy ID to filter by

#### Returns

[`Asset`](../type-aliases/Asset.md)[]

Array of assets that match the policy ID

***

### isEmpty()

> **isEmpty**(): `boolean`

Defined in: data/value.ts:261

Check if the value is empty

#### Returns

`boolean`

boolean

***

### leq()

> **leq**(`other`): `boolean`

Defined in: data/value.ts:219

Check if the value is less than or equal to another value

#### Parameters

##### other

`MeshValue`

The value to compare against

#### Returns

`boolean`

boolean

***

### leqUnit()

> **leqUnit**(`unit`, `other`): `boolean`

Defined in: data/value.ts:229

Check if the specific unit of value is less than or equal to that unit of another value

#### Parameters

##### unit

`string`

The unit to compare

##### other

`MeshValue`

The value to compare against

#### Returns

`boolean`

boolean

***

### merge()

> **merge**(`values`): `this`

Defined in: data/value.ts:270

Merge the given values

#### Parameters

##### values

The other values to merge

`MeshValue` | `MeshValue`[]

#### Returns

`this`

this

***

### negateAsset()

> **negateAsset**(`asset`): `this`

Defined in: data/value.ts:130

Substract an asset from the Value class's value record.

#### Parameters

##### asset

[`Asset`](../type-aliases/Asset.md)

The asset to subtract

#### Returns

`this`

The updated MeshValue object

***

### negateAssets()

> **negateAssets**(`assets`): `this`

Defined in: data/value.ts:148

Subtract an array of assets from the Value class's value record.

#### Parameters

##### assets

[`Asset`](../type-aliases/Asset.md)[]

The assets to subtract

#### Returns

`this`

The updated MeshValue object

***

### toAssets()

> **toAssets**(): [`Asset`](../type-aliases/Asset.md)[]

Defined in: data/value.ts:289

Convert the MeshValue object into an array of Asset

#### Returns

[`Asset`](../type-aliases/Asset.md)[]

The array of Asset

***

### toData()

> **toData**(): [`MValue`](../type-aliases/MValue.md)

Defined in: data/value.ts:300

Convert the MeshValue object into Cardano data Value in Mesh Data type

#### Returns

[`MValue`](../type-aliases/MValue.md)

***

### toJSON()

> **toJSON**(): [`Value`](../type-aliases/Value.md)

Defined in: data/value.ts:327

Convert the MeshValue object into a JSON representation of Cardano data Value

#### Returns

[`Value`](../type-aliases/Value.md)

Cardano data Value in JSON

***

### units()

> **units**(): `string`[]

Defined in: data/value.ts:188

Get all asset units

#### Returns

`string`[]

The asset units

***

### fromAssets()

> `static` **fromAssets**(`assets`): `MeshValue`

Defined in: data/value.ts:68

Converting assets into MeshValue

#### Parameters

##### assets

[`Asset`](../type-aliases/Asset.md)[]

The assets to convert

#### Returns

`MeshValue`

MeshValue

***

### fromValue()

> `static` **fromValue**(`plutusValue`): `MeshValue`

Defined in: data/value.ts:79

Converting Value (the JSON representation of Cardano data Value) into MeshValue

#### Parameters

##### plutusValue

[`Value`](../type-aliases/Value.md)

The Value to convert

#### Returns

`MeshValue`

MeshValue
