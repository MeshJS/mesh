use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use content_ownership/types.{
  CreateContentRegistry, CreateOwnershipRegistry, OracleDatum, OracleRedeemer,
  RotateKey, StopApp,
}
use content_ownership/utils.{get_registry_token_name}
use vodka_extra_signatories.{all_key_signed, key_signed}
use vodka_mints.{only_minted_token}
use vodka_outputs.{outputs_at_with}

validator oracle_validator {
  spend(
    datum_opt: Option<OracleDatum>,
    redeemer: OracleRedeemer,
    _utxo: OutputReference,
    tx: Transaction,
  ) {
    let Transaction { outputs, mint, extra_signatories, .. } = tx
    expect Some(datum) = datum_opt
    let OracleDatum {
      oracle_nft,
      oracle_address,
      content_registry_ref_token,
      content_registry_count,
      ownership_registry_ref_token,
      ownership_registry_count,
      operation_key,
      stop_key,
      ..
    } = datum

    when redeemer is {
      CreateContentRegistry ->
        // Ref token is minted
        only_minted_token(
          mint,
          content_registry_ref_token,
          get_registry_token_name(content_registry_count),
          1,
        )

      CreateOwnershipRegistry ->
        // Ref token is minted
        only_minted_token(
          mint,
          ownership_registry_ref_token,
          get_registry_token_name(ownership_registry_count),
          1,
        )
      RotateKey { new_operation_key, new_stop_key } -> {
        // Sign by both ops and stop key
        expect [own_output] =
          outputs_at_with(outputs, oracle_address, oracle_nft, "")
        expect InlineDatum(dat) = own_output.datum
        expect own_datum: OracleDatum = dat
        let datum_correct =
          own_datum == OracleDatum {
            ..datum,
            operation_key: new_operation_key,
            stop_key: new_stop_key,
          }
        all_key_signed(extra_signatories, [operation_key, stop_key]) && datum_correct
      }

      // datum update correctly (key rotated)
      StopApp ->
        // signed by stop key
        // oracle nft is burned
        key_signed(extra_signatories, stop_key) && only_minted_token(
          mint,
          oracle_nft,
          "",
          -1,
        )
    }
  }

  else(_) {
    fail
  }
}
