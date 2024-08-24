import { ScriptSource, SimpleScriptSourceInfo, TxIn } from "@meshsdk/common";
import { MeshTxBuilder } from "@meshsdk/transaction";

class MockTxBuilder extends MeshTxBuilder {
  constructor() {
    super();
    this.queriedUTxOs = {
      txHash1: [
        {
          input: { txHash: "txHash1", outputIndex: 0 },
          output: {
            amount: [{ unit: "lovelace", quantity: "100" }],
            address: "address1",
            scriptHash: "scriptHash1",
            scriptRef: "scriptRef1",
          },
        },
      ],
      txHash2: [
        {
          input: { txHash: "txHash2", outputIndex: 1 },
          output: {
            amount: [{ unit: "lovelace", quantity: "200" }],
            address: "address2",
            scriptHash: "scriptHash2",
            scriptRef: "scriptRef222",
          },
        },
      ],
    };
  }

  completeTxInformationExtended = this.completeTxInformation;
  completeInputInfoExtended = this.completeInputInfo;
  completeScriptInfoExtended = this.completeScriptInfo;
  completeSimpleScriptInfoExtended = this.completeSimpleScriptInfo;
}

describe("MeshTxBuilder", () => {
  let txBuilder: MockTxBuilder;

  beforeEach(() => {
    txBuilder = new MockTxBuilder();
  });

  describe("completeTxInformation", () => {
    it("should complete input info if incomplete", () => {
      const input: TxIn = {
        type: "PubKey",
        txIn: { txHash: "txHash1", txIndex: 0 },
      };
      txBuilder.completeTxInformationExtended(input);
      expect(JSON.stringify(input.txIn.amount)).toEqual(
        JSON.stringify([{ unit: "lovelace", quantity: "100" }]),
      );
      expect(input.txIn.address).toEqual("address1");
    });

    it("should complete script info if incomplete", () => {
      const input: TxIn = {
        type: "Script",
        txIn: {
          txHash: "txHash2",
          txIndex: 1,
        },
        scriptTxIn: {
          scriptSource: {
            type: "Inline",
            txHash: "txHash2",
            txIndex: 1,
          },
        },
      };
      txBuilder.completeTxInformationExtended(input);
      expect(JSON.stringify(input.txIn.amount)).toEqual(
        JSON.stringify([{ unit: "lovelace", quantity: "200" }]),
      );
      expect(JSON.stringify(input.scriptTxIn.scriptSource)).toEqual(
        JSON.stringify({
          type: "Inline",
          txHash: "txHash2",
          txIndex: 1,
          scriptHash: "scriptHash2",
          scriptSize: "6",
        }),
      );
    });
  });

  describe("completeInputInfo", () => {
    it("should complete input info with amount and address", () => {
      const input: TxIn = {
        type: "PubKey",
        txIn: { txHash: "txHash1", txIndex: 0 },
      };
      txBuilder.completeInputInfoExtended(input);
      expect(JSON.stringify(input.txIn.amount)).toEqual(
        JSON.stringify([{ unit: "lovelace", quantity: "100" }]),
      );
      expect(input.txIn.address).toEqual("address1");
    });

    it("should throw error if amount is missing", () => {
      const input: TxIn = {
        type: "PubKey",
        txIn: { txHash: "txHash3", txIndex: 0 },
      };
      expect(() => txBuilder.completeInputInfoExtended(input)).toThrow(
        `Couldn't find value information for txHash3#0`,
      );
    });
  });

  describe("completeScriptInfo", () => {
    it("should complete script info with scriptHash and scriptSize", () => {
      const scriptSource: ScriptSource = {
        type: "Inline",
        txHash: "txHash2",
        txIndex: 1,
      };
      txBuilder.completeScriptInfoExtended(scriptSource);
      expect(JSON.stringify(scriptSource)).toEqual(
        JSON.stringify({
          type: "Inline",
          txHash: "txHash2",
          txIndex: 1,
          scriptHash: "scriptHash2",
          scriptSize: "6",
        }),
      );
    });

    it("should throw error if script reference utxo is missing", () => {
      const scriptSource: ScriptSource = {
        type: "Inline",
        txHash: "txHash3",
        txIndex: 0,
      };
      expect(() =>
        txBuilder.completeScriptInfoExtended(scriptSource),
      ).toThrow();
    });
  });

  describe("completeSimpleScriptInfo", () => {
    it("should complete simple script info with simpleScriptHash", () => {
      const simpleScript: SimpleScriptSourceInfo = {
        type: "Inline",
        txHash: "txHash2",
        txIndex: 1,
      };
      txBuilder.completeSimpleScriptInfoExtended(simpleScript);
      expect(simpleScript.simpleScriptHash).toEqual("scriptHash2");
    });

    it("should throw error if script reference utxo is missing", () => {
      const simpleScript: SimpleScriptSourceInfo = {
        type: "Inline",
        txHash: "txHash3",
        txIndex: 0,
      };
      expect(() =>
        txBuilder.completeSimpleScriptInfoExtended(simpleScript),
      ).toThrow();
    });
  });
});
