use aiken/collection/list
use aiken/primitive/bytearray
use cardano/assets.{Value, flatten, quantity_of}
use cardano/transaction.{Input, Output, Spend}

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
  bytearray.compare(out_ref_x.transaction_id, out_ref_y.transaction_id)
}

pub fn inputs_token_quantity(inputs: List<Input>, token: List<ByteArray>) -> Int {
  expect [policy, tokenName] = token
  list.map(
    inputs,
    fn(input) { quantity_of(input.output.value, policy, tokenName) },
  )
    |> list.foldr(0, fn(n, total) { n + total })
}

test byte_conversion() {
  convert_int_to_bytes(1) == "1" && convert_int_to_bytes(123) == "123" && convert_int_to_bytes(
    672912,
  ) == "672912"
}
