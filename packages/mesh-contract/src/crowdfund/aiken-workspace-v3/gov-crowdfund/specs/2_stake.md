# Specification - Stake

## Parameter

- `spend_script_hash`: The script hash of the spending part

## User Action

1. Register

   - Only 1 input from `spend_script_hash` with redeemer of `RegisterCerts`

2. Deregister

   - Only 1 input from `spend_script_hash` with redeemer of `DeregisterCerts`
