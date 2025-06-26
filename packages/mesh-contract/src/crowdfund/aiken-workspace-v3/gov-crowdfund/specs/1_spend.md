# Specification - Spend

## Parameter

- `delegate_pool_id`: ByteArray
- `gov_action`: GovernanceAction
- `proposer_key_hash`: ByteArray
- `stake_register_deposit`: Lovelace
- `drep_register_deposit`: Lovelace

## Datum

```rs
pub type Datum {
  Init {
    start_hash: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
  Proposed {
    start_hash: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
  Voted {
    start_hash: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    gov_tx_id: GovernanceActionId
    deadline: Int,
  }
  Refundable {
    start_hash: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
}
```

## User Action

1. RegisterCerts

   - Only one input and output from current address
     - Input datum in state of `Init`
     - Output value has deducted with 502 ADA exactly
     - Output datum in state of `Proposed`
     - fields exactly the same
   - Registering stake cert
   - Registering DRep cert with drep_register_deposit
   - Delegate to current own DRep + stake pool `delegate_pool_id`
   - Propose gov action

2. VoteOnGovAction

   - Only one input and output from current address
     - Input datum in state of `Proposed`
     - Check output value (deducted by 100k ADA exactly)
     - Output datum in state of `Voted`, with `gov_tx_id` composed by own's input `TransactionId` + `proposal_procedure` as 0
     - fields exactly the same

3. DeregisterCerts

   - deadline is passed
   - Only one input and output from current address
     - Input datum in state of `Voted`
     - Output datum in state of `Refundable`
     - fields exactly the same
   - Deregistering both certs
   - Refunds (502ADA) go into the output

4. ContributorWithdrawal

   - Input datum in state of Refundable
   - `deadline` is passed
   - The lovelace unlocking from current equal exactly the amount that the `share_token` with token name of `completion_script` is burnt

5. RemoveEmptyInstance

   - Input datum in state of Refundable
   - `deadline` is passed
   - share token with token name `completion_script` burning in current tx == `current_fundraised_amount`
   - signed by `proposer_key_hash`
