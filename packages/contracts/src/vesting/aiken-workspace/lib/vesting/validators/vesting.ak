use aiken/transaction.{ScriptContext, Spend, Transaction}
use utils/extra_signatories.{key_signed}
use utils/validity_range.{valid_after}
use vesting/types.{VestingDatum}

pub fn vesting_logic(datum: VestingDatum, ctx: ScriptContext) {
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
