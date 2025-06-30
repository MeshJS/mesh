# Specification - Crowdfund

## Parameter

- `auth_token`: The policy id of `AuthToken`
- `proposer_key_hash`: ByteArray

## Datum

- `completion_script`: ByteArray
- `share_token`: ByteArray
- `crowdfund_address`: Address
- `fundraise_target`: Int
- `current_fundraised_amount`: Int
- `allow_over_subscription`: Bool
- `deadline`: Int
- `expiry_buffer`: Int
- `fee_address`: Address
- `min_charge`: Int

## User Action

1. ContributeFund

   - There is only 1 input with `auth_token` from current address, and 1 output with `auth_token` and to current_address
   - Not allowed other token deposit in output. Min contribution 2 ADA
   - The value increase in current respending utxo equal to the increase in `current_fundraised_amount`, comparing input output datum
   - If `allow_over_scription` is False, check whether `current_fundraised_amount` <= `fundraise_target`
   - `deadline` is not passed
   - `Shares` - Minted exactly the amount of `share_token` that lovelave contributed, with token name of `completion_script`

2. CompleteCrowdfund

   - `min_charge` goes to `fee_address`
   - utxo value >= `min_charge` + `current_fundraised_amount`
   - `current_fundraised_amount` >= `fundraise_target`
   - `completion_script` withdrawal script is executed
   - `auth_token` from current input is burnt

3. ContributorWithdrawal

   - Either one of below conditions
     - `deadline` + `expiry_buffer` is passed
     - `current_fundraised_amount` <= `fundraise_target`
   - There is only 1 input with `auth_token` from current address, and 1 output with `auth_token` and to current_address
   - The lovelace unlocking from `crowdfund_address` equal exactly the amount that the `share_token` with token name of `completion_script` is burnt

4. RemoveEmptyInstance

   - `deadline` is passed
   - share token with token name `completion_script` burning in current tx == `current_fundraised_amount`
   - `auth_token` from current input is burnt
   - signed by `proposer_key_hash`
