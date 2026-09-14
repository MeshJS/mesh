/**
 * A backend-agnostic, fully-resolved representation of a Cardano transaction — post
 * coin-selection, post witness collection — sitting between a transaction builder's own state and
 * CBOR. Root type: `TransactionPrototype`. It lives in `mesh-common` rather than in a serializer
 * package because `mesh-core-cst` and `mesh-core-csl` are two backends behind one
 * `IMeshTxSerializer` interface and both need the same shape; this file has no runtime imports,
 * so it adds no dependency edge.
 *
 * Field names are snake_case verbatim (not camelCased). Serializer backends may hand this shape
 * straight to a native library as JSON, matching on these exact names, so renaming a field is a
 * wire-breaking change rather than a cosmetic one.
 *
 * NUMERIC RANGES: the Conway CDDL (IntersectMBO/cardano-ledger,
 * `eras/conway/impl/cddl/data/conway.cddl`) is the sole authority for these types — no serializer
 * backend's own field widths get a vote. Fields whose CDDL range exceeds
 * `Number.MAX_SAFE_INTEGER` (2^53-1) are `bigint` — deliberately NOT `number | bigint`, so a
 * plain numeric literal is a compile error rather than a silent precision loss at the top of
 * the range. Everything left as plain `number` has a CDDL bound of `uint .size 2`/`uint .size 4`
 * (or is a 0..255 byte) and cannot overflow.
 *
 * Where a backend's own types turn out narrower than the CDDL, that is a bug in that backend, not
 * a reason to narrow these types.
 *
 * One live caveat: `JSON.stringify` THROWS on `bigint`, so a backend serializing this to JSON
 * needs `json-bigint` or equivalent; `mesh-core-csl` already does.
 */

export type AddressPrototype = string;
export type URLPrototype = string;

export interface AnchorPrototype {
  anchor_data_hash: string;
  anchor_url: URLPrototype;
}
export type AnchorDataHashPrototype = string;
export type AssetNamePrototype = string;
export type AssetNamesPrototype = string[];
export interface AssetsPrototype {
  [k: string]: string;
}
export type NativeScriptPrototype =
  | { type: "SCRIPT_PUBKEY"; value: ScriptPubkeyPrototype }
  | { type: "SCRIPT_ALL"; value: ScriptAllPrototype }
  | { type: "SCRIPT_ANY"; value: ScriptAnyPrototype }
  | { type: "SCRIPT_N_OF_K"; value: ScriptNOfKPrototype }
  | { type: "TIMELOCK_START"; value: TimelockStartPrototype }
  | { type: "TIMELOCK_EXPIRY"; value: TimelockExpiryPrototype };

export interface AuxiliaryDataPrototype {
  /** CDDL `auxiliary_data_map` key 0. */
  metadata?: TxMetadataPrototype | null;
  /** CDDL `auxiliary_data_map` key 1. */
  native_scripts?: NativeScriptPrototype[] | null;
  /**
   * CDDL `auxiliary_data_map` keys 2 / 3 / 4 are three SEPARATE fields
   * (`? 2 : [* plutus_v1_script]`, `? 3 : [* plutus_v2_script]`, `? 4 : [* plutus_v3_script]`),
   * for the same reason as the witness set: the key is what records the language version.
   */
  plutus_v1_scripts?: string[] | null;
  plutus_v2_scripts?: string[] | null;
  plutus_v3_scripts?: string[] | null;
  /**
   * NOT HONOURED by the `mesh-core-cst` converters. The CDDL offers three auxiliary-data
   * encodings (`metadata / auxiliary_data_array / auxiliary_data_map`) and this flag picks
   * between the Shelley and Alonzo (`#6.259`-tagged map) forms, but `@cardano-sdk/core`'s
   * `AuxiliaryData` exposes no format setter — it decides internally from the content — so the
   * encoder cannot act on this and the decoder always reports `true`. Retained because it is a
   * required field of the wire shape backends expect.
   */
  prefer_alonzo_format: boolean;
}
export interface ScriptPubkeyPrototype {
  addr_keyhash: string;
}
export interface ScriptAllPrototype {
  native_scripts: NativeScriptPrototype[];
}
export interface ScriptAnyPrototype {
  native_scripts: NativeScriptPrototype[];
}
export interface ScriptNOfKPrototype {
  /** CDDL: `script_n_of_k = (3, n : int64, [* native_script])` — `int64`, not a bounded uint,
   * so the full ±9.22e18 range is legal, negatives included. */
  n: bigint;
  native_scripts: NativeScriptPrototype[];
}
export interface TimelockStartPrototype {
  slot: string;
}
export interface TimelockExpiryPrototype {
  slot: string;
}
export type AuxiliaryDataHashPrototype = string;
export interface AuxiliaryDataSetPrototype {
  [k: string]: AuxiliaryDataPrototype;
}
export type BigIntPrototype = string;
export type BigNumPrototype = string;
export type VkeyPrototype = string;
export type CertificatePrototype =
  | { type: "STAKE_REGISTRATION"; value: StakeRegistrationPrototype }
  | { type: "STAKE_DEREGISTRATION"; value: StakeDeregistrationPrototype }
  | { type: "STAKE_DELEGATION"; value: StakeDelegationPrototype }
  | { type: "POOL_REGISTRATION"; value: PoolRegistrationPrototype }
  | { type: "POOL_RETIREMENT"; value: PoolRetirementPrototype }
  | { type: "COMMITTEE_HOT_AUTH"; value: CommitteeHotAuthPrototype }
  | { type: "COMMITTEE_COLD_RESIGN"; value: CommitteeColdResignPrototype }
  | { type: "DREP_DEREGISTRATION"; value: DRepDeregistrationPrototype }
  | { type: "DREP_REGISTRATION"; value: DRepRegistrationPrototype }
  | { type: "DREP_UPDATE"; value: DRepUpdatePrototype }
  | { type: "STAKE_AND_VOTE_DELEGATION"; value: StakeAndVoteDelegationPrototype }
  | {
      type: "STAKE_REGISTRATION_AND_DELEGATION";
      value: StakeRegistrationAndDelegationPrototype;
    }
  | {
      type: "STAKE_VOTE_REGISTRATION_AND_DELEGATION";
      value: StakeVoteRegistrationAndDelegationPrototype;
    }
  | { type: "VOTE_DELEGATION"; value: VoteDelegationPrototype }
  | {
      type: "VOTE_REGISTRATION_AND_DELEGATION";
      value: VoteRegistrationAndDelegationPrototype;
    };
export type CredTypePrototype =
  | { type: "SCRIPT"; value: string }
  | { type: "KEY"; value: string };
export type RelayPrototype =
  | { type: "SINGLE_HOST_ADDR"; value: SingleHostAddrPrototype }
  | { type: "SINGLE_HOST_NAME"; value: SingleHostNamePrototype }
  | { type: "MULTI_HOST_NAME"; value: MultiHostNamePrototype };
/**
 * @minItems 4
 * @maxItems 4
 */
export type Ipv4Prototype = [number, number, number, number];
/**
 * @minItems 16
 * @maxItems 16
 */
export type Ipv6Prototype = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];
export type DNSRecordAorAAAAPrototype = string;
export type DNSRecordSRVPrototype = string;
export type RelaysPrototype = RelayPrototype[];
export type DRepPrototype =
  | { type: "ALWAYS_ABSTAIN" }
  | { type: "ALWAYS_NO_CONFIDENCE" }
  | { type: "KEY_HASH"; value: string }
  | { type: "SCRIPT_HASH"; value: string };
export type DataOptionPrototype =
  | { type: "DATA_HASH"; value: string }
  | { type: "DATA"; value: PlutusDataVariant };
/** ScriptRef is stored as a CBOR hex string */
export type ScriptRefPrototype = string;
/** Mint uses the same structure as MultiAsset */
export type MintPrototype = MultiAssetPrototype;
export type NetworkIdPrototype = { type: "TESTNET" } | { type: "MAINNET" };
export type TransactionOutputsPrototype = TransactionOutputPrototype[];
export type CostModelPrototype = string[];
export type VoterPrototype =
  | { type: "CONSTITUTIONAL_COMMITTEE_HOT_CRED"; value: CredTypePrototype }
  | { type: "DREP"; value: CredTypePrototype }
  | { type: "STAKING_POOL"; value: string };
export type VoteKindPrototype =
  | { type: "NO" }
  | { type: "YES" }
  | { type: "ABSTAIN" };
export type GovernanceActionPrototype =
  | { type: "PARAMETER_CHANGE_ACTION"; value: ParameterChangeActionPrototype }
  | { type: "HARD_FORK_INITIATION_ACTION"; value: HardForkInitiationActionPrototype }
  | {
      type: "TREASURY_WITHDRAWALS_ACTION";
      value: TreasuryWithdrawalsActionPrototype;
    }
  | { type: "NO_CONFIDENCE_ACTION"; value: NoConfidenceActionPrototype }
  | { type: "UPDATE_COMMITTEE_ACTION"; value: UpdateCommitteeActionPrototype }
  | { type: "NEW_CONSTITUTION_ACTION"; value: NewConstitutionActionPrototype }
  | { type: "INFO_ACTION" };
/**
 * @minItems 0
 * @maxItems 0
 */
export type InfoActionPrototype = [];
export type TransactionBodiesPrototype = TransactionBodyPrototype[];
export type RedeemerTagPrototype =
  | { type: "SPEND" }
  | { type: "MINT" }
  | { type: "CERT" }
  | { type: "REWARD" }
  | { type: "VOTE" }
  | { type: "VOTING_PROPOSAL" };

export interface ProtocolVersionPrototype {
  /** CDDL: `major_protocol_version = 0 .. 12`. */
  major: number;
  /** CDDL: `protocol_version = [major_protocol_version, uint .size 4]`. */
  minor: number;
}
export interface TransactionBodyPrototype {
  auxiliary_data_hash?: string | null;
  certs?: CertificatePrototype[] | null;
  collateral?: TransactionInputPrototype[] | null;
  collateral_return?: TransactionOutputPrototype | null;
  current_treasury_value?: string | null;
  donation?: string | null;
  fee: string;
  inputs: TransactionInputPrototype[];
  mint?: MintPrototype | null;
  network_id?: NetworkIdPrototype | null;
  outputs: TransactionOutputsPrototype;
  reference_inputs?: TransactionInputPrototype[] | null;
  required_signers?: string[] | null;
  script_data_hash?: string | null;
  total_collateral?: string | null;
  ttl?: string | null;
  validity_start_interval?: string | null;
  voting_procedures?: VoterVotesPrototype[] | null;
  voting_proposals?: VotingProposalPrototype[] | null;
  withdrawals?: {
    [k: string]: string;
  } | null;
}
export interface StakeRegistrationPrototype {
  coin?: string | null;
  stake_credential: CredTypePrototype;
}
export interface StakeDeregistrationPrototype {
  coin?: string | null;
  stake_credential: CredTypePrototype;
}
export interface StakeDelegationPrototype {
  pool_keyhash: string;
  stake_credential: CredTypePrototype;
}
export interface PoolRegistrationPrototype {
  pool_params: PoolParamsPrototype;
}
export interface PoolParamsPrototype {
  cost: string;
  margin: UnitIntervalPrototype;
  operator: string;
  pledge: string;
  pool_metadata?: PoolMetadataPrototype | null;
  pool_owners: string[];
  relays: RelaysPrototype;
  reward_account: string;
  vrf_keyhash: string;
}
export interface UnitIntervalPrototype {
  denominator: string;
  numerator: string;
}
export interface PoolMetadataPrototype {
  pool_metadata_hash: string;
  url: URLPrototype;
}
export interface SingleHostAddrPrototype {
  ipv4?: Ipv4Prototype | null;
  ipv6?: Ipv6Prototype | null;
  port?: number | null;
}
export interface SingleHostNamePrototype {
  dns_name: DNSRecordAorAAAAPrototype;
  port?: number | null;
}
export interface MultiHostNamePrototype {
  dns_name: DNSRecordSRVPrototype;
}
export interface PoolRetirementPrototype {
  /** CDDL: `pool_retirement_cert = (4, pool_keyhash, epoch)` where `epoch = uint .size 8`
   * (2^64-1) — NOT the narrower `epoch_interval = uint .size 4` used inside
   * `protocol_param_update`. */
  epoch: bigint;
  pool_keyhash: string;
}
export interface CommitteeHotAuthPrototype {
  committee_cold_credential: CredTypePrototype;
  committee_hot_credential: CredTypePrototype;
}
export interface CommitteeColdResignPrototype {
  anchor?: AnchorPrototype | null;
  committee_cold_credential: CredTypePrototype;
}
export interface DRepDeregistrationPrototype {
  coin: string;
  voting_credential: CredTypePrototype;
}
export interface DRepRegistrationPrototype {
  anchor?: AnchorPrototype | null;
  coin: string;
  voting_credential: CredTypePrototype;
}
export interface DRepUpdatePrototype {
  anchor?: AnchorPrototype | null;
  voting_credential: CredTypePrototype;
}
export interface StakeAndVoteDelegationPrototype {
  drep: DRepPrototype;
  pool_keyhash: string;
  stake_credential: CredTypePrototype;
}
export interface StakeRegistrationAndDelegationPrototype {
  coin: string;
  pool_keyhash: string;
  stake_credential: CredTypePrototype;
}
export interface StakeVoteRegistrationAndDelegationPrototype {
  coin: string;
  drep: DRepPrototype;
  pool_keyhash: string;
  stake_credential: CredTypePrototype;
}
export interface VoteDelegationPrototype {
  drep: DRepPrototype;
  stake_credential: CredTypePrototype;
}
export interface VoteRegistrationAndDelegationPrototype {
  coin: string;
  drep: DRepPrototype;
  stake_credential: CredTypePrototype;
}
export interface TransactionInputPrototype {
  /** CDDL: `transaction_input = [transaction_id, index : uint .size 2]` — max 65535. */
  index: number;
  transaction_id: string;
}
/**
 * CDDL allows two encodings — `transaction_output = alonzo_transaction_output /
 * babbage_transaction_output` (a 2–3 element array vs a keyed map) — and this type deliberately
 * does not express the choice. `@cardano-sdk/core` derives it from content, with no setter:
 * address+amount, or address+amount+datum *hash*, serialize as the Alonzo array; an inline datum
 * or a `script_ref` forces the Babbage map. That mapping is deterministic, so anything this
 * library encodes round-trips stably. The only casualty is byte-exact fidelity when *decoding a
 * third-party* transaction that chose the Babbage map for an output we would emit as an array —
 * re-encoding changes the bytes, and so the transaction hash. Judged not worth a flag.
 */
export interface TransactionOutputPrototype {
  address: string;
  amount: ValuePrototype;
  plutus_data?: DataOptionPrototype | null;
  script_ref?: ScriptRefPrototype | null;
}
export interface ValuePrototype {
  coin: string;
  multiasset?: MultiAssetPrototype | null;
}
export interface MultiAssetPrototype {
  [k: string]: AssetsPrototype;
}
/**
 * Every numeric field here is `uint .size 2` or `uint .size 4` (or `epoch_interval`, itself
 * `uint .size 4`) per the Conway CDDL `protocol_param_update` map — all well inside
 * `Number.MAX_SAFE_INTEGER`, so plain `number` is correct throughout. The `coin`-typed fields
 * (minfee_a/b, deposits, min_pool_cost, ada_per_utxo_byte, …) are unbounded `uint` and are
 * carried as `string`, which needs no widening.
 */
export interface ProtocolParamUpdatePrototype {
  ada_per_utxo_byte?: string | null;
  /** CDDL key 23: `uint .size 2`. */
  collateral_percentage?: number | null;
  /** CDDL key 28: `epoch_interval = uint .size 4` — narrower than
   * `CommitteeMemberPrototype.term_limit`, which is a full `epoch` (uint64). */
  committee_term_limit?: number | null;
  cost_models?: CostmdlsPrototype | null;
  drep_deposit?: string | null;
  drep_inactivity_period?: number | null;
  drep_voting_thresholds?: DRepVotingThresholdsPrototype | null;
  execution_costs?: ExUnitPricesPrototype | null;
  expansion_rate?: UnitIntervalPrototype | null;
  governance_action_deposit?: string | null;
  governance_action_validity_period?: number | null;
  key_deposit?: string | null;
  max_block_body_size?: number | null;
  max_block_ex_units?: ExUnitsPrototype | null;
  max_block_header_size?: number | null;
  max_collateral_inputs?: number | null;
  max_epoch?: number | null;
  max_tx_ex_units?: ExUnitsPrototype | null;
  max_tx_size?: number | null;
  max_value_size?: number | null;
  min_committee_size?: number | null;
  min_pool_cost?: string | null;
  minfee_a?: string | null;
  minfee_b?: string | null;
  n_opt?: number | null;
  pool_deposit?: string | null;
  pool_pledge_influence?: UnitIntervalPrototype | null;
  pool_voting_thresholds?: PoolVotingThresholdsPrototype | null;
  ref_script_coins_per_byte?: UnitIntervalPrototype | null;
  treasury_growth_rate?: UnitIntervalPrototype | null;
}
export interface CostmdlsPrototype {
  [k: string]: CostModelPrototype;
}
export interface DRepVotingThresholdsPrototype {
  committee_no_confidence: UnitIntervalPrototype;
  committee_normal: UnitIntervalPrototype;
  hard_fork_initiation: UnitIntervalPrototype;
  motion_no_confidence: UnitIntervalPrototype;
  pp_economic_group: UnitIntervalPrototype;
  pp_governance_group: UnitIntervalPrototype;
  pp_network_group: UnitIntervalPrototype;
  pp_technical_group: UnitIntervalPrototype;
  treasury_withdrawal: UnitIntervalPrototype;
  update_constitution: UnitIntervalPrototype;
}
export interface ExUnitPricesPrototype {
  mem_price: UnitIntervalPrototype;
  step_price: UnitIntervalPrototype;
}
export interface ExUnitsPrototype {
  mem: string;
  steps: string;
}
export interface PoolVotingThresholdsPrototype {
  committee_no_confidence: UnitIntervalPrototype;
  committee_normal: UnitIntervalPrototype;
  hard_fork_initiation: UnitIntervalPrototype;
  motion_no_confidence: UnitIntervalPrototype;
  security_relevant_threshold: UnitIntervalPrototype;
}
export interface VoterVotesPrototype {
  voter: VoterPrototype;
  votes: VotePrototype[];
}
export interface VotePrototype {
  action_id: GovernanceActionIdPrototype;
  voting_procedure: VotingProcedurePrototype;
}
export interface GovernanceActionIdPrototype {
  /** CDDL: `gov_action_id = [transaction_id, gov_action_index : uint .size 2]` — max 65535. */
  index: number;
  transaction_id: string;
}
export interface VotingProcedurePrototype {
  anchor?: AnchorPrototype | null;
  vote: VoteKindPrototype;
}
export interface VotingProposalPrototype {
  anchor: AnchorPrototype;
  deposit: string;
  governance_action: GovernanceActionPrototype;
  reward_account: string;
}
export interface ParameterChangeActionPrototype {
  gov_action_id?: GovernanceActionIdPrototype | null;
  policy_hash?: string | null;
  protocol_param_updates: ProtocolParamUpdatePrototype;
}
export interface HardForkInitiationActionPrototype {
  gov_action_id?: GovernanceActionIdPrototype | null;
  protocol_version: ProtocolVersionPrototype;
}
export interface TreasuryWithdrawalsActionPrototype {
  policy_hash?: string | null;
  withdrawals: TreasuryWithdrawalsPrototype;
}
export interface TreasuryWithdrawalsPrototype {
  [k: string]: string;
}
export interface NoConfidenceActionPrototype {
  gov_action_id?: GovernanceActionIdPrototype | null;
}
export interface UpdateCommitteeActionPrototype {
  committee: CommitteePrototype;
  gov_action_id?: GovernanceActionIdPrototype | null;
  members_to_remove: CredTypePrototype[];
}
export interface CommitteePrototype {
  members: CommitteeMemberPrototype[];
  quorum_threshold: UnitIntervalPrototype;
}
export interface CommitteeMemberPrototype {
  stake_credential: CredTypePrototype;
  /** CDDL: this is the value side of `update_committee`'s
   * `{* committee_cold_credential => epoch}` map, i.e. `epoch = uint .size 8` (2^64-1).
   * Deliberately NOT the same type as `ProtocolParamUpdatePrototype.committee_term_limit`,
   * which is `epoch_interval = uint .size 4` — two different "term limit"s, different widths. */
  term_limit: bigint;
}
export interface NewConstitutionActionPrototype {
  constitution: ConstitutionPrototype;
  gov_action_id?: GovernanceActionIdPrototype | null;
}
export interface ConstitutionPrototype {
  anchor: AnchorPrototype;
  script_hash?: string | null;
}
export interface TransactionWitnessSetPrototype {
  /** CDDL key 2. */
  bootstraps?: BootstrapWitnessPrototype[] | null;
  /** CDDL key 1. */
  native_scripts?: NativeScriptPrototype[] | null;
  /** CDDL key 4. */
  plutus_data?: PlutusListPrototype | null;
  /**
   * CDDL keys 3 / 6 / 7 are three SEPARATE fields — `? 3 : nonempty_set<plutus_v1_script>`,
   * `? 6 : nonempty_set<plutus_v2_script>`, `? 7 : nonempty_set<plutus_v3_script>` — because a
   * Plutus script's language version is not recoverable from its bytes; the witness-set key is
   * what carries it. A backend that collapses all three into a single version-less script list
   * cannot round-trip a V2/V3 script correctly; these types follow the CDDL instead.
   */
  plutus_v1_scripts?: string[] | null;
  plutus_v2_scripts?: string[] | null;
  plutus_v3_scripts?: string[] | null;
  /** CDDL key 5. */
  redeemers?: RedeemerPrototype[] | null;
  /** CDDL key 0. */
  vkeys?: VkeywitnessPrototype[] | null;
}
export interface BootstrapWitnessPrototype {
  attributes: number[];
  chain_code: number[];
  signature: string;
  vkey: VkeyPrototype;
}
export interface PlutusListPrototype {
  /**
   * NOT HONOURED by the `mesh-core-cst` converters. CBOR permits both definite- and
   * indefinite-length lists and the choice changes the bytes (hence the datum hash), but
   * `@cardano-sdk/core`'s `PlutusList` exposes no encoding control. The encoder ignores this and
   * the decoder never sets it. Round-tripping a datum through CST therefore normalises to
   * whatever CST emits — relevant if you are trying to reproduce a specific third-party datum
   * hash byte-for-byte.
   */
  definite_encoding?: boolean | null;
  elems: string[];
}
export interface RedeemerPrototype {
  data: PlutusDataVariant;
  ex_units: ExUnitsPrototype;
  index: string;
  tag: RedeemerTagPrototype;
}
export interface VkeywitnessPrototype {
  signature: string;
  vkey: VkeyPrototype;
}
export type BlockHashPrototype = string;
export type BootstrapWitnessesPrototype = BootstrapWitnessPrototype[];

export type CertificateEnumPrototype = CertificatePrototype;
export type CertificatesPrototype = CertificatePrototype[];

export type CredentialPrototype = CredTypePrototype;
export type CredentialsPrototype = CredTypePrototype[];
export type DRepEnumPrototype =
  | { type: "ALWAYS_ABSTAIN" }
  | { type: "ALWAYS_NO_CONFIDENCE" }
  | { type: "KEY_HASH"; value: string }
  | { type: "SCRIPT_HASH"; value: string };
export type DataHashPrototype = string;
export type Ed25519KeyHashPrototype = string;
export type Ed25519KeyHashesPrototype = string[];
export type Ed25519SignaturePrototype = string;
export interface GeneralTransactionMetadataPrototype {
  [k: string]: string;
}
export type GenesisDelegateHashPrototype = string;
export type GenesisHashPrototype = string;
export type GenesisHashesPrototype = string[];
export type GovernanceActionEnumPrototype = GovernanceActionPrototype;
export type GovernanceActionIdsPrototype = GovernanceActionIdPrototype[];

export type IntPrototype = string;
/**
 * @minItems 4
 * @maxItems 4
 */
export type KESVKeyPrototype = string;
export type LanguagePrototype = LanguageKindPrototype;
export type LanguageKindPrototype =
  | { type: "PLUTUS_V1" }
  | { type: "PLUTUS_V2" }
  | { type: "PLUTUS_V3" };
export type LanguagesPrototype = LanguagePrototype[];

export type NativeScriptsPrototype = NativeScriptPrototype[];

export type NetworkIdKindPrototype = NetworkIdPrototype;
export type PlutusScriptPrototype = string;
export type PlutusScriptsPrototype = string[];
export type PoolMetadataHashPrototype = string;
export type PublicKeyPrototype = string;
export type RedeemerTagKindPrototype = RedeemerTagPrototype;
export type RedeemersPrototype = RedeemerPrototype[];

export type RelayEnumPrototype = RelayPrototype;
/**
 * @minItems 4
 * @maxItems 4
 */
export type RewardAddressPrototype = string;
export type RewardAddressesPrototype = string[];
export type ScriptDataHashPrototype = string;
export type ScriptHashPrototype = string;
export type ScriptHashesPrototype = string[];
/** ScriptRef is stored as a CBOR hex string */
export type ScriptRefEnumPrototype = string;
export interface TransactionPrototype {
  auxiliary_data?: AuxiliaryDataPrototype | null;
  body: TransactionBodyPrototype;
  is_valid: boolean;
  witness_set: TransactionWitnessSetPrototype;
}
export type TransactionHashPrototype = string;
export type TransactionInputsPrototype = TransactionInputPrototype[];

export interface TransactionUnspentOutputPrototype {
  input: TransactionInputPrototype;
  output: TransactionOutputPrototype;
}
export type TransactionUnspentOutputsPrototype = TransactionUnspentOutputPrototype[];

export type VkeywitnessesPrototype = VkeywitnessPrototype[];

export type VoterEnumPrototype = VoterPrototype;
export type VotersPrototype = VoterPrototype[];
export type VotingProceduresPrototype = VoterVotesPrototype[];

export type VotingProposalsPrototype = VotingProposalPrototype[];

export interface WithdrawalsPrototype {
  [k: string]: string;
}

/**
 * Metadatum (tagged enum with "type" discriminator). Suffixed `*Prototype` because `mesh-common`
 * already exports its own, differently-shaped `Metadatum`/`TxMetadata` (`../transaction-builder`,
 * a `Map`-based shape) — the unsuffixed names would collide across this package's exports.
 */
export type MetadatumPrototype =
  | { type: "INT"; value: bigint }
  | { type: "BYTES"; value: number[] } // raw bytes as array
  | { type: "STRING"; value: string }
  | { type: "LIST"; value: MetadatumPrototype[] }
  | { type: "MAP"; value: [MetadatumPrototype, MetadatumPrototype][] };

/** TxMetadataPrototype is a map from label (string) to MetadatumPrototype */
export type TxMetadataPrototype = { [label: string]: MetadatumPrototype };

/**
 * PlutusDataPrototype (tagged enum with "type" discriminator). Named `*Prototype` because
 * `mesh-common` already exports its own, differently-shaped `PlutusData` (`../../data/json`).
 */
export type PlutusDataPrototype =
  | { type: "INTEGER"; value: bigint }
  | { type: "BYTES"; value: string } // hex string
  | { type: "LIST"; value: PlutusDataPrototype[] }
  | { type: "MAP"; value: [PlutusDataPrototype, PlutusDataPrototype][] }
  // CDDL: `constr<a0> = #6.102([uint, [* a0]]) / ...` — the general constr tag carries an
  // unqualified `uint`, i.e. the full 0..2^64-1 range.
  | { type: "CONSTR"; alternative: bigint; fields: PlutusDataPrototype[] };

export type PlutusDataVariant =
  | {
      type: "CBOR";
      hex: string;
    }
  | {
      type: "MANUAL";
      data: PlutusDataPrototype;
    };
