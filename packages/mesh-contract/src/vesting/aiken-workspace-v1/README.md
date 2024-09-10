# Vesting - Specification

## Scripts - VestingValidator

The validator of locking vesting value.

### Parameter - no parameter

### Datum

- `lock_until`: POSIX time in second at locking end, e.g. 1672843961000
- `owner`: Owner's pub key hash
- `beneficiary`: Beneficiary's pub key hash

### User Action

1. Unlock by owner

   - Signed by `owner`

2. Unlock by beneficiary

   - Signed by `beneficiary`
   - Only valid after `lock_until`
