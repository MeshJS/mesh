use aiken/transaction.{ScriptContext, Spend, Transaction, placeholder}
use placeholder/address.{mock_pub_key_hex}
use placeholder/output_reference.{mock_utxo_ref}
use placeholder/validity_range.{mock_interval}
use vesting/types.{VestingDatum}
use vesting/validators/vesting.{vesting_logic}

type TestCase {
  is_owner_signed: Bool,
  is_beneficiary_signed: Bool,
  is_lock_time_passed: Bool,
}

fn get_test_tx(test_case: TestCase) {
  let TestCase { is_owner_signed, is_beneficiary_signed, is_lock_time_passed } =
    test_case
  let extra_signatories =
    when (is_owner_signed, is_beneficiary_signed) is {
      (True, True) ->
        [mock_pub_key_hex(1), mock_pub_key_hex(2)]
      (True, False) ->
        [mock_pub_key_hex(1)]
      (False, True) ->
        [mock_pub_key_hex(2)]
      (False, False) ->
        []
    }
  let validity_range =
    if is_lock_time_passed {
      mock_interval(Some(1672843961001), None)
    } else {
      mock_interval(None, None)
    }
  let tx =
    Transaction {
      ..placeholder(),
      extra_signatories: extra_signatories,
      validity_range: validity_range,
    }
  tx
}

fn vesting_datum() {
  VestingDatum {
    lock_until: 1672843961000,
    owner: mock_pub_key_hex(1),
    beneficiary: mock_pub_key_hex(2),
  }
}

test success_unlocking() {
  let output_reference = mock_utxo_ref(1)
  let datum = vesting_datum()
  let test_case =
    TestCase {
      is_owner_signed: True,
      is_beneficiary_signed: True,
      is_lock_time_passed: True,
    }

  let tx = get_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  vesting_logic(datum, ctx)
}

test success_unlocking_with_only_owner_signature() {
  let output_reference = mock_utxo_ref(1)
  let datum = vesting_datum()
  let test_case =
    TestCase {
      is_owner_signed: True,
      is_beneficiary_signed: False,
      is_lock_time_passed: False,
    }

  let tx = get_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  vesting_logic(datum, ctx)
}

test success_unlocking_with_beneficiary_signature_and_time_passed() {
  let output_reference = mock_utxo_ref(1)
  let datum = vesting_datum()
  let test_case =
    TestCase {
      is_owner_signed: False,
      is_beneficiary_signed: True,
      is_lock_time_passed: True,
    }

  let tx = get_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  vesting_logic(datum, ctx)
}

test fail_unlocking_with_only_beneficiary_signature() {
  let output_reference = mock_utxo_ref(1)
  let datum = vesting_datum()
  let test_case =
    TestCase {
      is_owner_signed: False,
      is_beneficiary_signed: True,
      is_lock_time_passed: False,
    }

  let tx = get_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !vesting_logic(datum, ctx)
}

test fail_unlocking_with_only_time_passed() {
  let output_reference = mock_utxo_ref(1)
  let datum = vesting_datum()
  let test_case =
    TestCase {
      is_owner_signed: False,
      is_beneficiary_signed: False,
      is_lock_time_passed: True,
    }

  let tx = get_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !vesting_logic(datum, ctx)
}
