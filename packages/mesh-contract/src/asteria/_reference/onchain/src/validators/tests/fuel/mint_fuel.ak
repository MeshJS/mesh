use aiken/dict
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/transaction.{
  Input, Mint, NoDatum, Output, OutputReference, ScriptContext, Transaction,
  TransactionId,
}
use aiken/transaction/credential.{Address, VerificationKeyCredential}
use aiken/transaction/value.{add, from_lovelace}
use asteria/test_mock as mock
use asteria/test_utils
use asteria/types.{AssetClass, MintFuel}
use pellet

// ==============================================================================================
// MintFuel Tests
// ==============================================================================================

type MintTestOptions {
  fuel_tokens_minted: Int,
  includes_admin_input: Bool,
}

fn get_default_mint_options() {
  MintTestOptions { fuel_tokens_minted: 20, includes_admin_input: True }
}

fn mint_fuel(options: MintTestOptions) -> Bool {
  let redeemer = MintFuel
  let admin_token =
    AssetClass { policy: mock.admin_policy, name: mock.admin_token_name }
  let admin_address =
    Address {
      payment_credential: VerificationKeyCredential(mock.admin_credential),
      stake_credential: None,
    }
  let admin_input = {
    let output = {
      let value =
        from_lovelace(2_000_000)
          |> add(mock.admin_policy, mock.admin_token_name, 1)
      Output {
        address: admin_address,
        value,
        datum: NoDatum,
        reference_script: None,
      }
    }
    Input {
      output_reference: OutputReference {
        transaction_id: TransactionId { hash: mock.transaction_id_1 },
        output_index: 0,
      },
      output,
    }
  }
  let tx =
    Transaction {
      inputs: if options.includes_admin_input {
        [admin_input]
      } else {
        []
      },
      reference_inputs: [],
      outputs: [],
      fee: value.from_lovelace(5_000),
      mint: value.to_minted_value(
        value.from_asset(mock.fuel_policy, "FUEL", options.fuel_tokens_minted),
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
            key: Mint(mock.fuel_policy),
            value: {
              let redeemer_data: Data = redeemer
              redeemer_data
            },
            compare: test_utils.script_purpose_compare,
          ),
      datums: dict.new(),
      id: TransactionId { hash: mock.transaction_id_2 },
    }
  let mint_ctx =
    ScriptContext { transaction: tx, purpose: Mint(mock.fuel_policy) }
  let result = pellet.mint(admin_token, redeemer, ctx: mint_ctx)
  result
}

test mint_ok() {
  mint_fuel(get_default_mint_options())
}

test no_fuel_tokens_minted() fail {
  mint_fuel(
    MintTestOptions { ..get_default_mint_options(), fuel_tokens_minted: 0 },
  )
}

test no_admin_input() fail {
  mint_fuel(
    MintTestOptions {
      ..get_default_mint_options(),
      includes_admin_input: False,
    },
  )
}
