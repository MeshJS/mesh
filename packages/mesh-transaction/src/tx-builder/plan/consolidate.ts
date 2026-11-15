import type { Protocol } from "@meshsdk/common";
import { Address } from "@meshsdk/core-cst";

import type { BuildOptions, BuiltTxData, TxBuilder } from "../builder";
import type { OutputPart, TxPart, Utxo, ValidityPart } from "../parts/types";
import type { PayerRead, PayerSource } from "../payer";
import { bundleTokens, isKeyLocked, oversizedRoundOf } from "../balance";
import { foldTransactions, spentByTransactions } from "../chain";
import { TxBuildError } from "../errors";
import { outputSize } from "../fee";
import { spend } from "../parts/inputs";
import { output } from "../parts/output";
import { validity } from "../parts/scalars";
import { plainUtxo } from "../parts/utxo";

// One consolidation step for a step whose build failed by its selection: a transaction that
// spends the UTxOs of the payer that build selected, as many as fit, and the change of the step
// before it, and gives all of it back to the payer's change address. Tokens the served step does
// not need go into outputs of their own, which are not change, so no later build selects them;
// the lovelace and the tokens it needs go to the change, which the served step spends when it is
// built again. One call makes one step; the caller builds the served step again after it. Nothing
// is signed, sent or recorded here, and nothing here is exported from the package.

/** The build options a consolidation step takes from the step it serves */
export type ConsolidationOptions = Pick<
  BuildOptions,
  "canSelect" | "signal" | "trace" | "knownUtxos"
>;

/** What one consolidation step is made from */
export type ConsolidationInput = {
  readonly builder: TxBuilder;
  /** The payer as the plan read it, before any step of the plan */
  readonly payer: PayerRead;
  /** The error of the served step's build: TX_TOO_LARGE by its selection */
  readonly error: unknown;
  /**
   * The parts the served step was built from, with the change it stands on and its validity:
   * the consolidation step ends when the served step does
   */
  readonly parts: readonly TxPart[];
  /** The change of the step before it of the same payer, which this step spends */
  readonly standOn?: Utxo;
  /** The transactions built before and not on chain: the earlier steps of the plan among them */
  readonly after: readonly BuiltTxData[];
  readonly options?: ConsolidationOptions;
};

/** The builder's private members a consolidation step uses */
type BuilderInternals = {
  loadParams(): Promise<Protocol>;
  buildList(
    source: PayerSource,
    flat: readonly TxPart[],
    options: BuildOptions | undefined,
  ): Promise<BuiltTxData>;
};

const internals = (builder: TxBuilder) =>
  builder as unknown as BuilderInternals;

/** The largest lovelace quantity, to size outputs whatever lovelace they end up holding */
const MAX_COIN = (2n ** 64n - 1n).toString();

/** Bytes of a vkey witness: its array header, a 32-byte key and a 64-byte signature */
const VKEY_WITNESS_BYTES = 101;

/** Bytes of a bootstrap witness, at most, for a Byron address */
const BOOTSTRAP_WITNESS_BYTES = 200;

/** Bytes of a transaction beside its inputs, witnesses and the outputs this step makes */
const BASE_BYTES = 200;

/** Bytes a policy id takes in a value: the 28 bytes and their header, and its map's header */
const POLICY_BYTES = 33;

/** An out ref as `txHash#index`, its hash in lower case */
const keyOf = (ref: {
  readonly txHash: string;
  readonly outputIndex: number;
}) => `${ref.txHash.toLowerCase()}#${ref.outputIndex}`;

/** The out ref of a part's input as `txHash#index`, its hash in lower case */
const inputKey = (input: { transaction_id: string; index: number }) =>
  `${input.transaction_id.toLowerCase()}#${input.index}`;

/** Bytes of an unsigned integer in CBOR */
const uintBytes = (n: bigint | number) => {
  const value = BigInt(n);
  if (value < 24n) return 1;
  if (value < 0x100n) return 2;
  if (value < 0x10000n) return 3;
  if (value < 0x100000000n) return 5;
  return 9;
};

/** Bytes of a byte string of this length in CBOR */
const bytesBytes = (length: number) => (length < 24 ? 1 : 2) + length;

/**
 * Whether a step's failed build is one consolidation serves: TX_TOO_LARGE raised by balancing
 * because of what selection added (`details.cause: "selection"`), and not in a sweep
 * (`sendAllTo`). Never for `"parts"` or another error.
 */
export const isConsolidable = (error: unknown): boolean =>
  TxBuildError.is(error, "TX_TOO_LARGE") &&
  error.details.cause === "selection" &&
  oversizedRoundOf(error) !== undefined;

/**
 * The out refs the parts name: those they spend, read (reference inputs and reference scripts)
 * or put up as collateral
 */
const namedByParts = (parts: readonly TxPart[]): Set<string> => {
  const named = new Set<string>();
  for (const part of parts) {
    if (
      part.kind === "spend" ||
      part.kind === "referenceInput" ||
      part.kind === "collateral"
    )
      named.add(inputKey(part.input));
    if (!("witness" in part)) continue;
    const { witness } = part;
    if (
      (witness.type === "native" || witness.type === "plutus") &&
      witness.script.type === "reference"
    )
      named.add(inputKey(witness.script.input));
  }
  return named;
};

/** The validity part of a consolidation step: the end of the served step's interval alone */
const endOf = (part: ValidityPart | undefined): TxPart | undefined => {
  if (part?.until !== undefined) return validity({ until: part.until });
  if (part?.invalidHereafter !== undefined)
    return validity({ invalidHereafter: BigInt(part.invalidHereafter) });
  return undefined;
};

/**
 * The tokens the served step needs from the payer's UTxOs: what its parts take out beyond what
 * they bring in, counting the change it stands on as not brought in, since that change is spent
 * by the consolidation step and comes back in its change
 */
const neededTokens = (
  error: unknown,
  parts: readonly TxPart[],
  standOn: Utxo | undefined,
): Set<string> => {
  const round = oversizedRoundOf(error)!;
  const standsOn =
    standOn !== undefined &&
    parts.some(
      (part) =>
        part.kind === "spend" && inputKey(part.input) === keyOf(standOn),
    );
  const needed = new Set<string>();
  for (const [unit, produced] of round.produced.assets) {
    const consumed = round.consumed.assets.get(unit) ?? 0n;
    const back = standsOn ? (standOn.value[unit] ?? 0n) : 0n;
    if (produced - consumed + back > 0n) needed.add(unit);
  }
  return needed;
};

/**
 * The tokens of these UTxOs the served step does not need, in outputs of their own at the
 * change address: in unit order, each output holding what fits in `maxValSize`, and the least
 * lovelace the builder gives an output
 */
const parkedOutputs = (
  inputs: readonly Utxo[],
  needed: ReadonlySet<string>,
  changeAddress: string,
  params: Protocol,
): OutputPart[] => {
  const tokens = new Map<string, bigint>();
  for (const utxo of inputs)
    for (const [unit, quantity] of Object.entries(utxo.value))
      if (unit !== "lovelace" && quantity > 0n && !needed.has(unit))
        tokens.set(unit, (tokens.get(unit) ?? 0n) + quantity);
  return bundleTokens(tokens, params.maxValSize).map((bundle) =>
    output({ address: changeAddress, value: Object.fromEntries(bundle) }),
  );
};

/**
 * An estimate of the size of a consolidation step by the number of candidates it spends, from
 * the first: its inputs, a witness per key, the tokens it parks with an output per bundle, the
 * change and the input it stands on. The builder judges the size; this only chooses the count
 * to try.
 */
const sizeModel = (
  candidates: readonly Utxo[],
  needed: ReadonlySet<string>,
  standOn: Utxo | undefined,
  changeAddress: string,
  params: Protocol,
): ((count: number) => number) => {
  const outputBytes = outputSize({
    address: changeAddress,
    amount: { coin: MAX_COIN },
  });
  const keys = new Set<string>();
  const policies = new Set<string>();
  const units = new Set<string>();
  const keyOfAddress = new Map<string, { key: string; witness: number }>();
  const signer = (address: string) => {
    let found = keyOfAddress.get(address);
    if (found === undefined) {
      const parsed = Address.fromString(address);
      const hash = parsed?.getProps().paymentPart?.hash;
      found =
        parsed?.asByron() || hash === undefined
          ? { key: `byron:${address}`, witness: BOOTSTRAP_WITNESS_BYTES }
          : { key: hash.toString(), witness: VKEY_WITNESS_BYTES };
      keyOfAddress.set(address, found);
    }
    return found;
  };
  let tokenBytes = 0;
  let neededBytes = 0;
  let fixed = BASE_BYTES + outputBytes;
  const add = (utxo: Utxo) => {
    let bytes = 1 + bytesBytes(32) + uintBytes(utxo.outputIndex);
    const { key, witness } = signer(utxo.address);
    if (!keys.has(key)) {
      keys.add(key);
      bytes += witness;
    }
    for (const [unit, quantity] of Object.entries(utxo.value)) {
      if (unit === "lovelace" || units.has(unit)) continue;
      units.add(unit);
      const policy = unit.slice(0, 56);
      let size = bytesBytes((unit.length - 56) / 2) + uintBytes(quantity);
      if (!policies.has(policy)) {
        policies.add(policy);
        size += POLICY_BYTES;
      }
      if (needed.has(unit)) neededBytes += size;
      else tokenBytes += size;
    }
    return bytes;
  };
  if (standOn !== undefined) fixed += add(standOn);
  const sizes = [fixed + neededBytes];
  let inputs = 0;
  for (const utxo of candidates) {
    inputs += add(utxo);
    const outputs = Math.ceil(tokenBytes / (params.maxValSize - 20));
    sizes.push(
      fixed + inputs + neededBytes + tokenBytes + outputs * outputBytes,
    );
  }
  return (count) => sizes[Math.min(count, sizes.length - 1)]!;
};

/**
 * One consolidation step for a step whose build failed by its selection: a transaction that
 * spends UTxOs of the payer that build selected, in the order selection took them, and the
 * change of the step before it when one is given, and gives all of it back to the payer's change
 * address: tokens the served step does not need in outputs of their own, the rest as change. It
 * spends as many of those UTxOs as fit a transaction: the count is estimated, and a build that
 * does not fit is made again with fewer, each time strictly fewer, until one fits; the first that
 * fits is the step. It never spends a UTxO the served step's parts name, one `canSelect` refuses
 * (or throws for), one a transaction of `after` spends, one that is not the payer's or not locked
 * by a key, nor one the served step's failed build put up as collateral. The build selects
 * nothing, not even the change of `after`: the fee comes from the step's own inputs, and the step
 * ends when the served step ends, as its validity part in `parts` says. Nothing is signed or sent.
 * @throws the served step's error when it is not consolidable, or when no UTxO it selected may
 *   be spent by a consolidation step, or one may and the step would change nothing
 * @throws TxBuildError TX_TOO_LARGE (`cause: "parts"`) when one input alone does not fit;
 *   VALUE_TOO_LARGE for a token it would park that does not fit an output on its own; every
 *   other error of the step's build, INSUFFICIENT_FUNDS when its inputs cannot pay for its
 *   outputs and fee among them
 */
export const buildConsolidation = async (
  input: ConsolidationInput,
): Promise<BuiltTxData> => {
  const { builder, payer, error, parts, standOn, after } = input;
  const options = input.options ?? {};
  if (!isConsolidable(error)) throw error;
  const round = oversizedRoundOf(error)!;
  const params = await internals(builder).loadParams();
  const { changeAddress } = payer.snapshot;

  // The payer's UTxOs as the transactions of `after` leave them, its change among them
  const { kept, added } = foldTransactions(
    payer.snapshot.utxos,
    after,
    (output) => output.change === true && output.address === changeAddress,
  );
  const owned = new Map<string, Utxo>();
  for (const utxo of [...kept, ...added.map((each) => plainUtxo(each))])
    if (!owned.has(keyOf(utxo))) owned.set(keyOf(utxo), utxo);
  const spentBefore = new Set(
    Array.from(spentByTransactions(after).keys(), (key) => key.toLowerCase()),
  );
  const named = namedByParts(parts);
  // Built again, the served step can put up the collateral it put up before
  const putUp = new Set(round.collateral.map(keyOf));
  const standKey = standOn === undefined ? undefined : keyOf(standOn);
  const allowed = (utxo: Utxo) => {
    if (options.canSelect === undefined) return true;
    try {
      return options.canSelect(plainUtxo(utxo)) === true;
    } catch {
      return false;
    }
  };
  /** Whether the step may spend a UTxO of the payer */
  const spendable = (key: string, utxo: Utxo) =>
    !named.has(key) &&
    !putUp.has(key) &&
    !spentBefore.has(key) &&
    key !== standKey &&
    isKeyLocked(utxo) &&
    allowed(utxo);

  const candidates: Utxo[] = [];
  const seen = new Set<string>();
  for (const selected of round.selected) {
    const key = keyOf(selected);
    const utxo = owned.get(key);
    if (seen.has(key) || utxo === undefined || !spendable(key, utxo)) continue;
    seen.add(key);
    candidates.push(utxo);
  }

  const needed = neededTokens(error, parts, standOn);
  const parksAny = (utxos: readonly Utxo[]) =>
    utxos.some((utxo) =>
      Object.entries(utxo.value).some(
        ([unit, quantity]) =>
          unit !== "lovelace" && quantity > 0n && !needed.has(unit),
      ),
    );
  // A step that turns one UTxO into one change and parks nothing changes nothing
  if (
    candidates.length === 0 ||
    (standOn === undefined && candidates.length === 1 && !parksAny(candidates))
  )
    throw error;

  const end = endOf(
    parts.find((part): part is ValidityPart => part.kind === "validity"),
  );
  const source: PayerSource = {
    form: "snapshot",
    // Nothing to select from: the step spends what its parts name
    snapshot: { changeAddress, utxos: [] },
  };
  const build = (count: number) => {
    const inputs = candidates.slice(0, count);
    const spent = standOn === undefined ? inputs : [standOn, ...inputs];
    return internals(builder).buildList(
      source,
      [
        ...spent.map((utxo) => spend.pubKey({ utxo: plainUtxo(utxo) })),
        ...parkedOutputs(spent, needed, changeAddress, params),
        ...(end === undefined ? [] : [end]),
      ],
      {
        after,
        // Nor from the change of `after`: the fee comes from the step's own inputs
        canSelect: () => false,
        ...(options.knownUtxos !== undefined && {
          knownUtxos: options.knownUtxos,
        }),
        ...(options.signal !== undefined && { signal: options.signal }),
        ...(options.trace !== undefined && { trace: options.trace }),
      },
    );
  };

  const model = sizeModel(candidates, needed, standOn, changeAddress, params);
  /** The most candidates whose estimate, corrected by what a build showed, fits */
  const countWithin = (correction: number) => {
    let count = 0;
    while (
      count < candidates.length &&
      model(count + 1) + correction <= params.maxTxSize
    )
      count++;
    return count;
  };

  // The first count that fits makes the step. A count that does not fit is followed by a
  // strictly smaller one, so the tries end, at one input at the latest
  let count = Math.max(1, countWithin(0));
  for (;;) {
    try {
      return await build(count);
    } catch (failed) {
      if (!TxBuildError.is(failed, "TX_TOO_LARGE")) throw failed;
      // One input that does not fit is the step's own error, which the caller tells as the
      // served step's
      if (count === 1) throw failed;
      const correction = failed.details.size - model(count);
      count = Math.min(count - 1, Math.max(1, countWithin(correction)));
    }
  }
};
