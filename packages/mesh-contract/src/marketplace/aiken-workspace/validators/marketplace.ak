use aiken/transaction.{ScriptContext, Spend, find_input}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{from_lovelace, lovelace_of}
use marketplace/types.{Buy, Close, MarketplaceDatum, MarketplaceRedeemer}
use vodka_address.{address_pub_key}
use vodka_extra_signatories.{key_signed}
use vodka_inputs.{inputs_at}
use vodka_value.{get_all_value_to, value_geq}

validator(owner: Address, fee_percentage_basis_point: Int) {
  pub fn marketplace(
    datum: MarketplaceDatum,
    redeemer: MarketplaceRedeemer,
    ctx: ScriptContext,
  ) -> Bool {
    when ctx.purpose is {
      Spend(utxo) ->
        when redeemer is {
          Buy -> {
            expect Some(own_input) = find_input(ctx.transaction.inputs, utxo)
            let own_address = own_input.output.address
            let is_only_one_input_from_script =
              when inputs_at(ctx.transaction.inputs, own_address) is {
                [_] -> True
                _ -> False
              }

            let is_proceed_paid =
              get_all_value_to(ctx.transaction.outputs, datum.seller)
                |> value_geq(
                    from_lovelace(
                      datum.price + lovelace_of(own_input.output.value),
                    ),
                  )
            let is_fee_paid =
              get_all_value_to(ctx.transaction.outputs, owner)
                |> value_geq(
                    from_lovelace(
                      datum.price * fee_percentage_basis_point / 10000,
                    ),
                  )
            is_only_one_input_from_script && is_fee_paid && is_proceed_paid
          }
          Close -> {
            expect Some(pub_key) = address_pub_key(datum.seller)
            key_signed(ctx.transaction.extra_signatories, pub_key)
          }
        }
      _ -> False
    }
  }
}
