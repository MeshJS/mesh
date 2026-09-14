import { inConwayEra, setInConwayEra } from "@cardano-sdk/core";

import type { TransactionPrototype } from "@meshsdk/common";

import { Transaction } from "../types";
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
 * is whatever the ambient global says at that moment — and that global defaults to `false` but is
 * set to `true` as a side effect of constructing a `CardanoSDKSerializer`. If you need a
 * deterministic result, use `transactionPrototypeToHex`, which pins the flag around the actual
 * `toCbor()` call.
 */
export const transactionPrototypeToCardano = (proto: TransactionPrototype): Transaction => {
  const body = transactionBodyPrototypeToCardano(proto.body);
  const witnessSet = transactionWitnessSetPrototypeToCardano(proto.witness_set);
  const auxiliaryData = proto.auxiliary_data
    ? auxiliaryDataPrototypeToCardano(proto.auxiliary_data)
    : undefined;

  const transaction = new Transaction(body, witnessSet, auxiliaryData);
  // Constructor has no `isValid` param — must be set explicitly, or every phase-2-invalid
  // (collateral-only, expected-to-fail-on-chain) transaction would silently round-trip as valid.
  transaction.setIsValid(proto.is_valid);
  return transaction;
};

/**
 * CST equivalent of whisky's `proto_to_transaction_hex`, with deterministic set encoding.
 *
 * Pins `@cardano-sdk/core`'s `inConwayEra` global for the duration of the `toCbor()` call and
 * restores it afterwards, so (a) every set in the transaction is encoded the same way and (b)
 * this call neither depends on nor leaks ambient global state. The save/restore is the only way
 * to control it — the flag is not exposed per-`CborSet`.
 */
export const transactionPrototypeToHex = (
  proto: TransactionPrototype,
  { taggedSets = true }: TxPrototypeToCborOptions = {},
): string => {
  const transaction = transactionPrototypeToCardano(proto);
  const previous = inConwayEra;
  setInConwayEra(taggedSets);
  try {
    return transaction.toCbor();
  } finally {
    setInConwayEra(previous);
  }
};
