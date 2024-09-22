use aiken/dict
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/transaction.{
  InlineDatum, Input, Mint, Output, OutputReference, ScriptContext, Transaction,
  TransactionId,
}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value.{Value, add, from_lovelace}
use asteria/test_mock as mock
use asteria/test_utils
use asteria/types.{AssetClass, BurnShip, ShipDatum, Speed}
use spacetime

// ==============================================================================================
// Burn Tests
// ==============================================================================================

type BurnTestOptions {
  pos_x: Int,
  pos_y: Int,
  ship_addr: Address,
  include_ship_input: Bool,
  burnt_value: Value,
}

fn get_default_burn_options() -> BurnTestOptions {
  let ship_addr =
    Address {
      payment_credential: ScriptCredential(mock.ship_credential),
      stake_credential: None,
    }
  let burnt_value =
    value.from_asset(mock.shipyard_policy, mock.ship_token_name, -1)
  BurnTestOptions {
    pos_x: 5,
    pos_y: -12,
    ship_addr,
    include_ship_input: True,
    burnt_value,
  }
}

fn burn_ship(options: BurnTestOptions) -> Bool {
  let fuel_per_step = 1
  let max_ship_fuel = 100
  let initial_fuel = 40
  let min_distance = 10
  let ship_token_name = mock.ship_token_name
  let pilot_token_name = mock.pilot_token_name
  let shipyard_policy = mock.shipyard_policy
  let transaction_id = mock.transaction_id_1
  let max_speed = Speed { distance: 1, time: 1_000 }
  let admin_token =
    AssetClass { policy: mock.admin_policy, name: mock.admin_token_name }
  let redeemer = BurnShip
  let ship_datum =
    ShipDatum {
      pos_x: options.pos_x,
      pos_y: options.pos_y,
      ship_token_name,
      pilot_token_name,
      last_move_latest_time: 0,
    }
  let ship_in = {
    let output = {
      let value =
        from_lovelace(2_000_000)
          |> add(shipyard_policy, ship_token_name, 1)
      Output {
        address: options.ship_addr,
        value,
        datum: InlineDatum(ship_datum),
        reference_script: None,
      }
    }
    Input {
      output_reference: OutputReference {
        transaction_id: TransactionId { hash: transaction_id },
        output_index: 0,
      },
      output,
    }
  }
  let tx =
    Transaction {
      inputs: if options.include_ship_input {
        [ship_in]
      } else {
        []
      },
      reference_inputs: [],
      outputs: [],
      fee: value.from_lovelace(5_000),
      mint: value.to_minted_value(options.burnt_value),
      certificates: [],
      withdrawals: dict.new(),
      validity_range: Interval {
        lower_bound: IntervalBound { bound_type: Finite(1), is_inclusive: True },
        upper_bound: IntervalBound {
          bound_type: Finite(10),
          is_inclusive: True,
        },
      },
      extra_signatories: [],
      redeemers: dict.new()
        |> dict.insert(
            key: Mint(shipyard_policy),
            value: {
              let redeemer_data: Data = redeemer
              redeemer_data
            },
            compare: test_utils.script_purpose_compare,
          ),
      datums: dict.new(),
      id: TransactionId { hash: transaction_id },
    }
  let mint_ctx =
    ScriptContext { transaction: tx, purpose: Mint(shipyard_policy) }
  let result =
    spacetime.mint(
      mock.pellet_credential,
      mock.asteria_credential,
      admin_token,
      max_speed,
      max_ship_fuel,
      fuel_per_step,
      initial_fuel,
      min_distance,
      redeemer,
      ctx: mint_ctx,
    )
  result
}

test burn_ok() {
  burn_ship(get_default_burn_options())
}

test burn_more_than_one() fail {
  let def_options = get_default_burn_options()
  let burnt_value =
    value.from_asset(mock.shipyard_policy, mock.ship_token_name, -1)
      |> value.add(mock.shipyard_policy, mock.pilot_token_name, -1)
  let options = BurnTestOptions { ..def_options, burnt_value: burnt_value }
  burn_ship(options)
}
