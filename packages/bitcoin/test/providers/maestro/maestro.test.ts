import { MaestroProvider } from "../../../src/providers/maestro";
import { MaestroConfig } from "../../../src/types/maestro";

describe("MaestroProvider", () => {
  describe("Constructor", () => {
    it("should create provider with config", () => {
      const config: MaestroConfig = {
        network: "testnet",
        apiKey: "test-key",
      };
      const provider = new MaestroProvider(config);
      expect(provider.getNetwork()).toBe("testnet");
    });

    it("should create provider with custom baseURL", () => {
      const provider = new MaestroProvider("https://custom-api.com", "custom-key");
      expect(provider.getNetwork()).toBe("mainnet");
    });

    it("should detect testnet from URL", () => {
      const provider = new MaestroProvider("https://testnet-api.com", "test-key");
      expect(provider.getNetwork()).toBe("testnet");
    });
  });

  describe("IBitcoinProvider interface", () => {
    let provider: MaestroProvider;

    beforeEach(() => {
      provider = new MaestroProvider({
        network: "mainnet",
        apiKey: "test-key",
      });
    });

    it("should have all required IBitcoinProvider methods", () => {
      expect(typeof provider.fetchAddress).toBe("function");
      expect(typeof provider.fetchAddressTransactions).toBe("function");
      expect(typeof provider.fetchAddressUTxOs).toBe("function");
      expect(typeof provider.fetchTransactionStatus).toBe("function");
      expect(typeof provider.submitTx).toBe("function");
      expect(typeof provider.fetchFeeEstimates).toBe("function");
    });

    it("should throw error for unimplemented script methods", async () => {
      await expect(provider.fetchScript("test-hash")).rejects.toThrow(
        "fetchScript is not implemented"
      );
      await expect(provider.fetchScriptTransactions("test-hash")).rejects.toThrow(
        "fetchScriptTransactions is not implemented"
      );
      await expect(provider.fetchScriptUTxOs("test-hash")).rejects.toThrow(
        "fetchScriptUTxOs is not implemented"
      );
    });
  });

  describe("Additional methods", () => {
    let provider: MaestroProvider;

    beforeEach(() => {
      provider = new MaestroProvider({
        network: "mainnet",
        apiKey: "test-key",
      });
    });

    it("should have additional Bitcoin-specific methods", () => {
      expect(typeof provider.fetchSatoshiActivity).toBe("function");
      expect(typeof provider.fetchTxInfo).toBe("function");
      expect(typeof provider.fetchAddressBalance).toBe("function");
      expect(typeof provider.getBalance).toBe("function");
      expect(typeof provider.get).toBe("function");
      expect(typeof provider.post).toBe("function");
    });
  });
});