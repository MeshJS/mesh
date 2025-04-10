import { serializePlutusScript } from "@meshsdk/core";
import { CSLSerializer, OfflineEvaluator } from "@meshsdk/core-csl";
import { resolveScriptRef } from "@meshsdk/core-cst";
import { OfflineFetcher } from "@meshsdk/provider";

import { MeshTxBuilder } from "../../dist";
import { spend42Cbor, spend42Hash, txHash } from "../test-util";

describe("MeshTxBuilder - Datum Script Transactions", () => {
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
          code: spend42Cbor,
          version: "V3",
        }).address,
        amount: [
          {
            unit: "lovelace",
            quantity: "100000000",
          },
        ],
        plutusData: "182a",
      },
    },
    {
      input: {
        txHash: txHash("tx3"),
        outputIndex: 0,
      },
      output: {
        address: serializePlutusScript({
          code: spend42Cbor,
          version: "V3",
        }).address,
        amount: [
          {
            unit: "lovelace",
            quantity: "100000000",
          },
        ],
        scriptHash: spend42Hash,
        scriptRef: resolveScriptRef({ code: spend42Cbor, version: "V3" }),
      },
    },
    {
      input: {
        txHash: txHash("tx4"),
        outputIndex: 0,
      },
      output: {
        address: serializePlutusScript({
          code: spend42Cbor,
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

  it("inline datum should resolve correctly", async () => {
    const res = await txBuilder
      .spendingPlutusScriptV3()
      .txIn(txHash("tx2"), 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue("")
      .txInScript(spend42Cbor)
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
      .txInScript(spend42Cbor)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete()
      .catch((err) => {
        return err;
      });
    expect(res).not.toBeInstanceOf(Error);
    expect(res2).not.toBeInstanceOf(Error);
  });
});
