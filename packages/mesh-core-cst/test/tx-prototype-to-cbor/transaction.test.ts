import { inConwayEra, setInConwayEra } from "@cardano-sdk/core";

import type { TransactionPrototype } from "@meshsdk/common";

import {
  transactionPrototypeToCardano,
  transactionPrototypeToHex,
} from "../../src/tx-prototype-to-cbor/transaction";
import { Transaction } from "../../src/types";

const TX_HASH = "11".repeat(32);
const ADDRESS =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";

const minimalPrototype = (isValid = true) => ({
  auxiliary_data: undefined,
  body: {
    fee: "170000",
    inputs: [{ transaction_id: TX_HASH, index: 0 }],
    outputs: [{ address: ADDRESS, amount: { coin: "5000000" } }],
  },
  is_valid: isValid,
  witness_set: {},
});

describe("transactionPrototypeToCardano / transactionPrototypeToHex", () => {
  it("produces a Transaction that round-trips through real CBOR encode/decode", () => {
    const hex = transactionPrototypeToHex(minimalPrototype());
    const decoded = Transaction.fromCbor(hex as never);

    expect(decoded.body().fee()).toEqual(170000n);
    expect(decoded.body().outputs()).toHaveLength(1);
    expect(decoded.body().outputs()[0]!.address().toBech32()).toEqual(ADDRESS);
    expect(decoded.isValid()).toEqual(true);
  });

  it("respects is_valid = false (phase-2-invalid / collateral-only transactions)", () => {
    const hex = transactionPrototypeToHex(minimalPrototype(false));
    const decoded = Transaction.fromCbor(hex as never);
    expect(decoded.isValid()).toEqual(false);
  });

  describe("taggedSets option", () => {
    // CBOR tag 258 encodes as d90102. A transaction must use one set encoding throughout — the
    // two forms hash differently — so the flag is transaction-wide by construction.
    const SET_TAG = "d90102";

    const withManySets = (): TransactionPrototype => ({
      ...minimalPrototype(),
      body: {
        ...minimalPrototype().body,
        collateral: [{ transaction_id: TX_HASH, index: 1 }],
        reference_inputs: [{ transaction_id: TX_HASH, index: 2 }],
        required_signers: ["cc".repeat(28)],
      },
    });

    it("emits #6.258-tagged sets by default", () => {
      expect(transactionPrototypeToHex(minimalPrototype())).toContain(SET_TAG);
    });

    it("emits plain arrays when taggedSets is false", () => {
      expect(transactionPrototypeToHex(minimalPrototype(), { taggedSets: false })).not.toContain(
        SET_TAG,
      );
    });

    it("applies the choice to EVERY set — all tagged or none, never mixed", () => {
      // 4 sets present: inputs, collateral, reference_inputs, required_signers.
      const tagged = transactionPrototypeToHex(withManySets(), { taggedSets: true });
      const plain = transactionPrototypeToHex(withManySets(), { taggedSets: false });
      const count = (hex: string) => hex.split(SET_TAG).length - 1;

      expect(count(tagged)).toEqual(4);
      expect(count(plain)).toEqual(0);
    });

    it("produces different CBOR for the two encodings (i.e. a different tx hash)", () => {
      expect(transactionPrototypeToHex(minimalPrototype(), { taggedSets: true })).not.toEqual(
        transactionPrototypeToHex(minimalPrototype(), { taggedSets: false }),
      );
    });

    it("restores the ambient global, so it neither leaks nor is inherited", () => {
      setInConwayEra(false);
      transactionPrototypeToHex(minimalPrototype(), { taggedSets: true });
      expect(inConwayEra).toBe(false);

      setInConwayEra(true);
      transactionPrototypeToHex(minimalPrototype(), { taggedSets: false });
      expect(inConwayEra).toBe(true);
    });

    it("ignores the ambient global — same input, same output regardless", () => {
      setInConwayEra(false);
      const a = transactionPrototypeToHex(minimalPrototype(), { taggedSets: true });
      setInConwayEra(true);
      const b = transactionPrototypeToHex(minimalPrototype(), { taggedSets: true });
      expect(a).toEqual(b);
    });
  });

  it("carries a witness set through to the encoded transaction", () => {
    const proto = minimalPrototype();
    const tx = transactionPrototypeToCardano({
      ...proto,
      witness_set: { vkeys: [{ vkey: "dd".repeat(32), signature: "ee".repeat(64) }] },
    });
    const decoded = Transaction.fromCbor(tx.toCbor());
    expect([...decoded.witnessSet().vkeys()!.values()]).toHaveLength(1);
  });
});
