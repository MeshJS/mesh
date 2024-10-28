use cardano/assets.{PolicyId, from_asset}
use cardano/transaction.{Input, Transaction, placeholder}
use content_ownership/placeholder.{mock_oracle_datum, mock_oracle_output}
use content_ownership/types.{
  CreateContentRegistry, CreateOwnershipRegistry, OracleDatum, RotateKey,
  StopApp,
}
use mocktail/virgin_key_hash.{mock_policy_id, mock_pub_key_hash}
use mocktail/virgin_output_reference.{mock_utxo_ref}
use oracle_validator

test success_create_content_registry() {
  let redeemer = CreateContentRegistry
  let policy_id: PolicyId = mock_policy_id(1)

  let tx =
    Transaction {
      ..placeholder,
      mint: from_asset(policy_id, "Registry (0)", 1),
    }

  oracle_validator.oracle_validator.spend(
    Some(mock_oracle_datum),
    redeemer,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test success_create_ownership_registry() {
  let redeemer = CreateOwnershipRegistry
  let policy_id: PolicyId = mock_policy_id(2)

  let tx =
    Transaction {
      ..placeholder,
      mint: from_asset(policy_id, "Registry (0)", 1),
    }

  oracle_validator.oracle_validator.spend(
    Some(mock_oracle_datum),
    redeemer,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test success_rotate_key() {
  let redeemer =
    RotateKey {
      new_operation_key: mock_pub_key_hash(1),
      new_stop_key: mock_pub_key_hash(0),
    }

  let input_utxo = mock_utxo_ref(0, 0)
  let input =
    Input {
      output_reference: input_utxo,
      output: mock_oracle_output(mock_oracle_datum),
    }
  let output =
    mock_oracle_output(
      OracleDatum {
        ..mock_oracle_datum,
        operation_key: mock_pub_key_hash(1),
        stop_key: mock_pub_key_hash(0),
      },
    )

  let tx =
    Transaction {
      ..placeholder,
      inputs: [input],
      outputs: [output],
      extra_signatories: [mock_pub_key_hash(0), mock_pub_key_hash(1)],
    }

  oracle_validator.oracle_validator.spend(
    Some(mock_oracle_datum),
    redeemer,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test success_stop_app() {
  let redeemer = StopApp
  let tx =
    Transaction {
      ..placeholder,
      mint: from_asset(mock_policy_id(0), "", -1),
      extra_signatories: [mock_pub_key_hash(1)],
    }

  oracle_validator.oracle_validator.spend(
    Some(mock_oracle_datum),
    redeemer,
    mock_utxo_ref(0, 0),
    tx,
  )
}
