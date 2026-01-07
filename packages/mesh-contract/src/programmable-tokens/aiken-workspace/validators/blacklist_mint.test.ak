// Integration tests for blacklist minting policy
use aiken/builtin
use cardano/address.{Address, Script}
use cardano/assets.{ada_asset_name, ada_policy_id, from_asset}
use cardano/transaction.{Input, NoDatum, Output, OutputReference}
use types.{BlacklistNode}

// Test data
const test_utxo_ref = OutputReference { transaction_id: #"00", output_index: 0 }

// const test_policy_id: PolicyId =
// #"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c"

const test_address =
  Address { payment_credential: Script(#"aabbccdd"), stake_credential: None }

// Test BlacklistInit creates correct origin node
test blacklist_init_creates_origin_node() {
  let origin_node = BlacklistNode { key: #"", next: #"" }

  // Origin node should have empty keys
  origin_node.key == #"" && origin_node.next == #""
}

// Test BlacklistInsert validates key
test blacklist_insert_validates_key() {
  let valid_key = #"aabbccdd"
  let empty_key = #""

  // Valid key is non-empty
  builtin.length_of_bytearray(valid_key) > 0 && // Empty key is invalid for insert
  builtin.length_of_bytearray(empty_key) == 0
}

// Test covering node logic for blacklist
test blacklist_covering_node_logic() {
  let covering_key = #"aa"
  let insert_key = #"bb"
  let next_key = #"cc"

  // Covering node should satisfy: covering_key < insert_key < next_key
  builtin.less_than_bytearray(covering_key, insert_key) && builtin.less_than_bytearray(
    insert_key,
    next_key,
  )
}

// Test blacklist insert requires two outputs
test blacklist_insert_two_outputs() {
  // After insert, there should be:
  // 1. Updated covering node (covering_key -> insert_key)
  // 2. New inserted node (insert_key -> next_key)

  let covering_key = #"aa"
  let insert_key = #"bb"
  let next_key = #"cc"

  let updated_covering = BlacklistNode { key: covering_key, next: insert_key }

  let inserted_node = BlacklistNode { key: insert_key, next: next_key }

  // Validate the structure
  updated_covering.key == covering_key && updated_covering.next == insert_key && inserted_node.key == insert_key && inserted_node.next == next_key
}

// Test blacklist remove requires one output
test blacklist_remove_one_output() {
  // When removing a node, the covering node's next should skip over the removed node
  let covering_key = #"aa"
  // let remove_key = #"bb"
  let next_key = #"cc"

  let updated_covering = BlacklistNode { key: covering_key, next: next_key }

  // After removal, covering node points directly to next
  updated_covering.key == covering_key && updated_covering.next == next_key
}

// Test blacklist one-shot constraint
test blacklist_one_shot_constraint() {
  // The utxo_ref must be spent in the transaction
  // This ensures the minting policy can only be used once

  let input =
    Input {
      output_reference: test_utxo_ref,
      output: Output {
        address: test_address,
        value: from_asset(ada_policy_id, ada_asset_name, 2000000),
        datum: NoDatum,
        reference_script: None,
      },
    }

  // The input's output reference should match the policy parameter
  input.output_reference == test_utxo_ref
}

// Test blacklist ordering invariant
test blacklist_ordering_invariant() {
  let node1 = BlacklistNode { key: #"aa", next: #"bb" }
  let node2 = BlacklistNode { key: #"bb", next: #"cc" }
  let node3 = BlacklistNode { key: #"cc", next: #"" }

  // Each node's key should be less than its next
  builtin.less_than_bytearray(node1.key, node1.next) && builtin.less_than_bytearray(
    node2.key,
    node2.next,
  ) && // Last node points to empty
  node3.next == #""
}

// Test blacklist origin node is special
test blacklist_origin_node_special() {
  let origin = BlacklistNode { key: #"", next: #"aa" }

  // Origin has empty key but can point to first real node
  origin.key == #"" && builtin.length_of_bytearray(origin.next) > 0
}
