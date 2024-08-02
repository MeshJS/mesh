use aiken/transaction.{ScriptContext}
use escrow/types.{EscrowDatum, EscrowRedeemer}
use escrow/validators/escrow.{escrow_logic}

validator {
  fn escrow(datum: EscrowDatum, redeemer: EscrowRedeemer, ctx: ScriptContext) {
    escrow_logic(datum, redeemer, ctx)
  }
}
