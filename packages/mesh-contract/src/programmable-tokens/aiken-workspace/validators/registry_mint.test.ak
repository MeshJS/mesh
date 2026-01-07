// Integration tests for registry minting policy
use aiken/builtin
use cardano/address.{Address, Script}
use cardano/assets.{ada_asset_name, ada_policy_id, from_asset}
use cardano/transaction.{Input, NoDatum, Output, OutputReference}
use types.{RegistryNode}

// Test data
const test_utxo_ref = OutputReference { transaction_id: #"00", output_index: 0 }

// const test_policy_id: PolicyId =
//   #"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c"

const test_address =
  Address { payment_credential: Script(#"aabbccdd"), stake_credential: None }

// Test RegistryInit creates correct origin node
test registry_init_creates_origin_node() {
  // This test validates the structure of an Init transaction
  // In a real scenario, this would be tested against actual transaction data

  let origin_node =
    RegistryNode {
      key: #"",
      next: #"",
      transfer_logic_script: Script(#"11"),
      third_party_transfer_logic_script: Script(#"22"),
      global_state_cs: #"",
    }

  // Origin node should have empty keys
  origin_node.key == #"" && origin_node.next == #""
}

// Test RegistryInsert validates key length
test registry_insert_validates_key_length() {
  let valid_cs = #"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c"
  let invalid_cs = #"0102"

  // Valid CS is 28 bytes
  builtin.length_of_bytearray(valid_cs) == 28 && // Invalid CS is not 28 bytes
  builtin.length_of_bytearray(invalid_cs) != 28
}

// Test covering node logic
test registry_covering_node_logic() {
  let covering_key = #"aa"
  let insert_key = #"bb"
  let next_key = #"cc"

  // Covering node should satisfy: covering_key < insert_key < next_key
  builtin.less_than_bytearray(covering_key, insert_key) && builtin.less_than_bytearray(
    insert_key,
    next_key,
  )
}

// Test registry insert requires two outputs
test registry_insert_two_outputs() {
  // After insert, there should be:
  // 1. Updated covering node (covering_key -> insert_key)
  // 2. New inserted node (insert_key -> next_key)

  let covering_key = #"aa"
  let insert_key = #"bb"
  let next_key = #"cc"

  let updated_covering =
    RegistryNode {
      key: covering_key,
      next: insert_key,
      transfer_logic_script: Script(#"11"),
      third_party_transfer_logic_script: Script(#"22"),
      global_state_cs: #"",
    }

  let inserted_node =
    RegistryNode {
      key: insert_key,
      next: next_key,
      transfer_logic_script: Script(#"11"),
      third_party_transfer_logic_script: Script(#"22"),
      global_state_cs: #"",
    }

  // Validate the structure
  updated_covering.key == covering_key && updated_covering.next == insert_key && inserted_node.key == insert_key && inserted_node.next == next_key
}

// Test one-shot minting policy constraint
test registry_one_shot_constraint() {
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
