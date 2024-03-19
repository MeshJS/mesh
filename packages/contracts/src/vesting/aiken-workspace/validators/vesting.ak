use aiken/transaction.{ScriptContext}
use vesting/types.{VestingDatum}
use vesting/validators/vesting.{vesting_logic}

validator {
  fn vesting(datum: VestingDatum, _redeemer: Void, ctx: ScriptContext) {
    vesting_logic(datum, ctx)
  }
}
