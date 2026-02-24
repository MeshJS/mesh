# Auth Token - One Shot

## Parameter

- `utxo_ref`: UTxO to be spent at minting

## User Action

1. Mint - Redeemer `RMint`

   - Transaction hash as parameterized is included in input

2. Burn - Redeemer `RBurn`

   - The current policy id only has negative minting value in transaction body.
