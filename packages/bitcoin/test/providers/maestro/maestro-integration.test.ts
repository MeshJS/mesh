import dotenv from "dotenv";
import { MaestroProvider } from "../../../src/providers/maestro";

dotenv.config();
const apiKey = process.env.MAESTRO_BITCOIN_API_KEY_TESTNET;

// Skip tests if API key is not provided
const testCondition = apiKey ? describe : describe.skip;

testCondition("Maestro Integration Tests", () => {
  let provider: MaestroProvider;
  
  // Known testnet addresses with transaction history for testing
  const testAddressWithHistory = "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl";
  const testAddressEmpty = "tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0";
  
  beforeAll(() => {
    provider = new MaestroProvider({
      network: "testnet",
      apiKey: apiKey!,
    });
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
  });

  describe("Balance operations", () => {
    it("should fetch address balance", async () => {
      const balance = await provider.fetchAddressBalance(testAddressWithHistory);
      
      expect(balance).toMatchObject({
        data: expect.any(String), // Balance as string
      });
    });

    it("should get balance as BigInt", async () => {
      const balance = await provider.getBalance(testAddressWithHistory);
      
      expect(typeof balance).toBe("bigint");
      expect(balance).toBeGreaterThanOrEqual(BigInt(0));
    });
  });

  describe("Fee estimation", () => {
    it("should fetch fee estimates with default blocks", async () => {
      const feeRate = await provider.fetchFeeEstimates();
      expect(typeof feeRate).toBe("number");
      expect(feeRate).toBeGreaterThanOrEqual(0); // Can be 0 for testnet
    });

    it("should fetch fee estimates with custom blocks", async () => {
      const feeRate = await provider.fetchFeeEstimates(12);
      expect(typeof feeRate).toBe("number");
      expect(feeRate).toBeGreaterThanOrEqual(0); // Can be 0 for testnet
    });
  });

  describe("Satoshi Activity", () => {
    it("should fetch satoshi activity without options", async () => {
      const activity = await provider.fetchSatoshiActivity(testAddressWithHistory);
      
      expect(activity).toMatchObject({
        data: expect.any(Array),
      });
      
      if (activity.data.length > 0) {
        expect(activity.data[0]).toMatchObject({
          tx_hash: expect.any(String),
        });
      }
    });

    it("should fetch satoshi activity with pagination options", async () => {
      const activity = await provider.fetchSatoshiActivity(testAddressWithHistory, {
        order: "desc",
        count: 5,
      });
      
      expect(activity).toMatchObject({
        data: expect.any(Array),
      });
      
      // Should respect count limit
      expect(activity.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Transaction operations", () => {
    it("should return status for non-existent transactions", async () => {
      const nonExistentTxId = "0000000000000000000000000000000000000000000000000000000000000000";
      
      // Maestro returns valid status response for non-existent transactions
      const status = await provider.fetchTransactionStatus(nonExistentTxId);
      expect(status).toMatchObject({
        confirmed: false,
      });
    });

    it("should handle invalid transaction info requests", async () => {
      const invalidTxId = "0000000000000000000000000000000000000000000000000000000000000000";
      
      // May return error or empty response for non-existent transactions
      try {
        await provider.fetchTxInfo(invalidTxId);
      } catch (error) {
        expect(typeof error).toBe("string");
      }
    });

    it("should handle invalid transaction submission", async () => {
      const invalidTxHex = "invalid-hex-data";
      
      try {
        await provider.submitTx(invalidTxHex);
        fail("Expected error for invalid transaction hex");
      } catch (error) {
        expect(typeof error).toBe("string");
      }
    });
  });

  describe("Generic HTTP methods", () => {
    it("should handle GET requests", async () => {
      // Test a valid endpoint
      const result = await provider.get("/esplora/blocks/tip/height");
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThan(0);
    });

    it("should handle invalid GET requests", async () => {
      try {
        await provider.get("/invalid/endpoint");
        fail("Expected error for invalid endpoint");
      } catch (error) {
        expect(typeof error).toBe("string");
      }
    });

    it("should handle invalid POST requests", async () => {
      try {
        await provider.post("/invalid/endpoint", {});
        fail("Expected error for invalid endpoint");
      } catch (error) {
        expect(typeof error).toBe("string");
      }
    });
  });

  describe("Error handling", () => {
    it("should handle invalid addresses gracefully", async () => {
      const invalidAddress = "invalid-address-format";
      
      try {
        await provider.fetchAddress(invalidAddress);
        fail("Expected error for invalid address");
      } catch (error) {
        expect(typeof error).toBe("string");
        const errorObj = JSON.parse(error as string);
        expect(errorObj.data).toBe("Invalid Bitcoin address");
        expect(errorObj.status).toBe(400);
      }
    });

    it("should handle network timeouts and errors", async () => {
      // Test with a malformed but syntactically valid address
      const malformedAddress = "tb1qinvalidbutvalidlength000000000000000000";
      
      try {
        await provider.fetchAddress(malformedAddress);
      } catch (error) {
        expect(typeof error).toBe("string");
      }
    });
  });
});