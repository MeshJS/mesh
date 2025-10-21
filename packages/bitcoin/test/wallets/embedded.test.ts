import { EmbeddedWallet } from "../../src/wallets/embedded";
import { MaestroProvider } from "../../src/providers/maestro";

jest.mock("../../src/providers/maestro");
const MockedMaestroProvider = MaestroProvider as jest.MockedClass<typeof MaestroProvider>;

describe("EmbeddedWallet - Constructor & Basic Functionality", () => {
  let mockProvider: jest.Mocked<MaestroProvider>;
  const testMnemonic = ["abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "about"];
  const readOnlyAddress = "tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0";

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = new MockedMaestroProvider({
      network: "mainnet",
      apiKey: "test-key",
    }) as jest.Mocked<MaestroProvider>;
  });

  describe("Constructor", () => {
    it("should create wallet with mnemonic for mainnet", () => {
      const wallet = new EmbeddedWallet({
        network: "Mainnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });

      expect(wallet).toBeDefined();
      expect(wallet.getNetworkId()).toBe(0);
    });

    it("should create wallet with mnemonic for testnet", () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });

      expect(wallet).toBeDefined();
      expect(wallet.getNetworkId()).toBe(1);
    });

    it("should create wallet with mnemonic for regtest", () => {
      const wallet = new EmbeddedWallet({
        network: "Regtest",
        key: { type: "mnemonic", words: testMnemonic },
        provider: mockProvider,
      });

      expect(wallet).toBeDefined();
      expect(wallet.getNetworkId()).toBe(0);
    });

    it("should create read-only wallet with address", () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "address", address: readOnlyAddress },
        provider: mockProvider,
      });

      expect(wallet).toBeDefined();
      expect(() => wallet.getPublicKey()).toThrow(
        "Public key is not available for read-only wallets."
      );
    });

    it("should create wallet with custom derivation path", () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "mnemonic", words: testMnemonic },
        path: "m/84'/1'/0'/0/5",
        provider: mockProvider,
      });

      expect(wallet).toBeDefined();
    });

    it("should create wallet without provider", () => {
      const wallet = new EmbeddedWallet({
        network: "Testnet",
        key: { type: "mnemonic", words: testMnemonic },
      });

      expect(wallet).toBeDefined();
    });
  });

  describe("Network validation", () => {
    it("should handle all supported networks", () => {
      const networks = ["Mainnet", "Testnet", "Regtest"] as const;
      const expectedNetworkIds = [0, 1, 0];

      networks.forEach((network, index) => {
        const wallet = new EmbeddedWallet({
          network,
          key: { type: "mnemonic", words: testMnemonic },
          provider: mockProvider,
        });

        expect(wallet.getNetworkId()).toBe(expectedNetworkIds[index]);
      });
    });
  });
});