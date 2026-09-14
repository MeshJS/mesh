import { HexBlob } from "@cardano-sdk/util";

import type { TransactionPrototype } from "@meshsdk/common";

import { Transaction } from "../types";
import { auxiliaryDataToPrototype } from "./auxiliary-data";
import { transactionBodyToPrototype } from "./body";
import { transactionWitnessSetToPrototype } from "./witness-set";

/**
 * Decodes a `@cardano-sdk/core` `Transaction` back into a `TransactionPrototype` — the inverse of
 * `../tx-prototype-to-cbor/transaction.ts`.
 *
 * Its main job is enabling round-trip verification of the encoder (`proto -> CBOR -> proto`),
 * which pins far more than field-by-field assertions can. Known asymmetries, all documented at
 * their source and covered by tests:
 *
 * - **Set encoding is not represented.** Whether the CBOR used `#6.258`-tagged sets or plain
 *   arrays is a serialization choice (`transactionPrototypeToHex`'s `taggedSets`), not prototype
 *   state, so it is lost on decode. Both forms decode to the same prototype.
 * - **`null` vs absent is normalised.** Absent keys and empty collections both decode to an absent
 *   field, so a prototype written with explicit `null`/`[]` is not byte-identical after one round
 *   trip, but is stable from the second onwards.
 * - **Values above 2^53 in `ScriptNOfKPrototype.n`, `PoolRetirementPrototype.epoch` and
 *   `CommitteeMemberPrototype.term_limit` do not survive**, because the *encoder* narrows them
 *   with `Number(...)` at the Mesh-type boundary. The decoder widens back to `bigint`.
 * - **Datums decode to the `MANUAL` arm**, never `CBOR`; a `CBOR`-variant input therefore comes
 *   back structurally expanded (semantically identical, not textually).
 * - **Stake registration deposits**: CDDL certs 0/1 (no deposit) and 7/8 (with deposit) are
 *   distinct, and the encoder can only emit the former, so a `coin` set on a `STAKE_REGISTRATION`
 *   is dropped in the encode direction.
 */
export const transactionPrototypeFromCardano = (tx: Transaction): TransactionPrototype => {
  const auxiliaryData = tx.auxiliaryData();
  return {
    body: transactionBodyToPrototype(tx.body()),
    witness_set: transactionWitnessSetToPrototype(tx.witnessSet()),
    is_valid: tx.isValid(),
    ...(auxiliaryData ? { auxiliary_data: auxiliaryDataToPrototype(auxiliaryData) } : {}),
  };
};

/** Decodes transaction CBOR hex straight into a `TransactionPrototype`. */
export const transactionPrototypeFromHex = (hex: string): TransactionPrototype =>
  transactionPrototypeFromCardano(Transaction.fromCbor(HexBlob(hex) as never));
