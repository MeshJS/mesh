import type {
  Asset,
  AssetsPrototype,
  Budget,
  BuilderData,
  CertificatePrototype,
  CredTypePrototype,
  Data,
  DataOptionPrototype,
  DRepPrototype,
  ExUnitsPrototype,
  LanguageVersion,
  MetadatumPrototype,
  NativeScript,
  NativeScriptPrototype,
  NetworkIdPrototype,
  PlutusDataVariant,
  PlutusScript,
  ScriptRefPrototype,
  TransactionInputPrototype,
  UTxO,
  ValuePrototype,
  VotePrototype,
  VoterPrototype,
  VotingProposalPrototype,
} from "@meshsdk/common";

/*
 * Transaction parts.
 *
 * A part is one complete piece of a transaction - an input with its witness, an output, a
 * collateral input - built by a single call that takes every argument it needs at once. Parts
 * are plain, immutable values: they can be built ahead of time, stored, inspected and combined
 * in any order, since their order carries no meaning.
 *
 * Parts are shaped after `TransactionPrototype`, so turning them into one is mostly a matter of
 * collecting them. What a part cannot know when it is built is left out and listed by
 * `unresolved()`: the contents of a spent or collateral input given by reference only, script
 * execution units, the lovelace an output needs to hold, the slot of a validity bound given as a
 * time. Those are filled in before assembly.
 *
 * Redeemers carry no index. The index depends on where the item they witness ends up once the
 * transaction is sorted, so it is assigned once, at assembly, from what the redeemer belongs to.
 *
 * A redeemer given as a function of the final transaction is the one content of a part that is
 * not data: the part keeps the function, uncalled, and assembly calls it. A part holding one
 * cannot be written as JSON.
 */

/* ---------------------------------------------------------------------------------------------
 * Arguments accepted by the part builders
 * ------------------------------------------------------------------------------------------- */

/** A transaction output, identified by the transaction that created it and its position */
export type OutRef = { txHash: string; outputIndex: number };

/**
 * Lovelace and tokens as quantities by unit: `lovelace`, or a policy id followed by an asset
 * name, in hex. It is the record a part takes as its `value`. As the builder returns it,
 * lovelace is always there (it may be `0n`), a token that is not held has no entry, and tokens
 * stand in the order of their units.
 */
export type Assets = {
  readonly lovelace: bigint;
  readonly [unit: string]: bigint;
};

/**
 * The datum an output holds, in the forms `output()` takes a datum in:
 * - `{ type: "inline", data }`: held in the output; `data` is its CBOR in hex, byte for byte
 *   as the output holds it, in the form every part takes as data;
 * - `{ type: "hash", hash }`: only its hash is held.
 */
export type OutputDatum =
  | {
      readonly type: "inline";
      readonly data: { readonly type: "CBOR"; readonly content: string };
    }
  | { readonly type: "hash"; readonly hash: string };

/**
 * The reference script an output holds:
 * - `"plutus"`: a `PlutusScript` as parts take one, with its hash; `code` is in its double CBOR
 *   wrapping, the bytes the hash is taken over kept as the output holds them;
 * - `"native"`: the script's CBOR in hex, as parts take a native script, with its hash;
 * - `"unknown"`: a reference script this library cannot read (a language it does not know,
 *   bytes that are not a script, or bytes whose hash is not the one stated with them), kept as
 *   it was given, with the hash stated for it when there was one. It counts for the fee by its
 *   size and cannot be used as a script.
 */
export type OutputScript =
  | {
      readonly type: "plutus";
      readonly version: LanguageVersion;
      readonly code: string;
      readonly hash: string;
    }
  | { readonly type: "native"; readonly cbor: string; readonly hash: string }
  | {
      readonly type: "unknown";
      readonly scriptRef: string;
      readonly hash?: string;
    };

/**
 * An unspent transaction output: plain data, in the words of the parts. Everything the builder
 * returns holds UTxOs in this form, and it is itself an `OutRef`.
 */
export type Utxo = {
  /** Hash of the transaction that made the output, in lower-case hex */
  readonly txHash: string;
  /** Its position among the outputs of that transaction */
  readonly outputIndex: number;
  /** In bech32; base58 for a Byron address */
  readonly address: string;
  readonly value: Assets;
  /** Left out when the output holds no datum */
  readonly datum?: OutputDatum;
  /** Left out when the output holds no reference script */
  readonly script?: OutputScript;
};

/**
 * A UTxO as the builder takes one, wherever it takes one:
 * - a `Utxo`;
 * - a Mesh `UTxO`, as providers and Mesh wallets return it;
 * - the CBOR of a transaction unspent output in hex, as a CIP-30 wallet returns it.
 * Each is checked and copied into a `Utxo` at the call; `toUtxo` is that conversion.
 */
export type UtxoInput = Utxo | UTxO | string;

/**
 * An existing output: just its reference, looked up before assembly, or the UTxO in full, in
 * any form the builder takes one. Passing the UTxO lets the part check it straight away and
 * spares the lookup. An object with `txHash` and `outputIndex` is the UTxO in full when it
 * also has an `address` or a `value`, and a reference otherwise.
 */
export type InputRef = OutRef | UtxoInput;

/** Plutus data, as Mesh `Data` or in any of the `BuilderData` formats */
export type PlutusDataInput = Data | BuilderData;

/** A script held in the reference script field of an existing output */
export type ScriptReferenceInput = {
  /** The output holding the script */
  reference: InputRef;
  /** Hash of the script; taken from the reference UTxO when that is given in full */
  scriptHash?: string;
  /** Size of the script in bytes; taken from the reference UTxO when that is given in full */
  scriptSize?: number;
};

/**
 * A Plutus script, attached to the transaction or held in a reference output. `code` of an
 * attached script may be the flat program, its single CBOR wrapping (a blueprint's
 * `compiledCode`) or its double wrapping: it is normalised at the part call
 * (`normalizePlutusScript(code, "DoubleCBOR")`), so the hash, policy id and address are those
 * the blueprint states. Anything that is not a script throws TxPartError INVALID_SCRIPT.
 */
export type PlutusScriptInput =
  | PlutusScript
  | (ScriptReferenceInput & {
      /** Plutus version of the script; taken from the reference UTxO when that is given */
      version?: LanguageVersion;
    });

/** A native script, attached (as a script or its CBOR) or held in a reference output */
export type NativeScriptInput = NativeScript | string | ScriptReferenceInput;

/**
 * The final positions a redeemer function may read. Its functions are bound, so
 * `utxos.map(tx.input)` works.
 */
export type RedeemerContext = {
  /**
   * Index of the item the redeemer witnesses, in the ledger's order for its purpose: the input
   * among the sorted inputs, the policy among the sorted policies, the reward account among the
   * sorted withdrawals, the certificate, voter or proposal in its list
   */
  readonly self: number;
  /** The inputs, sorted as the ledger sorts them */
  readonly inputs: readonly OutRef[];
  /**
   * Index of an input among the sorted inputs
   * @throws TxBuildError INVALID_REDEEMER (`notAnInput`), with this part's label
   */
  readonly input: (ref: InputRef) => number;
  /**
   * Index of a reference input among the sorted reference inputs
   * @throws TxBuildError INVALID_REDEEMER (`notAReferenceInput`), with this part's label
   */
  readonly referenceInput: (ref: InputRef) => number;
  /**
   * Index of the output made by the output part with this label; when several output parts
   * carry it, the first of them in the order of the parts
   * @throws TxBuildError INVALID_REDEEMER (`noSuchOutput`), with this part's label
   */
  readonly output: (label: string) => number;
};

/**
 * Redeemer data, as a value or computed from the final transaction. A function runs inside
 * `assembleTxPrototype`, synchronously, after the ledger order is fixed, in every balancing
 * round, so the fee and the evaluator see the data of the transaction returned. It must depend
 * on nothing but its argument. What it throws becomes TxBuildError INVALID_REDEEMER with the
 * part and label, the thrown value as `cause`; an INVALID_REDEEMER raised by the lookups of its
 * own context and not caught passes as it is, with its own reason. Data it returns that is not
 * Plutus data is INVALID_REDEEMER (`invalidData`).
 */
export type RedeemerInput = {
  data: PlutusDataInput | ((tx: RedeemerContext) => PlutusDataInput);
  /** Execution units; left to evaluation when omitted */
  exUnits?: Budget;
};

/**
 * The datum of a spent script output:
 * - `"inline"`: the output holds its datum inline;
 * - `"none"`: the output holds no datum (Plutus V3 only);
 * - `{ data }`: the datum of the output. For an output that holds its datum's hash, the datum
 *   is supplied with the transaction, in its witness set. For an output that holds its datum
 *   inline, it is a check: the data must be that datum, byte for byte (DATUM_MISMATCH else),
 *   and it goes nowhere, since the ledger, and a local evaluation, read the datum from the output.
 *   An output with no datum is DATUM_MISMATCH.
 */
export type SpendDatumInput = "inline" | "none" | { data: PlutusDataInput };

/** Lovelace and assets: Mesh `Asset[]`, or quantities keyed by unit (`"lovelace"` for ADA) */
export type ValueInput = Asset[] | Record<string, bigint>;

/**
 * The datum of a new output:
 * - `{ type: "inline", data }`: held in the output;
 * - `{ type: "hash", data }`: only the hash is held in the output; `embed: true` also puts the
 *   datum in the witness set, so it is published with the transaction;
 * - `{ type: "hash", hash }`: only a known hash, with no datum to publish.
 */
export type OutputDatumInput =
  | { type: "inline"; data: PlutusDataInput }
  | { type: "hash"; data: PlutusDataInput; embed?: boolean }
  | { type: "hash"; hash: string };

/**
 * Quantities minted (positive) or burnt (negative) under one policy, keyed by asset name in
 * hex (`""` for the empty name)
 */
export type MintAssetsInput = Record<string, bigint>;

/**
 * A metadata value: integers, text and byte strings (each at most 64 bytes), lists, and maps
 * (`Map`s or plain objects)
 */
export type MetadataValueInput =
  | bigint
  | number
  | string
  | Uint8Array
  | MetadataValueInput[]
  | Map<MetadataValueInput, MetadataValueInput>
  | { [key: string]: MetadataValueInput };

/**
 * A credential: a bech32 reward address (whose stake credential is taken), or the credential
 * itself
 */
export type CredentialInput = string | CredTypePrototype;

/** A DRep: its id in bech32 (CIP-105 or CIP-129), or its credential */
export type DRepCredentialInput = string | CredTypePrototype;

/** Whom a stake credential delegates its vote to */
export type DRepInput =
  DRepCredentialInput | "alwaysAbstain" | "alwaysNoConfidence" | DRepPrototype;

/** A stake pool: its id in bech32, or its operator key hash in hex */
export type PoolInput = string;

export type AnchorInput = { url: string; dataHash: string };

/**
 * How a script credential authorises a certificate, a vote or a proposal; key credentials need
 * nothing. The redeemer's data may be a function of the final transaction (`self`: the
 * certificate's or proposal's position in its list, the voter's among the voters).
 */
export type CredentialWitnessInput =
  | { native: NativeScriptInput }
  | { plutus: PlutusScriptInput; redeemer: RedeemerInput };

/** A governance action: the transaction that proposed it and the proposal's position there */
export type GovActionIdInput = { txHash: string; index: number };

/** Who votes: a DRep, a constitutional committee member's hot credential, or a stake pool */
export type VoterInput =
  | { drep: DRepCredentialInput }
  | { committee: CredentialInput }
  | { pool: PoolInput };

export type VoteInput = {
  action: GovActionIdInput;
  vote: "yes" | "no" | "abstain";
  /** Where the rationale is published */
  anchor?: AnchorInput;
};

/** The protocol parameters deposits and refunds are taken from */
export type DepositParameter =
  "keyDeposit" | "drepDeposit" | "govActionDeposit";

/* ---------------------------------------------------------------------------------------------
 * Parts
 * ------------------------------------------------------------------------------------------- */

type PartBase = {
  /** Free-form name, echoed in errors about this part */
  readonly label?: string;
};

type ResolvableInput = {
  readonly input: Readonly<TransactionInputPrototype>;
  /** The output being referenced, once known */
  readonly utxo?: Readonly<Utxo>;
};

export type PlutusScriptSource =
  | {
      readonly type: "attached";
      readonly version: LanguageVersion;
      /** The script as it goes in the witness set */
      readonly cbor: string;
      readonly scriptHash: string;
    }
  | (ResolvableInput & {
      readonly type: "reference";
      readonly version?: LanguageVersion;
      readonly scriptHash?: string;
      readonly scriptSize?: number;
    });

export type NativeScriptSource =
  | {
      readonly type: "attached";
      readonly script: Readonly<NativeScriptPrototype>;
      readonly cbor: string;
      readonly scriptHash: string;
    }
  | (ResolvableInput & {
      readonly type: "reference";
      readonly scriptHash?: string;
      readonly scriptSize?: number;
    });

export type PartRedeemer = {
  /** The data, or the function that computes it at assembly, kept as given */
  readonly data:
    | Readonly<PlutusDataVariant>
    | {
        readonly type: "deferred";
        readonly build: (tx: RedeemerContext) => PlutusDataInput;
      };
  readonly exUnits?: Readonly<ExUnitsPrototype>;
};

export type SpendDatum =
  | { readonly type: "inline" }
  | { readonly type: "none" }
  | {
      readonly type: "provided";
      readonly data: Readonly<PlutusDataVariant>;
      readonly hash: string;
    };

export type KeyWitness = { readonly type: "key" };

export type NativeWitness = {
  readonly type: "native";
  readonly script: NativeScriptSource;
};

export type PlutusWitness = {
  readonly type: "plutus";
  readonly script: PlutusScriptSource;
  readonly redeemer: PartRedeemer;
};

export type SpendWitness =
  | KeyWitness
  | NativeWitness
  | (PlutusWitness & {
      /** Left out until the spent UTxO is known when not given explicitly */
      readonly datum?: SpendDatum;
    });

/** An input spent by the transaction, with what witnesses it */
export type SpendPart = PartBase &
  ResolvableInput & {
    readonly kind: "spend";
    readonly witness: SpendWitness;
  };

/** An output read, but not spent, by the transaction */
export type ReferenceInputPart = PartBase &
  ResolvableInput & {
    readonly kind: "referenceInput";
  };

/** An input forfeited if a script of the transaction fails */
export type CollateralPart = PartBase &
  ResolvableInput & {
    readonly kind: "collateral";
  };

/**
 * An output of an earlier step of the same plan: the output its transaction makes from the
 * output part with this label, or the output at this position in its transaction. It stands
 * where a part takes a UTxO, in `spend.pubKey`, `spend.native`, `spend.plutus`, `referenceInput`
 * and `collateral`. The plan fills it in when it builds the step, from the earlier step's own
 * transaction: nothing is looked up, and no transaction hash is written by hand.
 */
export type StepOutput = {
  /** The name of the earlier step */
  readonly step: string;
  /** The label of the output part that makes the output, or the output's position, from 0 */
  readonly output: string | number;
};

/**
 * All the change of an earlier step of the same plan. It stands where `spend.pubKey` takes a
 * UTxO: the part spends every change output of that step's transaction, one input for each, and
 * none when the transaction has no change.
 */
export type StepChange = {
  /** The name of the earlier step */
  readonly step: string;
  readonly change: true;
};

/**
 * A part whose input is an output of an earlier step: it holds `link` where the part holds
 * `input` and `utxo`. The plan that builds the step fills the input in, and a part linked to all
 * the change may become several parts there. Until then the part is unresolved (the gap `link`):
 * `builder.build` and `assembleTxPrototype` do not take it.
 */
export type Linked<P extends SpendPart | ReferenceInputPart | CollateralPart> =
  Omit<P, "input" | "utxo"> & {
    /** The output, or all the change, of the earlier step */
    readonly link: StepOutput | StepChange;
  };

/** Every part that may be linked to an earlier step */
export type LinkedPart =
  Linked<SpendPart> | Linked<ReferenceInputPart> | Linked<CollateralPart>;

/** Where the collateral left over after a script failure goes */
export type CollateralReturnPart = PartBase & {
  readonly kind: "collateralReturn";
  readonly address: string;
  /** Lovelace forfeited on failure; worked out from the fee when omitted */
  readonly totalCollateral?: string;
};

/** An output of the transaction, as in `TransactionOutputPrototype` but for its lovelace */
export type OutputFragment = {
  readonly address: string;
  readonly amount: Readonly<
    Omit<ValuePrototype, "coin"> & {
      /** Left out to hold the minimum the output needs */
      coin?: string;
    }
  >;
  readonly plutus_data?: Readonly<DataOptionPrototype>;
  readonly script_ref?: ScriptRefPrototype;
};

export type OutputPart = PartBase & {
  readonly kind: "output";
  readonly output: OutputFragment;
  /** A datum whose hash the output holds, published in the witness set */
  readonly embeddedDatum?: Readonly<PlutusDataVariant>;
};

/**
 * Tokens minted or burnt under one policy. A transaction holds at most one part per policy,
 * as the ledger runs a minting script, and takes its redeemer, once per policy.
 */
export type MintPart = PartBase & {
  readonly kind: "mint";
  readonly policyId: string;
  /** Signed quantities by asset name, as in `MintPrototype` */
  readonly assets: Readonly<AssetsPrototype>;
  readonly witness: NativeWitness | PlutusWitness;
};

/** Rewards withdrawn from a stake address */
export type WithdrawalPart = PartBase & {
  readonly kind: "withdrawal";
  /** Left out for a script's own reward address, derived on the build's network before assembly */
  readonly rewardAddress?: string;
  /** Lovelace withdrawn; left out to withdraw the whole balance, looked up before assembly */
  readonly amount?: string;
  readonly witness: KeyWitness | NativeWitness | PlutusWitness;
};

/**
 * A guard: a credential the transaction must be authorised by, visible to its scripts (body
 * key 14). Today the only guard is a key, Conway's required signer; a later ledger era admits a
 * script credential in the same field, and this type then gains members
 */
export type GuardPart = PartBase & {
  readonly kind: "guard";
  /** The key hash, in the form `CredTypePrototype` has */
  readonly credential: { readonly type: "KEY"; readonly value: string };
  /** What authorises the guard: the key's signature; `guard.pubKey` sets it */
  readonly witness: KeyWitness;
};

/** The slots between which the transaction is valid */
export type SlotValidityPart = PartBase & {
  readonly kind: "validity";
  /** First slot the transaction is valid in (`validity_start_interval`) */
  readonly invalidBefore?: string;
  /** First slot the transaction is no longer valid in (`ttl`) */
  readonly invalidHereafter?: string;
};

/**
 * When the transaction is valid. A bound may be a POSIX time, converted to a slot when the
 * transaction is built, with the builder's network
 */
export type ValidityPart = SlotValidityPart & {
  /** Earliest time the transaction is valid at, in POSIX ms, until converted */
  readonly from?: number;
  /** Latest time the transaction is valid at, in POSIX ms, until converted */
  readonly until?: number;
};

/** One metadata entry */
export type MetadataPart = PartBase & {
  readonly kind: "metadata";
  readonly metadataLabel: string;
  readonly value: Readonly<MetadatumPrototype>;
};

/** A script published in the transaction's auxiliary data */
export type AuxiliaryScriptPart = PartBase & {
  readonly kind: "auxiliaryScript";
  readonly script:
    | {
        readonly type: "native";
        readonly script: Readonly<NativeScriptPrototype>;
      }
    | {
        readonly type: "plutus";
        readonly version: LanguageVersion;
        readonly cbor: string;
      };
};

/** Lovelace donated to the treasury */
export type DonationPart = PartBase & {
  readonly kind: "donation";
  readonly amount: string;
};

/** The current treasury value, as the transaction asserts it */
export type TreasuryValuePart = PartBase & {
  readonly kind: "treasuryValue";
  readonly amount: string;
};

/** The network the transaction is meant for */
export type NetworkIdPart = PartBase & {
  readonly kind: "networkId";
  readonly networkId: Readonly<NetworkIdPrototype>;
};

type WithOptionalCoin<T> = T extends { type: infer K; value: infer V }
  ? {
      type: K;
      value: V extends { coin: string }
        ? Omit<V, "coin"> & { coin?: string }
        : V;
    }
  : never;

/**
 * A `CertificatePrototype` whose deposit or refund may still be missing, to be filled in from
 * the protocol parameter named by the part's `depositParameter`
 */
export type CertificateFragment = WithOptionalCoin<CertificatePrototype>;

/**
 * A certificate. Certificates keep the order their parts are given in, as that order is part of
 * the transaction.
 */
export type CertificatePart = PartBase & {
  readonly kind: "certificate";
  readonly certificate: Readonly<CertificateFragment>;
  /** The protocol parameter the missing deposit or refund is taken from */
  readonly depositParameter?: Exclude<DepositParameter, "govActionDeposit">;
  /**
   * What authorises the certificate: nothing for a legacy stake registration; the keys it names
   * for pool certificates; otherwise its credential's key or script
   */
  readonly witness:
    { readonly type: "none" } | KeyWitness | NativeWitness | PlutusWitness;
};

/**
 * The votes of one voter. A transaction holds at most one part per voter, as the ledger runs a
 * voter's script, and takes its redeemer, once for all of that voter's votes.
 */
export type VotePart = PartBase & {
  readonly kind: "vote";
  readonly voter: Readonly<VoterPrototype>;
  readonly votes: readonly Readonly<VotePrototype>[];
  readonly witness: KeyWitness | NativeWitness | PlutusWitness;
};

/**
 * A governance proposal. Proposals keep the order their parts are given in, as that order is
 * part of the transaction.
 */
export type ProposalPart = PartBase & {
  readonly kind: "proposal";
  readonly proposal: Readonly<
    Omit<VotingProposalPrototype, "deposit"> & {
      /** Left out to take the `govActionDeposit` protocol parameter */
      deposit?: string;
    }
  >;
  readonly depositParameter?: "govActionDeposit";
  /**
   * The guardrail script a parameter change or treasury withdrawal names in its policy hash;
   * nothing for every other proposal
   */
  readonly witness: { readonly type: "none" } | NativeWitness | PlutusWitness;
};

export type TxPart =
  | SpendPart
  | ReferenceInputPart
  | CollateralPart
  | CollateralReturnPart
  | OutputPart
  | MintPart
  | WithdrawalPart
  | GuardPart
  | ValidityPart
  | MetadataPart
  | AuxiliaryScriptPart
  | DonationPart
  | TreasuryValuePart
  | NetworkIdPart
  | CertificatePart
  | VotePart
  | ProposalPart;

/** Something a part leaves to be filled in before assembly */
export type Unresolved =
  /** The contents of an output spent or put up as collateral, given by reference only */
  | { readonly type: "utxo"; readonly input: TransactionInputPrototype }
  /** Hash, size or version of a script in a reference output */
  | {
      readonly type: "scriptReference";
      readonly input: TransactionInputPrototype;
    }
  /** Which datum a spent script output holds */
  | { readonly type: "datum"; readonly input: TransactionInputPrototype }
  /** Execution units of a redeemer */
  | { readonly type: "exUnits" }
  /** The lovelace an output needs to hold */
  | { readonly type: "minCoin" }
  /** The lovelace forfeited on script failure */
  | { readonly type: "totalCollateral" }
  /** The slot of a validity bound given as a time */
  | { readonly type: "slot" }
  /** The reward address of a script's stake credential, which depends on the network */
  | { readonly type: "rewardAddress" }
  /** The reward balance of a stake address, to withdraw in full; no address while it is not derived */
  | { readonly type: "rewardBalance"; readonly rewardAddress?: string }
  /** A deposit or refund, from a protocol parameter */
  | {
      readonly type: "deposit";
      readonly parameter: DepositParameter;
    }
  /**
   * The output, or all the change, of an earlier step that a part is linked to; the plan that
   * builds the step fills it in
   */
  | { readonly type: "link"; readonly link: StepOutput | StepChange };
