import { IFetcher, mConStr0, UTxO } from "@meshsdk/common";
import { resolveScriptRef, serializePlutusScript } from "@meshsdk/core";
import { OfflineFetcher } from "@meshsdk/provider";
import { MeshTxBuilder } from "@meshsdk/transaction";

import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  txHash,
} from "../test-util";

const lovelace = (quantity: string) => [{ unit: "lovelace", quantity }];
const script = { code: alwaysSucceedCbor, version: "V3" as const };

/** A key-locked input, a locked script output, a reference script holder and a collateral */
const chain: UTxO[] = [
  {
    input: { txHash: txHash("tx1"), outputIndex: 0 },
    output: { address: baseAddress(0), amount: lovelace("30000000") },
  },
  {
    input: { txHash: txHash("tx2"), outputIndex: 1 },
    output: {
      address: serializePlutusScript(script).address,
      amount: lovelace("20000000"),
      plutusData: "d87980",
    },
  },
  {
    input: { txHash: txHash("tx3"), outputIndex: 2 },
    output: {
      address: baseAddress(1),
      amount: lovelace("30000000"),
      scriptRef: resolveScriptRef(script),
    },
  },
  {
    input: { txHash: txHash("tx4"), outputIndex: 0 },
    output: { address: baseAddress(2), amount: lovelace("10000000") },
  },
];

/** A builder over an offline fetcher holding `chain`, and its `fetchUTxOs` calls */
const builderOverChain = () => {
  const fetcher = new OfflineFetcher();
  fetcher.addUTxOs(chain);
  const fetchUTxOs = jest.spyOn(fetcher, "fetchUTxOs");
  const builder = new MeshTxBuilder({
    fetcher: fetcher as unknown as IFetcher,
    evaluator: null,
  });
  const hashesRead = () =>
    fetchUTxOs.mock.calls.map(([hash]) => hash as string).sort();
  return { builder, hashesRead };
};

describe("MeshTxBuilder", () => {
  describe("complete() reads what the body names by out ref alone", () => {
    it("reads the transaction of each input and of a spending script's reference", async () => {
      const { builder, hashesRead } = builderOverChain();
      await builder
        .txIn(txHash("tx1"), 0)
        .spendingPlutusScriptV3()
        .txIn(txHash("tx2"), 1)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]))
        .spendingTxInReference(txHash("tx3"), 2)
        .txInCollateral(txHash("tx4"), 0)
        .changeAddress(baseAddress(0))
        .complete();

      expect(hashesRead()).toEqual(
        [txHash("tx1"), txHash("tx2"), txHash("tx3"), txHash("tx4")].sort(),
      );
    });

    it("reads the transaction of a minting script's reference", async () => {
      const { builder, hashesRead } = builderOverChain();
      await builder
        .txIn(txHash("tx1"), 0)
        .mintPlutusScriptV3()
        .mint("100", alwaysSucceedHash, "61737365744e616d6531")
        .mintRedeemerValue(mConStr0([]))
        .mintTxInReference(txHash("tx3"), 2)
        .txInCollateral(txHash("tx4"), 0)
        .changeAddress(baseAddress(0))
        .complete();

      expect(hashesRead()).toContain(txHash("tx3"));
      expect(hashesRead()).toEqual(
        [txHash("tx1"), txHash("tx3"), txHash("tx4")].sort(),
      );
    });
  });
});
