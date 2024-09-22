use aiken/list
use aiken/option.{is_some}
use aiken/transaction.{ScriptContext, Transaction}
use aiken/transaction/value
use asteria/types.{AssetClass}
use asteria/utils

validator(admin_token: AssetClass) {
  fn spend(_datum: Data, _redeemer: Data, ctx: ScriptContext) -> Bool {
    let is_admin_token_input =
      is_some(
        list.find(
          ctx.transaction.inputs,
          fn(input) {
            not(utils.is_script_address(input.output.address)) && value.quantity_of(
              input.output.value,
              admin_token.policy,
              admin_token.name,
            ) > 0
          },
        ),
      )
    is_admin_token_input
  }
}
