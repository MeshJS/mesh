use aiken/builtin
use aiken/collection/list
// Example Transfer Logic - Simple permissioned transfer
// Migrated from SmartTokens.Contracts.ExampleTransferLogic

use cardano/address.{Credential, Inline, Script, VerificationKey}
use cardano/assets.{PolicyId, quantity_of}
use cardano/transaction.{Input, Transaction, Withdraw}
use types.{BlacklistProof, NonmembershipProof}
use utils

// Simple example: only allow transfers signed by a specific credential
validator example_transfer_logic(permitted_cred: Credential) {
  withdraw(_redeemer: Data, _account: Credential, self: Transaction) {
    // This example transfer logic simply checks that a specific credential
    // has authorized the transfer

    when permitted_cred is {
      VerificationKey(pkh) ->
        // Check that the transaction is signed by this public key
        list.has(self.extra_signatories, pkh)
      Script(script_hash) -> {
        // For script credentials, check that the script is invoked via withdrawals
        let script_cred = Script(script_hash)
        list.any(
          self.withdrawals,
          fn(wdrl) {
            let Pair(cred, _amount) = wdrl
            cred == script_cred
          },
        )
      }
    }
  }

  else(_) {
    fail
  }
}

/// Extract credential hashes from inputs with the programmable logic base credential
/// This builds the list of "witnesses" that need to be validated against the blacklist
fn extract_required_witnesses(
  inputs: List<Input>,
  prog_base_cred: Credential,
) -> List<ByteArray> {
  list.foldr(
    inputs,
    [],
    fn(input, acc) {
      if input.output.address.payment_credential == prog_base_cred {
        // Extract the staking credential hash
        when input.output.address.stake_credential is {
          Some(Inline(cred)) ->
            when cred is {
              VerificationKey(pkh) -> [pkh, ..acc]
              Script(script_hash) -> [script_hash, ..acc]
            }
          _ -> acc
        }
      } else {
        acc
      }
    },
  )
}

/// Validate that none of the witnesses are in the blacklist
/// For each witness, we check the corresponding proof which points to a covering node
/// in the blacklist. The proof is valid if: nodeKey < witnessKey < nodeNext
fn validate_witnesses(
  blacklist_node_cs: PolicyId,
  proofs: List<BlacklistProof>,
  reference_inputs: List<Input>,
  witnesses: List<ByteArray>,
) -> Bool {
  // Convert reference inputs to an indexed lookup (using list index)
  let validate_pair =
    fn(witness: ByteArray, proof: BlacklistProof) -> Bool {
      let NonmembershipProof { node_idx } = proof
      // Get the reference input at the specified index
      expect Some(ref_input) = list.at(reference_inputs, node_idx)

      // Extract and validate the blacklist node
      let node_output = ref_input.output

      // Verify the node has the blacklist currency symbol (authenticity check)
      expect
        quantity_of(node_output.value, blacklist_node_cs, "") > 0 || // Check for any token from this policy (some implementations use token names)
        list.any(
          assets.flatten(node_output.value),
          fn(asset) {
            let (cs, _tn, _qty) = asset
            cs == blacklist_node_cs
          },
        )

      // Extract the datum which should be a BlacklistNode
      let datum_data = utils.expect_inline_datum(node_output)
      expect node: types.BlacklistNode = datum_data

      // Verify non-membership: nodeKey < witnessKey < nodeNext
      // This proves the witness is NOT in the blacklist
      builtin.less_than_bytearray(node.key, witness) && builtin.less_than_bytearray(
        witness,
        node.next,
      )
    }

  // Zip witnesses with proofs and validate each pair
  list.map2(witnesses, proofs, validate_pair) |> list.all(fn(x) { x })
}

/// Check if this is a rewarding script (withdraw-zero trick)
fn is_rewarding_script(
  redeemers: Pairs<transaction.ScriptPurpose, transaction.Redeemer>,
  account: Credential,
) -> Bool {
  list.any(
    redeemers,
    fn(pair) {
      let Pair(purpose, _redeemer) = pair
      when purpose is {
        Withdraw(cred) -> cred == account
        _ -> False
      }
    },
  )
}

// Freeze-and-seize transfer logic validator
// This validates transfers against a blacklist
validator freeze_and_seize_transfer(
  programmable_logic_base_cred: Credential,
  blacklist_node_cs: PolicyId,
) {
  withdraw(proofs: List<BlacklistProof>, account: Credential, self: Transaction) {
    // 2. Extract all credential hashes from programmable logic base inputs
    let witnesses =
      extract_required_witnesses(self.inputs, programmable_logic_base_cred)

    and {
      // 1. Verify this is invoked as a rewarding script (withdraw-zero trick)
      is_rewarding_script(self.redeemers, account),
      // 3. Validate that all witnesses are NOT in the blacklist
      validate_witnesses(
        blacklist_node_cs,
        proofs,
        self.reference_inputs,
        witnesses,
      ),
    }
  }

  else(_) {
    fail
  }
}
