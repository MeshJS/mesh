# User Actions Documentation

## Normal Users

1. Withdraw fund. Burning ``share_token``

   - Validation: 1.4, 2.2 from `aiken_crowdfund`

## Proposer

1. Complete Crowdfund. Sending `auth_token` and `fundraised_amount` to start the proposal

   - Validation: 2.1 `Withdraw`, 2.1 `Mint`, 3.2 from `aiken_crowdfund`

2. Register Certificates. Proposing `gov_action`, registering stake cert, registering drep cert, delegating vote to drep and delegating stake to `delegate_pool_id`

   - Validation: 1.1, 2.1 `Publish`, 2.1 `Propose`

3. Vote Own Proposal. Voting `yes` to own proposal by drep

   - Validation: 1.2, 2.1 `Vote`

4. Unregister Certificates. unregistering stake cert and unregistering drep cert

   - Validation: 1.3, 2.2 `Publish`

5. Withdraw fund. Burning `share_token`

   - Validation: 1.4, 2.2 from `aiken_crowdfund`

6. Remove Crowdfund. Burning the `only_token`

   - Validation: 1.4, 2.2 `Mint`, 2.2 from `aiken_crowdfund`