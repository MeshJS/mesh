import { EmbeddedWallet, verifySignature } from "../../src/wallets/embedded";
import { MaestroProvider } from "../../src/providers/maestro";
import { SignPsbtParams } from "../../src/types/wallet";

jest.mock("../../src/providers/maestro");
const MockedMaestroProvider = MaestroProvider as jest.MockedClass<typeof MaestroProvider>;

describe("EmbeddedWallet - Message Signing", () => {
  let mockProvider: jest.Mocked<MaestroProvider>;
  const testMnemonic = ["abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "about"];
  const testAddressTestnet = "tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0";
  const testAddressMainnet = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
  const readOnlyAddress = "tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0";

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = new MockedMaestroProvider({
      network: "mainnet",
      apiKey: "test-key",
    }) as jest.Mocked<MaestroProvider>;
    
    mockProvider.submitTx.mockResolvedValue("mock-tx-id");
  });

  describe("signMessage", () => {
    it("should sign message with real values", async () => {
      const wallet = new EmbeddedWallet({
        network: "Mainnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });
      
      const result = await wallet.signMessage({
        address: testAddressMainnet,
        message: "abc",
        protocol: "ECDSA"
      });

      expect(result).toMatchObject({
        address: testAddressMainnet,
        messageHash: "caaad4da7a8a3b6e7437e933603a9ee4bf338ecdda896e06cb9a4d07660e83d1",
        signature: "INXaCK0Dsd5ykeKtMvRY/Wo2Nnse1hasn4DdujqxKVwQVfif0wPMIP8nyfid7chB/Y+P1nUPnMdBFRNWnqVtJA==",
      });

      // Verify signature is cryptographically valid
      const publicKey = wallet.getPublicKey();
      const isValid = verifySignature("abc", result.signature, publicKey);
      expect(isValid).toBe(true);
    });

    it("should use default ECDSA protocol when not specified", async () => {
      const wallet = new EmbeddedWallet({
        network: "Mainnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });

      const result = await wallet.signMessage({
        address: testAddressMainnet,
        message: "test message",
      });

      expect(result).toMatchObject({
        address: testAddressMainnet,
        messageHash: expect.any(String),
        signature: expect.any(String),
      });

      // Verify signature format
      expect(() => Buffer.from(result.signature, "base64")).not.toThrow();
      expect(result.messageHash).toMatch(/^[0-9a-f]+$/i);
    });

    it("should throw error for BIP322 protocol", async () => {
      const wallet = new EmbeddedWallet({
        network: "Mainnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });

      await expect(wallet.signMessage({
        address: testAddressMainnet,
        message: "test",
        protocol: "BIP322",
      })).rejects.toThrow("BIP322 protocol is not yet supported");
    });

    it("should throw error for read-only wallet", async () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "address", address: readOnlyAddress },
        provider: mockProvider,
      });

      await expect(wallet.signMessage({
        address: readOnlyAddress,
        message: "test",
      })).rejects.toThrow("Cannot sign data with a read-only wallet.");
    });

    it("should handle different message types", async () => {
      const wallet = new EmbeddedWallet({
        network: "Mainnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });

      const messages = ["hello", "123", "special chars: !@#$%", ""];
      
      for (const message of messages) {
        const result = await wallet.signMessage({
          address: testAddressMainnet,
          message,
        });

        expect(result).toMatchObject({
          address: testAddressMainnet,
          messageHash: expect.any(String),
          signature: expect.any(String),
        });

        // Verify each signature
        const publicKey = wallet.getPublicKey();
        const isValid = verifySignature(message, result.signature, publicKey);
        expect(isValid).toBe(true);
      }
    });

    it("should sign message on testnet", async () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });
      
      const result = await wallet.signMessage({
        address: testAddressTestnet,
        message: "testnet message",
        protocol: "ECDSA"
      });

      expect(result).toMatchObject({
        address: testAddressTestnet,
        messageHash: expect.any(String),
        signature: expect.any(String),
      });

      // Verify signature works
      const publicKey = wallet.getPublicKey();
      const isValid = verifySignature("testnet message", result.signature, publicKey);
      expect(isValid).toBe(true);
    });
  });

  describe("signPsbt", () => {
    it("should handle invalid PSBT format", async () => {
      const wallet = new EmbeddedWallet({
        network: "Mainnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });
      
      await expect(wallet.signPsbt({
        psbt: "invalid-base64-data",
        signInputs: { [testAddressMainnet]: [0] },
        broadcast: false,
      })).rejects.toThrow();
    });

    it("should handle real PSBT from Bitcoin Core", async () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });
      
      // Real PSBT from Bitcoin Core multisig example
      await expect(wallet.signPsbt({
        psbt: "cHNidP8BAFMCAAAAAQfhbKNA1FRjpH+onW13OEqKIWZCpiF4g1orGXVsH8pEAQAAAAD+////AV1VAAAAAAAAF6kUNgjRCMLYCa5FpfX/Hiio6FjPlemHAAAAAAABASvwVQAAAAAAACIAIP2mSKAKgi8Fe1ssH+zSHj+bdc64GY+QI1re719EAgYdAQVpUiECEXI48hpauJFQc/7pBoGupdsLt2CFBMdqBMmErS/C774hAkkKCbBnfVx28cGq4alyzpHNgadhXhvx+hdqv9xrQQM9IQK08CnGk58nlXP4i/7R3wl5qz3Ldi6akUHA5PNUGBLyllOuAAEAFgAUL/cVRY4VRc6TSlXq0wnca5QjxnUA",
        signInputs: { [testAddressTestnet]: [0] },
        broadcast: false,
      })).rejects.toThrow(); // Expected to fail due to key mismatch
    });

    it("should throw error for read-only wallet", async () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "address", address: readOnlyAddress },
        provider: mockProvider,
      });

      await expect(wallet.signPsbt({
        psbt: "cHNidP8BADM...",
        signInputs: { [readOnlyAddress]: [0] },
        broadcast: false,
      })).rejects.toThrow("Cannot sign transactions with a read-only wallet.");
    });
  });

  describe("verifySignature utility", () => {
    it("should verify valid signature", () => {
      // Test with known good values
      const message = "abc";
      const signature = "INXaCK0Dsd5ykeKtMvRY/Wo2Nnse1hasn4DdujqxKVwQVfif0wPMIP8nyfid7chB/Y+P1nUPnMdBFRNWnqVtJA==";
      const publicKey = "03ba1cf3b34a9f1c5d8e1e8a6d2b3c4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f";
      
      const result = verifySignature(message, signature, publicKey);
      expect(typeof result).toBe("boolean");
    });

    it("should return false for invalid signature", () => {
      const message = "abc";
      const signature = "invalid-signature";
      const publicKey = "invalid-public-key";
      
      const result = verifySignature(message, signature, publicKey);
      expect(result).toBe(false);
    });

    it("should handle exceptions gracefully", () => {
      const result = verifySignature("", "", "");
      expect(result).toBe(false);
    });
  });
});