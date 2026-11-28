# Specification - gCf_spend

## Overview

The `gCf_spend` validator is a unified spending validator that handles both crowdfunding operations and governance operations. It merges functionality from `aiken-crowdfund` and `gov-crowdfund` into a single contract.

## Parameters

- `auth_token`: PolicyId - The policy ID of the crowdfunding authentication token
- `proposer_key_hash`: ByteArray - The hash of the proposer's public key for authorization
- `gov_action`: VGovernanceAction - The governance action to be proposed
- `delegate_pool_id`: ByteArray - The stake pool ID to delegate to during governance
- `stake_register_deposit`: Lovelace - Dynamic stake registration deposit amount
- `drep_register_deposit`: Lovelace - Dynamic DRep registration deposit amount
- `gov_deposit`: Lovelace - Dynamic governance proposal deposit amount

## Datum

The validator accepts `CrowdfundGovDatum` which can be in one of four states. The main user-facing states are `Crowdfund`, `Proposed`, and `Voted`. The `Refundable` state is an intermediate state used for post-governance fund withdrawals:

```rs
pub type CrowdfundGovDatum {
  // Crowdfunding phase - active crowdfunding campaign
  Crowdfund {
    stake_hash: ByteArray,
    share_token: ByteArray,
    crowdfund_address: Address,
    fundraise_target: Int,
    current_fundraised_amount: Int,
    allow_over_subscription: Bool,
    deadline: Int,
    expiry_buffer: Int,
    min_charge: Int
  }
  // Governance phase - proposal submitted
  Proposed {
    stake_hash: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
  // Governance phase - proposal voted on
  Voted {
    stake_hash: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
    gov_tx_id: GovernanceActionId,
    deadline: Int,
  }
  // Governance phase - ready for refunds
  Refundable {
    stake_hash: ByteArray,
    share_token: ByteArray,
    funds_controlled: Int,
  }
}
```

## User Actions

### 1. ContributeFund

**Phase**: Crowdfunding  
**Datum State**: `Crowdfund` → `Crowdfund`

Allows contributors to add funds to an active crowdfunding campaign.

**Requirements**:
- Exactly one input with `auth_token` (empty token name) from current address
- Exactly one output with `auth_token` (empty token name) to current address
- Minimum contribution: 2 ADA (2,000,000 lovelace)
- The increase in output lovelace equals the increase in `current_fundraised_amount`
- If `allow_over_subscription` is `False`, `current_fundraised_amount` must not exceed `fundraise_target`
- Transaction must occur before `deadline`
- Output value must contain exactly 2 assets (`auth_token` + lovelace)
- Share tokens minted: exactly `fundraise_added` amount of `share_token` with empty token name (`""`)

**Validation**:
- Lovelace difference matches datum update
- Fundraise target constraint respected
- Deadline not passed
- Output datum correctly updated
- Share tokens minted proportionally

### 2. PreMatureContributorWithdrawal

**Phase**: Crowdfunding  
**Datum State**: `Crowdfund` → `Crowdfund`

Allows contributors to withdraw funds before crowdfunding completion if campaign failed or deadline expired.

**Requirements**:
- Exactly one input with `auth_token` (empty token name) from current address
- Exactly one output with `auth_token` (empty token name) to current address
- Either:
  - `deadline + expiry_buffer` has passed, OR
  - `current_fundraised_amount <= fundraise_target` (campaign failed)
- Lovelace withdrawn (negative difference) equals share tokens burned
- Output value must contain exactly 2 assets
- Share tokens burned: exactly `|lovelace_withdrawn|` amount of `share_token` with empty token name (`""`)

**Validation**:
- Validity period check OR fundraise failure check
- Lovelace withdrawn matches share tokens burned
- Output datum correctly updated with reduced `current_fundraised_amount`

### 3. PreMatureRemoveEmptyInstance

**Phase**: Crowdfunding  
**Datum State**: `Crowdfund` → (consumed)

Allows proposer to remove an empty crowdfunding instance after deadline.

**Requirements**:
- `deadline` has passed
- Exactly one input with `auth_token` (empty token name) from current address
- If `current_fundraised_amount > 0`:
  - Burn all `share_token` tokens (amount: `-current_fundraised_amount`, empty token name `""`)
  - Burn `auth_token` (amount: -1, empty token name `""`)
- If `current_fundraised_amount == 0`:
  - Burn only `auth_token` (amount: -1, empty token name `""`)
- Must be signed by `proposer_key_hash`

**Validation**:
- Deadline passed
- Appropriate tokens burned
- Proposer authorization

### 4. RegisterCerts

**Phase**: Governance  
**Datum State**: `Crowdfund` → `Proposed`

Registers stake and DRep certificates, delegates, and submits governance proposal. Can be called directly from the crowdfunding phase.

**Requirements**:
- Exactly one input with `auth_token` (empty token name) from current address
- Exactly one output with `auth_token` (empty token name) to current address
- Input datum must be `Crowdfund` state
- Output datum must be `Proposed` state with:
  - `stake_hash` from input datum
  - `share_token` from input datum
  - `funds_controlled` set to `current_fundraised_amount` from input datum
  - `deadline` from input datum
- Output value deducted by exactly `stake_register_deposit + drep_register_deposit + gov_deposit`
- Output value must contain exactly 2 assets (`auth_token` + lovelace)
- Current address must have inline stake credential

**Certificates Required**:
- Register stake certificate (no deposit required)
- Register DRep certificate with `drep_register_deposit`
- Delegate vote to own DRep (Registered credential)
- Delegate stake to `delegate_pool_id`
  - OR delegate both vote and stake in single certificate
- Submit governance proposal with:
  - Deposit: `gov_deposit`
  - Return address: Script(`stake_hash` from datum)
  - Governance action: `gov_action`

**Validation**:
- Lovelace deduction matches deposits
- Datum state transition correct
- All required certificates present
- Proposal procedure valid

### 5. VoteOnGovAction

**Phase**: Governance  
**Datum State**: `Proposed` → `Voted`

Records that the governance action has been voted on.

**Requirements**:
- Exactly one input with `auth_token` (empty token name) from current address
- Exactly one output with `auth_token` (empty token name) to current address
- Input datum must be `Proposed` state
- Output datum must be `Voted` state with:
  - Same fields as input except `gov_tx_id` added
  - `gov_tx_id` constructed from own input's `transaction_id` + `proposal_procedure: 0`
- Input and output values must be identical
- Output value must contain exactly 2 assets

**Vote Required**:
- DRep (Script(`stake_hash` from datum)) must vote `Yes` on the governance action identified by `gov_tx_id`

**Validation**:
- Value preservation
- Datum state transition correct
- Vote recorded correctly

### 6. DeregisterCerts

**Phase**: Governance  
**Datum State**: `Voted` → `Refundable`

Deregisters certificates and transitions to refundable state after governance period.

**Requirements**:
- `deadline` has passed
- Exactly one input with `auth_token` (empty token name) from current address
- Exactly one output with `auth_token` (empty token name) to current address
- Input datum must be `Voted` state
- Output datum must be `Refundable` state with same fields (excluding `gov_tx_id` and `deadline`)
- Output value increased by exactly `stake_register_deposit + drep_register_deposit + gov_deposit` (refunds)
- Output value must contain exactly 2 assets
- Current address must have inline stake credential

**Certificates Required**:
- Unregister stake certificate (refund received)
- Unregister DRep certificate with `drep_register_deposit` refund

**Validation**:
- Deadline passed
- Lovelace increase matches refunds
- Datum state transition correct
- Certificates deregistered

### 7. AfterCompleteContributorWithdrawal

**Phase**: Post-Governance  
**Datum State**: `Refundable` → `Refundable`

Allows contributors to withdraw funds after governance completion by burning share tokens.

**Requirements**:
- Exactly one input with `auth_token` (empty token name) from current address
- Exactly one output with `auth_token` (empty token name) to current address
- Input datum must be `Refundable` state
- Output datum must be `Refundable` state with `funds_controlled` increased by `lovelace_withdrawn`
- Lovelace withdrawn (negative difference) equals share tokens burned
- Output value must contain exactly 2 assets
- Share tokens burned: exactly `|lovelace_withdrawn|` amount of `share_token` with empty token name (`""`)

**Validation**:
- Lovelace withdrawn matches share tokens burned
- Output datum correctly updated

### 8. AfterCompleteRemoveEmptyInstance

**Phase**: Post-Governance  
**Datum State**: `Refundable` → (consumed)

Allows proposer to remove empty instance after all funds withdrawn.

**Requirements**:
- Exactly one input with token of policy `stake_hash` (from datum, empty token name) from current address
- If `funds_controlled > 0`:
  - Burn all remaining `share_token` tokens (amount: `-funds_controlled`, empty token name `""`)
- Burn `auth_token` (amount: -1, empty token name `""`)
- Must be signed by `proposer_key_hash`

**Validation**:
- Appropriate tokens burned
- Proposer authorization

## State Transition Flow

**Main Flow:**
```
Crowdfund → RegisterCerts → Proposed
Proposed → VoteOnGovAction → Voted
Voted → DeregisterCerts → Refundable
```

**Post-Governance:**
```
Refundable → AfterCompleteContributorWithdrawal → Refundable (loop until empty)
Refundable → AfterCompleteRemoveEmptyInstance → (consumed)
```

The `Refundable` state is an intermediate state that allows contributors to withdraw funds after governance completion. From a user perspective, withdrawals happen after the governance proposal is voted on (Voted state), but internally the contract transitions through `Refundable` for fund management.

## Token Usage

- **`auth_token`**: Used throughout all phases (Phases 1-4) to identify UTxOs. Token name is empty string (`""`) in all phases
- **`share_token`**: Minted/burned proportionally to contributions/withdrawals. Token name is empty string (`""`) in all phases
- **`stake_hash`**: Stored in all datum states (`Crowdfund`, `Proposed`, `Voted`, `Refundable`). This is the stake validator script hash, used as the return address for governance proposals and as the DRep credential for voting
