import { Serialization } from "@cardano-sdk/core";

import {
  Asset,
  DEFAULT_PROTOCOL_PARAMETERS,
  emptyTxBuilderBody,
  GovernanceAction,
  MeshTxBuilderBody,
  MeshValue,
  Metadatum,
  NativeScript,
  ProtocolParamUpdate,
  ScriptTxIn,
  TxIn,
  TxMetadata,
  TxTester,
  UTxO,
} from "@meshsdk/common";
import {
  MeshTxBuilder,
  OfflineFetcher,
  resolveScriptHash,
  serializeNativeScript,
  serializePlutusScript,
  serializeRewardAddress,
} from "@meshsdk/core";

import {
  blake2b,
  NativeScript as CardanoNativeScript,
  CardanoSDKSerializer,
  CredentialCore,
  CredentialType,
  DRepID,
  Hash28ByteBase16,
  HexBlob,
  parseTxBuilderBody,
  resolveDataHash,
  resolveNativeScriptHash,
  resolveScriptRef,
  Script,
  Transaction,
  TransactionOutput,
  TxCBOR,
} from "../../src";

const txHash = (seed: string): string =>
  blake2b.hash(Buffer.from(seed, "utf-8"), 32);
const keyHashHex = (i: number): string =>
  Buffer.from(String(i).padStart(28, "0"), "utf-8").toString("hex");
const vrfHex = (i: number): string =>
  Buffer.from(String(i).padStart(32, "0"), "utf-8").toString("hex");
const keyCredential = (hash: string): CredentialCore => ({
  type: CredentialType.KeyHash,
  hash: Hash28ByteBase16(hash),
});
const scriptCredential = (hash: string): CredentialCore => ({
  type: CredentialType.ScriptHash,
  hash: Hash28ByteBase16(hash),
});
const lovelace = (quantity: string): Asset[] => [
  { unit: "lovelace", quantity },
];

const ADDR =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";
const ADDR2 = "addr_test1vpw22xesfv0hnkfw4k5vtrz386tfgkxu6f7wfadug7prl7s6gt89x";

// Aiken "always succeeds" validator, double CBOR encoded as Mesh expects script code
const alwaysSucceedCbor =
  "5836" +
  "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01";
const alwaysSucceedHash = resolveScriptHash(alwaysSucceedCbor, "V3");
const scriptAddr = serializePlutusScript({
  code: alwaysSucceedCbor,
  version: "V3",
}).address;
const plutusRef = resolveScriptRef({ code: alwaysSucceedCbor, version: "V3" });
// The same reference script wrapped in CBOR tag 24, as some providers return it
const tag24Ref =
  "d818" +
  "58" +
  (plutusRef.length / 2).toString(16).padStart(2, "0") +
  plutusRef;

const nativeScript: NativeScript = { type: "all", scripts: [] };
const { address: nativeAddr, scriptCbor: nativeCbor } =
  serializeNativeScript(nativeScript);
const nativeHash = resolveNativeScriptHash(nativeScript);
const nativeRef = resolveScriptRef(nativeScript);

const scriptStake = serializeRewardAddress(alwaysSucceedHash, true);
const nativeStake = serializeRewardAddress(nativeHash, true);
const keyStake = serializeRewardAddress(keyHashHex(1));
const keyStake2 = serializeRewardAddress(keyHashHex(2));

const scriptDrep = DRepID.cip129FromCredential(
  scriptCredential(alwaysSucceedHash),
);
const nativeDrep = DRepID.cip129FromCredential(scriptCredential(nativeHash));
const keyDrep1 = DRepID.cip129FromCredential(keyCredential(keyHashHex(1)));
const keyDrep2 = DRepID.cip129FromCredential(keyCredential(keyHashHex(2)));

const anchor = {
  anchorUrl: "https://example.com/anchor.json",
  anchorDataHash: "ab".repeat(32),
};
const POOL_HEX = "624fcb718d9facc7dcc8daa3c5cad6753886ddc968cc4a6bea5e9cc3";
const POOL_B32 = "pool1vf8ukuvdn7kv0hxgm23utjkkw5ugdhwfdrxy56l2t6wvxezspyu";
const GOV = { txHash: txHash("tx100"), txIndex: 0 };
const GOV2 = { txHash: txHash("tx101"), txIndex: 3 };
// Redeemer of `txInRedeemerValue("")` & co. with the default budget (no evaluator)
const REDEEMER = {
  data: { type: "CBOR", content: "40" },
  exUnits: { mem: 7000000, steps: 3000000000 },
};

const utxo = (
  seed: string,
  outputIndex: number,
  output: UTxO["output"],
): UTxO => ({ input: { txHash: txHash(seed), outputIndex }, output });

const utxos: UTxO[] = [
  utxo("tx1", 0, { address: ADDR, amount: lovelace("100000000") }),
  utxo("tx2", 0, {
    address: scriptAddr,
    amount: lovelace("100000000"),
    plutusData: "d87980",
    dataHash: resolveDataHash("d87980", "CBOR"),
  }),
  utxo("tx3", 0, {
    address: scriptAddr,
    amount: lovelace("100000000"),
    scriptHash: alwaysSucceedHash,
    scriptRef: plutusRef,
  }),
  utxo("tx4", 0, { address: scriptAddr, amount: lovelace("100000000") }),
  utxo("tx5", 0, { address: nativeAddr, amount: lovelace("50000000") }),
  utxo("tx6", 0, {
    address: ADDR,
    amount: lovelace("50000000"),
    scriptHash: nativeHash,
    scriptRef: nativeRef,
  }),
  utxo("tx7", 0, { address: nativeAddr, amount: lovelace("50000000") }),
  utxo("tx8", 0, {
    address: scriptAddr,
    amount: lovelace("50000000"),
    dataHash: resolveDataHash("d87980", "CBOR"),
  }),
  utxo("tx9", 1, {
    address: ADDR2,
    amount: [
      { unit: "lovelace", quantity: "20000000" },
      { unit: alwaysSucceedHash + "60", quantity: "5" },
    ],
  }),
  utxo("tx10", 0, { address: ADDR, amount: lovelace("1000000000000") }),
  utxo("tx11", 0, {
    address: ADDR,
    amount: lovelace("50000000"),
    scriptHash: alwaysSucceedHash,
    scriptRef: tag24Ref,
  }),
];

const fetcher = new OfflineFetcher();
fetcher.addUTxOs(utxos);

const txBuilder = () =>
  new MeshTxBuilder({
    fetcher,
    evaluator: null,
    serializer: new CardanoSDKSerializer(),
  });

/** Builds the transaction and parses it back with a fresh serializer */
const build = async (configure: (builder: MeshTxBuilder) => MeshTxBuilder) => {
  const txHex = await configure(txBuilder()).complete();
  const parser = new CardanoSDKSerializer().parser;
  parser.parse(txHex, utxos);
  return { txHex, parser, body: parser.getBuilderBody() };
};

describe("CardanoSDKTxParser", () => {
  it("lists inputs, collateral and reference inputs as required inputs", async () => {
    const { txHex, parser } = await build((b) =>
      b
        .spendingPlutusScriptV3()
        .txIn(txHash("tx2"), 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue("")
        .spendingTxInReference(txHash("tx3"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(parser.getRequiredInputs(txHex)).toEqual([
      { txHash: txHash("tx2"), outputIndex: 0 },
      { txHash: txHash("tx1"), outputIndex: 0 },
      { txHash: txHash("tx3"), outputIndex: 0 },
    ]);
  });

  it("parses pub key inputs, outputs, metadata, validity range and required signers", async () => {
    const token = { unit: alwaysSucceedHash + "60", quantity: "5" };
    const { body } = await build((b) =>
      b
        .txIn(txHash("tx1"), 0)
        .txIn(txHash("tx9"), 1)
        .txOut(scriptAddr, lovelace("2000000"))
        .txOutDatumHashValue("d87980", "CBOR")
        .txOut(scriptAddr, lovelace("2000000"))
        .txOutInlineDatumValue("d8799f01ff", "CBOR")
        .txOut(scriptAddr, lovelace("2000000"))
        .txOutDatumEmbedValue("d8799f02ff", "CBOR")
        .txOut(ADDR2, lovelace("3000000"))
        .txOutReferenceScript(alwaysSucceedCbor, "V3")
        .txOut(ADDR2, [{ unit: "lovelace", quantity: "3000000" }, token])
        .txOutInlineDatumValue({ alternative: 0, fields: [] })
        .metadataValue(674, ["hello", "world", 42])
        .metadataValue(1, 12345678901234567890n)
        .metadataValue(2, "text")
        .invalidBefore(100)
        .invalidHereafter(2000000)
        .requiredSignerHash("ff".repeat(28))
        .requiredSignerHash("00".repeat(28))
        .requiredSignerHash(keyHashHex(1))
        .changeAddress(ADDR),
    );

    // inputs come back in ledger order (sorted by transaction id and index)
    expect(body.inputs.map((input) => input.txIn.txHash)).toEqual(
      [txHash("tx1"), txHash("tx9")].sort(),
    );
    expect(body.inputs.map((input) => input.type)).toEqual([
      "PubKey",
      "PubKey",
    ]);
    expect(
      body.inputs.find((input) => input.txIn.txHash === txHash("tx9")),
    ).toEqual({
      type: "PubKey",
      txIn: {
        txHash: txHash("tx9"),
        txIndex: 1,
        amount: [{ unit: "lovelace", quantity: "20000000" }, token],
        address: ADDR2,
      },
    });

    expect(body.outputs).toHaveLength(6);
    expect(body.outputs[0]).toEqual({
      address: scriptAddr,
      amount: lovelace("2000000"),
      datum: {
        type: "Hash",
        data: { type: "CBOR", content: resolveDataHash("d87980", "CBOR") },
      },
    });
    expect(body.outputs[1]).toEqual({
      address: scriptAddr,
      amount: lovelace("2000000"),
      datum: { type: "Inline", data: { type: "CBOR", content: "d8799f01ff" } },
    });
    expect(body.outputs[2]).toEqual({
      address: scriptAddr,
      amount: lovelace("2000000"),
      datum: {
        type: "Embedded",
        data: { type: "CBOR", content: "d8799f02ff" },
      },
    });
    expect(body.outputs[3]).toEqual({
      address: ADDR2,
      amount: lovelace("3000000"),
      referenceScript: { code: alwaysSucceedCbor, version: "V3" },
    });
    expect(body.outputs[4]).toEqual({
      address: ADDR2,
      amount: [{ unit: "lovelace", quantity: "3000000" }, token],
      datum: { type: "Inline", data: { type: "CBOR", content: "d87980" } },
    });
    expect(body.outputs[5]!.address).toBe(ADDR);
    expect(body.changeAddress).toBe(ADDR);

    expect(body.metadata).toEqual(
      new Map<bigint, Metadatum>([
        [674n, ["hello", "world", 42]],
        [1n, 12345678901234567890n],
        [2n, "text"],
      ]),
    );
    expect(body.validityRange).toEqual({
      invalidBefore: 100,
      invalidHereafter: 2000000,
    });
    // required signers keep the order they have in the transaction
    expect(body.requiredSignatures).toEqual([
      "ff".repeat(28),
      "00".repeat(28),
      keyHashHex(1),
    ]);

    expect(body.fee).toBe("0");
    expect(body.collaterals).toEqual([]);
    expect(body.referenceInputs).toEqual([]);
    expect(body.mints).toEqual([]);
    expect(body.withdrawals).toEqual([]);
    expect(body.certificates).toEqual([]);
    expect(body.votes).toEqual([]);
    expect(body.scriptMetadata).toEqual([]);
    expect(body.totalCollateral).toBeUndefined();
    expect(body.donation).toBeUndefined();
  });

  // Serialized without MeshTxBuilder: under Jest the builder's structuredClone turns the
  // metadata maps into foreign-realm Maps that the serializer does not recognise.
  it("parses nested metadata maps, integer keys, byte strings and big integers", () => {
    const body = emptyTxBuilderBody();
    body.inputs = [
      {
        type: "PubKey",
        txIn: {
          txHash: txHash("tx1"),
          txIndex: 0,
          amount: lovelace("100000000"),
          address: ADDR,
        },
      },
    ];
    body.outputs = [{ address: ADDR, amount: lovelace("99000000") }];
    body.changeAddress = ADDR;
    body.fee = "1000000";
    const metadata = (): TxMetadata =>
      new Map<bigint, Metadatum>([
        [
          674n,
          new Map<Metadatum, Metadatum>([
            ["msg", ["hello", "world"]],
            ["n", 42],
          ]),
        ],
        [
          7n,
          new Map<Metadatum, Metadatum>([
            [1, new Uint8Array([0xde, 0xad, 0xbe, 0xef])],
            [-2, "negative key"],
            [12345678901234567890n, [-12345678901234567890n]],
          ]),
        ],
      ]);
    body.metadata = metadata();

    const txHex = new CardanoSDKSerializer().serializeTxBody(
      body,
      DEFAULT_PROTOCOL_PARAMETERS,
    );
    expect(parseTxBuilderBody(txHex, utxos).metadata).toEqual(metadata());
  });

  // MeshTxBuilder cannot attach a native reference script to an output, so add it to a
  // built transaction with the cardano-sdk API.
  it("parses a native reference script on an output", async () => {
    const { txHex } = await build((b) =>
      b
        .txIn(txHash("tx1"), 0)
        .txOut(ADDR2, lovelace("3000000"))
        .changeAddress(ADDR),
    );
    const tx = Transaction.fromCbor(TxCBOR(txHex));
    const txBody = tx.body();
    const outputs = txBody.outputs();
    const patched = new TransactionOutput(
      outputs[0]!.address(),
      outputs[0]!.amount(),
    );
    patched.setScriptRef(
      Script.newNativeScript(CardanoNativeScript.fromCbor(HexBlob(nativeCbor))),
    );
    outputs[0] = patched;
    txBody.setOutputs(outputs);
    const patchedHex = new Transaction(
      txBody,
      tx.witnessSet(),
      tx.auxiliaryData(),
    ).toCbor();

    expect(parseTxBuilderBody(patchedHex, utxos).outputs[0]).toEqual({
      address: ADDR2,
      amount: lovelace("3000000"),
      referenceScript: { code: nativeCbor, version: "Native" },
    });
  });

  it("parses a Plutus script input with a provided script, inline datum and total collateral", async () => {
    const { body } = await build((b) =>
      b
        .spendingPlutusScriptV3()
        .txIn(txHash("tx2"), 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue("")
        .txInScript(alwaysSucceedCbor)
        .txInCollateral(txHash("tx1"), 0)
        .setTotalCollateral("5000000")
        .changeAddress(ADDR),
    );
    expect(body.inputs).toEqual([
      {
        type: "Script",
        txIn: {
          txHash: txHash("tx2"),
          txIndex: 0,
          amount: lovelace("100000000"),
          address: scriptAddr,
        },
        scriptTxIn: {
          scriptSource: {
            type: "Provided",
            script: { code: alwaysSucceedCbor, version: "V3" },
          },
          datumSource: { type: "Inline", txHash: txHash("tx2"), txIndex: 0 },
          redeemer: REDEEMER,
        },
      },
    ]);
    expect(body.collaterals).toEqual([
      {
        type: "PubKey",
        txIn: {
          txHash: txHash("tx1"),
          txIndex: 0,
          amount: lovelace("100000000"),
          address: ADDR,
        },
      },
    ]);
    expect(body.totalCollateral).toBe("5000000");
    expect(body.collateralReturnAddress).toBe(ADDR);
    expect(body.referenceInputs).toEqual([]);
  });

  it("parses a Plutus script input spent with a reference script", async () => {
    const { body } = await build((b) =>
      b
        .spendingPlutusScriptV3()
        .txIn(txHash("tx2"), 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue("")
        .spendingTxInReference(txHash("tx3"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect((body.inputs[0] as ScriptTxIn).scriptTxIn).toEqual({
      scriptSource: {
        type: "Inline",
        txHash: txHash("tx3"),
        txIndex: 0,
        scriptHash: alwaysSucceedHash,
        version: "V3",
        scriptSize: String(plutusRef.length / 2),
      },
      datumSource: { type: "Inline", txHash: txHash("tx2"), txIndex: 0 },
      redeemer: REDEEMER,
    });
    expect(body.referenceInputs).toEqual([
      { txHash: txHash("tx3"), txIndex: 0, scriptSize: plutusRef.length / 2 },
    ]);
  });

  it("parses a tag 24 wrapped reference script and a datum provided in the witness set", async () => {
    const { body } = await build((b) =>
      b
        .spendingPlutusScriptV3()
        .txIn(txHash("tx8"), 0)
        .txInDatumValue("d87980", "CBOR")
        .txInRedeemerValue("")
        .spendingTxInReference(txHash("tx11"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect((body.inputs[0] as ScriptTxIn).scriptTxIn).toEqual({
      scriptSource: {
        type: "Inline",
        txHash: txHash("tx11"),
        txIndex: 0,
        scriptHash: alwaysSucceedHash,
        version: "V3",
        scriptSize: String(tag24Ref.length / 2),
      },
      datumSource: {
        type: "Provided",
        data: { type: "CBOR", content: "d87980" },
      },
      redeemer: REDEEMER,
    });
    expect(body.referenceInputs).toEqual([
      { txHash: txHash("tx11"), txIndex: 0, scriptSize: tag24Ref.length / 2 },
    ]);
  });

  it("reports an output datum that a spent input already provides as a hash, not embedded", async () => {
    const { txHex, body, parser } = await build((b) =>
      b
        .spendingPlutusScriptV3()
        .txIn(txHash("tx8"), 0)
        .txInDatumValue("d87980", "CBOR")
        .txInRedeemerValue("")
        .txInScript(alwaysSucceedCbor)
        .txOut(scriptAddr, lovelace("2000000"))
        .txOutDatumHashValue("d87980", "CBOR")
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(body.outputs[0]!.datum).toEqual({
      type: "Hash",
      data: { type: "CBOR", content: "d87980" },
    });
    const witnessDatums = (hex: string) =>
      Transaction.fromCbor(TxCBOR(hex)).witnessSet().plutusData()?.values()
        .length ?? 0;
    expect(witnessDatums(txHex)).toBe(1);
    const { fee, ...withoutChange } = parser.getBuilderBodyWithoutChange();
    expect(witnessDatums(await txBuilder().complete(withoutChange))).toBe(1);
  });

  it("matches spend redeemers to inputs by their ledger order", async () => {
    const { body } = await build((b) =>
      b
        .spendingPlutusScriptV3()
        .txIn(txHash("tx2"), 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue("")
        .spendingTxInReference(txHash("tx3"), 0)
        .spendingPlutusScriptV3()
        .txIn(txHash("tx4"), 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue("")
        .spendingTxInReference(txHash("tx3"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(body.inputs.map((input) => input.txIn.txHash)).toEqual(
      [txHash("tx2"), txHash("tx4")].sort(),
    );
    for (const input of body.inputs) {
      expect(input.type).toBe("Script");
      expect((input as ScriptTxIn).scriptTxIn.redeemer).toEqual(REDEEMER);
      expect((input as ScriptTxIn).scriptTxIn.scriptSource?.type).toBe(
        "Inline",
      );
    }
    expect(body.referenceInputs).toEqual([
      { txHash: txHash("tx3"), txIndex: 0, scriptSize: plutusRef.length / 2 },
    ]);
  });

  it("parses a native script input with a provided script", async () => {
    const { body } = await build((b) =>
      b
        .txIn(txHash("tx5"), 0)
        .txInScript(nativeCbor)
        .txIn(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(
      body.inputs.find((input) => input.txIn.txHash === txHash("tx5")),
    ).toEqual({
      type: "SimpleScript",
      txIn: {
        txHash: txHash("tx5"),
        txIndex: 0,
        amount: lovelace("50000000"),
        address: nativeAddr,
      },
      simpleScriptTxIn: {
        scriptSource: { type: "Provided", scriptCode: nativeCbor },
      },
    });
  });

  it("parses a native script input spent with a reference script", async () => {
    const { body } = await build((b) =>
      b
        .txIn(txHash("tx7"), 0)
        .simpleScriptTxInReference(
          txHash("tx6"),
          0,
          nativeHash,
          String(nativeRef.length / 2),
        )
        .txIn(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(
      body.inputs.find((input) => input.txIn.txHash === txHash("tx7")),
    ).toEqual({
      type: "SimpleScript",
      txIn: {
        txHash: txHash("tx7"),
        txIndex: 0,
        amount: lovelace("50000000"),
        address: nativeAddr,
      },
      simpleScriptTxIn: {
        scriptSource: {
          type: "Inline",
          txHash: txHash("tx6"),
          txIndex: 0,
          simpleScriptHash: nativeHash,
          scriptSize: String(nativeRef.length / 2),
        },
      },
    });
    expect(body.referenceInputs).toEqual([
      { txHash: txHash("tx6"), txIndex: 0, scriptSize: nativeRef.length / 2 },
    ]);
  });

  it("parses Plutus and native mints and burns, grouped by policy", async () => {
    const { body } = await build((b) =>
      b
        .mint("1", nativeHash, "6e6174697665")
        .mintingScript(nativeCbor)
        .mintPlutusScriptV3()
        .mint("-5", alwaysSucceedHash, "60")
        .mintRedeemerValue("")
        .mintingScript(alwaysSucceedCbor)
        .txIn(txHash("tx9"), 1)
        .txIn(txHash("tx1"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    // policies in their sorted order, which is the order mint redeemers refer to
    expect(body.mints).toEqual([
      {
        type: "Plutus",
        policyId: alwaysSucceedHash,
        mintValue: [{ assetName: "60", amount: "-5" }],
        redeemer: REDEEMER,
        scriptSource: {
          type: "Provided",
          script: { code: alwaysSucceedCbor, version: "V3" },
        },
      },
      {
        type: "Native",
        policyId: nativeHash,
        mintValue: [{ assetName: "6e6174697665", amount: "1" }],
        scriptSource: { type: "Provided", scriptCode: nativeCbor },
      },
    ]);
  });

  it("parses several assets of one policy minted with a reference script", async () => {
    const { body } = await build((b) =>
      b
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
        .changeAddress(ADDR),
    );
    expect(body.mints).toEqual([
      {
        type: "Plutus",
        policyId: alwaysSucceedHash,
        mintValue: [
          { assetName: "60", amount: "1" },
          { assetName: "61", amount: "1" },
        ],
        redeemer: REDEEMER,
        scriptSource: {
          type: "Inline",
          txHash: txHash("tx3"),
          txIndex: 0,
          scriptHash: alwaysSucceedHash,
          version: "V3",
          scriptSize: String(plutusRef.length / 2),
        },
      },
    ]);
  });

  it("parses a Plutus script withdrawal with a provided script", async () => {
    const { body } = await build((b) =>
      b
        .withdrawalPlutusScriptV3()
        .withdrawal(scriptStake, "0")
        .withdrawalScript(alwaysSucceedCbor)
        .withdrawalRedeemerValue("")
        .txIn(txHash("tx1"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(body.withdrawals).toEqual([
      {
        type: "ScriptWithdrawal",
        address: scriptStake,
        coin: "0",
        scriptSource: {
          type: "Provided",
          script: { code: alwaysSucceedCbor, version: "V3" },
        },
        redeemer: REDEEMER,
      },
    ]);
  });

  it("parses a Plutus script withdrawal with a reference script", async () => {
    const { body } = await build((b) =>
      b
        .withdrawalPlutusScriptV3()
        .withdrawal(scriptStake, "0")
        .withdrawalRedeemerValue("")
        .withdrawalTxInReference(txHash("tx3"), 0)
        .txIn(txHash("tx1"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(body.withdrawals).toEqual([
      {
        type: "ScriptWithdrawal",
        address: scriptStake,
        coin: "0",
        scriptSource: {
          type: "Inline",
          txHash: txHash("tx3"),
          txIndex: 0,
          scriptHash: alwaysSucceedHash,
          version: "V3",
          scriptSize: String(plutusRef.length / 2),
        },
        redeemer: REDEEMER,
      },
    ]);
  });

  it("parses pub key and native script withdrawals in ledger order, script credentials first", async () => {
    const { body } = await build((b) =>
      b
        .withdrawal(keyStake, "1000000")
        .withdrawal(nativeStake, "0")
        .withdrawalScript(nativeCbor)
        .txIn(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(body.withdrawals).toEqual([
      {
        type: "SimpleScriptWithdrawal",
        address: nativeStake,
        coin: "0",
        scriptSource: { type: "Provided", scriptCode: nativeCbor },
      },
      { type: "PubKeyWithdrawal", address: keyStake, coin: "1000000" },
    ]);
  });

  it("matches reward redeemers to withdrawals in ledger order", async () => {
    const { body } = await build((b) =>
      b
        .withdrawal(keyStake, "1000000")
        .withdrawalPlutusScriptV3()
        .withdrawal(scriptStake, "0")
        .withdrawalScript(alwaysSucceedCbor)
        .withdrawalRedeemerValue("")
        .txIn(txHash("tx1"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(body.withdrawals).toEqual([
      {
        type: "ScriptWithdrawal",
        address: scriptStake,
        coin: "0",
        scriptSource: {
          type: "Provided",
          script: { code: alwaysSucceedCbor, version: "V3" },
        },
        redeemer: REDEEMER,
      },
      { type: "PubKeyWithdrawal", address: keyStake, coin: "1000000" },
    ]);
  });

  it("parses certificates witnessed by keys", async () => {
    const { body } = await build((b) =>
      b
        .registerStakeCertificate(keyStake)
        .delegateStakeCertificate(keyStake, POOL_B32)
        .deregisterStakeCertificate(keyStake2)
        .retirePoolCertificate(POOL_HEX, 500)
        .drepRegistrationCertificate(
          DRepID.cip105FromCredential(keyCredential(keyHashHex(1))),
          anchor,
          "500000000",
        )
        .drepUpdateCertificate(keyDrep2, anchor)
        .drepDeregistrationCertificate(scriptDrep, "500000000")
        .voteDelegationCertificate({ dRepId: keyDrep2 }, keyStake)
        .voteDelegationCertificate({ alwaysNoConfidence: null }, keyStake2)
        .voteDelegationCertificate({ alwaysAbstain: null }, keyStake)
        .txIn(txHash("tx10"), 0)
        .changeAddress(ADDR),
    );
    expect(body.certificates).toEqual([
      {
        type: "BasicCertificate",
        certType: { type: "RegisterStake", stakeKeyAddress: keyStake },
      },
      {
        type: "BasicCertificate",
        certType: {
          type: "DelegateStake",
          stakeKeyAddress: keyStake,
          poolId: POOL_HEX,
        },
      },
      {
        type: "BasicCertificate",
        certType: { type: "DeregisterStake", stakeKeyAddress: keyStake2 },
      },
      {
        type: "BasicCertificate",
        certType: { type: "RetirePool", poolId: POOL_HEX, epoch: 500 },
      },
      {
        type: "BasicCertificate",
        certType: {
          type: "DRepRegistration",
          drepId: keyDrep1,
          coin: 500000000,
          anchor,
        },
      },
      {
        type: "BasicCertificate",
        certType: { type: "DRepUpdate", drepId: keyDrep2, anchor },
      },
      {
        type: "BasicCertificate",
        certType: {
          type: "DRepDeregistration",
          drepId: scriptDrep,
          coin: 500000000,
        },
      },
      {
        type: "BasicCertificate",
        certType: {
          type: "VoteDelegation",
          stakeKeyAddress: keyStake,
          drep: { dRepId: keyDrep2 },
        },
      },
      {
        type: "BasicCertificate",
        certType: {
          type: "VoteDelegation",
          stakeKeyAddress: keyStake2,
          drep: { alwaysNoConfidence: null },
        },
      },
      {
        type: "BasicCertificate",
        certType: {
          type: "VoteDelegation",
          stakeKeyAddress: keyStake,
          drep: { alwaysAbstain: null },
        },
      },
    ]);
  });

  it("parses a Plutus script certificate with a provided script", async () => {
    const { body } = await build((b) =>
      b
        .voteDelegationCertificate({ alwaysAbstain: null }, scriptStake)
        .certificateScript(alwaysSucceedCbor, "V3")
        .certificateRedeemerValue("")
        .txIn(txHash("tx1"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(body.certificates).toEqual([
      {
        type: "ScriptCertificate",
        certType: {
          type: "VoteDelegation",
          stakeKeyAddress: scriptStake,
          drep: { alwaysAbstain: null },
        },
        redeemer: REDEEMER,
        scriptSource: {
          type: "Provided",
          script: { code: alwaysSucceedCbor, version: "V3" },
        },
      },
    ]);
  });

  it("parses Plutus script certificates with reference scripts", async () => {
    const { body } = await build((b) =>
      b
        .voteDelegationCertificate({ alwaysAbstain: null }, scriptStake)
        .certificateTxInReference(txHash("tx3"), 0, undefined, undefined, "V3")
        .certificateRedeemerValue("")
        .delegateStakeCertificate(scriptStake, POOL_HEX)
        .certificateTxInReference(txHash("tx3"), 0, undefined, undefined, "V3")
        .certificateRedeemerValue("")
        .txIn(txHash("tx1"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    const scriptSource = {
      type: "Inline",
      txHash: txHash("tx3"),
      txIndex: 0,
      scriptHash: alwaysSucceedHash,
      version: "V3",
      scriptSize: String(plutusRef.length / 2),
    };
    expect(body.certificates).toEqual([
      {
        type: "ScriptCertificate",
        certType: {
          type: "VoteDelegation",
          stakeKeyAddress: scriptStake,
          drep: { alwaysAbstain: null },
        },
        redeemer: REDEEMER,
        scriptSource,
      },
      {
        type: "ScriptCertificate",
        certType: {
          type: "DelegateStake",
          stakeKeyAddress: scriptStake,
          poolId: POOL_HEX,
        },
        redeemer: REDEEMER,
        scriptSource,
      },
    ]);
  });

  it("parses native script certificates with a provided script", async () => {
    const { body } = await build((b) =>
      b
        .registerStakeCertificate(nativeStake)
        .delegateStakeCertificate(nativeStake, POOL_B32)
        .certificateScript(nativeCbor)
        .txIn(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(body.certificates).toEqual([
      {
        type: "SimpleScriptCertificate",
        certType: { type: "RegisterStake", stakeKeyAddress: nativeStake },
        simpleScriptSource: { type: "Provided", scriptCode: nativeCbor },
      },
      {
        type: "SimpleScriptCertificate",
        certType: {
          type: "DelegateStake",
          stakeKeyAddress: nativeStake,
          poolId: POOL_HEX,
        },
        simpleScriptSource: { type: "Provided", scriptCode: nativeCbor },
      },
    ]);
  });

  it("parses a native script certificate with a reference script", async () => {
    const { body } = await build((b) =>
      b
        .deregisterStakeCertificate(nativeStake)
        .certificateTxInReference(
          txHash("tx6"),
          0,
          String(nativeRef.length / 2),
          nativeHash,
        )
        .txIn(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(body.certificates).toEqual([
      {
        type: "SimpleScriptCertificate",
        certType: { type: "DeregisterStake", stakeKeyAddress: nativeStake },
        simpleScriptSource: {
          type: "Inline",
          txHash: txHash("tx6"),
          txIndex: 0,
          simpleScriptHash: nativeHash,
          scriptSize: String(nativeRef.length / 2),
        },
      },
    ]);
  });

  it("parses a pool registration certificate back to the same pool params", async () => {
    const poolParams = {
      vrfKeyHash: vrfHex(1),
      operator: keyHashHex(1),
      pledge: "1000000",
      cost: "340000000",
      margin: [1, 10] as [number, number],
      relays: [
        { type: "SingleHostAddr" as const, IPV4: "127.0.0.1", port: 3001 },
        {
          type: "SingleHostName" as const,
          domainName: "relay.example.com",
          port: 3002,
        },
        { type: "MultiHostName" as const, domainName: "relays.example.com" },
      ],
      owners: [keyHashHex(2), keyHashHex(3)],
      rewardAddress: keyStake,
      metadata: { URL: "https://example.com/pool.json", hash: "cd".repeat(32) },
    };
    const { body } = await build((b) =>
      b
        .registerPoolCertificate(poolParams)
        .txIn(txHash("tx10"), 0)
        .changeAddress(ADDR),
    );
    expect(body.certificates).toEqual([
      {
        type: "BasicCertificate",
        certType: { type: "RegisterPool", poolParams },
      },
    ]);
  });

  it("parses votes of every voter kind", async () => {
    const { body } = await build((b) =>
      b
        .vote(
          {
            type: "DRep",
            drepId: DRepID.cip105FromCredential(keyCredential(keyHashHex(1))),
          },
          GOV,
          { voteKind: "No", anchor },
        )
        .vote({ type: "StakingPool", keyHash: keyHashHex(1) }, GOV, {
          voteKind: "Abstain",
        })
        .vote(
          {
            type: "ConstitutionalCommittee",
            hotCred: { type: "KeyHash", keyHash: keyHashHex(2) },
          },
          GOV,
          { voteKind: "Yes" },
        )
        .vote(
          {
            type: "ConstitutionalCommittee",
            hotCred: { type: "ScriptHash", scriptHash: nativeHash },
          },
          GOV,
          { voteKind: "Yes" },
        )
        .voteScript(nativeCbor)
        .txIn(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    // voters come back in the order of the voting procedures of the transaction
    expect(body.votes).toEqual([
      {
        type: "SimpleScriptVote",
        vote: {
          voter: {
            type: "ConstitutionalCommittee",
            hotCred: { type: "ScriptHash", scriptHash: nativeHash },
          },
          govActionId: GOV,
          votingProcedure: { voteKind: "Yes" },
        },
        simpleScriptSource: { type: "Provided", scriptCode: nativeCbor },
      },
      {
        type: "BasicVote",
        vote: {
          voter: {
            type: "ConstitutionalCommittee",
            hotCred: { type: "KeyHash", keyHash: keyHashHex(2) },
          },
          govActionId: GOV,
          votingProcedure: { voteKind: "Yes" },
        },
      },
      {
        type: "BasicVote",
        vote: {
          voter: { type: "DRep", drepId: keyDrep1 },
          govActionId: GOV,
          votingProcedure: { voteKind: "No", anchor },
        },
      },
      {
        type: "BasicVote",
        vote: {
          voter: { type: "StakingPool", keyHash: keyHashHex(1) },
          govActionId: GOV,
          votingProcedure: { voteKind: "Abstain" },
        },
      },
    ]);
  });

  it("parses Plutus script votes on several governance actions", async () => {
    const { body } = await build((b) =>
      b
        .votePlutusScriptV3()
        .vote({ type: "DRep", drepId: scriptDrep }, GOV, {
          voteKind: "No",
          anchor,
        })
        .voteScript(alwaysSucceedCbor)
        .voteRedeemerValue("")
        .votePlutusScriptV3()
        .vote({ type: "DRep", drepId: scriptDrep }, GOV2, {
          voteKind: "Abstain",
        })
        .voteScript(alwaysSucceedCbor)
        .voteRedeemerValue("")
        .txIn(txHash("tx1"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    const scriptSource = {
      type: "Provided",
      script: { code: alwaysSucceedCbor, version: "V3" },
    };
    expect(body.votes).toEqual([
      {
        type: "ScriptVote",
        vote: {
          voter: { type: "DRep", drepId: scriptDrep },
          govActionId: GOV,
          votingProcedure: { voteKind: "No", anchor },
        },
        redeemer: REDEEMER,
        scriptSource,
      },
      {
        type: "ScriptVote",
        vote: {
          voter: { type: "DRep", drepId: scriptDrep },
          govActionId: GOV2,
          votingProcedure: { voteKind: "Abstain" },
        },
        redeemer: REDEEMER,
        scriptSource,
      },
    ]);
  });

  it("matches voting redeemers to voters in ledger order, whatever the encoding order", async () => {
    const { txHex } = await build((b) =>
      b
        .vote({ type: "StakingPool", keyHash: keyHashHex(1) }, GOV, {
          voteKind: "Abstain",
        })
        .votePlutusScriptV3()
        .vote({ type: "DRep", drepId: scriptDrep }, GOV, { voteKind: "Yes" })
        .voteScript(alwaysSucceedCbor)
        .voteRedeemerValue("")
        .txIn(txHash("tx1"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    // Re-encode the voting procedures with the pool voter first: the ledger still orders
    // the DRep voter first, so its redeemer keeps index 0
    const tx = Transaction.fromCbor(TxCBOR(txHex));
    const txBody = tx.body();
    const reversed = Serialization.VotingProcedures.fromCore(
      txBody.votingProcedures()!.toCore().reverse(),
    );
    expect(reversed.getVoters()[0]!.kind()).toBe(
      Serialization.VoterKind.StakePoolKeyHash,
    );
    txBody.setVotingProcedures(reversed);
    const patchedHex = new Transaction(
      txBody,
      tx.witnessSet(),
      tx.auxiliaryData(),
    ).toCbor();

    expect(parseTxBuilderBody(patchedHex, utxos).votes).toEqual([
      {
        type: "ScriptVote",
        vote: {
          voter: { type: "DRep", drepId: scriptDrep },
          govActionId: GOV,
          votingProcedure: { voteKind: "Yes" },
        },
        redeemer: REDEEMER,
        scriptSource: {
          type: "Provided",
          script: { code: alwaysSucceedCbor, version: "V3" },
        },
      },
      {
        type: "BasicVote",
        vote: {
          voter: { type: "StakingPool", keyHash: keyHashHex(1) },
          govActionId: GOV,
          votingProcedure: { voteKind: "Abstain" },
        },
      },
    ]);
  });

  it("parses Plutus script votes with a reference script next to native script votes", async () => {
    const { body } = await build((b) =>
      b
        .votePlutusScriptV3()
        .vote({ type: "DRep", drepId: scriptDrep }, GOV, { voteKind: "Yes" })
        .voteTxInReference(txHash("tx3"), 0)
        .voteRedeemerValue("")
        .vote({ type: "DRep", drepId: nativeDrep }, GOV, { voteKind: "Yes" })
        .voteScript(nativeCbor)
        .txIn(txHash("tx1"), 0)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(body.votes).toHaveLength(2);
    expect(body.votes).toEqual(
      expect.arrayContaining([
        {
          type: "ScriptVote",
          vote: {
            voter: { type: "DRep", drepId: scriptDrep },
            govActionId: GOV,
            votingProcedure: { voteKind: "Yes" },
          },
          redeemer: REDEEMER,
          scriptSource: {
            type: "Inline",
            txHash: txHash("tx3"),
            txIndex: 0,
            scriptHash: alwaysSucceedHash,
            version: "V3",
            scriptSize: String(plutusRef.length / 2),
          },
        },
        {
          type: "SimpleScriptVote",
          vote: {
            voter: { type: "DRep", drepId: nativeDrep },
            govActionId: GOV,
            votingProcedure: { voteKind: "Yes" },
          },
          simpleScriptSource: { type: "Provided", scriptCode: nativeCbor },
        },
      ]),
    );
  });

  it("parses donation, collateral return and renders stake addresses for the network of the transaction", async () => {
    const { body } = await build((b) =>
      b
        .spendingPlutusScriptV3()
        .txIn(txHash("tx2"), 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue("")
        .txInScript(alwaysSucceedCbor)
        .txInCollateral(txHash("tx1"), 0)
        .setTotalCollateral("5000000")
        .setCollateralReturnAddress(ADDR2)
        .setDonation("1000000")
        .setNetwork("preprod")
        .registerStakeCertificate(keyStake)
        .changeAddress(ADDR),
    );
    expect(body.totalCollateral).toBe("5000000");
    expect(body.collateralReturnAddress).toBe(ADDR2);
    expect(body.donation).toBe("1000000");
    expect(keyStake.startsWith("stake_test1")).toBe(true);
    expect(body.certificates).toEqual([
      {
        type: "BasicCertificate",
        certType: { type: "RegisterStake", stakeKeyAddress: keyStake },
      },
    ]);
  });

  it("infers the network from the resolved inputs when the body has no outputs", async () => {
    const { txHex } = await build((b) =>
      b
        .registerStakeCertificate(keyStake)
        .txIn(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    const tx = Transaction.fromCbor(TxCBOR(txHex));
    const txBody = tx.body();
    txBody.setOutputs([]);
    const patchedHex = new Transaction(
      txBody,
      tx.witnessSet(),
      tx.auxiliaryData(),
    ).toCbor();
    expect(parseTxBuilderBody(patchedHex, utxos).certificates).toEqual([
      {
        type: "BasicCertificate",
        certType: { type: "RegisterStake", stakeKeyAddress: keyStake },
      },
    ]);
  });

  it("throws when the UTxO of an input or collateral is not resolved", async () => {
    const { txHex } = await build((b) =>
      b
        .spendingPlutusScriptV3()
        .txIn(txHash("tx2"), 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue("")
        .txInScript(alwaysSucceedCbor)
        .txInCollateral(txHash("tx1"), 0)
        .changeAddress(ADDR),
    );
    expect(() => parseTxBuilderBody(txHex, [])).toThrow(
      `Cannot parse transaction: the input UTxO ${txHash("tx2")}#0 was not found in the resolved UTxOs`,
    );
    expect(() =>
      parseTxBuilderBody(
        txHex,
        utxos.filter((u) => u.input.txHash !== txHash("tx1")),
      ),
    ).toThrow(
      `Cannot parse transaction: the collateral UTxO ${txHash("tx1")}#0 was not found in the resolved UTxOs`,
    );
  });

  it("exposes the parsed body, the body without change output and a tester", async () => {
    const { txHex, parser, body } = await build((b) =>
      b
        .txIn(txHash("tx1"), 0)
        .txOut(ADDR2, lovelace("5000000"))
        .requiredSignerHash(keyHashHex(1))
        .changeAddress(ADDR),
    );
    expect(body).toEqual(parseTxBuilderBody(txHex, utxos));
    expect(body.outputs).toHaveLength(2);

    const withoutChange = parser.getBuilderBodyWithoutChange();
    expect(withoutChange.outputs).toEqual([
      { address: ADDR2, amount: lovelace("5000000") },
    ]);
    expect(withoutChange.inputs).toEqual(body.inputs);
    expect(parser.getBuilderBody().outputs).toHaveLength(2);

    const tester = parser.toTester();
    expect(tester).toBeInstanceOf(TxTester);
    expect(
      tester
        .keySigned(keyHashHex(1))
        .outputsAt(ADDR2)
        .outputsValue(MeshValue.fromAssets(lovelace("5000000")))
        .success(),
    ).toBe(true);
  });

  describe("proposals", () => {
    const propose = (governanceAction: GovernanceAction) =>
      build((b) =>
        b
          .proposal(governanceAction, anchor, keyStake, "1000000")
          .txIn(txHash("tx10"), 0)
          .changeAddress(ADDR),
      );
    const basic = (governanceAction: GovernanceAction) => [
      {
        type: "BasicProposal",
        proposalType: {
          governanceAction,
          anchor,
          rewardAccount: keyStake,
          deposit: "1000000",
        },
      },
    ];

    it("parses info, no confidence and hard fork proposals", async () => {
      const info: GovernanceAction = { kind: "InfoAction", action: {} };
      expect((await propose(info)).body.proposals).toEqual(basic(info));

      const noConfidence: GovernanceAction = {
        kind: "NoConfidenceAction",
        action: {
          govActionId: { transactionId: txHash("tx100"), govActionIndex: 2 },
        },
      };
      expect((await propose(noConfidence)).body.proposals).toEqual(
        basic(noConfidence),
      );

      const hardFork: GovernanceAction = {
        kind: "HardForkInitiationAction",
        action: { protocolVersion: { major: 11, minor: 0 } },
      };
      expect((await propose(hardFork)).body.proposals).toEqual(basic(hardFork));
    });

    it("parses treasury withdrawal, committee update and new constitution proposals", async () => {
      const treasury: GovernanceAction = {
        kind: "TreasuryWithdrawalsAction",
        action: {
          withdrawals: { [keyStake]: "1000000", [keyStake2]: "2000000" },
          policyHash: { bytes: alwaysSucceedHash },
        },
      };
      expect((await propose(treasury)).body.proposals).toEqual(basic(treasury));

      const committee: GovernanceAction = {
        kind: "UpdateCommitteeAction",
        action: {
          govActionId: { transactionId: txHash("tx100"), govActionIndex: 0 },
          committee: {
            members: [
              {
                stakeCredential: { type: "ScriptHash", scriptHash: nativeHash },
                termLimit: 300,
              },
            ],
            quorumThreshold: { numerator: "2", denominator: "3" },
          },
          membersToRemove: [{ type: "KeyHash", keyHash: keyHashHex(6) }],
        },
      };
      expect((await propose(committee)).body.proposals).toEqual(
        basic(committee),
      );

      const constitution: GovernanceAction = {
        kind: "NewConstitutionAction",
        action: {
          constitution: { anchor, scriptHash: { bytes: alwaysSucceedHash } },
        },
      };
      expect((await propose(constitution)).body.proposals).toEqual(
        basic(constitution),
      );
    });

    it("parses a parameter change proposal back to the same protocol parameter update", async () => {
      const protocolParamUpdates: ProtocolParamUpdate = {
        minFeeA: "44",
        minFeeB: "155381",
        maxBlockBodySize: 90112,
        maxTxSize: 16384,
        maxBlockHeaderSize: 1100,
        keyDeposit: "2000000",
        poolDeposit: "500000000",
        maxEpoch: 18,
        nOpt: 500,
        poolPledgeInfluence: { numerator: "3", denominator: "10" },
        expansionRate: { numerator: "3", denominator: "1000" },
        treasuryGrowthRate: { numerator: "1", denominator: "5" },
        minPoolCost: "170000000",
        adaPerUtxoByte: "4310",
        costModels: { V1: [1, 2, 3], V2: [4, 5], V3: [6] },
        executionCosts: {
          memPrice: { numerator: "577", denominator: "10000" },
          stepPrice: { numerator: "721", denominator: "10000000" },
        },
        maxTxExUnits: { mem: "14000000", steps: "10000000000" },
        maxBlockExUnits: { mem: "62000000", steps: "20000000000" },
        maxValueSize: 5000,
        collateralPercentage: 150,
        maxCollateralInputs: 3,
        poolVotingThresholds: {
          motionNoConfidence: { numerator: "51", denominator: "100" },
          committeeNormal: { numerator: "51", denominator: "100" },
          committeeNoConfidence: { numerator: "51", denominator: "100" },
          hardForkInitiation: { numerator: "51", denominator: "100" },
          ppSecurityGroup: { numerator: "51", denominator: "100" },
        },
        drepVotingThresholds: {
          motionNoConfidence: { numerator: "67", denominator: "100" },
          committeeNormal: { numerator: "67", denominator: "100" },
          committeeNoConfidence: { numerator: "3", denominator: "5" },
          updateConstitution: { numerator: "3", denominator: "4" },
          hardForkInitiation: { numerator: "3", denominator: "5" },
          ppNetworkGroup: { numerator: "67", denominator: "100" },
          ppEconomicGroup: { numerator: "67", denominator: "100" },
          ppTechnicalGroup: { numerator: "67", denominator: "100" },
          ppGovGroup: { numerator: "3", denominator: "4" },
          treasuryWithdrawal: { numerator: "67", denominator: "100" },
        },
        minCommitteeSize: 7,
        committeeTermLimit: 146,
        govActionValidityPeriod: 6,
        govActionDeposit: "100000000000",
        drepDeposit: "500000000",
        drepInactivityPeriod: 20,
        refScriptCostPerByte: { numerator: "15", denominator: "1" },
      };
      const change: GovernanceAction = {
        kind: "ParameterChangeAction",
        action: {
          govActionId: { transactionId: txHash("tx100"), govActionIndex: 1 },
          protocolParamUpdates,
        },
      };
      expect((await propose(change)).body.proposals).toEqual(basic(change));
    });

    it("parses a proposal witnessed by a guardrails script", async () => {
      const change: GovernanceAction = {
        kind: "ParameterChangeAction",
        action: {
          protocolParamUpdates: { minFeeA: "45" },
          policyHash: { bytes: alwaysSucceedHash },
        },
      };
      const { body } = await build((b) =>
        b
          .proposal(change, anchor, keyStake, "1000000")
          .proposalScript(alwaysSucceedCbor, "V3")
          .proposalRedeemerValue("")
          .txIn(txHash("tx10"), 0)
          .txInCollateral(txHash("tx1"), 0)
          .changeAddress(ADDR),
      );
      expect(body.proposals).toEqual([
        {
          type: "ScriptProposal",
          proposalType: {
            governanceAction: change,
            anchor,
            rewardAccount: keyStake,
            deposit: "1000000",
          },
          redeemer: REDEEMER,
          scriptSource: {
            type: "Provided",
            script: { code: alwaysSucceedCbor, version: "V3" },
          },
        },
      ]);
    });
  });

  it("starts with an empty body before anything is parsed", () => {
    const parser = new CardanoSDKSerializer().parser;
    expect(parser.getBuilderBody().inputs).toEqual([]);
    expect(parser.getBuilderBodyWithoutChange().outputs).toEqual([]);
  });

  describe("round trip", () => {
    /** The builder annotates the inputs it is given with `scriptSize`; drop it before comparing */
    const stripScriptSizes = (body: MeshTxBuilderBody): MeshTxBuilderBody => ({
      ...body,
      inputs: body.inputs.map((input) => {
        const { scriptSize, ...txIn } = input.txIn;
        return { ...input, txIn } as TxIn;
      }),
      collaterals: body.collaterals.map((input) => {
        const { scriptSize, ...txIn } = input.txIn;
        return { ...input, txIn };
      }),
    });

    const rebuild = async (
      configure: (builder: MeshTxBuilder) => MeshTxBuilder,
    ) => {
      const { parser, body } = await build(configure);
      // the builder takes any non-empty fee as a fixed fee, so let it compute the fee again
      const { fee, ...withoutChange } = parser.getBuilderBodyWithoutChange();
      const rebuiltHex = await txBuilder().complete(withoutChange);
      return {
        body: stripScriptSizes(body),
        rebuilt: stripScriptSizes(parseTxBuilderBody(rebuiltHex, utxos)),
      };
    };

    it("rebuilds the same transaction body from the parsed certificates", async () => {
      const { body, rebuilt } = await rebuild((b) =>
        b
          .registerStakeCertificate(keyStake)
          .delegateStakeCertificate(keyStake, POOL_B32)
          .voteDelegationCertificate({ alwaysAbstain: null }, keyStake)
          .txIn(txHash("tx10"), 0)
          .changeAddress(ADDR),
      );
      expect(rebuilt).toEqual(body);
    });

    it("rebuilds the same transaction body from a parsed script spend", async () => {
      const { body, rebuilt } = await rebuild((b) =>
        b
          .spendingPlutusScriptV3()
          .txIn(txHash("tx2"), 0)
          .txInInlineDatumPresent()
          .txInRedeemerValue("")
          .spendingTxInReference(txHash("tx3"), 0)
          .txInCollateral(txHash("tx1"), 0)
          .txOut(ADDR2, lovelace("2000000"))
          .txOutInlineDatumValue("d8799f01ff", "CBOR")
          .metadataValue(674, ["round", "trip"])
          .changeAddress(ADDR),
      );
      expect(rebuilt).toEqual(body);
    });

    it("rebuilds the same transaction body from parsed votes and withdrawals", async () => {
      const { body, rebuilt } = await rebuild((b) =>
        b
          .withdrawal(keyStake, "1000000")
          .withdrawalPlutusScriptV3()
          .withdrawal(scriptStake, "0")
          .withdrawalScript(alwaysSucceedCbor)
          .withdrawalRedeemerValue("")
          .vote({ type: "StakingPool", keyHash: keyHashHex(1) }, GOV, {
            voteKind: "Abstain",
          })
          .votePlutusScriptV3()
          .vote({ type: "DRep", drepId: scriptDrep }, GOV, { voteKind: "Yes" })
          .voteScript(alwaysSucceedCbor)
          .voteRedeemerValue("")
          .votePlutusScriptV3()
          .vote({ type: "DRep", drepId: scriptDrep }, GOV2, { voteKind: "No" })
          .voteScript(alwaysSucceedCbor)
          .voteRedeemerValue("")
          .txIn(txHash("tx1"), 0)
          .txInCollateral(txHash("tx1"), 0)
          .changeAddress(ADDR),
      );
      expect(body.withdrawals).toHaveLength(2);
      expect(body.votes).toHaveLength(3);
      expect(rebuilt).toEqual(body);
    });
  });
});
