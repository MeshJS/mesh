use aiken/bytearray
use aiken/dict
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/transaction.{
  InlineDatum, Input, Output, OutputReference, ScriptContext, Spend, Transaction,
  TransactionId,
}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value.{ada_asset_name, ada_policy_id}
use asteria
use asteria/test_mock as mock
use asteria/test_utils
use asteria/types.{AddNewShip, AssetClass, AsteriaDatum}

// ==============================================================================================
// AddNewShip Tests
// ==============================================================================================

type AddTestOptions {
  pay_fee: Bool,
  include_admin_token: Bool,
  update_counter: Bool,
  preserve_policy: Bool,
}

fn default_add_options() {
  AddTestOptions {
    pay_fee: True,
    include_admin_token: True,
    update_counter: True,
    preserve_policy: True,
  }
}

fn addNewShip(options: AddTestOptions) -> Bool {
  let ship_mint_lovelace_fee = 2_000
  let max_asteria_mining = 40
  let ship_counter = 7
  let admin_token =
    AssetClass { policy: mock.admin_policy, name: mock.admin_token_name }
  let redeemer = AddNewShip
  let asteria_address =
    Address {
      payment_credential: ScriptCredential(mock.asteria_credential),
      stake_credential: None,
    }
  let asteria_value =
    if options.include_admin_token {
      value.from_lovelace(10_000_000)
        |> value.add(mock.admin_policy, mock.admin_token_name, 1)
    } else {
      value.from_lovelace(10_000_000)
    }
  let asteria_datum =
    AsteriaDatum { ship_counter, shipyard_policy: mock.shipyard_policy }
  let asteria_in = {
    let output =
      Output {
        address: asteria_address,
        value: asteria_value,
        datum: InlineDatum(asteria_datum),
        reference_script: None,
      }
    let output_reference =
      OutputReference {
        transaction_id: TransactionId { hash: mock.transaction_id_1 },
        output_index: 0,
      }
    Input { output_reference, output }
  }
  let asteria_out =
    Output {
      address: asteria_address,
      value: if options.pay_fee {
        asteria_in.output.value
          |> value.add(ada_policy_id, ada_asset_name, ship_mint_lovelace_fee)
      } else {
        asteria_in.output.value
      },
      datum: if options.update_counter {
        if options.preserve_policy {
          InlineDatum(AsteriaDatum { ..asteria_datum, ship_counter: 8 })
        } else {
          InlineDatum(AsteriaDatum { shipyard_policy: "ffff", ship_counter: 8 })
        }
      } else {
        InlineDatum(asteria_datum)
      },
      reference_script: None,
    }
  let tx =
    Transaction {
      inputs: [asteria_in],
      reference_inputs: [],
      outputs: [asteria_out],
      fee: value.from_lovelace(5_000),
      mint: value.to_minted_value(value.zero()),
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
              let datum_data: Data = InlineDatum(asteria_datum)
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
    asteria.spend(
      admin_token,
      ship_mint_lovelace_fee,
      max_asteria_mining,
      asteria_datum,
      redeemer,
      spend_ctx,
    )
  result
}

test add_ok() {
  addNewShip(default_add_options())
}

test no_fee_paid() fail {
  addNewShip(AddTestOptions { ..default_add_options(), pay_fee: False })
}

test no_admin_token() fail {
  addNewShip(
    AddTestOptions { ..default_add_options(), include_admin_token: False },
  )
}

test counter_not_updated() fail {
  addNewShip(AddTestOptions { ..default_add_options(), update_counter: False })
}

test shipyard_policy_not_preserved() fail {
  addNewShip(AddTestOptions { ..default_add_options(), preserve_policy: False })
}
