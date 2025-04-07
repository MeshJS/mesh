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
    // const res = await txBuilder
    //   .spendingPlutusScriptV3()
    //   .txIn(txHash("tx2"), 0)
    //   .txInInlineDatumPresent()
    //   .txInRedeemerValue("")
    //   .txInScript(alwaysFailCbor)
    //   .txInCollateral(txHash("tx1"), 0)
    //   .changeAddress(
    //     "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    //   )
    //   .complete()
    //   .catch((err) => {
    //     return err;
    //   });

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
    // expect(res).toBeInstanceOf(Error);
    expect(res2).toBeInstanceOf(Error);
    // expect(res.message).toEqual(
    //   `Tx evaluation failed: [{\"index\":0,\"budget\":{\"mem\":100,\"steps\":100},\"tag\":\"spend\",\"errorMessage\":\"the validator crashed / exited prematurely\",\"logs\":[]}] \n For txHex: 84a500d901028182582004e2ea9d2d75f7780b84e8f57bb8cf845815367b52575317fe8a4e7b9bb0a1b9000181825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a05e9cfeb021a000c11150b5820328c9e9a59a2d430754ce45340f8b30f93e68f2b4b2f4da2208acd26f162098c0dd901028182582066e9f787106bf68431827fc3cde3db92705e9ca984d404516a2c8014b30c814200a207d9010281515001010023259800b452689b2b2002573505a18200008240821a006acfc01ab2d05e00f5f6`,
    // );
    expect(res2.message).toMatch(
      `Evaluate redeemers failed: Tx evaluation failed: [{\"index\":0,\"budget\":{\"mem\":100,\"steps\":100},\"tag\":\"spend\",\"errorMessage\":\"the validator crashed / exited prematurely\",\"logs\":[]}] \n For txHex:`,
    );
  });
});
