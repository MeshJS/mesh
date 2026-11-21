import type {
  IFetcher,
  NetworkConfig,
  Protocol,
  TransactionInputPrototype,
} from "@meshsdk/common";
import { slotAt } from "@meshsdk/common";
import { scriptHashToRewardAddress } from "@meshsdk/core-cst";

import type { PartContext } from "./parts/normalize";
import type {
  CertificateFragment,
  CertificatePart,
  DepositParameter,
  KeyWitness,
  NativeScriptSource,
  NativeWitness,
  OutRef,
  PlutusScriptSource,
  PlutusWitness,
  ProposalPart,
  SpendPart,
  TxPart,
  Utxo,
  ValidityPart,
  WithdrawalPart,
} from "./parts/types";
import type { PlacedUtxos } from "./parts/utxo";
import { TxBuildError } from "./errors";
import { checkNetworks, heldUtxos, utxoEntry } from "./network";
import { checkGivenDatum, checkLock, toSpendDatum } from "./parts/inputs";
import {
  errorText,
  fail,
  freeze,
  isWholeNumber,
  outRefString,
  rewardCredential,
  toNativeScriptSource,
  toPlutusScriptSource,
  withKnownHash,
} from "./parts/normalize";
import { placeUtxos, readPlaced, utxoKey, UtxoTwiceError } from "./parts/utxo";

/** Deposits the protocol parameters on `Protocol` leave out */
export type GovernanceDeposits = {
  /** The `drepDeposit` protocol parameter, in lovelace */
  drepDeposit?: bigint;
  /** The `govActionDeposit` protocol parameter, in lovelace */
  govActionDeposit?: bigint;
};

export type ResolveContext = {
  /** The builder's network, which every UTxO looked up is checked against */
  network: NetworkConfig;
  /** What lookups go through: the shared cache of the builder's provider */
  provider?: IFetcher;
  params: Protocol;
  deposits: GovernanceDeposits;
  /** UTxOs already known, keyed by `txHash#index`; fetched ones are added */
  known: Map<string, Utxo>;
  /** Told of the out refs looked up through the provider, as `txHash#index`, when asked for */
  onFetch?: (outRefs: string[]) => void;
  /**
   * Out refs (`txHash#index`) not looked up: a reference input or reference script naming one
   * stays as given
   */
  unread?: ReadonlySet<string>;
  /** Told of the answers of the provider, placed by their out refs, before any is read whole */
  onPlaced?: (placed: readonly PlacedUtxos[]) => void;
};

const ctxOf = (part: TxPart): PartContext => ({
  part: part.kind,
  ...(part.label !== undefined && { label: part.label }),
});

const toOutRef = (input: TransactionInputPrototype): OutRef => ({
  txHash: input.transaction_id,
  outputIndex: input.index,
});

/** Every output a part reads: the inputs it spends or references, and its reference scripts */
export const inputsOf = (part: TxPart): TransactionInputPrototype[] => {
  const inputs: TransactionInputPrototype[] = [];
  if ("input" in part) inputs.push(part.input);
  if ("witness" in part) {
    const { witness } = part;
    if (
      (witness.type === "native" || witness.type === "plutus") &&
      witness.script.type === "reference"
    )
      inputs.push(witness.script.input);
  }
  return inputs;
};

/**
 * The answer of the provider for the outputs of a transaction, a list, none of it read; a
 * provider that answers with nothing gives an empty list
 * @param notFound Makes the error of a read that failed, from why and what it was raised from
 */
export const fetchTxAnswer = async (
  provider: IFetcher,
  txHash: string,
  notFound: (reason: string, cause: unknown) => TxBuildError,
): Promise<readonly unknown[]> => {
  let answer: unknown;
  try {
    answer = await provider.fetchUTxOs(txHash);
  } catch (error) {
    throw notFound(errorText(error), error);
  }
  if (answer === undefined || answer === null) return [];
  if (!Array.isArray(answer))
    throw notFound(
      "the answer is not a list",
      new Error("the answer is not a list"),
    );
  return answer;
};

/**
 * The entries of an answer placed by their out refs (`placeUtxos`), none of them read whole:
 * those that name an out ref of `wanted`; an entry whose out ref cannot be read is refused with
 * why. Without `wanted` every entry
 * @param notFound As `fetchTxAnswer`
 * @param wanted The out refs to read, as `utxoKey` writes them
 * @throws TxBuildError from `notFound` for an entry whose out ref cannot be read, and for two
 *   that name one output and differ
 */
export const placeTxAnswer = (
  answer: readonly unknown[],
  notFound: (reason: string, cause: unknown) => TxBuildError,
  wanted?: ReadonlySet<string>,
): PlacedUtxos =>
  twiceRefused(notFound, () =>
    placeUtxos(answer, answerEntryRefused(notFound), wanted),
  );

/**
 * The entries of an answer `placeTxAnswer` placed, as UTxOs, each checked as the payer's UTxOs
 * are and copied: the answer may be shared through a cache, and parts freeze what they hold
 * @param notFound As `fetchTxAnswer`
 * @throws TxBuildError from `notFound` for an entry that is not a UTxO this library reads, and
 *   for two that name one output and differ
 */
export const readTxAnswer = (
  placed: PlacedUtxos,
  notFound: (reason: string, cause: unknown) => TxBuildError,
): Utxo[] =>
  twiceRefused(notFound, () =>
    Array.from(readPlaced(placed, answerEntryRefused(notFound)).values()),
  );

const answerEntryRefused =
  (notFound: (reason: string, cause: unknown) => TxBuildError) =>
  (error: unknown, i: number): never => {
    throw notFound(
      `entry ${i} of the answer is not a UTxO: ${errorText(error)}`,
      error,
    );
  };

/** What `run` gives, two entries of an answer that name one output and differ refused */
const twiceRefused = <T>(
  notFound: (reason: string, cause: unknown) => TxBuildError,
  run: () => T,
): T => {
  try {
    return run();
  } catch (error) {
    if (!(error instanceof UtxoTwiceError)) throw error;
    throw notFound(
      `entries ${error.at[0]} and ${error.at[1]} of the answer name the output ${error.key} and differ`,
      error,
    );
  }
};

/**
 * Looks up every output the parts read and the builder does not know yet: once per transaction
 * hash, all hashes at once.
 */
const fetchMissing = async (
  parts: readonly TxPart[],
  ctx: Pick<
    ResolveContext,
    "known" | "provider" | "onFetch" | "unread" | "onPlaced"
  >,
) => {
  const missing = new Map<string, TransactionInputPrototype[]>();
  // The first part naming each missing out ref, which an error about that out ref is about
  const firstPart = new Map<string, TxPart>();
  // Every part naming a missing out ref
  const naming = new Set<TxPart>();
  for (const part of parts) {
    for (const input of inputsOf(part)) {
      const key = outRefString(input);
      if (ctx.known.has(key)) continue;
      // Only what is read stays unread; a spent or collateral input is always looked up
      const spent =
        (part.kind === "spend" || part.kind === "collateral") &&
        input === part.input;
      if (!spent && ctx.unread?.has(key)) continue;
      naming.add(part);
      if (!firstPart.has(key)) firstPart.set(key, part);
      const list = missing.get(input.transaction_id) ?? [];
      // Two parts may read one output: it is asked for once
      if (list.some((l) => l.index === input.index)) continue;
      list.push(input);
      missing.set(input.transaction_id, list);
    }
  }
  if (missing.size === 0) return;
  const partOf = (input: TransactionInputPrototype) =>
    ctxOf(firstPart.get(outRefString(input))!);
  const { provider } = ctx;
  if (!provider) {
    const outRefs = Array.from(missing.values(), (l) => l.map(outRefString));
    // The part and label only when one part names every missing out ref
    const [only] = naming.size === 1 ? naming : [];
    throw new TxBuildError(
      "MISSING_FETCHER",
      `outputs ${outRefs.flat().join(", ")} are given by reference only, and the builder has no provider`,
      only ? ctxOf(only) : undefined,
    );
  }
  ctx.onFetch?.(
    Array.from(missing.values(), (l) => l.map(outRefString)).flat(),
  );
  const answers = await Promise.all(
    Array.from(missing.keys(), async (txHash) => {
      const [first] = missing.get(txHash)!;
      const notFound = (reason: string, cause: unknown) =>
        new TxBuildError(
          "UTXO_NOT_FOUND",
          `fetching the outputs of ${txHash} failed: ${reason}`,
          {
            ...partOf(first!),
            details: { input: toOutRef(first!) },
            cause,
          },
        );
      return {
        notFound,
        answer: await fetchTxAnswer(provider, txHash, notFound),
      };
    }),
  );
  // Every answer is placed by its out refs before any is read whole, and read one after another:
  // the first refusal stops the reads
  const placed = answers.map(({ notFound, answer }) => ({
    notFound,
    placed: placeTxAnswer(answer, notFound),
  }));
  ctx.onPlaced?.(placed.map((each) => each.placed));
  for (const each of placed)
    for (const utxo of readTxAnswer(each.placed, each.notFound))
      ctx.known.set(utxoKey(utxo), utxo);
  for (const inputs of missing.values()) {
    for (const input of inputs) {
      if (!ctx.known.has(outRefString(input)))
        throw new TxBuildError(
          "UTXO_NOT_FOUND",
          `output ${outRefString(input)} does not exist or is already spent`,
          { ...partOf(input), details: { input: toOutRef(input) } },
        );
    }
  }
};

const lookup = (ctx: ResolveContext, input: TransactionInputPrototype) =>
  ctx.known.get(outRefString(input))!;

const resolveScript = <T extends NativeScriptSource | PlutusScriptSource>(
  part: TxPart,
  source: T,
  ctx: ResolveContext,
): T => {
  if (source.type !== "reference") return source;
  if (!source.utxo && ctx.unread?.has(outRefString(source.input)))
    return source;
  const reference = lookup(ctx, source.input);
  const partCtx = ctxOf(part);
  if ("version" in source)
    return toPlutusScriptSource(partCtx, {
      reference,
      version: source.version,
      scriptHash: source.scriptHash,
      scriptSize: source.scriptSize,
    }) as T;
  return toNativeScriptSource(partCtx, {
    reference,
    scriptHash: source.scriptHash,
    scriptSize: source.scriptSize,
  }) as T;
};

const resolveWitness = <
  W extends KeyWitness | NativeWitness | PlutusWitness | { type: "none" },
>(
  part: TxPart,
  witness: W,
  ctx: ResolveContext,
): W =>
  witness.type === "native" || witness.type === "plutus"
    ? { ...witness, script: resolveScript(part, witness.script, ctx) }
    : witness;

const depositOf = (
  part: TxPart,
  parameter: DepositParameter,
  ctx: ResolveContext,
): string => {
  const value =
    parameter === "keyDeposit"
      ? ctx.params.keyDeposit
      : ctx.deposits[parameter];
  // keyDeposit is a protocol parameter on `Protocol`; the others come from `deposits`
  const option = parameter === "keyDeposit" ? "params" : "deposits";
  if (value === undefined || value === null)
    throw new TxBuildError(
      "MISSING_PARAMETER",
      `the ${parameter} protocol parameter is needed; pass it in the builder's ${option} option, or the amount to the part`,
      { part: part.kind, label: part.label, details: { parameter: option } },
    );
  return BigInt(value).toString();
};

const resolveSpend = (part: SpendPart, ctx: ResolveContext): SpendPart => {
  const utxo = part.utxo ?? lookup(ctx, part.input);
  const partCtx = ctxOf(part);
  const { witness } = part;
  if (witness.type === "key") {
    checkLock(partCtx, utxo, { type: "key" });
    return { ...part, utxo };
  }
  const script = resolveScript(part, witness.script, ctx);
  const lock = checkLock(partCtx, utxo, {
    type: "script",
    hash: script.scriptHash,
  });
  const known = withKnownHash(script, lock);
  if (witness.type === "native")
    return {
      ...part,
      utxo,
      witness: { ...witness, script: known as NativeScriptSource },
    };
  const plutus = known as PlutusScriptSource;
  // Data given for an output read only now that holds its datum inline is checked against it as
  // the part checks a UTxO it is given in full, and the spend reads the inline datum. Of any
  // other output the data goes into the witness set as given: a provider may not show a hash
  const datum =
    witness.datum === undefined
      ? toSpendDatum(partCtx, undefined, utxo, plutus.version)
      : witness.datum.type === "provided" && utxo?.datum?.type === "inline"
        ? checkGivenDatum(partCtx, witness.datum, utxo)
        : witness.datum;
  return {
    ...part,
    utxo,
    witness: { ...witness, script: plutus, ...(datum && { datum }) },
  };
};

const resolveCertificate = (
  part: CertificatePart,
  ctx: ResolveContext,
): CertificatePart => {
  const { depositParameter, ...rest } = part;
  const witness = resolveWitness(part, part.witness, ctx);
  if (!depositParameter) return { ...rest, witness };
  const certificate = {
    ...part.certificate,
    value: {
      ...part.certificate.value,
      coin: depositOf(part, depositParameter, ctx),
    },
  } as CertificateFragment;
  return { ...rest, certificate, witness };
};

const resolveProposal = (
  part: ProposalPart,
  ctx: ResolveContext,
): ProposalPart => {
  const { depositParameter, ...rest } = part;
  const witness = resolveWitness(part, part.witness, ctx);
  if (!depositParameter) return { ...rest, witness };
  return {
    ...rest,
    proposal: {
      ...part.proposal,
      deposit: depositOf(part, depositParameter, ctx),
    },
    witness,
  };
};

/**
 * A validity part with its time bounds converted to slots on the network's clock: `from` to the
 * first slot starting at or after it, `until` to the slot containing it, so that the interval a
 * script sees lies within [from, until]. A part without time bounds is returned as it is.
 * @throws TxPartError INVALID_DATA for a time before the network's slot clock starts, or an
 *   interval that holds no slot once both bounds are slots
 */
export const resolveValidity = (
  part: ValidityPart,
  network: NetworkConfig,
): ValidityPart => {
  const { from, until, ...rest } = part;
  if (from === undefined && until === undefined) return part;
  const ctx = ctxOf(part);
  const { zeroTime } = network.slotConfig;
  const toSlot = (name: "from" | "until", time: number, slot: string) => {
    // Below zeroTime the clock's arithmetic gives a wrong or negative slot, which is where
    // seconds written for milliseconds, or a slot written as a time, land
    if (time < zeroTime)
      fail(
        ctx,
        "INVALID_DATA",
        `${name} ${time} is before the slot clock of network ${network.name} starts, at ${zeroTime}: times are POSIX milliseconds; give an earlier bound as a slot (${slot})`,
      );
    return slotAt(network, time, name === "from" ? "up" : "down");
  };
  const before =
    from === undefined
      ? rest.invalidBefore
      : String(toSlot("from", from, "invalidBefore"));
  const hereafter =
    until === undefined
      ? rest.invalidHereafter
      : String(toSlot("until", until, "invalidHereafter"));
  if (
    before !== undefined &&
    hereafter !== undefined &&
    BigInt(before) >= BigInt(hereafter)
  ) {
    const lower =
      from === undefined
        ? `invalidBefore ${before}`
        : `from ${from} (slot ${before})`;
    const upper =
      until === undefined
        ? `invalidHereafter ${hereafter}`
        : `until ${until} (slot ${hereafter})`;
    fail(
      ctx,
      "INVALID_DATA",
      `the interval holds no slot on network ${network.name}: ${lower} is not before ${upper}`,
    );
  }
  return freeze({
    ...rest,
    ...(before !== undefined && { invalidBefore: before }),
    ...(hereafter !== undefined && { invalidHereafter: hereafter }),
  });
};

/**
 * A script withdrawal without a reward address, with the script's own reward address on the
 * network; it comes from the hash the part holds. Any other part is returned as it is.
 */
const withRewardAddress = (part: TxPart, network: NetworkConfig): TxPart => {
  if (part.kind !== "withdrawal" || part.rewardAddress !== undefined)
    return part;
  const { witness } = part as WithdrawalPart & {
    witness: NativeWitness | PlutusWitness;
  };
  return freeze({
    ...part,
    rewardAddress: scriptHashToRewardAddress(
      witness.script.scriptHash!,
      network.networkId,
    ),
  });
};

/**
 * The reward balance of an account info, in lovelace; none stated is 0. Throws for an answer
 * that is not an object, or rewards that are not a whole number of 0 or more
 */
const rewardBalance = (info: unknown): string => {
  if (typeof info !== "object" || info === null)
    throw new Error(
      `the answer is not an account info: ${info === null ? "null" : typeof info}`,
    );
  const { rewards } = info as { rewards?: unknown };
  if (rewards === undefined || rewards === null) return "0";
  if (!isWholeNumber(rewards))
    throw new Error(
      `invalid rewards ${String(rewards)}: expected a whole number of lovelace`,
    );
  return BigInt(rewards as string | number | bigint).toString();
};

/** The reward balances of the stake addresses whose whole balance is withdrawn */
const fetchRewardBalances = async (
  parts: readonly TxPart[],
  ctx: Pick<ResolveContext, "provider">,
): Promise<Map<string, string>> => {
  const addresses = new Set<string>();
  for (const part of parts)
    if (part.kind === "withdrawal" && part.amount === undefined)
      addresses.add(part.rewardAddress!);
  const balances = new Map<string, string>();
  if (addresses.size === 0) return balances;
  const { provider } = ctx;
  if (!provider)
    throw new TxBuildError(
      "MISSING_FETCHER",
      `the reward balance of ${Array.from(addresses).join(", ")} has to be looked up, and the builder has no provider`,
    );
  await Promise.all(
    Array.from(addresses, async (address) => {
      const failed = (error: unknown) =>
        new TxBuildError(
          "PROVIDER_FAILED",
          `fetching the reward balance of ${address} failed: ${errorText(error)}`,
          { details: { operation: "fetchAccountInfo" }, cause: error },
        );
      let info: unknown;
      try {
        info = await provider.fetchAccountInfo(address);
      } catch (error) {
        throw failed(error);
      }
      try {
        balances.set(address, rewardBalance(info));
      } catch (error) {
        throw failed(error);
      }
    }),
  );
  return balances;
};

/**
 * The UTxOs the parts name by reference only, as looked up, for the network check: those held in
 * full were checked before anything was looked up
 */
const fetchedEntries = (parts: readonly TxPart[], ctx: ResolveContext) =>
  parts.flatMap((part) => {
    const held = new Set(heldUtxos(part).map(utxoKey));
    return inputsOf(part).flatMap((input) => {
      const key = outRefString(input);
      const utxo = ctx.known.get(key);
      return utxo && !held.has(key) ? [utxoEntry(utxo, part)] : [];
    });
  });

/**
 * Fills in what parts leave open and can be found out before balancing: the outputs they
 * reference, their reference scripts, the datum of spent script outputs, deposits, reward
 * balances, the reward address of a script withdrawal given without one, and the slots of
 * validity bounds given as times, on the network's clock. Checks
 * what is filled in against what the parts state, as the part builders would have had it been
 * given to them.
 *
 * Left open: output lovelace, total collateral and execution units, which balancing and
 * evaluation work out.
 */
export const resolveParts = async (
  given: readonly TxPart[],
  context: Omit<ResolveContext, "params"> & {
    /** The parameters, or their read: the lookups do not wait for it */
    params: Protocol | Promise<Protocol>;
  },
): Promise<TxPart[]> => {
  // Reward addresses come first: a balance is read at the address, and accounts are sorted by it
  const addressed = given.map((part) =>
    withRewardAddress(part, context.network),
  );
  // What a part holds in full needs no lookup: its input and its reference script
  for (const part of addressed)
    for (const utxo of heldUtxos(part)) context.known.set(utxoKey(utxo), utxo);
  const [, balances, params] = await Promise.all([
    fetchMissing(addressed, context),
    fetchRewardBalances(addressed, context),
    context.params,
  ]);
  const ctx: ResolveContext = { ...context, params };
  checkNetworks(ctx.network, fetchedEntries(addressed, ctx));

  return addressed.map((part): TxPart => {
    switch (part.kind) {
      case "spend":
        return freeze(resolveSpend(part, ctx));
      case "referenceInput":
        if (!part.utxo && ctx.unread?.has(outRefString(part.input)))
          return part;
        return freeze({ ...part, utxo: part.utxo ?? lookup(ctx, part.input) });
      case "collateral": {
        const utxo = part.utxo ?? lookup(ctx, part.input);
        checkLock(ctxOf(part), utxo, { type: "key" });
        return freeze({ ...part, utxo });
      }
      case "mint":
      case "vote":
        return freeze({
          ...part,
          witness: resolveWitness(part, part.witness, ctx),
        } as TxPart);
      case "withdrawal": {
        rewardCredential(ctxOf(part), part.rewardAddress!);
        return freeze({
          ...part,
          amount: part.amount ?? balances.get(part.rewardAddress!)!,
          witness: resolveWitness(part, part.witness, ctx),
        });
      }
      case "certificate":
        return freeze(resolveCertificate(part, ctx));
      case "proposal":
        return freeze(resolveProposal(part, ctx));
      case "validity":
        return resolveValidity(part, ctx.network);
      default:
        return part;
    }
  });
};
