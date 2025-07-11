[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / metadataToCip68

# Function: metadataToCip68()

> **metadataToCip68**(`metadata`): [`Data`](../type-aliases/Data.md)

Defined in: types/asset-metadata.ts:77

Transform the metadata into the format needed in CIP68 inline datum (in Mesh Data type)

## Parameters

### metadata

`any`

The metadata body without outer wrapper of policy id & token name

## Returns

[`Data`](../type-aliases/Data.md)

The metadata in Mesh Data type, ready to be attached as inline datum
