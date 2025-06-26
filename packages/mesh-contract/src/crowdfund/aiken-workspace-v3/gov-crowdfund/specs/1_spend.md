# Specification - Spend

## Parameter

- `delegate_pool_id`: ByteArray
- `gov_action`: GovernanceAction
- `proposer_key_hash`: ByteArray
- `stake_register_deposit`: Int
- `drep_register_deposti`: Int

## Datum

```rs
pub type Datum {
  Init {
    completion_script: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
  Proposed {
    completion_script: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
  Refundable {
    completion_script: ByteArray,
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
     - Output datum in state of `Proposed`
     - fields exactly the same
   - Registering stake cert
   - Registering DRep cert
   - Delegate to current own DRep + stake pool `delegate_pool_id`
   - Propose gov action
   - Vote on same proposal? -> if cant, create one more separate state
   - todo: check 100k lock before ratification correctly

2. DeregisterCerts

   - deadline is passed
   - Only one input and output from current address
     - Input datum in state of `Proposed`
     - Output datum in state of `Refundable`
     - fields exactly the same
   - Deregistering both certs
   - Refunds go into the output

3. ContributorWithdrawal

   - Input datum in state of Refundable
   - `deadline` is passed
   - The lovelace unlocking from current equal exactly the amount that the `share_token` with token name of `completion_script` is burnt

4. RemoveEmptyInstance

   - Input datum in state of Refundable
   - `deadline` is passed
   - share token with token name `completion_script` burning in current tx == `current_fundraised_amount`
   - signed by `proposer_key_hash`
