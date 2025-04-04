import {
  MeshTxBuilder,
  OfflineFetcher,
  resolveScriptHash,
  resolveScriptRef,
  serializePlutusScript,
} from "@meshsdk/core";
import { CSLSerializer, OfflineEvaluator } from "@meshsdk/core-csl";
import { Transaction, TxCBOR } from "@meshsdk/core-cst";

import { alwaysSucceedCbor, mintParamCbor, txHash } from "../test-util";

describe("MeshTxBuilder - Redeemer Update", () => {
  const tokenAScriptCbor = alwaysSucceedCbor;
  const tokenBScriptCbor = mintParamCbor(100000000000);
  const tokenCScrtiptCbor = mintParamCbor(1);
  const tokenAPolicy = resolveScriptHash(tokenAScriptCbor, "V3");
  const tokenBPolicy = resolveScriptHash(tokenBScriptCbor, "V3");
  const tokenCPolicy = resolveScriptHash(tokenCScrtiptCbor, "V3");

  const offlineFetcher = new OfflineFetcher();
  const offlineEvaluator = new OfflineEvaluator(offlineFetcher, "preprod");

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
        ],
      },
    },
  ]);

  const txBuilder = new MeshTxBuilder({
    serializer: new CSLSerializer(),
    fetcher: offlineFetcher,
    evaluator: offlineEvaluator,
  });

  const txBuilder2 = new MeshTxBuilder({
    fetcher: offlineFetcher,
    evaluator: offlineEvaluator,
  });

  beforeEach(() => {
    txBuilder.reset();
    txBuilder2.reset();
  });

  it("should update the redeemer correctly", async () => {
    const txHex = await txBuilder
      .txIn(txHash("tx1"), 0)
      .mintPlutusScriptV3()
      .mint("1", tokenAPolicy, "60")
      .mintRedeemerValue(0)
      .mintingScript(tokenAScriptCbor)
      .mintPlutusScriptV3()
      .mint("1", tokenAPolicy, "61")
      .mintRedeemerValue(0)
      .mintingScript(tokenAScriptCbor)
      .mintPlutusScriptV3()
      .mint("1", tokenBPolicy, "60")
      .mintRedeemerValue(100000000000)
      .mintingScript(tokenBScriptCbor)
      .mintPlutusScriptV3()
      .mint("1", tokenBPolicy, "61")
      .mintRedeemerValue(100000000000)
      .mintingScript(tokenBScriptCbor)
      .mintPlutusScriptV3()
      .mint("1", tokenBPolicy, "62")
      .mintRedeemerValue(100000000000)
      .mintingScript(tokenBScriptCbor)
      .mintPlutusScriptV3()
      .mint("1", tokenCPolicy, "60")
      .mintRedeemerValue(1)
      .mintingScript(tokenCScrtiptCbor)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    const txHex2 = await txBuilder2
      .txIn(txHash("tx1"), 0)
      .mintPlutusScriptV3()
      .mint("1", tokenAPolicy, "60")
      .mintRedeemerValue(0)
      .mintingScript(tokenAScriptCbor)
      .mintPlutusScriptV3()
      .mint("1", tokenAPolicy, "61")
      .mintRedeemerValue(0)
      .mintingScript(tokenAScriptCbor)
      .mintPlutusScriptV3()
      .mint("1", tokenBPolicy, "60")
      .mintRedeemerValue(100000000000)
      .mintingScript(tokenBScriptCbor)
      .mintPlutusScriptV3()
      .mint("1", tokenBPolicy, "61")
      .mintRedeemerValue(100000000000)
      .mintingScript(tokenBScriptCbor)
      .mintPlutusScriptV3()
      .mint("1", tokenBPolicy, "62")
      .mintRedeemerValue(100000000000)
      .mintingScript(tokenBScriptCbor)
      .mintPlutusScriptV3()
      .mint("1", tokenCPolicy, "60")
      .mintRedeemerValue(1)
      .mintingScript(tokenCScrtiptCbor)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    const tx = Transaction.fromCbor(TxCBOR(txHex));
    const tx2 = Transaction.fromCbor(TxCBOR(txHex2));
    expect(tx.body()!.mint()!.size).toEqual(6);
    expect(tx2.body()!.mint()!.size).toEqual(6);
    expect(tx.witnessSet()!.redeemers()!.size()).toEqual(3);
    expect(tx2.witnessSet()!.redeemers()!.size()).toEqual(3);
  });
});
