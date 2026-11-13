import type {
  TransactionBodyPrototype,
  TransactionOutputPrototype,
} from "@meshsdk/common";
import { Address, plutusDataVariantToCardano } from "@meshsdk/core-cst";

import type { BuiltOutput, BuiltTx } from "./builder";
import type { OutputDatum, TxPart, Utxo, UtxoInput } from "./parts/types";
import { invalidArgument, TxBuildError } from "./errors";
import {
  addressText,
  errorText,
  isObject,
  outRefString,
} from "./parts/normalize";
import { describeScriptRef, plainUtxo, readUtxo } from "./parts/utxo";
import { inputsOf } from "./resolve";
import { fromValuePrototype, toAssets } from "./value";

/**
 * An output of a transaction as the UTxO it becomes, in normal form: the address in bech32
 * (base58 for Byron), lovelace first and then each token, an inline datum in CBOR as the output
 * holds it, a datum hash, a reference script described with its hash.
 */
export const outputUtxo = (
  txHash: string,
  outputIndex: number,
  output: Readonly<TransactionOutputPrototype>,
): Utxo => {
  const datum = output.plutus_data;
  let held: OutputDatum | undefined;
  if (datum?.type === "DATA_HASH")
    held = { type: "hash", hash: datum.value.toLowerCase() };
  if (datum?.type === "DATA")
    held = {
      type: "inline",
      data: {
        type: "CBOR",
        // Encoded as the serializer encodes it: the bytes the output holds
        content:
          datum.value.type === "CBOR"
            ? datum.value.hex.toLowerCase()
            : plutusDataVariantToCardano(datum.value).toCbor().toString(),
      },
    };
  const address = Address.fromString(output.address);
  return {
    txHash: txHash.toLowerCase(),
    outputIndex,
    address: address ? addressText(address) : output.address,
    value: toAssets(fromValuePrototype(output.amount)),
    ...(held && { datum: held }),
    ...(output.script_ref && {
      script: describeScriptRef(output.script_ref),
    }),
  };
};

/** The outputs of a transaction body as the UTxOs of the transaction they become, in body order */
export const bodyOutputs = (
  txHash: string,
  body: Readonly<TransactionBodyPrototype>,
): Utxo[] =>
  body.outputs.map((output, outputIndex) =>
    outputUtxo(txHash, outputIndex, output),
  );

/** What folding transactions into a list of UTxOs reads of each */
export type ChainedTx = {
  readonly inputs: readonly Utxo[];
  readonly outputs: readonly BuiltOutput[];
};

/** Whether a value has the members a fold reads of a UTxO: its out ref and its value */
const isUtxoShape = (value: unknown) =>
  isObject(value) &&
  typeof value.txHash === "string" &&
  typeof value.outputIndex === "number" &&
  isObject(value.value);

const KNOWN_UTXOS_ALLOWED =
  "a list of UTxOs: Utxo { txHash, outputIndex, address, value }, Mesh UTxO { input, output }, or the CBOR of a transaction unspent output";

/**
 * The UTxOs of a `knownUtxos` option, checked and copied into the builder's form
 * @throws TxBuildError INVALID_OPTION for what is not a list, or an entry that is not a UTxO
 */
export const toKnownUtxos = (knownUtxos: unknown): Utxo[] => {
  if (knownUtxos === undefined) return [];
  if (!Array.isArray(knownUtxos))
    throw new TxBuildError(
      "INVALID_OPTION",
      `invalid knownUtxos: expected ${KNOWN_UTXOS_ALLOWED}`,
      {
        details: {
          option: "knownUtxos",
          value: knownUtxos,
          allowed: KNOWN_UTXOS_ALLOWED,
        },
      },
    );
  return knownUtxos.map((entry: unknown, i) => {
    try {
      return readUtxo(entry);
    } catch (error) {
      throw new TxBuildError(
        "INVALID_OPTION",
        `invalid knownUtxos: entry ${i} is not a UTxO: ${errorText(error)}`,
        {
          details: {
            option: "knownUtxos",
            value: entry,
            allowed: KNOWN_UTXOS_ALLOWED,
          },
          cause: error,
        },
      );
    }
  });
};

const BUILT_ALLOWED =
  "a transaction built by TxBuilder.build, or a list of them";

/** An out ref as `txHash#index`, its hash in lower case */
const outRefKey = (ref: Readonly<{ txHash: string; outputIndex: number }>) =>
  `${ref.txHash.toLowerCase()}#${ref.outputIndex}`;

/** The out refs transactions spend, each with the hash of the first transaction spending it */
export const spentByTransactions = (
  txs: readonly (ChainedTx & { readonly txHash: string })[],
): Map<string, string> => {
  const spent = new Map<string, string>();
  for (const tx of txs)
    for (const utxo of tx.inputs)
      if (!spent.has(outRefKey(utxo))) spent.set(outRefKey(utxo), tx.txHash);
  return spent;
};

/**
 * Refuses a part that names an output one of the transactions built before spends: after them
 * the output is gone, so the transaction could never be valid. Checked before any lookup.
 * @param spent The out refs those transactions spend, with the hash of the one spending each
 * @throws TxBuildError UTXO_NOT_FOUND `{ input }` with the part's kind and label
 */
export const refuseSpentOutRefs = (
  parts: readonly TxPart[],
  spent: ReadonlyMap<string, string>,
) => {
  if (spent.size === 0) return;
  for (const part of parts)
    for (const input of inputsOf(part)) {
      const by = spent.get(outRefString(input));
      if (by === undefined) continue;
      throw new TxBuildError(
        "UTXO_NOT_FOUND",
        `output ${outRefString(input)} is spent by transaction ${by}, which the build is given in after`,
        {
          part: part.kind,
          ...(part.label !== undefined && { label: part.label }),
          details: {
            input: { txHash: input.transaction_id, outputIndex: input.index },
          },
        },
      );
    }
};

/**
 * The UTxOs after transactions, in two lists: `kept`, those of `utxos` none of them spends, in
 * their order; `added`, their outputs that `owns` accepts, none of them spends and neither
 * `utxos` nor an earlier transaction lists, in the order of the transactions and their bodies
 */
export const foldTransactions = (
  utxos: readonly Utxo[],
  txs: readonly ChainedTx[],
  owns: (output: BuiltOutput) => boolean,
): { kept: Utxo[]; added: BuiltOutput[] } => {
  const spent = new Set<string>();
  for (const tx of txs)
    for (const utxo of tx.inputs) spent.add(outRefKey(utxo));
  const kept = utxos.filter((utxo) => !spent.has(outRefKey(utxo)));
  const listed = new Set(utxos.map((utxo) => outRefKey(utxo)));
  const added: BuiltOutput[] = [];
  for (const tx of txs)
    for (const output of tx.outputs) {
      const key = outRefKey(output);
      if (spent.has(key) || listed.has(key) || !owns(output)) continue;
      listed.add(key);
      added.push(output);
    }
  return { kept, added };
};

const isChange = (output: BuiltOutput) => output.change === true;

/**
 * The UTxOs after transactions, pure and synchronous: their inputs removed, their outputs that
 * `owns` accepts added (by default the change outputs only, so a recipient's output is never
 * reused). With a `PayerSnapshot`, a batch of N builds needs one wallet read:
 *
 * ```ts
 * const payer = await builder.readPayer(wallet);
 * const first = await builder.build(parts1, { payer });
 * const second = await builder.build(parts2, {
 *   payer: { ...payer, utxos: utxosAfter(payer.utxos, first) },
 * });
 * ```
 *
 * The function knows no payer, so its default takes the change outputs of every transaction it
 * is given, whoever each was built for: for a transaction built for another payer, pass `owns`.
 *
 * The result holds the UTxOs of `utxos` none of the transactions spends, in their order, then
 * the outputs added, in the order of the transactions and of their bodies, all as `Utxo`s in
 * normal form, the outputs without `label` and `change`. An output `utxos` already lists is not
 * added again, and one that any of the transactions spends is not added, so the order of the
 * transactions does not change the set returned. Collateral is not looked at: a valid
 * transaction does not spend it. The arguments are not changed, and a new array is returned
 * every time.
 *
 * The outputs it adds are payer UTxOs, and an evaluator that does not set `acceptsKnownUtxos`
 * (a remote one) is not handed them: for a build that runs a script on such an evaluator before
 * the earlier transactions are on its chain, also pass them as `after`, or their change as
 * `knownUtxos`.
 * @param utxos The UTxOs before the transactions, in any form the builder takes a UTxO in
 * @param owns Which outputs of the transactions are added, in place of the change test
 * @throws TxBuildError INVALID_OPTION for `utxos` that is not a list of UTxOs or holds an entry
 *   that is not one, a transaction without lists of `inputs` and `outputs`, and an `owns` that
 *   is not a function
 */
export const utxosAfter = (
  utxos: readonly UtxoInput[],
  built: BuiltTx | readonly BuiltTx[],
  owns: (output: BuiltOutput) => boolean = isChange,
): Utxo[] => {
  if (!Array.isArray(utxos))
    throw invalidArgument("utxos", utxos, "a list of UTxOs");
  const given = (utxos as unknown[]).map((entry, i) => {
    try {
      return readUtxo(entry);
    } catch (error) {
      throw new TxBuildError(
        "INVALID_OPTION",
        `invalid utxos: entry ${i} is not a UTxO: ${errorText(error)}`,
        {
          details: { option: "utxos", value: entry, allowed: "a UTxO" },
          cause: error,
        },
      );
    }
  });
  const txs: readonly BuiltTx[] = Array.isArray(built)
    ? built
    : [built as BuiltTx];
  for (const tx of txs)
    if (
      !isObject(tx) ||
      !Array.isArray(tx.inputs) ||
      !Array.isArray(tx.outputs) ||
      !tx.inputs.every(isUtxoShape) ||
      !tx.outputs.every(isUtxoShape)
    )
      throw invalidArgument("built", built, BUILT_ALLOWED);
  if (typeof owns !== "function")
    throw invalidArgument("owns", owns, "a function of a built output");
  const { kept, added } = foldTransactions(given, txs, owns);
  return [...kept, ...added.map((output) => plainUtxo(output))];
};

/**
 * The output a built transaction made from the output part with this label. When several
 * outputs carry the label, the first in body order.
 *
 * Pure and synchronous: it reads nothing but its arguments.
 * @throws TxBuildError UNKNOWN_LABEL `{ label, labels }`, listing the labels the transaction's
 *   outputs have, when none matches; INVALID_OPTION for a `built` without a list of `outputs`,
 *   and a `label` that is not a string
 */
export const outputOf = (built: BuiltTx, label: string): BuiltOutput => {
  if (!isObject(built) || !Array.isArray(built.outputs))
    throw invalidArgument(
      "built",
      built,
      "a transaction built by TxBuilder.build",
    );
  if (typeof label !== "string")
    throw invalidArgument("label", label, "a string");
  const found = built.outputs.find((output) => output.label === label);
  if (found) return found;
  const labels = Array.from(
    new Set(
      built.outputs.flatMap((output) =>
        output.label === undefined ? [] : [output.label],
      ),
    ),
  );
  throw new TxBuildError(
    "UNKNOWN_LABEL",
    `no output of transaction ${built.txHash} has the label ${JSON.stringify(label)}; ${
      labels.length === 0
        ? "none of its outputs has a label"
        : `its labels are ${labels.map((l) => JSON.stringify(l)).join(", ")}`
    }`,
    { details: { label, labels } },
  );
};
