use cardano/address.{Address}
use cardano/assets.{add, from_asset, from_lovelace}
use cardano/transaction.{Transaction}
use escrow.{
  ActiveEscrow, CancelTrade, CompleteTrade, EscrowDatum, Initiation, MValue,
  RecipientDeposit,
}
use mocktail.{
  complete, mocktail_tx, required_signer_hash, tx_in, tx_in_inline_datum, tx_out,
  tx_out_inline_datum,
}
use mocktail/virgin_address.{mock_pub_key_address, mock_script_address}
use mocktail/virgin_key_hash.{mock_pub_key_hash}
use mocktail/virgin_output_reference.{mock_tx_hash, mock_utxo_ref}

type CancelTestCase {
  is_at_initiation: Bool,
  is_initiator_received_value: Bool,
  is_recipient_received_value: Bool,
  is_initiator_signed: Bool,
  is_recipient_signed: Bool,
}

fn test_lovelace() -> MValue {
  [Pair("", [Pair("", 2_000_000)])]
}

fn test_value() -> MValue {
  [Pair("test", [Pair("test", 1)])]
}

fn initiator_address() -> Address {
  mock_pub_key_address(0, None)
}

fn recipient_address() -> Address {
  mock_pub_key_address(1, None)
}

fn initiation_datum() -> EscrowDatum {
  let initiator_assets: MValue = test_lovelace()
  Initiation { initiator: initiator_address(), initiator_assets }
}

fn active_datum(recipient: Address, recipient_assets: MValue) -> EscrowDatum {
  ActiveEscrow {
    initiator: initiator_address(),
    initiator_assets: test_lovelace(),
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

  mocktail_tx()
    |> tx_in(
        True,
        mock_tx_hash(0),
        1,
        from_lovelace(2_000_000),
        mock_script_address(0, None),
      )
    |> tx_in_inline_datum(is_at_initiation, initiation_datum())
    |> tx_in_inline_datum(
        !is_at_initiation,
        active_datum(
          mock_pub_key_address(1, None),
          [Pair("test", [Pair("test", 1)])],
        ),
      )
    |> tx_out(True, initiator_address(), initiator_output_value)
    |> tx_out(True, recipient_address(), recipient_output_value)
    |> required_signer_hash(is_initiator_signed, mock_pub_key_hash(0))
    |> required_signer_hash(is_recipient_signed, mock_pub_key_hash(1))
    |> complete()
}

test success_cancel() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
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
  escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test success_cancel_at_initiation() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
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
  escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test success_cancel_at_active_with_initiator_signed() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
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
  escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test success_cancel_at_active_with_recipient_signed() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
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
  escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test fail_cancel_at_initiation_without_signature() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
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
  !escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test fail_cancel_without_signature() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
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
  !escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test fail_cancel_without_initiator_value_returned() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
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
  !escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test fail_cancel_without_recipient_value_returned() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
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
  !escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

type RecipientDepositTestCase {
  is_datum_updated: Bool,
  is_value_deposited: Bool,
}

fn get_deposit_test_tx(test_case: RecipientDepositTestCase) -> Transaction {
  let RecipientDepositTestCase { is_datum_updated, is_value_deposited } =
    test_case
  let input_value = from_lovelace(2_000_000)
  let output_value =
    input_value
      |> if is_value_deposited {
          add(_, "test", "test", 1)
        } else {
          add(_, "", "", 1_000_000)
        }

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 1, input_value, mock_script_address(0, None))
    |> tx_in_inline_datum(True, initiation_datum())
    |> tx_out(True, mock_script_address(0, None), output_value)
    |> tx_out_inline_datum(
        is_datum_updated,
        active_datum(
          mock_pub_key_address(1, None),
          [Pair("test", [Pair("test", 1)])],
        ),
      )
    |> tx_out_inline_datum(!is_datum_updated, initiation_datum())
    |> complete()
}

test success_deposit() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
  let redeemer =
    RecipientDeposit {
      recipient: mock_pub_key_address(1, None),
      recipient_assets: test_value(),
    }
  let test_case =
    RecipientDepositTestCase {
      is_datum_updated: True,
      is_value_deposited: True,
    }

  let tx = get_deposit_test_tx(test_case)
  escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test fail_deposit_without_updating_datum() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
  let redeemer =
    RecipientDeposit {
      recipient: mock_pub_key_address(1, None),
      recipient_assets: test_value(),
    }
  let test_case =
    RecipientDepositTestCase {
      is_datum_updated: False,
      is_value_deposited: True,
    }

  let tx = get_deposit_test_tx(test_case)
  !escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test fail_deposit_without_depositing_value() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
  let redeemer =
    RecipientDeposit {
      recipient: mock_pub_key_address(1, None),
      recipient_assets: test_value(),
    }
  let test_case =
    RecipientDepositTestCase {
      is_datum_updated: True,
      is_value_deposited: False,
    }

  let tx = get_deposit_test_tx(test_case)
  !escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
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
      initiator_assets: test_lovelace(),
      recipient: mock_pub_key_address(1, None),
      recipient_assets: test_value(),
    }

  mocktail_tx()
    |> required_signer_hash(is_initiator_signed, mock_pub_key_hash(0))
    |> required_signer_hash(is_recipient_signed, mock_pub_key_hash(1))
    |> tx_in(
        True,
        mock_tx_hash(0),
        1,
        from_lovelace(2_000_000) |> add("test", "test", 1),
        mock_script_address(0, None),
      )
    |> tx_in_inline_datum(True, input_datum)
    |> tx_out(
        is_initiator_received_value,
        mock_pub_key_address(0, None),
        from_asset("test", "test", 1),
      )
    |> tx_out(
        is_recipient_received_value,
        mock_pub_key_address(1, None),
        from_lovelace(2_000_000),
      )
    |> complete()
}

test success_complete() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
  let redeemer = CompleteTrade
  let test_case =
    CompleteTestCase {
      is_initiator_signed: True,
      is_initiator_received_value: True,
      is_recipient_signed: True,
      is_recipient_received_value: True,
    }

  let tx = get_complete_test_tx(test_case)
  escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test fail_complete_without_initiator_signed() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
  let redeemer = CompleteTrade
  let test_case =
    CompleteTestCase {
      is_initiator_signed: False,
      is_initiator_received_value: True,
      is_recipient_signed: True,
      is_recipient_received_value: True,
    }

  let tx = get_complete_test_tx(test_case)
  !escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test fail_complete_without_value_sent_to_initiator() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
  let redeemer = CompleteTrade
  let test_case =
    CompleteTestCase {
      is_initiator_signed: True,
      is_initiator_received_value: False,
      is_recipient_signed: True,
      is_recipient_received_value: True,
    }

  let tx = get_complete_test_tx(test_case)
  !escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test fail_complete_without_recipeint_signed() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
  let redeemer = CompleteTrade
  let test_case =
    CompleteTestCase {
      is_initiator_signed: True,
      is_initiator_received_value: True,
      is_recipient_signed: False,
      is_recipient_received_value: True,
    }

  let tx = get_complete_test_tx(test_case)
  !escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}

test fail_complete_without_value_sent_to_recipient() {
  let output_reference = mock_utxo_ref(0, 1)
  let unused_mock_datum = Some(initiation_datum())
  let redeemer = CompleteTrade
  let test_case =
    CompleteTestCase {
      is_initiator_signed: True,
      is_initiator_received_value: True,
      is_recipient_signed: True,
      is_recipient_received_value: False,
    }

  let tx = get_complete_test_tx(test_case)
  !escrow.escrow.spend(unused_mock_datum, redeemer, output_reference, tx)
}
