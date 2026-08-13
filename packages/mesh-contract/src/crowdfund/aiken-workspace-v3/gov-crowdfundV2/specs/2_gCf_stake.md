# Specification - gCf_stake

## Overview

The `gCf_stake` validator is a stake script validator that coordinates publishing operations (certificate registration/deregistration) and governance proposal/vote validation. It works in conjunction with `gCf_spend` to provide governance capabilities. The validator no longer handles token minting/burning - `auth_token` is used throughout all phases.

## Parameters

- `auth_token`: PolicyId - The policy ID of the crowdfunding authentication token (used for reference)
- `spend`: ByteArray - The script hash of the `gCf_spend` validator
- `gov_action_period`: Int - The buffer period added to crowdfund deadline for governance operations (currently unused but reserved for future use)

## User Actions

### 1. Publish - Register

**Purpose**: Validate that stake/DRep registration is happening via the spend validator.

**Requirements**:
- Redeemer: `Register`
- Exactly one input from the `spend` script address
- The spend validator input must have redeemer `RegisterCerts`

**Validation**:
- Spend script input redeemer check: Ensures `RegisterCerts` is being used in spend validator

**Usage**: Called when registering certificates and submitting governance proposal.

### 2. Publish - Deregister

**Purpose**: Validate that stake/DRep deregistration is happening via the spend validator.

**Requirements**:
- Redeemer: `Deregister`
- Exactly one input from the `spend` script address
- The spend validator input must have redeemer `DeregisterCerts`

**Validation**:
- Spend script input redeemer check: Ensures `DeregisterCerts` is being used in spend validator

**Usage**: Called when deregistering certificates after governance period.

### 3. Propose

**Purpose**: Validate that a governance proposal is being submitted via the spend validator.

**Requirements**:
- Exactly one input from the `spend` script address
- The spend validator input must have redeemer `RegisterCerts`

**Validation**:
- Spend script input redeemer check: Ensures `RegisterCerts` is being used in spend validator

**Usage**: Called when submitting a governance proposal. The proposal itself is validated in the spend validator's `RegisterCerts` case.

### 4. Vote

**Purpose**: Validate that a governance vote is being cast via the spend validator.

**Requirements**:
- Exactly one input from the `spend` script address
- The spend validator input must have redeemer `VoteOnGovAction`

**Validation**:
- Spend script input redeemer check: Ensures `VoteOnGovAction` is being used in spend validator

**Usage**: Called when voting on a governance action. The vote itself is validated in the spend validator's `VoteOnGovAction` case.

## Relationship with gCf_spend

The `gCf_stake` validator acts as a coordination layer that:

1. **Publishing**: Validates that certificate registration/deregistration operations are properly coordinated through the spend validator

2. **Governance**: Ensures that proposal submission and voting operations are properly coordinated through the spend validator

The actual business logic and state transitions are handled by `gCf_spend`, while `gCf_stake` ensures these operations are authorized and coordinated correctly.

## Token Usage

- **`auth_token`**: Used throughout all phases to identify UTxOs. The same `auth_token` policy is used consistently across crowdfunding and governance phases, with empty token name (`""`)
- **`stake_hash`**: The stake validator's script hash is stored in all datum states (`Crowdfund`, `Proposed`, `Voted`, and `Refundable` for post-governance withdrawals) and used as:
  - The return address for governance proposals
  - The DRep credential for voting

## Integration Points

- **Spend Validator Coordination**: All governance operations must be coordinated through the spend validator with appropriate redeemers
- **No Token Minting/Burning**: The stake validator no longer handles token lifecycle - `auth_token` is used throughout all phases
