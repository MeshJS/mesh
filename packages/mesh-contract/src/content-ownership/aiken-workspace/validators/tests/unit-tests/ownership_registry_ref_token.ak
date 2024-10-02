use cardano/assets.{add, from_asset}
use cardano/transaction.{Transaction, placeholder}
use content_ownership/placeholder.{
  mock_oracle_address, mock_oracle_datum, mock_oracle_value,
  mock_ownership_registry_address, mock_ownership_registry_datum,
}
use content_ownership/types.{OracleDatum, RBurn, RMint}
use content_ownership/utils.{get_registry_token_name}
use mocktail.{
  add_mint, complete, mocktail_tx, tx_in, tx_in_inline_datum, tx_out,
  tx_out_inline_datum,
}
use mocktail/virgin_key_hash.{mock_policy_id}
use mocktail/virgin_output_reference.{mock_tx_hash}
use ownership_registry_ref_token

type TestCase {
  is_oracle_updated: Bool,
  is_registry_initialized: Bool,
  is_oracle_value_clean: Bool,
  is_registry_value_clean: Bool,
}

fn default_test_case() -> TestCase {
  TestCase {
    is_oracle_updated: True,
    is_registry_initialized: True,
    is_oracle_value_clean: True,
    is_registry_value_clean: True,
  }
}

fn make_mock_tx_body(record_count: Int, test_case: TestCase) -> Transaction {
  let registry_token_value =
    from_asset(mock_policy_id(2), get_registry_token_name(record_count), 1)
  let TestCase {
    is_oracle_updated,
    is_registry_initialized,
    is_oracle_value_clean,
    is_registry_value_clean,
  } = test_case
  let new_count =
    if is_oracle_updated {
      record_count + 1
    } else {
      record_count
    }
  let new_registry =
    if is_registry_initialized {
      mock_ownership_registry_datum(0, [])
    } else {
      mock_ownership_registry_datum(1, [])
    }
  let oracle_value =
    if is_oracle_value_clean {
      from_asset(mock_policy_id(0), "", 1) |> add(#"", #"", 2_000_000)
    } else {
      from_asset(mock_policy_id(0), "", 1)
        |> add(#"", #"", 2_000_000)
        |> add(mock_policy_id(1), "123", 1)
    }
  let registry_value =
    if is_registry_value_clean {
      registry_token_value |> add(#"", #"", 2_000_000)
    } else {
      registry_token_value
        |> add(#"", #"", 2_000_000)
        |> add(mock_policy_id(1), "123", 1)
    }

  mocktail_tx()
    |> tx_in(True, mock_tx_hash(0), 1, mock_oracle_value, mock_oracle_address)
    |> tx_in_inline_datum(True, mock_oracle_datum)
    |> tx_out(True, mock_oracle_address, oracle_value)
    |> tx_out_inline_datum(
        True,
        OracleDatum { ..mock_oracle_datum, ownership_registry_count: new_count },
      )
    |> tx_out(True, mock_ownership_registry_address, registry_value)
    |> tx_out_inline_datum(True, new_registry)
    |> complete()
    |> add_mint(True, registry_token_value)
}

test success_mint() {
  let redeemer = RMint
  let tx = make_mock_tx_body(0, default_test_case())
  ownership_registry_ref_token.ownership_registry_ref_token.mint(
    mock_policy_id(0),
    redeemer,
    mock_policy_id(2),
    tx,
  )
}

test fail_mint_without_update_oracle() {
  let redeemer = RMint
  let tx =
    make_mock_tx_body(
      0,
      TestCase { ..default_test_case(), is_oracle_updated: False },
    )
  !ownership_registry_ref_token.ownership_registry_ref_token.mint(
    mock_policy_id(0),
    redeemer,
    mock_policy_id(2),
    tx,
  )
}

test fail_mint_without_registry_initialized() {
  let redeemer = RMint
  let tx =
    make_mock_tx_body(
      0,
      TestCase { ..default_test_case(), is_registry_initialized: False },
    )
  !ownership_registry_ref_token.ownership_registry_ref_token.mint(
    mock_policy_id(0),
    redeemer,
    mock_policy_id(2),
    tx,
  )
}

test fail_mint_with_unclean_oracle_value() {
  let redeemer = RMint
  let tx =
    make_mock_tx_body(
      0,
      TestCase { ..default_test_case(), is_oracle_value_clean: False },
    )
  !ownership_registry_ref_token.ownership_registry_ref_token.mint(
    mock_policy_id(0),
    redeemer,
    mock_policy_id(2),
    tx,
  )
}

test fail_mint_with_unclean_registry_value() {
  let redeemer = RMint
  let tx =
    make_mock_tx_body(
      0,
      TestCase { ..default_test_case(), is_registry_value_clean: False },
    )
  !ownership_registry_ref_token.ownership_registry_ref_token.mint(
    mock_policy_id(0),
    redeemer,
    mock_policy_id(2),
    tx,
  )
}

test success_burn() {
  let redeemer = RBurn
  let policy_id = mock_policy_id(2)

  let tx = Transaction { ..placeholder, mint: from_asset(policy_id, "", -1) }
  ownership_registry_ref_token.ownership_registry_ref_token.mint(
    mock_policy_id(0),
    redeemer,
    mock_policy_id(2),
    tx,
  )
}

test success_burn_with_other_minting() {
  let redeemer = RBurn
  let policy_id = mock_policy_id(2)

  let tx =
    Transaction {
      ..placeholder,
      mint: from_asset(policy_id, "", -1) |> add(mock_policy_id(1), "", 1),
    }
  ownership_registry_ref_token.ownership_registry_ref_token.mint(
    mock_policy_id(0),
    redeemer,
    mock_policy_id(2),
    tx,
  )
}

test fail_burn_with_mint() {
  let redeemer = RBurn
  let policy_id = mock_policy_id(2)

  let tx = Transaction { ..placeholder, mint: from_asset(policy_id, "", 1) }
  !ownership_registry_ref_token.ownership_registry_ref_token.mint(
    mock_policy_id(0),
    redeemer,
    mock_policy_id(2),
    tx,
  )
}

test fail_burn_with_mix() {
  let redeemer = RBurn
  let policy_id = mock_policy_id(2)

  let tx =
    Transaction {
      ..placeholder,
      mint: from_asset(policy_id, "", -1) |> add(policy_id, "1", 1),
    }
  !ownership_registry_ref_token.ownership_registry_ref_token.mint(
    mock_policy_id(0),
    redeemer,
    mock_policy_id(2),
    tx,
  )
}
