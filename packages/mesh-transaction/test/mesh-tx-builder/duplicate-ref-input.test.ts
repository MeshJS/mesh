import {
  applyCborEncoding,
  DRep,
  MeshTxBuilder,
  OfflineFetcher,
  resolveScriptHash,
  serializeNativeScript,
  serializePlutusScript,
  serializeRewardAddress,
} from "@meshsdk/core";
import { CSLSerializer, OfflineEvaluator } from "@meshsdk/core-csl";
import {
  blake2b,
  resolveNativeScriptHash,
  resolveScriptHashDRepId,
  resolveScriptRef,
  Serialization,
} from "@meshsdk/core-cst";

describe("MeshTxBuilder - Duplicate Ref Input", () => {
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

  it("Spending from the same script address multiple times should only have one script ref", async () => {
    const txHex = await txBuilder
      .spendingPlutusScriptV3()
      .txIn(txHash("tx1"), 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue("")
      .spendingTxInReference(txHash("tx3"), 0)
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

    const cardanoTx = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex),
    );
    const cardanoTx2 = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex2),
    );
    expect(cardanoTx.body().referenceInputs()!.size()).toEqual(1);
    expect(cardanoTx2.body().referenceInputs()!.size()).toEqual(1);
  });

  it("Minting multiple tokens with the same policy should only have one script ref", async () => {
    const txHex = await txBuilder
      .mintPlutusScriptV3()
      .mint("1", alwaysSucceedHash, "60")
      .mintRedeemerValue("")
      .mintTxInReference(txHash("tx3"), 0)
      .mintPlutusScriptV3()
      .mint("1", alwaysSucceedHash, "61")
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
      .mint("1", alwaysSucceedHash, "60")
      .mintRedeemerValue("")
      .mintTxInReference(txHash("tx3"), 0)
      .mintPlutusScriptV3()
      .mint("1", alwaysSucceedHash, "61")
      .mintRedeemerValue("")
      .mintTxInReference(txHash("tx3"), 0)
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    const cardanoTx = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex),
    );
    const cardanoTx2 = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex2),
    );
    expect(cardanoTx.body().referenceInputs()!.size()).toEqual(1);
    expect(cardanoTx2.body().referenceInputs()!.size()).toEqual(1);
  });

  it("Withdrawing multiple times with the same script should only have one script ref", async () => {
    const txHex = await txBuilder
      .withdrawalPlutusScriptV3()
      .withdrawal(serializeRewardAddress(alwaysSucceedHash, true), "0")
      .withdrawalScript(alwaysSucceedCbor)
      .withdrawalRedeemerValue("")
      .withdrawalTxInReference(txHash("tx3"), 0)
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

    const cardanoTx = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex),
    );
    const cardanoTx2 = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex2),
    );
    expect(cardanoTx.body().referenceInputs()!.size()).toEqual(1);
    expect(cardanoTx2.body().referenceInputs()!.size()).toEqual(1);
    // This isn't actually possible and should be deduplicated, so there should only be a single withdrawal
    expect(cardanoTx.body().withdrawals()!.size).toEqual(1);
    expect(cardanoTx2.body().withdrawals()!.size).toEqual(1);
  });

  it("Multiple certificates with the same script should only have one script ref", async () => {
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
      .delegateStakeCertificate(
        serializeRewardAddress(alwaysSucceedHash, true),
        "624fcb718d9facc7dcc8daa3c5cad6753886ddc968cc4a6bea5e9cc3",
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
      .delegateStakeCertificate(
        serializeRewardAddress(alwaysSucceedHash, true),
        "pool1vf8ukuvdn7kv0hxgm23utjkkw5ugdhwfdrxy56l2t6wvxezspyu",
      )
      .certificateTxInReference(txHash("tx3"), 0, undefined, undefined, "V3")
      .certificateRedeemerValue("")
      .txIn(txHash("tx1"), 0)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      )
      .complete();

    const cardanoTx = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex),
    );
    const cardanoTx2 = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex2),
    );
    expect(cardanoTx.body().referenceInputs()!.size()).toEqual(1);
    expect(cardanoTx2.body().referenceInputs()!.size()).toEqual(1);
  });

  it("Multiple votes with the same script should only have one script ref", async () => {
    const txHex = await txBuilder
      .votePlutusScriptV3()
      .vote(
        { type: "DRep", drepId: resolveScriptHashDRepId(alwaysSucceedHash) },
        { txHash: txHash("tx100"), txIndex: 0 },
        { voteKind: "Yes" },
      )
      .voteTxInReference(txHash("tx3"), 0)
      .voteRedeemerValue("")
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
      .votePlutusScriptV3()
      .vote(
        { type: "DRep", drepId: resolveScriptHashDRepId(alwaysSucceedHash) },
        { txHash: txHash("tx101"), txIndex: 0 },
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

    const cardanoTx = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex),
    );
    const cardanoTx2 = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(txHex2),
    );
    expect(cardanoTx.body().referenceInputs()!.size()).toEqual(1);
    expect(cardanoTx2.body().referenceInputs()!.size()).toEqual(1);
  });
});
