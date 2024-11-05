use aiken/collection/list
use cardano/assets.{add, from_asset, from_lovelace, negate, zero}
use cardano/transaction.{Input, Output, Spend, Transaction, placeholder}
use content_ownership/placeholder.{
  mock_content_registry_address, mock_oracle_address, mock_oracle_datum,
  mock_oracle_output, mock_oracle_value, mock_ownership_registry_address,
  mock_ownership_registry_output,
}
use content_ownership/types.{
  ContentRegistryDatum, CreateContent, CreateOwnershipRecord,
  OwnershipRegistryDatum, StopContentRegistry, StopOwnershipRegistry,
  TransferOwnership,
}
use content_ownership/utils.{get_registry_token_name}
use mocktail.{
  add_redeemer, complete, mocktail_tx, ref_tx_in, ref_tx_in_inline_datum, tx_in,
  tx_in_inline_datum, tx_out, tx_out_inline_datum,
}
use mocktail/virgin_address.{mock_pub_key_address}
use mocktail/virgin_key_hash.{mock_policy_id}
use mocktail/virgin_output_reference.{mock_tx_hash, mock_utxo_ref}
use mocktail/virgin_outputs.{mock_pub_key_output}
use ownership_registry.{update_ownership_registry_at}

type CreateTestCase {
  has_input_from_content_registry: Bool,
  is_content_registry_redeemer_correct: Bool,
}

fn make_mock_tx_body_for_create(
  record_count: Int,
  content_registry: List<ByteArray>,
  ownership_registry: List<List<ByteArray>>,
  content_hash: ByteArray,
  owner: List<ByteArray>,
  test_case: CreateTestCase,
) -> Transaction {
  let content_registry_value =
    from_asset(mock_policy_id(1), get_registry_token_name(0), 1)
      |> add(#"", #"", 2_000_000)

  let ownership_registry_value =
    from_asset(mock_policy_id(2), get_registry_token_name(0), 1)
      |> add(#"", #"", 2_000_000)
  let content_redeemer: Data =
    if test_case.is_content_registry_redeemer_correct {
      CreateContent { content_hash, owner }
    } else {
      StopContentRegistry
    }
  let ownership_redeemer: Data = CreateOwnershipRecord

  mocktail_tx()
    |> ref_tx_in(True, mock_tx_hash(0), 0, mock_oracle_value, mock_oracle_address)
    |> ref_tx_in_inline_datum(True, mock_oracle_datum)
    |> tx_in(
        test_case.has_input_from_content_registry,
        mock_tx_hash(0),
        1,
        content_registry_value,
        mock_content_registry_address,
      )
    |> tx_in_inline_datum(
        test_case.has_input_from_content_registry,
        ContentRegistryDatum { count: record_count, registry: content_registry },
      )
    |> tx_out(
        test_case.has_input_from_content_registry,
        mock_content_registry_address,
        content_registry_value,
      )
    |> tx_out_inline_datum(
        test_case.has_input_from_content_registry,
        ContentRegistryDatum {
          count: record_count + 1,
          registry: list.concat(content_registry, [content_hash]),
        },
      )
    |> tx_in(
        True,
        mock_tx_hash(0),
        2,
        ownership_registry_value,
        mock_ownership_registry_address,
      )
    |> tx_in_inline_datum(
        True,
        OwnershipRegistryDatum {
          count: record_count,
          registry: ownership_registry,
        },
      )
    |> tx_out(True, mock_ownership_registry_address, ownership_registry_value)
    |> tx_out_inline_datum(
        True,
        OwnershipRegistryDatum {
          count: record_count + 1,
          registry: list.concat(ownership_registry, [owner]),
        },
      )
    |> complete()
    |> add_redeemer(True, Pair(Spend(mock_utxo_ref(0, 2)), ownership_redeemer))
    |> add_redeemer(
        test_case.has_input_from_content_registry,
        Pair(Spend(mock_utxo_ref(0, 1)), content_redeemer),
      )
  // Transaction {
  //   ..placeholder,
  //   inputs: inputs,
  //   outputs: outputs,
  // }
}

fn create_base_case(test_case: CreateTestCase) {
  let redeemer = CreateOwnershipRecord
  let dat = Some(OwnershipRegistryDatum { count: 0, registry: [] })
  let content_hash =
    #"5260e5bd0791d38438b891514d6158b5306884e9b7f4ef4b6433c6943285776c"
  let owner = [mock_policy_id(3), "my_token_name"]
  let tx =
    make_mock_tx_body_for_create(0, [], [], content_hash, owner, test_case)
  ownership_registry.ownership_registry.spend(
    mock_policy_id(0),
    dat,
    redeemer,
    mock_utxo_ref(0, 2),
    tx,
  )
}

test success_create_ownership_record() {
  create_base_case(
    CreateTestCase {
      has_input_from_content_registry: True,
      is_content_registry_redeemer_correct: True,
    },
  )
}

test fail_create_ownership_record_without_content_input() {
  !create_base_case(
    CreateTestCase {
      has_input_from_content_registry: False,
      is_content_registry_redeemer_correct: True,
    },
  )
}

test fail_create_ownership_record_with_incorrect_redeemer() {
  !create_base_case(
    CreateTestCase {
      has_input_from_content_registry: True,
      is_content_registry_redeemer_correct: False,
    },
  )
}

type UpdateTestCase {
  is_original_owner_authorized: Bool,
  is_registry_updated: Bool,
  is_registry_value_clean: Bool,
}

fn make_mock_tx_body_for_update(
  record_count: Int,
  ownership_registry: List<List<ByteArray>>,
  original_owner: List<ByteArray>,
  new_owner: List<ByteArray>,
  test_case: UpdateTestCase,
) -> Transaction {
  let ownership_registry_value =
    from_asset(mock_policy_id(2), get_registry_token_name(0), 1)
      |> add(#"", #"", 2_000_000)
  expect [auth_token_policy,
    auth_token_name] =
    if test_case.is_original_owner_authorized {
      original_owner
    } else {
      new_owner
    }
  let original_owner_output =
    Output {
      ..mock_pub_key_output(
        mock_pub_key_address(0, None),
        from_lovelace(1000000),
      ),
      value: mock_pub_key_output(
        mock_pub_key_address(0, None),
        from_lovelace(1000000),
      ).value
        |> add(auth_token_policy, auth_token_name, 1)
        |> if test_case.is_registry_value_clean {
            add(_, #"", #"", 2_000_000)
          } else {
            add(_, mock_policy_id(3), "another_token", 1)
          },
    }
  let inputs =
    [
      Input {
        output_reference: mock_utxo_ref(0, 2),
        output: Output {
          ..mock_ownership_registry_output(
            0,
            OwnershipRegistryDatum {
              count: record_count,
              registry: ownership_registry,
            },
          ),
          value: ownership_registry_value,
        },
      },
      Input {
        output_reference: mock_utxo_ref(0, 3),
        output: original_owner_output,
      },
    ]

  let outputs =
    [
      Output {
        ..mock_ownership_registry_output(
          0,
          OwnershipRegistryDatum {
            count: record_count,
            registry: if test_case.is_registry_updated {
              update_ownership_registry_at(
                ownership_registry,
                record_count,
                new_owner,
              )
            } else {
              ownership_registry
            },
          },
        ),
        value: if test_case.is_registry_value_clean {
          ownership_registry_value
        } else {
          ownership_registry_value
            |> add(mock_policy_id(3), "another_token", 1)
        },
      },
      original_owner_output,
    ]

  Transaction {
    ..placeholder,
    reference_inputs: [
      Input {
        output_reference: mock_utxo_ref(0, 0),
        output: mock_oracle_output(mock_oracle_datum),
      },
    ],
    inputs: inputs,
    outputs: outputs,
  }
}

fn update_base_case(test_case: UpdateTestCase) {
  let current_registry =
    [
      [mock_policy_id(0), "my_token_name"],
      [mock_policy_id(0), "my_token_name"],
      [mock_policy_id(0), "my_token_name"],
      [mock_policy_id(0), "my_token_name"],
      [mock_policy_id(3), "my_token_name"],
      [mock_policy_id(0), "my_token_name"],
    ]
  let dat =
    Some(OwnershipRegistryDatum { count: 0, registry: current_registry })
  let original_owner = [mock_policy_id(3), "my_token_name"]
  let new_owner = [mock_policy_id(4), "my_another_token_name"]
  let tx =
    make_mock_tx_body_for_update(
      4,
      current_registry,
      original_owner,
      new_owner,
      test_case,
    )
  let redeemer =
    TransferOwnership { new_owner_token: new_owner, content_number: 4 }
  ownership_registry.ownership_registry.spend(
    mock_policy_id(0),
    dat,
    redeemer,
    mock_utxo_ref(0, 2),
    tx,
  )
}

test success_update_ownership_record() {
  update_base_case(
    UpdateTestCase {
      is_original_owner_authorized: True,
      is_registry_updated: True,
      is_registry_value_clean: True,
    },
  )
}

test fail_update_ownership_record_without_auth_token() {
  !update_base_case(
    UpdateTestCase {
      is_original_owner_authorized: False,
      is_registry_updated: True,
      is_registry_value_clean: True,
    },
  )
}

test fail_update_ownership_record_without_registry_update() {
  !update_base_case(
    UpdateTestCase {
      is_original_owner_authorized: True,
      is_registry_updated: False,
      is_registry_value_clean: True,
    },
  )
}

test fail_update_ownership_record_without_clean_registry_value() {
  !update_base_case(
    UpdateTestCase {
      is_original_owner_authorized: True,
      is_registry_updated: True,
      is_registry_value_clean: False,
    },
  )
}

type StopTestCase {
  is_stop_key_signed: Bool,
  is_ref_token_burned: Bool,
}

fn make_mock_tx_body_for_stop(test_case: StopTestCase) {
  let registry_token_value =
    from_asset(mock_policy_id(2), get_registry_token_name(0), 1)
  let mint =
    if test_case.is_ref_token_burned {
      negate(registry_token_value)
    } else {
      zero
    }

  Transaction {
    ..placeholder,
    reference_inputs: [
      Input {
        output_reference: mock_utxo_ref(0, 0),
        output: mock_oracle_output(mock_oracle_datum),
      },
    ],
    inputs: [
      Input {
        output_reference: mock_utxo_ref(0, 2),
        output: Output {
          ..mock_ownership_registry_output(
            0,
            OwnershipRegistryDatum { count: 0, registry: [] },
          ),
          value: registry_token_value |> add(#"", #"", 2_000_000),
        },
      },
    ],
    outputs: [
      Output {
        ..mock_pub_key_output(
          mock_pub_key_address(0, None),
          from_lovelace(1000000),
        ),
        value: if test_case.is_ref_token_burned {
          zero
        } else {
          registry_token_value
        }
          |> add(#"", #"", 2_000_000),
      },
    ],
    extra_signatories: [
      if test_case.is_stop_key_signed {
        mock_oracle_datum.stop_key
      } else {
        mock_oracle_datum.operation_key
      },
    ],
    mint: mint,
  }
}

fn stop_base_case(test_case: StopTestCase) {
  let current_registry = []
  let dat =
    Some(OwnershipRegistryDatum { count: 0, registry: current_registry })
  let tx = make_mock_tx_body_for_stop(test_case)
  let redeemer = StopOwnershipRegistry
  ownership_registry.ownership_registry.spend(
    mock_policy_id(0),
    dat,
    redeemer,
    mock_utxo_ref(0, 2),
    tx,
  )
}

test success_stop_registry() {
  stop_base_case(
    StopTestCase { is_stop_key_signed: True, is_ref_token_burned: True },
  )
}

test fail_stop_registry_without_stop_key() {
  !stop_base_case(
    StopTestCase { is_stop_key_signed: False, is_ref_token_burned: True },
  )
}

test fail_stop_registry_without_ref_token_burned() {
  !stop_base_case(
    StopTestCase { is_stop_key_signed: True, is_ref_token_burned: False },
  )
}
