use aiken/transaction.{
  InlineDatum, Input, ScriptContext, Spend, Transaction, find_input, placeholder,
}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{Value, from_asset, from_lovelace}
use sidan_placeholder/address.{mock_pub_key_address, mock_script_address}
use sidan_placeholder/key_hex.{mock_pub_key_hex}
use sidan_placeholder/output_reference.{mock_utxo_ref}
use sidan_placeholder/outputs.{mock_pub_key_output, mock_script_output}
use sidan_utils/address.{address_pub_key} as sidan_address
use sidan_utils/extra_signatories.{key_signed}
use sidan_utils/inputs.{inputs_at}
use sidan_utils/value.{get_all_value_from,
  get_all_value_to, value_geq} as sidan_value

pub type SwapDatum {
  SwapDatum { initiator: Address, to_provide: Value, to_receive: Value }
}

pub type SwapRedeemer {
  Cancel
  Swap
}

validator {
  fn swap(datum: SwapDatum, redeemer: SwapRedeemer, ctx: ScriptContext) {
    when ctx.purpose is {
      Spend(utxo) ->
        when redeemer is {
          Swap -> {
            expect Some(own_input) = find_input(ctx.transaction.inputs, utxo)
            let own_address = own_input.output.address
            let inputs_from_script =
              inputs_at(ctx.transaction.inputs, own_address)
            let is_only_one_input_from_script =
              when inputs_from_script is {
                [_] -> True
                _ -> False
              }

            let is_proceed_paid =
              get_all_value_to(ctx.transaction.outputs, datum.initiator)
                |> value_geq(datum.to_receive)
            let is_token_unlocked =
              get_all_value_from(inputs_from_script, own_address)
                |> value_geq(datum.to_provide)
            is_only_one_input_from_script && is_token_unlocked && is_proceed_paid
          }
          Cancel ->
            key_signed(
              ctx.transaction.extra_signatories,
              address_pub_key(datum.initiator),
            )
        }
      _ -> False
    }
  }
}

type SwapTestCase {
  is_only_one_input_from_script: Bool,
  is_token_unlocked: Bool,
  is_proceed_paid: Bool,
}

fn get_swap_test_tx(test_case: SwapTestCase) {
  let SwapTestCase {
    is_only_one_input_from_script,
    is_token_unlocked,
    is_proceed_paid,
  } = test_case

  let input =
    Input {
      output_reference: mock_utxo_ref(1, 1),
      output: mock_script_output(
        mock_script_address(1, None),
        from_lovelace(
          if is_token_unlocked {
            15_000_000
          } else {
            10_000_000
          },
        ),
        InlineDatum(swap_datum()),
      ),
    }
  let inputs =
    if is_only_one_input_from_script {
      [input]
    } else {
      [input, input]
    }
  let outputs =
    [
      mock_pub_key_output(
        mock_pub_key_address(1, None),
        from_asset(
          "test",
          "test",
          if is_proceed_paid {
            1_000
          } else {
            500
          },
        ),
      ),
    ]
  let tx = Transaction { ..placeholder(), inputs: inputs, outputs: outputs }
  tx
}

fn swap_datum() -> SwapDatum {
  SwapDatum {
    initiator: mock_pub_key_address(1, None),
    to_provide: from_lovelace(15_000_000),
    to_receive: from_asset("test", "test", 1_000),
  }
}

test success_swapping() {
  let output_reference = mock_utxo_ref(1, 1)
  let test_case =
    SwapTestCase {
      is_only_one_input_from_script: True,
      is_token_unlocked: True,
      is_proceed_paid: True,
    }

  let tx = get_swap_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  swap(swap_datum(), Swap, ctx)
}

test fail_swapping_attempting_double_satisfaction() {
  let output_reference = mock_utxo_ref(1, 1)
  let test_case =
    SwapTestCase {
      is_only_one_input_from_script: False,
      is_token_unlocked: True,
      is_proceed_paid: True,
    }

  let tx = get_swap_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !swap(swap_datum(), Swap, ctx)
}

test fail_swapping_without_sufficient_proceed() {
  let output_reference = mock_utxo_ref(1, 1)
  let test_case =
    SwapTestCase {
      is_only_one_input_from_script: True,
      is_token_unlocked: False,
      is_proceed_paid: True,
    }

  let tx = get_swap_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !swap(swap_datum(), Swap, ctx)
}

test fail_swapping_without_proceed_paid() {
  let output_reference = mock_utxo_ref(1, 1)
  let test_case =
    SwapTestCase {
      is_only_one_input_from_script: True,
      is_token_unlocked: True,
      is_proceed_paid: False,
    }

  let tx = get_swap_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !swap(swap_datum(), Swap, ctx)
}

test success_cancel() {
  let output_reference = mock_utxo_ref(1, 1)
  let tx =
    Transaction { ..placeholder(), extra_signatories: [mock_pub_key_hex(1)] }
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  swap(swap_datum(), Cancel, ctx)
}

test fail_cancel_without_key() {
  let output_reference = mock_utxo_ref(1, 1)
  let tx =
    Transaction { ..placeholder(), extra_signatories: [mock_pub_key_hex(2)] }
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !swap(swap_datum(), Cancel, ctx)
}
