import {
  IFetcher,
  mConStr0,
  NativeScript,
  ScriptSource,
  SimpleScriptSourceInfo,
  UTxO,
} from "@meshsdk/common";
import {
  resolveNativeScriptHash,
  resolveScriptRef,
  serializeNativeScript,
  serializePlutusScript,
} from "@meshsdk/core";
import { OfflineFetcher } from "@meshsdk/provider";
import { MeshTxBuilder } from "@meshsdk/transaction";

import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  txHash,
} from "../test-util";

const lovelace = (quantity: string) => [{ unit: "lovelace", quantity }];
const plutus = { code: alwaysSucceedCbor, version: "V3" as const };
const native: NativeScript = { type: "all", scripts: [] };
const nativeAddress = serializeNativeScript(native).address;

const chain: UTxO[] = [
  {
    input: { txHash: txHash("tx1"), outputIndex: 0 },
    output: { address: baseAddress(0), amount: lovelace("30000000") },
  },
  {
    input: { txHash: txHash("tx2"), outputIndex: 1 },
    output: {
      address: serializePlutusScript(plutus).address,
      amount: lovelace("20000000"),
      plutusData: "d87980",
    },
  },
  {
    input: { txHash: txHash("tx3"), outputIndex: 0 },
    output: { address: nativeAddress, amount: lovelace("20000000") },
  },
  {
    input: { txHash: txHash("tx4"), outputIndex: 0 },
    output: {
      address: baseAddress(1),
      amount: lovelace("20000000"),
      scriptRef: resolveScriptRef(native),
    },
  },
  {
    input: { txHash: txHash("tx5"), outputIndex: 0 },
    output: { address: baseAddress(2), amount: lovelace("10000000") },
  },
  {
    input: { txHash: txHash("tx6"), outputIndex: 0 },
    output: {
      address: baseAddress(3),
      amount: lovelace("20000000"),
      scriptRef: resolveScriptRef(plutus),
    },
  },
];

const builderOverChain = () => {
  const fetcher = new OfflineFetcher();
  fetcher.addUTxOs(chain);
  return new MeshTxBuilder({
    fetcher: fetcher as unknown as IFetcher,
    evaluator: null,
  });
};

/** Spends the script output of tx2, its script read from tx6 */
const spendPlutus = (builder: MeshTxBuilder, scriptTx = txHash("tx6")) =>
  builder
    .spendingPlutusScriptV3()
    .txIn(txHash("tx2"), 1)
    .txInInlineDatumPresent()
    .txInRedeemerValue(mConStr0([]))
    .spendingTxInReference(scriptTx, 0)
    .txInCollateral(txHash("tx5"), 0)
    .changeAddress(baseAddress(0));

/** Spends the native script output of tx3, its script read from tx4 */
const spendNative = (builder: MeshTxBuilder, scriptTx = txHash("tx4")) =>
  builder
    .txIn(txHash("tx3"), 0)
    .simpleScriptTxInReference(scriptTx, 0)
    .changeAddress(baseAddress(0));

describe("MeshTxBuilder", () => {
  describe("complete() fills the body from the outputs it reads", () => {
    it("fills an input's amount and address", async () => {
      const builder = builderOverChain();
      await builder
        .txIn(txHash("tx1"), 0)
        .changeAddress(baseAddress(0))
        .complete();
      expect(builder.meshTxBuilderBody.inputs[0]!.txIn).toMatchObject({
        amount: lovelace("30000000"),
        address: baseAddress(0),
      });
    });

    it("fills a Plutus reference script's hash and size", async () => {
      const builder = builderOverChain();
      await spendPlutus(builder).complete();
      const input = builder.meshTxBuilderBody.inputs.find(
        (i) => i.type === "Script",
      )!;
      expect(input.txIn).toMatchObject({
        amount: lovelace("20000000"),
        address: chain[1]!.output.address,
      });
      expect(
        (input.type === "Script" && input.scriptTxIn.scriptSource) as
          ScriptSource | false,
      ).toMatchObject({
        type: "Inline",
        txHash: txHash("tx6"),
        txIndex: 0,
        scriptHash: alwaysSucceedHash,
        scriptSize: (chain[5]!.output.scriptRef!.length / 2).toString(),
      });
    });

    it("fills a native reference script's hash and size", async () => {
      const builder = builderOverChain();
      await spendNative(builder).complete();
      const input = builder.meshTxBuilderBody.inputs.find(
        (i) => i.type === "SimpleScript",
      )!;
      expect(
        (input.type === "SimpleScript" &&
          input.simpleScriptTxIn.scriptSource) as
          SimpleScriptSourceInfo | false,
      ).toMatchObject({
        type: "Inline",
        simpleScriptHash: resolveNativeScriptHash(native),
        scriptSize: (chain[3]!.output.scriptRef!.length / 2).toString(),
      });
    });
  });

  describe("complete() fails on an output the fetcher does not have", () => {
    it("for an input: UTXO_NOT_FOUND", async () => {
      await expect(
        builderOverChain()
          .txIn(txHash("missing"), 0)
          .changeAddress(baseAddress(0))
          .complete(),
      ).rejects.toMatchObject({ code: "UTXO_NOT_FOUND" });
    });

    it("for a Plutus reference script: UTXO_NOT_FOUND", async () => {
      await expect(
        spendPlutus(builderOverChain(), txHash("missing")).complete(),
      ).rejects.toMatchObject({ code: "UTXO_NOT_FOUND" });
    });

    it("for a native reference script: UTXO_NOT_FOUND", async () => {
      await expect(
        spendNative(builderOverChain(), txHash("missing")).complete(),
      ).rejects.toMatchObject({ code: "UTXO_NOT_FOUND" });
    });
  });
});
