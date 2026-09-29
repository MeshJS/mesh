# User Actions Documentation

## Normal Users

1. Contribute fund. Minting `share_token`

   - Validation: 2.1, 3.1

2. Withdraw fund. Burning `share_token`

   - Validation: 2.2, 3.3

## Proposer

1. Contribute fund. Minting `share_token`

   - Validation: 2.1, 3.1

2. Withdraw fund. Burning `share_token`

   - Validation: 2.2, 3.3

3. Complete Crowdfund. Sending `auth_token` and `fundraised_amount` to `1_spend` from `gov-aiken`. Proposer is required to add `min_charge` to `auth_token` utxo

   - Validation: 3.2, 2.1 `Withdraw`, 2.1 `Mint` from `gov_crowdfund`

4. Remove Crowdfund. Burning the `auth_token`

   - Validation: 1.2, 2.2, 3.4
