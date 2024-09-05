use aiken/transaction.{ScriptContext, Spend}
use vesting/types.{VestingDatum}
use vodka_extra_signatories.{key_signed}
use vodka_validity_range.{valid_after}

validator {
  pub fn vesting(datum: VestingDatum, _redeemer: Data, ctx: ScriptContext) {
    // In principle, scripts can be used for different purpose (e.g. minting
    // assets). Here we make sure it's only used when 'spending' from a eUTxO
    when ctx.purpose is {
      Spend(_) -> or {
          key_signed(ctx.transaction.extra_signatories, datum.owner),
          and {
            key_signed(ctx.transaction.extra_signatories, datum.beneficiary),
            valid_after(ctx.transaction.validity_range, datum.lock_until),
          },
        }
      _ -> False
    }
  }
}
