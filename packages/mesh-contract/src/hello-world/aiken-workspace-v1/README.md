# Hello World - Specification

### Parameter - no parameter

### Datum

- `owner`: Owner's pub key hash
- `message`: Must be a string, e.g. "Hello, World!"

### User Action

1. Unlock by owner

   - Signed by `owner`

2. Unlock by owner

   - Signed by `beneficiary`
   - Only valid after `lock_until`
