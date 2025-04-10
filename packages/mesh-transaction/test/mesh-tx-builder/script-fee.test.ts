import {
  DEFAULT_PROTOCOL_PARAMETERS,
  MeshTxBuilder,
  MeshWallet,
  OfflineFetcher,
  resolveScriptRef,
} from "@meshsdk/core";
import { calculateFees, Serialization } from "@meshsdk/core-cst";

import { alwaysSucceedCbor, alwaysSucceedHash, txHash } from "../test-util";

describe("MeshTxBuilder - Script Fee", () => {
  const offlineFetcher = new OfflineFetcher();

  const txBuilder = new MeshTxBuilder({
    fetcher: offlineFetcher,
  });

  offlineFetcher.addUTxOs([
    {
      input: {
        txHash: txHash("tx3"),
        outputIndex: 0,
      },
      output: {
        address:
          "addr_test1vqdy60gf798xrl20wwvapvsxj3kr8yz8ac6zfmgwg6c5g9qh602xh",
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
  ]);

  it("Tx Builder calculates fee based on correct script size", async () => {
    const txHex = await txBuilder
      .txIn(txHash("tx3"), 0)
      .changeAddress(
        "addr_test1vqdy60gf798xrl20wwvapvsxj3kr8yz8ac6zfmgwg6c5g9qh602xh",
      )
      .complete();

    const cardanoTx = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex),
    );

    const wallet = new MeshWallet({
      networkId: 0,
      key: {
        type: "cli",
        payment:
          "f083e5878c6f980c53d30b9cc2baadd780307b08acec9e0792892e013bbe9241",
        stake:
          "b810d6398db44f380a9ab279f63950c4b95432f44fafb5a6f026afe23bbe9241",
      },
    });
    await wallet.init();
    expect(
      calculateFees(
        DEFAULT_PROTOCOL_PARAMETERS.minFeeA,
        DEFAULT_PROTOCOL_PARAMETERS.minFeeB,
        DEFAULT_PROTOCOL_PARAMETERS.minFeeRefScriptCostPerByte,
        DEFAULT_PROTOCOL_PARAMETERS.priceMem,
        DEFAULT_PROTOCOL_PARAMETERS.priceStep,
        Serialization.Transaction.fromCbor(
          Serialization.TxCBOR(await wallet.signTx(cardanoTx.toCbor())),
        ),
        resolveScriptRef({ code: alwaysSucceedCbor, version: "V3" }).length / 2,
      ),
    ).toBeLessThan(cardanoTx.body().fee());
  });
});
