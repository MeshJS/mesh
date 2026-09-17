# User Actions Documentation

## Contributors (Normal Users)

### Phase 1: Crowdfunding

1. **ContributeFund** - Add funds to active crowdfunding campaign
   - **Redeemer**: `ContributeFund`
   - **Datum State**: `Crowdfund` → `Crowdfund`
   - **Requirements**:
     - Minimum contribution: 2 ADA (2,000,000 lovelace)
     - Transaction must occur before `deadline`
     - Share tokens minted proportionally to contribution amount
   - **Validation**: Lovelace difference matches datum update, fundraise target respected, deadline not passed

2. **PreMatureContributorWithdrawal** - Withdraw funds if campaign failed or expired
   - **Redeemer**: `PreMatureContributorWithdrawal`
   - **Datum State**: `Crowdfund` → `Crowdfund`
   - **Requirements**:
     - Either `deadline + expiry_buffer` has passed, OR campaign failed (`current_fundraised_amount <= fundraise_target`)
     - Share tokens burned equal to lovelace withdrawn
   - **Validation**: Validity period check OR fundraise failure check, share tokens burned match withdrawal

### Phase 3: Post-Governance Refunds

3. **AfterCompleteContributorWithdrawal** - Withdraw funds after governance completion
   - **Redeemer**: `AfterCompleteContributorWithdrawal`
   - **Datum State**: `Refundable` → `Refundable`
   - **Requirements**:
     - Burn `share_token` tokens (empty token name `""`)
     - Lovelace withdrawn equals share tokens burned
   - **Validation**: Lovelace withdrawn matches share tokens burned, datum correctly updated

## Proposer

### Phase 1: Crowdfunding

1. **PreMatureRemoveEmptyInstance** - Remove empty crowdfunding instance after deadline
   - **Redeemer**: `PreMatureRemoveEmptyInstance`
   - **Datum State**: `Crowdfund` → (consumed)
   - **Requirements**:
     - `deadline` has passed
     - If `current_fundraised_amount > 0`: Burn all `share_token` tokens and `auth_token`
     - If `current_fundraised_amount == 0`: Burn only `auth_token`
     - Must be signed by `proposer_key_hash`
   - **Validation**: Deadline passed, appropriate tokens burned, proposer authorization

### Phase 2: Governance

2. **RegisterCerts & VoteOnGovAction** - Register certificates, delegate, submit governance proposal, and vote on it
   - **Redeemers**: `RegisterCerts` followed by `VoteOnGovAction` (typically happen together or immediately sequentially)
   - **Datum State**: `Crowdfund` → `Proposed` (via RegisterCerts), then `Proposed` → `Voted` (via VoteOnGovAction)
   - **Requirements for RegisterCerts**:
     - Exactly one input/output with `auth_token` (empty token name) from current address
     - Register stake certificate (no deposit)
     - Register DRep certificate (deposit: `drep_register_deposit`)
     - Delegate vote to own DRep (Registered credential)
     - Delegate stake to `delegate_pool_id`
     - Submit governance proposal:
       - Deposit: `gov_deposit`
       - Return address: Script(`stake_hash` from datum)
       - Governance action: `gov_action`
     - Output value deducted by `stake_register_deposit + drep_register_deposit + gov_deposit`
   - **Requirements for VoteOnGovAction**:
     - Exactly one input/output with `auth_token` (empty token name) from current address
     - DRep (Script(`stake_hash` from datum)) votes `Yes` on the governance action
     - `gov_tx_id` recorded in output datum
     - Input and output values identical
   - **Validation**: Lovelace deduction matches deposits, all certificates present, proposal procedure valid, vote recorded correctly
   - **Note**: From a user perspective, these actions happen together, transitioning from `Crowdfund` through `Proposed` to `Voted` state

3. **DeregisterCerts** - Deregister certificates after governance period
   - **Redeemer**: `DeregisterCerts`
   - **Datum State**: `Voted` → `Refundable`
   - **Requirements**:
     - `deadline` has passed
     - Exactly one input/output with `auth_token` (empty token name) from current address
     - Unregister stake certificate (refund received)
     - Unregister DRep certificate (refund: `drep_register_deposit`)
     - Output value increased by `stake_register_deposit + drep_register_deposit + gov_deposit`
   - **Validation**: Deadline passed, lovelace increase matches refunds, certificates deregistered

### Phase 3: Post-Governance Cleanup

4. **AfterCompleteRemoveEmptyInstance** - Remove empty instance after all funds withdrawn
   - **Redeemer**: `AfterCompleteRemoveEmptyInstance`
   - **Datum State**: `Refundable` → (consumed)
   - **Requirements**:
     - Exactly one input with token of policy `stake_hash` (from datum, empty token name) from current address
     - If `funds_controlled > 0`: Burn all remaining `share_token` tokens (empty token name `""`)
     - Burn `auth_token` (empty token name `""`)
     - Must be signed by `proposer_key_hash`
   - **Validation**: Appropriate tokens burned, proposer authorization

## State Transitions Summary

**Main Flow:**
```
Crowdfund → RegisterCerts → Proposed
Proposed → VoteOnGovAction → Voted
Voted → DeregisterCerts → Refundable (after 6 epochs)
```

**Post-Governance:**
```
Refundable → AfterCompleteContributorWithdrawal → Refundable (loop until empty)
Refundable → AfterCompleteRemoveEmptyInstance → (consumed)
```

**Note**: From a user perspective, `RegisterCerts` and `VoteOnGovAction` typically happen together (or immediately sequentially), quickly transitioning from `Crowdfund` through `Proposed` to `Voted` state. The `Voted` state then transitions to `Refundable` via `DeregisterCerts` after the governance period (6 epochs). The simplified diagram may show `Proposed` as representing the post-vote state for clarity.

## Token Usage

- **auth_token**: Identifies UTxOs throughout all phases (Phases 1-4). Token name is empty string (`""`) in all phases. Used consistently across crowdfunding and governance phases
- **share_token**: Proportional tokens minted/burned with contributions/withdrawals. Token name is empty string (`""`) in all phases
- **stake_hash**: Stored in all datum states (`Crowdfund`, `Proposed`, `Voted`, `Refundable`). This is the stake validator script hash, used as the return address for governance proposals and as the DRep credential for voting
