use aiken/collection/dict
use aiken/collection/list
use aiken/primitive/bytearray
// Registry minting policy - manages the linked list of registered programmable token policies
// Migrated from SmartTokens.LinkedList.MintDirectory
//
// This validator maintains a registry of programmable token policies.
// Each entry must be a valid programmable token that passes registration checks.

use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use linked_list.{
  collect_node_ios, is_inserted_directory_node, is_updated_directory_node,
  validate_directory_init, validate_directory_node_output,
}
use types.{
  RegistryInit, RegistryInsert, RegistryRedeemer, RegistryNode,
  IssuanceCborHex,
}
use utils.{bytearray_lt,
  expect_inline_datum, is_programmable_token_registration}

validator registry_mint(
  utxo_ref: OutputReference,
  issuance_cbor_hex_cs: PolicyId,
) {
  mint(redeemer: RegistryRedeemer, policy_id: PolicyId, self: Transaction) {
    trace @"Starting registry_mint validation"
    let (node_inputs, node_outputs) = collect_node_ios(self, policy_id)

    when redeemer is {
      RegistryInit -> {
        // Ensure this is a one-shot minting policy by checking that utxo_ref is spent
        let is_utxo_consumed =
          list.any(
            self.inputs,
            fn(input) { input.output_reference == utxo_ref },
          )

        // Initialize the registry with an empty origin node
        and {
          is_utxo_consumed?,
          validate_directory_init(
            node_inputs,
            node_outputs,
            self.mint,
            policy_id,
          )?,
        }
      }
      RegistryInsert { key, hashed_param } -> {
        // Find the issuance CBOR hex reference input
        expect Some(issuance_ref_input) =
          //should this be a find.any instead of find.some?
          list.find(
            self.reference_inputs,
            fn(input) {
              let tokens =
                assets.tokens(input.output.value, issuance_cbor_hex_cs)
              !dict.is_empty(tokens)
            },
          )

        // Extract the IssuanceCborHex datum
        let issuance_datum = expect_inline_datum(issuance_ref_input.output)
        expect issuance_cbor: IssuanceCborHex = issuance_datum

        // Validate that the key being inserted is a valid programmable token
        // This checks:
        // 1. The computed policy ID (from prefix + hashed_param + postfix) matches the key
        // 2. Tokens with this policy ID are being minted in this transaction
        let is_token_registered =
          is_programmable_token_registration(
            key,
            issuance_cbor.prefix_cbor_hex,
            issuance_cbor.postfix_cbor_hex,
            hashed_param,
            self.mint,
          )

        // Must have exactly one node input (the covering node)
        expect [covering_input] = node_inputs
        let covering_datum = expect_inline_datum(covering_input.output)
        expect covering_node: RegistryNode = covering_datum

        // Must mint exactly one node token with the new key
        let just_single_mint = assets.has_nft(self.mint, policy_id, key)

        // Parse the outputs to find the two new nodes
        let output_nodes =
          list.map(
            node_outputs,
            fn(out) { validate_directory_node_output(out, policy_id) },
          )

        // One output must be the updated covering node (key -> insert_key)
        let registry_node_updated =
          list.any(
            output_nodes,
            fn(node) { is_updated_directory_node(node, covering_node.key, key) },
          )

        // One output must be the new inserted node (insert_key -> next)
        let registry_node_inserted =
          list.any(
            output_nodes,
            fn(node) {
              is_inserted_directory_node(node, key, covering_node.next)
            },
          )

        and {
          is_token_registered?,
          // Validate key is a valid currency symbol (28 bytes)
          (bytearray.length(key) == 28)?,
          // The covering node must cover the key to insert
          bytearray_lt(covering_node.key, key)?,
          bytearray_lt(key, covering_node.next)?,
          just_single_mint?,
          // Must have exactly 2 outputs: the updated covering node and the new inserted node
          (list.length(output_nodes) == 2)?,
          registry_node_updated?,
          registry_node_inserted?,
        }
      }
    }
  }

  else(_) {
    fail
  }
}
