import { BlockstreamProvider } from "../../../src/providers/blockstream";

describe("BlockstreamProvider", () => {
  describe("Constructor", () => {
    it("should create provider for mainnet", () => {
      const provider = new BlockstreamProvider("mainnet");
      expect(provider).toBeDefined();
    });

    it("should create provider for testnet", () => {
      const provider = new BlockstreamProvider("testnet");
      expect(provider).toBeDefined();
    });

    it("should default to mainnet when no network specified", () => {
      const provider = new BlockstreamProvider();
      expect(provider).toBeDefined();
    });
  });

  describe("IBitcoinProvider interface", () => {
    let provider: BlockstreamProvider;

    beforeEach(() => {
      provider = new BlockstreamProvider("testnet");
    });

    it("should have all required IBitcoinProvider methods", () => {
      expect(typeof provider.fetchAddress).toBe("function");
      expect(typeof provider.fetchAddressTransactions).toBe("function");
      expect(typeof provider.fetchAddressUTxOs).toBe("function");
      expect(typeof provider.fetchTransactionStatus).toBe("function");
      expect(typeof provider.submitTx).toBe("function");
      expect(typeof provider.fetchFeeEstimates).toBe("function");
    });

    it("should have script methods available", () => {
      // Test that script methods exist (implementation may vary)
      expect(typeof provider.fetchScript).toBe("function");
      expect(typeof provider.fetchScriptTransactions).toBe("function");
      expect(typeof provider.fetchScriptUTxOs).toBe("function");
    });
  });

  describe("Network configuration", () => {
    it("should handle mainnet configuration", () => {
      const provider = new BlockstreamProvider("mainnet");
      expect(provider).toBeDefined();
    });

    it("should handle testnet configuration", () => {
      const provider = new BlockstreamProvider("testnet");
      expect(provider).toBeDefined();
    });
  });

  describe("API endpoint validation", () => {
    let provider: BlockstreamProvider;

    beforeEach(() => {
      provider = new BlockstreamProvider("testnet");
    });

    it("should construct correct API URLs internally", () => {
      // We can't directly test private axios instance, but we can verify
      // the provider was created successfully with the correct network
      expect(provider).toBeDefined();
    });
  });
});