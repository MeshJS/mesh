use cardano/address.{Address}
use cardano/assets.{
  AssetName, PolicyId, from_asset, from_asset_list, from_lovelace,
}
use cardano/transaction.{
  Input, OutputReference, Transaction, find_input, placeholder,
}
use mocktail.{complete, mocktail_tx, tx_in, tx_in_inline_datum, tx_out}
use mocktail/virgin_address.{mock_pub_key_address, mock_script_address}
use mocktail/virgin_key_hash.{mock_pub_key_hash}
use mocktail/virgin_output_reference.{mock_tx_hash, mock_utxo_ref}
use vodka_address.{address_pub_key}
use vodka_extra_signatories.{key_signed}
use vodka_inputs.{inputs_at}
use vodka_value.{get_all_value_from, get_all_value_to, value_geq}

pub type MValue =
  Pairs<PolicyId, Pairs<AssetName, Int>>

pub type SwapDatum {
  SwapDatum { initiator: Address, to_provide: MValue, to_receive: MValue }
}

pub type SwapRedeemer {
  Cancel
  Swap
}

validator swap {
  spend(
    datum_opt: Option<SwapDatum>,
    redeemer: SwapRedeemer,
    input: OutputReference,
    tx: Transaction,
  ) {
    expect Some(datum) = datum_opt
    when redeemer is {
      Swap -> {
        expect Some(own_input) = find_input(tx.inputs, input)
        let own_address = own_input.output.address
        let inputs_from_script = inputs_at(tx.inputs, own_address)
        let is_only_one_input_from_script =
          when inputs_from_script is {
            [_] -> True
            _ -> False
          }

        let is_proceed_paid =
          get_all_value_to(tx.outputs, datum.initiator)
            |> value_geq(datum.to_receive |> from_asset_list())
        let is_token_unlocked =
          get_all_value_from(inputs_from_script, own_address)
            |> value_geq(datum.to_provide |> from_asset_list())
        is_only_one_input_from_script && is_token_unlocked && is_proceed_paid
      }
      Cancel -> {
        expect Some(pub_key) = address_pub_key(datum.initiator)
        key_signed(tx.extra_signatories, pub_key)
      }
    }
  }

  else(_) {
    fail
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

  mocktail_tx()
    |> tx_in(
        True,
        mock_tx_hash(1),
        1,
        from_lovelace(
          if is_token_unlocked {
            15_000_000
          } else {
            10_000_000
          },
        ),
        mock_script_address(1, None),
      )
    |> tx_in_inline_datum(True, swap_datum())
    |> tx_in(
        !is_only_one_input_from_script,
        mock_tx_hash(1),
        1,
        from_lovelace(10_000_000),
        mock_script_address(1, None),
      )
    |> tx_in_inline_datum(!is_only_one_input_from_script, swap_datum())
    |> tx_out(
        is_proceed_paid,
        mock_pub_key_address(1, None),
        from_asset("test", "test", 1_000),
      )
    |> complete()
}

fn swap_datum() -> SwapDatum {
  SwapDatum {
    initiator: mock_pub_key_address(1, None),
    to_provide: [Pair("", [Pair("", 15_000_000)])],
    to_receive: [Pair("test", [Pair("test", 1_000)])],
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
  swap.spend(Some(swap_datum()), Swap, output_reference, tx)
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
  !swap.spend(Some(swap_datum()), Swap, output_reference, tx)
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
  !swap.spend(Some(swap_datum()), Swap, output_reference, tx)
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
  !swap.spend(Some(swap_datum()), Swap, output_reference, tx)
}

test success_cancel() {
  let output_reference = mock_utxo_ref(1, 1)
  let tx =
    Transaction { ..placeholder, extra_signatories: [mock_pub_key_hash(1)] }
  swap.spend(Some(swap_datum()), Cancel, output_reference, tx)
}

test fail_cancel_without_key() {
  let output_reference = mock_utxo_ref(1, 1)
  let tx =
    Transaction { ..placeholder, extra_signatories: [mock_pub_key_hash(2)] }
  !swap.spend(Some(swap_datum()), Cancel, output_reference, tx)
}
