use aiken/builtin
use aiken/collection/list
// Blacklist minting policy - manages the linked list of sanctioned addresses
// Migrated from SmartTokens.LinkedList.MintBlacklist
//
// This validator manages a linked list of blacklisted addresses (public key hashes).
// Only the authorized manager can insert or remove entries from the blacklist.

use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use linked_list.{
  collect_node_ios, is_inserted_blacklist_node, is_updated_blacklist_node,
  validate_blacklist_init, validate_blacklist_node_output,
}
use types.{
  BlacklistInit, BlacklistInsert, BlacklistNode, BlacklistRedeemer,
  BlacklistRemove,
}
use utils.{bytearray_lt, expect_inline_datum}

validator blacklist_mint(utxo_ref: OutputReference, manager_pkh: ByteArray) {
  mint(redeemer: BlacklistRedeemer, policy_id: PolicyId, self: Transaction) {
    // Ensure this is a one-shot minting policy by checking that utxo_ref is spent
    expect
      list.any(self.inputs, fn(input) { input.output_reference == utxo_ref })

    let (node_inputs, node_outputs) = collect_node_ios(self, policy_id)

    when redeemer is {
      BlacklistInit ->
        // Initialize the blacklist with an empty origin node
        validate_blacklist_init(node_inputs, node_outputs, self.mint, policy_id)

      BlacklistInsert { key } -> {
        // Authorization check: manager must sign the transaction
        let manager_signed =
          list.any(
            self.extra_signatories,
            fn(signatory) { signatory == manager_pkh },
          )

        // Must have exactly one node input (the covering node)
        expect [covering_input] = node_inputs
        let covering_datum = expect_inline_datum(covering_input.output)
        expect covering_node: BlacklistNode = covering_datum

        // Must mint exactly one node token with the new key
        let just_single_mint = assets.has_nft(self.mint, policy_id, key)

        // Parse the outputs to find the two new nodes
        let output_nodes =
          list.map(
            node_outputs,
            fn(out) { validate_blacklist_node_output(out, policy_id) },
          )

        // One output must be the updated covering node (key -> insert_key)
        // One output must be the new inserted node (insert_key -> next)
        let blacklist_node_updated =
          list.any(
            output_nodes,
            fn(node) { is_updated_blacklist_node(node, covering_node.key, key) },
          )

        let blacklist_node_inserted =
          list.any(
            output_nodes,
            fn(node) {
              is_inserted_blacklist_node(node, key, covering_node.next)
            },
          )
        and {
          // Validate key is a valid public key hash (28 bytes)
          builtin.length_of_bytearray(key) == 28,
          manager_signed,
          just_single_mint,
          // The covering node must cover the key to insert
          bytearray_lt(covering_node.key, key),
          bytearray_lt(key, covering_node.next),
          // Must have exactly 2 outputs: the updated covering node and the new inserted node
          list.length(output_nodes) == 2,
          blacklist_node_updated,
          blacklist_node_inserted,
        }
      }

      BlacklistRemove { key } -> {
        // Authorization check: manager must sign the transaction
        let manager_signed =
          list.any(
            self.extra_signatories,
            fn(signatory) { signatory == manager_pkh },
          )

        let input_datums =
          list.map(
            node_inputs,
            fn(input) {
              let datum = expect_inline_datum(input.output)
              expect node: BlacklistNode = datum
              node
            },
          )

        expect [node_a, node_b] = input_datums

        // Exactly one output node
        expect [output_node_out] = node_outputs
        let output_node =
          validate_blacklist_node_output(output_node_out, policy_id)

        // Must burn exactly one node token
        let just_single_burn =
          assets.quantity_of(self.mint, policy_id, key) == -1

        // Determine which node is being removed and validate the merge
        let checks =
          if node_a.key == key {
            // node_a is being removed, node_b is the covering node
            output_node.key == node_b.key && output_node.next == node_a.next && node_b.next == key
          } else if
          node_b.key == key {
            // node_b is being removed, node_a is the covering node
            output_node.key == node_a.key && output_node.next == node_b.next && node_a.next == key
          } else {
            fail @"Neither input matches the key to remove"
          }

        and {
          manager_signed,
          just_single_burn,
          // Must have exactly two node inputs: the node to remove and the covering node
          list.length(node_inputs) == 2,
          checks,
        }
      }
    }
  }

  else(_) {
    fail
  }
}
