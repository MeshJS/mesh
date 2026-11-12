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
  OfflineEvaluatorScalus,
  Transaction,
  transactionPrototypeToHex,
  TxCBOR,
} from "@meshsdk/core-cst";

import type { AssembledRedeemer } from "./assemble";
import type { Balanced, CollateralPlan } from "./balance";
import type { PartFailure } from "./errors";
import type {
  CredentialInput,
  OutputPart,
  PlutusWitness,
  TxPart,
} from "./parts/types";
import type { Payer, PayerSnapshot, PayerSource } from "./payer";
import type { GovernanceDeposits } from "./resolve";
import { balance, totalExUnits } from "./balance";
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
} from "./network";
import { freeze } from "./parts/normalize";
import { givenPayerEntries, readPayerSource, toPayerSource } from "./payer";
import { resolveParts, utxoKey } from "./resolve";

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

/** Per-build options */
export type BuildOptions = {
  /** Who pays and gets the change; a build without one is MISSING_PAYER */
  payer?: Payer;
  /**
   * A fee that goes into the body as given; FEE_TOO_LOW `{ fee, minFee }` when the final
   * transaction's minimum fee is higher
   */
  fee?: bigint;
  /** Operator key hashes of pools already registered (registering again is an update) */
  registeredPools?: readonly string[];
  /** Key witnesses expected beyond those the parts call for */
  extraKeyWitnesses?: number;
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

const describe = (value: unknown): string => {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "object" && value !== null)
    return Array.isArray(value) ? "a list" : "an object";
  return String(value);
};

const invalidOption = (option: string, value: unknown, allowed: string) =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid ${option}: expected ${allowed}; got ${describe(value)}`,
    { details: { option, value, allowed } },
  );

/**
 * Checks the type of every option of a build but `payer`
 * @throws TxBuildError INVALID_OPTION naming the first option that is not of its type
 */
const checkBuildOptions = (options: BuildOptions) => {
  const { fee, registeredPools, extraKeyWitnesses } = options;
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
};

export type BuiltRedeemer = {
  tag: AssembledRedeemer["tag"];
  index: number;
  exUnits: Budget;
  /** The part the redeemer belongs to */
  part: AssembledRedeemer["part"];
  label?: string;
};

/** A transaction built and balanced, ready to sign */
export type BuiltTx = {
  /** The unsigned transaction, in CBOR hex */
  tx: string;
  txHash: string;
  /** The transaction as a value, exactly as serialized */
  prototype: TransactionPrototype;
  fee: bigint;
  /** Total execution units of the transaction's redeemers */
  exUnits: { mem: bigint; steps: bigint };
  redeemers: BuiltRedeemer[];
  /** Every input spent, in the transaction's order */
  inputs: UTxO[];
  /** The inputs added to pay for the transaction */
  selectedInputs: UTxO[];
  /** The outputs returning change */
  change: TransactionOutputPrototype[];
  /** The collateral, when the transaction runs Plutus scripts */
  collateral?: CollateralPlan;
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
 * A builder holds only its network, providers and settings, so one builder can build any number
 * of transactions, concurrently included. It reads through the `CachedFetcher` of its provider,
 * shared with every builder, wallet and evaluator over the same provider, and evaluates scripts
 * locally unless given another evaluator.
 *
 * ```ts
 * const builder = new TxBuilder({ network: "preprod", provider });
 * const { tx, fee } = await builder.build(
 *   output({ address, value: { lovelace: 5_000_000n } }),
 *   { payer: wallet },
 * );
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
   * @param time POSIX time in milliseconds, or a Date
   * @throws TxBuildError INVALID_OPTION for a time that is not finite, or another `round`
   */
  slotAt(time: number | Date, round?: "down" | "up"): number {
    const ms = time instanceof Date ? time.getTime() : time;
    if (!(typeof ms === "number" && Number.isFinite(ms)))
      throw new TxBuildError(
        "INVALID_OPTION",
        `invalid time ${String(time)}: expected POSIX milliseconds or a Date, finite`,
        {
          details: {
            option: "time",
            value: time,
            allowed: "a finite number of POSIX milliseconds, or a valid Date",
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
    return slotAt(this.network, ms, round);
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
   * Builds a balanced, unsigned transaction.
   *
   * Before anything is selected the builder reads the payer once (a wallet's change address,
   * UTxOs and network id, concurrently) and checks the network of every address it is given or
   * finds.
   *
   * With a payer given as a snapshot, explicit `params` and `costModels`, and a local evaluator,
   * the build does no I/O but the lookups its parts ask for, and the same arguments give the
   * same bytes and `txHash`.
   *
   * 1. Checks that every address it is given is of the builder's network. Reads the payer and
   *    looks up, all at once and once each, the outputs the parts reference, the reward balances
   *    they withdraw in full, the protocol parameters and (when Plutus scripts run) the cost
   *    models. Lookups go through the provider's shared cache, which answers from what it holds;
   *    the payer's UTxOs are always read past it. What is read and looked up is checked for its
   *    network too.
   * 2. Fills in what the parts leave open: reference scripts, datums, deposits, output lovelace.
   * 3. Balances: selects inputs from the payer's UTxOs, returns change to its change address,
   *    puts up collateral with a collateral return, and settles the fee.
   * 4. Evaluates the scripts with the builder's evaluator, configured with its network, slot
   *    clock and the cost models of step 1, and balances again with their execution units,
   *    until they settle. A local evaluator gets every UTxO the build knows for the
   *    transaction's inputs; any other resolves them from its chain. Units stated on a redeemer
   *    are checked, not replaced, when the builder has an evaluator; after `evaluator: null`
   *    they are taken as stated.
   *
   * Redeemer indices follow from where each item ends up in the ledger's order, assigned once
   * by `assembleTxPrototype`; evaluation results are matched back to their parts through them.
   *
   * @throws TxBuildError with a `code`; TxPartError when what is looked up does not fit a part
   *   (e.g. a reference output holding a different script)
   */
  async build(parts: PartsInput, options?: BuildOptions): Promise<BuiltTx> {
    // Nothing can be read without a payer: that comes first, then the options' types, then the
    // network of what the build is given, all before any request
    const source = toPayerSource(options?.payer);
    const flat = flattenParts(parts);
    checkBuildOptions(options ?? {});
    // What is read and looked up is checked once found
    checkNetworks(this.network, [
      ...givenPayerEntries(source),
      ...flat.flatMap(partEntries),
    ]);
    const { fee, registeredPools, extraKeyWitnesses } = options ?? {};
    const known = new Map<string, UTxO>();
    // A snapshot's UTxOs are known before the lookups start, so a part may name one by out ref
    if (source.form === "snapshot")
      for (const utxo of source.snapshot.utxos) known.set(utxoKey(utxo), utxo);
    const plutus = flat.some(runsPlutus);

    // Every read starts at once, and none waits for another
    const paramsRead = this.loadParams();
    const [params, costModels, payer, resolved] = await Promise.all([
      paramsRead,
      plutus
        ? this.loadCostModels().then((models) => models ?? [])
        : Promise.resolve([]),
      this.readSource(source),
      resolveParts(flat, {
        network: this.network,
        ...(this.cache && { provider: this.cache }),
        params: paramsRead,
        deposits: this.deposits,
        known,
      }),
    ]);
    // The copy a part was checked against stays the one the build knows
    for (const utxo of payer.utxos)
      if (!known.has(utxoKey(utxo))) known.set(utxoKey(utxo), utxo);
    const filled = resolved.map((part) =>
      part.kind === "output" ? withMinCoin(part, params) : part,
    );

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

    const context = {
      params,
      costModels,
      changeAddress: payer.changeAddress,
      utxos: payer.utxos,
      known,
      ...(fee !== undefined && { fee }),
      registeredPools: new Set(registeredPools ?? []),
      extraKeyWitnesses: extraKeyWitnesses ?? 0,
      serialize: (prototype: TransactionPrototype) => this.serialize(prototype),
    };

    for (let round = 0; round < MAX_EVALUATION_ROUNDS; round++) {
      const roundParts = filled.map((part, i) => {
        const exUnits = units.get(i);
        return exUnits ? withExUnits(part, exUnits) : part;
      });
      const balanced = balance(roundParts, {
        ...context,
        provisional: evaluated.size < open.length,
      });
      if (redeemerParts.length === 0 || !this.evaluator)
        return this.finish(balanced, params, costModels);

      const tx = this.serialize(balanced.assembled.prototype);
      const results = await this.evaluate(tx, balanced, known, costModels);
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
      if (settled) return this.finish(balanced, params, costModels);
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
    return this.readSource(source);
  }

  /** Reads a payer whose given data was checked; its UTxOs from the provider past the cache */
  private readSource(source: PayerSource): Promise<PayerSnapshot> {
    return readPayerSource(source, {
      network: this.network,
      ...(this.cache && { provider: this.cache.fetcher }),
    });
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
   */
  private async evaluate(
    tx: string,
    balanced: Balanced,
    known: ReadonlyMap<string, UTxO>,
    costModels: number[][],
  ): Promise<Map<string, ExUnitsPrototype>> {
    const evaluator = this.evaluator!;
    // A local evaluator takes every UTxO the build knows; any other resolves the inputs from
    // its chain, since a remote one may reject UTxOs that also exist there
    const utxos = new Map<string, UTxO>();
    if (evaluator.acceptsKnownUtxos) {
      const { body } = balanced.assembled.prototype;
      for (const input of [
        ...body.inputs,
        ...(body.reference_inputs ?? []),
        ...(body.collateral ?? []),
      ]) {
        const key = `${input.transaction_id}#${input.index}`;
        const utxo = known.get(key);
        if (utxo) utxos.set(key, utxo);
      }
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

  private finish(
    balanced: Balanced,
    params: Protocol,
    costModels: number[][],
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

    const inputs = new Map(
      balanced.parts.flatMap((p) =>
        p.kind === "spend" ? [[utxoKey(p.utxo!), p.utxo!] as const] : [],
      ),
    );
    return {
      tx,
      txHash: Transaction.fromCbor(TxCBOR(tx)).getId().toString(),
      prototype,
      fee: balanced.fee,
      exUnits: total,
      redeemers: assembled.redeemers.map((r) => ({
        tag: r.tag,
        index: r.index,
        exUnits: { mem: Number(r.exUnits.mem), steps: Number(r.exUnits.steps) },
        part: r.part,
        ...(r.label !== undefined && { label: r.label }),
      })),
      inputs: prototype.body.inputs.map((i) =>
        inputs.get(`${i.transaction_id}#${i.index}`)!,
      ),
      selectedInputs: balanced.selected,
      change: balanced.change,
      ...(balanced.collateral && { collateral: balanced.collateral }),
      parts: balanced.parts,
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
