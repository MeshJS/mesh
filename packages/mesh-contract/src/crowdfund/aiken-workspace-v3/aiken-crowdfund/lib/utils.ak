use aiken/collection/pairs
use cardano/transaction.{Input, Redeemer, ScriptPurpose, Spend}

pub fn redeemer_with_input(
  redeemers: Pairs<ScriptPurpose, Redeemer>,
  input: Input,
) -> Option<Data> {
  let output_reference = input.output_reference
  redeemers |> pairs.get_first(Spend(output_reference))
}
