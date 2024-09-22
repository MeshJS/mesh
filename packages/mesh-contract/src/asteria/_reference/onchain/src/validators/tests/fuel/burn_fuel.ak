use aiken/dict
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/transaction.{Mint, ScriptContext, Transaction, TransactionId}
use aiken/transaction/value
use asteria/test_mock as mock
use asteria/test_utils
use asteria/types.{AssetClass, BurnFuel}
use pellet

// ==============================================================================================
// MintFuel Tests
// ==============================================================================================

type BurnTestOptions {
  fuel_tokens_burnt: Int,
}

fn get_default_burn_options() {
  BurnTestOptions { fuel_tokens_burnt: 20 }
}

fn burn_fuel(options: BurnTestOptions) -> Bool {
  let redeemer = BurnFuel
  let admin_token =
    AssetClass { policy: mock.admin_policy, name: mock.admin_token_name }
  let tx =
    Transaction {
      inputs: [],
      reference_inputs: [],
      outputs: [],
      fee: value.from_lovelace(5_000),
      mint: value.to_minted_value(
        value.from_asset(mock.fuel_policy, "FUEL", -options.fuel_tokens_burnt),
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

test burn_ok() {
  burn_fuel(get_default_burn_options())
}

test no_fuel_tokens_burnt() fail {
  burn_fuel(BurnTestOptions { fuel_tokens_burnt: 0 })
}
