# Specification - Start

## Parameter

- `auth_token`: The policy ID of crowdfunding token
- `spend`: The script hash of the spending part of the gov system
- `stake`: The script hash of the staking part of the gov system
- `gov_action_period`: The buffer since crowdfund deadline to complete entire gov process

## User Action

1. Validate completion of crowdfunding

   - Only one input with `auth_token`, with inline datum + `completion_script` same as current crendential hash
   - All `fundraise_target` amount of ADA is sent to address composed of `spend` and `stake` (both script hash)
   - With datum:

     ```rs
       Init {
         completion_script: <inherit from input datum>,
         share_token: <inherit from input datum>,
         funds_controlled: <inherit from input datum>,
         deadline: <input datum's deadline + gov_action_period>, 
       }
     ```
