use aiken/collection/list
use aiken/collection/pairs
use cardano/address.{Address}
use cardano/assets.{Lovelace, from_lovelace}
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

pub fn outputs_at_with_lovelace(
  outputs: List<Output>,
  address: Address,
  lovelace: Lovelace,
) -> List<Output> {
  list.filter(
    outputs,
    fn(output) {
      let is_lovelace_match = output.value == from_lovelace(lovelace)
      is_lovelace_match && output.address == address
    },
  )
}
