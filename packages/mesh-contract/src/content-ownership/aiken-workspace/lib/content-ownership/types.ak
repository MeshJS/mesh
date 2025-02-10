use cardano/address.{Address}
use cardano/assets.{PolicyId}

pub type MintPolarity {
  RMint
  RBurn
}

pub type OracleDatum {
  oracle_nft: PolicyId,
  oracle_address: Address,
  content_registry_ref_token: PolicyId,
  content_registry_address: Address,
  content_registry_count: Int,
  ownership_registry_ref_token: PolicyId,
  ownership_registry_address: Address,
  ownership_registry_count: Int,
  operation_key: ByteArray,
  stop_key: ByteArray,
}

pub type OracleRedeemer {
  CreateContentRegistry
  CreateOwnershipRegistry
  RotateKey { new_operation_key: ByteArray, new_stop_key: ByteArray }
  StopApp
}

pub type ContentRegistryDatum {
  count: Int,
  registry: List<ByteArray>,
}

pub type ContentRegistryRedeemer {
  CreateContent { content_hash: ByteArray, owner: List<ByteArray> }
  UpdateContent { new_content_hash: ByteArray, content_number: Int }
  StopContentRegistry
}

pub type OwnershipRegistryDatum {
  count: Int,
  registry: List<List<ByteArray>>,
}

pub type OwnershipRegistryRedeemer {
  CreateOwnershipRecord
  TransferOwnership { new_owner_token: List<ByteArray>, content_number: Int }
  StopOwnershipRegistry
}
