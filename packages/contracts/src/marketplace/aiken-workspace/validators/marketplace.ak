use aiken/transaction.{ScriptContext}
use aiken/transaction/credential.{Address}
use marketplace/types.{MarketplaceDatum, MarketplaceRedeemer}
use marketplace/validators/marketplace.{marketplace_logic}

validator(owner: Address, fee_percentage_basis_point: Int) {
  fn marketplace(
    datum: MarketplaceDatum,
    redeemer: MarketplaceRedeemer,
    ctx: ScriptContext,
  ) {
    marketplace_logic(owner, fee_percentage_basis_point, datum, redeemer, ctx)
  }
}
