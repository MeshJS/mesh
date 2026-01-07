use aiken/collection/list
// Programmable Token Issuance Minting Policy
// This policy handles minting and burning of registered programmable tokens
// Migrated from SmartTokens.Contracts.Issuance

use cardano/address.{Credential, Inline}
use cardano/assets.{PolicyId, flatten, quantity_of}
use cardano/transaction.{Mint, Output, ScriptPurpose, Transaction}
use types.{SmartTokenMintingAction}

// Do two tokens with exactly same minting logic credential (issueing credential) then will have same policy id ??
validator issuance_mint(
  // <- static, cosntant hash
  programmable_logic_base: Credential,
  // <- the hash of the contract of the logic for minting.
  minting_logic_cred: Credential,
) {
  mint(
    redeemer: SmartTokenMintingAction,
    own_policy: PolicyId,
    self: Transaction,
  ) {
    // Check that the minting logic script is invoked
    let invoked_scripts =
      list.map(
        self.withdrawals,
        fn(wdrl) {
          let Pair(cred, _amount) = wdrl
          cred
        },
      )

    // Get the minted/burned amount for this policy
    let own_tokens = flatten(self.mint)
    let tokens_for_policy =
      list.filter(
        own_tokens,
        fn(token) {
          let (cs, _tn, _qty) = token
          cs == own_policy
        },
      )

    expect [(_cs, tn, qty)] = tokens_for_policy

    let valid_minting =
      if qty > 0 {
        // Minting tokens
        // First output must receive the minted tokens at programmable_logic_base
        // AND must have a stake credential to prevent permanent token locking
        expect [first_output, ..] = self.outputs

        // Validate that the output has a stake credential
        expect Some(Inline(_stake_cred)) = first_output.address.stake_credential
        and {
          (first_output.address.payment_credential == programmable_logic_base)?,
          (quantity_of(first_output.value, own_policy, tn) == qty)?,
        }
      } else if qty < 0 {
        // Burning tokens - no additional checks needed beyond the minting logic being invoked
        True
      } else {
        // Zero minting is not allowed
        fail @"Cannot mint zero tokens"
      }

    and {
      // Validate that the redeemer matches the minting logic credential
      (redeemer.minting_logic_cred == minting_logic_cred)?,
      // substandard minting invoked?
      list.has(invoked_scripts, minting_logic_cred)?,
      // Check that exactly one minting redeemer matches the minting logic credential
      // This prevents multiple concurrent mints with the same minting logic in one transaction
      single_mint_with_credential(self.redeemers, redeemer)?,
      // For POC, we only allow one token name per policy
      (list.length(tokens_for_policy) == 1)?,
      valid_minting?,
    }
  }

  else(_) {
    fail
  }
}

/// Check that exactly one minting redeemer with the given action exists in the transaction
/// This prevents multiple concurrent mints with the same minting logic credential
///
/// The logic follows Plutarch's psingleMintWithCredential (lines 145-193):
/// 1. Scan all redeemers
/// 2. Filter for Mint purposes only
/// 3. Count how many match the given redeemer
/// 4. Ensure exactly one match exists
fn single_mint_with_credential(
  redeemers: Pairs<ScriptPurpose, Data>,
  target_redeemer: SmartTokenMintingAction,
) -> Bool {
  let target_redeemer_data: Data = target_redeemer

  let matching_count =
    list.foldl(
      redeemers,
      0,
      fn(pair, count) {
        let Pair(purpose, rdmr) = pair

        when purpose is {
          Mint(_) ->
            if rdmr == target_redeemer_data {
              count + 1
            } else {
              count
            }
          _ -> count
        }
      },
    )

  matching_count == 1
}
