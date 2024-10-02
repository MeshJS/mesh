use aiken_game_account/types.{
  AccountOracleDatum, AccountOracleRedeemer, RotateKey,
}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use vodka_extra_signatories.{all_key_signed}
use vodka_outputs.{outputs_at_with}

validator account_oracle {
  spend(
    datum_opt: Option<AccountOracleDatum>,
    redeemer: AccountOracleRedeemer,
    _input: OutputReference,
    tx: Transaction,
  ) {
    let Transaction { outputs, extra_signatories, .. } = tx
    expect Some(datum) = datum_opt
    let AccountOracleDatum { oracle_nft, oracle_address, stop_key, .. } = datum

    let RotateKey { new_operation_key, new_stop_key } = redeemer
    expect [own_output] =
      outputs_at_with(outputs, oracle_address, oracle_nft, "")
    expect InlineDatum(dat) = own_output.datum
    expect own_datum: AccountOracleDatum = dat
    let datum_correct =
      own_datum == AccountOracleDatum {
        ..datum,
        operation_key: new_operation_key,
        stop_key: new_stop_key,
      }
    all_key_signed(extra_signatories, [new_stop_key, stop_key]) && datum_correct
  }

  else(_) {
    fail
  }
}
