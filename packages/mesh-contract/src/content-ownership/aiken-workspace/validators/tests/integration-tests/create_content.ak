use aiken/collection/list
use cardano/assets.{add, from_asset, zero}
use cardano/transaction.{Input, Spend, Transaction}
use content_ownership/placeholder.{
  mock_content_registry_address, mock_content_registry_datum, mock_oracle_datum,
  mock_oracle_output, mock_ownership_registry_address,
  mock_ownership_registry_datum,
}
use content_ownership/types.{
  ContentRegistryDatum, CreateContent, CreateOwnershipRecord,
  OwnershipRegistryDatum, StopContentRegistry,
}
use content_ownership/utils.{get_registry_token_name}
use content_registry
use mocktail.{
  add_redeemer, add_reference_input, complete, mocktail_tx, tx_in,
  tx_in_inline_datum, tx_out, tx_out_inline_datum,
}
use mocktail/virgin_key_hash.{mock_policy_id}
use mocktail/virgin_output_reference.{mock_tx_hash, mock_utxo_ref}
use ownership_registry

type TestCase {
  is_content_count_updated: Bool,
  is_ownership_count_updated: Bool,
  is_content_registry_updated: Bool,
  is_ownership_registry_updated: Bool,
  is_content_ref_respent: Bool,
  is_ownership_ref_respent: Bool,
  is_content_registry_value_clean: Bool,
  is_ownership_registry_value_clean: Bool,
  is_content_registry_redeemer_correct: Bool,
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
    is_content_registry_redeemer_correct: True,
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
    is_content_registry_redeemer_correct,
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

  let content_redeemer: Data =
    if is_content_registry_redeemer_correct {
      CreateContent { content_hash, owner }
    } else {
      StopContentRegistry
    }
  let ownership_redeemer: Data = CreateOwnershipRecord

  mocktail_tx()
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
    |> add_redeemer(True, Pair(Spend(mock_utxo_ref(0, 2)), ownership_redeemer))
    |> add_redeemer(True, Pair(Spend(mock_utxo_ref(0, 1)), content_redeemer))
    |> add_reference_input(
        True,
        Input {
          output_reference: mock_utxo_ref(0, 0),
          output: mock_oracle_output(mock_oracle_datum),
        },
      )
}

fn run_create_content_test(test_case: TestCase) -> Bool {
  let content_hash =
    #"5260e5bd0791d38438b891514d6158b5306884e9b7f4ef4b6433c6943285776c"
  let owner = [mock_policy_id(3), "my_token_name"]
  let transaction = make_mock_tx_body(0, [], [], content_hash, owner, test_case)
  let content_dat = Some(mock_content_registry_datum(0, []))
  let ownership_dat = Some(mock_ownership_registry_datum(0, []))
  ownership_registry.ownership_registry.spend(
    mock_policy_id(0),
    ownership_dat,
    CreateOwnershipRecord,
    mock_utxo_ref(0, 1),
    transaction,
  ) && content_registry.content_registry.spend(
    mock_policy_id(0),
    content_dat,
    CreateContent { content_hash, owner },
    mock_utxo_ref(0, 2),
    transaction,
  )
}

test success_create_content() {
  run_create_content_test(default_test_case())
}

test fail_create_content_content_count_not_updated() {
  let test_case =
    TestCase { ..default_test_case(), is_content_count_updated: False }
  !run_create_content_test(test_case)
}

test fail_create_content_ownership_count_not_updated() {
  let test_case =
    TestCase { ..default_test_case(), is_ownership_count_updated: False }
  !run_create_content_test(test_case)
}

test fail_create_content_content_registry_not_updated() {
  let test_case =
    TestCase { ..default_test_case(), is_content_registry_updated: False }
  !run_create_content_test(test_case)
}

test fail_create_content_ownership_registry_not_updated() {
  let test_case =
    TestCase { ..default_test_case(), is_ownership_registry_updated: False }
  !run_create_content_test(test_case)
}

test fail_create_content_content_ref_not_respent() {
  let test_case =
    TestCase { ..default_test_case(), is_content_ref_respent: False }
  !run_create_content_test(test_case)
}

test fail_create_content_ownership_ref_not_respent() {
  let test_case =
    TestCase { ..default_test_case(), is_ownership_ref_respent: False }
  !run_create_content_test(test_case)
}

test fail_create_content_content_registry_value_unclean() {
  let test_case =
    TestCase { ..default_test_case(), is_content_registry_value_clean: False }
  !run_create_content_test(test_case)
}

test fail_create_content_ownership_registry_value_unclean() {
  let test_case =
    TestCase { ..default_test_case(), is_ownership_registry_value_clean: False }
  !run_create_content_test(test_case)
}

test fail_create_content_record_with_incorrect_redeemer() {
  let test_case =
    TestCase {
      ..default_test_case(),
      is_content_registry_redeemer_correct: False,
    }
  !run_create_content_test(test_case)
}

fn create_preloaded_content_registry(
  registry: List<ByteArray>,
  curr: Int,
  size: Int,
) -> List<ByteArray> {
  let content_hash =
    #"5260e5bd0791d38438b891514d6158b5306884e9b7f4ef4b6433c6943285776c"
  let new_registry = list.concat(registry, [content_hash])
  if curr == size {
    new_registry
  } else {
    create_preloaded_content_registry(new_registry, curr + 1, size)
  }
}

// fn mock_content_registry_datum_at_scale(size: Int) -> ContentRegistryDatum {
//   let registry = create_preloaded_content_registry([], 0, size)
//   ContentRegistryDatum { count: size, registry }
// }

fn create_preloaded_ownership_registry(
  registry: List<List<ByteArray>>,
  curr: Int,
  size: Int,
) -> List<List<ByteArray>> {
  let owner = [mock_policy_id(3), "my_token_name"]
  let new_registry = list.concat(registry, [owner])
  if curr == size {
    new_registry
  } else {
    create_preloaded_ownership_registry(new_registry, curr + 1, size)
  }
}

// fn mock_ownership_registry_datum_at_scale(size: Int) -> OwnershipRegistryDatum {
//   let registry = create_preloaded_ownership_registry([], 0, size)
//   OwnershipRegistryDatum { count: size, registry }
// }

fn run_create_content_at_scale_test(test_case: TestCase) -> Bool {
  let content_hash =
    #"5260e5bd0791d38438b891514d6158b5306884e9b7f4ef4b6433c6943285776c"
  let owner = [mock_policy_id(3), "my_token_name"]
  let content_registry = create_preloaded_content_registry([], 0, 50)
  let ownership_registry = create_preloaded_ownership_registry([], 0, 50)
  let transaction =
    make_mock_tx_body(
      0,
      content_registry,
      ownership_registry,
      content_hash,
      owner,
      test_case,
    )
  let content_dat = Some(mock_content_registry_datum(0, []))
  let ownership_dat = Some(mock_ownership_registry_datum(0, []))
  ownership_registry.ownership_registry.spend(
    mock_policy_id(0),
    ownership_dat,
    CreateOwnershipRecord,
    mock_utxo_ref(0, 1),
    transaction,
  ) && content_registry.content_registry.spend(
    mock_policy_id(0),
    content_dat,
    CreateContent { content_hash, owner },
    mock_utxo_ref(0, 2),
    transaction,
  )
}

test success_create_content_at_scale() {
  run_create_content_at_scale_test(default_test_case())
}
