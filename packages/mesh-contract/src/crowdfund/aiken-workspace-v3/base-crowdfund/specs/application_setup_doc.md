# Application Setup Documentation

## Setup

The are 2 steps of setting up the applications:

1. Minting `auth_token`, one time minting policy with empty token name with quantity of 1.

   - Validation: 1.1

2. Sending the the `auth_token` to `crowdfund`

   - With inline datum `CrowdfundDatum` of proposal details, `completion_script` set to be `2_start` script hash from `gov_crowdfund`, `share_token` set to be `2_share` script hash, `crowdfund` set to be `3_crowdfund` script hash and `current_fundraised_amount` set to be the lovelace value of output
   - Validation: N/A