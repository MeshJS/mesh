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
use aiken/transaction/value.{add, from_asset, from_lovelace}
use asteria/test_mock as mock
use asteria/test_utils
use asteria/types.{AssetClass, GatherFuel, PelletDatum, ShipDatum, Speed}
use spacetime

// ==============================================================================================
// GatherFuel Tests
// ==============================================================================================

type GatherTestOptions {
  provided_amount: Int,
  ship_initial_fuel: Int,
  ship_pos_x: Int,
  ship_pos_y: Int,
  output_ship_token_amount: Int,
  extra_token_amount: Int,
  adds_fuel_tokens: Bool,
  preserves_pos_x: Bool,
  includes_pilot_token: Bool,
  includes_ship_output: Bool,
  respects_latest_time: Bool,
  excludes_extra_script_input: Bool,
  mints_no_tokens: Bool,
}

fn default_gather_options() {
  GatherTestOptions {
    provided_amount: 10,
    ship_initial_fuel: 40,
    ship_pos_x: 10,
    ship_pos_y: 10,
    output_ship_token_amount: 1,
    extra_token_amount: 0,
    adds_fuel_tokens: True,
    preserves_pos_x: True,
    includes_pilot_token: True,
    includes_ship_output: True,
    respects_latest_time: True,
    excludes_extra_script_input: True,
    mints_no_tokens: True,
  }
}

fn gather(options: GatherTestOptions) -> Bool {
  let min_ada = from_lovelace(2_000_000)
  let pellet_fuel = 20
  let pellet_pos_x = 10
  let pellet_pos_y = 10
  let fuel_per_step = 1
  let max_ship_fuel = 100
  let initial_pellet_fuel = 40
  let min_asteria_distance = 10
  let max_speed = Speed { distance: 1, time: 1_000 }
  let earliest_time =
    if options.respects_latest_time {
      10_000
    } else {
      0
    }
  let latest_time = earliest_time + 20_000
  let last_move_latest_time = 5_000
  let admin_token =
    AssetClass { policy: mock.admin_policy, name: mock.admin_token_name }
  let redeemer = GatherFuel(options.provided_amount)
  let pilot_address =
    Address {
      payment_credential: VerificationKeyCredential(mock.pilot_credential),
      stake_credential: None,
    }
  let pellet_address =
    Address {
      payment_credential: ScriptCredential(mock.pellet_credential),
      stake_credential: None,
    }
  let pellet_datum =
    PelletDatum {
      pos_x: pellet_pos_x,
      pos_y: pellet_pos_y,
      shipyard_policy: mock.shipyard_policy,
    }
  let pellet_input = {
    let output =
      Output {
        address: pellet_address,
        value: value.from_lovelace(2_000_000)
          |> value.add(mock.admin_policy, mock.admin_token_name, 1)
          |> value.add(mock.pellet_credential, "FUEL", pellet_fuel),
        datum: InlineDatum(pellet_datum),
        reference_script: None,
      }
    let output_reference =
      OutputReference {
        transaction_id: TransactionId { hash: mock.transaction_id_2 },
        output_index: 0,
      }
    Input { output_reference, output }
  }
  let ship_address =
    Address {
      payment_credential: ScriptCredential(mock.ship_credential),
      stake_credential: None,
    }
  let ship_input_value =
    min_ada
      |> add(mock.shipyard_policy, mock.ship_token_name, 1)
      |> add(mock.pellet_credential, "FUEL", options.ship_initial_fuel)
  let ship_output_value =
    min_ada
      |> add(
          mock.shipyard_policy,
          mock.ship_token_name,
          options.output_ship_token_amount,
        )
      |> add(
          mock.pellet_credential,
          "FUEL",
          options.ship_initial_fuel + options.provided_amount,
        )
      |> add("aaaa", "tokenA", options.extra_token_amount)
  let ship_input_datum =
    ShipDatum {
      pos_x: options.ship_pos_x,
      pos_y: options.ship_pos_y,
      ship_token_name: mock.ship_token_name,
      pilot_token_name: mock.pilot_token_name,
      last_move_latest_time,
    }
  let ship_output_datum =
    ShipDatum {
      pos_x: if options.preserves_pos_x {
        options.ship_pos_x
      } else {
        options.ship_pos_x + 1
      },
      pos_y: options.ship_pos_y,
      ship_token_name: mock.ship_token_name,
      pilot_token_name: mock.pilot_token_name,
      last_move_latest_time,
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
  let ship_input = {
    let output =
      Output {
        address: ship_address,
        value: ship_input_value,
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
  let ship_output =
    Output {
      address: ship_address,
      value: if options.adds_fuel_tokens {
        ship_output_value
      } else {
        ship_output_value
          |> add(mock.pellet_credential, "FUEL", -options.provided_amount)
      },
      datum: InlineDatum(ship_output_datum),
      reference_script: None,
    }
  let tx =
    Transaction {
      inputs: if options.excludes_extra_script_input {
        [ship_input, pilot_input, pellet_input]
      } else {
        [ship_input, pilot_input, pellet_input, extra_script_input]
      },
      reference_inputs: [],
      outputs: if options.includes_ship_output {
        [ship_output]
      } else {
        []
      },
      fee: value.from_lovelace(5_000),
      mint: if options.mints_no_tokens {
        value.to_minted_value(value.zero())
      } else {
        value.to_minted_value(from_asset(mock.fuel_policy, "FUEL", 20))
      },
      certificates: [],
      withdrawals: dict.new(),
      validity_range: Interval {
        lower_bound: IntervalBound {
          bound_type: Finite(earliest_time),
          is_inclusive: True,
        },
        upper_bound: IntervalBound {
          bound_type: Finite(latest_time),
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
      initial_pellet_fuel,
      min_asteria_distance,
      ship_input_datum,
      redeemer,
      spend_ctx,
    )
  result
}

test gather_ok() {
  gather(default_gather_options())
}

test more_than_2_script_inputs() fail {
  gather(
    GatherTestOptions {
      ..default_gather_options(),
      excludes_extra_script_input: False,
    },
  )
}

test no_ship_output() fail {
  gather(
    GatherTestOptions {
      ..default_gather_options(),
      includes_ship_output: False,
    },
  )
}

test no_pilot_token() fail {
  gather(
    GatherTestOptions {
      ..default_gather_options(),
      includes_pilot_token: False,
    },
  )
}

test different_pos_x() fail {
  gather(GatherTestOptions { ..default_gather_options(), ship_pos_x: 9 })
}

test different_pos_y() fail {
  gather(GatherTestOptions { ..default_gather_options(), ship_pos_y: 9 })
}

test add_extra_token() fail {
  gather(
    GatherTestOptions { ..default_gather_options(), extra_token_amount: 1 },
  )
}

test fuel_not_added() fail {
  gather(
    GatherTestOptions { ..default_gather_options(), adds_fuel_tokens: False },
  )
}

test exceed_fuel_capacity() fail {
  gather(GatherTestOptions { ..default_gather_options(), provided_amount: 61 })
}

test no_respect_latest_time() fail {
  gather(
    GatherTestOptions {
      ..default_gather_options(),
      respects_latest_time: False,
    },
  )
}

test alter_pos_x() fail {
  gather(
    GatherTestOptions { ..default_gather_options(), preserves_pos_x: False },
  )
}

test no_ship_token_output() fail {
  gather(
    GatherTestOptions {
      ..default_gather_options(),
      output_ship_token_amount: 0,
    },
  )
}

test mint_tokens() fail {
  gather(
    GatherTestOptions { ..default_gather_options(), mints_no_tokens: False },
  )
}
