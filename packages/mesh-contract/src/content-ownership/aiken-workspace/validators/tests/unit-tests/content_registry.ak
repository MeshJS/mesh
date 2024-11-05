use aiken/collection/list
use cardano/assets.{add, from_asset, from_lovelace, zero}
use cardano/transaction.{Input, Output, Transaction, placeholder}
use content_ownership/placeholder.{
  mock_content_registry_address, mock_content_registry_datum,
  mock_content_registry_output, mock_oracle_address, mock_oracle_datum,
  mock_oracle_output, mock_oracle_value, mock_ownership_registry_address,
  mock_ownership_registry_output,
}
use content_ownership/types.{
  ContentRegistryDatum, CreateContent, OwnershipRegistryDatum,
  StopContentRegistry, UpdateContent,
}
use content_ownership/utils.{get_registry_token_name}
use content_registry.{update_content_registry_at}
use mocktail.{
  complete, mint, mocktail_tx, ref_tx_in, ref_tx_in_inline_datum,
  required_signer_hash, tx_in, tx_in_inline_datum, tx_out, tx_out_inline_datum,
}
use mocktail/virgin_address.{mock_pub_key_address}
use mocktail/virgin_key_hash.{mock_policy_id}
use mocktail/virgin_output_reference.{mock_tx_hash, mock_utxo_ref}
use mocktail/virgin_outputs.{mock_pub_key_output}

type TestCase {
  is_content_count_updated: Bool,
  is_ownership_count_updated: Bool,
  is_content_registry_updated: Bool,
  is_ownership_registry_updated: Bool,
  is_content_ref_respent: Bool,
  is_ownership_ref_respent: Bool,
  is_content_registry_value_clean: Bool,
  is_ownership_registry_value_clean: Bool,
}

fn default_test_case() -> TestCase {
  TestCase {
    is_content_count_updated: True,
    is_ownership_count_updated: True,
    is_content_registry_updated: True,
    is_ownership_registry_updated: True,
    is_content_ref_respent: True,
    is_ownership_ref_respent: True,
    is_content_registry_value_clean: True,
    is_ownership_registry_value_clean: True,
  }
}

fn make_mock_tx_body(
  record_count: Int,
  content_registry: List<ByteArray>,
  ownership_registry: List<List<ByteArray>>,
  content_hash: ByteArray,
  owner: List<ByteArray>,
  test_case: TestCase,
) -> Transaction {
  let TestCase {
    is_content_count_updated,
    is_ownership_count_updated,
    is_content_registry_updated,
    is_ownership_registry_updated,
    is_content_ref_respent,
    is_ownership_ref_respent,
    is_content_registry_value_clean,
    is_ownership_registry_value_clean,
  } = test_case
  let new_content_count =
    if is_content_count_updated {
      record_count + 1
    } else {
      record_count
    }
  let new_ownership_count =
    if is_ownership_count_updated {
      record_count + 1
    } else {
      record_count
    }
  let new_content_registry =
    if is_content_registry_updated {
      list.concat(content_registry, [content_hash])
    } else {
      content_registry
    }
  let new_ownership_registry =
    if is_ownership_registry_updated {
      list.concat(ownership_registry, [owner])
    } else {
      ownership_registry
    }
  let content_registry_value =
    when (is_content_ref_respent, is_content_registry_value_clean) is {
      (True, True) ->
        from_asset(mock_policy_id(1), get_registry_token_name(0), 1)
      (True, False) ->
        from_asset(mock_policy_id(1), get_registry_token_name(0), 1)
          |> add(mock_policy_id(2), "123", 1)
      (False, True) -> zero
      (False, False) -> from_asset(mock_policy_id(2), "123", 1)
    }
      |> add(#"", #"", 2_000_000)

  let ownership_registry_value =
    when (is_ownership_ref_respent, is_ownership_registry_value_clean) is {
      (True, True) ->
        from_asset(mock_policy_id(2), get_registry_token_name(0), 1)
      (True, False) ->
        from_asset(mock_policy_id(2), get_registry_token_name(0), 1)
          |> add(mock_policy_id(1), "123", 1)
      (False, True) -> zero
      (False, False) -> from_asset(mock_policy_id(1), "123", 1)
    }
      |> add(#"", #"", 2_000_000)

  mocktail_tx()
    |> ref_tx_in(True, mock_tx_hash(0), 0, mock_oracle_value, mock_oracle_address)
    |> ref_tx_in_inline_datum(True, mock_oracle_datum)
    |> tx_in(
        True,
        mock_tx_hash(0),
        1,
        content_registry_value,
        mock_content_registry_address,
      )
    |> tx_in_inline_datum(
        True,
        ContentRegistryDatum { count: record_count, registry: content_registry },
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
    |> tx_out(True, mock_content_registry_address, content_registry_value)
    |> tx_out_inline_datum(
        True,
        ContentRegistryDatum {
          count: new_content_count,
          registry: new_content_registry,
        },
      )
    |> tx_out(True, mock_ownership_registry_address, ownership_registry_value)
    |> tx_out_inline_datum(
        True,
        OwnershipRegistryDatum {
          count: new_ownership_count,
          registry: new_ownership_registry,
        },
      )
    |> complete()
}

fn run_content_registry_test(test_case: TestCase) -> Bool {
  let content_hash =
    #"5260e5bd0791d38438b891514d6158b5306884e9b7f4ef4b6433c6943285776c"
  let owner = [mock_policy_id(3), "my_token_name"]
  let transaction = make_mock_tx_body(0, [], [], content_hash, owner, test_case)
  let dat = Some(mock_content_registry_datum(0, []))
  content_registry.content_registry.spend(
    mock_policy_id(0),
    dat,
    CreateContent { content_hash, owner },
    mock_utxo_ref(0, 1),
    transaction,
  )
}

test success_create_content() {
  run_content_registry_test(default_test_case())
}

test fail_create_content_content_count_not_updated() {
  let test_case =
    TestCase { ..default_test_case(), is_content_count_updated: False }
  !run_content_registry_test(test_case)
}

test fail_create_content_ownership_count_not_updated() {
  let test_case =
    TestCase { ..default_test_case(), is_ownership_count_updated: False }
  !run_content_registry_test(test_case)
}

test fail_create_content_content_registry_not_updated() {
  let test_case =
    TestCase { ..default_test_case(), is_content_registry_updated: False }
  !run_content_registry_test(test_case)
}

test fail_create_content_ownership_registry_not_updated() {
  let test_case =
    TestCase { ..default_test_case(), is_ownership_registry_updated: False }
  !run_content_registry_test(test_case)
}

test fail_create_content_content_ref_not_respent() {
  let test_case =
    TestCase { ..default_test_case(), is_content_ref_respent: False }
  !run_content_registry_test(test_case)
}

test fail_create_content_ownership_ref_not_respent() {
  let test_case =
    TestCase { ..default_test_case(), is_ownership_ref_respent: False }
  !run_content_registry_test(test_case)
}

test fail_create_content_content_registry_value_unclean() {
  let test_case =
    TestCase { ..default_test_case(), is_content_registry_value_clean: False }
  !run_content_registry_test(test_case)
}

test fail_create_content_ownership_registry_value_unclean() {
  let test_case =
    TestCase { ..default_test_case(), is_ownership_registry_value_clean: False }
  !run_content_registry_test(test_case)
}

type UpdateTestCase {
  is_registry_updated: Bool,
  is_update_authorized: Bool,
  is_registry_value_clean: Bool,
}

fn make_mock_tx_body_for_update(
  record_count: Int,
  content_registry: List<ByteArray>,
  ownership_registry: List<List<ByteArray>>,
  owner: List<ByteArray>,
  new_content_hash: ByteArray,
  test_case: UpdateTestCase,
) -> Transaction {
  let content_registry_value =
    from_asset(mock_policy_id(1), get_registry_token_name(0), 1)
      |> add(#"", #"", 2_000_000)
  expect [auth_token_policy,
    auth_token_name] =
    if test_case.is_update_authorized {
      owner
    } else {
      expect [policy, ..] = owner
      [policy, "wrong_token"]
    }
  let owner_output =
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
        output_reference: mock_utxo_ref(0, 1),
        output: Output {
          ..mock_content_registry_output(
            0,
            ContentRegistryDatum { count: 6, registry: content_registry },
          ),
          value: content_registry_value,
        },
      },
      Input { output_reference: mock_utxo_ref(0, 3), output: owner_output },
    ]

  let outputs =
    [
      Output {
        ..mock_content_registry_output(
          0,
          ContentRegistryDatum {
            count: 6,
            registry: if test_case.is_registry_updated {
              update_content_registry_at(
                content_registry,
                record_count,
                new_content_hash,
              )
            } else {
              content_registry
            },
          },
        ),
        value: if test_case.is_registry_value_clean {
          content_registry_value
        } else {
          content_registry_value
            |> add(mock_policy_id(3), "another_token", 1)
        },
      },
      owner_output,
    ]

  Transaction {
    ..placeholder,
    reference_inputs: [
      Input {
        output_reference: mock_utxo_ref(0, 0),
        output: mock_oracle_output(mock_oracle_datum),
      },
      Input {
        output_reference: mock_utxo_ref(0, 2),
        output: Output {
          ..mock_ownership_registry_output(
            0,
            OwnershipRegistryDatum { count: 6, registry: ownership_registry },
          ),
          value: from_asset(mock_policy_id(2), get_registry_token_name(0), 1),
        },
      },
    ],
    inputs: inputs,
    outputs: outputs,
  }
}

fn update_base_case(test_case: UpdateTestCase) {
  let content_hash =
    #"5260e5bd0791d38438b891514d6158b5306884e9b7f4ef4b6433c6943285776c"
  let new_content_hash = "QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCWkSU"
  let current_registry =
    [
      content_hash, content_hash, content_hash, content_hash, content_hash,
      content_hash,
    ]

  let owner = [mock_policy_id(3), "my_token_name"]
  let ownership_registry = [owner, owner, owner, owner, owner, owner]
  let dat = Some(ContentRegistryDatum { count: 0, registry: current_registry })
  let tx =
    make_mock_tx_body_for_update(
      4,
      current_registry,
      ownership_registry,
      owner,
      new_content_hash,
      test_case,
    )
  let redeemer = UpdateContent { new_content_hash, content_number: 4 }
  content_registry.content_registry.spend(
    mock_policy_id(0),
    dat,
    redeemer,
    mock_utxo_ref(0, 2),
    tx,
  )
}

test success_update_content_record() {
  update_base_case(
    UpdateTestCase {
      is_registry_updated: True,
      is_update_authorized: True,
      is_registry_value_clean: True,
    },
  )
}

test fail_update_content_record_without_auth_token() {
  !update_base_case(
    UpdateTestCase {
      is_registry_updated: False,
      is_update_authorized: True,
      is_registry_value_clean: True,
    },
  )
}

test fail_update_content_record_without_registry_update() {
  !update_base_case(
    UpdateTestCase {
      is_registry_updated: True,
      is_update_authorized: False,
      is_registry_value_clean: True,
    },
  )
}

test fail_update_content_record_without_clean_registry_value() {
  !update_base_case(
    UpdateTestCase {
      is_registry_updated: True,
      is_update_authorized: True,
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
    from_asset(mock_policy_id(1), get_registry_token_name(0), 1)

  mocktail_tx()
    |> mint(
        test_case.is_ref_token_burned,
        -1,
        mock_policy_id(1),
        get_registry_token_name(0),
      )
    |> ref_tx_in(True, mock_tx_hash(0), 0, mock_oracle_value, mock_oracle_address)
    |> ref_tx_in_inline_datum(True, mock_oracle_datum)
    |> tx_in(
        True,
        mock_tx_hash(0),
        1,
        registry_token_value |> add(#"", #"", 2_000_000),
        mock_content_registry_address,
      )
    |> tx_in_inline_datum(True, ContentRegistryDatum { count: 0, registry: [] })
    |> tx_out(
        test_case.is_ref_token_burned,
        mock_pub_key_address(0, None),
        from_lovelace(2_000_000),
      )
    |> tx_out(
        !test_case.is_ref_token_burned,
        mock_pub_key_address(0, None),
        registry_token_value |> add(#"", #"", 2_000_000),
      )
    |> required_signer_hash(
        test_case.is_stop_key_signed,
        mock_oracle_datum.stop_key,
      )
    |> complete()
}

fn stop_base_case(test_case: StopTestCase) {
  let current_registry = []
  let dat = Some(ContentRegistryDatum { count: 0, registry: current_registry })
  let tx = make_mock_tx_body_for_stop(test_case)
  let redeemer = StopContentRegistry
  content_registry.content_registry.spend(
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
