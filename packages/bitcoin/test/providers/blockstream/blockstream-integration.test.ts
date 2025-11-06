import { BlockstreamProvider } from "../../../src/providers/blockstream";

describe("Blockstream Integration Tests", () => {
  let provider: BlockstreamProvider;
  
  // Known testnet addresses for testing
  const testAddressWithHistory = "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl";
  const testAddressEmpty = "tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0";
  
  beforeAll(() => {
    provider = new BlockstreamProvider("testnet");
  });

  describe("Address operations", () => {
    it("should fetch address info successfully", async () => {
      const addressInfo = await provider.fetchAddress(testAddressWithHistory);
      
      expect(addressInfo).toMatchObject({
        address: testAddressWithHistory,
        chain_stats: expect.objectContaining({
          funded_txo_count: expect.any(Number),
          funded_txo_sum: expect.any(Number),
          spent_txo_count: expect.any(Number),
          spent_txo_sum: expect.any(Number),
          tx_count: expect.any(Number),
        }),
        mempool_stats: expect.objectContaining({
          funded_txo_count: expect.any(Number),
          funded_txo_sum: expect.any(Number),
          spent_txo_count: expect.any(Number),
          spent_txo_sum: expect.any(Number),
          tx_count: expect.any(Number),
        }),
      });
    });

    it("should fetch address UTxOs", async () => {
      const utxos = await provider.fetchAddressUTxOs(testAddressWithHistory);
      
      expect(Array.isArray(utxos)).toBe(true);
      // UTxOs may be empty, but should return valid array
      if (utxos.length > 0) {
        expect(utxos[0]).toMatchObject({
          txid: expect.any(String),
          vout: expect.any(Number),
          value: expect.any(Number),
          status: expect.objectContaining({
            confirmed: expect.any(Boolean),
          }),
        });
      }
    });

    it("should fetch address transactions", async () => {
      const transactions = await provider.fetchAddressTransactions(testAddressWithHistory);
      
      expect(Array.isArray(transactions)).toBe(true);
      // May have no transactions, but should return valid array
      if (transactions.length > 0) {
        expect(transactions[0]).toMatchObject({
          txid: expect.any(String),
          version: expect.any(Number),
          vin: expect.any(Array),
          vout: expect.any(Array),
        });
      }
    });

    it("should handle empty address gracefully", async () => {
      const addressInfo = await provider.fetchAddress(testAddressEmpty);
      
      expect(addressInfo).toMatchObject({
        address: testAddressEmpty,
        chain_stats: expect.objectContaining({
          tx_count: expect.any(Number),
        }),
      });
    });
  });

  describe("Fee estimation", () => {
    it("should fetch fee estimates", async () => {
      const feeEstimates = await provider.fetchFeeEstimates(6);
      
      expect(typeof feeEstimates).toBe("number");
      expect(feeEstimates).toBeGreaterThan(0);
    });

    it("should handle different block targets", async () => {
      const fee6 = await provider.fetchFeeEstimates(6);
      const fee12 = await provider.fetchFeeEstimates(12);
      const fee24 = await provider.fetchFeeEstimates(24);
      
      expect(typeof fee6).toBe("number");
      expect(typeof fee12).toBe("number");
      expect(typeof fee24).toBe("number");
      
      // All fees should be positive numbers
      expect(fee6).toBeGreaterThan(0);
      expect(fee12).toBeGreaterThan(0);
      expect(fee24).toBeGreaterThan(0);
    });
  });

  describe("Transaction operations", () => {
    it("should handle non-existent transaction status requests", async () => {
      const nonExistentTxId = "0000000000000000000000000000000000000000000000000000000000000000";
      
      // Blockstream returns {confirmed: false} for non-existent transactions
      const status = await provider.fetchTransactionStatus(nonExistentTxId);
      expect(status).toMatchObject({
        confirmed: false,
      });
    });

    it("should return error for invalid transaction hex", async () => {
      const invalidTxHex = "invalid-hex-data";
      
      try {
        await provider.submitTx(invalidTxHex);
        fail("Expected API to throw error for invalid transaction hex");
      } catch (error) {
        expect(typeof error).toBe("string");
        expect(error).toContain("error");
      }
    });
  });

  describe("Error handling", () => {
    it("should return base58 error for invalid address format", async () => {
      const invalidAddress = "invalid-address-format";
      try {
        await provider.fetchAddress(invalidAddress);
        fail("Expected API to throw error for invalid address");
      } catch (error) {
        // parseHttpError returns JSON strings (mesh standard)
        expect(typeof error).toBe("string");
        const errorObj = JSON.parse(error as string);
        expect(errorObj).toMatchObject({
          data: "base58 error",
          status: 400,
        });
      }
    });

    it("should return error for malformed addresses", async () => {
      // Test with malformed but valid-length address
      const malformedAddress = "tb1qinvalidbutvalidlength000000000000000000";
      
      try {
        await provider.fetchAddress(malformedAddress);
        fail("Expected API to throw error for malformed address");
      } catch (error) {
        expect(typeof error).toBe("string");
        const errorObj = JSON.parse(error as string);
        expect(errorObj).toMatchObject({
          data: "base58 error",
          status: 400,
        });
      }
    });
  });

  describe("Network configuration", () => {
    it("should work with testnet configuration", () => {
      expect(provider).toBeDefined();
    });

    it("should handle mainnet configuration", () => {
      const mainnetProvider = new BlockstreamProvider("mainnet");
      expect(mainnetProvider).toBeDefined();
    });
  });
});