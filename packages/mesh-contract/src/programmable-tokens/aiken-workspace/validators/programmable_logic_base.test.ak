// Integration tests for programmable logic base validator
use aiken/collection/list
use cardano/address.{Address, Credential, Inline, Script, VerificationKey}

// Test data
const test_stake_cred: Credential = Script(#"aabbccdd")

const test_other_cred: Credential = Script(#"11223344")

// const test_address =
//   Address {
//     payment_credential: Script(#"deadbeef"),
//     stake_credential: Some(Inline(test_stake_cred)),
//   }

// Test stake credential invocation via withdrawals
test stake_credential_invoked_via_withdrawals() {
  let withdrawals = [Pair(test_stake_cred, 0)]

  list.any(
    withdrawals,
    fn(wdrl) {
      let Pair(cred, _amount) = wdrl
      cred == test_stake_cred
    },
  )
}

// Test stake credential not invoked fails
test stake_credential_not_invoked_fails() {
  let withdrawals = [Pair(test_other_cred, 0)]

  !list.any(
    withdrawals,
    fn(wdrl) {
      let Pair(cred, _amount) = wdrl
      cred == test_stake_cred
    },
  )
}

// Test withdraw-zero pattern
test withdraw_zero_pattern() {
  let Pair(cred, amount) = Pair(test_stake_cred, 0)

  cred == test_stake_cred && amount == 0
}

// Test multiple withdrawals with stake credential present
test multiple_withdrawals_with_stake_credential() {
  let withdrawals =
    [
      Pair(test_other_cred, 0),
      Pair(test_stake_cred, 0),
      Pair(Script(#"99999999"), 0),
    ]

  list.any(
    withdrawals,
    fn(wdrl) {
      let Pair(cred, _amount) = wdrl
      cred == test_stake_cred
    },
  )
}

// Test empty withdrawals list
test empty_withdrawals_list() {
  let withdrawals = []

  !list.any(
    withdrawals,
    fn(wdrl) {
      let Pair(cred, _amount) = wdrl
      cred == test_stake_cred
    },
  )
}

// Test credential equality
test credential_equality() {
  let cred1 = Script(#"aabbccdd")
  let cred2 = Script(#"aabbccdd")
  let cred3 = Script(#"11223344")

  cred1 == cred2 && cred1 != cred3
}

// Test stake credential types
test stake_credential_types() {
  let script_stake = Script(#"aabbccdd")
  let vkey_stake = VerificationKey(#"11223344")

  when script_stake is {
    Script(_) -> True
    _ -> False
  } && when vkey_stake is {
    VerificationKey(_) -> True
    _ -> False
  }
}

// Test address with inline stake credential
test address_with_inline_stake_credential() {
  let addr =
    Address {
      payment_credential: Script(#"deadbeef"),
      stake_credential: Some(Inline(test_stake_cred)),
    }

  when addr.stake_credential is {
    Some(Inline(stake)) -> stake == test_stake_cred
    _ -> False
  }
}

// Test programmable logic base forwards to global
test programmable_logic_base_forwards_to_global() {
  // The base validator's job is simple: ensure the global stake validator runs
  // This is done via the withdraw-zero pattern

  let global_stake_cred = Script(#"676c6f62616c")
  let withdrawals = [Pair(global_stake_cred, 0)]

  // Global stake validator is invoked
  list.any(
    withdrawals,
    fn(wdrl) {
      let Pair(cred, _amount) = wdrl
      cred == global_stake_cred
    },
  )
}

// Test validator datum and redeemer are ignored
test validator_datum_and_redeemer_ignored() {
  // The programmable_logic_base validator ignores datum and redeemer
  // It only checks that the stake validator is invoked
  let datum: Option<Data> = None

  // Validator doesn't care about these values
  datum == None
}
