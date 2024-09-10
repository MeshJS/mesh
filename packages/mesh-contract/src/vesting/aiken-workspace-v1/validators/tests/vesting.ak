use aiken/transaction.{ScriptContext, Spend}
use mocktail.{complete, invalid_before, mocktail_tx, required_signer_hash}
use mocktail/virgin_key_hex.{mock_pub_key_hash}
use mocktail/virgin_output_reference.{mock_utxo_ref}
use vesting.{vesting}
use vesting/types.{VestingDatum}

type TestCase {
  is_owner_signed: Bool,
  is_beneficiary_signed: Bool,
  is_lock_time_passed: Bool,
}

fn get_test_tx(test_case: TestCase) {
  let TestCase { is_owner_signed, is_beneficiary_signed, is_lock_time_passed } =
    test_case

  mocktail_tx()
    |> required_signer_hash(is_owner_signed, mock_pub_key_hash(1))
    |> required_signer_hash(is_beneficiary_signed, mock_pub_key_hash(2))
    |> invalid_before(is_lock_time_passed, 1672843961001)
    |> complete()
}

fn vesting_datum() {
  VestingDatum {
    lock_until: 1672843961000,
    owner: mock_pub_key_hash(1),
    beneficiary: mock_pub_key_hash(2),
  }
}

test success_unlocking() {
  let output_reference = mock_utxo_ref(0, 1)
  let datum = vesting_datum()
  let test_case =
    TestCase {
      is_owner_signed: True,
      is_beneficiary_signed: True,
      is_lock_time_passed: True,
    }

  let tx = get_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  vesting(datum, Void, ctx)
}

test success_unlocking_with_only_owner_signature() {
  let output_reference = mock_utxo_ref(0, 1)
  let datum = vesting_datum()
  let test_case =
    TestCase {
      is_owner_signed: True,
      is_beneficiary_signed: False,
      is_lock_time_passed: False,
    }

  let tx = get_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  vesting(datum, Void, ctx)
}

test success_unlocking_with_beneficiary_signature_and_time_passed() {
  let output_reference = mock_utxo_ref(0, 1)
  let datum = vesting_datum()
  let test_case =
    TestCase {
      is_owner_signed: False,
      is_beneficiary_signed: True,
      is_lock_time_passed: True,
    }

  let tx = get_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  vesting(datum, Void, ctx)
}

test fail_unlocking_with_only_beneficiary_signature() {
  let output_reference = mock_utxo_ref(0, 1)
  let datum = vesting_datum()
  let test_case =
    TestCase {
      is_owner_signed: False,
      is_beneficiary_signed: True,
      is_lock_time_passed: False,
    }

  let tx = get_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !vesting(datum, Void, ctx)
}

test fail_unlocking_with_only_time_passed() {
  let output_reference = mock_utxo_ref(0, 1)
  let datum = vesting_datum()
  let test_case =
    TestCase {
      is_owner_signed: False,
      is_beneficiary_signed: False,
      is_lock_time_passed: True,
    }

  let tx = get_test_tx(test_case)
  let ctx = ScriptContext { purpose: Spend(output_reference), transaction: tx }
  !vesting(datum, Void, ctx)
}
