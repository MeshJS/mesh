use aiken/bytearray
use aiken/dict
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, ScriptContext, Spend,
  Transaction, TransactionId,
}
use aiken/transaction/credential.{
  Address, ScriptCredential, VerificationKeyCredential,
}
use aiken/transaction/value.{add, from_lovelace}
use asteria/test_mock as mock
use asteria/test_utils
use asteria/types.{AssetClass, Quit, ShipDatum, Speed}
use spacetime

// ==============================================================================================
// Quit Tests
// ==============================================================================================

type QuitTestOptions {
  burns_ship_token: Bool,
  burns_fuel_tokens: Bool,
  includes_pilot_token: Bool,
  excludes_extra_script_input: Bool,
}

fn default_quit_options() {
  QuitTestOptions {
    burns_ship_token: True,
    burns_fuel_tokens: True,
    includes_pilot_token: True,
    excludes_extra_script_input: True,
  }
}

fn quit(options: QuitTestOptions) -> Bool {
  let min_ada = from_lovelace(2_000_000)
  let fuel_per_step = 1
  let max_ship_fuel = 100
  let initial_fuel = 40
  let ship_fuel = 30
  let min_distance = 10
  let max_speed = Speed { distance: 1, time: 1_000 }
  let admin_token =
    AssetClass { policy: mock.admin_policy, name: mock.admin_token_name }
  let redeemer = Quit
  let pilot_address =
    Address {
      payment_credential: VerificationKeyCredential(mock.pilot_credential),
      stake_credential: None,
    }
  let ship_address =
    Address {
      payment_credential: ScriptCredential(mock.ship_credential),
      stake_credential: None,
    }
  let ship_value =
    min_ada
      |> add(mock.shipyard_policy, mock.ship_token_name, 1)
      |> add(mock.pellet_credential, "FUEL", ship_fuel)
  let ship_input_datum =
    ShipDatum {
      pos_x: 10,
      pos_y: 10,
      ship_token_name: mock.ship_token_name,
      pilot_token_name: mock.pilot_token_name,
      last_move_latest_time: 0,
    }

  let ship_input = {
    let output =
      Output {
        address: ship_address,
        value: ship_value,
        datum: InlineDatum(ship_input_datum),
        reference_script: None,
      }
    let output_reference =
      OutputReference {
        transaction_id: TransactionId { hash: mock.transaction_id_1 },
        output_index: 0,
      }
    Input { output_reference, output }
  }
  let pilot_input = {
    let output = {
      let value =
        if options.includes_pilot_token {
          min_ada
            |> add(mock.shipyard_policy, mock.pilot_token_name, 1)
        } else {
          min_ada
        }
      Output {
        address: pilot_address,
        value,
        datum: NoDatum,
        reference_script: None,
      }
    }
    let output_reference =
      OutputReference {
        transaction_id: TransactionId { hash: mock.transaction_id_1 },
        output_index: 1,
      }
    Input { output_reference, output }
  }
  let extra_script_input = {
    let output =
      Output {
        address: Address {
          payment_credential: ScriptCredential("7777"),
          stake_credential: None,
        },
        value: value.zero(),
        datum: NoDatum,
        reference_script: None,
      }
    let output_reference =
      OutputReference {
        transaction_id: TransactionId { hash: mock.transaction_id_1 },
        output_index: 0,
      }
    Input { output_reference, output }
  }
  let tx =
    Transaction {
      inputs: if options.excludes_extra_script_input {
        [ship_input, pilot_input]
      } else {
        [ship_input, pilot_input, extra_script_input]
      },
      reference_inputs: [],
      outputs: [],
      fee: value.from_lovelace(5_000),
      mint: value.to_minted_value(
        if options.burns_ship_token {
          if options.burns_fuel_tokens {
            value.from_asset(mock.shipyard_policy, mock.ship_token_name, -1)
              |> add(mock.pellet_credential, "FUEL", -ship_fuel)
          } else {
            value.from_asset(mock.shipyard_policy, mock.ship_token_name, -1)
          }
        } else {
          value.zero()
        },
      ),
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
            key: Spend(
              OutputReference {
                transaction_id: TransactionId { hash: mock.transaction_id_1 },
                output_index: 0,
              },
            ),
            value: {
              let redeemer_data: Data = redeemer
              redeemer_data
            },
            compare: test_utils.script_purpose_compare,
          ),
      datums: dict.new()
        |> dict.insert(
            mock.transaction_id_1,
            {
              let datum_data: Data = InlineDatum(ship_input_datum)
              datum_data
            },
            compare: bytearray.compare,
          ),
      id: TransactionId { hash: mock.transaction_id_3 },
    }
  let spend_ctx =
    ScriptContext {
      transaction: tx,
      purpose: Spend(
        OutputReference {
          transaction_id: TransactionId { hash: mock.transaction_id_1 },
          output_index: 0,
        },
      ),
    }
  let result =
    spacetime.spend(
      mock.pellet_credential,
      mock.asteria_credential,
      admin_token,
      max_speed,
      max_ship_fuel,
      fuel_per_step,
      initial_fuel,
      min_distance,
      ship_input_datum,
      redeemer,
      spend_ctx,
    )
  result
}

test quit_ok() {
  quit(default_quit_options())
}

test more_than_1_script_input() fail {
  quit(
    QuitTestOptions {
      ..default_quit_options(),
      excludes_extra_script_input: False,
    },
  )
}

test no_pilot_token() fail {
  quit(
    QuitTestOptions { ..default_quit_options(), includes_pilot_token: False },
  )
}

test ship_token_not_burnt() fail {
  quit(QuitTestOptions { ..default_quit_options(), burns_ship_token: False })
}

test fuel_tokens_not_burnt() fail {
  quit(QuitTestOptions { ..default_quit_options(), burns_fuel_tokens: False })
}
