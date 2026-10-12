import type {
  Asset,
  Budget,
  BuilderData,
  Data,
  DataOptionPrototype,
  ExUnitsPrototype,
  LanguageVersion,
  NativeScript,
  NativeScriptPrototype,
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

export type SpendWitness =
  | { readonly type: "key" }
  | { readonly type: "native"; readonly script: NativeScriptSource }
  | {
      readonly type: "plutus";
      readonly script: PlutusScriptSource;
      /** Left out until the spent UTxO is known when not given explicitly */
      readonly datum?: SpendDatum;
      readonly redeemer: PartRedeemer;
    };

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

export type TxPart =
  | SpendPart
  | ReferenceInputPart
  | CollateralPart
  | CollateralReturnPart
  | OutputPart;

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
  | { readonly type: "totalCollateral" };
