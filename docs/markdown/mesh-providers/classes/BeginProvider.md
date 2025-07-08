[**@meshsdk/provider**](../README.md)

***

[@meshsdk/provider](../globals.md) / BeginProvider

# Class: BeginProvider

Defined in: begin.ts:16

The BeginProvider class provides methods to query Begin ID.

To use this provider, simply create a new instance of the BeginProvider class and call the desired method.

```typescript
import { BeginProvider } from "@meshsdk/core";

const beginProvider = new BeginProvider();
```

## Constructors

### Constructor

> **new BeginProvider**(`apikey?`): `BeginProvider`

Defined in: begin.ts:25

Creates a new instance of the BeginProvider.

#### Parameters

##### apikey?

`string`

The API key for querying Begin ID.

#### Returns

`BeginProvider`

## Methods

### resolveAddress()

> **resolveAddress**(`name`, `url?`): `Promise`\<\{ `address`: `string`; `domain`: `string`; `image`: `string`; `name`: `string`; \}\>

Defined in: begin.ts:39

Given a Begin ID, resolves the address and other information.

#### Parameters

##### name

`string`

name of Begin ID, e.g. `mesh`

##### url?

`string`

optional URL to override the default: https://resolveidaddress-ylo5dtxzdq-uc.a.run.app

#### Returns

`Promise`\<\{ `address`: `string`; `domain`: `string`; `image`: `string`; `name`: `string`; \}\>

- name: string
- domain: string
- image: string
- address: string

***

### resolveAdressReverse()

> **resolveAdressReverse**(`address`, `url?`): `Promise`\<\{ `address`: `string`; `domain`: `string`; `image`: `string`; `name`: `string`; \}\>

Defined in: begin.ts:90

Given an address, resolves the Begin ID and other information.

#### Parameters

##### address

`string`

address to resolve

##### url?

`string`

optional URL to override the default: https://resolveIdReserveAddress-ylo5dtxzdq-uc.a.run.app

#### Returns

`Promise`\<\{ `address`: `string`; `domain`: `string`; `image`: `string`; `name`: `string`; \}\>

- name: string
- domain: string
- image: string
- address: string
