import type {
  Budget,
  ExUnitsPrototype,
  IEvaluator,
  IFetcher,
  IMeshTxSerializer,
  ISubmitter,
  LanguageVersion,
  NativeScript,
  NetworkConfig,
  NetworkInput,
  PlutusDataVariant,
  PlutusScript,
  Protocol,
  RedeemerTagType,
  ScriptFailure,
  TransactionOutputPrototype,
  TransactionPrototype,
} from "@meshsdk/common";
import {
  CachedFetcher,
  ScriptEvaluationError,
  slotAt,
  timeAt,
} from "@meshsdk/common";
import {
  Address,
  CborReader,
  CborWriter,
  Crypto,
  HexBlob,
  OfflineEvaluatorScalus,
  plutusDataVariantToCardano,
  Serialization,
  Transaction,
  transactionPrototypeFromCardano,
  transactionPrototypeToHex,
  TxCBOR,
} from "@meshsdk/core-cst";

import type { AssembledRedeemer, AssembledTx, RedeemerPart } from "./assemble";
import type {
  BalanceContext,
  Balanced,
  SelectInputs,
  TxCollateral,
} from "./balance";
import type { BuiltTx, BuiltTxJSON } from "./built-tx";
import type { ChainedTx } from "./chain";
import type { PartFailure } from "./errors";
import type { NetworkEntry } from "./network";
import type {
  CredentialInput,
  OutputPart,
  PlutusWitness,
  TxPart,
  Utxo,
  UtxoInput,
} from "./parts/types";
import type {
  GetCollateral,
  Payer,
  PayerRead,
  PayerSnapshot,
  PayerSource,
} from "./payer";
import type {
  PlanDeadlines,
  PlanOptions,
  PlanSteps,
  ResumeOptions,
  StepParts,
  TxPlanJSON,
  TxPlanStore,
} from "./plan/types";
import type { GovernanceDeposits } from "./resolve";
import type { RawTx, Signer } from "./sign";
import type { TxSigners } from "./witnesses";
import { abortable, throwIfAborted } from "./abort";
import {
  checkPartRepeats,
  checkPrototypeRepeats,
  incomplete,
  unresolvedError,
} from "./assemble";
import {
  balance,
  COLLATERAL_INPUT_BYTES,
  collateralCandidates,
  isPoolShortfall,
  lovelaceOnly,
  paymentPool,
  refusedBy,
  totalExUnits,
} from "./balance";
import { makeBuiltTx, restoreBuiltTx } from "./built-tx";
import {
  bodyOutputs,
  foldTransactions,
  outputUtxo,
  refuseSpentOutRefs,
  spentByTransactions,
  toKnownUtxos,
} from "./chain";
import { TxBuildError, TxPlanError } from "./errors";
import {
  bodyRefScriptSize,
  checkProtocol,
  coversMinCoin,
  feeForSize,
  outputMinCoin,
  prototypeExUnits,
  valueSize,
} from "./fee";
import { auxiliaryDataHashOf, scriptDataHashOf } from "./hashes";
import {
  checkNetworks,
  checkProviderNetwork,
  evaluatorNetwork,
  partEntries,
  resolveNetwork,
  rewardAddressOn,
  scriptAddressOn,
  utxoEntry,
} from "./network";
import { givenAsSigner, optionsObject, typeOf } from "./options";
import {
  errorText,
  fail,
  freeze,
  isWholeNumber,
  outRefString,
  paymentCredential,
  toStepLink,
} from "./parts/normalize";
import { givenShape } from "./parts/shape";
import {
  outputAsUtxo,
  plainUtxo,
  readUtxo,
  toMeshUtxo,
  utxoKey,
} from "./parts/utxo";
import {
  givenPayerEntries,
  readPayerSource,
  toAddressText,
  toPayerSource,
} from "./payer";
import { checkPlanDefaults } from "./plan/deadlines";
import { planFor, resumePlan, standingSteps, TxPlan } from "./plan/plan";
import { fetchTxOutputs, resolveParts, resolveValidity } from "./resolve";
import {
  bodySigners,
  keyWitnessTags,
  newWitnesses,
  payerSigner,
  readTransaction,
  readTransactionItems,
  verifies,
  withoutKeyWitnesses,
} from "./sign";
import { scanTransaction, TxScanError } from "./tx-scan";
import {
  countedKeys,
  placeholderWitnesses,
  signersOf,
  txSigners,
} from "./witnesses";

/**
 * What the builder reads the chain through: every read, the tip and the search; submits when it
 * can
 */
export type Provider = IFetcher & Partial<ISubmitter>;

/**
 * Everything a build reads from the chain, as plain JSON-safe data. `builder.chain()` returns
 * it; spread into `TxBuilderOptions` it gives a builder that fetches no parameters, for
 * fixtures, deterministic tests and workers sharing one epoch's values.
 */
export type ChainSnapshot = {
  readonly network: NetworkConfig;
  readonly params: Protocol;
  /** Cost models by Plutus language number, V1 first */
  readonly costModels: number[][];
};

/** `new TxBuilder(options)` */
export type TxBuilderOptions = {
  /**
   * The network the builder builds for. It fixes the network id every address is checked
   * against, the slot clock time bounds are converted with, and what the evaluator is configured
   * with. `"testnet"`, or anything but `"mainnet"`, `"preprod"`, `"preview"` and a network
   * config, is refused with INVALID_OPTION: for a devnet give a `customNetwork(...)`.
   */
  network: NetworkInput;
  /**
   * Reads outputs, reward balances, protocol parameters and cost models, through the
   * `CachedFetcher` shared by everything using this provider. That cache keeps parameters and
   * cost models until the epoch ends, as far as it knows the network; on a custom network whose
   * parameters change, give a `CachedFetcher` made with `network: "testnet"`, which keeps none.
   */
  provider?: Provider;
  /** Submits in place of the provider; the builder itself never submits */
  submitter?: ISubmitter;
  /**
   * Works out execution units. By default a local evaluator made for this builder:
   * `OfflineEvaluatorScalus` over the provider, or one that looks nothing up when the builder
   * has no provider. Before each evaluation the builder configures it, and an evaluator given
   * here that has `configure`, with its network, slot clock and the build's cost models; it is
   * loaded only when a Plutus script runs. `null`: no evaluation; every redeemer then needs its
   * execution units, and they are taken unchecked. An evaluator given to builders of different
   * networks is reconfigured by each of them: give each its own.
   */
  evaluator?: IEvaluator | null;
  /**
   * Serializes the transaction; must implement `serializeTxPrototype`. The prototype encoder of
   * `@meshsdk/core-cst` when omitted.
   */
  serializer?: IMeshTxSerializer;
  /**
   * Protocol parameters, used whole instead of reading them from the provider. With neither a
   * provider nor `params`, the constructor throws MISSING_PARAMETER.
   */
  params?: Protocol;
  /**
   * Cost models by Plutus language number, V1 first, used instead of reading them from the
   * provider. With neither, a build that runs a Plutus script throws MISSING_PARAMETER.
   */
  costModels?: number[][];
  /** The governance deposits, which `Protocol` does not carry */
  deposits?: GovernanceDeposits;
  /**
   * The defaults of this builder's plans. The deadlines (`ttlMs`, `expiryMarginMs`,
   * `confirmations`) are copied into a plan when it is made, where its own options do not
   * give them, and never read again. `pollMs` (above 0; 5 000 when not given) is the pause
   * between two looks at the chain while a call waits, where the call gives none; `resendMs`
   * (at least `pollMs`; 120 000 when not given) how often the same bytes go again while a
   * plan is sent. Neither is written into a plan. Checked by the constructor.
   */
  planDefaults?: PlanDeadlines & { pollMs?: number; resendMs?: number };
  /**
   * Where the records of this builder's plans are kept, so that they survive the process:
   * every change of a plan is written before the call returns, the first record before the plan
   * is returned, a delivery before the bytes leave. With a store every plan needs an `id`, its
   * parts must be data (no redeemer function), and `resume(id)` restores it. Builders
   * made by `add` keep the same store. An object with `load` and `save` functions; checked by
   * the constructor.
   */
  store?: TxPlanStore;
};

/** One entry of a parts list: a part, a nested list of parts, or a value that is skipped */
export type PartEntry =
  TxPart | false | null | undefined | readonly PartEntry[];

/**
 * Parts as `build` takes them: one part, or a list. Nested lists (fragments) are flattened and
 * `false`, `null`, `undefined` dropped, keeping the order of outputs, certificates and proposals.
 */
export type PartsInput = TxPart | readonly PartEntry[];

/** One step of a build, for diagnostics; the builder never logs by itself */
export type BuildEvent =
  /** The payer as read: its change address, how many UTxOs it has, how many may be selected */
  | { type: "payer"; changeAddress: string; utxos: number; selectable: number }
  /** The outputs looked up through the provider, as `txHash#index` */
  | { type: "fetched"; outRefs: string[] }
  /** A balancing round that priced a transaction: its fee, its size in bytes, its selected inputs */
  | {
      type: "round";
      round: number;
      fee: bigint;
      size: number;
      selected: number;
    }
  /** An evaluation, with the execution units it gave each redeemer */
  | { type: "evaluated"; round: number; redeemers: readonly BuiltRedeemer[] }
  /** A submitter answered with another hash than the transaction's; sent by a plan, never by a build */
  | {
      type: "warning";
      code: "HASH_MISMATCH";
      txHash: string;
      reportedHash: string;
    }
  /**
   * A look found in a block a step of a plan that was called dead: what the chain shows wins, and
   * the step is included; sent by a plan, never by a build
   */
  | {
      type: "warning";
      code: "DEAD_STEP_FOUND";
      step: string;
      txHash: string;
      was: "expired" | "orphaned";
    }
  /**
   * The provider's tip is ahead of the local clock by more than two minutes: that look expires no
   * step of a plan; sent by a plan, never by a build
   */
  | {
      type: "warning";
      code: "TIP_AHEAD_OF_CLOCK";
      slot: number;
      aheadMs: number;
    }
  /**
   * A plan put consolidation steps before a step that did not fit a transaction: how many this
   * call put in, and their fees in all; sent when a plan builds its steps, never by a build
   */
  | {
      type: "warning";
      code: "CONSOLIDATION_STEPS";
      steps: number;
      fee: bigint;
    };

/** Per-build options */
export type BuildOptions = {
  /** Who pays and gets the change; a build without one is MISSING_PAYER */
  payer?: Payer;
  /**
   * Which of the payer's UTxOs may be selected for payment and collateral. UTxOs the parts read
   * (reference inputs, reference scripts) and script-locked UTxOs are never selected.
   */
  canSelect?: (utxo: Utxo) => boolean;
  /** Replaces the built-in selection (each token from its largest holders, then lovelace) */
  coinSelection?: SelectInputs;
  /**
   * Spend every selectable UTxO of the payer and send all that is left over the outputs,
   * deposits and fee to this address, in several outputs when its tokens exceed `maxValSize`
   */
  sendAllTo?: string;
  /**
   * A fee that goes into the body as given; FEE_TOO_LOW `{ fee, minFee }` when the final
   * transaction's minimum fee is higher
   */
  fee?: bigint;
  /** Operator key hashes of pools already registered (registering again is an update) */
  registeredPools?: readonly string[];
  /**
   * Key witnesses expected beyond those the parts call for. The transaction `build()` returns
   * keeps that many witnesses of keys it does not ask for, the first given
   */
  extraKeyWitnesses?: number;
  /**
   * `true`, the default: when the collateral inputs given by `collateral` parts do not cover the
   * collateral, the builder adds inputs from the payer's UTxOs, as it chooses collateral when
   * none is given. `false`: the given inputs are used as they are, and collateral they do not
   * cover is INSUFFICIENT_COLLATERAL. Without a `collateral` part the builder chooses all of it
   * either way
   */
  topUpCollateral?: boolean;
  /**
   * `true`, the default: the transaction states its total collateral and returns what is left of
   * the collateral inputs. `false`: it carries collateral inputs only, neither a collateral
   * return nor a total collateral, so all of their lovelace is at stake if a script fails; they
   * must hold lovelace only then. The builder puts up the least it can: it minimises the
   * lovelace at stake plus, for each input after the first, the fee of one more input with its
   * key witness, so it takes one input unless more inputs spare more than they cost; the search
   * is exact for one, two and three inputs, pairs and triples sought among the 64 largest UTxOs
   * below what is missing; ties go to fewer inputs, then to the smaller out refs. UTxOs holding a
   * reference script come only when the others do not cover
   */
  collateralReturn?: boolean;
  /**
   * Transactions built before this one and not yet seen by the provider: their inputs are not
   * selected again, their change is selectable, and all their outputs can be spent or read by
   * out ref without a lookup. Only change becomes selectable, never an output paid to another:
   * of their change, only the outputs at this build's change address are selected. A part that
   * names an output they spend is refused with UTXO_NOT_FOUND. Their collateral inputs stay
   * selectable, since a valid transaction does not spend them. The build keeps nothing of them:
   * a transaction not given here is not known to it. A plan given here stands for its steps that
   * are in a block, or may still land: the inputs they spend are not selected, their change at
   * this build's change address is selectable, and their outputs can be named by out ref. A
   * final step stands for its inputs alone: what it spent is never selected, also from a read
   * that still lists it, and what it left is taken from the payer's read. A step that will not
   * land stands for nothing. Their outputs and `knownUtxos`, not the payer's UTxOs, are what an
   * evaluator without `acceptsKnownUtxos` is handed.
   */
  after?: BuiltTxData | TxPlan | readonly (BuiltTxData | TxPlan)[];
  /**
   * Outputs the parts may name by out ref that the provider may not know yet; never selected.
   * Being listed here makes no UTxO selectable and takes none out of selection: one the payer
   * also holds is still selected. They are used as given, and reach every evaluator with the
   * transaction, as the outputs of `after` do; the payer's UTxOs reach only one that sets
   * `acceptsKnownUtxos`. Each may be in any form the builder takes a UTxO in.
   */
  knownUtxos?: readonly UtxoInput[];
  /**
   * Aborts the build with ABORTED: a wallet read, a lookup, the collateral call or an evaluation
   * that is pending is no longer waited for
   */
  signal?: AbortSignal;
  /** Receives the steps of the build, for diagnostics; whatever it throws or rejects with is ignored */
  trace?: (event: BuildEvent) => void;
};

/**
 * What the old builder's calls declared about outputs a build has no data for. Not a build
 * option: only `MeshTxBuilder` passes it, under `DECLARED_OUTPUTS`, which the package does not
 * export.
 */
export type DeclaredOutputs = {
  /** Out refs (`txHash#index`) not looked up: the reference inputs and scripts naming them stay as given */
  readonly unread: ReadonlySet<string>;
  /** Reference-script sizes declared for out refs whose UTxO the build does not know, for the fee */
  readonly scriptSizes: ReadonlyMap<string, number>;
  /** Out refs named as collateral that selection may still spend, as the old builder's did */
  readonly selectableCollateral: ReadonlySet<string>;
};

/** The key `DeclaredOutputs` travels under in the options of a build */
export const DECLARED_OUTPUTS: unique symbol = Symbol("declared outputs");

/** Every part kind, once: the compiler checks the list against `TxPart` */
const PART_KINDS: ReadonlySet<string> = new Set(
  Object.keys({
    spend: true,
    referenceInput: true,
    collateral: true,
    collateralReturn: true,
    output: true,
    mint: true,
    withdrawal: true,
    guard: true,
    validity: true,
    metadata: true,
    auxiliaryScript: true,
    donation: true,
    treasuryValue: true,
    networkId: true,
    certificate: true,
    vote: true,
    proposal: true,
  } satisfies Record<TxPart["kind"], true>),
);

const isPart = (value: unknown): value is TxPart =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  PART_KINDS.has((value as { kind?: unknown }).kind as string);

/**
 * The members a part of each kind always has, as the part builders make it. A part put
 * together by hand is held as it is, but one without them cannot be read
 */
const PART_MEMBERS: Readonly<Record<TxPart["kind"], readonly string[]>> = {
  spend: ["input", "witness"],
  referenceInput: ["input"],
  collateral: ["input"],
  collateralReturn: ["address"],
  output: ["output"],
  mint: ["policyId", "assets", "witness"],
  withdrawal: ["witness"],
  guard: ["credential", "witness"],
  validity: [],
  metadata: ["metadataLabel", "value"],
  auxiliaryScript: ["script"],
  donation: ["amount"],
  treasuryValue: ["amount"],
  networkId: ["networkId"],
  certificate: ["certificate", "witness"],
  vote: ["voter", "votes", "witness"],
  proposal: ["proposal", "witness"],
};

/** The first member a part lacks of those its kind always has */
const missingMember = (part: TxPart): string | undefined =>
  PART_MEMBERS[part.kind].find((member) => {
    const value = (part as unknown as Record<string, unknown>)[member];
    return value === undefined || value === null;
  });

const PARTS_ALLOWED =
  "a part, or a list of parts, nested lists, false, null and undefined";

const invalidParts = (entry: unknown, reason: string) =>
  new TxBuildError("INVALID_OPTION", `invalid parts: ${reason}`, {
    details: { option: "parts", value: entry, allowed: PARTS_ALLOWED },
  });

/** The members a part linked to an earlier step has beside kind, label and link, by its kind */
const LINKED_MEMBERS: Readonly<
  Partial<Record<TxPart["kind"], readonly string[]>>
> = { spend: ["witness"], referenceInput: [], collateral: [] };

/**
 * Refuses a part linked to an earlier step that the part builders could not have made: a kind
 * that takes no link, a member such a part does not have or lacks, and a link that is not
 * `{ step, output }`, or `{ step, change: true }` in a spend by key. A hand-made object and a
 * part read from JSON are read as strictly as the record reads a linked part
 * @throws TxBuildError INVALID_OPTION (`parts`) for the kind and the members; TxPartError
 *   INVALID_OUT_REF for the link, as the part builders give it
 */
const checkLinked = (part: TxPart & { link: unknown }) => {
  const members = LINKED_MEMBERS[part.kind];
  if (members === undefined)
    throw invalidParts(
      part,
      `a part of kind ${part.kind} linked to an earlier step: only spend, referenceInput and collateral take a link; give parts made by the part builders`,
    );
  const record = part as unknown as Record<string, unknown>;
  const allowed = ["kind", "label", "link", ...members];
  const extra = Object.keys(record).find((key) => !allowed.includes(key));
  const missing = members.find(
    (member) => record[member] === undefined || record[member] === null,
  );
  if (extra !== undefined || missing !== undefined)
    throw invalidParts(
      part,
      `a part of kind ${part.kind} linked to an earlier step ${extra !== undefined ? `with the member ${extra}` : `without ${missing}`}; give parts made by the part builders`,
    );
  const ctx = {
    part: part.kind,
    ...(typeof part.label === "string" && { label: part.label }),
  };
  const { link } = part;
  if (typeof link !== "object" || link === null || Array.isArray(link))
    fail(
      ctx,
      "INVALID_OUT_REF",
      `expected a link { step, output } to an output of an earlier step; got ${describe(link)}`,
    );
  const witness = record.witness as { type?: unknown } | undefined;
  toStepLink(
    ctx,
    link as Record<string, unknown>,
    part.kind === "spend" && witness?.type === "key",
  );
};

/** Refuses a part without a member its kind always has */
const checkMembers = (part: TxPart, links = false) => {
  // A part linked to an earlier step holds `link` in place of `input`: a plan reads it
  // strictly, and refuseLinked refuses it anywhere else
  if ("link" in part) {
    if (links) checkLinked(part as TxPart & { link: unknown });
    return;
  }
  const member = missingMember(part);
  if (member !== undefined)
    throw invalidParts(
      part,
      `a part of kind ${part.kind} without ${member}; give parts made by the part builders`,
    );
};

/** The parts, when none is linked to an earlier step: only a plan fills such a part in */
const refuseLinked = (parts: TxPart[]): TxPart[] => {
  const linked = incomplete(parts.filter((part) => "link" in part));
  if (linked.length > 0) throw unresolvedError(linked);
  return parts;
};

/**
 * The parts of a `PartsInput`, in order: nested lists flattened depth first, `false`, `null` and
 * `undefined` dropped
 * @param options.links Parts linked to an earlier step are kept, for a plan that fills them in,
 *   each read as strictly as a record reads it
 * @throws TxBuildError INVALID_OPTION for an entry that is none of these, and for a part that
 *   lacks a member its kind always has; UNRESOLVED (the gap `link`) for parts linked to an
 *   earlier step of a plan, unless `links` is set; with `links`, INVALID_OPTION for a linked
 *   part the part builders could not have made
 * @throws TxPartError INVALID_OUT_REF, with `links`, for a link that is not `{ step, output }`,
 *   or `{ step, change: true }` in a spend by key
 */
export const flattenParts = (
  input: unknown,
  options?: { links?: boolean },
): TxPart[] => {
  const linked = (parts: TxPart[]) =>
    options?.links === true ? parts : refuseLinked(parts);
  if (!Array.isArray(input)) {
    if (isPart(input)) {
      checkMembers(input, options?.links === true);
      return linked([input]);
    }
    throw invalidParts(
      input,
      `expected ${PARTS_ALLOWED}; got ${describe(input)}`,
    );
  }
  const parts: TxPart[] = [];
  const open = new Set<unknown>();
  const visit = (entry: unknown) => {
    if (entry === false || entry === null || entry === undefined) return;
    if (Array.isArray(entry)) {
      if (open.has(entry)) throw invalidParts(entry, "a list holds itself");
      open.add(entry);
      for (const nested of entry) visit(nested);
      open.delete(entry);
      return;
    }
    if (!isPart(entry))
      throw invalidParts(
        entry,
        `an entry is neither a part nor a list: ${describe(entry)}; give parts made by the part builders`,
      );
    checkMembers(entry, options?.links === true);
    parts.push(entry);
  };
  visit(input);
  return linked(parts);
};

/** The parts of a builder made by the constructor: none */
const EMPTY_PARTS: readonly TxPart[] = Object.freeze([]);

const describe = (value: unknown): string => {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "object" && value !== null)
    return Array.isArray(value) ? "a list" : "an object";
  return String(value);
};

const invalidOption = (
  option: string,
  value: unknown,
  allowed: string,
  cause?: unknown,
) =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid ${option}: expected ${allowed}; got ${describe(value)}`,
    {
      details: { option, value, allowed },
      ...(cause !== undefined && { cause }),
    },
  );

/**
 * An option given as a payment address that is not one. A key may be given there by mistake, so
 * the message tells the shape of what was given and `details.value` its JavaScript type, never
 * the value, and the parser's error is not the `cause`
 */
const unreadableAddress = (option: string, value: unknown, allowed: string) =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid ${option}: expected ${allowed}; got ${givenShape(value)}${typeof value === "string" ? " that is not a payment address" : ""}`,
    { details: { option, value: kindOf(value), allowed } },
  );

/** A serializer that failed on a prototype, or answered with something that is no transaction */
const unsupportedSerializer = (reason: string, cause?: unknown) =>
  new TxBuildError(
    "UNSUPPORTED_SERIALIZER",
    `the serializer cannot serialize a TransactionPrototype: ${reason}`,
    cause === undefined ? undefined : { cause },
  );

const SEND_ALL_TO_ALLOWED = "a payment address, in bech32 or hex";
const PARAMS_ALLOWED = "a whole Protocol";
const AFTER_ALLOWED =
  "a transaction built by TxBuilder.build (txHash, inputs, outputs, change), a plan, or a list of them";

/** A transaction of `after` as the build reads it: its UTxOs copied, its change marked */
type AfterTx = ChainedTx & { txHash: string; outputs: BuiltOutput[] };

/** An entry of a list option that is not of its type, with why */
const invalidEntry = (
  option: string,
  entry: unknown,
  allowed: string,
  reason: string,
  cause?: unknown,
) =>
  new TxBuildError("INVALID_OPTION", `invalid ${option}: ${reason}`, {
    details: { option, value: entry, allowed },
    ...(cause !== undefined && { cause }),
  });

/** The JavaScript type of a value, which an error about `after` names in place of the value */
const kindOf = (value: unknown) => (value === null ? "null" : typeof value);

/**
 * The transactions of `after`, checked by their shape and copied: UTxOs in normal form, with
 * their own members only, transaction hashes in lower case, change outputs marked. An error
 * names the type of what was given, never its value
 */
const toAfter = (after: unknown): AfterTx[] => {
  if (after === undefined) return [];
  if (typeof after !== "object" || after === null)
    throw invalidEntry(
      "after",
      kindOf(after),
      AFTER_ALLOWED,
      `expected ${AFTER_ALLOWED}; got ${kindOf(after)}`,
    );
  const given: unknown[] = Array.isArray(after) ? after : [after];
  // A plan stands for its steps that are in a block and not final, or may still land
  const entries = given.flatMap((entry, i) =>
    entry instanceof TxPlan
      ? standingSteps(entry).map((step) => ({ entry: step as unknown, i }))
      : [{ entry, i }],
  );
  return entries.map(({ entry, i }) => {
    const where = Array.isArray(after) ? `entry ${i}` : "the transaction";
    const tx = entry as Record<string, unknown> | null;
    if (
      typeof tx !== "object" ||
      tx === null ||
      typeof tx.txHash !== "string" ||
      !Array.isArray(tx.inputs) ||
      !Array.isArray(tx.outputs) ||
      !Array.isArray(tx.change)
    )
      throw invalidEntry(
        "after",
        kindOf(entry),
        AFTER_ALLOWED,
        `${where} is not a built transaction: expected ${AFTER_ALLOWED}; got ${kindOf(entry)}`,
      );
    try {
      return {
        txHash: tx.txHash.toLowerCase(),
        inputs: (tx.inputs as unknown[]).map((input) => readUtxo(input)),
        outputs: (tx.outputs as unknown[]).map((output): BuiltOutput => ({
          ...readUtxo(output),
          ...((output as BuiltOutput).change === true && {
            change: true as const,
          }),
        })),
      };
    } catch (error) {
      throw invalidEntry(
        "after",
        kindOf(entry),
        AFTER_ALLOWED,
        `${where} holds an input or output that is not a UTxO: ${errorText(error)}`,
        error,
      );
    }
  });
};

/** An abort signal by its shape, whatever made it */
const isAbortSignal = (value: unknown): value is AbortSignal =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { aborted?: unknown }).aborted === "boolean" &&
  typeof (value as { addEventListener?: unknown }).addEventListener ===
    "function";

/**
 * Sends events to a `trace` callback. What it returns is not waited for, and what it throws or
 * rejects with is dropped: the build goes on as it would without it.
 */
const tracer =
  (trace: ((event: BuildEvent) => void) | undefined) => (event: BuildEvent) => {
    if (!trace) return;
    try {
      const answer: unknown = trace(event);
      if (
        typeof answer === "object" &&
        answer !== null &&
        typeof (answer as PromiseLike<unknown>).then === "function"
      )
        (answer as PromiseLike<unknown>).then(undefined, () => undefined);
    } catch {
      // Diagnostics never change a build
    }
  };

/**
 * The bytes collateral adds to a transaction at most, beyond what it has without: for each
 * input the ledger allows, the input and a key witness; and the fields of the return and the
 * total
 */
const collateralBytes = (params: Protocol) =>
  COLLATERAL_INPUT_BYTES * params.maxCollateralInputs + 100;

/** A coin as CIP-30 takes an amount: the CBOR of an unsigned integer, in hex */
const coinCbor = (lovelace: bigint) => {
  const writer = new CborWriter();
  writer.writeInt(lovelace);
  return writer.encodeAsHex();
};

/**
 * Checks the type of every option of a build but `payer`, converts `sendAllTo` to bech32
 * (base58 for Byron), and copies the transactions of `after` and the UTxOs of `knownUtxos`
 * @throws TxBuildError INVALID_OPTION naming the first option that is not of its type
 */
const checkBuildOptions = (
  options: BuildOptions,
): { sendAllTo?: string; after: AfterTx[]; knownUtxos: Utxo[] } => {
  const { canSelect, coinSelection, sendAllTo, signal, trace } = options;
  const { fee, registeredPools, extraKeyWitnesses } = options;
  if (canSelect !== undefined && typeof canSelect !== "function")
    throw invalidOption(
      "canSelect",
      canSelect,
      "a function telling whether a UTxO may be selected",
    );
  if (coinSelection !== undefined && typeof coinSelection !== "function")
    throw invalidOption(
      "coinSelection",
      coinSelection,
      "a function selecting inputs from its candidates",
    );
  if (trace !== undefined && typeof trace !== "function")
    throw invalidOption("trace", trace, "a function taking build events");
  if (signal !== undefined && !isAbortSignal(signal))
    throw invalidOption("signal", signal, "an AbortSignal");
  if (fee !== undefined && !(typeof fee === "bigint" && fee >= 0n))
    throw invalidOption("fee", fee, "a bigint of lovelace, 0 or more");
  if (
    registeredPools !== undefined &&
    !(
      Array.isArray(registeredPools) &&
      registeredPools.every((pool) => typeof pool === "string")
    )
  )
    throw invalidOption(
      "registeredPools",
      registeredPools,
      "a list of pool operator key hashes, as strings",
    );
  if (
    extraKeyWitnesses !== undefined &&
    !(Number.isInteger(extraKeyWitnesses) && extraKeyWitnesses >= 0)
  )
    throw invalidOption(
      "extraKeyWitnesses",
      extraKeyWitnesses,
      "a whole number, 0 or more",
    );
  if (
    options.topUpCollateral !== undefined &&
    typeof options.topUpCollateral !== "boolean"
  )
    throw invalidOption(
      "topUpCollateral",
      options.topUpCollateral,
      "a boolean",
    );
  if (
    options.collateralReturn !== undefined &&
    typeof options.collateralReturn !== "boolean"
  )
    throw invalidOption(
      "collateralReturn",
      options.collateralReturn,
      "a boolean",
    );
  const after = toAfter(options.after);
  const knownUtxos = toKnownUtxos(options.knownUtxos);
  if (sendAllTo === undefined) return { after, knownUtxos };
  if (typeof sendAllTo !== "string")
    throw invalidOption("sendAllTo", sendAllTo, SEND_ALL_TO_ALLOWED);
  try {
    return { sendAllTo: toAddressText(sendAllTo), after, knownUtxos };
  } catch {
    throw unreadableAddress("sendAllTo", sendAllTo, SEND_ALL_TO_ALLOWED);
  }
};

/**
 * Refuses a `collateralReturn` part in a build with `collateralReturn: false`: the part asks for
 * a return the option forbids
 * @throws TxBuildError INVALID_OPTION (`collateralReturn`), naming the part
 */
const refuseCollateralReturn = (parts: readonly TxPart[]): void => {
  const part = parts.find((p) => p.kind === "collateralReturn");
  if (!part) return;
  throw new TxBuildError(
    "INVALID_OPTION",
    "invalid collateralReturn: false leaves the collateral without a return, and a collateralReturn part asks for one; drop the part or the option",
    {
      part: part.kind,
      ...(part.label !== undefined && { label: part.label }),
      details: {
        option: "collateralReturn",
        value: false,
        allowed: "true or left out, with a collateralReturn part",
      },
    },
  );
};

/** A redeemer of a built transaction */
export type BuiltRedeemer = {
  tag: AssembledRedeemer["tag"];
  index: number;
  /** Execution units, as bigint like `BuiltTxData.exUnits` */
  exUnits: { mem: bigint; steps: bigint };
  /** The redeemer data, in CBOR hex, as the transaction carries it */
  data: string;
  /**
   * The part the redeemer belongs to; absent on a transaction completed by `finalize` or made by
   * `fromCbor`, which have no parts
   */
  part?: AssembledRedeemer["part"];
  label?: string;
};

/** Something worth knowing that did not stop the build */
export type BuildWarning = {
  /**
   * - `VALID_FROM_FUTURE`: the slot of the transaction's lower bound starts after the current
   *   time of the local clock
   * - `COLLATERAL_FORFEITED`: the transaction puts up collateral and has no collateral return:
   *   all of the collateral is at stake. It comes with `collateralReturn: false`, when what is
   *   left of the collateral inputs is too small to be returned, and for a transaction made by
   *   `fromCbor` whose body has collateral inputs and no return
   * - `COLLATERAL_RETURN_ELSEWHERE`: a collateral input is held by another payment credential
   *   than the one the collateral return pays: if a script fails, every collateral input of
   *   such a holder leaves it, however small the total collateral the body states, and whoever
   *   submits the transaction can mark it as failing. The message names each holder that loses,
   *   by an address of its collateral inputs, with the lovelace it loses: those of its inputs,
   *   less what the return pays it. Only from `fromCbor`
   * - `FEE_ABOVE_MINIMUM`: the `fee` given is above the minimum fee of the transaction
   *
   * The list is open: later versions may add codes, so code that reads it keeps a default
   * branch.
   */
  code:
    | "VALID_FROM_FUTURE"
    | "COLLATERAL_FORFEITED"
    | "COLLATERAL_RETURN_ELSEWHERE"
    | "FEE_ABOVE_MINIMUM";
  message: string;
  /** The kind of the part it is about */
  part?: TxPart["kind"];
  /** The label of that part, when it has one */
  label?: string;
};

/** An output of a built transaction, as the UTxO it becomes, with the marks of its part */
export type BuiltOutput = Utxo & {
  /** The label of the output part it comes from */
  readonly label?: string;
  /**
   * Set on change outputs: those at the payer's change address that took change; of a
   * transaction completed by `finalize`, every output at its `changeAddress`; on no output of a
   * transaction made by `fromCbor`
   */
  readonly change?: true;
};

/**
 * A transaction built and balanced, ready to sign. Plain data. `build()` and `finalize()` return
 * it as a `BuiltTx`; a step of a plan is this data with its place in the plan. `fromCbor()`
 * returns the same data of a transaction it did not build: read from its bytes and from the UTxOs
 * of its inputs.
 */
export type BuiltTxData = {
  /**
   * The unsigned transaction, in CBOR hex. From `fromCbor`, the transaction given without its
   * vkey and bootstrap witnesses, every other byte as given
   */
  tx: string;
  /** The hash of the body of `tx` */
  txHash: string;
  /**
   * The transaction as a value. Of a build, exactly what `tx` was serialized from. From
   * `fromCbor`, what `tx` reads as: serializing it again need not give the same bytes or the
   * same hash. It follows the transaction format of the current ledger era; code meant to
   * outlive an era reads the other members of `BuiltTxData`.
   */
  prototype: TransactionPrototype;
  fee: bigint;
  /** Total execution units of the transaction's redeemers */
  exUnits: { mem: bigint; steps: bigint };
  redeemers: BuiltRedeemer[];
  /** Every input spent, resolved, in the transaction's order */
  inputs: Utxo[];
  /** The inputs added to pay for the transaction; none from `finalize` and from `fromCbor` */
  selectedInputs: Utxo[];
  /** The reference inputs, resolved, in the transaction's order */
  referenceInputs: Utxo[];
  /**
   * Every output as a UTxO of `txHash`, in body order, with its part's label. The collateral
   * return is not among them.
   */
  outputs: BuiltOutput[];
  /**
   * The change outputs, as UTxOs of `txHash`, in body order; each is also in `outputs`. A build
   * made before this transaction is seen by the provider passes it as `after`; when that build
   * has the same change address, it can then select this change. Empty from `fromCbor`: which
   * outputs of a transaction built elsewhere are change is not known.
   */
  change: BuiltOutput[];
  /**
   * The collateral, when the transaction runs Plutus scripts; of a transaction completed by
   * `finalize` or made by `fromCbor`, whenever the body has collateral inputs, in the body's
   * order. The inputs given by `collateral` parts come first, in their order, then those the
   * builder added to them or chose. Built with `collateralReturn: false`, it has no `return`,
   * and `total` is all the lovelace of the inputs.
   */
  collateral?: TxCollateral;
  /** The keys that must sign, each with the roles it is needed in */
  signers: TxSigners;
  /**
   * The validity interval, with the bounds the transaction has: in slots, and the POSIX
   * milliseconds those slots start at on the builder's network
   */
  validity?: {
    invalidBefore?: number;
    invalidHereafter?: number;
    from?: number;
    until?: number;
  };
  /**
   * The network the transaction was built for; from `fromCbor`, the builder's network, which
   * the transaction was checked against
   */
  network: { name: string; networkId: 0 | 1 };
  /**
   * What is worth knowing about the transaction and did not stop the build; often empty. From
   * `fromCbor`, the codes that follow from the bytes and the UTxOs: VALID_FROM_FUTURE,
   * COLLATERAL_FORFEITED and COLLATERAL_RETURN_ELSEWHERE
   */
  warnings: BuildWarning[];
  /**
   * Every part of the transaction, resolved, the ones added by balancing included; empty on a
   * transaction completed by `finalize` or made by `fromCbor`
   */
  parts: TxPart[];
};

/**
 * What the default evaluator of a builder without a provider looks UTxOs up through. It knows
 * none, so the evaluator's own error names an input the build did not hand it; the builder
 * hands it every UTxO it knows, and never reads through it.
 */
const NO_PROVIDER: IFetcher = (() => {
  const none = () => Promise.reject(new Error("the builder has no provider"));
  return {
    fetchUTxOs: async () => [],
    fetchAccountInfo: none,
    fetchAddressUTxOs: none,
    fetchAddressTxs: none,
    fetchAssetAddresses: none,
    fetchAssetMetadata: none,
    fetchBlockInfo: none,
    fetchCollectionAssets: none,
    fetchProtocolParameters: none,
    fetchCostModels: none,
    fetchTxInfo: none,
    fetchGovernanceProposal: none,
    get: none,
  };
})();

/** Calls a wallet method, its answer or its failure as a value, a synchronous throw included */
const attemptCall = async <T>(
  call: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> => {
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    return { ok: false, error };
  }
};

/** Most evaluation rounds; the second one normally settles the execution units */
const MAX_EVALUATION_ROUNDS = 5;

const EVALUATOR_TAGS: Record<RedeemerTagType, AssembledRedeemer["tag"]> = {
  SPEND: "SPEND",
  MINT: "MINT",
  CERT: "CERT",
  REWARD: "REWARD",
  VOTE: "VOTE",
  PROPOSE: "VOTING_PROPOSAL",
};

/**
 * The script failures an evaluator reports, each joined to the part whose redeemer it ran, by
 * tag and index. A failure that points at no redeemer of the transaction is left out.
 */
const partFailures = (
  failures: readonly ScriptFailure[],
  redeemers: readonly AssembledRedeemer[],
): PartFailure[] =>
  failures.flatMap((failure) => {
    const redeemer = redeemers.find(
      (r) => r.tag === EVALUATOR_TAGS[failure.tag] && r.index === failure.index,
    );
    if (!redeemer) return [];
    return [
      {
        ...failure,
        part: redeemer.part.kind,
        ...(redeemer.label !== undefined && { label: redeemer.label }),
      },
    ];
  });

/**
 * What is wrong with an evaluator's answer, or undefined for a list of entries with an index of
 * 0 or more and a budget of whole `mem` and `steps`. Tags are not checked: an unknown tag matches
 * no redeemer, which is reported as such.
 */
const evaluationAnswerProblem = (answer: unknown): string | undefined => {
  if (!Array.isArray(answer))
    return `something that is not a list: ${answer === null ? "null" : typeof answer}`;
  for (const [i, entry] of (answer as unknown[]).entries()) {
    if (typeof entry !== "object" || entry === null)
      return `an entry ${i} that is not an object`;
    const { index, budget } = entry as { index?: unknown; budget?: unknown };
    if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0)
      return `an entry ${i} with an invalid index ${String(index)}`;
    if (typeof budget !== "object" || budget === null)
      return `an entry ${i} without a budget`;
    const { mem, steps } = budget as { mem?: unknown; steps?: unknown };
    if (!isWholeNumber(mem) || !isWholeNumber(steps))
      return `an entry ${i} with an invalid budget: mem ${String(mem)}, steps ${String(steps)}`;
  }
  return undefined;
};

const toBudget = (units: ExUnitsPrototype): Budget => ({
  mem: Number(units.mem),
  steps: Number(units.steps),
});

/** Plutus data in CBOR hex, encoded as the serializer encodes it */
const dataCbor = (data: Readonly<PlutusDataVariant>): string =>
  data.type === "CBOR"
    ? data.hex
    : plutusDataVariantToCardano(data).toCbor().toString();

/**
 * The parts of an assembled transaction whose redeemer is a function, each with a frozen copy
 * that holds the data the function returned in that assembly: what a result reports in their
 * place, so that it stays plain data
 */
const computedParts = (assembled: AssembledTx): Map<TxPart, TxPart> => {
  // The witness set holds the redeemers in the same order
  const data = assembled.prototype.witness_set.redeemers ?? [];
  const computed = new Map<TxPart, TxPart>();
  assembled.redeemers.forEach((r, i) => {
    const { witness } = r.part as RedeemerPart & { witness: PlutusWitness };
    if (witness.redeemer.data.type !== "deferred") return;
    computed.set(
      r.part,
      freeze({
        ...r.part,
        witness: {
          ...witness,
          redeemer: {
            ...witness.redeemer,
            data: { type: "CBOR", hex: dataCbor(data[i]!.data) },
          },
        },
      } as TxPart),
    );
  });
  return computed;
};

/**
 * The redeemers of an assembled transaction as a result reports them, with the execution units
 * `unitsOf` gives each; one it gives none for is left out. A part with a redeemer function is
 * reported as its copy in `computed`.
 */
const builtRedeemers = (
  assembled: AssembledTx,
  unitsOf: (redeemer: AssembledRedeemer) => ExUnitsPrototype | undefined,
  computed: Map<TxPart, TxPart> = computedParts(assembled),
): BuiltRedeemer[] => {
  // The witness set holds the redeemers in the same order
  const data = assembled.prototype.witness_set.redeemers ?? [];
  return assembled.redeemers.flatMap((r, i) => {
    const units = unitsOf(r);
    if (!units) return [];
    return [
      {
        tag: r.tag,
        index: r.index,
        exUnits: { mem: BigInt(units.mem), steps: BigInt(units.steps) },
        data: dataCbor(data[i]!.data),
        part: (computed.get(r.part) ?? r.part) as RedeemerPart,
        ...(r.label !== undefined && { label: r.label }),
      },
    ];
  });
};

const runsPlutus = (part: TxPart) =>
  "witness" in part && part.witness.type === "plutus";

const withExUnits = (part: TxPart, exUnits: ExUnitsPrototype): TxPart => {
  const { witness } = part as Extract<TxPart, { witness: unknown }>;
  if (witness.type !== "plutus") return part;
  return freeze({
    ...part,
    witness: { ...witness, redeemer: { ...witness.redeemer, exUnits } },
  } as TxPart);
};

const exceeds = (a: ExUnitsPrototype, b: ExUnitsPrototype) =>
  BigInt(a.mem) > BigInt(b.mem) || BigInt(a.steps) > BigInt(b.steps);

const maxUnits = (
  a: ExUnitsPrototype,
  b: ExUnitsPrototype,
): ExUnitsPrototype => ({
  mem: (BigInt(a.mem) > BigInt(b.mem) ? a.mem : b.mem).toString(),
  steps: (BigInt(a.steps) > BigInt(b.steps) ? a.steps : b.steps).toString(),
});

/**
 * Builds transactions from parts: looks up what they leave open, balances them, works out the
 * execution units of their scripts, and serializes the result.
 *
 * A builder holds its network, providers and settings, and the parts added with `add`, which
 * returns a new builder and leaves this one as it is. `build` changes nothing in the builder, so
 * one builder can build any number of transactions, concurrently included. It reads through the
 * `CachedFetcher` of its provider, shared with every builder, wallet and evaluator over the same
 * provider, and evaluates scripts locally unless given another evaluator.
 *
 * ```ts
 * const builder = new TxBuilder({ network: "preprod", provider });
 * const { tx, fee } = await builder.build(
 *   output({ address, value: { lovelace: 5_000_000n } }),
 *   { payer: wallet },
 * );
 *
 * // Parts held by the builder go first; its own parts are the first argument of `build`
 * const unlock = builder.add(spend.plutus({ utxo, script, redeemer }));
 * const built = await unlock.build([], { payer: wallet });
 * ```
 */
export class TxBuilder {
  /** The network the builder builds for, resolved from the `network` option */
  readonly network: NetworkConfig;
  /** The provider as given; reads go through its shared cache */
  readonly provider?: Provider;
  /** The submitter as given */
  readonly submitter?: ISubmitter;
  /**
   * The evaluator in effect: the one given, or the default made for this builder; none after
   * `evaluator: null`
   */
  readonly evaluator?: IEvaluator;
  readonly serializer?: IMeshTxSerializer;
  /** The `params` option; never what was read from the provider */
  readonly params?: Protocol;
  /** The `costModels` option; never what was read from the provider */
  readonly costModels?: number[][];
  readonly deposits: GovernanceDeposits;
  /** The `planDefaults` option, checked; only the members it knows, as given */
  readonly planDefaults?: Readonly<
    PlanDeadlines & { pollMs?: number; resendMs?: number }
  >;
  /** The `store` option: where the records of this builder's plans are kept */
  readonly store?: TxPlanStore;
  /** The shared cache of the provider; every read goes through it */
  private readonly cache?: CachedFetcher;
  /** The parts added with `add`, flat and in order, as they were given; `build` takes them first */
  private readonly added: readonly TxPart[] = EMPTY_PARTS;

  /**
   * @throws TxBuildError INVALID_OPTION for a missing or unacceptable `network`;
   *   UNSUPPORTED_SERIALIZER for a serializer without `serializeTxPrototype`;
   *   MISSING_PARAMETER with neither a provider nor `params`;
   *   INVALID_OPTION for `params` that lack a field a build reads, or hold one that is not a
   *   number (`keyDeposit` and `poolDeposit` may be missing);
   *   NETWORK_MISMATCH when the provider states another network;
   *   INVALID_OPTION for a `planDefaults` that is not an object, or names the first of its
   *   members out of range: `ttlMs` or `pollMs` not above 0, `expiryMarginMs` below 0,
   *   `confirmations` not a whole number 0 or more, `resendMs` below the builder's `pollMs`;
   *   INVALID_OPTION for a `store` without `load` and `save` functions
   */
  constructor(options: TxBuilderOptions) {
    this.network = resolveNetwork(options?.network);
    const planDefaults = checkPlanDefaults(options.planDefaults);
    if (planDefaults) this.planDefaults = planDefaults;
    if (options.store !== undefined) {
      const store = options.store as unknown;
      const has = (name: string) =>
        typeof store === "object" &&
        store !== null &&
        typeof (store as Record<string, unknown>)[name] === "function";
      if (!has("load") || !has("save"))
        throw new TxBuildError(
          "INVALID_OPTION",
          "invalid store: expected an object with load and save functions",
          {
            details: {
              option: "store",
              // The type only: a store may hold a database handle, and errors get logged
              value:
                store === null
                  ? "null"
                  : Array.isArray(store)
                    ? "a list"
                    : typeof store === "object"
                      ? "an object without load and save functions"
                      : typeof store,
              allowed: "an object with load and save functions",
            },
          },
        );
      this.store = options.store;
    }
    if (options.serializer) {
      if (!options.serializer.serializeTxPrototype)
        throw new TxBuildError(
          "UNSUPPORTED_SERIALIZER",
          "the serializer does not implement serializeTxPrototype",
        );
      this.serializer = options.serializer;
    }
    if (!options.provider && !options.params)
      throw new TxBuildError(
        "MISSING_PARAMETER",
        "the builder needs protocol parameters: give it a provider to read them from, or params",
        { details: { parameter: "params" } },
      );
    if (options.params)
      try {
        checkProtocol(options.params);
      } catch (error) {
        throw new TxBuildError(
          "INVALID_OPTION",
          `invalid params: ${errorText(error)}`,
          {
            details: {
              option: "params",
              value: options.params,
              allowed: PARAMS_ALLOWED,
            },
            cause: error,
          },
        );
      }
    if (options.provider) {
      checkProviderNetwork(this.network, options.provider);
      this.provider = options.provider;
      this.cache = CachedFetcher.wrap(options.provider);
    }
    if (options.submitter) this.submitter = options.submitter;
    if (options.evaluator) this.evaluator = options.evaluator;
    // The default: local evaluation with Scalus, which reads the same shared cache
    else if (options.evaluator === undefined)
      this.evaluator = new OfflineEvaluatorScalus(
        options.provider ?? NO_PROVIDER,
      );
    if (options.params) this.params = options.params;
    if (options.costModels) this.costModels = options.costModels;
    this.deposits = { ...options.deposits };
  }

  /**
   * The network, parameters and cost models this builder builds on now, as data: the options
   * where given, else read from the provider
   * @throws TxBuildError MISSING_PARAMETER when the parameters or the cost models cannot be had
   */
  async chain(): Promise<ChainSnapshot> {
    const [params, costModels] = await Promise.all([
      this.loadParams(),
      this.loadCostModels(),
    ]);
    if (!costModels)
      throw new TxBuildError(
        "MISSING_PARAMETER",
        this.cache
          ? "the provider gave no cost models; give the builder costModels"
          : "the builder has no cost models: give it costModels, or a provider to read them from",
        { details: { parameter: "costModels" } },
      );
    // A copy, so that changing it changes neither the builder nor the provider's cache
    return structuredClone({ network: this.network, params, costModels });
  }

  /**
   * The slot containing a POSIX time on the builder's network (`"down"`, the default), or the
   * first slot starting at or after it (`"up"`)
   * @param time POSIX time in milliseconds, as a number or a bigint (e.g. a deadline decoded from
   *   a datum), or a Date
   * @throws TxBuildError INVALID_OPTION for a time that is not finite, a bigint that is not a safe
   *   integer, or another `round`
   */
  slotAt(time: number | bigint | Date, round?: "down" | "up"): number {
    const ms = time instanceof Date ? time.getTime() : time;
    if (!(
      typeof ms === "bigint" ||
      (typeof ms === "number" && Number.isFinite(ms))
    ))
      throw new TxBuildError(
        "INVALID_OPTION",
        `invalid time ${String(time)}: expected POSIX milliseconds as a finite number or a bigint, or a valid Date`,
        {
          details: {
            option: "time",
            value: time,
            allowed:
              "a finite number or a bigint of POSIX milliseconds, or a valid Date",
          },
        },
      );
    if (round !== undefined && round !== "down" && round !== "up")
      throw new TxBuildError(
        "INVALID_OPTION",
        `invalid round ${String(round)}: expected "down" or "up"`,
        {
          details: { option: "round", value: round, allowed: '"down" or "up"' },
        },
      );
    try {
      return slotAt(this.network, ms, round);
    } catch (error) {
      // The network is resolved, so only a bigint out of range is refused
      throw invalidOption(
        "time",
        time,
        `a bigint from -${Number.MAX_SAFE_INTEGER} to ${Number.MAX_SAFE_INTEGER}`,
        error,
      );
    }
  }

  /**
   * The POSIX time in milliseconds at which a slot starts on the builder's network
   * @throws TxBuildError INVALID_OPTION for a slot that is not a finite number
   */
  timeAt(slot: number | bigint): number {
    if (!(
      (typeof slot === "number" || typeof slot === "bigint") &&
      Number.isFinite(Number(slot))
    ))
      throw new TxBuildError(
        "INVALID_OPTION",
        `invalid slot ${String(slot)}: expected a finite number or a bigint`,
        {
          details: {
            option: "slot",
            value: slot,
            allowed: "a finite number, or a bigint",
          },
        },
      );
    return timeAt(this.network, slot);
  }

  /**
   * The address of a script on the builder's network; Plutus `code` in any CBOR wrapping,
   * normalised as the parts normalise it, so lock address and unlock witness always agree
   * @param stake The stake credential of a base address: a bech32 reward address (only its
   *   credential is taken), or `{ type: "KEY" | "SCRIPT", value: <hash> }`; without it, an
   *   enterprise address
   * @throws TxBuildError INVALID_OPTION for a script or a stake credential that cannot be read
   */
  scriptAddress(
    script: PlutusScript | NativeScript,
    stake?: CredentialInput,
  ): string {
    return scriptAddressOn(this.network, script, stake);
  }

  /**
   * The reward address of a script, or of a key or script credential, on the builder's network
   * @param credential A `PlutusScript` or `NativeScript`; a bech32 reward address (only its
   *   credential is taken); or `{ type: "KEY" | "SCRIPT", value: <hash> }`
   * @throws TxBuildError INVALID_OPTION for a script or credential that cannot be read
   */
  rewardAddress(
    credential: PlutusScript | NativeScript | CredentialInput,
  ): string {
    return rewardAddressOn(this.network, credential);
  }

  /**
   * Serializes a transaction prototype as this builder does: with its serializer, or the
   * `@meshsdk/core-cst` prototype encoder
   * @throws TxBuildError UNSUPPORTED_SERIALIZER when the serializer throws, with its error as
   *   `cause`, or answers with something that is not CBOR in hex
   */
  serialize(prototype: TransactionPrototype): string {
    if (!this.serializer) return transactionPrototypeToHex(prototype);
    let tx: unknown;
    try {
      tx = this.serializer.serializeTxPrototype!(prototype);
    } catch (error) {
      throw unsupportedSerializer(errorText(error), error);
    }
    if (typeof tx !== "string" || !/^(?:[0-9a-fA-F]{2})+$/.test(tx))
      throw unsupportedSerializer(
        `it answered with ${typeof tx === "string" ? `${JSON.stringify(tx.slice(0, 64))}, which is not CBOR in hex` : `a ${tx === null ? "null" : typeof tx}, not CBOR in hex`}`,
      );
    return tx;
  }

  /**
   * The hash of a transaction this builder serialized; for one its serializer made that does not
   * decode, UNSUPPORTED_SERIALIZER
   */
  private txHashOf(tx: string): string {
    try {
      return Transaction.fromCbor(TxCBOR(tx)).getId().toString();
    } catch (error) {
      if (!this.serializer) throw error;
      throw unsupportedSerializer(
        `it answered with CBOR that is not a transaction: ${errorText(error)}`,
        error,
      );
    }
  }

  /**
   * Completes an edited or hand-assembled prototype without balancing it: recomputes the script
   * data and auxiliary data hashes, prices it for its signers and, given `changeAddress`, takes
   * a fee increase from the change output there: the last output at that address that still
   * holds its minimum lovelace afterwards. A fee that covers the minimum is kept as it is.
   *
   * Scripts are not run again: redeemers keep the execution units the prototype states. After an
   * edit that a script can see, build again from parts instead. Collateral is not changed. Key
   * and bootstrap witnesses of the prototype are dropped: the result is unsigned, and priced for
   * the keys the prototype calls for, no others. The prototype given is not changed.
   *
   * The prototype must name each output once among its inputs, once among its reference inputs
   * and once among its collateral inputs, and must not read an output it spends: it is refused
   * otherwise, not repaired, since its redeemers may rely on its positions.
   *
   * The result has no parts: `parts` and `selectedInputs` are empty, redeemers carry no `part`
   * and outputs no `label`. `change` holds every output at `changeAddress`, a payment to that
   * address included; without `changeAddress` it is empty. The result is a `BuiltTx`, as
   * from `build`.
   *
   * ```ts
   * const edited = structuredClone(built.prototype);
   * edited.body.ttl = String(builder.slotAt(Date.now() + 600_000));
   * const final = await builder.finalize(edited, { inputs: built.inputs, changeAddress });
   * ```
   * @param context.inputs The UTxOs its inputs, reference inputs and collateral inputs spend or
   *   read: all of them, none is looked up; each in any form the builder takes a UTxO in
   * @param context.changeAddress In bech32 or hex
   * @throws TxBuildError FEE_TOO_LOW `{ fee, minFee }` when the fee is now too small and there is
   *   no change output to take it from; UTXO_NOT_FOUND `{ input }` for an input, reference input
   *   or collateral input whose UTxO is not given; INSUFFICIENT_COLLATERAL `{ required,
   *   available }` when the raised fee is no longer covered by the collateral of a transaction
   *   that runs Plutus scripts; MISSING_PARAMETER when such a transaction's cost models are not
   *   known; INVALID_OPTION for a `changeAddress` that is no address, and for `inputs` that is
   *   not a list of UTxOs; FEE_NOT_CONVERGED when the fee does not settle; UNSUPPORTED_SERIALIZER
   *   when the builder's serializer throws, or answers with something that is not a transaction
   *   in CBOR hex; MISSING_PARAMETER when the provider's protocol parameters lack a field a
   *   build reads, or hold one that is not a number; DUPLICATE_PART `{ item }`, the out ref, for
   *   a prototype whose inputs, reference inputs or collateral inputs name one output twice, or
   *   whose reference inputs name an output it spends
   */
  async finalize(
    prototype: TransactionPrototype,
    context: { inputs: readonly UtxoInput[]; changeAddress?: string },
  ): Promise<BuiltTx> {
    const { inputs, changeAddress: changeTo } = context ?? {};
    if (!Array.isArray(inputs))
      throw invalidOption("inputs", inputs, FINALIZE_INPUTS_ALLOWED);
    let changeAddress: string | undefined;
    if (changeTo !== undefined)
      try {
        changeAddress = toAddressText(changeTo);
      } catch {
        throw unreadableAddress("changeAddress", changeTo, SEND_ALL_TO_ALLOWED);
      }
    const given = new Map<string, Utxo>();
    inputs.forEach((entry: unknown, i) => {
      let utxo: Utxo;
      try {
        utxo = readUtxo(entry);
      } catch (error) {
        throw invalidEntry(
          "inputs",
          kindOf(entry),
          FINALIZE_INPUTS_ALLOWED,
          `entry ${i} is not a UTxO: ${errorText(error)}`,
          error,
        );
      }
      given.set(utxoKey(utxo), utxo);
    });

    // A copy without key witnesses: none would verify over a changed body, and the fee is
    // priced for the keys the transaction calls for
    const draft = structuredClone(prototype);
    delete draft.witness_set.vkeys;
    delete draft.witness_set.bootstraps;
    const { body } = draft;
    // Positions are the prototype's own: a repeat is refused, never dropped
    checkPrototypeRepeats(body);
    const utxoOf =
      (role: string) =>
      (input: { transaction_id: string; index: number }): Utxo => {
        const utxo = given.get(
          `${input.transaction_id.toLowerCase()}#${input.index}`,
        );
        if (utxo) return utxo;
        throw new TxBuildError(
          "UTXO_NOT_FOUND",
          `the UTxO of ${input.transaction_id}#${input.index}, which the transaction ${role}, is not given in inputs`,
          {
            details: {
              input: { txHash: input.transaction_id, outputIndex: input.index },
            },
          },
        );
      };
    const spent = body.inputs.map(utxoOf("spends"));
    const collateral = (body.collateral ?? []).map(
      utxoOf("puts up as collateral"),
    );
    const references = (body.reference_inputs ?? []).map(utxoOf("reads"));
    const changeOutputs = new Set<number>();
    if (changeAddress !== undefined)
      body.outputs.forEach((output, i) => {
        if (sameAddress(output.address, changeAddress)) changeOutputs.add(i);
      });

    // A Plutus script runs only for a redeemer: datums alone need no cost model
    const runsPlutus = (draft.witness_set.redeemers?.length ?? 0) > 0;
    const [params, costModels] = await Promise.all([
      this.loadParams(),
      runsPlutus ? this.loadCostModels() : Promise.resolve(undefined),
    ]);
    if (runsPlutus && !costModels)
      throw new TxBuildError(
        "MISSING_PARAMETER",
        this.cache
          ? "the transaction runs Plutus scripts, and the provider gave no cost models; give the builder costModels"
          : "the transaction runs Plutus scripts, and the builder has no cost models: give it costModels, or a provider to read them from",
        { details: { parameter: "costModels" } },
      );

    // Who signs, and the scripts the body calls for, as for a transaction built elsewhere
    const unsigned = this.serialize(draft);
    let read: ReturnType<typeof readTransaction>;
    try {
      read = readTransaction(unsigned);
    } catch (error) {
      if (!this.serializer) throw error;
      const cause = (error as { cause?: unknown }).cause ?? error;
      throw unsupportedSerializer(
        `it answered with CBOR that is not a transaction: ${errorText(cause)}`,
        cause,
      );
    }
    const { collected, scripts } = bodySigners(read, [
      ...spent,
      ...collateral,
      ...references,
    ]);
    const languages = runsPlutus
      ? plutusLanguages(draft, [...spent, ...references], scripts)
      : new Set<LanguageVersion>();

    // Both hashes from the bytes of this builder's serializer, which the fee does not change
    const scriptDataHash = scriptDataHashOf(
      unsigned,
      languages,
      costModels ?? [],
    );
    if (scriptDataHash) body.script_data_hash = scriptDataHash;
    else delete body.script_data_hash;
    const auxiliaryDataHash = auxiliaryDataHashOf(unsigned);
    if (auxiliaryDataHash) body.auxiliary_data_hash = auxiliaryDataHash;
    else delete body.auxiliary_data_hash;

    const { vkeyWitnesses, bootstrapWitnesses } = placeholderWitnesses({
      keyHashes: collected.priced,
      byronAddresses: collected.byronAddresses,
    });
    const refScripts = bodyRefScriptSize(body, [...spent, ...references]);
    const exUnits = prototypeExUnits(draft);
    const priceOf = (candidate: TransactionPrototype) =>
      feeForSize(
        this.serialize({
          ...candidate,
          witness_set: {
            ...candidate.witness_set,
            ...(vkeyWitnesses.length > 0 && { vkeys: vkeyWitnesses }),
            ...(bootstrapWitnesses.length > 0 && {
              bootstraps: bootstrapWitnesses,
            }),
          },
        }).length / 2,
        refScripts,
        exUnits,
        params,
      );

    const fee = BigInt(body.fee);
    let required = priceOf(draft);
    let final = draft;
    if (required > fee) {
      const feeTooLow = (reason: string) =>
        new TxBuildError(
          "FEE_TOO_LOW",
          `the fee ${fee} is below the transaction's minimum fee ${required}, and ${reason}`,
          { details: { fee, minFee: required } },
        );
      if (changeAddress === undefined)
        throw feeTooLow("no changeAddress is given to take the increase from");
      let settled = false;
      for (let round = 0; round < MAX_FINALIZE_ROUNDS && !settled; round++) {
        // The whole increase from one output, counted from the prototype as given: the last
        // output at the change address that still holds its minimum afterwards
        const increase = required - fee;
        const lowered = (i: number) => {
          const output = body.outputs[i]!;
          const coin = BigInt(output.amount.coin) - increase;
          return coin < 0n
            ? undefined
            : {
                ...output,
                amount: { ...output.amount, coin: coin.toString() },
              };
        };
        const payer = [...changeOutputs].reverse().find((i) => {
          const output = lowered(i);
          return (
            output !== undefined &&
            coversMinCoin(output, params.coinsPerUtxoSize)
          );
        });
        if (payer === undefined)
          throw feeTooLow(
            changeOutputs.size === 0
              ? `no output is at the change address ${changeAddress}`
              : `no output at the change address ${changeAddress} can pay ${increase} lovelace and keep its minimum`,
          );
        const candidate = structuredClone(draft);
        candidate.body.fee = required.toString();
        candidate.body.outputs[payer] = lowered(payer)!;
        const next = priceOf(candidate);
        if (next <= required) {
          final = candidate;
          settled = true;
        } else required = next;
      }
      if (!settled)
        throw new TxBuildError(
          "FEE_NOT_CONVERGED",
          `the fee did not settle within ${MAX_FINALIZE_ROUNDS} rounds`,
        );
      if (runsPlutus) checkCollateral(final, collateral, params);
    }

    const tx = this.serialize(final);
    const txHash = this.txHashOf(tx);
    const outputs = bodyOutputs(txHash, final.body).map(
      (utxo, i): BuiltOutput =>
        changeOutputs.has(i) ? { ...utxo, change: true as const } : utxo,
    );
    const validity = validityOf(final.body, this.network);
    return makeBuiltTx(this, {
      tx,
      txHash,
      prototype: final,
      fee: BigInt(final.body.fee),
      exUnits,
      redeemers: (final.witness_set.redeemers ?? []).map((r) => ({
        tag: r.tag.type,
        index: Number(r.index),
        exUnits: {
          mem: BigInt(r.ex_units.mem),
          steps: BigInt(r.ex_units.steps),
        },
        data: dataCbor(r.data),
      })),
      inputs: spent,
      selectedInputs: [],
      referenceInputs: references,
      outputs,
      change: outputs.filter((o) => o.change),
      ...(collateral.length > 0 && {
        collateral: {
          inputs: collateral,
          total: collateralTotal(final.body, collateral),
          ...(final.body.collateral_return && {
            return: outputUtxo(
              txHash,
              final.body.outputs.length,
              final.body.collateral_return,
            ),
          }),
        },
      }),
      signers: signersOf(collected),
      ...(validity && { validity }),
      network: { name: this.network.name, networkId: this.network.networkId },
      warnings: [],
      parts: [],
    });
  }

  /**
   * Builds a balanced, unsigned transaction from the parts added with `add`, followed by `parts`
   * (none when omitted), and returns it as a `BuiltTx`: the data of the build, with the
   * calls that sign, submit and look for that one transaction. The builder is not changed: the
   * parts it holds are never replaced by what the build makes of them. A part of a kind a
   * transaction holds once, given both here and among the held parts, is DUPLICATE_PART, as
   * within one list.
   *
   * Before anything is selected the builder reads the payer once (a wallet's change address,
   * UTxOs and network id, concurrently) and checks the network of every address it is given or
   * finds.
   *
   * With a payer given as a snapshot, explicit `params` and `costModels`, and a local evaluator,
   * the build does no I/O but the lookups its parts ask for, and the same arguments give the
   * same bytes and `txHash`.
   *
   * 1. Checks that every address it is given is of the builder's network, and converts time
   *    bounds to slots on its slot clock: `from` to the first slot starting at or after it,
   *    `until` to the slot containing it. A lower bound whose slot starts after the current time
   *    of the local clock is reported in `warnings` as VALID_FROM_FUTURE. Refuses a part that
   *    names an output a transaction of `after` spends, and a second part of what a transaction
   *    holds once (DUPLICATE_PART). Reads the payer and looks up, all at
   *    once and once each, the outputs the parts reference that neither `knownUtxos` nor the
   *    outputs of `after` hold, the reward balances they withdraw in full, the protocol
   *    parameters and (when Plutus scripts run) the cost models. Lookups go through the
   *    provider's shared cache, which answers from what it holds. The UTxOs the builder reads
   *    for the payer through the provider (an address, or a wallet that cannot read its own)
   *    are always read past it; a wallet's own `getUtxos` is used as it answers, so a
   *    MeshWallet's list may come from its fetcher's short-lived cache. Submitting with the
   *    wallet's `submitTx`, or calling `clearVolatile()` on `CachedFetcher.wrap(provider)` after
   *    a submit, makes its next read fresh. What is read and looked up is checked for its
   *    network too.
   * 2. Fills in what the parts leave open: reference scripts, datums, deposits, output lovelace.
   * 3. Balances: selects inputs from the payer's UTxOs, less those `after` spends and with
   *    its change at the payer's change address, that `canSelect` lets it, with `coinSelection`
   *    when given, returns change to its change address (or sends everything left to
   *    `sendAllTo`), puts up collateral with a collateral return, and settles the fee. Collateral
   *    inputs given by parts that do not cover the collateral are topped up from the payer's
   *    UTxOs, unless `topUpCollateral` is false. With `collateralReturn: false` the collateral
   *    has neither a return nor a total, and is chosen and topped up from UTxOs holding lovelace
   *    alone, at the least cost (see `collateralReturn`). When the payer's UTxOs cannot cover the
   *    collateral and the payer is a CIP-30 api with `getCollateral`, that is called once, and
   *    the collateral is taken from its answer alone, less what `after` spends, after the given
   *    inputs when there are any.
   * 4. Evaluates the scripts with the builder's evaluator, configured with its network, slot
   *    clock and the cost models of step 1, and balances again with their execution units,
   *    until they settle. A local evaluator gets every UTxO the build knows for the
   *    transaction's inputs; any other resolves them from its chain, and gets only those of
   *    `knownUtxos` and the outputs of `after`. Units stated on a redeemer are checked, not
   *    replaced, when the builder has an evaluator; after `evaluator: null` they are taken as
   *    stated.
   *
   * `signal` aborts the build between and during these steps; `trace` is told of each of them.
   *
   * Redeemer indices follow from where each item ends up in the ledger's order, assigned once
   * by `assembleTxPrototype`; evaluation results are matched back to their parts through them.
   *
   * @throws TxBuildError with a `code`, among them UNRESOLVED (the gap `link`) for a part
   *   linked to an earlier step of a plan, which only that plan fills in; UNSUPPORTED_SERIALIZER
   *   when the builder's serializer throws, or answers with something that is not a
   *   transaction in CBOR hex, and
   *   MISSING_PARAMETER when the provider's protocol parameters lack a field a build reads, or
   *   hold one that is not a number; TxPartError when what is looked up does not fit a part
   *   (e.g. a reference output holding a different script), and INVALID_DATA for a validity
   *   part whose time bound is before the network's slot clock starts, or whose interval holds
   *   no slot once converted
   */
  async build(
    parts: PartsInput = [],
    options?: BuildOptions,
  ): Promise<BuiltTx> {
    // Nothing can be read without a payer: that comes first, then the parts, then the options'
    // types, then the network of what the build is given, all before any request
    // The payer is read once: what is built from is what signs
    const given = options?.payer;
    const source = toPayerSource(given);
    // A plan builds through buildList and keeps plain data; only this call makes the object.
    // The object keeps the witnesses of as many other keys as the fee was priced for
    const built = await this.buildList(source, this.withAdded(parts), options);
    // The payer, when it can sign, as a plan's rule takes it: the object's signer when none is
    // named. One whose methods cannot be read is not kept
    let payer: Signer | undefined;
    try {
      payer = payerSigner(given);
    } catch {
      payer = undefined;
    }
    return makeBuiltTx(
      this,
      built,
      options?.extraKeyWitnesses ?? 0,
      undefined,
      payer,
    );
  }

  /**
   * A `BuiltTx` from its JSON: the transaction another process built, or this one before a
   * restart, with the witnesses it held. It makes no request. The record is believed as a
   * `BuiltTxData` the application kept is: give it what the application wrote itself. Its
   * transaction is read again: it must be the unsigned one, `txHash` must be the hash of its
   * body, and every witness the record holds is verified against that body. A transaction made
   * by `fromCbor` is written and restored the same way.
   *
   * ```ts
   * await db.put(orderId, JSON.stringify(built));
   * const again = await builder.restore(JSON.parse(await db.get(orderId)));
   * ```
   *
   * The object restored is on this builder: it submits through its submitter or provider, and
   * looks through its provider. It holds the witnesses of the JSON, and a delivery the JSON marks
   * as taken or of unknown outcome counts as on its way, as it did for the object that wrote it.
   * An error quotes nothing of the JSON but its network, in the `details` of NETWORK_MISMATCH. A
   * plan's JSON is not read here: `resume` reads it.
   * @throws TxPlanError INVALID_STATE (`recordVersion`) for a record of another kind, a newer
   *   version, or with content this library does not read
   * @throws TxBuildError INVALID_OPTION (`json`) for a value that is no record, a record whose
   *   transaction holds a vkey or bootstrap witness (signatures go in its `witnesses`), whose
   *   `txHash` is not the hash of its transaction, or that holds a witness that is not of its
   *   body; `details.value` is only the JavaScript type of what was given; NETWORK_MISMATCH for a
   *   transaction built for another network
   */
  restore(json: BuiltTxJSON): Promise<BuiltTx> {
    return restoreBuiltTx(this, json);
  }

  /**
   * A `BuiltTx` of a transaction that exists only as CBOR: one built elsewhere, or built here
   * and kept as its bytes alone. Nothing is built or balanced: the object is that transaction,
   * with the calls that sign it, take witnesses made elsewhere, submit it and look for it.
   *
   * ```ts
   * const tx = await builder.fromCbor(txCbor);
   * await tx.sign({ signers: wallet });
   * await tx.submit();
   * await tx.awaitInclusion();
   * ```
   *
   * What is signed is the body as given, byte for byte, and `txHash` is the hash of those
   * bytes. Before any of them is decoded, the bytes are walked once, and a transaction is
   * refused that cannot be read in one way, or in reasonable time:
   * - larger than the protocol's maximum transaction size: the `maxTxSize` of the `params` the
   *   builder was given, else 16 384 bytes, the value of mainnet, preprod and preview (no
   *   parameters are asked for);
   * - not an array of four items: the forms of the eras before Alonzo are not read;
   * - nested deeper than 64 levels, the CBOR inside a byte string counted, or with that CBOR
   *   written in chunks;
   * - carrying more nested data (Plutus data, metadata, scripts) than the value decoder reads
   *   in about a second;
   * - with a map in its body, witness set, redeemers or auxiliary data that repeats a key, or
   *   redeemers that name one purpose twice: decoders read these in different ways, so no
   *   member could show the one reading a ledger takes;
   * - with a key the value decoder does not read, in the format of the Conway era, in its body,
   *   an output, its witness set or its auxiliary data in the tagged form: the decoder would read
   *   the value of that key as the next key, and the members after it would not be the bytes.
   *
   * Once decoded, a transaction a ledger does not take is refused as well: a negative fee, a
   * token quantity of zero in an output or the mint, an out ref named twice among the inputs,
   * the collateral inputs or the reference inputs, and an output address with bytes after the
   * address they hold. Reading takes a time that grows with the data the transaction carries:
   * within these limits up to about a second on a laptop, on the thread that calls it, which
   * runs nothing else meanwhile. The UTxOs it names add the time of their bytes alone: their
   * data is not decoded (an inline datum is checked by a walk over its bytes and kept as they
   * are, and a reference script is decoded only once found nested no deeper than 64 levels), and
   * of each transaction the provider lists, only the outputs the body names are read. A server
   * that reads transactions of strangers reads them off its request path, in a worker of its
   * own.
   *
   * The members are read from the same bytes and from the UTxOs of the
   * transaction's inputs, collateral inputs and reference inputs: those of `knownUtxos` as
   * given, the rest through the provider's shared cache, one request for each transaction they
   * come from, at most eight at a time. The call waits for the provider as long as it takes to
   * answer, and takes no signal. A UTxO is taken only under the out ref the body names, and is
   * believed as the provider or the caller gives it. `inputs`, `referenceInputs` and
   * `collateral` are those UTxOs; `signers` is worked out from them and the body: the keys that
   * must sign, each with its roles, the Byron addresses spent from and the native scripts that
   * run. These members are only as true as the provider's answers and as `knownUtxos`.
   *
   * `tx` is the transaction without its vkey and bootstrap witnesses, every other byte as
   * given. The witnesses it came with are verified against the body and held: every vkey
   * witness, each key once, and as many bootstrap witnesses as it spends from Byron addresses.
   * What is added later is kept as `sign()` keeps it: of the keys the transaction needs or its
   * native scripts name. A transaction that came with every signature it needs has nothing in
   * `missing`, and `submit()` sends it at once. `partialTx` and `signedTx` write the witnesses
   * held with the set tag the transaction wrote its own with: the `signedTx` of a transaction
   * that came with every signature differs from the bytes given in the encoding of its
   * key-witness entries only, and is never longer than they are where those entries came with
   * witnesses.
   *
   * It is someone else's transaction, and the ledger judges it: its fee, its balance, its
   * scripts, its validity interval and whether its inputs are unspent are not checked.
   * `selectedInputs`, `change` and `parts` are empty, outputs carry no `label` and redeemers no
   * `part`; `prototype` is the transaction read as a value, and serializing it again need not
   * give the same bytes; `warnings` holds VALID_FROM_FUTURE, COLLATERAL_FORFEITED and
   * COLLATERAL_RETURN_ELSEWHERE when they apply. The object has no payer: `sign()` is given
   * `signers`. It does not know whether the transaction was sent already: `awaitInclusion()`
   * looks for it, and `submit()` returns when the ledger refuses bytes the provider already
   * finds. The parts this builder holds from `add` are not read.
   *
   * The validity flag is outside the signed body: whoever submits the transaction can mark it
   * as failing, and a node that takes it so spends its collateral inputs and pays only the
   * collateral return. A key whose UTxO the transaction puts up as collateral is in `missing`
   * with the role `collateral`; read it, and `warnings`, before signing. COLLATERAL_FORFEITED
   * says there is no collateral return, and COLLATERAL_RETURN_ELSEWHERE that a collateral input
   * is held by another payment credential than the one the return pays, with the lovelace each
   * holder loses, the return's own holder too, however small the total collateral the body
   * states.
   * @param txCbor The transaction, in CBOR hex
   * @param options.knownUtxos UTxOs the transaction spends, reads or puts up as collateral, used
   *   as given and not looked up: the outputs of a transaction the provider has not seen yet,
   *   spent outputs a provider does not list, or all of them on a builder without a provider.
   *   Each in any form the builder takes a UTxO in; two entries that name one output must be
   *   alike; one the transaction does not name is checked as any other, and not used. They must
   *   be the caller's own data, never taken from the party that made the transaction: the
   *   object's view of the inputs, and of who must sign, is only as true as these UTxOs, and a
   *   wallet signs its own inputs whatever the object shows. The same holds for the provider:
   *   the view is only as true as its answers
   * @throws TxBuildError INVALID_OPTION (`tx`) for a value that is not a transaction in CBOR hex
   *   that this library reads: one the walk or the checks above refuse, or proposing a protocol
   *   parameter change, which this library does not read from CBOR; and for a transaction whose
   *   validity flag is false: a node that takes it takes its collateral. `details.value` is only
   *   the JavaScript type of what was given. INVALID_OPTION (`options`) for options that are not
   *   an object or hold a member other than `knownUtxos`, with the JavaScript type alone;
   *   (`knownUtxos`) for what is not a list of UTxOs, and for two entries that name one output
   *   and differ. NETWORK_MISMATCH for a transaction, or a UTxO, of another network than the
   *   builder's. UTXO_NOT_FOUND `{ input }` for an input, collateral input or reference input
   *   whose UTxO is neither given nor found, or could not be read (the provider's error is the
   *   `cause`); MISSING_FETCHER when one has to be read and the builder has no provider
   * @throws TxPlanError INVALID_WITNESS (`wrongBody`) `{ argument: 0, keyHash }` for a
   *   transaction that holds a signature that is not of its body
   */
  async fromCbor(
    txCbor: string,
    options?: { knownUtxos?: readonly UtxoInput[] },
  ): Promise<BuiltTx> {
    // What is given in place of the options may be or hold a key: only its type is named
    const { knownUtxos } = optionsObject(
      options,
      ["knownUtxos"],
      FROM_CBOR_OPTIONS_ALLOWED,
      [SIGNER_IN_PLACE],
    );
    const known = new Map<string, Utxo>();
    for (const utxo of toKnownUtxos(knownUtxos)) {
      const key = utxoKey(utxo);
      const before = known.get(key);
      // One output, two views of it: neither can be shown as the truth
      if (before && utxoText(before) !== utxoText(utxo))
        throw new TxBuildError(
          "INVALID_OPTION",
          `invalid knownUtxos: two entries name the output ${key} and differ`,
          {
            details: {
              option: "knownUtxos",
              value: typeOf(knownUtxos),
              allowed: KNOWN_UTXOS_ONCE,
            },
          },
        );
      known.set(key, utxo);
    }

    // The bytes are walked once before any of them is decoded into a value: a map that repeats a
    // key is read in different ways by different decoders, and size and depth are bounded. The
    // size is the protocol's maximum where the builder holds parameters; none are asked for
    const text = typeof txCbor === "string" ? txCbor.toLowerCase() : txCbor;
    try {
      scanTransaction(text, this.params?.maxTxSize);
    } catch (error) {
      if (!(error instanceof TxScanError)) throw error;
      throw refusedTx(txCbor, `invalid tx: ${error.message}`);
    }
    // The bytes given are read as raw items only; hex stands in lower case, as everywhere
    const given = readTransactionItems(text);
    // The unsigned transaction: the same bytes without the vkey and bootstrap entries. It is the
    // one transaction decoded into values; every member below is read from it, and the object
    // signs it
    const tx = withoutKeyWitnesses(given);
    const raw = readTransaction(tx);
    const txHash = raw.txId;
    if (txHash !== given.txId)
      throw new Error("the body changed while its witnesses were taken out");
    if (!raw.isValid)
      throw refusedTx(
        txCbor,
        "invalid tx: the transaction states that its scripts fail (its validity flag is false): a node that takes it takes its collateral",
      );

    const decodedBody = raw.body;
    const proposals = decodedBody.proposalProcedures()?.values() ?? [];
    if (
      proposals.some(
        (proposal) =>
          proposal.kind() ===
          Serialization.GovernanceActionKind.ParameterChange,
      )
    )
      throw refusedTx(
        txCbor,
        "the transaction proposes a protocol parameter change, which this library does not read from CBOR; the transaction itself may be valid",
      );
    // What the decoder takes and a ledger does not: no member could show it as a ledger reads it
    const unread = unreadForm(decodedBody);
    if (unread) throw refusedTx(txCbor, `invalid tx: ${unread}`);
    let prototype: TransactionPrototype;
    let outputs: Utxo[];
    let collateralReturn: Utxo | undefined;
    try {
      // The outputs as the body holds them: an inline datum and a reference script keep their
      // bytes
      const decoded = decodedBody.outputs();
      outputs = decoded.map((output, i) => outputAsUtxo(txHash, i, output));
      const returned = decodedBody.collateralReturn();
      collateralReturn =
        returned && outputAsUtxo(txHash, decoded.length, returned);
      prototype = prototypeOf(raw, outputs, collateralReturn);
    } catch (error) {
      throw refusedTx(
        txCbor,
        `invalid tx: the transaction holds what this library does not read: ${errorText(error)}`,
        error,
      );
    }
    const { body } = prototype;
    // Read from the decoded body: the prototype holds every id but 1 as the same value
    const networkId = decodedBody.networkId();
    checkNetworks(this.network, [
      ...bodyEntries(
        body,
        outputs,
        collateralReturn,
        networkId === undefined ? undefined : Number(networkId),
      ),
      ...Array.from(known.values(), (utxo) => utxoEntry(utxo)),
    ]);

    // The witnesses the transaction came with, each verified against the body from the witness
    // set read above, before any request, as everything that needs none. A key whose witness
    // stands twice is held once: every copy verifies, whatever its place
    await Crypto.ready();
    const came = [
      ...(given.witnessSet.vkeys?.witnesses ?? []),
      ...(given.witnessSet.bootstraps?.witnesses ?? []),
    ];
    for (const witness of came)
      if (!verifies(witness, txHash)) throw notOfBody(witness.keyHash);
    const held = newWitnesses(came);

    // The UTxO of every out ref the body names: given, else read through the shared cache,
    // which answers from what it holds, once per transaction hash and all at once
    const named: { input: BodyOutRef; role: string }[][] = [
      body.inputs.map((input) => ({ input, role: "spends" })),
      (body.collateral ?? []).map((input) => ({
        input,
        role: "puts up as collateral",
      })),
      (body.reference_inputs ?? []).map((input) => ({ input, role: "reads" })),
    ];
    const unknown = named
      .flat()
      .filter(({ input }) => !known.has(bodyOutRefKey(input)));
    const read = new Map<string, Utxo>();
    if (unknown.length > 0) {
      const { cache } = this;
      if (!cache)
        throw new TxBuildError(
          "MISSING_FETCHER",
          `the UTxOs of ${unknown.map(({ input }) => outRefString(input)).join(", ")} have to be read, and the builder has no provider: give them in knownUtxos`,
        );
      // The first out ref of each transaction, which an error of its read is about, and the
      // indices the body names of it: only those outputs are read
      const first = new Map<string, BodyOutRef>();
      const indices = new Map<string, Set<number>>();
      for (const { input } of unknown) {
        const hash = input.transaction_id.toLowerCase();
        if (!first.has(hash)) first.set(hash, input);
        const named = indices.get(hash) ?? new Set<number>();
        named.add(input.index);
        indices.set(hash, named);
      }
      // A few reads at a time: a transaction that names many others is not a burst of requests
      const queue = Array.from(first);
      const reader = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const [hash, input] = next;
          const listed = await fetchTxOutputs(
            cache,
            hash,
            (reason, cause) =>
              new TxBuildError(
                "UTXO_NOT_FOUND",
                `fetching the outputs of ${hash} failed: ${reason}`,
                {
                  details: {
                    input: {
                      txHash: input.transaction_id,
                      outputIndex: input.index,
                    },
                  },
                  cause,
                },
              ),
            (ref) =>
              ref.txHash === hash && indices.get(hash)!.has(ref.outputIndex),
          );
          // Only an output of the transaction asked for is taken, under its own out ref
          for (const utxo of listed)
            if (utxo.txHash === hash) read.set(utxoKey(utxo), utxo);
        }
      };
      try {
        await Promise.all(
          Array.from({ length: Math.min(READS_AT_ONCE, queue.length) }, reader),
        );
      } finally {
        // After a failed read no other is started
        queue.length = 0;
      }
    }
    const [spent, collateral, references] = named.map((list) =>
      list.map(({ input, role }): Utxo => {
        const key = bodyOutRefKey(input);
        const utxo = known.get(key) ?? read.get(key);
        if (utxo) return utxo;
        throw new TxBuildError(
          "UTXO_NOT_FOUND",
          `the UTxO of ${outRefString(input)}, which the transaction ${role}, is not found: it does not exist, is spent already, or the provider has not seen it yet; give it in knownUtxos`,
          {
            details: {
              input: { txHash: input.transaction_id, outputIndex: input.index },
            },
          },
        );
      }),
    ) as [Utxo[], Utxo[], Utxo[]];
    // What was read is checked for its network once found
    checkNetworks(
      this.network,
      [...spent, ...collateral, ...references]
        .filter((utxo) => !known.has(utxoKey(utxo)))
        .map((utxo) => utxoEntry(utxo)),
    );

    // Who must sign, from the body and those UTxOs
    const { collected } = bodySigners(
      raw,
      [...spent, ...collateral, ...references],
      body,
    );
    const signers = signersOf(collected);
    // The witnesses of other keys the transaction came with stay in it: what its maker put in
    // is not taken out. They use up what the object keeps of keys it does not ask for
    const counted = new Set(countedKeys(signers));
    const extraKeys = held.filter(
      (w) => w.kind === "vkey" && !counted.has(w.keyHash),
    ).length;

    const decodedRedeemers = raw.witnesses.redeemers()?.values() ?? [];
    const validity = validityOf(body, this.network);
    const future =
      validity?.invalidBefore === undefined
        ? undefined
        : validFromFuture(validity.invalidBefore, this.network, Date.now());
    const forfeited = collateralForfeited(body);
    const elsewhere = collateralElsewhere(collateral, collateralReturn);
    return makeBuiltTx(
      this,
      {
        tx,
        txHash,
        prototype,
        fee: BigInt(body.fee),
        exUnits: prototypeExUnits(prototype),
        // The data of each redeemer as the transaction carries it; the prototype lists them in
        // the same order
        redeemers: (prototype.witness_set.redeemers ?? []).map((r, i) => ({
          tag: r.tag.type,
          index: Number(r.index),
          exUnits: {
            mem: BigInt(r.ex_units.mem),
            steps: BigInt(r.ex_units.steps),
          },
          data: decodedRedeemers[i]!.data().toCbor().toString(),
        })),
        inputs: spent,
        selectedInputs: [],
        referenceInputs: references,
        outputs,
        change: [],
        ...(collateral.length > 0 && {
          collateral: {
            inputs: collateral,
            total: collateralTotal(body, collateral),
            ...(collateralReturn && { return: collateralReturn }),
          },
        }),
        signers,
        ...(validity && { validity }),
        network: { name: this.network.name, networkId: this.network.networkId },
        warnings: [
          ...(future ? [future] : []),
          ...(forfeited ? [forfeited] : []),
          ...(elsewhere ? [elsewhere] : []),
        ],
        parts: [],
      },
      extraKeys,
      { raw, held, delivered: false, tags: keyWitnessTags(given.witnessSet) },
    );
  }

  /**
   * Builds a plan: a group of transactions that are sent in order. One list of parts is a plan
   * of one step, `main`, with the parts this builder holds from `add` first; an object of named
   * steps is a plan of several, in the order of its keys. Every transaction is built by this
   * call, one after another, each on the payer's UTxOs as the steps before it leave them, read
   * once. Nothing is signed and nothing is sent: the plan it returns shows every transaction, its
   * fee and what it spends, before anyone signs.
   *
   * ```ts
   * const plan = await builder.plan(
   *   {
   *     lock: output({ address: vault, value, datum, label: "vault" }),
   *     unlock: [
   *       spend.plutus({ utxo: { step: "lock", output: "vault" }, script, redeemer }),
   *       output({ address: bob, value: { lovelace: 4_000_000n } }),
   *     ],
   *   },
   *   { payer: wallet },
   * );
   * await plan.run();
   * ```
   *
   * - A step built from parts ends at the plan's deadline, the tip's time plus `ttlMs`, unless
   *   its parts give it an end. It spends the change that the step before it of the same payer
   *   leaves, unless it already spends an output of that step.
   * - Selection takes, of the outputs of earlier steps, their change only; any other output of
   *   an earlier step is spent by the part that names it.
   * - A plan given in `after` stands for its steps that are in a block, or may still land; a
   *   final step for what it spent alone.
   * - A step that does not fit a transaction because of the inputs its selection needs gets
   *   consolidation steps before it (`consolidate-1`, … with `kind: "consolidation"`), which
   *   pay the payer alone, unless `consolidate` is `false`; `trace` is told how many, and their
   *   fees.
   *
   * The plan's deadlines are its own options, else this builder's `planDefaults`, else the
   * built-in values, written into it now and never read from the builder again. On a builder with
   * a store the plan needs an `id`, and the store is read first: an id it holds with the same
   * steps and options (those it was made with, or all it has after `plan.add`) is the recorded
   * plan, returned as recorded, and nothing is built, so a repeated request handler is safe;
   * other steps or options are PLAN_EXISTS. A new plan is recorded before it is returned.
   * @throws TxBuildError every error of building a transaction, with the step's name at the
   *   start of its message; INVALID_OPTION (`steps`) for a step that is none of the forms, a
   *   name that is taken, empty, a whole number or starts with `consolidate-`, more than 32
   *   steps, a link to a step that is not before it, named steps on a builder that holds parts
   *   from `add`, and a step that stands on the step before it of its payer neither by its change
   *   nor by an output its parts name; UNKNOWN_LABEL for a link to a label that no output of the
   *   step has; INVALID_OPTION (`id`) for an id that is not a string; INVALID_OPTION
   *   (`consolidate`); TX_TOO_LARGE (`cause: "selection"`) for a step that needs more
   *   consolidation steps than the plan allows, or whose consolidation step cannot be built;
   *   NOT_SERIALIZABLE on a builder with a store, for a part that holds a redeemer function
   * @throws TxPlanError CANNOT_OBSERVE (`noTip`, `noSearch`, `noDepth`, `noValidity`) for a
   *   provider that cannot follow the plan; INVALID_STATE (`pastHorizon`); on a builder with a
   *   store MISSING_ID, PLAN_EXISTS, STORE_FAILED, VERSION_CONFLICT, INVALID_STATE
   *   (`recordVersion`) for a stored record this library does not read
   */
  plan(steps: StepParts | PlanSteps, options?: PlanOptions): Promise<TxPlan> {
    return planFor(this, steps, options ?? {});
  }

  /**
   * A recorded plan, with the live objects given again: by its id from the builder's store, or
   * from its JSON. It makes no request to the chain and does not call the payer; the provider is
   * probed before the first delivery. The transactions are those of the record, each read again
   * and its witnesses verified against its body. The reconcile step after a restart is
   * `resume(id, { payer })`, then `run()`.
   *
   * ```ts
   * const plan = await builder.resume(orderId, { payer: wallet });
   * await plan.run();
   * ```
   *
   * On a builder with a store the store holds the plan: a JSON whose id the store holds gives the
   * stored record when the stored revision is the same or later; a JSON ahead of the stored one
   * is VERSION_CONFLICT, and nothing is written.
   * @throws TxPlanError MISSING_STORE for an id on a builder without a store; MISSING_ID for an
   *   id that is not a non-empty string, and for a record without one on a builder with a store;
   *   PLAN_NOT_FOUND; VERSION_CONFLICT; STORE_FAILED; INVALID_STATE (`recordVersion`) for a
   *   record this library does not read
   * @throws TxBuildError NETWORK_MISMATCH for a record of another network
   */
  resume(id: string, options?: ResumeOptions): Promise<TxPlan>;
  resume(json: TxPlanJSON, options?: ResumeOptions): Promise<TxPlan>;
  resume(
    source: string | TxPlanJSON,
    options?: ResumeOptions,
  ): Promise<TxPlan> {
    return resumePlan(this, source, options ?? {});
  }

  /**
   * A new builder with this builder's settings, providers and cache, and these parts added after
   * the ones it already holds. This builder is not changed, so keep the builder that is
   * returned: a call whose result is dropped adds nothing.
   *
   * Takes what `build` takes: parts, nested lists of parts, and `false`, `null` or `undefined`,
   * which are skipped. `build` takes the held parts first, then the parts it is given.
   *
   * ```ts
   * const withFee = builder.add(output({ label: "fee", address, value }));
   * const built = await withFee.build(output({ address: to, value }), { payer: wallet });
   * ```
   * @throws TxBuildError INVALID_OPTION for an entry that is none of these; UNRESOLVED for a
   *   part linked to an earlier step of a plan
   */
  add(...parts: PartEntry[]): TxBuilder {
    const added = flattenParts(parts);
    // Every member is carried as it is (the evaluator, the provider and its cache included), so
    // nothing is made, checked or read again; only the list of parts is new
    const next = Object.create(
      Object.getPrototypeOf(this),
      Object.getOwnPropertyDescriptors(this),
    ) as TxBuilder;
    Object.defineProperty(next, "added", {
      ...Object.getOwnPropertyDescriptor(this, "added"),
      value: Object.freeze([...this.added, ...added]),
    });
    return next;
  }

  /**
   * The parts a build of this builder works on: the parts added with `add`, then the given ones
   * @throws TxBuildError INVALID_OPTION for an entry that is not a part
   */
  private withAdded(parts: PartsInput): TxPart[] {
    return [...this.added, ...flattenParts(parts)];
  }

  /**
   * `build` over a final list of parts: the parts added with `add` are not put in front of it
   * again
   */
  private async buildList(
    source: PayerSource,
    flat: readonly TxPart[],
    options: BuildOptions | undefined,
  ): Promise<BuiltTxData> {
    const { sendAllTo, after, knownUtxos } = checkBuildOptions(options ?? {});
    const declared = (
      options as { [DECLARED_OUTPUTS]?: DeclaredOutputs } | undefined
    )?.[DECLARED_OUTPUTS];
    // What is read and looked up is checked once found
    checkNetworks(this.network, [
      ...givenPayerEntries(source),
      ...(sendAllTo === undefined
        ? []
        : [{ role: "output" as const, address: sendAllTo }]),
      ...flat.flatMap(partEntries),
      ...knownUtxos.map((utxo) => utxoEntry(utxo)),
      ...after.flatMap((tx) => tx.outputs.map((utxo) => utxoEntry(utxo))),
    ]);
    // An output the transactions of `after` spend is gone after them
    const spentByAfter = spentByTransactions(after);
    refuseSpentOutRefs(flat, spentByAfter);
    // Time bounds become slots before any request, so a wrong interval costs no I/O
    const { parts: timed, warnings } = this.convertTimes(flat);
    // So is a second part of what a transaction holds once
    checkPartRepeats(timed);
    // And a collateral return asked for by a part and forbidden by the options
    if (options?.collateralReturn === false) refuseCollateralReturn(timed);
    const { fee, registeredPools, extraKeyWitnesses } = options ?? {};
    const { canSelect, coinSelection, signal } = options ?? {};
    throwIfAborted(signal);
    const emit = tracer(options?.trace);
    const known = new Map<string, Utxo>();
    // A snapshot's UTxOs are known before the lookups start, so a part may name one by out ref
    if (source.form === "snapshot")
      for (const utxo of source.snapshot.utxos) known.set(utxoKey(utxo), utxo);
    // So are the outputs of `after` and the UTxOs of `knownUtxos`, which the provider may not
    // know yet: every evaluator is handed those the transaction names
    const handed = new Set<string>();
    for (const utxo of [
      ...after.flatMap((tx) => tx.outputs.map((output) => plainUtxo(output))),
      ...knownUtxos,
    ]) {
      const key = utxoKey(utxo);
      handed.add(key);
      if (!known.has(key)) known.set(key, utxo);
    }
    const plutus = timed.some(runsPlutus);

    // Every read starts at once, and none waits for another
    const paramsRead = this.loadParams();
    let fetched: string[] = [];
    const [params, costModels, payerRead, resolved] = await abortable(
      Promise.all([
        paramsRead,
        plutus
          ? this.loadCostModels().then((models) => models ?? [])
          : Promise.resolve([]),
        this.readSource(source, signal),
        resolveParts(timed, {
          network: this.network,
          ...(this.cache && { provider: this.cache }),
          params: paramsRead,
          deposits: this.deposits,
          known,
          onFetch: (outRefs) => {
            fetched = outRefs;
          },
          ...(declared && { unread: declared.unread }),
        }),
      ]),
      signal,
    );
    const payer = payerRead.snapshot;
    // The copy a part was checked against stays the one the build knows
    for (const utxo of payer.utxos)
      if (!known.has(utxoKey(utxo))) known.set(utxoKey(utxo), utxo);
    const filled = resolved.map((part) =>
      part.kind === "output" ? withMinCoin(part, params) : part,
    );
    // Each out ref once, as the payer first lists it: a repeated entry is not selected twice
    const listed = new Set<string>();
    const payerUtxos = payer.utxos.filter((utxo) => {
      const key = utxoKey(utxo);
      if (listed.has(key)) return false;
      listed.add(key);
      return true;
    });
    // The payer's UTxOs after the transactions of `after`: their inputs gone, their change at
    // this build's change address added, as `utxosAfter` folds them
    const { kept, added } = foldTransactions(
      payerUtxos,
      after,
      (output) =>
        output.change === true && output.address === payer.changeAddress,
    );
    const selectable = [
      ...kept,
      ...added.map((output) => known.get(utxoKey(output))!),
    ];
    const spentCount = payerUtxos.length - kept.length;
    // The filter is asked once per build; its answers serve every balancing round
    const refused = canSelect && refusedBy(canSelect, filled, selectable);
    emit({
      type: "payer",
      changeAddress: payer.changeAddress,
      utxos: payerUtxos.length,
      selectable: paymentPool(
        filled,
        selectable,
        refused || undefined,
        0,
        declared?.selectableCollateral,
      ).pool.length,
    });
    if (fetched.length > 0) emit({ type: "fetched", outRefs: fetched });

    // Execution units: as given, or placeholders until evaluation fills them in
    const redeemerParts = filled.flatMap((part, i) =>
      runsPlutus(part) ? [i] : [],
    );
    const given = new Map<number, ExUnitsPrototype>();
    for (const i of redeemerParts) {
      const { witness } = filled[i] as { witness: PlutusWitness };
      if (witness.redeemer.exUnits) given.set(i, witness.redeemer.exUnits);
    }
    const open = redeemerParts.filter((i) => !given.has(i));
    if (open.length > 0 && !this.evaluator)
      throw new TxBuildError(
        "MISSING_EVALUATOR",
        `${open.length} redeemer(s) have no execution units, and the builder has no evaluator`,
      );
    const units = new Map<number, ExUnitsPrototype>(
      open.map((i) => [i, placeholderUnits(params, given, open.length)]),
    );
    const evaluated = new Set<number>();

    const context: BalanceContext = {
      params,
      costModels,
      changeAddress: payer.changeAddress,
      utxos: selectable,
      ...(refused && { refused }),
      ...(spentCount > 0 && { spentByAfter: spentCount }),
      ...(coinSelection && { coinSelection }),
      ...(sendAllTo !== undefined && { sendAllTo }),
      known,
      ...(declared && {
        scriptSizes: declared.scriptSizes,
        selectableCollateral: declared.selectableCollateral,
      }),
      ...(fee !== undefined && { fee }),
      registeredPools: new Set(registeredPools ?? []),
      extraKeyWitnesses: extraKeyWitnesses ?? 0,
      ...(options?.topUpCollateral === false && { topUpCollateral: false }),
      ...(options?.collateralReturn === false && { collateralReturn: false }),
      serialize: (prototype: TransactionPrototype) => this.serialize(prototype),
      onRound: (priced) => emit({ type: "round", ...priced }),
    };

    // The collateral fallback of a CIP-30 payer is asked once per build, and only when the
    // payer's own UTxOs cannot cover the collateral of a round whose units are settled, alone
    // or added to the given collateral inputs, which stay
    let collateralAsked = false;
    const balanceRound = async (roundParts: TxPart[], provisional: boolean) => {
      try {
        return balance(roundParts, { ...context, provisional });
      } catch (error) {
        const { getCollateral } = payerRead;
        if (collateralAsked || !getCollateral || !isPoolShortfall(error))
          throw error;
        collateralAsked = true;
        context.collateralPool = await this.collateralFromWallet(
          getCollateral,
          roundParts,
          context,
          { known, canSelect, signal, spent: spentByAfter },
        );
        return balance(roundParts, { ...context, provisional });
      }
    };

    for (let round = 0; round < MAX_EVALUATION_ROUNDS; round++) {
      const roundParts = filled.map((part, i) => {
        const exUnits = units.get(i);
        return exUnits ? withExUnits(part, exUnits) : part;
      });
      const balanced = await balanceRound(
        roundParts,
        evaluated.size < open.length,
      );
      if (redeemerParts.length === 0 || !this.evaluator)
        return this.finish(balanced, params, costModels, warnings, fee);

      const tx = this.serialize(balanced.assembled.prototype);
      // A serializer's answer that is no transaction is its own fault, not the scripts'
      if (this.serializer) this.txHashOf(tx);
      throwIfAborted(signal);
      const results = await abortable(
        this.evaluate(tx, balanced, known, handed, costModels),
        signal,
      );
      emit({
        type: "evaluated",
        round,
        redeemers: builtRedeemers(balanced.assembled, (r) =>
          results.get(`${r.tag}:${r.index}`),
        ),
      });
      // Redeemers belong to the very part objects given to balancing
      const position = new Map(roundParts.map((part, i) => [part, i]));

      let settled = true;
      for (const redeemer of balanced.assembled.redeemers) {
        const i = position.get(redeemer.part)!;
        const result = results.get(`${redeemer.tag}:${redeemer.index}`);
        if (!result)
          throw new TxBuildError(
            "EVALUATION_FAILED",
            `the evaluator returned no execution units for ${redeemer.tag} redeemer ${redeemer.index}`,
            {
              part: redeemer.part.kind,
              label: redeemer.label,
              details: { tx, failures: [] },
            },
          );
        const fixed = given.get(i);
        if (fixed) {
          if (exceeds(result, fixed))
            throw new TxBuildError(
              "EXUNITS_TOO_LOW",
              `the script needs ${result.mem} memory and ${result.steps} steps, more than the ${fixed.mem} and ${fixed.steps} its redeemer states`,
              {
                part: redeemer.part.kind,
                label: redeemer.label,
                details: { needed: toBudget(result), given: toBudget(fixed) },
              },
            );
          continue;
        }
        const current = units.get(i)!;
        if (!evaluated.has(i)) {
          units.set(i, result);
          evaluated.add(i);
          settled = false;
        } else if (exceeds(result, current)) {
          units.set(i, maxUnits(result, current));
          settled = false;
        }
      }
      if (settled)
        return this.finish(balanced, params, costModels, warnings, fee);
    }
    throw new TxBuildError(
      "EVALUATION_NOT_CONVERGED",
      `execution units did not settle within ${MAX_EVALUATION_ROUNDS} evaluation rounds`,
    );
  }

  /**
   * Reads a payer once, checking its network, and returns it as data: a wallet, an address (its
   * UTxOs through the provider), or a snapshot, which is converted without any request. For many
   * builds on one read.
   * @throws TxBuildError NETWORK_MISMATCH, MISSING_PAYER, INVALID_OPTION, WALLET_FAILED,
   *   PROVIDER_FAILED; MISSING_FETCHER when the UTxOs have to be read through a provider and
   *   there is none
   */
  async readPayer(payer: Payer): Promise<PayerSnapshot> {
    return (await this.readGivenPayer(payer)).snapshot;
  }

  /**
   * `readPayer` with all a read gives: the snapshot, and for a CIP-30 api its collateral
   * fallback, which a build from that snapshot keeps
   */
  private async readGivenPayer(
    payer: Payer,
    signal?: AbortSignal,
  ): Promise<PayerRead> {
    const source = toPayerSource(payer);
    checkNetworks(this.network, givenPayerEntries(source));
    return this.readSource(source, signal);
  }

  /** Reads a payer whose given data was checked; its UTxOs from the provider past the cache */
  private readSource(
    source: PayerSource,
    signal?: AbortSignal,
  ): Promise<PayerRead> {
    return readPayerSource(source, {
      network: this.network,
      ...(this.cache && { provider: this.cache.fetcher }),
      ...(signal && { signal }),
    });
  }

  /**
   * Asks a CIP-30 payer for collateral, once: for the whole collateral the transaction calls
   * for, an upper estimate, also when given collateral inputs are topped up from the answer, and
   * returns the UTxOs of the answer that may be put up. Those become known to the build; without
   * a collateral return, only those holding lovelace alone, and the others are returned for the
   * build to leave out and to count in its error.
   * @throws TxBuildError INSUFFICIENT_COLLATERAL when the call fails or gives nothing usable;
   *   NETWORK_MISMATCH for a UTxO of another network; ABORTED
   */
  private async collateralFromWallet(
    getCollateral: GetCollateral,
    parts: TxPart[],
    ctx: BalanceContext,
    options: {
      /** Every UTxO the build knows, which the usable ones join */
      known: Map<string, Utxo>;
      canSelect?: (utxo: Utxo) => boolean;
      signal?: AbortSignal;
      /** The out refs the transactions of `after` spend, which are never put up */
      spent: ReadonlyMap<string, string>;
    },
  ): Promise<Utxo[]> {
    const { params } = ctx;
    const stated = parts.find(
      (p): p is Extract<TxPart, { kind: "collateralReturn" }> =>
        p.kind === "collateralReturn",
    )?.totalCollateral;
    let amount: bigint;
    if (stated !== undefined) amount = BigInt(stated);
    else {
      // The fee with the collateral it cannot put up left out, and the bytes collateral adds
      const fee =
        ctx.fee ??
        balance(parts, { ...ctx, onRound: undefined, lenientCollateral: true })
          .fee +
          BigInt(params.minFeeA) * BigInt(collateralBytes(params));
      amount = (fee * BigInt(params.collateralPercent) + 99n) / 100n;
      if (amount < 1n) amount = 1n;
    }
    // Collateral inputs given by parts stay, and count as available
    const given = parts.flatMap((p) =>
      p.kind === "collateral" ? [p.utxo!.value.lovelace] : [],
    );
    const refused = (message: string, cause?: unknown) =>
      new TxBuildError(
        "INSUFFICIENT_COLLATERAL",
        `${given.length > 0 ? "the given collateral inputs and " : ""}the payer's UTxOs cannot cover the collateral, and the wallet's getCollateral ${message}`,
        {
          details: {
            required: amount,
            available: given.reduce((total, coin) => total + coin, 0n),
          },
          ...(cause !== undefined && { cause }),
        },
      );

    throwIfAborted(options.signal);
    const answer = await abortable(
      attemptCall(() => getCollateral({ amount: coinCbor(amount) })),
      options.signal,
    );
    if (!answer.ok)
      throw refused(`failed: ${errorText(answer.error)}`, answer.error);
    let utxos: Utxo[];
    try {
      const { value } = answer;
      if (value === undefined || value === null) utxos = [];
      else if (!Array.isArray(value))
        throw new Error("the answer is not a list");
      else utxos = value.map((entry) => readUtxo(entry));
    } catch (error) {
      throw refused(
        `answered with what is not a list of UTxOs: ${errorText(error)}`,
        error,
      );
    }
    checkNetworks(
      this.network,
      utxos.map((utxo) => utxoEntry(utxo)),
    );
    const candidates = collateralCandidates(
      parts,
      utxos.filter((utxo) => !options.spent.has(utxoKey(utxo))),
      options.canSelect,
    );
    // Without a collateral return a UTxO holding tokens cannot be put up
    const withoutReturn = ctx.collateralReturn === false;
    const usable = withoutReturn
      ? candidates.filter((utxo) => lovelaceOnly(utxo))
      : candidates;
    if (usable.length === 0)
      throw refused(
        utxos.length === 0
          ? `gave no UTxO for ${amount} lovelace`
          : candidates.length > 0
            ? `gave no UTxO that may be put up for ${amount} lovelace without a collateral return; UTxOs holding native assets cannot be collateral without a collateral return: give collateral inputs without assets, or drop \`collateralReturn: false\``
            : `gave no UTxO that may be put up for ${amount} lovelace`,
      );
    for (const utxo of usable)
      if (!options.known.has(utxoKey(utxo)))
        options.known.set(utxoKey(utxo), utxo);
    // Those holding tokens go along, for the build to leave out and name in its error
    return candidates;
  }

  /** The `params` option, else the provider's parameters */
  private async loadParams(): Promise<Protocol> {
    if (this.params) return this.params;
    // The constructor makes sure there is a provider without `params`
    let params: Protocol | null | undefined;
    try {
      // NaN asks providers for the latest epoch's parameters
      params = await this.cache!.fetchProtocolParameters(Number.NaN);
    } catch (error) {
      throw new TxBuildError(
        "MISSING_PARAMETER",
        `fetching the protocol parameters failed: ${errorText(error)}`,
        { details: { parameter: "params" }, cause: error },
      );
    }
    if (params === undefined || params === null)
      throw new TxBuildError(
        "MISSING_PARAMETER",
        "the provider gave no protocol parameters; give the builder params",
        { details: { parameter: "params" } },
      );
    try {
      checkProtocol(params);
    } catch (error) {
      throw new TxBuildError(
        "MISSING_PARAMETER",
        `the provider gave protocol parameters that cannot be used: ${errorText(error)}; give the builder params`,
        { details: { parameter: "params" }, cause: error },
      );
    }
    return params;
  }

  /**
   * The `costModels` option, else the provider's cost models; undefined when there is no
   * provider or it gave none. A build then fails only if a Plutus script runs, where the script
   * data hash is taken.
   */
  private async loadCostModels(): Promise<number[][] | undefined> {
    if (this.costModels) return this.costModels;
    if (!this.cache) return undefined;
    try {
      return (await this.cache.fetchCostModels()) ?? undefined;
    } catch (error) {
      throw new TxBuildError(
        "MISSING_PARAMETER",
        `fetching the cost models failed: ${errorText(error)}`,
        { details: { parameter: "costModels" }, cause: error },
      );
    }
  }

  /**
   * Evaluates a transaction, keyed by redeemer pointer. The evaluator is first given the
   * builder's network and slot clock, and the cost models the script data hash is made from.
   * @param handed Out refs of the UTxOs given as data (`knownUtxos`, the outputs of `after`),
   *   which every evaluator gets
   */
  private async evaluate(
    tx: string,
    balanced: Balanced,
    known: ReadonlyMap<string, Utxo>,
    handed: ReadonlySet<string>,
    costModels: number[][],
  ): Promise<Map<string, ExUnitsPrototype>> {
    const evaluator = this.evaluator!;
    // A local evaluator takes every UTxO the build knows; any other resolves the inputs from
    // its chain, since a remote one may reject UTxOs that also exist there, and gets only those
    // given as data, which its chain may not have yet. It takes them as Mesh UTxOs
    const utxos = new Map<string, Utxo>();
    const { body } = balanced.assembled.prototype;
    for (const input of [
      ...body.inputs,
      ...(body.reference_inputs ?? []),
      ...(body.collateral ?? []),
    ]) {
      const key = `${input.transaction_id}#${input.index}`;
      const utxo = known.get(key);
      if (utxo && (evaluator.acceptsKnownUtxos || handed.has(key)))
        utxos.set(key, utxo);
    }
    let actions;
    try {
      evaluator.configure?.({
        network: evaluatorNetwork(this.network),
        slotConfig: this.network.slotConfig,
        costModels,
      });
      actions = await evaluator.evaluateTx(
        tx,
        Array.from(utxos.values(), (utxo) => toMeshUtxo(utxo)),
        [],
      );
    } catch (error) {
      const failures = ScriptEvaluationError.is(error)
        ? partFailures(error.failures, balanced.assembled.redeemers)
        : [];
      const [only] = failures.length === 1 ? failures : [];
      throw new TxBuildError(
        "EVALUATION_FAILED",
        `script evaluation failed: ${errorText(error)}`,
        {
          ...(only && { part: only.part, label: only.label }),
          details: { tx, failures },
          cause: error,
        },
      );
    }
    // The answer is checked before it is read: an evaluator from elsewhere may answer anything
    const problem = evaluationAnswerProblem(actions);
    if (problem !== undefined)
      throw new TxBuildError(
        "EVALUATION_FAILED",
        `script evaluation failed: the evaluator returned ${problem}`,
        {
          details: { tx, failures: [] },
          cause: new TypeError(`the evaluator returned ${problem}`),
        },
      );
    const results = new Map<string, ExUnitsPrototype>();
    for (const action of actions) {
      results.set(`${EVALUATOR_TAGS[action.tag]}:${action.index}`, {
        mem: BigInt(action.budget.mem).toString(),
        steps: BigInt(action.budget.steps).toString(),
      });
    }
    return results;
  }

  /**
   * The parts with the time bounds of validity parts converted to slots on the builder's
   * network, and the warning for a lower bound whose slot starts after the current time of the
   * local clock, which is read once, here, and only when there is a lower bound
   */
  private convertTimes(parts: readonly TxPart[]): {
    parts: TxPart[];
    warnings: BuildWarning[];
  } {
    const warnings: BuildWarning[] = [];
    let now: number | undefined;
    const converted = parts.map((part) => {
      if (part.kind !== "validity") return part;
      const resolved = resolveValidity(part, this.network);
      if (resolved.invalidBefore === undefined) return resolved;
      now ??= Date.now();
      const warning = validFromFuture(
        resolved.invalidBefore,
        this.network,
        now,
      );
      if (warning)
        warnings.push({
          ...warning,
          part: "validity",
          ...(part.label !== undefined && { label: part.label }),
        });
      return resolved;
    });
    return { parts: converted, warnings };
  }

  /**
   * The result of a build from its last balancing round: the transaction serialized, and what
   * the build decided as data
   * @param fee The fee the caller gave, if any
   */
  private finish(
    balanced: Balanced,
    params: Protocol,
    costModels: number[][],
    warnings: BuildWarning[],
    fee: bigint | undefined,
  ): BuiltTxData {
    const { assembled } = balanced;
    const total = totalExUnits(assembled);
    if (
      total.mem > BigInt(params.maxTxExMem) ||
      total.steps > BigInt(params.maxTxExSteps)
    )
      throw new TxBuildError(
        "EXUNITS_EXCEEDED",
        `the scripts need ${total.mem} memory and ${total.steps} steps, more than the ${params.maxTxExMem} and ${params.maxTxExSteps} a transaction may use`,
        { details: total },
      );

    const prototype = assembled.prototype;
    let tx = this.serialize(prototype);
    if (this.serializer) {
      // Decoded first, so that an answer that is no transaction is UNSUPPORTED_SERIALIZER
      this.txHashOf(tx);
      // The hashes are taken from the prototype encoder's bytes; another serializer may lay out
      // the witness set or auxiliary data differently, so take them again from its own bytes
      const scriptDataHash = prototype.body.script_data_hash
        ? scriptDataHashOf(tx, assembled.languages, costModels)
        : undefined;
      const auxiliaryDataHash = prototype.body.auxiliary_data_hash
        ? auxiliaryDataHashOf(tx)
        : undefined;
      if (
        scriptDataHash !== prototype.body.script_data_hash ||
        auxiliaryDataHash !== prototype.body.auxiliary_data_hash
      ) {
        if (scriptDataHash) prototype.body.script_data_hash = scriptDataHash;
        if (auxiliaryDataHash)
          prototype.body.auxiliary_data_hash = auxiliaryDataHash;
        tx = this.serialize(prototype);
      }
    }

    const { body } = prototype;
    const txHash = this.txHashOf(tx);
    const inputs = new Map(
      balanced.parts.flatMap((p) =>
        p.kind === "spend" ? [[utxoKey(p.utxo!), p.utxo!] as const] : [],
      ),
    );
    const references = referencedUtxos(balanced.parts);

    // Output parts become the body's outputs in their order, so the body's i-th output is made
    // from the i-th output part
    const outputParts = balanced.parts.filter(
      (p): p is OutputPart => p.kind === "output",
    );
    const changeParts = new Set<TxPart>(balanced.change);
    const outputs = bodyOutputs(txHash, body).map((utxo, i): BuiltOutput => {
      const part = outputParts[i]!;
      return {
        ...utxo,
        ...(part.label !== undefined && { label: part.label }),
        ...(changeParts.has(part) && { change: true as const }),
      };
    });

    const validity = validityOf(body, this.network);
    // Parts with a redeemer function are reported with the data it returned for this transaction
    const computed = computedParts(assembled);
    // Collateral without a return is forfeited whole if a script fails
    const forfeited = collateralForfeited(body);
    return {
      tx,
      txHash,
      prototype,
      fee: balanced.fee,
      exUnits: total,
      redeemers: builtRedeemers(assembled, (r) => r.exUnits, computed),
      inputs: body.inputs.map((i) =>
        inputs.get(`${i.transaction_id}#${i.index}`)!,
      ),
      selectedInputs: balanced.selected,
      // A reference input left unread by declared data has no UTxO to report
      referenceInputs: (body.reference_inputs ?? []).flatMap((i) => {
        const utxo = references.get(outRefString(i));
        return utxo ? [utxo] : [];
      }),
      outputs,
      change: outputs.filter((o) => o.change),
      ...(balanced.collateral && {
        collateral: {
          inputs: balanced.collateral.inputs,
          total: balanced.collateral.total,
          // The UTxO the return becomes if a script fails: the output after the body's own
          ...(body.collateral_return && {
            return: outputUtxo(
              txHash,
              body.outputs.length,
              body.collateral_return,
            ),
          }),
        },
      }),
      signers: txSigners(balanced.parts),
      ...(validity && { validity }),
      network: { name: this.network.name, networkId: this.network.networkId },
      warnings: [
        ...warnings,
        ...(forfeited ? [forfeited] : []),
        ...(fee !== undefined && balanced.minFee < balanced.fee
          ? [
              {
                code: "FEE_ABOVE_MINIMUM" as const,
                message: `the fee ${balanced.fee} is above the transaction's minimum fee ${balanced.minFee}; the difference is paid as fee`,
              },
            ]
          : []),
      ],
      parts: balanced.parts.map((part) => computed.get(part) ?? part),
    };
  }
}

/** Most rounds `finalize` prices the transaction in, as balancing does */
const MAX_FINALIZE_ROUNDS = 50;

const FINALIZE_INPUTS_ALLOWED =
  "a list of the UTxOs the transaction spends, reads and puts up as collateral";

/** Whether an output's address is this address text, whatever form the output holds it in */
const sameAddress = (address: string, text: string) => {
  try {
    return toAddressText(address) === text;
  } catch {
    return false;
  }
};

/**
 * The Plutus versions a transaction runs, as the ledger takes them: those of the Plutus scripts
 * of its witness set, and of the Plutus reference scripts held by the UTxOs it spends or reads
 * whose hash the body calls for
 */
const plutusLanguages = (
  prototype: TransactionPrototype,
  utxos: readonly Utxo[],
  called: ReadonlySet<string>,
): Set<LanguageVersion> => {
  const languages = new Set<LanguageVersion>();
  const witnessSet = prototype.witness_set;
  if (witnessSet.plutus_v1_scripts?.length) languages.add("V1");
  if (witnessSet.plutus_v2_scripts?.length) languages.add("V2");
  if (witnessSet.plutus_v3_scripts?.length) languages.add("V3");
  for (const { script } of utxos)
    if (script?.type === "plutus" && called.has(script.hash))
      languages.add(script.version);
  return languages;
};

/**
 * The lovelace a transaction's collateral forfeits: its stated total, else the lovelace of its
 * collateral inputs less that of its collateral return
 */
const collateralTotal = (
  body: TransactionPrototype["body"],
  collateral: readonly Utxo[],
): bigint => {
  if (body.total_collateral !== undefined && body.total_collateral !== null)
    return BigInt(body.total_collateral);
  const held = collateral.reduce(
    (total, utxo) => total + utxo.value.lovelace,
    0n,
  );
  return held - BigInt(body.collateral_return?.amount.coin ?? 0);
};

/**
 * Checks that a transaction's collateral covers `collateralPercent` of its fee
 * @throws TxBuildError INSUFFICIENT_COLLATERAL `{ required, available }` when it does not
 */
const checkCollateral = (
  prototype: TransactionPrototype,
  collateral: readonly Utxo[],
  params: Protocol,
) => {
  const fee = BigInt(prototype.body.fee);
  const required = (fee * BigInt(params.collateralPercent) + 99n) / 100n;
  const available = collateralTotal(prototype.body, collateral);
  if (required > available)
    throw new TxBuildError(
      "INSUFFICIENT_COLLATERAL",
      `the fee ${fee} calls for ${required} lovelace of collateral, and the transaction puts up ${available}; raise total_collateral and lower the collateral return, or build again`,
      { details: { required, available } },
    );
};

/**
 * Execution units to price a redeemer at before evaluation: an even share of what a
 * transaction may use beyond the given units, so the first balancing round over-provisions the
 * fee rather than falls short
 */
const placeholderUnits = (
  params: Protocol,
  given: Map<number, ExUnitsPrototype>,
  count: number,
): ExUnitsPrototype => {
  let mem = BigInt(params.maxTxExMem);
  let steps = BigInt(params.maxTxExSteps);
  for (const units of given.values()) {
    mem -= BigInt(units.mem);
    steps -= BigInt(units.steps);
  }
  if (mem < 0n || steps < 0n)
    throw new TxBuildError(
      "EXUNITS_EXCEEDED",
      "the given execution units are more than a transaction may use",
      // The totals of the given units: the limits less what is left of them
      {
        details: {
          mem: BigInt(params.maxTxExMem) - mem,
          steps: BigInt(params.maxTxExSteps) - steps,
        },
      },
    );
  return {
    mem: (mem / BigInt(count)).toString(),
    steps: (steps / BigInt(count)).toString(),
  };
};

/** An output with the lovelace it needs filled in, checked against the ledger's limits */
const withMinCoin = (part: OutputPart, params: Protocol): OutputPart => {
  const given = part.output.amount.coin;
  // An output fragment differs from an output only in its optional lovelace
  const output = structuredClone(part.output) as TransactionOutputPrototype;
  output.amount.coin = given ?? "0";
  const required = outputMinCoin(output, params.coinsPerUtxoSize);
  if (given === undefined) output.amount.coin = required.toString();
  else if (!coversMinCoin(output, params.coinsPerUtxoSize))
    throw new TxBuildError(
      "OUTPUT_BELOW_MIN_COIN",
      `the output holds ${given} lovelace, less than the ${required} it needs`,
      {
        part: part.kind,
        label: part.label,
        details: { coin: BigInt(given), minCoin: required },
      },
    );
  const size = valueSize(output.amount);
  if (size > params.maxValSize)
    throw new TxBuildError(
      "VALUE_TOO_LARGE",
      `the output's value is larger than the ${params.maxValSize} bytes allowed`,
      {
        part: part.kind,
        label: part.label,
        details: { size, maxValSize: params.maxValSize },
      },
    );
  return given === undefined
    ? freeze({ ...part, output: output as OutputPart["output"] })
    : part;
};

/**
 * The UTxOs the parts read, by `txHash#index`: those of reference inputs and those reference
 * scripts are held in
 */
const referencedUtxos = (parts: readonly TxPart[]): Map<string, Utxo> => {
  const read = new Map<string, Utxo>();
  for (const part of parts) {
    if (part.kind === "referenceInput" && part.utxo)
      read.set(outRefString(part.input), part.utxo);
    if (!("witness" in part)) continue;
    const { witness } = part;
    if (
      (witness.type === "native" || witness.type === "plutus") &&
      witness.script.type === "reference" &&
      witness.script.utxo
    )
      read.set(outRefString(witness.script.input), witness.script.utxo);
  }
  return read;
};

/**
 * The warning for a lower bound whose slot starts after `now`, the time of the local clock;
 * undefined for one that has started
 */
const validFromFuture = (
  invalidBefore: string | number,
  network: NetworkConfig,
  now: number,
): BuildWarning | undefined => {
  const start = timeAt(network, BigInt(invalidBefore));
  return start > now
    ? {
        code: "VALID_FROM_FUTURE",
        message: `the transaction is valid from slot ${invalidBefore}, which starts in ${start - now} ms by the local clock; nodes refuse it until their tip reaches that slot`,
      }
    : undefined;
};

/** The holder of an address: its payment credential, or a Byron address itself */
const holderOf = (address: string) => {
  const parsed = Address.fromString(address);
  const credential = parsed ? paymentCredential(parsed) : undefined;
  return credential ? `${credential.type} ${credential.hash}` : address;
};

/**
 * The warning for collateral inputs of more than one holder, or of holders the collateral return
 * does not pay. The validity flag is outside the signed body, so whoever submits the transaction
 * can mark it as failing: the collateral inputs are then spent, and their holders get back only
 * what the return pays them. Each holder that loses is named by the address of its first
 * collateral input, with the lovelace it loses: those of its inputs, less what the return pays
 * it. Holders are told apart by payment credential, a Byron address by its text. One holder
 * whose return comes back to it is not warned: `collateral.total` is what it loses
 */
const collateralElsewhere = (
  inputs: readonly Utxo[],
  returned: Utxo | undefined,
): BuildWarning | undefined => {
  if (!returned || inputs.length === 0) return undefined;
  const to = holderOf(returned.address);
  const holders = new Map<
    string,
    { address: string; lovelace: bigint; tokens: boolean }
  >();
  for (const utxo of inputs) {
    const holder = holderOf(utxo.address);
    const held = holders.get(holder) ?? {
      address: utxo.address,
      lovelace: 0n,
      tokens: false,
    };
    held.lovelace += utxo.value.lovelace;
    held.tokens ||= Object.keys(utxo.value).length > 1;
    holders.set(holder, held);
  }
  if (holders.size === 1 && holders.has(to)) return undefined;
  const losses: string[] = [];
  for (const [holder, held] of holders) {
    const paid = holder === to;
    const lost = held.lovelace - (paid ? returned.value.lovelace : 0n);
    // The tokens of the inputs all go to the return, so only a holder it does not pay loses them
    const tokens = !paid && held.tokens;
    if (lost > 0n || tokens)
      losses.push(
        `${held.address} loses ${lost > 0n ? lost : 0n} lovelace${tokens ? " and the tokens of its inputs" : ""}`,
      );
  }
  if (losses.length === 0) return undefined;
  const listed =
    losses.length === 1
      ? losses[0]
      : `${losses.slice(0, -1).join(", ")} and ${losses[losses.length - 1]}`;
  return {
    code: "COLLATERAL_RETURN_ELSEWHERE",
    message: `the collateral return pays a payment credential that holds ${holders.has(to) ? "only some" : "none"} of the collateral inputs: if a script fails, ${listed}, however small the total collateral the body states; the validity flag is not signed, so whoever submits the transaction can mark it as failing`,
  };
};

/** The warning for a body that puts up collateral and has no collateral return */
const collateralForfeited = (
  body: TransactionPrototype["body"],
): BuildWarning | undefined =>
  (body.collateral?.length ?? 0) > 0 && !body.collateral_return
    ? {
        code: "COLLATERAL_FORFEITED",
        message: `the transaction has no collateral return: all of its collateral${body.total_collateral ? `, ${body.total_collateral} lovelace,` : ""} is forfeited if a script fails`,
      }
    : undefined;

/** The address bytes an output is written with, in hex, read from its CBOR as given */
const writtenAddress = (output: Serialization.TransactionOutput) => {
  const reader = new CborReader(output.toCbor());
  if (reader.peekState() === Serialization.CborReaderState.StartArray) {
    reader.readStartArray();
    return Buffer.from(reader.readByteString()).toString("hex");
  }
  const length = reader.readStartMap();
  for (let i = 0; length === null || i < length; i++) {
    if (reader.readInt() === 0n)
      return Buffer.from(reader.readByteString()).toString("hex");
    reader.skipValue();
  }
  return undefined;
};

/**
 * What a decoded body holds that the value decoder takes and a ledger does not, in words that
 * quote nothing of it; undefined for none: a negative fee, a token quantity of zero in an output
 * or the mint, an out ref named twice in one set, an output address with bytes after the
 * address they hold
 */
const unreadForm = (
  body: Serialization.TransactionBody,
): string | undefined => {
  if (body.fee() < 0n) return "its fee is negative";
  const returned = body.collateralReturn();
  const outputs: [string, Serialization.TransactionOutput][] = [
    ...body
      .outputs()
      .map((output, i): [string, typeof output] => [`output ${i}`, output]),
    ...(returned
      ? [["its collateral return", returned] as [string, typeof returned]]
      : []),
  ];
  for (const [name, output] of outputs) {
    for (const quantity of output.amount().multiasset()?.values() ?? [])
      if (quantity === 0n) return `${name} holds a token in a quantity of zero`;
    if (writtenAddress(output) !== output.address().toBytes().toLowerCase())
      return `the address of ${name} has bytes after the address they hold`;
  }
  for (const quantity of body.mint()?.values() ?? [])
    if (quantity === 0n) return "its mint holds a token in a quantity of zero";
  const sets: [
    string,
    readonly Serialization.TransactionInput[] | undefined,
  ][] = [
    ["inputs", body.inputs().values()],
    ["collateral inputs", body.collateral()?.values()],
    ["reference inputs", body.referenceInputs()?.values()],
  ];
  for (const [name, inputs] of sets) {
    const seen = new Set<string>();
    for (const input of inputs ?? []) {
      const ref = `${input.transactionId()}#${input.index()}`;
      if (seen.has(ref)) return `its ${name} name one output twice`;
      seen.add(ref);
    }
  }
  return undefined;
};

const FROM_CBOR_OPTIONS_ALLOWED = "an object { knownUtxos? }";

const KNOWN_UTXOS_ONCE =
  "a list of UTxOs in which the entries that name one output are alike";

/** The reads of `fromCbor` that run at the same time, at most */
const READS_AT_ONCE = 8;

/** A UTxO as a text, equal for two UTxOs that hold the same */
const utxoText = (utxo: Utxo) =>
  JSON.stringify(utxo, (_, value: unknown) =>
    typeof value === "bigint"
      ? `${value}n`
      : typeof value === "object" && value !== null && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)),
          )
        : value,
  );

/** The error for a witness inside a transaction that is not of its body */
const notOfBody = (keyHash: string | undefined) =>
  new TxPlanError(
    "INVALID_WITNESS",
    `the transaction holds a signature of key ${keyHash} that is not of its body: it was made for another transaction, or the body was changed after it`,
    {
      details: {
        reason: "wrongBody",
        argument: 0,
        ...(keyHash !== undefined && { keyHash }),
      },
    },
  );

/** An address the value decoder reads, standing in for a Byron address while it reads an output */
const STAND_IN = Address.fromBytes(HexBlob(`60${"00".repeat(28)}`));

/**
 * The transaction as a value, from its parts decoded once. The value decoder writes every output
 * address in bech32, which a Byron address has no form in: such an output is read with a
 * stand-in address, and its address is then the base58 text `outputs` shows
 * @param outputs The outputs, read from the same body
 */
const prototypeOf = (
  raw: RawTx,
  outputs: readonly Utxo[],
  collateralReturn: Utxo | undefined,
): TransactionPrototype => {
  const decoded = raw.body.outputs();
  const returned = raw.body.collateralReturn();
  const isByron = (output: Serialization.TransactionOutput) =>
    output.address().asByron() !== undefined;
  const byron = decoded.some(isByron) || (returned && isByron(returned));
  const standIn = (output: Serialization.TransactionOutput) => {
    if (!isByron(output)) return output;
    const copy = new Serialization.TransactionOutput(STAND_IN, output.amount());
    const datum = output.datum();
    if (datum) copy.setDatum(datum);
    const scriptRef = output.scriptRef();
    if (scriptRef) copy.setScriptRef(scriptRef);
    return copy;
  };
  // With a Byron output, the body is read through a view whose outputs stand in for those at
  // Byron addresses; every other member is the decoded body's, which is not changed
  const read = byron
    ? new Proxy(raw.body, {
        get: (target, name) => {
          if (name === "outputs") {
            const shown = decoded.map(standIn);
            return () => shown;
          }
          if (name === "collateralReturn") {
            const shown = returned && standIn(returned);
            return () => shown;
          }
          const member: unknown = Reflect.get(target, name, target);
          return typeof member === "function" ? member.bind(target) : member;
        },
      })
    : raw.body;
  // The converter reads these four members of a transaction: each gives a part decoded once,
  // where the transaction's own would decode it again
  const prototype = transactionPrototypeFromCardano({
    body: () => read,
    witnessSet: () => raw.witnesses,
    auxiliaryData: () => raw.auxiliaryData,
    isValid: () => raw.isValid,
  } as unknown as Transaction);
  if (!byron) return prototype;
  prototype.body.outputs.forEach((output, i) => {
    output.address = outputs[i]!.address;
  });
  if (prototype.body.collateral_return && collateralReturn)
    prototype.body.collateral_return.address = collateralReturn.address;
  return prototype;
};

/** A signer given in place of the options of `fromCbor` */
const SIGNER_IN_PLACE = {
  is: givenAsSigner,
  hint: "a signer is given to sign() of the object it returns",
};

/**
 * A transaction `fromCbor` does not take. A private key may be given there by mistake, so the
 * message and `details.value` name only its JavaScript type, never the value
 * @param message Why, in words that quote nothing of what was given
 */
const refusedTx = (txCbor: unknown, message: string, cause?: unknown) =>
  new TxBuildError("INVALID_OPTION", message, {
    details: {
      option: "tx",
      value: typeOf(txCbor),
      allowed: "a transaction in CBOR hex",
    },
    ...(cause !== undefined && { cause }),
  });

/** An out ref of a transaction body */
type BodyOutRef = { transaction_id: string; index: number };

/** The key of an out ref of a body, as `utxoKey` writes the out ref of a UTxO */
const bodyOutRefKey = (input: BodyOutRef) =>
  `${input.transaction_id.toLowerCase()}#${input.index}`;

/**
 * Every address the body of a transaction names beside its inputs, and the network id it states,
 * as entries of the network check
 * @param networkId The network id the body states, if it states one
 */
const bodyEntries = (
  body: TransactionPrototype["body"],
  outputs: readonly Utxo[],
  collateralReturn: Utxo | undefined,
  networkId: number | undefined,
): NetworkEntry[] => [
  ...(networkId === undefined ? [] : [{ role: "body" as const, networkId }]),
  ...outputs.map((utxo) => ({
    role: "output" as const,
    address: utxo.address,
  })),
  ...(collateralReturn
    ? [
        {
          role: "collateralReturn" as const,
          address: collateralReturn.address,
        },
      ]
    : []),
  ...Object.keys(body.withdrawals ?? {}).map((address) => ({
    role: "withdrawal" as const,
    address,
  })),
  ...(body.certs ?? []).flatMap((certificate) =>
    certificate.type === "POOL_REGISTRATION"
      ? [
          {
            role: "rewardAccount" as const,
            address: certificate.value.pool_params.reward_account,
          },
        ]
      : [],
  ),
  ...(body.voting_proposals ?? []).flatMap((proposal) => [
    { role: "rewardAccount" as const, address: proposal.reward_account },
    ...(proposal.governance_action.type === "TREASURY_WITHDRAWALS_ACTION"
      ? Object.keys(proposal.governance_action.value.withdrawals).map(
          (address) => ({ role: "rewardAccount" as const, address }),
        )
      : []),
  ]),
];

/**
 * The validity interval of a transaction body, with the bounds it has, in slots and in the POSIX
 * milliseconds those slots start at; undefined without either bound
 */
const validityOf = (
  body: TransactionPrototype["body"],
  network: NetworkConfig,
): BuiltTxData["validity"] => {
  const before = body.validity_start_interval;
  const hereafter = body.ttl;
  if (
    (before === undefined || before === null) &&
    (hereafter === undefined || hereafter === null)
  )
    return undefined;
  const validity: NonNullable<BuiltTxData["validity"]> = {};
  if (before !== undefined && before !== null) {
    validity.invalidBefore = Number(before);
    validity.from = timeAt(network, BigInt(before));
  }
  if (hereafter !== undefined && hereafter !== null) {
    validity.invalidHereafter = Number(hereafter);
    validity.until = timeAt(network, BigInt(hereafter));
  }
  return validity;
};
