use aiken/transaction.{
  InlineDatum, Input, ScriptContext, Spend, Transaction, placeholder,
}
use aiken/transaction/value.{from_asset, from_lovelace}
use escrow/types.{ActiveEscrow, CancelTrade, EscrowDatum, Initiation}
use escrow/validators/escrow.{escrow_logic}
use sidan_placeholder/address.{mock_pub_key_address, mock_script_address}
use sidan_placeholder/key_hex.{mock_pub_key_hex}
use sidan_placeholder/output_reference.{mock_utxo_ref}
use sidan_placeholder/outputs.{mock_script_output}

type CancelTestCase {
  is_at_initiation: Bool,
  is_initiator_signed: Bool,
  is_recipient_signed: Bool,
}

fn initiation_datum() -> EscrowDatum {
  Initiation {
    initiator: mock_pub_key_address(0, None),
    initiator_assets: from_lovelace(2_000_000),
  }
}

fn active_datum() -> EscrowDatum {
  ActiveEscrow {
    initiator: mock_pub_key_address(0, None),
    initiator_assets: from_lovelace(2_000_000),
    recipient: mock_pub_key_address(1, None),
    recipient_assets: from_asset("test", "test", 2_000_000),
  }
}

fn get_cancel_test_tx(test_case: CancelTestCase) -> Transaction {
  let CancelTestCase {
    is_at_initiation,
    is_initiator_signed,
    is_recipient_signed,
  } = test_case

  let input_datum =
    if is_at_initiation {
      initiation_datum()
    } else {
      active_datum()
    }

  let input_value = from_lovelace(2_000_000)

  let input =
    Input {
      output_reference: mock_utxo_ref(0, 1),
      output: mock_script_output(
        mock_script_address(0, None),
        input_value,
        InlineDatum(input_datum),
      ),
    }

  let extra_signatories =
    when (is_initiator_signed, is_recipient_signed) is {
      (True, True) ->
        [mock_pub_key_hex(0), mock_pub_key_hex(1)]
      (True, False) ->
        [mock_pub_key_hex(0)]
      (False, True) ->
        [mock_pub_key_hex(1)]
      (False, False) ->
        []
    }

  Transaction {
    ..placeholder(),
    inputs: [input],
    extra_signatories: extra_signatories,
  }
}

test success_cancel() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CancelTrade
  let test_case =
    CancelTestCase {
      is_at_initiation: True,
      is_initiator_signed: True,
      is_recipient_signed: True,
    }

  let tx = get_cancel_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  escrow_logic(unused_mock_datum, redeemer, ctx)
}

test success_cancel_at_initiation() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CancelTrade
  let test_case =
    CancelTestCase {
      is_at_initiation: True,
      is_initiator_signed: True,
      is_recipient_signed: False,
    }

  let tx = get_cancel_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  escrow_logic(unused_mock_datum, redeemer, ctx)
}

test success_cancel_at_active_with_initiator_signed() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CancelTrade
  let test_case =
    CancelTestCase {
      is_at_initiation: False,
      is_initiator_signed: True,
      is_recipient_signed: False,
    }

  let tx = get_cancel_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  escrow_logic(unused_mock_datum, redeemer, ctx)
}

test success_cancel_at_active_with_recipient_signed() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CancelTrade
  let test_case =
    CancelTestCase {
      is_at_initiation: False,
      is_initiator_signed: False,
      is_recipient_signed: True,
    }

  let tx = get_cancel_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  escrow_logic(unused_mock_datum, redeemer, ctx)
}

test fail_cancel_at_initiation_without_signature() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CancelTrade
  let test_case =
    CancelTestCase {
      is_at_initiation: True,
      is_initiator_signed: False,
      is_recipient_signed: True,
    }

  let tx = get_cancel_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !escrow_logic(unused_mock_datum, redeemer, ctx)
}

test fail_cancel_without_signature() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CancelTrade
  let test_case =
    CancelTestCase {
      is_at_initiation: False,
      is_initiator_signed: False,
      is_recipient_signed: False,
    }

  let tx = get_cancel_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !escrow_logic(unused_mock_datum, redeemer, ctx)
}
// type RecipientDepositTestCase {
//   is_datum_updated: Bool,
//   is_value_deposited: Bool,
// }

// type CompleteTestCase {
//   is_initiator_signed: Bool,
//   is_initiator_received_value: Bool,
//   is_recipient_signed: Bool,
//   is_recipient_received_value: Bool,
// }
