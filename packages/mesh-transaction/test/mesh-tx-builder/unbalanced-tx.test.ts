import { Transaction, TxCBOR } from "@meshsdk/core-cst";

import { MeshTxBuilder } from "../../src";

describe("Unbalanced tx with TxBuilder", () => {
  it("should build unbalanced tx correctly", async () => {
    const txBuilder = new MeshTxBuilder();
    const txHex = await txBuilder
      .txIn(
        "dcd976452c9e7217070736ce734588327193546d517ef2b9ecea6f42f123913c",
        0,
        [{ unit: "lovelace", quantity: "3000000" }],
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        0,
      )
      .txOut(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        [
          {
            unit: "lovelace",
            quantity: "2000000",
          },
        ],
      )
      .completeUnbalanced(undefined);

    const cardanoTx = Transaction.fromCbor(TxCBOR(txHex));
    expect(cardanoTx.body().outputs()[0]!.amount().coin()).toEqual(
      BigInt(2000000),
    );
    expect(cardanoTx.body().outputs().length).toEqual(1);
    expect(cardanoTx.body().fee()).toEqual(BigInt(0));
  });
});
