[**@meshsdk/transaction**](../README.md)

***

[@meshsdk/transaction](../globals.md) / mergeContents

# Function: mergeContents()

> **mergeContents**(`a`, `b`, `currentDepth`): `Metadatum`

Defined in: mesh-transaction/src/utils/metadata.ts:62

Recursively merge two metadata. Returns the 2nd item if the maximum allowed
merge depth has passed.

Merging maps ({ key: value }):
Two maps are merged by recursively including the (key, value) pairs from both the maps.
When further merge isn't allowed (by currentDepth), the 2nd item is preferred,
replacing the 1st item.

Merging arrays:
Two arrays are merged by concatenating them.
When merge isn't allowed (by currentDepth), the 2nd array is returned.

Merging primitive types (number, string, etc.):
Primitive types are not merged in the sense of concatenating. In case they are the same,
either of them can be considered as the "merged value". 2nd item is returned here.
When merge isn't allowed (by currentDepth), the 2nd item is returned.

## Parameters

### a

`Metadatum`

first item

### b

`Metadatum`

second item

### currentDepth

`number`

the current merge depth; decreases in a recursive call

## Returns

`Metadatum`

merged item or a preferred item, chosen according to currentDepth
