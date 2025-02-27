import {
  applyCborEncoding,
  BlockfrostProvider,
  DRep,
  MeshTxBuilder,
  OfflineFetcher,
  resolveScriptHash,
  serializePlutusScript,
  serializeRewardAddress,
  UTxO,
} from "@meshsdk/core";
import { CSLSerializer, OfflineEvaluator } from "@meshsdk/core-csl";
import {
  blake2b,
  resolveScriptHashDRepId,
  resolveScriptRef,
} from "@meshsdk/core-cst";

describe("MeshTxBuilder - Script Transactions", () => {
  const alwaysSucceedCbor = applyCborEncoding(
    "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01",
  );

  const alwaysSucceedHash = resolveScriptHash(alwaysSucceedCbor, "V3");

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
        scriptHash: alwaysSucceedHash,
        scriptRef: resolveScriptRef({ code: alwaysSucceedCbor, version: "V3" }),
      },
    },
  ]);

  const txBuilder = new MeshTxBuilder({
    serializer: new CSLSerializer(),
    fetcher: offlineFetcher,
  });

  const txBuilder2 = new MeshTxBuilder({
    fetcher: offlineFetcher,
  });

  beforeEach(() => {
    txBuilder.reset();
    txBuilder2.reset();
  });

  it("should be able to spend from a script address", async () => {
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
      .complete();

    const txHex2 = await txBuilder2
      .spendingPlutusScriptV3()
      .txIn(txHash("tx2"), 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue("")
      .txInScript(alwaysSucceedCbor)
      .txInCollateral(txHash("tx1"), 0)
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

    expect(
      await offlineEvaluator.evaluateTx(
        txHex2,
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
    const txHex = await txBuilder
      .spendingPlutusScriptV3()
      .txIn(txHash("tx2"), 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue("")
      .spendingTxInReference(txHash("tx3"), 0)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    const txHex2 = await txBuilder2
      .spendingPlutusScriptV3()
      .txIn(txHash("tx2"), 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue("")
      .spendingTxInReference(txHash("tx3"), 0)
      .txInCollateral(txHash("tx1"), 0)
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

    expect(
      await offlineEvaluator.evaluateTx(
        txHex2,
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
    const txHex = await txBuilder
      .mintPlutusScriptV3()
      .mint("1", alwaysSucceedHash, "")
      .mintRedeemerValue("")
      .mintingScript(alwaysSucceedCbor)
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    const txHex2 = await txBuilder2
      .mintPlutusScriptV3()
      .mint("1", alwaysSucceedHash, "")
      .mintRedeemerValue("")
      .mintingScript(alwaysSucceedCbor)
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
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

    expect(
      await offlineEvaluator.evaluateTx(
        txHex2,
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
    const txHex = await txBuilder
      .mintPlutusScriptV3()
      .mint("1", alwaysSucceedHash, "")
      .mintRedeemerValue("")
      .mintTxInReference(txHash("tx3"), 0)
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    const txHex2 = await txBuilder2
      .mintPlutusScriptV3()
      .mint("1", alwaysSucceedHash, "")
      .mintRedeemerValue("")
      .mintTxInReference(txHash("tx3"), 0)
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
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

    expect(
      await offlineEvaluator.evaluateTx(
        txHex2,
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
    const txHex = await txBuilder
      .withdrawalPlutusScriptV3()
      .withdrawal(serializeRewardAddress(alwaysSucceedHash, true), "0")
      .withdrawalScript(alwaysSucceedCbor)
      .withdrawalRedeemerValue("")
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    const txHex2 = await txBuilder2
      .withdrawalPlutusScriptV3()
      .withdrawal(serializeRewardAddress(alwaysSucceedHash, true), "0")
      .withdrawalScript(alwaysSucceedCbor)
      .withdrawalRedeemerValue("")
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
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

    expect(
      await offlineEvaluator.evaluateTx(
        txHex2,
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
    const txHex = await txBuilder
      .withdrawalPlutusScriptV3()
      .withdrawal(serializeRewardAddress(alwaysSucceedHash, true), "0")
      .withdrawalScript(alwaysSucceedCbor)
      .withdrawalRedeemerValue("")
      .withdrawalTxInReference(txHash("tx3"), 0)
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    const txHex2 = await txBuilder2
      .withdrawalPlutusScriptV3()
      .withdrawal(serializeRewardAddress(alwaysSucceedHash, true), "0")
      .withdrawalScript(alwaysSucceedCbor)
      .withdrawalRedeemerValue("")
      .withdrawalTxInReference(txHash("tx3"), 0)
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
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

    expect(
      await offlineEvaluator.evaluateTx(
        txHex2,
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
    const drep: DRep = {
      alwaysAbstain: null,
    };

    const txHex = await txBuilder
      .voteDelegationCertificate(
        drep,
        serializeRewardAddress(alwaysSucceedHash, true),
      )
      .certificateScript(alwaysSucceedCbor, "V3")
      .certificateRedeemerValue("")
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    const txHex2 = await txBuilder2
      .voteDelegationCertificate(
        drep,
        serializeRewardAddress(alwaysSucceedHash, true),
      )
      .certificateScript(alwaysSucceedCbor, "V3")
      .certificateRedeemerValue("")
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
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

    expect(
      await offlineEvaluator.evaluateTx(
        txHex2,
        Object.values(
          txBuilder.meshTxBuilderBody.inputsForEvaluation,
        ) as UTxO[],
        txBuilder.meshTxBuilderBody.chainedTxs,
      ),
    ).toEqual([
      { budget: { mem: 2001, steps: 380149 }, index: 0, tag: "CERT" },
    ]);
  });

  it("should be able to register certificates with a plutus script with script ref", async () => {
    const drep: DRep = {
      alwaysAbstain: null,
    };

    const txHex = await txBuilder
      .voteDelegationCertificate(
        drep,
        serializeRewardAddress(alwaysSucceedHash, true),
      )
      .certificateTxInReference(txHash("tx3"), 0, undefined, undefined, "V3")
      .certificateRedeemerValue("")
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    const txHex2 = await txBuilder2
      .voteDelegationCertificate(
        drep,
        serializeRewardAddress(alwaysSucceedHash, true),
      )
      .certificateTxInReference(txHash("tx3"), 0, undefined, undefined, "V3")
      .certificateRedeemerValue("")
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
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

    expect(
      await offlineEvaluator.evaluateTx(
        txHex2,
        Object.values(
          txBuilder.meshTxBuilderBody.inputsForEvaluation,
        ) as UTxO[],
        txBuilder.meshTxBuilderBody.chainedTxs,
      ),
    ).toEqual([
      { budget: { mem: 2001, steps: 380149 }, index: 0, tag: "CERT" },
    ]);
  });

  it("should be able to vote with a plutus script", async () => {
    const txHex = await txBuilder
      .votePlutusScriptV3()
      .vote(
        { type: "DRep", drepId: resolveScriptHashDRepId(alwaysSucceedHash) },
        { txHash: txHash("tx100"), txIndex: 0 },
        { voteKind: "Yes" },
      )
      .voteTxInReference(txHash("tx3"), 0)
      .voteRedeemerValue("")
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();
    const txHex2 = await txBuilder2
      .votePlutusScriptV3()
      .vote(
        { type: "DRep", drepId: resolveScriptHashDRepId(alwaysSucceedHash) },
        { txHash: txHash("tx100"), txIndex: 0 },
        { voteKind: "Yes" },
      )
      .voteTxInReference(txHash("tx3"), 0)
      .voteRedeemerValue("")
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
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
      { budget: { mem: 2001, steps: 380149 }, index: 0, tag: "VOTE" },
    ]);
    expect(
      await offlineEvaluator.evaluateTx(
        txHex2,
        Object.values(
          txBuilder.meshTxBuilderBody.inputsForEvaluation,
        ) as UTxO[],
        txBuilder.meshTxBuilderBody.chainedTxs,
      ),
    ).toEqual([
      { budget: { mem: 2001, steps: 380149 }, index: 0, tag: "VOTE" },
    ]);
  });
});
