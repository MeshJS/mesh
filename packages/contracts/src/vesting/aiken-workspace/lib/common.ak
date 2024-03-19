use aiken/bytearray
use aiken/dict.{Dict}
use aiken/interval.{Finite, IntervalBound}
use aiken/list
use aiken/transaction.{
  InlineDatum, Input, Output, OutputReference, Redeemer, ScriptPurpose, Spend,
  ValidityRange, find_input,
}
use aiken/transaction/credential.{
  Address, ScriptCredential, VerificationKeyCredential,
}
use aiken/transaction/value.{
  AssetName, MintedValue, PolicyId, Value, flatten, from_minted_value, merge,
  quantity_of, zero,
}

pub fn output_inline_datum(output: Output) {
  expect InlineDatum(raw_datum) = output.datum
  raw_datum
}

pub fn only_input_datum_with(
  inputs: List<Input>,
  policy: PolicyId,
  name: AssetName,
) {
  expect Some(input) =
    list.find(
      inputs,
      fn(input) { quantity_of(input.output.value, policy, name) == 1 },
    )
  expect InlineDatum(raw_datum) = input.output.datum
  raw_datum
}

pub fn inputs_at(inputs: List<Input>, address: Address) -> List<Input> {
  list.filter(inputs, fn(input) { input.output.address == address })
}

pub fn inputs_with(
  inputs: List<Input>,
  policy: PolicyId,
  name: AssetName,
) -> List<Input> {
  list.filter(
    inputs,
    fn(input) { quantity_of(input.output.value, policy, name) == 1 },
  )
}

pub fn inputs_at_with(
  inputs: List<Input>,
  address: Address,
  policy: PolicyId,
  name: AssetName,
) -> List<Input> {
  list.filter(
    inputs,
    fn(input) {
      input.output.address == address && quantity_of(
        input.output.value,
        policy,
        name,
      ) == 1
    },
  )
}

pub fn inputs_at_with_policy(
  inputs: List<Input>,
  address: Address,
  policy: PolicyId,
) -> List<Input> {
  list.filter(
    inputs,
    fn(input) {
      input.output.address == address && list.any(
        flatten(input.output.value),
        fn(token) { token.1st == policy },
      )
    },
  )
}

pub fn outputs_at(outputs: List<Output>, address: Address) -> List<Output> {
  list.filter(outputs, fn(output) { output.address == address })
}

pub fn outputs_with(outputs: List<Output>, policy: PolicyId, name: AssetName) {
  list.filter(
    outputs,
    fn(output) { quantity_of(output.value, policy, name) == 1 },
  )
}

pub fn outputs_at_with(
  outputs: List<Output>,
  address: Address,
  policy: PolicyId,
  name: AssetName,
) -> List<Output> {
  list.filter(
    outputs,
    fn(output) {
      output.address == address && quantity_of(output.value, policy, name) == 1
    },
  )
}

pub fn outputs_at_with_policy(
  outputs: List<Output>,
  address: Address,
  policy: PolicyId,
) -> List<Output> {
  list.filter(
    outputs,
    fn(output) {
      output.address == address && list.any(
        flatten(output.value),
        fn(token) { token.1st == policy },
      )
    },
  )
}

pub fn check_policy_only_burn(mint: MintedValue, policy: PolicyId) -> Bool {
  let burn_value = flatten(from_minted_value(mint))
  list.all(
    burn_value,
    fn(x) {
      if x.1st == policy {
        x.3rd < 0
      } else {
        True
      }
    },
  )
}

pub fn only_minted_token(
  mint: MintedValue,
  policy: PolicyId,
  name: AssetName,
  quantity: Int,
) {
  when from_minted_value(mint) |> flatten() is {
    [(mPolicy, mAssetName, mQuantity)] ->
      mPolicy == policy && mAssetName == name && mQuantity == quantity
    _ -> False
  }
}

pub fn convert_int_to_bytes(i: Int) -> ByteArray {
  convert_int_to_bytes_go(i, get_number_digit(i))
}

fn convert_int_to_bytes_go(newInt: Int, digit: Int) -> ByteArray {
  if digit == 1 {
    bytearray.push("", newInt + 48)
  } else {
    bytearray.push(
      convert_int_to_bytes_go(newInt % digit, digit / 10),
      newInt / digit + 48,
    )
  }
}

pub fn get_number_digit(i: Int) -> Int {
  go_get_number_digit(i, 1)
}

fn go_get_number_digit(newInt: Int, digit: Int) -> Int {
  if newInt < 10 {
    digit
  } else {
    go_get_number_digit(newInt / 10, digit * 10)
  }
}

pub fn key_signed(witnesses: List<ByteArray>, key: ByteArray) {
  list.has(witnesses, key)
}

pub fn all_key_signed(witnesses: List<ByteArray>, keys: List<ByteArray>) {
  list.all(keys, fn(key) { key_signed(witnesses, key) })
}

pub fn value_length(value: Value) -> Int {
  list.length(flatten(value))
}

pub fn compare_output_reference(x, y) {
  expect Spend(out_ref_x) = x
  expect Spend(out_ref_y) = y
  bytearray.compare(
    out_ref_x.transaction_id.hash,
    out_ref_y.transaction_id.hash,
  )
}

pub fn inputs_token_quantity(
  inputs: List<Input>,
  token: (PolicyId, AssetName),
) -> Int {
  list.map(
    inputs,
    fn(input) { quantity_of(input.output.value, token.1st, token.2nd) },
  )
    |> list.foldr(0, fn(n, total) { n + total })
}

pub fn redeemer_from(
  redeemers: Dict<ScriptPurpose, Redeemer>,
  inputs: List<Input>,
  output_reference: OutputReference,
  input_address: Address,
) -> Option<Data> {
  expect Some(redeemer) = dict.get(redeemers, Spend(output_reference))
  expect Some(input) = find_input(inputs, output_reference)
  if input.output.address == input_address {
    Some(redeemer)
  } else {
    None
  }
}

pub fn get_all_value_to(outputs: List<Output>, address: Address) -> Value {
  list.foldr(
    outputs,
    zero(),
    fn(output, acc_value) {
      if output.address == address {
        merge(acc_value, output.value)
      } else {
        acc_value
      }
    },
  )
}

pub fn get_all_value_from(inputs: List<Input>, address: Address) -> Value {
  list.foldr(
    inputs,
    zero(),
    fn(input, acc_value) {
      if input.output.address == address {
        merge(acc_value, input.output.value)
      } else {
        acc_value
      }
    },
  )
}

pub fn value_geq(greater: Value, smaller: Value) -> Bool {
  list.all(
    flatten(smaller),
    fn(token) { quantity_of(greater, token.1st, token.2nd) >= token.3rd },
  )
}

pub fn valid_after(
  validity_range: ValidityRange,
  required_timestamp: Int,
) -> Bool {
  let IntervalBound { bound_type, is_inclusive } = validity_range.lower_bound
  when (bound_type, is_inclusive) is {
    (Finite(lower_bound), True) -> lower_bound > required_timestamp
    (Finite(lower_bound), False) -> lower_bound >= required_timestamp
    _ -> False
  }
}

pub fn valid_before(
  validity_range: ValidityRange,
  required_timestamp: Int,
) -> Bool {
  let IntervalBound { bound_type, is_inclusive } = validity_range.upper_bound
  when (bound_type, is_inclusive) is {
    (Finite(upper_bound), True) -> upper_bound < required_timestamp
    (Finite(upper_bound), False) -> upper_bound <= required_timestamp
    _ -> False
  }
}

pub fn compare_script_address(x: Address, y: Address) -> Ordering {
  expect ScriptCredential(x_hash) = x.payment_credential
  expect ScriptCredential(y_hash) = y.payment_credential
  bytearray.compare(x_hash, y_hash)
}

pub fn compare_address(x: Address, y: Address) -> Ordering {
  let x_hash = x.payment_credential
  let y_hash = y.payment_credential
  when (x_hash, y_hash) is {
    (ScriptCredential(x_script_hash), ScriptCredential(y_script_hash)) ->
      bytearray.compare(x_script_hash, y_script_hash)
    (
      VerificationKeyCredential(x_key_hash),
      VerificationKeyCredential(y_key_hash),
    ) -> bytearray.compare(x_key_hash, y_key_hash)
    _ -> Equal
  }
}

test byte_conversion() {
  convert_int_to_bytes(1) == "1" && convert_int_to_bytes(123) == "123" && convert_int_to_bytes(
    672912,
  ) == "672912"
}
