use aiken/transaction.{InlineDatum, Input, ScriptContext, Spend, Transaction}
use aiken/transaction/value.{add, from_lovelace}
use marketplace.{marketplace}
use marketplace/types.{Buy, Close, MarketplaceDatum}
use mocktail.{
  add_input, complete, mocktail_tx, required_signer_hash, tx_in,
  tx_in_inline_datum, tx_out,
}
use mocktail/virgin_address.{mock_pub_key_address, mock_script_address}
use mocktail/virgin_key_hex.{mock_policy_id, mock_pub_key_hash}
use mocktail/virgin_output_reference.{mock_tx_hash, mock_utxo_ref}
use mocktail/virgin_outputs.{mock_script_output}

type CloseTestCase {
  is_seller_signed: Bool,
}

fn mock_datum() -> MarketplaceDatum {
  MarketplaceDatum {
    seller: mock_pub_key_address(1, None),
    price: 200_000_000,
    policy: mock_policy_id(0),
    tokenName: "Test Token",
  }
}

fn get_close_test_tx(test_case: CloseTestCase) -> Transaction {
  let CloseTestCase { is_seller_signed } = test_case

  mocktail_tx()
    |> tx_in(
        True,
        mock_tx_hash(0),
        1,
        from_lovelace(2_000_000),
        mock_script_address(0, None),
      )
    |> tx_in_inline_datum(True, mock_datum())
    |> required_signer_hash(is_seller_signed, mock_pub_key_hash(1))
    |> complete()
}

test success_close() {
  let output_reference = mock_utxo_ref(0, 1)
  let redeemer = Close
  let test_case = CloseTestCase { is_seller_signed: True }

  let tx = get_close_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  marketplace(mock_pub_key_address(0, None), 100, mock_datum(), redeemer, ctx)
}

test fail_close_without_signature() {
  let output_reference = mock_utxo_ref(0, 1)
  let redeemer = Close
  let test_case = CloseTestCase { is_seller_signed: False }

  let tx = get_close_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !marketplace(mock_pub_key_address(0, None), 100, mock_datum(), redeemer, ctx)
}

type BuyTestCase {
  is_only_one_input_from_script: Bool,
  is_fee_paid: Bool,
  is_proceed_paid: Bool,
}

fn get_buy_test_tx(test_case: BuyTestCase) -> Transaction {
  let BuyTestCase {
    is_only_one_input_from_script,
    is_fee_paid,
    is_proceed_paid,
  } = test_case

  let input_value =
    from_lovelace(2_000_000) |> add(mock_policy_id(0), "Test Token", 1)

  mocktail_tx()
    |> tx_out(
        True,
        mock_pub_key_address(0, None),
        if is_fee_paid {
          from_lovelace(2_000_000)
        } else {
          from_lovelace(1_000_000)
        },
      )
    |> tx_out(
        True,
        mock_pub_key_address(1, None),
        if is_proceed_paid {
          from_lovelace(202_000_000)
        } else {
          from_lovelace(200_000_000)
        },
      )
    |> complete()
    |> add_input(
        True,
        Input {
          output_reference: mock_utxo_ref(0, 1),
          output: mock_script_output(
            mock_script_address(0, None),
            input_value,
            InlineDatum(mock_datum()),
          ),
        },
      )
    |> add_input(
        !is_only_one_input_from_script,
        Input {
          output_reference: mock_utxo_ref(0, 2),
          output: mock_script_output(
            mock_script_address(0, None),
            input_value,
            InlineDatum(mock_datum()),
          ),
        },
      )
}

test success_buy() {
  let output_reference = mock_utxo_ref(0, 1)
  let redeemer = Buy
  let test_case =
    BuyTestCase {
      is_only_one_input_from_script: True,
      is_fee_paid: True,
      is_proceed_paid: True,
    }

  let tx = get_buy_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  marketplace(mock_pub_key_address(0, None), 100, mock_datum(), redeemer, ctx)
}

test fail_buy_with_multiple_script_inputs() {
  let output_reference = mock_utxo_ref(0, 1)
  let redeemer = Buy
  let test_case =
    BuyTestCase {
      is_only_one_input_from_script: False,
      is_fee_paid: True,
      is_proceed_paid: True,
    }

  let tx = get_buy_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !marketplace(mock_pub_key_address(0, None), 100, mock_datum(), redeemer, ctx)
}

test fail_buy_without_fee_paid() {
  let output_reference = mock_utxo_ref(0, 1)
  let redeemer = Buy
  let test_case =
    BuyTestCase {
      is_only_one_input_from_script: True,
      is_fee_paid: False,
      is_proceed_paid: True,
    }

  let tx = get_buy_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !marketplace(mock_pub_key_address(0, None), 100, mock_datum(), redeemer, ctx)
}

test fail_buy_without_proceed_paid() {
  let output_reference = mock_utxo_ref(0, 1)
  let redeemer = Buy
  let test_case =
    BuyTestCase {
      is_only_one_input_from_script: True,
      is_fee_paid: True,
      is_proceed_paid: False,
    }

  let tx = get_buy_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !marketplace(mock_pub_key_address(0, None), 100, mock_datum(), redeemer, ctx)
}
