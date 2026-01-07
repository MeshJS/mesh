use aiken/collection/list
// Programmable Logic Base Validator
// This validator locks all programmable token UTxOs
// It forwards validation to the global programmable logic stake validator
// Migrated from SmartTokens.Contracts.ProgrammableLogicBase

use cardano/address.{Credential}
use cardano/transaction.{Transaction}

validator programmable_logic_base(stake_cred: Credential) {
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _own_ref: Data,
    self: Transaction,
  ) {
    trace @"Starting programmable_logic_base validation"

    // The programmable logic base validator simply checks that the
    // global programmable logic stake script is invoked in the transaction
    // via the withdraw-zero pattern
    // Check that the stake credential is invoked
    // Optimization: check first withdrawal before scanning the rest
    list.any(
      self.withdrawals,
      fn(wdrl) {
        let Pair(cred, _amount) = wdrl
        cred == stake_cred
      },
    )
  }

  else(_) {
    fail
  }
}
