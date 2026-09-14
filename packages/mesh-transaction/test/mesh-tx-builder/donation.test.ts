import { CSLSerializer } from "@meshsdk/core-csl";
import { Transaction, TxCBOR } from "@meshsdk/core-cst";
import { MeshTxBuilder } from "@meshsdk/transaction";

import { calculateOutputLovelaces, txHash } from "../test-util";

const address =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";

describe("MeshTxBuilder donation", () => {
  let txBuilder: MeshTxBuilder;

  beforeEach(() => {
    txBuilder = new MeshTxBuilder();
  });

  it("Should set donation in the tx body and account for it when balancing", async () => {
    const tx = await txBuilder
      .txIn(
        txHash("tx0"),
        0,
        [{ unit: "lovelace", quantity: "5000000" }],
        address,
        0,
      )
      .txOut(address, [{ unit: "lovelace", quantity: "1000000" }])
      .setDonation("1500000")
      .changeAddress(address)
      .complete();

    const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
    expect(cardanoTx.body().donation()).toEqual(BigInt(1500000));
    expect(
      calculateOutputLovelaces(tx) +
        cardanoTx.body().fee() +
        cardanoTx.body().donation()!,
    ).toEqual(BigInt(5000000));
  });

  it("Should fail when inputs cannot cover the donation", async () => {
    await expect(
      txBuilder
        .txIn(
          txHash("tx0"),
          0,
          [{ unit: "lovelace", quantity: "2000000" }],
          address,
          0,
        )
        .txOut(address, [{ unit: "lovelace", quantity: "1000000" }])
        .setDonation("1500000")
        .changeAddress(address)
        .complete(),
    ).rejects.toThrow();
  });

  it("Should reject a non-positive donation", () => {
    expect(() => txBuilder.setDonation("0")).toThrow();
    expect(() => txBuilder.setDonation("-1")).toThrow();
  });

  it("Should throw for the CSL serializer", async () => {
    const cslBuilder = new MeshTxBuilder({ serializer: new CSLSerializer() });
    await expect(
      cslBuilder
        .txIn(
          txHash("tx0"),
          0,
          [{ unit: "lovelace", quantity: "5000000" }],
          address,
          0,
        )
        .txOut(address, [{ unit: "lovelace", quantity: "1000000" }])
        .setDonation("1500000")
        .changeAddress(address)
        .complete(),
    ).rejects.toThrow(/donation/i);
  });
});
