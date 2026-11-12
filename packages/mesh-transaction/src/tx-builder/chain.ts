import type {
  Asset,
  TransactionBodyPrototype,
  TransactionOutputPrototype,
  UTxO,
} from "@meshsdk/common";
import { plutusDataVariantToCardano, resolveDataHash } from "@meshsdk/core-cst";

import type { BuiltOutput, BuiltTx } from "./builder";
import { TxBuildError } from "./errors";

/**
 * An output of a transaction as the UTxO it becomes, with the members a provider reports: the
 * address as the body holds it, lovelace first and then each token, an inline datum in CBOR
 * with its hash, a datum hash, a reference script in CBOR. Members without a value are left out.
 */
const outputUtxo = (
  txHash: string,
  outputIndex: number,
  output: Readonly<TransactionOutputPrototype>,
): UTxO => {
  const amount: Asset[] = [{ unit: "lovelace", quantity: output.amount.coin }];
  for (const [policyId, assets] of Object.entries(
    output.amount.multiasset ?? {},
  ))
    for (const [assetName, quantity] of Object.entries(assets))
      amount.push({ unit: policyId + assetName, quantity });
  const utxo: UTxO = {
    input: { txHash, outputIndex },
    output: { address: output.address, amount },
  };
  const datum = output.plutus_data;
  if (datum?.type === "DATA_HASH") utxo.output.dataHash = datum.value;
  if (datum?.type === "DATA") {
    // Encoded as the serializer encodes it, so the hash is of the bytes the output holds
    const plutusData =
      datum.value.type === "CBOR"
        ? datum.value.hex
        : plutusDataVariantToCardano(datum.value).toCbor().toString();
    utxo.output.plutusData = plutusData;
    utxo.output.dataHash = resolveDataHash(plutusData, "CBOR");
  }
  if (output.script_ref) utxo.output.scriptRef = output.script_ref;
  return utxo;
};

/** The outputs of a transaction body as the UTxOs of the transaction they become, in body order */
export const bodyOutputs = (
  txHash: string,
  body: Readonly<TransactionBodyPrototype>,
): UTxO[] =>
  body.outputs.map((output, outputIndex) =>
    outputUtxo(txHash, outputIndex, output),
  );

/**
 * The output a built transaction made from the output part with this label. When several
 * outputs carry the label, the first in body order.
 *
 * Pure and synchronous: it reads nothing but its arguments.
 * @throws TxBuildError UNKNOWN_LABEL `{ label, labels }`, listing the labels the transaction's
 *   outputs have, when none matches
 */
export const outputOf = (built: BuiltTx, label: string): BuiltOutput => {
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
