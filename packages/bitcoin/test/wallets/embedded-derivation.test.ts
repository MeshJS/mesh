import { EmbeddedWallet } from "../../src/wallets/embedded";
import { MaestroProvider } from "../../src/providers/maestro";
import { CreateWalletOptions } from "../../src/types/wallet";

jest.mock("../../src/providers/maestro");
const MockedMaestroProvider = MaestroProvider as jest.MockedClass<typeof MaestroProvider>;

describe("EmbeddedWallet - Address Derivation", () => {
  let mockProvider: jest.Mocked<MaestroProvider>;
  const testMnemonic = ["abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "about"];
  const testAddressTestnet = "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl";
  const testAddressMainnet = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
  const readOnlyAddress = "tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0";

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = new MockedMaestroProvider({
      network: "mainnet",
      apiKey: "test-key",
    }) as jest.Mocked<MaestroProvider>;
  });

  describe("getAddresses", () => {
    it("should return correct testnet address", async () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });

      const addresses = await wallet.getAddresses();

      expect(addresses).toHaveLength(1);
      expect(addresses[0]).toMatchObject({
        address: testAddressTestnet,
        publicKey: expect.any(String),
        purpose: "payment",
        addressType: "p2wpkh",
        network: "testnet",
        walletType: "software",
      });
    });

    it("should return correct mainnet address", async () => {
      const wallet = new EmbeddedWallet({
        network: "Mainnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });

      const addresses = await wallet.getAddresses();

      expect(addresses).toHaveLength(1);
      expect(addresses[0]).toMatchObject({
        address: testAddressMainnet,
        publicKey: expect.any(String),
        purpose: "payment",
        addressType: "p2wpkh",
        network: "mainnet",
        walletType: "software",
      });
    });

    it("should handle read-only wallet", async () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "address", address: readOnlyAddress },
        provider: mockProvider,
      });

      const addresses = await wallet.getAddresses();

      expect(addresses).toHaveLength(1);
      expect(addresses[0]).toMatchObject({
        address: readOnlyAddress,
        publicKey: "",
        purpose: "payment",
        addressType: "p2wpkh",
        network: "testnet",
        walletType: "software",
      });
    });

    it("should work with custom derivation path", async () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "mnemonic", words: testMnemonic },
        path: "m/84'/1'/0'/0/5", // Custom path
        provider: mockProvider,
      });

      const addresses = await wallet.getAddresses();
      expect(addresses).toHaveLength(1);
      expect(addresses[0]?.addressType).toBe("p2wpkh");
    });
  });

  describe("getPublicKey", () => {
    it("should return public key for mnemonic wallet", () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });

      const publicKey = wallet.getPublicKey();
      expect(publicKey).toMatch(/^[0-9a-f]{66}$/i);
    });

    it("should throw error for read-only wallet", () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "address", address: readOnlyAddress },
        provider: mockProvider,
      });

      expect(() => wallet.getPublicKey()).toThrow(
        "Public key is not available for read-only wallets."
      );
    });
  });

  describe("getNetworkId", () => {
    it("should return 1 for mainnet", () => {
      const wallet = new EmbeddedWallet({
        network: "Mainnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });

      expect(wallet.getNetworkId()).toBe(1);
    });

    it("should return 0 for testnet", () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });

      expect(wallet.getNetworkId()).toBe(0);
    });

    it("should return 2 for regtest", () => {
      const wallet = new EmbeddedWallet({
        network: "Regtest",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });

      expect(wallet.getNetworkId()).toBe(2);
    });
  });

  describe("Static methods", () => {
    describe("brew", () => {
      it("should generate mnemonic with default strength", () => {
        const mnemonic = EmbeddedWallet.brew();
        expect(mnemonic).toHaveLength(12);
        expect(mnemonic.every(word => typeof word === "string")).toBe(true);
      });

      it("should generate mnemonic with custom strength", () => {
        const mnemonic = EmbeddedWallet.brew(256);
        expect(mnemonic).toHaveLength(24);
      });

      it("should throw error for invalid strength", () => {
        expect(() => EmbeddedWallet.brew(100)).toThrow(
          "Invalid strength. Must be one of: 128, 160, 192, 224, 256."
        );
      });

      it("should generate different mnemonics on each call", () => {
        const mnemonic1 = EmbeddedWallet.brew();
        const mnemonic2 = EmbeddedWallet.brew();
        expect(mnemonic1).not.toEqual(mnemonic2);
      });
    });
  });
});