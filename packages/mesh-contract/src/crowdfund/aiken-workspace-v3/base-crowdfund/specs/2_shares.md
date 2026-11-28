# Share Token

## Parameter

- `auth_token`: The policy id of `AuthToken`

## User Action

1. Mint - Redeemer `RMint`

   - There is input with `auth_token` with redeemer `ContributeFund`

2. Burn - Redeemer `RBurn`

   - The current policy id only has negative minting value in transaction body.
