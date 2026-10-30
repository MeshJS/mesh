import type { TransactionPrototype } from "@meshsdk/common";

import { CardanoSDKSerializer } from "../src/serializer";
import { transactionPrototypeToHex } from "../src/tx-prototype-to-cbor";

const prototype: TransactionPrototype = {
  body: {
    fee: "170000",
    inputs: [{ transaction_id: "11".repeat(32), index: 0 }],
    outputs: [
      {
        address:
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        amount: { coin: "5000000" },
      },
    ],
  },
  witness_set: {},
  is_valid: true,
};

describe("CardanoSDKSerializer.serializeTxPrototype", () => {
  it("serializes a prototype as the prototype encoder does", () => {
    expect(new CardanoSDKSerializer().serializeTxPrototype(prototype)).toBe(
      transactionPrototypeToHex(prototype),
    );
  });
});
