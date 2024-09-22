use aiken/bytearray
use aiken/dict
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, ScriptContext, Spend,
  Transaction, TransactionId,
}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value.{PolicyId, Value, add, from_lovelace, zero}
use asteria/test_mock as mock
use asteria/test_utils
use asteria/types.{AssetClass, PelletDatum, Provide}
use pellet

// ==============================================================================================
// Provide Tests
// ==============================================================================================

type ProvideTestOptions {
  initial_fuel: Int,
  provided_amount: Int,
  pellet_input_value: Value,
  pellet_output_value: Value,
  admin_policy: PolicyId,
  admin_token_name: ByteArray,
  shipyard_policy: PolicyId,
  ship_token_name: ByteArray,
  ship_token_amount: Int,
  datum_in: PelletDatum,
  datum_out: PelletDatum,
}

fn default_provide_test_options() -> ProvideTestOptions {
  let initial_fuel = 40
  let provided_amount = 15
  let pellet_input_value =
    from_lovelace(2_000_000)
      |> add(mock.admin_policy, mock.admin_token_name, 1)
      |> add(mock.pellet_credential, "FUEL", initial_fuel)
  let pellet_output_value =
    from_lovelace(2_000_000)
      |> add(mock.admin_policy, mock.admin_token_name, 1)
      |> add(mock.pellet_credential, "FUEL", initial_fuel - provided_amount)
  let pellet_datum =
    PelletDatum { pos_x: 1, pos_y: 2, shipyard_policy: mock.shipyard_policy }
  ProvideTestOptions {
    initial_fuel,
    provided_amount,
    pellet_input_value,
    pellet_output_value,
    admin_policy: mock.admin_policy,
    admin_token_name: mock.admin_token_name,
    shipyard_policy: mock.shipyard_policy,
    ship_token_name: mock.ship_token_name,
    ship_token_amount: 1,
    datum_in: pellet_datum,
    datum_out: pellet_datum,
  }
}

fn provide(options: ProvideTestOptions) -> Bool {
  let admin_asset =
    AssetClass { policy: options.admin_policy, name: options.admin_token_name }
  let transaction_id_1 = mock.transaction_id_1
  let transaction_id_2 = mock.transaction_id_2
  let redeemer = Provide(options.provided_amount)
  let datum_in = options.datum_in
  let pellet_in = {
    let output = {
      let address =
        Address {
          payment_credential: ScriptCredential(mock.pellet_credential),
          stake_credential: None,
        }
      let value = options.pellet_input_value
      Output {
        address,
        value,
        datum: InlineDatum(datum_in),
        reference_script: None,
      }
    }
    Input {
      output_reference: OutputReference {
        transaction_id: TransactionId { hash: transaction_id_1 },
        output_index: 0,
      },
      output,
    }
  }
  let ship_in = {
    let output = {
      let address =
        Address {
          payment_credential: ScriptCredential(mock.ship_credential),
          stake_credential: None,
        }
      let value =
        from_lovelace(2_000_000)
          |> add(
              options.shipyard_policy,
              options.ship_token_name,
              options.ship_token_amount,
            )
      Output { address, value, datum: NoDatum, reference_script: None }
    }
    let output_reference =
      OutputReference {
        transaction_id: TransactionId { hash: transaction_id_2 },
        output_index: 0,
      }
    Input { output_reference, output }
  }
  let pellet_out = {
    let address =
      Address {
        payment_credential: ScriptCredential(mock.pellet_credential),
        stake_credential: None,
      }
    let value = options.pellet_output_value
    Output {
      address,
      value,
      datum: InlineDatum(options.datum_out),
      reference_script: None,
    }
  }
  let ship_out = {
    let address =
      Address {
        payment_credential: ScriptCredential(mock.ship_credential),
        stake_credential: None,
      }
    let value =
      from_lovelace(2_000_000)
        |> add(options.shipyard_policy, options.ship_token_name, 1)
    Output { address, value, datum: NoDatum, reference_script: None }
  }
  let tx =
    Transaction {
      inputs: [ship_in, pellet_in],
      reference_inputs: [],
      outputs: [ship_out, pellet_out],
      fee: value.from_lovelace(5_000),
      mint: value.to_minted_value(zero()),
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
                transaction_id: TransactionId { hash: transaction_id_1 },
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
            transaction_id_1,
            {
              let datum_data: Data = InlineDatum(datum_in)
              datum_data
            },
            compare: bytearray.compare,
          ),
      id: TransactionId { hash: transaction_id_1 },
    }
  let spend_ctx =
    ScriptContext {
      transaction: tx,
      purpose: Spend(
        OutputReference {
          transaction_id: TransactionId { hash: transaction_id_1 },
          output_index: 0,
        },
      ),
    }
  let result = pellet.spend(admin_asset, datum_in, redeemer, spend_ctx)
  result
}

test provide_ok() {
  provide(default_provide_test_options())
}

test no_ship_token() fail {
  let options =
    ProvideTestOptions {
      ..default_provide_test_options(),
      ship_token_amount: 0,
    }
  provide(options)
}

test wrong_ship_token_name() fail {
  let options =
    ProvideTestOptions {
      ..default_provide_test_options(),
      ship_token_name: "SHI7",
    }
  provide(options)
}

test no_admin_token_output() fail {
  let options =
    ProvideTestOptions {
      ..default_provide_test_options(),
      pellet_output_value: from_lovelace(2_000_000),
    }
  provide(options)
}

test not_enough_fuel() fail {
  let options =
    ProvideTestOptions { ..default_provide_test_options(), provided_amount: 60 }
  provide(options)
}

test fuel_not_subtracted() fail {
  let default_options = default_provide_test_options()
  let options =
    ProvideTestOptions {
      ..default_options,
      pellet_output_value: default_options.pellet_input_value,
    }
  provide(options)
}

test datum_not_preserved() fail {
  let default_options = default_provide_test_options()
  let datum_in = default_options.datum_in
  let options =
    ProvideTestOptions {
      ..default_options,
      datum_out: PelletDatum { ..datum_in, pos_x: datum_in.pos_x + 1 },
    }
  provide(options)
}
