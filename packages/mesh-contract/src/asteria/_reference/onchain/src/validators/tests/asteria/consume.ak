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
use aiken/transaction/value
use asteria
use asteria/test_mock as mock
use asteria/test_utils
use asteria/types.{AssetClass, AsteriaDatum, ConsumeAsteria}

// ==============================================================================================
// Consume Tests
// ==============================================================================================

type ConsumeTestOptions {
  is_wallet_address: Bool,
  include_admin_input: Bool,
}

fn default_consume_options() {
  ConsumeTestOptions { is_wallet_address: True, include_admin_input: True }
}

fn consume(options: ConsumeTestOptions) -> Bool {
  let ship_mint_lovelace_fee = 2_000
  let max_asteria_mining = 40
  let ship_counter = 7
  let admin_token =
    AssetClass { policy: mock.admin_policy, name: mock.admin_token_name }
  let redeemer = ConsumeAsteria

  let admin_address =
    Address {
      payment_credential: if options.is_wallet_address {
        VerificationKeyCredential(mock.admin_credential)
      } else {
        ScriptCredential(mock.admin_credential)
      },
      stake_credential: None,
    }
  let admin_in = {
    let output = {
      let value =
        value.from_lovelace(2_000_000)
          |> value.add(admin_token.policy, admin_token.name, 1)
      Output {
        address: admin_address,
        value,
        datum: NoDatum,
        reference_script: None,
      }
    }
    let output_reference =
      OutputReference {
        transaction_id: TransactionId { hash: mock.transaction_id_2 },
        output_index: 0,
      }
    Input { output_reference, output }
  }

  let asteria_address =
    Address {
      payment_credential: ScriptCredential(mock.asteria_credential),
      stake_credential: None,
    }
  let asteria_datum =
    AsteriaDatum { ship_counter, shipyard_policy: mock.shipyard_policy }
  let asteria_in = {
    let output =
      Output {
        address: asteria_address,
        value: value.from_lovelace(12_000_000)
          |> value.add(mock.admin_policy, mock.admin_token_name, 1),
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

  let tx =
    Transaction {
      inputs: if options.include_admin_input {
        [admin_in, asteria_in]
      } else {
        [asteria_in]
      },
      reference_inputs: [],
      outputs: [],
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

test consume_ok() {
  consume(default_consume_options())
}

test admin_token_at_script_address() fail {
  consume(
    ConsumeTestOptions { ..default_consume_options(), is_wallet_address: False },
  )
}

test no_admin_input() fail {
  consume(
    ConsumeTestOptions {
      ..default_consume_options(),
      include_admin_input: False,
    },
  )
}
