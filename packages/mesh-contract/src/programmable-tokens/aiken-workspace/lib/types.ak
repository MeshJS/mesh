// Core data types for CIP-0143 programmable tokens
// Migrated from SmartTokens.Types.PTokenDirectory and SmartTokens.Types.ProtocolParams

use cardano/address.{Credential, VerificationKey}
use cardano/assets.{PolicyId}

/// Constants for token names
pub const origin_node_tn = #""

/// Protocol parameters NFT token name
pub const protocol_params_token = "ProtocolParams"

/// Empty Verification Key
pub const empty_vkey = VerificationKey(#"")

/// Token name for the issuance CBOR hex reference NFT
pub const issuance_cbor_hex_token_name = "IssuanceCborHex"

/// Registry node in the linked list of registered programmable token policies
/// This represents an entry in the CIP-0143 registry
pub type RegistryNode {
  /// The key (currency symbol) of the programmable token policy
  key: ByteArray,
  /// The next key in lexicographical order (for linked list traversal)
  next: ByteArray,
  /// The transfer logic script credential that validates token transfers
  transfer_logic_script: Credential,
  /// The third party transfer logic script credential that handles admin actions (seizure, etc.)
  third_party_transfer_logic_script: Credential,
  /// Optional global state NFT currency symbol for this policy
  global_state_cs: ByteArray,
}

/// Blacklist node in the linked list of sanctioned addresses
/// Used for freeze-and-seize functionality
pub type BlacklistNode {
  /// The key (credential hash) of the blacklisted address
  key: ByteArray,
  /// The next key in lexicographical order
  next: ByteArray,
}

/// Protocol parameters stored on-chain
/// This is referenced by all programmable token transactions
pub type ProgrammableLogicGlobalParams {
  /// Currency symbol of the registry node NFTs
  registry_node_cs: PolicyId,
  /// The programmable logic base credential (payment credential for all programmable token UTxOs)
  prog_logic_cred: Credential,
}

/// Proof that a token is (or is not) in the registry
pub type RegistryProof {
  /// Token exists in the registry at this reference input index
  TokenExists { node_idx: Int }
  /// Token does not exist (proof via covering node at this index)
  TokenDoesNotExist { node_idx: Int }
}

/// Proof of blacklist membership or non-membership
pub type BlacklistProof {
  /// Proof of non-membership via covering node
  NonmembershipProof { node_idx: Int }
}

/// Redeemer for the global programmable logic stake validator
pub type ProgrammableLogicGlobalRedeemer {
  /// Transfer action with proofs for each token type
  TransferAct { proofs: List<RegistryProof> }
  /// Third party action for admin operations (seizure, freeze, etc.)
  /// Supports multiple UTxOs in a single transaction
  ThirdPartyAct {
    /// Index of the registry node in reference inputs
    registry_node_idx: Int,
    /// List of input indices to process (supports multi-UTxO operations)
    input_idxs: List<Int>,
    /// Starting index in outputs where processed outputs begin
    outputs_start_idx: Int,
    /// Length of input_idxs list (for validation)
    length_input_idxs: Int,
  }
}

/// Action for the minting policy
pub type SmartTokenMintingAction {
  /// The credential of the minting logic script that must be invoked
  minting_logic_cred: Credential,
}

/// Redeemer for registry minting policy (linked list operations)
pub type RegistryRedeemer {
  /// Initialize the registry with the origin node
  RegistryInit
  /// Insert a new programmable token policy into the registry
  RegistryInsert { key: ByteArray, hashed_param: ByteArray }
}

/// Redeemer for blacklist minting policy (linked list operations)
pub type BlacklistRedeemer {
  /// Initialize the blacklist with the origin node
  BlacklistInit
  /// Insert a credential into the blacklist
  BlacklistInsert { key: ByteArray }
  /// Remove a credential from the blacklist
  BlacklistRemove { key: ByteArray }
}

/// Issuance CBOR hex reference data
/// This contains the prefix and postfix of the minting policy script
/// Used to validate programmable token registrations
pub type IssuanceCborHex {
  /// Prefix bytes of the minting policy script
  prefix_cbor_hex: ByteArray,
  /// Postfix bytes of the minting policy script
  postfix_cbor_hex: ByteArray,
}
