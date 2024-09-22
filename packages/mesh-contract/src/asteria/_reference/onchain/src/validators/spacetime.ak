use aiken/bytearray
use aiken/dict
use aiken/interval.{Finite}
use aiken/list
use aiken/math/rational
use aiken/option
use aiken/string
use aiken/transaction.{
  InlineDatum, Mint, ScriptContext, Spend, Transaction, find_input,
}
use aiken/transaction/credential.{
  Address, ScriptCredential, VerificationKeyCredential,
}
use aiken/transaction/value.{from_minted_value, quantity_of}
use asteria/types.{
  AssetClass, AsteriaDatum, BurnShip, GatherFuel, MineAsteria, MintShip,
  MoveShip, PelletDatum, Quit, ScriptAddress, ShipDatum, ShipRedeemer,
  ShipyardRedeemer, Speed,
}
use asteria/utils

validator(
  pellet_validator_address: ScriptAddress,
  asteria_validator_address: ScriptAddress,
  admin_token: AssetClass,
  max_speed: Speed,
  max_ship_fuel: Int,
  fuel_per_step: Int,
  initial_fuel: Int,
  min_asteria_distance: Int,
) {
  // SPACETIME VALIDATOR:
  pub fn spend(datum: ShipDatum, redeemer: ShipRedeemer, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, purpose } = ctx
    let Transaction { inputs, outputs, mint, validity_range, .. } = transaction
    let ShipDatum {
      pos_x,
      pos_y,
      ship_token_name,
      pilot_token_name,
      last_move_latest_time,
    } = datum

    expect Some(max_speed_rational) =
      rational.new(max_speed.distance, max_speed.time)
    expect Spend(ship_ref) = purpose
    expect Some(ship_input) = find_input(inputs, ship_ref)
    expect ScriptCredential(shipyard_policy) =
      ship_input.output.address.payment_credential

    // check if pilot_token is present in some input
    let must_include_pilot_token =
      option.is_some(
        list.find(
          inputs,
          fn(input) {
            list.any(
              dict.keys(value.tokens(input.output.value, shipyard_policy)),
              fn(name) { name == pilot_token_name },
            )
          },
        ),
      )
    let fuel_policy = pellet_validator_address

    when redeemer is {
      MoveShip(delta_x, delta_y) -> {
        expect [ship_output] =
          list.filter(
            outputs,
            fn(output) { output.address == ship_input.output.address },
          )
        expect InlineDatum(ship_output_datum) = ship_output.datum
        expect ship_output_datum: ShipDatum = ship_output_datum
        expect Finite(tx_earliest_time) = validity_range.lower_bound.bound_type
        expect Finite(tx_latest_time) = validity_range.upper_bound.bound_type

        let distance = utils.distance(delta_x, delta_y)
        let required_fuel = utils.required_fuel(distance, fuel_per_step)
        expect Some(speed) =
          rational.new(distance, tx_latest_time - tx_earliest_time)

        let input_fuel =
          quantity_of(ship_input.output.value, fuel_policy, "FUEL")
        let output_fuel = quantity_of(ship_output.value, fuel_policy, "FUEL")

        let must_preserve_pilot_token =
          pilot_token_name == ship_output_datum.pilot_token_name
        let must_update_x = ship_output_datum.pos_x == pos_x + delta_x
        let must_update_y = ship_output_datum.pos_y == pos_y + delta_y
        let must_burn_spent_fuel =
          quantity_of(from_minted_value(mint), fuel_policy, "FUEL") == -required_fuel
        let must_update_upper_bound =
          ship_output_datum.last_move_latest_time == tx_latest_time
        let must_respect_max_speed =
          rational.compare_with(speed, <=, max_speed_rational)
        let must_respect_latest_time = last_move_latest_time <= tx_earliest_time
        let must_have_enough_fuel = required_fuel <= input_fuel
        let must_hold_ship_token =
          quantity_of(ship_output.value, shipyard_policy, ship_token_name) == 1
        let must_subtract_fuel_tokens =
          output_fuel == input_fuel - required_fuel
        let must_hold_3_assets =
          list.length(ship_output.value |> value.flatten) == 3
        let must_spend_one_script_input =
          list.length(
            list.filter(
              inputs,
              fn(input) { utils.is_script_address(input.output.address) },
            ),
          ) == 1

        and {
          must_spend_one_script_input?,
          must_include_pilot_token?,
          must_have_enough_fuel?,
          must_respect_max_speed?,
          must_respect_latest_time?,
          must_subtract_fuel_tokens?,
          must_burn_spent_fuel?,
          must_update_x?,
          must_update_y?,
          must_update_upper_bound?,
          must_preserve_pilot_token?,
          must_hold_ship_token?,
          must_hold_3_assets?,
        }
      }

      GatherFuel(amount) -> {
        expect [ship_output] =
          list.filter(
            outputs,
            fn(output) { output.address == ship_input.output.address },
          )
        expect InlineDatum(ship_output_datum) = ship_output.datum
        expect ship_output_datum: ShipDatum = ship_output_datum
        expect Some(pellet_input) =
          list.find(
            inputs,
            fn(input) {
              when input.output.address.payment_credential is {
                VerificationKeyCredential(_) -> False
                ScriptCredential(addr_payment) ->
                  addr_payment == pellet_validator_address
              }
            },
          )
        let must_be_valid_pellet =
          value.quantity_of(
            pellet_input.output.value,
            admin_token.policy,
            admin_token.name,
          ) > 0

        expect InlineDatum(pellet_datum) = pellet_input.output.datum
        expect pellet_datum: PelletDatum = pellet_datum
        expect Finite(tx_earliest_time) = validity_range.lower_bound.bound_type

        let input_fuel =
          quantity_of(ship_input.output.value, fuel_policy, "FUEL")
        let output_fuel = quantity_of(ship_output.value, fuel_policy, "FUEL")

        let must_have_pellet_position =
          pos_x == pellet_datum.pos_x && pos_y == pellet_datum.pos_y
        let must_not_exceed_capacity = input_fuel + amount <= max_ship_fuel
        let must_preserve_datum = ship_output_datum == datum
        let must_respect_latest_time = last_move_latest_time <= tx_earliest_time

        let must_hold_ship_token =
          quantity_of(ship_output.value, shipyard_policy, ship_token_name) == 1
        let must_add_fuel_tokens = output_fuel == input_fuel + amount
        let must_hold_3_assets =
          list.length(ship_output.value |> value.flatten) == 3
        let must_spend_two_script_inputs =
          list.length(
            list.filter(
              inputs,
              fn(input) { utils.is_script_address(input.output.address) },
            ),
          ) == 2
        let must_not_mint_tokens = from_minted_value(mint) == value.zero()

        and {
          must_spend_two_script_inputs?,
          must_be_valid_pellet?,
          must_include_pilot_token?,
          must_have_pellet_position?,
          must_add_fuel_tokens?,
          must_not_exceed_capacity?,
          must_respect_latest_time?,
          must_preserve_datum?,
          must_hold_ship_token?,
          must_hold_3_assets?,
          must_not_mint_tokens?,
        }
      }
      MineAsteria -> {
        // check that the Asteria UTxO is present as an input
        expect Some(asteria_input) =
          list.find(
            inputs,
            fn(input) {
              when input.output.address.payment_credential is {
                VerificationKeyCredential(_) -> False
                ScriptCredential(addr_payment) ->
                  addr_payment == asteria_validator_address
              }
            },
          )
        let must_be_valid_asteria =
          value.quantity_of(
            asteria_input.output.value,
            admin_token.policy,
            admin_token.name,
          ) > 0

        expect Finite(tx_earliest_time) = validity_range.lower_bound.bound_type

        let must_have_asteria_position = (pos_x, pos_y) == (0, 0)
        let must_burn_ship_token =
          quantity_of(from_minted_value(mint), shipyard_policy, ship_token_name) < 0
        let must_respect_latest_time = last_move_latest_time <= tx_earliest_time
        let must_spend_two_script_inputs =
          list.length(
            list.filter(
              inputs,
              fn(input) { utils.is_script_address(input.output.address) },
            ),
          ) == 2
        let must_burn_fuel_tokens =
          quantity_of(from_minted_value(mint), fuel_policy, "FUEL") == -quantity_of(
            ship_input.output.value,
            fuel_policy,
            "FUEL",
          )

        and {
          must_spend_two_script_inputs?,
          must_be_valid_asteria?,
          must_include_pilot_token?,
          must_have_asteria_position?,
          must_burn_ship_token?,
          must_burn_fuel_tokens?,
          must_respect_latest_time?,
        }
      }
      Quit -> {
        let must_burn_ship_token =
          quantity_of(from_minted_value(mint), shipyard_policy, ship_token_name) < 0
        let must_burn_fuel_tokens =
          quantity_of(from_minted_value(mint), fuel_policy, "FUEL") == -quantity_of(
            ship_input.output.value,
            fuel_policy,
            "FUEL",
          )
        let must_spend_one_script_input =
          list.length(
            list.filter(
              inputs,
              fn(input) { utils.is_script_address(input.output.address) },
            ),
          ) == 1
        and {
          must_spend_one_script_input?,
          must_include_pilot_token?,
          must_burn_ship_token?,
          must_burn_fuel_tokens?,
        }
      }
    }
  }

  // SHIPYARD POLICY:
  pub fn mint(redeemer: ShipyardRedeemer, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, purpose } = ctx
    let Transaction { inputs, outputs, mint, validity_range, .. } = transaction
    expect Mint(shipyard_policy) = purpose
    let minted_value =
      mint
        |> value.from_minted_value
    let fuel_policy = pellet_validator_address

    when redeemer is {
      MintShip -> {
        expect Some(asteria_input) =
          list.find(
            inputs,
            fn(input) {
              when input.output.address.payment_credential is {
                VerificationKeyCredential(_) -> False
                ScriptCredential(addr_payment) ->
                  addr_payment == asteria_validator_address
              }
            },
          )
        let must_be_valid_asteria =
          value.quantity_of(
            asteria_input.output.value,
            admin_token.policy,
            admin_token.name,
          ) > 0
        expect InlineDatum(asteria_datum) = asteria_input.output.datum
        expect asteria_datum: AsteriaDatum = asteria_datum

        expect [ship_state] =
          transaction.find_script_outputs(outputs, shipyard_policy)
        expect InlineDatum(ship_datum) = ship_state.datum
        expect ship_datum: ShipDatum = ship_datum
        expect Finite(tx_latest_time) = validity_range.upper_bound.bound_type

        let ship_token_name =
          bytearray.concat(
            "SHIP",
            bytearray.from_string(string.from_int(asteria_datum.ship_counter)),
          )
        let pilot_token_name =
          bytearray.concat(
            "PILOT",
            bytearray.from_string(string.from_int(asteria_datum.ship_counter)),
          )
        let expected_minted_value =
          value.from_asset(shipyard_policy, ship_token_name, 1)
            |> value.add(shipyard_policy, pilot_token_name, 1)
            |> value.add(fuel_policy, "FUEL", initial_fuel)

        let must_mint_expected_value = minted_value == expected_minted_value
        let must_respect_min_distance =
          utils.distance(ship_datum.pos_x, ship_datum.pos_y) >= min_asteria_distance
        let must_have_ship_name = ship_datum.ship_token_name == ship_token_name
        let must_have_pilot_name =
          ship_datum.pilot_token_name == pilot_token_name
        let must_have_latest_time =
          ship_datum.last_move_latest_time == tx_latest_time
        let must_hold_ship_token =
          quantity_of(ship_state.value, shipyard_policy, ship_token_name) == 1
        let must_hold_initial_fuel =
          quantity_of(ship_state.value, fuel_policy, "FUEL") == initial_fuel
        let must_hold_3_assets =
          list.length(ship_state.value |> value.flatten) == 3

        and {
          must_be_valid_asteria?,
          must_mint_expected_value?,
          must_respect_min_distance?,
          must_have_ship_name?,
          must_have_pilot_name?,
          must_have_latest_time?,
          must_hold_ship_token?,
          must_hold_initial_fuel?,
          must_hold_3_assets?,
        }
      }

      BurnShip -> {
        let minted_tokens =
          minted_value
            |> value.tokens(shipyard_policy)
            |> dict.to_list()
        // check that only one token with this policy is burnt
        expect [(_, -1)] = minted_tokens
        True
      }
    }
  }
}
