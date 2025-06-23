use aiken/collection/list
use aiken/collection/pairs
use cardano/address.{Address}
use cardano/assets.{Value}
use cardano/transaction.{Input, Output, Redeemer, ScriptPurpose, Spend}

pub fn redeemer_with_input(
  redeemers: Pairs<ScriptPurpose, Redeemer>,
  input: Input,
) -> Option<Data> {
  let output_reference = input.output_reference
  redeemers |> pairs.get_first(Spend(output_reference))
}

pub fn check_fundraise_target(
  allow_over_subscription: Bool,
  fundraise_target: Int,
  current_fundraised_amount: Int,
) -> Bool {
  if allow_over_subscription {
    True
  } else {
    current_fundraised_amount <= fundraise_target
  }
}

pub fn output_at_with_value(
  outputs: List<Output>,
  address: Address,
  value: Value,
) -> List<Output> {
  list.filter(
    outputs,
    fn(output) {
      let are_values_equal = output.value == value
      are_values_equal && output.address == address
    },
  )
}
