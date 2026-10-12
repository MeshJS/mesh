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
 * `unresolved()`: the contents of an input given by reference only, script execution units,
 * the lovelace an output needs to hold. Those are filled in before assembly.
 *
 * Redeemers carry no index. The index depends on where the item they witness ends up once the
 * transaction is sorted, so it is assigned once, at assembly, from what the redeemer belongs to.
 */

/* ---------------------------------------------------------------------------------------------
 * Arguments accepted by the part builders
 * ------------------------------------------------------------------------------------------- */

/** A transaction output, identified by the transaction that created it and its position */
export type OutRef = { txHash: string; outputIndex: number };

/**
 * An existing output: either just its reference, to be resolved before assembly, or the full
 * UTxO. Passing the UTxO lets the part check it straight away and spares a lookup later.
 */
export type InputRef = OutRef | UTxO;

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

/** A Plutus script, attached to the transaction or held in a reference output */
export type PlutusScriptInput =
  | PlutusScript
  | (ScriptReferenceInput & {
      /** Plutus version of the script; taken from the reference UTxO when that is given */
      version?: LanguageVersion;
    });

/** A native script, attached (as a script or its CBOR) or held in a reference output */
export type NativeScriptInput = NativeScript | string | ScriptReferenceInput;

export type RedeemerInput = {
  data: PlutusDataInput;
  /** Execution units; left to evaluation when omitted */
  exUnits?: Budget;
};

/**
 * The datum of a spent script output:
 * - `"inline"`: the output holds its datum inline;
 * - `"none"`: the output holds no datum (Plutus V3 only);
 * - `{ data }`: the output holds the datum's hash, and the datum is supplied with the
 *   transaction.
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

/** How a script credential authorises a certificate; key credentials need nothing */
export type CredentialWitnessInput =
  | { native: NativeScriptInput }
  | { plutus: PlutusScriptInput; redeemer: RedeemerInput };

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
  readonly utxo?: Readonly<UTxO>;
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
  readonly data: Readonly<PlutusDataVariant>;
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
  readonly rewardAddress: string;
  /** Lovelace withdrawn; left out to withdraw the whole balance, looked up before assembly */
  readonly amount?: string;
  readonly witness: KeyWitness | NativeWitness | PlutusWitness;
};

/** A key whose signature the transaction requires, visible to its scripts */
export type RequiredSignerPart = PartBase & {
  readonly kind: "requiredSigner";
  readonly keyHash: string;
};

/** The slots between which the transaction is valid */
export type ValidityPart = PartBase & {
  readonly kind: "validity";
  /** First slot the transaction is valid in (`validity_start_interval`) */
  readonly invalidBefore?: string;
  /** First slot the transaction is no longer valid in (`ttl`) */
  readonly invalidHereafter?: string;
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
  readonly depositParameter?: "keyDeposit" | "drepDeposit";
  /**
   * What authorises the certificate: nothing for a legacy stake registration; the keys it names
   * for pool certificates; otherwise its credential's key or script
   */
  readonly witness:
    { readonly type: "none" } | KeyWitness | NativeWitness | PlutusWitness;
};

export type TxPart =
  | SpendPart
  | ReferenceInputPart
  | CollateralPart
  | CollateralReturnPart
  | OutputPart
  | MintPart
  | WithdrawalPart
  | RequiredSignerPart
  | ValidityPart
  | MetadataPart
  | AuxiliaryScriptPart
  | DonationPart
  | TreasuryValuePart
  | NetworkIdPart
  | CertificatePart;

/** Something a part leaves to be filled in before assembly */
export type Unresolved =
  /** The contents of an output given by reference only */
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
  /** The reward balance of a stake address, to withdraw in full */
  | { readonly type: "rewardBalance"; readonly rewardAddress: string }
  /** A deposit or refund, from a protocol parameter */
  | {
      readonly type: "deposit";
      readonly parameter: "keyDeposit" | "drepDeposit";
    };
