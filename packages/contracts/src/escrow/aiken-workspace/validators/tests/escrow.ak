use aiken/transaction.{
  InlineDatum, Input, ScriptContext, Spend, Transaction, placeholder,
}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{Value, add, from_asset, from_lovelace}
use escrow/types.{
  ActiveEscrow, CancelTrade, CompleteTrade, EscrowDatum, Initiation,
  RecipientDeposit,
}
use escrow/validators/escrow.{escrow_logic}
use sidan_placeholder/address.{mock_pub_key_address, mock_script_address}
use sidan_placeholder/key_hex.{mock_pub_key_hex}
use sidan_placeholder/output_reference.{mock_utxo_ref}
use sidan_placeholder/outputs.{mock_pub_key_output, mock_script_output}

type CancelTestCase {
  is_at_initiation: Bool,
  is_initiator_received_value: Bool,
  is_recipient_received_value: Bool,
  is_initiator_signed: Bool,
  is_recipient_signed: Bool,
}

fn initiation_datum() -> EscrowDatum {
  Initiation {
    initiator: mock_pub_key_address(0, None),
    initiator_assets: from_lovelace(2_000_000),
  }
}

fn active_datum(recipient: Address, recipient_assets: Value) -> EscrowDatum {
  ActiveEscrow {
    initiator: mock_pub_key_address(0, None),
    initiator_assets: from_lovelace(2_000_000),
    recipient,
    recipient_assets,
  }
}

fn get_cancel_test_tx(test_case: CancelTestCase) -> Transaction {
  let CancelTestCase {
    is_at_initiation,
    is_initiator_received_value,
    is_recipient_received_value,
    is_initiator_signed,
    is_recipient_signed,
  } = test_case

  let input_datum =
    if is_at_initiation {
      initiation_datum()
    } else {
      active_datum(mock_pub_key_address(1, None), from_asset("test", "test", 1))
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

  let initiator_output_value =
    if is_initiator_received_value {
      from_lovelace(2_000_000)
    } else {
      from_asset("test", "test", 1)
    }
  let recipient_output_value =
    if is_recipient_received_value {
      from_asset("test", "test", 1)
    } else {
      from_lovelace(2_000_000)
    }

  let initiator_output =
    mock_pub_key_output(mock_pub_key_address(0, None), initiator_output_value)
  let recipient_output =
    mock_pub_key_output(mock_pub_key_address(1, None), recipient_output_value)

  Transaction {
    ..placeholder(),
    inputs: [input],
    extra_signatories: extra_signatories,
    outputs: [initiator_output, recipient_output],
  }
}

test success_cancel() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CancelTrade
  let test_case =
    CancelTestCase {
      is_at_initiation: True,
      is_initiator_received_value: True,
      is_recipient_received_value: True,
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
      is_initiator_received_value: True,
      is_recipient_received_value: True,
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
      is_initiator_received_value: True,
      is_recipient_received_value: True,
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
      is_initiator_received_value: True,
      is_recipient_received_value: True,
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
      is_initiator_received_value: True,
      is_recipient_received_value: True,
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
      is_initiator_received_value: True,
      is_recipient_received_value: True,
      is_initiator_signed: False,
      is_recipient_signed: False,
    }

  let tx = get_cancel_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !escrow_logic(unused_mock_datum, redeemer, ctx)
}

test fail_cancel_without_initiator_value_returned() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CancelTrade
  let test_case =
    CancelTestCase {
      is_at_initiation: False,
      is_initiator_received_value: False,
      is_recipient_received_value: True,
      is_initiator_signed: True,
      is_recipient_signed: True,
    }

  let tx = get_cancel_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !escrow_logic(unused_mock_datum, redeemer, ctx)
}

test fail_cancel_without_recipient_value_returned() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CancelTrade
  let test_case =
    CancelTestCase {
      is_at_initiation: False,
      is_initiator_received_value: True,
      is_recipient_received_value: False,
      is_initiator_signed: True,
      is_recipient_signed: True,
    }

  let tx = get_cancel_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !escrow_logic(unused_mock_datum, redeemer, ctx)
}

type RecipientDepositTestCase {
  is_datum_updated: Bool,
  is_value_deposited: Bool,
}

fn get_deposit_test_tx(test_case: RecipientDepositTestCase) -> Transaction {
  let RecipientDepositTestCase { is_datum_updated, is_value_deposited } =
    test_case
  let input_datum = initiation_datum()

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

  let output_value =
    input_value
      |> if is_value_deposited {
           add(_, "test", "test", 1)
         } else {
           add(_, "", "", 1_000_000)
         }
  let output_datum =
    if is_datum_updated {
      active_datum(mock_pub_key_address(1, None), from_asset("test", "test", 1))
    } else {
      initiation_datum()
    }
  let output =
    mock_script_output(
      mock_script_address(0, None),
      output_value,
      InlineDatum(output_datum),
    )

  Transaction { ..placeholder(), inputs: [input], outputs: [output] }
}

test success_deposit() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer =
    RecipientDeposit {
      recipient: mock_pub_key_address(1, None),
      recipient_assets: from_asset("test", "test", 1),
    }
  let test_case =
    RecipientDepositTestCase {
      is_datum_updated: True,
      is_value_deposited: True,
    }

  let tx = get_deposit_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  escrow_logic(unused_mock_datum, redeemer, ctx)
}

test fail_deposit_without_updating_datum() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer =
    RecipientDeposit {
      recipient: mock_pub_key_address(1, None),
      recipient_assets: from_asset("test", "test", 1),
    }
  let test_case =
    RecipientDepositTestCase {
      is_datum_updated: False,
      is_value_deposited: True,
    }

  let tx = get_deposit_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !escrow_logic(unused_mock_datum, redeemer, ctx)
}

test fail_deposit_without_depositing_value() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer =
    RecipientDeposit {
      recipient: mock_pub_key_address(1, None),
      recipient_assets: from_asset("test", "test", 1),
    }
  let test_case =
    RecipientDepositTestCase {
      is_datum_updated: True,
      is_value_deposited: False,
    }

  let tx = get_deposit_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !escrow_logic(unused_mock_datum, redeemer, ctx)
}

type CompleteTestCase {
  is_initiator_signed: Bool,
  is_initiator_received_value: Bool,
  is_recipient_signed: Bool,
  is_recipient_received_value: Bool,
}

fn get_complete_test_tx(test_case: CompleteTestCase) -> Transaction {
  let CompleteTestCase {
    is_initiator_signed,
    is_initiator_received_value,
    is_recipient_signed,
    is_recipient_received_value,
  } = test_case
  let input_datum =
    ActiveEscrow {
      initiator: mock_pub_key_address(0, None),
      initiator_assets: from_lovelace(2_000_000),
      recipient: mock_pub_key_address(1, None),
      recipient_assets: from_asset("test", "test", 1),
    }

  let input_value = from_lovelace(2_000_000) |> add("test", "test", 1)

  let input =
    Input {
      output_reference: mock_utxo_ref(0, 1),
      output: mock_script_output(
        mock_script_address(0, None),
        input_value,
        InlineDatum(input_datum),
      ),
    }

  let initiator_output_value =
    if is_initiator_received_value {
      from_asset("test", "test", 1)
    } else {
      from_lovelace(2_000_000)
    }
  let recipient_output_value =
    if is_recipient_received_value {
      from_lovelace(2_000_000)
    } else {
      from_asset("test", "test", 1)
    }

  let initiator_output =
    mock_pub_key_output(mock_pub_key_address(0, None), initiator_output_value)
  let recipient_output =
    mock_pub_key_output(mock_pub_key_address(1, None), recipient_output_value)

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
    outputs: [initiator_output, recipient_output],
    extra_signatories: extra_signatories,
  }
}

test success_complete() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CompleteTrade
  let test_case =
    CompleteTestCase {
      is_initiator_signed: True,
      is_initiator_received_value: True,
      is_recipient_signed: True,
      is_recipient_received_value: True,
    }

  let tx = get_complete_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  escrow_logic(unused_mock_datum, redeemer, ctx)
}

test fail_complete_without_initiator_signed() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CompleteTrade
  let test_case =
    CompleteTestCase {
      is_initiator_signed: False,
      is_initiator_received_value: True,
      is_recipient_signed: True,
      is_recipient_received_value: True,
    }

  let tx = get_complete_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !escrow_logic(unused_mock_datum, redeemer, ctx)
}

test fail_complete_without_value_sent_to_initiator() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CompleteTrade
  let test_case =
    CompleteTestCase {
      is_initiator_signed: True,
      is_initiator_received_value: False,
      is_recipient_signed: True,
      is_recipient_received_value: True,
    }

  let tx = get_complete_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !escrow_logic(unused_mock_datum, redeemer, ctx)
}

test fail_complete_without_recipeint_signed() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CompleteTrade
  let test_case =
    CompleteTestCase {
      is_initiator_signed: True,
      is_initiator_received_value: True,
      is_recipient_signed: False,
      is_recipient_received_value: True,
    }

  let tx = get_complete_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !escrow_logic(unused_mock_datum, redeemer, ctx)
}

test fail_complete_without_value_sent_to_recipient() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = initiation_datum()
  let redeemer = CompleteTrade
  let test_case =
    CompleteTestCase {
      is_initiator_signed: True,
      is_initiator_received_value: True,
      is_recipient_signed: True,
      is_recipient_received_value: False,
    }

  let tx = get_complete_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !escrow_logic(unused_mock_datum, redeemer, ctx)
}
