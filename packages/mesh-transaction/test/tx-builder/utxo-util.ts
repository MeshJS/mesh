import { UTxO } from "@meshsdk/core";
import { toTxUnspentOutput } from "@meshsdk/core-cst";

import { OutRef, toMeshUtxo, UtxoInput } from "../../src/tx-builder";

/*
 * Tests write each UTxO once, as a `Utxo`. A fake provider or a Mesh wallet gives it back through
 * `asMesh`, a CIP-30 wallet through `asCbor`: each of them returns UTxOs in its own form.
 */

/** The out ref of a UTxO, as exactly its two members */
export const ref = (utxo: Readonly<OutRef>): OutRef => ({
  txHash: utxo.txHash,
  outputIndex: utxo.outputIndex,
});

/** The UTxO in the Mesh form, as providers and Mesh wallets return it */
export const asMesh = (utxo: UtxoInput): UTxO => toMeshUtxo(utxo);

/** The UTxO as a CIP-30 wallet returns it: the CBOR of a transaction unspent output, in hex */
export const asCbor = (utxo: UtxoInput): string =>
  toTxUnspentOutput(toMeshUtxo(utxo)).toCbor().toString();
