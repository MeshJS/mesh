import { MintItem, ScriptSource, TxIn } from "@meshsdk/common";
import { MeshTxBuilder } from "@meshsdk/transaction";

class MockTxBuilder extends MeshTxBuilder {
  isInputCompleteExtended = this.isInputComplete;
  isInputInfoCompleteExtended = this.isInputInfoComplete;
  isRefScriptInfoCompleteExtended = this.isRefScriptInfoComplete;
  isMintCompleteExtended = this.isMintComplete;
}

describe("MeshTxBuilder", () => {
  let txBuilder: MockTxBuilder;

  beforeEach(() => {
    txBuilder = new MockTxBuilder();
  });

  describe("isInputComplete", () => {
    it("should return false for incomplete PubKey input", () => {
      const txIn: TxIn = {
        type: "PubKey",
        txIn: { txHash: "hash", txIndex: 0 },
      };
      expect(txBuilder.isInputCompleteExtended(txIn)).toBe(false);
    });

    it("should return false for incomplete PubKey input", () => {
      const txIn: TxIn = {
        type: "PubKey",
        txIn: { txHash: "hash", txIndex: 0, address: "address" },
      };
      expect(txBuilder.isInputCompleteExtended(txIn)).toBe(false);
    });
    it("should return false for incomplete PubKey input", () => {
      const txIn: TxIn = {
        type: "PubKey",
        txIn: { txHash: "hash", txIndex: 0, amount: [] },
      };
      expect(txBuilder.isInputCompleteExtended(txIn)).toBe(false);
    });
    it("should return true for complete PubKey input", () => {
      const txIn: TxIn = {
        type: "PubKey",
        txIn: { txHash: "hash", txIndex: 0, amount: [], address: "address", scriptSize: 0 },
      };
      expect(txBuilder.isInputCompleteExtended(txIn)).toBe(true);
    });

    it("should return false for incomplete Script input", () => {
      const txIn: TxIn = {
        type: "Script",
        txIn: { txHash: "hash", txIndex: 0 },
        scriptTxIn: {
          scriptSource: {
            type: "Provided",
            script: { code: "code", version: "V1" },
          },
        },
      };
      expect(txBuilder.isInputCompleteExtended(txIn)).toBe(false);
    });

    it("should return false for incomplete Script input", () => {
      const txIn: TxIn = {
        type: "Script",
        txIn: { txHash: "hash", txIndex: 0, address: "address" },
        scriptTxIn: {
          scriptSource: {
            type: "Provided",
            script: { code: "code", version: "V1" },
          },
        },
      };
      expect(txBuilder.isInputCompleteExtended(txIn)).toBe(false);
    });
    it("should return false for incomplete Script input", () => {
      const txIn: TxIn = {
        type: "Script",
        txIn: { txHash: "hash", txIndex: 0, amount: [] },
        scriptTxIn: {
          scriptSource: {
            type: "Provided",
            script: { code: "code", version: "V1" },
          },
        },
      };
      expect(txBuilder.isInputCompleteExtended(txIn)).toBe(false);
    });
    it("should return true for complete Script input", () => {
      const txIn: TxIn = {
        type: "Script",
        txIn: { txHash: "hash", txIndex: 0, amount: [], address: "address", scriptSize: 0 },
        scriptTxIn: {
          scriptSource: {
            type: "Provided",
            script: { code: "code", version: "V1" },
          },
        },
      };
      expect(txBuilder.isInputCompleteExtended(txIn)).toBe(true);
    });
    it("should return true for complete Script input, with complete script ref", () => {
      const txIn: TxIn = {
        type: "Script",
        txIn: { txHash: "hash", txIndex: 0, amount: [], address: "address", scriptSize: 0 },
        scriptTxIn: {
          scriptSource: {
            type: "Inline",
            txHash: "hash",
            txIndex: 0,
            scriptSize: "100",
            scriptHash: "hash",
            version: "V1",
          },
        },
      };
      expect(txBuilder.isInputCompleteExtended(txIn)).toBe(true);
    });
    it("should return false for complete Script input, but incomplete script ref (no script hash)", () => {
      const txIn: TxIn = {
        type: "Script",
        txIn: { txHash: "hash", txIndex: 0, amount: [], address: "address" },
        scriptTxIn: {
          scriptSource: {
            type: "Inline",
            txHash: "hash",
            txIndex: 0,
            scriptSize: "100",
            version: "V1",
          },
        },
      };
      expect(txBuilder.isInputCompleteExtended(txIn)).toBe(false);
    });
    it("should return false for complete Script input, but incomplete script ref (no script size)", () => {
      const txIn: TxIn = {
        type: "Script",
        txIn: { txHash: "hash", txIndex: 0, amount: [], address: "address" },
        scriptTxIn: {
          scriptSource: {
            type: "Inline",
            txHash: "hash",
            txIndex: 0,
            scriptHash: "hash",
            version: "V1",
          },
        },
      };
      expect(txBuilder.isInputCompleteExtended(txIn)).toBe(false);
    });
  });

  describe("isInputInfoComplete", () => {
    it("should return false for incomplete PubKey input", () => {
      const txIn: TxIn = {
        type: "PubKey",
        txIn: { txHash: "hash", txIndex: 0 },
      };
      expect(txBuilder.isInputInfoCompleteExtended(txIn)).toBe(false);
    });

    it("should return false for incomplete PubKey input", () => {
      const txIn: TxIn = {
        type: "PubKey",
        txIn: { txHash: "hash", txIndex: 0, address: "address" },
      };
      expect(txBuilder.isInputInfoCompleteExtended(txIn)).toBe(false);
    });
    it("should return false for incomplete PubKey input", () => {
      const txIn: TxIn = {
        type: "PubKey",
        txIn: { txHash: "hash", txIndex: 0, amount: [] },
      };
      expect(txBuilder.isInputInfoCompleteExtended(txIn)).toBe(false);
    });
    it("should return true for complete PubKey input", () => {
      const txIn: TxIn = {
        type: "PubKey",
        txIn: { txHash: "hash", txIndex: 0, amount: [], address: "address", scriptSize: 0 },
      };
      expect(txBuilder.isInputInfoCompleteExtended(txIn)).toBe(true);
    });
  });

  describe("isMintComplete", () => {
    it("should return true for complete Plutus mint", () => {
      const mint: MintItem = {
        type: "Plutus",
        policyId: "policyId",
        assetName: "assetName",
        amount: "1",
        scriptSource: {
          type: "Inline",
          txHash: "hash",
          txIndex: 0,
          scriptSize: "100",
          scriptHash: "hash",
          version: "V1",
        },
      };
      expect(txBuilder.isMintCompleteExtended(mint)).toBe(true);
    });

    it("should return false for complete Plutus mint (no script hash)", () => {
      const mint: MintItem = {
        type: "Plutus",
        policyId: "policyId",
        assetName: "assetName",
        amount: "1",
        scriptSource: {
          type: "Inline",
          txHash: "hash",
          txIndex: 0,
          scriptSize: "100",
          version: "V1",
        },
      };
      expect(txBuilder.isMintCompleteExtended(mint)).toBe(false);
    });

    it("should return false for incomplete Plutus mint (no script size)", () => {
      const mint: MintItem = {
        type: "Plutus",
        policyId: "policyId",
        assetName: "assetName",
        amount: "1",
        scriptSource: {
          type: "Inline",
          txHash: "hash",
          txIndex: 0,
          scriptHash: "hash",
          version: "V1",
        },
      };
      expect(txBuilder.isMintCompleteExtended(mint)).toBe(false);
    });

    it("should return true for complete Native mint", () => {
      const mint: MintItem = {
        type: "Native",
        policyId: "policyId",
        assetName: "assetName",
        amount: "1",
        scriptSource: {
          type: "Inline",
          txHash: "hash",
          txIndex: 0,
          simpleScriptHash: "hash",
        },
      };
      expect(txBuilder.isMintCompleteExtended(mint)).toBe(true);
    });

    it("should return false for incomplete Native mint (no script hash)", () => {
      const mint: MintItem = {
        type: "Plutus",
        policyId: "policyId",
        assetName: "assetName",
        amount: "1",
        scriptSource: {
          type: "Inline",
          txHash: "hash",
          txIndex: 0,
        },
      };
      expect(txBuilder.isMintCompleteExtended(mint)).toBe(false);
    });
  });

  describe("isRefScriptInfoComplete", () => {
    it("should return true with complete script ref", () => {
      const scriptSource: ScriptSource = {
        type: "Inline",
        txHash: "hash",
        txIndex: 0,
        scriptSize: "100",
        scriptHash: "hash",
        version: "V1",
      };
      expect(txBuilder.isRefScriptInfoCompleteExtended(scriptSource)).toBe(
        true,
      );
    });
    it("should return false for incomplete script ref (no script hash)", () => {
      const scriptSource: ScriptSource = {
        type: "Inline",
        txHash: "hash",
        txIndex: 0,
        scriptSize: "100",
        version: "V1",
      };
      expect(txBuilder.isRefScriptInfoCompleteExtended(scriptSource)).toBe(
        false,
      );
    });
    it("should return false for incomplete script ref (no script size)", () => {
      const scriptSource: ScriptSource = {
        type: "Inline",
        txHash: "hash",
        txIndex: 0,
        scriptHash: "hash",
        version: "V1",
      };
      expect(txBuilder.isRefScriptInfoCompleteExtended(scriptSource)).toBe(
        false,
      );
    });
  });
});
