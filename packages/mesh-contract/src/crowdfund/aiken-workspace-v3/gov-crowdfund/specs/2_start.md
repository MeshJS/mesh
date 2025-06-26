# Specification - Start

## Parameter

- `auth_token`: The policy ID of crowdfunding token
- `spend`: The script hash of the spending part of the gov system
- `gov_action_period`: The buffer since crowdfund deadline to complete entire gov process

## User Action - Withdraw

1. Validate completion of crowdfunding

   - Only one input with `auth_token`, with inline datum + `completion_script` same as current crendential hash
   - Exactly 1 token with `current_script_hash` policy is minted
   - All `fundraise_target` amount of ADA + currently minted token is sent to address composed of `spend` and `current_script_hash` (both script hash)
   - With datum:

     ```rs
       Init {
         start_hash: <inherit from input datum>,
         share_token: <inherit from input datum>,
         funds_controlled: <inherit from input datum>,
         deadline: <input datum's deadline + gov_action_period>,
       }
     ```

## User Action - Mint

1. Mint - Redeemer `RMint`

   - The current token policy's equivalent withdrawal script is validated

2. Burn - Redeemer `RBurn`

   - Only 1 input from `spend_script_hash` with redeemer of `RemoveEmptyInstance`

## User Action - Publish

1. Redeemer 1 - Register

   - Only 1 input from `spend_script_hash` with redeemer of `RegisterCerts`

2. Redeemer 2 - Deregister

   - Only 1 input from `spend_script_hash` with redeemer of `DeregisterCerts`

## User Action - Propose

1. Propose gov action

   - Only 1 input from `spend_script_hash` with redeemer of `RegisterCerts`

## User Action - Vote

1. Propose gov action

   - Only 1 input from `spend_script_hash` with redeemer of `VoteOnGovAction`
