use cardano/assets.{Value, add, from_asset}
use cardano/transaction.{InlineDatum, Output}
use content_ownership/types.{
  ContentRegistryDatum, OracleDatum, OwnershipRegistryDatum,
}
use content_ownership/utils.{get_registry_token_name}
use mocktail/virgin_address.{mock_script_address}
use mocktail/virgin_key_hash.{mock_policy_id, mock_pub_key_hash}

// Smart contract specific placeholders

pub const mock_oracle_address = mock_script_address(0, None)

pub const mock_content_registry_address = mock_script_address(1, None)

pub const mock_ownership_registry_address = mock_script_address(2, None)

pub const mock_oracle_datum =
  OracleDatum {
    oracle_nft: mock_policy_id(0),
    oracle_address: mock_oracle_address,
    content_registry_ref_token: mock_policy_id(1),
    content_registry_address: mock_content_registry_address,
    ownership_registry_ref_token: mock_policy_id(2),
    ownership_registry_address: mock_ownership_registry_address,
    content_registry_count: 0,
    ownership_registry_count: 0,
    operation_key: mock_pub_key_hash(0),
    stop_key: mock_pub_key_hash(1),
  }

pub const mock_oracle_value =
  from_asset(mock_policy_id(0), "", 1) |> add(#"", #"", 2_000_000)

pub fn mock_oracle_output(oracle_datum: OracleDatum) -> Output {
  Output {
    address: mock_oracle_address,
    value: mock_oracle_value,
    datum: InlineDatum(oracle_datum),
    reference_script: None,
  }
}

pub fn mock_content_registry_datum(
  count: Int,
  registry: List<ByteArray>,
) -> ContentRegistryDatum {
  ContentRegistryDatum { count, registry }
}

pub fn mock_content_registry_value(registry_count: Int) -> Value {
  from_asset(mock_policy_id(1), get_registry_token_name(registry_count), 1)
    |> add(#"", #"", 2_000_000)
}

pub fn mock_content_registry_output(
  registry_count: Int,
  registry_datum: ContentRegistryDatum,
) -> Output {
  Output {
    address: mock_content_registry_address,
    value: mock_content_registry_value(registry_count),
    datum: InlineDatum(registry_datum),
    reference_script: None,
  }
}

pub fn mock_ownership_registry_datum(
  count: Int,
  registry: List<List<ByteArray>>,
) -> OwnershipRegistryDatum {
  OwnershipRegistryDatum { count, registry }
}

pub fn mock_ownership_registry_output(
  registry_count: Int,
  registry_datum: OwnershipRegistryDatum,
) -> Output {
  Output {
    address: mock_ownership_registry_address,
    value: from_asset(
      mock_policy_id(2),
      get_registry_token_name(registry_count),
      1,
    )
      |> add(#"", #"", 2_000_000),
    datum: InlineDatum(registry_datum),
    reference_script: None,
  }
}
