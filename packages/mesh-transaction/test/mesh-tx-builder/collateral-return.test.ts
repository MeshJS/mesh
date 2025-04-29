import { MeshTxBuilder, serializePlutusScript } from "@meshsdk/core";
import {
  AssetId,
  empty,
  resolveScriptRef,
  Serialization,
  subValue,
} from "@meshsdk/core-cst";
import { OfflineFetcher } from "@meshsdk/provider";

import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  mockTokenUnit,
  txHash,
} from "../test-util";

describe("MeshTxBuilder - collateral return test", () => {
  const offlineFetcher = new OfflineFetcher();

  offlineFetcher.addUTxOs([
    {
      input: {
        txHash: txHash("tx1"),
        outputIndex: 0,
      },
      output: {
        address:
          "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
        amount: [
          {
            unit: "lovelace",
            quantity: "100000000",
          },
          {
            unit: mockTokenUnit(0),
            quantity: "1000000",
          },
          {
            unit: mockTokenUnit(1),
            quantity: "10000",
          },
        ],
      },
    },
    {
      input: {
        txHash: txHash("tx2"),
        outputIndex: 0,
      },
      output: {
        address: serializePlutusScript({
          code: alwaysSucceedCbor,
          version: "V3",
        }).address,
        amount: [
          {
            unit: "lovelace",
            quantity: "100000000",
          },
        ],
      },
    },
    {
      input: {
        txHash: txHash("tx3"),
        outputIndex: 0,
      },
      output: {
        address: serializePlutusScript({
          code: alwaysSucceedCbor,
          version: "V3",
        }).address,
        amount: [
          {
            unit: "lovelace",
            quantity: "100000000",
          },
        ],
        scriptHash: alwaysSucceedHash,
        scriptRef: resolveScriptRef({ code: alwaysSucceedCbor, version: "V3" }),
      },
    },
    {
      input: {
        txHash: txHash("tx4"),
        outputIndex: 0,
      },
      output: {
        address: serializePlutusScript({
          code: alwaysSucceedCbor,
          version: "V3",
        }).address,
        amount: [
          {
            unit: "lovelace",
            quantity: "100000000",
          },
        ],
      },
    },
  ]);

  const txBuilder = new MeshTxBuilder({
    fetcher: offlineFetcher,
  });

  beforeEach(() => {
    txBuilder.reset();
  });

  it("should be able to add collateral return with tokens", async () => {
    const txHex = await txBuilder
      .spendingPlutusScriptV3()
      .txIn(txHash("tx2"), 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue("")
      .txInScript(alwaysSucceedCbor)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .setTotalCollateral("5000000")
      .complete();

    const cardanoTx = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex),
    );

    expect(cardanoTx.body().totalCollateral()).toBe(5000000n);
    expect(cardanoTx.body().collateralReturn()?.address().toBech32()).toBe(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    );
    const collateralReturnValue = cardanoTx.body().collateralReturn()?.amount();
    expect(
      empty(
        subValue(
          collateralReturnValue!,
          Serialization.Value.fromCore({
            coins: 95000000n,
            assets: new Map([
              [AssetId(mockTokenUnit(0)), 1000000n],
              [AssetId(mockTokenUnit(1)), 10000n],
            ]),
          }),
        ),
      ),
    ).toBe(true);
  });
});
