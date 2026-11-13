import type {
  Budget,
  ExUnitsPrototype,
  IEvaluator,
  IFetcher,
  IMeshTxSerializer,
  ISubmitter,
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
  UTxO,
} from "@meshsdk/common";
import {
  CachedFetcher,
  ScriptEvaluationError,
  slotAt,
  timeAt,
} from "@meshsdk/common";
import {
  CborWriter,
  OfflineEvaluatorScalus,
  plutusDataVariantToCardano,
  Transaction,
  transactionPrototypeToHex,
  TxCBOR,
} from "@meshsdk/core-cst";

import type { AssembledRedeemer, AssembledTx, RedeemerPart } from "./assemble";
import type {
  BalanceContext,
  Balanced,
  CollateralPlan,
  SelectInputs,
} from "./balance";
import type { ChainedTx } from "./chain";
import type { PartFailure } from "./errors";
import type {
  CredentialInput,
  OutputPart,
  PlutusWitness,
  TxPart,
} from "./parts/types";
import type {
  GetCollateral,
  Payer,
  PayerRead,
  PayerSnapshot,
  PayerSource,
} from "./payer";
import type { GovernanceDeposits } from "./resolve";
import type { TxSigners } from "./witnesses";
import { abortable, throwIfAborted } from "./abort";
import {
  balance,
  collateralCandidates,
  isPoolShortfall,
  paymentPool,
  refusedBy,
  totalExUnits,
} from "./balance";
import {
  bodyOutputs,
  foldTransactions,
  plainUtxo,
  refuseSpentOutRefs,
  spentByTransactions,
} from "./chain";
import { TxBuildError } from "./errors";
import { coversMinCoin, minCoin, valueSize } from "./fee";
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
import { freeze, outRefString } from "./parts/normalize";
import {
  copyUtxo,
  givenPayerEntries,
  readPayerSource,
  toAddressText,
  toPayerSource,
  toUtxo,
} from "./payer";
import { resolveParts, resolveValidity, utxoKey } from "./resolve";
import { txSigners } from "./witnesses";

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
  /** A submitter answered with another hash than the transaction's; sent by an intent, never by a build */
  | {
      type: "warning";
      code: "HASH_MISMATCH";
      txHash: string;
      reportedHash: string;
    };

/** Per-build options */
export type BuildOptions = {
  /** Who pays and gets the change; a build without one is MISSING_PAYER */
  payer?: Payer;
  /**
   * Which of the payer's UTxOs may be selected for payment and collateral. UTxOs the parts read
   * (reference inputs, reference scripts) and script-locked UTxOs are never selected.
   */
  canSelect?: (utxo: UTxO) => boolean;
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
  /** Key witnesses expected beyond those the parts call for */
  extraKeyWitnesses?: number;
  /**
   * Transactions built before this one and not yet seen by the provider: their inputs are not
   * selected again, their change is selectable, and all their outputs can be spent or read by
   * out ref without a lookup. Only change becomes selectable, never an output paid to another:
   * of their change, only the outputs at this build's change address are selected. A part that
   * names an output they spend is refused with UTXO_NOT_FOUND. Their collateral inputs stay
   * selectable, since a valid transaction does not spend them. The build keeps nothing of them:
   * a transaction not given here is not known to it.
   */
  after?: BuiltTx | readonly BuiltTx[];
  /**
   * Outputs the parts may name by out ref that the provider may not know yet; never selected.
   * Being listed here makes no UTxO selectable and takes none out of selection: one the payer
   * also holds is still selected. They are used as given, and reach the evaluator with the
   * transaction.
   */
  knownUtxos?: readonly UTxO[];
  /**
   * Aborts the build with ABORTED: a wallet read, a lookup, the collateral call or an evaluation
   * that is pending is no longer waited for
   */
  signal?: AbortSignal;
  /** Receives the steps of the build, for diagnostics; whatever it throws or rejects with is ignored */
  trace?: (event: BuildEvent) => void;
};

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
    requiredSigner: true,
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

const PARTS_ALLOWED =
  "a part, or a list of parts, nested lists, false, null and undefined";

const invalidParts = (entry: unknown, reason: string) =>
  new TxBuildError("INVALID_OPTION", `invalid parts: ${reason}`, {
    details: { option: "parts", value: entry, allowed: PARTS_ALLOWED },
  });

/**
 * The parts of a `PartsInput`, in order: nested lists flattened depth first, `false`, `null` and
 * `undefined` dropped
 * @throws TxBuildError INVALID_OPTION for an entry that is none of these
 */
export const flattenParts = (input: unknown): TxPart[] => {
  if (!Array.isArray(input)) {
    if (isPart(input)) return [input];
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
    parts.push(entry);
  };
  visit(input);
  return parts;
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

const SEND_ALL_TO_ALLOWED = "a payment address, in bech32 or hex";
const AFTER_ALLOWED =
  "a transaction built by TxBuilder.build (txHash, inputs, outputs, change), or a list of them";
const KNOWN_UTXOS_ALLOWED =
  "a list of UTxOs { input: { txHash, outputIndex }, output: { address, amount } }";

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

/**
 * The transactions of `after`, checked by their shape and copied: UTxOs with `input` and
 * `output` only, transaction hashes in lower case and addresses in canonical text, change
 * outputs marked
 */
const toAfter = (after: unknown): AfterTx[] => {
  if (after === undefined) return [];
  if (typeof after !== "object" || after === null)
    throw invalidOption("after", after, AFTER_ALLOWED);
  const entries: unknown[] = Array.isArray(after) ? after : [after];
  return entries.map((entry, i) => {
    const tx = entry as Record<string, unknown> | null;
    const where = Array.isArray(after) ? `entry ${i}` : "the transaction";
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
        entry,
        AFTER_ALLOWED,
        `${where} is not a built transaction: expected ${AFTER_ALLOWED}; got ${describe(entry)}`,
      );
    try {
      return {
        txHash: tx.txHash.toLowerCase(),
        inputs: (tx.inputs as unknown[]).map(copyUtxo),
        outputs: (tx.outputs as unknown[]).map((output): BuiltOutput => ({
          ...copyUtxo(output),
          ...((output as BuiltOutput).change === true && {
            change: true as const,
          }),
        })),
      };
    } catch (error) {
      throw invalidEntry(
        "after",
        entry,
        AFTER_ALLOWED,
        `${where} holds an input or output that is not a UTxO: ${errorText(error)}`,
        error,
      );
    }
  });
};

/** The UTxOs of `knownUtxos`, checked by their shape and copied as `toAfter` copies them */
const toKnownUtxos = (knownUtxos: unknown): UTxO[] => {
  if (knownUtxos === undefined) return [];
  if (!Array.isArray(knownUtxos))
    throw invalidOption("knownUtxos", knownUtxos, KNOWN_UTXOS_ALLOWED);
  return knownUtxos.map((entry: unknown, i) => {
    try {
      return copyUtxo(entry);
    } catch (error) {
      throw invalidEntry(
        "knownUtxos",
        entry,
        KNOWN_UTXOS_ALLOWED,
        `entry ${i} is not a UTxO: ${errorText(error)}`,
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
  140 * params.maxCollateralInputs + 100;

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
): { sendAllTo?: string; after: AfterTx[]; knownUtxos: UTxO[] } => {
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
  const after = toAfter(options.after);
  const knownUtxos = toKnownUtxos(options.knownUtxos);
  if (sendAllTo === undefined) return { after, knownUtxos };
  if (typeof sendAllTo !== "string")
    throw invalidOption("sendAllTo", sendAllTo, SEND_ALL_TO_ALLOWED);
  try {
    return { sendAllTo: toAddressText(sendAllTo), after, knownUtxos };
  } catch (error) {
    throw invalidOption("sendAllTo", sendAllTo, SEND_ALL_TO_ALLOWED, error);
  }
};

/** A redeemer of a built transaction */
export type BuiltRedeemer = {
  tag: AssembledRedeemer["tag"];
  index: number;
  /** Execution units, as bigint like `BuiltTx.exUnits` */
  exUnits: { mem: bigint; steps: bigint };
  /** The redeemer data, in CBOR hex, as the transaction carries it */
  data: string;
  /** The part the redeemer belongs to */
  part: AssembledRedeemer["part"];
  label?: string;
};

/** Something worth knowing that did not stop the build */
export type BuildWarning = {
  /**
   * - `VALID_FROM_FUTURE`: the slot of the transaction's lower bound starts after the current
   *   time of the local clock
   * - `COLLATERAL_FORFEITED`: the transaction puts up collateral and has no collateral return:
   *   all of the collateral is at stake
   * - `FEE_ABOVE_MINIMUM`: the `fee` given is above the minimum fee of the transaction
   *
   * The list is open: later versions may add codes, so code that reads it keeps a default
   * branch.
   */
  code: "VALID_FROM_FUTURE" | "COLLATERAL_FORFEITED" | "FEE_ABOVE_MINIMUM";
  message: string;
  /** The kind of the part it is about */
  part?: TxPart["kind"];
  /** The label of that part, when it has one */
  label?: string;
};

/** An output of a built transaction, as the UTxO it becomes */
export type BuiltOutput = UTxO & {
  /** The label of the output part it comes from */
  readonly label?: string;
  /** Set on change outputs: those at the payer's change address that took change */
  readonly change?: true;
};

/** A transaction built and balanced, ready to sign. Plain data. */
export type BuiltTx = {
  /** The unsigned transaction, in CBOR hex */
  tx: string;
  txHash: string;
  /**
   * The transaction as a value, exactly as serialized. It follows the transaction format of the
   * current ledger era; code meant to outlive an era reads the other members of `BuiltTx`.
   */
  prototype: TransactionPrototype;
  fee: bigint;
  /** Total execution units of the transaction's redeemers */
  exUnits: { mem: bigint; steps: bigint };
  redeemers: BuiltRedeemer[];
  /** Every input spent, resolved, in the transaction's order */
  inputs: UTxO[];
  /** The inputs added to pay for the transaction */
  selectedInputs: UTxO[];
  /** The reference inputs, resolved, in the transaction's order */
  referenceInputs: UTxO[];
  /**
   * Every output as a UTxO of `txHash`, in body order, with its part's label. The collateral
   * return is not among them.
   */
  outputs: BuiltOutput[];
  /**
   * The change outputs, as UTxOs of `txHash`, in body order; each is also in `outputs`. A build
   * made before this transaction is seen by the provider passes it as `after`; when that build
   * has the same change address, it can then select this change.
   */
  change: BuiltOutput[];
  /** The collateral, when the transaction runs Plutus scripts */
  collateral?: CollateralPlan;
  /** The keys that must sign, and why */
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
  /** The network the transaction was built for */
  network: { name: string; networkId: 0 | 1 };
  /** What is worth knowing about the transaction and did not stop the build; often empty */
  warnings: BuildWarning[];
  /** Every part of the transaction, resolved, the ones added by balancing included */
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

const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : JSON.stringify(error);

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
  /** The shared cache of the provider; every read goes through it */
  private readonly cache?: CachedFetcher;
  /** The parts added with `add`, flat and in order, as they were given; `build` takes them first */
  private readonly added: readonly TxPart[] = EMPTY_PARTS;

  /**
   * @throws TxBuildError INVALID_OPTION for a missing or unacceptable `network`;
   *   UNSUPPORTED_SERIALIZER for a serializer without `serializeTxPrototype`;
   *   MISSING_PARAMETER with neither a provider nor `params`;
   *   NETWORK_MISMATCH when the provider states another network
   */
  constructor(options: TxBuilderOptions) {
    this.network = resolveNetwork(options?.network);
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
   */
  serialize(prototype: TransactionPrototype): string {
    return this.serializer
      ? this.serializer.serializeTxPrototype!(prototype)
      : transactionPrototypeToHex(prototype);
  }

  /**
   * Builds a balanced, unsigned transaction from the parts added with `add`, followed by `parts`
   * (none when omitted). The builder is not changed: the parts it holds are never replaced by
   * what the build makes of them. A part of a kind a transaction holds once, given both here and
   * among the held parts, is DUPLICATE_PART, as within one list.
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
   *    names an output a transaction of `after` spends. Reads the payer and looks up, all at
   *    once and once each, the outputs the parts reference that neither `knownUtxos` nor the
   *    outputs of `after` hold, the reward balances they withdraw in full, the protocol
   *    parameters and (when Plutus scripts run) the cost models. Lookups go through the
   *    provider's shared cache, which answers from what it holds; the payer's UTxOs are always
   *    read past it. What is read and looked up is checked for its network too.
   * 2. Fills in what the parts leave open: reference scripts, datums, deposits, output lovelace.
   * 3. Balances: selects inputs from the payer's UTxOs, less those `after` spends and with
   *    its change at the payer's change address, that `canSelect` lets it, with `coinSelection`
   *    when given, returns change to its change address (or sends everything left to
   *    `sendAllTo`), puts up collateral with a collateral return, and settles the fee. When the
   *    payer's UTxOs cannot cover the collateral and the payer is a CIP-30 api with
   *    `getCollateral`, that is called once, and the collateral is taken from its answer alone,
   *    less what `after` spends.
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
   * @throws TxBuildError with a `code`; TxPartError when what is looked up does not fit a part
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
    const source = toPayerSource(options?.payer);
    return this.buildList(source, this.withAdded(parts), options);
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
   * @throws TxBuildError INVALID_OPTION for an entry that is none of these
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
  ): Promise<BuiltTx> {
    const { sendAllTo, after, knownUtxos } = checkBuildOptions(options ?? {});
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
    const { fee, registeredPools, extraKeyWitnesses } = options ?? {};
    const { canSelect, coinSelection, signal } = options ?? {};
    throwIfAborted(signal);
    const emit = tracer(options?.trace);
    const known = new Map<string, UTxO>();
    // A snapshot's UTxOs are known before the lookups start, so a part may name one by out ref
    if (source.form === "snapshot")
      for (const utxo of source.snapshot.utxos) known.set(utxoKey(utxo), utxo);
    // So are the outputs of `after` and the UTxOs of `knownUtxos`, which the provider may not
    // know yet: every evaluator is handed those the transaction names
    const handed = new Set<string>();
    for (const utxo of [
      ...after.flatMap((tx) => tx.outputs.map(plainUtxo)),
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
        output.change === true && output.output.address === payer.changeAddress,
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
      selectable: paymentPool(filled, selectable, refused || undefined).pool
        .length,
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
      ...(fee !== undefined && { fee }),
      registeredPools: new Set(registeredPools ?? []),
      extraKeyWitnesses: extraKeyWitnesses ?? 0,
      serialize: (prototype: TransactionPrototype) => this.serialize(prototype),
      onRound: (priced) => emit({ type: "round", ...priced }),
    };

    // The collateral fallback of a CIP-30 payer is asked once per build, and only when the
    // payer's own UTxOs cannot cover the collateral of a round whose units are settled
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
    const source = toPayerSource(payer);
    checkNetworks(this.network, givenPayerEntries(source));
    return (await this.readSource(source)).snapshot;
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
   * Asks a CIP-30 payer for collateral, once: for the collateral the transaction calls for, an
   * upper estimate, and returns the UTxOs of the answer that may be put up. Those become known
   * to the build.
   * @throws TxBuildError INSUFFICIENT_COLLATERAL when the call fails or gives nothing usable;
   *   NETWORK_MISMATCH for a UTxO of another network; ABORTED
   */
  private async collateralFromWallet(
    getCollateral: GetCollateral,
    parts: TxPart[],
    ctx: BalanceContext,
    options: {
      /** Every UTxO the build knows, which the usable ones join */
      known: Map<string, UTxO>;
      canSelect?: (utxo: UTxO) => boolean;
      signal?: AbortSignal;
      /** The out refs the transactions of `after` spend, which are never put up */
      spent: ReadonlyMap<string, string>;
    },
  ): Promise<UTxO[]> {
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
    const refused = (message: string, cause?: unknown) =>
      new TxBuildError(
        "INSUFFICIENT_COLLATERAL",
        `the payer's UTxOs cannot cover the collateral, and the wallet's getCollateral ${message}`,
        {
          details: { required: amount, available: 0n },
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
    let utxos: UTxO[];
    try {
      const { value } = answer;
      if (value === undefined || value === null) utxos = [];
      else if (!Array.isArray(value))
        throw new Error("the answer is not a list");
      else utxos = value.map(toUtxo);
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
    const usable = collateralCandidates(
      parts,
      utxos.filter((utxo) => !options.spent.has(utxoKey(utxo))),
      options.canSelect,
    );
    if (usable.length === 0)
      throw refused(
        utxos.length === 0
          ? `gave no UTxO for ${amount} lovelace`
          : `gave no UTxO that may be put up for ${amount} lovelace`,
      );
    for (const utxo of usable)
      if (!options.known.has(utxoKey(utxo)))
        options.known.set(utxoKey(utxo), utxo);
    return usable;
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
    known: ReadonlyMap<string, UTxO>,
    handed: ReadonlySet<string>,
    costModels: number[][],
  ): Promise<Map<string, ExUnitsPrototype>> {
    const evaluator = this.evaluator!;
    // A local evaluator takes every UTxO the build knows; any other resolves the inputs from
    // its chain, since a remote one may reject UTxOs that also exist there, and gets only those
    // given as data, which its chain may not have yet
    const utxos = new Map<string, UTxO>();
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
      actions = await evaluator.evaluateTx(tx, Array.from(utxos.values()), []);
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
    const results = new Map<string, ExUnitsPrototype>();
    for (const action of actions) {
      results.set(`${EVALUATOR_TAGS[action.tag]}:${action.index}`, {
        mem: String(action.budget.mem),
        steps: String(action.budget.steps),
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
      const start = timeAt(this.network, BigInt(resolved.invalidBefore));
      if (start > now)
        warnings.push({
          code: "VALID_FROM_FUTURE",
          message: `the transaction is valid from slot ${resolved.invalidBefore}, which starts in ${start - now} ms by the local clock; nodes refuse it until their tip reaches that slot`,
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
  ): BuiltTx {
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
    const txHash = Transaction.fromCbor(TxCBOR(tx)).getId().toString();
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
    const forfeited =
      (body.collateral?.length ?? 0) > 0 && !body.collateral_return;
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
      referenceInputs: (body.reference_inputs ?? []).map((i) =>
        references.get(outRefString(i))!,
      ),
      outputs,
      change: outputs.filter((o) => o.change),
      ...(balanced.collateral && { collateral: balanced.collateral }),
      signers: txSigners(balanced.parts),
      ...(validity && { validity }),
      network: { name: this.network.name, networkId: this.network.networkId },
      warnings: [
        ...warnings,
        ...(forfeited
          ? [
              {
                code: "COLLATERAL_FORFEITED" as const,
                message: `the transaction has no collateral return: all of its collateral${body.total_collateral ? `, ${body.total_collateral} lovelace,` : ""} is forfeited if a script fails`,
              },
            ]
          : []),
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
  const required = minCoin(output, params.coinsPerUtxoSize);
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
const referencedUtxos = (parts: readonly TxPart[]): Map<string, UTxO> => {
  const read = new Map<string, UTxO>();
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
 * The validity interval of a transaction body, with the bounds it has, in slots and in the POSIX
 * milliseconds those slots start at; undefined without either bound
 */
const validityOf = (
  body: TransactionPrototype["body"],
  network: NetworkConfig,
): BuiltTx["validity"] => {
  const before = body.validity_start_interval;
  const hereafter = body.ttl;
  if (
    (before === undefined || before === null) &&
    (hereafter === undefined || hereafter === null)
  )
    return undefined;
  const validity: NonNullable<BuiltTx["validity"]> = {};
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
