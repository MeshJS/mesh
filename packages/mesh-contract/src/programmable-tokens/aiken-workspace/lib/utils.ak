use aiken/builtin
use aiken/collection/dict
use aiken/collection/list
// Utility functions for CIP-0143 validators
// Migrated from various Plutarch utility modules

use cardano/address.{Credential}
use cardano/assets.{PolicyId, Value, flatten, quantity_of}
use cardano/transaction.{InlineDatum, Input, Output, Transaction}

/// Check if a value contains at least the required amount of a specific asset
pub fn value_contains(value: Value, required: Value) -> Bool {
  list.all(
    flatten(required),
    fn(asset) {
      let (policy, name, req_qty) = asset
      quantity_of(value, policy, name) >= req_qty
    },
  )
}

// Is there any chance values have same assets.....
pub fn value_contains_v2(value: Value, required: Value) -> Bool {
  assets.reduce(
    required,
    True,
    fn(policy, name, req_qty, acc) {
      acc && quantity_of(value, policy, name) >= req_qty
    },
  )
}

// Is there any chance values have same assets.....
pub fn expect_value_contains_v3(value: Value, required: Value) -> Void {
  assets.reduce(
    required,
    Void,
    fn(policy, name, req_qty, _acc) {
      expect quantity_of(value, policy, name) >= req_qty
    },
  )
}

/// Get the datum from an output, expecting an inline datum
pub fn expect_inline_datum(output: Output) -> Data {
  expect InlineDatum(d) = output.datum
  d
}

/// Find an input by a predicate
pub fn find_input(
  inputs: List<Input>,
  predicate: fn(Input) -> Bool,
) -> Option<Input> {
  list.find(inputs, predicate)
}

/// Must find an input by predicate (fails if not found)
pub fn must_find_input(
  inputs: List<Input>,
  predicate: fn(Input) -> Bool,
) -> Input {
  when find_input(inputs, predicate) is {
    Some(input) -> input
    None -> fail @"Required input not found"
  }
}

/// Check if a currency symbol is present in a value
pub fn has_currency_symbol(value: Value, cs: PolicyId) -> Bool {
  // Check if I have assets name () -> quantity_of
  // to_dict - values are dict. , and 
  assets.to_dict(value) |> dict.has_key(cs)
  // !dict.is_empty(tokens(value, cs))
}

/// Count unique tokens in a value (number of distinct currency symbol + token name pairs)
pub fn count_unique_tokens(value: Value) -> Int {
  // Original
  // flatten(value) |> list.length
  assets.reduce(value, 0, fn(_policy, _name, _amount, acc) { acc + 1 })
}

/// Get all outputs paying to a specific credential
pub fn outputs_at_credential(
  outputs: List<Output>,
  cred: Credential,
) -> List<Output> {
  list.filter(outputs, fn(output) { output.address.payment_credential == cred })
}

/// Get all inputs spending from a specific credential
pub fn inputs_from_credential(
  inputs: List<Input>,
  cred: Credential,
) -> List<Input> {
  list.filter(
    inputs,
    fn(input) { input.output.address.payment_credential == cred },
  )
}

/// Count inputs from a specific credential
pub fn count_inputs_from_credential(
  inputs: List<Input>,
  cred: Credential,
) -> Int {
  inputs_from_credential(inputs, cred) |> list.length
}

/// Check if a transaction is signed by a public key hash
pub fn is_signed_by(tx: Transaction, pkh: ByteArray) -> Bool {
  list.any(tx.extra_signatories, fn(sig) { sig == pkh })
}

/// Check if a script is invoked (via withdrawal)
pub fn is_script_invoked(tx: Transaction, script_cred: Credential) -> Bool {
  list.any(
    tx.withdrawals,
    fn(withdrawal) {
      let Pair(cred, _amount) = withdrawal
      cred == script_cred
    },
  )
}

/// Get element at index from a list
pub fn elem_at(lst: List<a>, idx: Int) -> a {
  when list.drop(lst, idx) is {
    [elem, ..] -> elem
    [] -> fail @"Index out of bounds"
  }
}

/// Check if a bytearray is lexicographically less than another
pub fn bytearray_lt(a: ByteArray, b: ByteArray) -> Bool {
  builtin.less_than_bytearray(a, b)
}

/// Apply hashed parameter to prefix and postfix to compute policy ID
/// This reconstructs the minting policy script and hashes it to get the currency symbol
/// Follows Plutus V3 script format: version_header + prefix + serialized_param + postfix
pub fn apply_hashed_parameter(
  prefix: ByteArray,
  postfix: ByteArray,
  hashed_param: ByteArray,
) -> ByteArray {
  // Plutus V3 version header: most significant first encoding of version 3
  let version_header = #"03"

  // Build the script: version + prefix + serialized_param + postfix
  let script_bytes =
    builtin.append_bytearray(
      version_header,
      builtin.append_bytearray(
        prefix,
        builtin.append_bytearray(hashed_param, postfix),
      ),
    )

  // Hash with blake2b_224 to get the policy ID (28 bytes)
  builtin.blake2b_224(script_bytes)
}

/// Check if a currency symbol is a valid programmable token registration
/// Validates that:
/// 1. Tokens with this policy ID are being minted in the transaction
/// 2. The computed policy ID (from prefix + hashed_param + postfix) matches the currency symbol
pub fn is_programmable_token_registration(
  cs_to_insert: ByteArray,
  prefix: ByteArray,
  postfix: ByteArray,
  hashed_param: ByteArray,
  mint_value: Value,
) -> Bool {
  // Check 1: The policy must be minting tokens in this transaction
  let has_minting =
    list.any(
      flatten(mint_value),
      fn(asset) {
        let (policy, _tn, amt) = asset
        policy == cs_to_insert && amt > 0
      },
    )

  // Check 2: The computed policy ID must match the currency symbol being inserted
  let computed_cs = apply_hashed_parameter(prefix, postfix, hashed_param)
  let cs_matches = computed_cs == cs_to_insert

  has_minting? && cs_matches?
}
