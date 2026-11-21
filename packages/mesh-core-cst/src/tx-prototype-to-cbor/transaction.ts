import { inConwayEra, setInConwayEra } from "@cardano-sdk/core";

import type { TransactionPrototype } from "@meshsdk/common";

import { CborWriter, Transaction, TxCBOR } from "../types";
import { auxiliaryDataPrototypeToCardano } from "./auxiliary-data";
import { transactionBodyPrototypeToCardano } from "./body";
import { transactionWitnessSetPrototypeToCardano } from "./witness-set";

export type TxPrototypeToCborOptions = {
  /**
   * How to encode every CBOR set in the transaction (inputs, collateral, reference inputs,
   * certificates, required signers, proposals, and the script/witness sets).
   *
   * The Conway CDDL accepts both forms — `set<a0> = #6.258([* a0]) / [* a0]` — but a transaction
   * must pick one and use it throughout: the two encodings produce different bytes and therefore
   * a different transaction hash, and a body that mixes them is at best surprising to verify.
   * This flag is applied to the whole transaction at once, so mixing is not expressible.
   *
   * `true` (default) emits the Conway `#6.258`-tagged form; `false` emits plain arrays.
   */
  taggedSets?: boolean;
};

/**
 * CST equivalent of whisky's `proto_to_csl_transaction` — converts a `TransactionPrototype`
 * (already-fully-decided: post coin-selection, post witness collection) into a
 * `@cardano-sdk/core` `Transaction`.
 *
 * NOTE ON SET ENCODING: this function deliberately takes no `taggedSets` option, because it
 * could not honour one. `@cardano-sdk/core` decides tagged-vs-plain inside `CborSet.toCbor()`,
 * reading a module-global (`inConwayEra`, flipped by `setInConwayEra`) at *serialization* time —
 * verified: building under `setInConwayEra(true)` and then serializing under `false` yields the
 * untagged form. Since the returned `Transaction` is serialized later by the caller, the encoding
 * is whatever the ambient global says at that moment — and that global defaults to `true` (since
 * `@cardano-sdk/core` 0.47) and is set to `true` as a side effect of constructing a
 * `CardanoSDKSerializer`. A transaction marked invalid is the exception: it is encoded when it is
 * built, as the global says then. If you need a deterministic result, use
 * `transactionPrototypeToHex`, which pins the flag around the building and the `toCbor()` call.
 */
export const transactionPrototypeToCardano = (proto: TransactionPrototype): Transaction => {
  const body = transactionBodyPrototypeToCardano(proto.body);
  const witnessSet = transactionWitnessSetPrototypeToCardano(proto.witness_set);
  const auxiliaryData = proto.auxiliary_data
    ? auxiliaryDataPrototypeToCardano(proto.auxiliary_data)
    : undefined;

  const transaction = new Transaction(body, witnessSet, auxiliaryData);
  if (proto.is_valid) return transaction;
  // The constructor marks every transaction valid, and `@cardano-sdk/core` sets the flag only
  // when it reads one: a phase-2-invalid (collateral-only) transaction is written with the flag
  // false and read back, or it would silently round-trip as valid. Its sets are encoded here, as
  // the ambient `inConwayEra` says at this moment.
  const writer = new CborWriter();
  writer.writeStartArray(4);
  writer.writeEncodedValue(Buffer.from(body.toCbor(), "hex"));
  writer.writeEncodedValue(Buffer.from(witnessSet.toCbor(), "hex"));
  writer.writeBoolean(false);
  if (auxiliaryData)
    writer.writeEncodedValue(Buffer.from(auxiliaryData.toCbor(), "hex"));
  else writer.writeNull();
  return Transaction.fromCbor(TxCBOR(writer.encodeAsHex()));
};

/**
 * CST equivalent of whisky's `proto_to_transaction_hex`, with deterministic set encoding.
 *
 * Pins `@cardano-sdk/core`'s `inConwayEra` global for the duration of the building and the
 * `toCbor()` call and restores it afterwards, so (a) every set in the transaction is encoded the
 * same way and (b) this call neither depends on nor leaks ambient global state. The save/restore
 * is the only way to control it — the flag is not exposed per-`CborSet`.
 */
export const transactionPrototypeToHex = (
  proto: TransactionPrototype,
  { taggedSets = true }: TxPrototypeToCborOptions = {},
): string => {
  const previous = inConwayEra;
  setInConwayEra(taggedSets);
  try {
    return transactionPrototypeToCardano(proto).toCbor();
  } finally {
    setInConwayEra(previous);
  }
};
