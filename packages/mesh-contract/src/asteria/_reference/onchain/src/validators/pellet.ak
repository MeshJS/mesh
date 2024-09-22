use aiken/dict
use aiken/list.{filter}
use aiken/option
use aiken/transaction.{
  InlineDatum, Mint, Output, ScriptContext, Spend, Transaction, find_input,
}
use aiken/transaction/credential.{ScriptCredential}
use aiken/transaction/value.{quantity_of}
use asteria/types.{
  AssetClass, BurnFuel, ConsumePellet, FuelRedeemer, MintFuel, PelletDatum,
  PelletRedeemer, Provide,
}
use asteria/utils

validator(admin_token: AssetClass) {
  pub fn spend(
    datum: PelletDatum,
    redeemer: PelletRedeemer,
    ctx: ScriptContext,
  ) -> Bool {
    let ScriptContext { transaction, purpose } = ctx
    let Transaction { inputs, outputs, .. } = transaction

    expect Spend(pellet_ref) = purpose
    expect Some(pellet_input) = find_input(inputs, pellet_ref)
    expect ScriptCredential(fuel_policy) =
      pellet_input.output.address.payment_credential

    let remaining_fuel =
      quantity_of(pellet_input.output.value, fuel_policy, "FUEL")

    when redeemer is {
      Provide(provided_amount) -> {
        let PelletDatum { shipyard_policy, .. } = datum

        expect [pellet_output] =
          filter(
            outputs,
            fn(output) { output.address == pellet_input.output.address },
          )
        expect InlineDatum(out_datum) = pellet_output.datum
        expect out_datum: PelletDatum = out_datum

        // check if ship_token is present in some input
        let must_input_ship_token =
          option.is_some(
            list.find(
              inputs,
              fn(input) {
                list.any(
                  dict.keys(value.tokens(input.output.value, shipyard_policy)),
                  fn(name) { utils.has_prefix("SHIP", name) },
                )
              },
            ),
          )

        let must_have_enough_fuel = provided_amount <= remaining_fuel
        let must_hold_admin_token =
          quantity_of(pellet_output.value, admin_token.policy, admin_token.name) == 1
        let must_provide_fuel_amount =
          quantity_of(pellet_output.value, fuel_policy, "FUEL") == remaining_fuel - provided_amount
        let must_preserve_datum = out_datum == datum

        and {
          must_input_ship_token?,
          must_hold_admin_token?,
          must_have_enough_fuel?,
          must_provide_fuel_amount?,
          must_preserve_datum?,
        }
      }

      ConsumePellet -> {
        // check that there is a wallet input with the admin token
        let admin_token_input =
          list.find(
            inputs,
            fn(input) {
              not(utils.is_script_address(input.output.address)) && value.quantity_of(
                input.output.value,
                admin_token.policy,
                admin_token.name,
              ) > 0
            },
          )

        option.is_some(admin_token_input)?
      }
    }
  }

  pub fn mint(redeemer: FuelRedeemer, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, purpose } = ctx
    let Transaction { inputs, mint, .. } = transaction
    expect Mint(fuel_policy) = purpose
    let minted_value =
      mint
        |> value.from_minted_value

    when redeemer is {
      MintFuel -> {
        // check that there is an input with the admin token
        let admin_token_input =
          list.find(
            inputs,
            fn(input) {
              value.quantity_of(
                input.output.value,
                admin_token.policy,
                admin_token.name,
              ) > 0
            },
          )

        let must_mint_fuel_tokens =
          quantity_of(minted_value, fuel_policy, "FUEL") > 0

        option.is_some(admin_token_input)? && must_mint_fuel_tokens?
      }
      BurnFuel -> {
        let must_burn_fuel_tokens =
          quantity_of(minted_value, fuel_policy, "FUEL") < 0

        must_burn_fuel_tokens?
      }
    }
  }
}
