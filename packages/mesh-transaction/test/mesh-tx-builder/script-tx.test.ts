import {
  applyCborEncoding,
  DRep,
  MeshTxBuilder,
  OfflineFetcher,
  resolveScriptHash,
  serializePlutusScript,
  serializeRewardAddress,
  UTxO,
} from "@meshsdk/core";
import { OfflineEvaluator } from "@meshsdk/core-csl";
import { blake2b, resolveScriptRef } from "@meshsdk/core-cst";

describe("MeshTxBuilder - Script Transactions", () => {
  const alwaysSucceedCbor = applyCborEncoding(
    "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01",
  );

  const offlineFetcher = new OfflineFetcher();
  const offlineEvaluator = new OfflineEvaluator(offlineFetcher, "preprod");

  const txHash = (tx: string) => {
    return blake2b(32).update(Buffer.from(tx, "utf-8")).digest("hex");
  };

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
        scriptRef: resolveScriptRef({ code: alwaysSucceedCbor, version: "V3" }),
      },
    },
  ]);

  it("should be able to spend from a script address", async () => {
    const txBuilder = new MeshTxBuilder({
      fetcher: offlineFetcher,
    });

    const txHex = await txBuilder
      .spendingPlutusScriptV3()
      .txIn(txHash("tx2"), 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue("")
      .txInScript(alwaysSucceedCbor)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    expect(
      await offlineEvaluator.evaluateTx(
        txHex,
        Object.values(
          txBuilder.meshTxBuilderBody.inputsForEvaluation,
        ) as UTxO[],
        txBuilder.meshTxBuilderBody.chainedTxs,
      ),
    ).toEqual([
      { budget: { mem: 2001, steps: 380149 }, index: 0, tag: "SPEND" },
    ]);
  });

  it("should be able to spend from a script address with script ref", async () => {
    const txBuilder = new MeshTxBuilder({
      fetcher: offlineFetcher,
    });

    const txHex = await txBuilder
      .spendingPlutusScriptV3()
      .txIn(txHash("tx2"), 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue("")
      .spendingTxInReference(txHash("tx3"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    expect(
      await offlineEvaluator.evaluateTx(
        txHex,
        Object.values(
          txBuilder.meshTxBuilderBody.inputsForEvaluation,
        ) as UTxO[],
        txBuilder.meshTxBuilderBody.chainedTxs,
      ),
    ).toEqual([
      { budget: { mem: 2001, steps: 380149 }, index: 0, tag: "SPEND" },
    ]);
  });

  it("should be able to mint with a plutus script", async () => {
    const txBuilder = new MeshTxBuilder({
      fetcher: offlineFetcher,
    });

    const txHex = await txBuilder
      .mintPlutusScriptV3()
      .mint("1", resolveScriptHash(alwaysSucceedCbor, "V3"), "")
      .mintRedeemerValue("")
      .mintingScript(alwaysSucceedCbor)
      .txIn(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    expect(
      await offlineEvaluator.evaluateTx(
        txHex,
        Object.values(
          txBuilder.meshTxBuilderBody.inputsForEvaluation,
        ) as UTxO[],
        txBuilder.meshTxBuilderBody.chainedTxs,
      ),
    ).toEqual([
      { budget: { mem: 2001, steps: 380149 }, index: 0, tag: "MINT" },
    ]);
  });

  it("should be able to mint with a plutus script with script ref", async () => {
    const txBuilder = new MeshTxBuilder({
      fetcher: offlineFetcher,
    });

    const txHex = await txBuilder
      .mintPlutusScriptV3()
      .mint("1", resolveScriptHash(alwaysSucceedCbor, "V3"), "")
      .mintRedeemerValue("")
      .mintTxInReference(txHash("tx3"), 0)
      .txIn(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    expect(
      await offlineEvaluator.evaluateTx(
        txHex,
        Object.values(
          txBuilder.meshTxBuilderBody.inputsForEvaluation,
        ) as UTxO[],
        txBuilder.meshTxBuilderBody.chainedTxs,
      ),
    ).toEqual([
      { budget: { mem: 2001, steps: 380149 }, index: 0, tag: "MINT" },
    ]);
  });

  it("should be able to withdraw with a plutus script", async () => {
    const txBuilder = new MeshTxBuilder({
      fetcher: offlineFetcher,
    });

    const txHex = await txBuilder
      .withdrawalPlutusScriptV3()
      .withdrawal(
        serializeRewardAddress(
          resolveScriptHash(alwaysSucceedCbor, "V3"),
          true,
        ),
        "0",
      )
      .withdrawalScript(alwaysSucceedCbor)
      .withdrawalRedeemerValue("")
      .txIn(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    expect(
      await offlineEvaluator.evaluateTx(
        txHex,
        Object.values(
          txBuilder.meshTxBuilderBody.inputsForEvaluation,
        ) as UTxO[],
        txBuilder.meshTxBuilderBody.chainedTxs,
      ),
    ).toEqual([
      { budget: { mem: 2001, steps: 380149 }, index: 0, tag: "REWARD" },
    ]);
  });

  it("should be able to withdraw with a plutus script with script ref", async () => {
    const txBuilder = new MeshTxBuilder({
      fetcher: offlineFetcher,
    });

    const txHex = await txBuilder
      .withdrawalPlutusScriptV3()
      .withdrawal(
        serializeRewardAddress(
          resolveScriptHash(alwaysSucceedCbor, "V3"),
          true,
        ),
        "0",
      )
      .withdrawalScript(alwaysSucceedCbor)
      .withdrawalRedeemerValue("")
      .withdrawalTxInReference(txHash("tx3"), 0)
      .txIn(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    expect(
      await offlineEvaluator.evaluateTx(
        txHex,
        Object.values(
          txBuilder.meshTxBuilderBody.inputsForEvaluation,
        ) as UTxO[],
        txBuilder.meshTxBuilderBody.chainedTxs,
      ),
    ).toEqual([
      { budget: { mem: 2001, steps: 380149 }, index: 0, tag: "REWARD" },
    ]);
  });

  it("should be able to register certificates with a plutus script", async () => {
    const txBuilder = new MeshTxBuilder({
      fetcher: offlineFetcher,
    });

    const drep: DRep = {
      alwaysAbstain: null,
    };

    const txHex = await txBuilder
      .voteDelegationCertificate(
        drep,
        serializeRewardAddress(
          resolveScriptHash(alwaysSucceedCbor, "V3"),
          true,
        ),
      )
      .certificateScript(alwaysSucceedCbor, "V3")
      .certificateRedeemerValue("")
      .txIn(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    expect(
      await offlineEvaluator.evaluateTx(
        txHex,
        Object.values(
          txBuilder.meshTxBuilderBody.inputsForEvaluation,
        ) as UTxO[],
        txBuilder.meshTxBuilderBody.chainedTxs,
      ),
    ).toEqual([
      { budget: { mem: 2001, steps: 380149 }, index: 0, tag: "CERT" },
    ]);
  });
});
