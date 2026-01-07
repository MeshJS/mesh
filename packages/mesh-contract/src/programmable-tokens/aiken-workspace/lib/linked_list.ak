use aiken/collection/dict
use aiken/collection/list
use aiken/primitive/bytearray
use cardano/address.{Credential, Script, VerificationKey}
// Linked list validation logic for registry and blacklist
// Migrated from SmartTokens.LinkedList.Common and SmartTokens.LinkedList.BlacklistCommon

use cardano/assets.{PolicyId, Value, tokens}
use cardano/transaction.{Input, Output, Transaction}
use types.{BlacklistNode, RegistryNode, empty_vkey, origin_node_tn}
use utils.{
  bytearray_lt, count_unique_tokens, expect_inline_datum, has_currency_symbol,
}

/// Validate that a registry node output has the correct structure
/// QUESTION: should the `transfer_logic_script: Credential` and `third_party_transfer_logic_script: Credential` be empty for the origin node?
pub fn validate_directory_node_output(
  output: Output,
  node_cs: PolicyId,
) -> RegistryNode {
  let value = output.value
  let datum = expect_inline_datum(output)

  // Must have exactly 2 unique tokens (Ada + node token)
  expect count_unique_tokens(value) == 2

  // Must have exactly 1 node token from this policy
  let node_tokens = tokens(value, node_cs)
  expect dict.size(node_tokens) == 1

  // Parse datum as RegistryNode
  expect node: RegistryNode = datum

  // Node must be ordered: key < next
  expect bytearray_lt(node.key, node.next)

  // Token name must match the key - convert dict to list for pattern matching
  let token_pairs = dict.to_pairs(node_tokens)
  expect [Pair(tn, qty)] = token_pairs
  expect qty == 1
  expect tn == node.key || tn == origin_node_tn

  node
}

/// Validate that a blacklist node output has the correct structure
pub fn validate_blacklist_node_output(
  output: Output,
  node_cs: PolicyId,
) -> BlacklistNode {
  let value = output.value
  let datum = expect_inline_datum(output)

  // Must have exactly 2 unique tokens (Ada + node token)
  expect count_unique_tokens(value) == 2

  // Must have exactly 1 node token from this policy
  let node_tokens = tokens(value, node_cs)
  expect dict.size(node_tokens) == 1

  // Parse datum as BlacklistNode
  expect node: BlacklistNode = datum

  // Node must be ordered: key < next
  expect bytearray_lt(node.key, node.next)

  // Token name must match the key - convert dict to list for pattern matching
  let token_pairs = dict.to_pairs(node_tokens)
  expect [Pair(tn, qty)] = token_pairs
  expect qty == 1
  expect tn == node.key || tn == origin_node_tn

  node
}

/// Get all inputs and outputs at the node validator address
pub fn collect_node_ios(
  tx: Transaction,
  node_cs: PolicyId,
) -> (List<Input>, List<Output>) {
  // Find inputs that have the node token
  let node_inputs =
    list.filter(
      tx.inputs,
      fn(input) { has_currency_symbol(input.output.value, node_cs) },
    )

  // Find outputs that have the node token
  let node_outputs =
    list.filter(
      tx.outputs,
      fn(output) { has_currency_symbol(output.value, node_cs) },
    )

  // All node outputs must be at the same address as the first node input
  when node_inputs is {
    [first, ..] -> {
      let expected_address = first.output.address
      expect
        list.all(
          node_outputs,
          fn(output) { output.address == expected_address },
        )
      (node_inputs, node_outputs)
    }
    [] -> ([], node_outputs)
  }
}

/// Validate registry Init: no inputs, one empty origin node output, mint origin token
pub fn validate_directory_init(
  node_inputs: List<Input>,
  node_outputs: List<Output>,
  mint: Value,
  node_cs: PolicyId,
) -> Bool {
  // Exactly one node output
  expect [node_output] = node_outputs
  let node = validate_directory_node_output(node_output, node_cs)

  and {
    // No node inputs should be spent
    list.is_empty(node_inputs)?,
    // Node must be empty (origin node)
    (node.key == #"")?,
    (node.next == #"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")?,
    (node.transfer_logic_script == empty_vkey)?,
    (node.third_party_transfer_logic_script == empty_vkey)?,
    (node.global_state_cs == #"")?,
    // Must mint exactly one origin token and no other tokens from this policy
    assets.has_nft(mint, node_cs, origin_node_tn)?,
  }
}

/// Validate blacklist Init: same as directory but for BlacklistNode
pub fn validate_blacklist_init(
  node_inputs: List<Input>,
  node_outputs: List<Output>,
  mint: Value,
  node_cs: PolicyId,
) -> Bool {
  // Exactly one node output
  expect [node_output] = node_outputs
  let node = validate_blacklist_node_output(node_output, node_cs)

  and {
    // No node inputs should be spent
    list.is_empty(node_inputs),
    // Node must be empty (origin node)
    node.key == #"",
    node.next == #"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    // Must mint exactly one origin token and no other tokens from this policy
    assets.has_nft(mint, node_cs, origin_node_tn),
  }
}

/// Check if a registry node represents an insertion at a specific position
pub fn is_inserted_directory_node(
  node: RegistryNode,
  insert_key: ByteArray,
  next_key: ByteArray,
) -> Bool {
  and {
    (node.key == insert_key)?,
    (node.next == next_key)?,
    // Validate credentials are properly formed
    is_valid_credential(node.transfer_logic_script)?,
    is_valid_credential(node.third_party_transfer_logic_script)?,
    // Validate global_state_cs is valid (can be empty or 28 bytes)
    (bytearray.length(node.global_state_cs) == 0 || bytearray.length(
      node.global_state_cs,
    ) == 28)?,
  }
}

/// Validate that a credential is properly formed
/// Allows empty credentials (for origin node) or valid 28-byte hashes
pub fn is_valid_credential(cred: Credential) -> Bool {
  when cred is {
    VerificationKey(hash) -> bytearray.length(hash) <= 28
    Script(hash) -> bytearray.length(hash) <= 28
  }
}

/// Check if a registry node represents the covering node after insertion
pub fn is_updated_directory_node(
  node: RegistryNode,
  original_key: ByteArray,
  insert_key: ByteArray,
) -> Bool {
  node.key == original_key && node.next == insert_key
}

/// Check if a blacklist node represents an insertion
pub fn is_inserted_blacklist_node(
  node: BlacklistNode,
  insert_key: ByteArray,
  next_key: ByteArray,
) -> Bool {
  node.key == insert_key && node.next == next_key
}

/// Check if a blacklist node represents the covering node after insertion
pub fn is_updated_blacklist_node(
  node: BlacklistNode,
  original_key: ByteArray,
  insert_key: ByteArray,
) -> Bool {
  node.key == original_key && node.next == insert_key
}
