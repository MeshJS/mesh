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

describe("MeshTxBuilder", () => {
  it("should update incomplete txIns and mints", async () => {
    const lovelace = (quantity: string) => [{ unit: "lovelace", quantity }];
    const utxos: UTxO[] = [
      {
        input: { txHash: txHash("tx1"), outputIndex: 0 },
        output: { address: baseAddress(0), amount: lovelace("10000000") },
      },
      {
        input: { txHash: txHash("tx2"), outputIndex: 1 },
        output: { address: baseAddress(1), amount: lovelace("20000000") },
      },
      {
        input: { txHash: txHash("tx3"), outputIndex: 2 },
        output: {
          address: serializePlutusScript({
            code: alwaysSucceedCbor,
            version: "V3",
          }).address,
          amount: lovelace("30000000"),
          scriptRef: resolveScriptRef({
            code: alwaysSucceedCbor,
            version: "V3",
          }),
        },
      },
    ];
    const fetcher = new OfflineFetcher();
    fetcher.addUTxOs(utxos);
    const fetchUTxOs = jest.spyOn(fetcher, "fetchUTxOs");
    const txBuilder = new MeshTxBuilder({
      fetcher: fetcher as unknown as IFetcher,
      evaluator: null,
    });

    // Inputs and the minting script's reference given by out ref alone
    await txBuilder
      .txIn(txHash("tx1"), 0)
      .txIn(txHash("tx2"), 1)
      .mintPlutusScriptV3()
      .mint("100", alwaysSucceedHash, "61737365744e616d6531")
      .mintRedeemerValue(mConStr0([]))
      .mintTxInReference(txHash("tx3"), 2)
      .txInCollateral(txHash("tx1"), 0)
      .changeAddress(baseAddress(0))
      .complete();

    // Each transaction is read once, and what was read completes the body
    expect(fetchUTxOs.mock.calls.map(([hash]) => hash).sort()).toEqual(
      [txHash("tx1"), txHash("tx2"), txHash("tx3")].sort(),
    );
    const { inputs, mints } = txBuilder.meshTxBuilderBody;
    for (const utxo of utxos.slice(0, 2)) {
      const input = inputs.find(
        (i) =>
          i.txIn.txHash === utxo.input.txHash &&
          i.txIn.txIndex === utxo.input.outputIndex,
      );
      expect(input?.txIn).toMatchObject({
        amount: utxo.output.amount,
        address: utxo.output.address,
        scriptSize: 0,
      });
    }
    expect(mints[0]!.scriptSource).toMatchObject({
      type: "Inline",
      scriptHash: alwaysSucceedHash,
      scriptSize: (utxos[2]!.output.scriptRef!.length / 2).toString(),
    });
  });
});
