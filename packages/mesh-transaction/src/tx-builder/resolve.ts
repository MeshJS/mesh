import type {
  IFetcher,
  Protocol,
  TransactionInputPrototype,
  UTxO,
} from "@meshsdk/common";

import type { PartContext } from "./parts/normalize";
import type {
  CertificateFragment,
  CertificatePart,
  DepositParameter,
  KeyWitness,
  NativeScriptSource,
  NativeWitness,
  PlutusScriptSource,
  PlutusWitness,
  ProposalPart,
  SpendPart,
  TxPart,
} from "./parts/types";
import { TxBuildError } from "./errors";
import { checkLock, toSpendDatum } from "./parts/inputs";
import {
  freeze,
  outRefString,
  rewardCredential,
  toNativeScriptSource,
  toPlutusScriptSource,
  withKnownHash,
} from "./parts/normalize";

/** Deposits the protocol parameters on `Protocol` leave out */
export type GovernanceDeposits = {
  /** The `drepDeposit` protocol parameter, in lovelace */
  drepDeposit?: bigint;
  /** The `govActionDeposit` protocol parameter, in lovelace */
  govActionDeposit?: bigint;
};

export type ResolveContext = {
  fetcher?: IFetcher;
  params: Protocol;
  deposits: GovernanceDeposits;
  /** UTxOs already known, keyed by `txHash#index`; fetched ones are added */
  known: Map<string, UTxO>;
};

export const utxoKey = (utxo: Readonly<UTxO>) =>
  `${utxo.input.txHash}#${utxo.input.outputIndex}`;

const ctxOf = (part: TxPart): PartContext => ({
  part: part.kind,
  ...(part.label !== undefined && { label: part.label }),
});

/** Every output a part reads: the inputs it spends or references, and its reference scripts */
const inputsOf = (part: TxPart): TransactionInputPrototype[] => {
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
 * Looks up every output the parts read and the builder does not know yet: once per transaction
 * hash, all hashes at once.
 */
const fetchMissing = async (parts: readonly TxPart[], ctx: ResolveContext) => {
  const missing = new Map<string, TransactionInputPrototype[]>();
  for (const part of parts) {
    for (const input of inputsOf(part)) {
      if (ctx.known.has(outRefString(input))) continue;
      const list = missing.get(input.transaction_id) ?? [];
      list.push(input);
      missing.set(input.transaction_id, list);
    }
  }
  if (missing.size === 0) return;
  const { fetcher } = ctx;
  if (!fetcher)
    throw new TxBuildError(
      "MISSING_FETCHER",
      `outputs ${Array.from(missing.values(), (l) => l.map(outRefString))
        .flat()
        .join(", ")} are given by reference only, and no fetcher is given`,
    );
  await Promise.all(
    Array.from(missing.keys(), async (txHash) => {
      let utxos: UTxO[];
      try {
        utxos = await fetcher.fetchUTxOs(txHash);
      } catch (error) {
        throw new TxBuildError(
          "UTXO_NOT_FOUND",
          `fetching the outputs of ${txHash} failed: ${error instanceof Error ? error.message : String(error)}`,
          { details: { txHash } },
        );
      }
      for (const utxo of utxos ?? []) {
        // A copy: the answer may be shared through a cache, and parts freeze what they hold
        const normalized = structuredClone(utxo);
        normalized.input.txHash = normalized.input.txHash.toLowerCase();
        ctx.known.set(utxoKey(normalized), normalized);
      }
    }),
  );
  for (const inputs of missing.values()) {
    for (const input of inputs) {
      if (!ctx.known.has(outRefString(input)))
        throw new TxBuildError(
          "UTXO_NOT_FOUND",
          `output ${outRefString(input)} does not exist or is already spent`,
          { details: { input } },
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
  if (value === undefined || value === null)
    throw new TxBuildError(
      "MISSING_PARAMETER",
      `the ${parameter} protocol parameter is needed; pass it in the builder's deposits option, or the amount to the part`,
      { part: part.kind, label: part.label, details: { parameter } },
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
  const datum =
    witness.datum ?? toSpendDatum(partCtx, undefined, utxo, plutus.version);
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

/** The reward balances of the stake addresses whose whole balance is withdrawn */
const fetchRewardBalances = async (
  parts: readonly TxPart[],
  ctx: ResolveContext,
): Promise<Map<string, string>> => {
  const addresses = new Set<string>();
  for (const part of parts)
    if (part.kind === "withdrawal" && part.amount === undefined)
      addresses.add(part.rewardAddress);
  const balances = new Map<string, string>();
  if (addresses.size === 0) return balances;
  const { fetcher } = ctx;
  if (!fetcher)
    throw new TxBuildError(
      "MISSING_FETCHER",
      `the reward balance of ${Array.from(addresses).join(", ")} has to be looked up, and no fetcher is given`,
    );
  await Promise.all(
    Array.from(addresses, async (address) => {
      const info = await fetcher.fetchAccountInfo(address);
      balances.set(address, BigInt(info.rewards ?? 0).toString());
    }),
  );
  return balances;
};

/**
 * Fills in what parts leave open and can be found out before balancing: the outputs they
 * reference, their reference scripts, the datum of spent script outputs, deposits and reward
 * balances. Checks what is filled in against what the parts state, as the part builders would
 * have had it been given to them.
 *
 * Left open: output lovelace, total collateral and execution units, which balancing and
 * evaluation work out.
 */
export const resolveParts = async (
  parts: readonly TxPart[],
  ctx: ResolveContext,
): Promise<TxPart[]> => {
  for (const part of parts)
    if ("utxo" in part && part.utxo)
      ctx.known.set(utxoKey(part.utxo), part.utxo);
  const [, balances] = await Promise.all([
    fetchMissing(parts, ctx),
    fetchRewardBalances(parts, ctx),
  ]);

  return parts.map((part): TxPart => {
    switch (part.kind) {
      case "spend":
        return freeze(resolveSpend(part, ctx));
      case "referenceInput":
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
        rewardCredential(ctxOf(part), part.rewardAddress);
        return freeze({
          ...part,
          amount: part.amount ?? balances.get(part.rewardAddress)!,
          witness: resolveWitness(part, part.witness, ctx),
        });
      }
      case "certificate":
        return freeze(resolveCertificate(part, ctx));
      case "proposal":
        return freeze(resolveProposal(part, ctx));
      default:
        return part;
    }
  });
};
