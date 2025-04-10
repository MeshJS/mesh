import { serializePlutusScript } from "@meshsdk/core";
import { CSLSerializer, OfflineEvaluator } from "@meshsdk/core-csl";
import { resolveScriptRef } from "@meshsdk/core-cst";
import { OfflineFetcher } from "@meshsdk/provider";

import { MeshTxBuilder } from "../../dist";
import { alwaysFailCbor, alwaysFailHash, txHash } from "../test-util";

describe("MeshTxBuilder - Failed Script Transactions", () => {
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
    {
      input: {
        txHash: txHash("tx2"),
        outputIndex: 0,
      },
      output: {
        address: serializePlutusScript({
          code: alwaysFailCbor,
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
          code: alwaysFailCbor,
          version: "V3",
        }).address,
        amount: [
          {
            unit: "lovelace",
            quantity: "100000000",
          },
        ],
        scriptHash: alwaysFailHash,
        scriptRef: resolveScriptRef({ code: alwaysFailCbor, version: "V3" }),
      },
    },
    {
      input: {
        txHash: txHash("tx4"),
        outputIndex: 0,
      },
      output: {
        address: serializePlutusScript({
          code: alwaysFailCbor,
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

  it("failed scripts should provide error", async () => {
    const res = await txBuilder
      .spendingPlutusScriptV3()
      .txIn(txHash("tx2"), 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue("")
      .txInScript(alwaysFailCbor)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete()
      .catch((err) => {
        return err;
      });

    const res2 = await txBuilder2
      .spendingPlutusScriptV3()
      .txIn(txHash("tx2"), 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue("")
      .txInScript(alwaysFailCbor)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete()
      .catch((err) => {
        return err;
      });
    expect(res).toBeInstanceOf(Error);
    expect(res2).toBeInstanceOf(Error);
    expect(res.message).toMatch(
      `Evaluate redeemers failed: Tx evaluation failed: [{\"index\":0,\"budget\":{\"mem\":100,\"steps\":100},\"tag\":\"spend\",\"errorMessage\":\"the validator crashed / exited prematurely\",\"logs\":[]}] \n For txHex:`,
    );
    expect(res2.message).toMatch(
      `Evaluate redeemers failed: Tx evaluation failed: [{\"index\":0,\"budget\":{\"mem\":100,\"steps\":100},\"tag\":\"spend\",\"errorMessage\":\"the validator crashed / exited prematurely\",\"logs\":[]}] \n For txHex:`,
    );
  });
});
