// Unit tests for linked list validation logic
use cardano/address.{Script}
use linked_list.{
  is_inserted_blacklist_node, is_inserted_directory_node,
  is_updated_blacklist_node, is_updated_directory_node,
}
use types.{BlacklistNode, RegistryNode}
use utils.{bytearray_lt}

// Helper to create a test address
// fn test_address() -> Address {
//   Address { payment_credential: Script(#"aabbccdd"), stake_credential: None }
// }

// Test is_updated_directory_node
test is_updated_directory_node_works() {
  let original_key = #"aa"
  let insert_key = #"bb"

  // let next_key = #"cc"
  let node =
    RegistryNode {
      key: original_key,
      next: insert_key,
      transfer_logic_script: Script(#"11"),
      third_party_transfer_logic_script: Script(#"22"),
      global_state_cs: #"",
    }

  is_updated_directory_node(node, original_key, insert_key)
}

// Test is_updated_directory_node negative
test is_updated_directory_node_negative() {
  let original_key = #"aa"
  let insert_key = #"bb"
  let wrong_key = #"dd"

  let node =
    RegistryNode {
      key: original_key,
      next: wrong_key,
      transfer_logic_script: Script(#"11"),
      third_party_transfer_logic_script: Script(#"22"),
      global_state_cs: #"",
    }

  !is_updated_directory_node(node, original_key, insert_key)
}

// Test is_inserted_directory_node
test is_inserted_directory_node_works() {
  let insert_key = #"bb"
  let next_key = #"cc"
  let transfer_logic = Script(#"11")
  let third_party_transfer_logic = Script(#"22")
  let global_state = #"33333333333333333333333333333333333333333333333333333333"

  let node =
    RegistryNode {
      key: insert_key,
      next: next_key,
      transfer_logic_script: transfer_logic,
      third_party_transfer_logic_script: third_party_transfer_logic,
      global_state_cs: global_state,
    }

  is_inserted_directory_node(node, insert_key, next_key)
}

// Test is_updated_blacklist_node
test is_updated_blacklist_node_works() {
  let original_key = #"aa"
  let insert_key = #"bb"

  let node = BlacklistNode { key: original_key, next: insert_key }

  is_updated_blacklist_node(node, original_key, insert_key)
}

// Test is_inserted_blacklist_node
test is_inserted_blacklist_node_works() {
  let insert_key = #"bb"
  let next_key = #"cc"

  let node = BlacklistNode { key: insert_key, next: next_key }

  is_inserted_blacklist_node(node, insert_key, next_key)
}

// Test blacklist node ordering
test blacklist_node_ordering() {
  let key1 = #"aa"
  let key2 = #"bb"
  let key3 = #"cc"

  // Nodes should be in lexicographical order
  bytearray_lt(key1, key2) && bytearray_lt(key2, key3)
}

// Test directory node ordering
test directory_node_ordering() {
  let key1 = #"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c"
  let key2 = #"1112131415161718191a1b1c0d0e0f0102030405060708090a0b0c0d"
  let key3 = #"2122232425262728292a2b2c2d2e2f303132333435363738393a3b3c"

  // CS ordering
  bytearray_lt(key1, key2) && bytearray_lt(key2, key3)
}

// Test empty origin node keys
test origin_node_empty_keys() {
  let empty = #""

  // Origin node has empty key and next
  let origin_node =
    RegistryNode {
      key: empty,
      next: empty,
      transfer_logic_script: Script(#"11"),
      third_party_transfer_logic_script: Script(#"22"),
      global_state_cs: #"",
    }

  origin_node.key == #"" && origin_node.next == #""
}
