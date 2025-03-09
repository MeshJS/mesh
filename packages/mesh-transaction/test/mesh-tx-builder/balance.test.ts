import { Transaction, TxCBOR } from "@meshsdk/core-cst";
import { MeshTxBuilder } from "@meshsdk/transaction";

import { txHash } from "../test-util";

describe("MeshTxBuilder", () => {
  let txBuilder: MeshTxBuilder;

  beforeEach(() => {
    txBuilder = new MeshTxBuilder();
  });

  const calculateOutputLovelaces = (tx: string) => {
    const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
    let lovelaces = BigInt(0);
    cardanoTx
      .body()
      .outputs()
      .forEach((output) => {
        lovelaces += output.amount().coin();
      });
    return lovelaces;
  };

  it("Should add remaining value as fees if insufficient for minUtxoValue", async () => {
    const tx = await txBuilder
      .txIn(
        txHash("tx0"),
        0,
        [
          {
            unit: "lovelace",
            quantity: "1200000",
          },
        ],
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        0,
      )
      .txOut(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        [
          {
            unit: "lovelace",
            quantity: "1000000",
          },
        ],
      )
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
    expect(cardanoTx.body().fee()).toEqual(BigInt(200000));
    expect(calculateOutputLovelaces(tx)).toEqual(BigInt(1000000));
  });

  it("Transaction should be exactly balanced with change output", async () => {
    const tx = await txBuilder
      .txIn(
        txHash("tx0"),
        0,
        [
          {
            unit: "lovelace",
            quantity: "3000000",
          },
        ],
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        0,
      )
      .txOut(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        [
          {
            unit: "lovelace",
            quantity: "1000000",
          },
        ],
      )
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();
    const cardanoTx = Transaction.fromCbor(TxCBOR(tx));
    expect(calculateOutputLovelaces(tx) + cardanoTx.body().fee()).toEqual(
      BigInt(3000000),
    );
    expect(cardanoTx.body().outputs().length).toEqual(2);
  });

  it("Transaction without enough lovelaces for fees should throw error", async () => {
    await expect(
      txBuilder
        .txIn(
          txHash("tx0"),
          0,
          [
            {
              unit: "lovelace",
              quantity: "1000000",
            },
          ],
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
          0,
        )
        .txOut(
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
          [
            {
              unit: "lovelace",
              quantity: "900000",
            },
          ],
        )
        .changeAddress(
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        )
        .complete(),
    ).rejects.toThrow("Insufficient funds to pay fee");
  });
});
