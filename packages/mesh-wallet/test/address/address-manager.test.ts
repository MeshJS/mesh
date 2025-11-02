import { InMemoryBip32 } from "../../src/bip32/in-memory-bip32";
import { AddressType } from "../../src/cardano/address/cardano-address";
import { AddressManager } from "../../src/cardano/address/single-address-manager";
import { BaseSigner } from "../../src/signer/base-signer";

describe("AddressManager", () => {
  let bip32: InMemoryBip32;

  beforeAll(async () => {
    bip32 = await InMemoryBip32.fromMnemonic(
      "solution,".repeat(24).split(",").slice(0, 24),
    );
  });

  describe("create with default credentials", () => {
    it("should create AddressManager with default derivation paths", async () => {
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
      });

      expect(manager).toBeInstanceOf(AddressManager);
      expect(manager.secretManager).toBe(bip32);
    });

    it("should generate correct base address", async () => {
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
      });

      const baseAddress = await manager.getNextAddress(AddressType.Base);
      expect(baseAddress.getAddressBech32()).toBe(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      );
    });

    it("should generate correct enterprise address", async () => {
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
      });

      const enterpriseAddress = await manager.getNextAddress(
        AddressType.Enterprise,
      );
      expect(enterpriseAddress.getAddressBech32()).toBe(
        "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
      );
    });

    it("should generate correct reward address", async () => {
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
      });

      const rewardAddress = await manager.getRewardAccount();
      expect(rewardAddress.getAddressBech32()).toBe(
        "stake_test1upvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c73tq3f",
      );
    });
  });

  describe("create with custom payment credential", () => {
    it("should create AddressManager with custom payment signer", async () => {
      const customPaymentSigner = BaseSigner.fromExtendedKeyHex(
        "f083e5878c6f980c53d30b9cc2baadd780307b08acec9e0792892e013bbe9241eebbb8e9d5d47d91cafc181111fdba61513bbbe6e80127e3b6237bcf347e9d05",
      );

      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
        customPaymentCredentialSource: {
          type: "signer",
          signer: customPaymentSigner,
        },
      });

      const baseAddress = await manager.getNextAddress(AddressType.Base);
      expect(baseAddress.getAddressBech32()).toBe(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      );
    });

    it("should throw error when custom payment credential is scriptHash", async () => {
      await expect(
        AddressManager.create({
          secretManager: bip32,
          networkId: 0,
          customPaymentCredentialSource: {
            type: "scriptHash",
            scriptHash:
              "5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f",
          },
        }),
      ).rejects.toThrow(
        "Payment credential cannot be a script hash. Payment credentials must be key hashes that can sign transactions.",
      );
    });
  });

  describe("create with custom stake credential", () => {
    it("should create AddressManager with custom stake signer", async () => {
      const customStakeSigner = BaseSigner.fromExtendedKeyHex(
        "a810d6398db44f380a9ab279f63950c4b95432f44fafb5a6f026afe23bbe92416a05410d56bb31b9e3631ae60ecabaec2b0355bfc8c830da138952ea9454de50",
      );

      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
        customStakeCredentialSource: {
          type: "signer",
          signer: customStakeSigner,
        },
      });

      expect(manager).toBeInstanceOf(AddressManager);
      const baseAddress = await manager.getNextAddress(AddressType.Base);
      expect(baseAddress).toBeDefined();
    });

    it("should create AddressManager with stake scriptHash", async () => {
      const scriptHash =
        "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8";

      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
        customStakeCredentialSource: {
          type: "scriptHash",
          scriptHash,
        },
      });

      const baseAddress = await manager.getNextAddress(AddressType.Base);
      expect(baseAddress).toBeDefined();

      const addressHex = baseAddress.getAddressHex();
      expect(addressHex).toContain(scriptHash);
    });
  });

  describe("create with custom drep credential", () => {
    it("should create AddressManager with custom drep signer", async () => {
      const customDrepSigner = BaseSigner.fromExtendedKeyHex(
        "c810d6398db44f380a9ab279f63950c4b95432f44fafb5a6f026afe23bbe92416a05410d56bb31b9e3631ae60ecabaec2b0355bfc8c830da138952ea9454de50",
      );

      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
        customDrepCredentialSource: {
          type: "signer",
          signer: customDrepSigner,
        },
      });

      expect(manager).toBeInstanceOf(AddressManager);
    });

    it("should create AddressManager with drep scriptHash", async () => {
      const scriptHash =
        "d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8";

      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
        customDrepCredentialSource: {
          type: "scriptHash",
          scriptHash,
        },
      });

      expect(manager).toBeInstanceOf(AddressManager);
    });
  });

  describe("address generation methods", () => {
    let manager: AddressManager;

    beforeAll(async () => {
      manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
      });
    });

    it("getNextAddress should return Base address", async () => {
      const address = await manager.getNextAddress(AddressType.Base);
      expect(address.addressType).toBe(AddressType.Base);
      expect(address.getAddressBech32()).toBe(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      );
    });

    it("getNextAddress should return Enterprise address", async () => {
      const address = await manager.getNextAddress(AddressType.Enterprise);
      expect(address.addressType).toBe(AddressType.Enterprise);
      expect(address.getAddressBech32()).toBe(
        "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
      );
    });

    it("getChangeAddress should return Base address", async () => {
      const address = await manager.getChangeAddress(AddressType.Base);
      expect(address.addressType).toBe(AddressType.Base);
      expect(address.getAddressBech32()).toBe(
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      );
    });

    it("getChangeAddress should return Enterprise address", async () => {
      const address = await manager.getChangeAddress(AddressType.Enterprise);
      expect(address.addressType).toBe(AddressType.Enterprise);
      expect(address.getAddressBech32()).toBe(
        "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
      );
    });

    it("getRewardAccount should return Reward address", async () => {
      const address = await manager.getRewardAccount();
      expect(address.addressType).toBe(AddressType.Reward);
      expect(address.getAddressBech32()).toBe(
        "stake_test1upvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c73tq3f",
      );
    });

    it("asyncGetAllUsedAddresses should return Base and Enterprise addresses", async () => {
      const addresses = await manager.asyncGetAllUsedAddresses();
      expect(addresses).toHaveLength(2);
      expect(addresses[0]!.addressType).toBe(AddressType.Base);
      expect(addresses[1]!.addressType).toBe(AddressType.Enterprise);
    });
  });

  describe("getCredentialsSigners", () => {
    it("should return payment signer when payment hash is requested", async () => {
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
      });

      const paymentHash =
        "5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f";
      const signersMap = await manager.getCredentialsSigners(
        new Set([paymentHash]),
      );

      expect(signersMap.size).toBe(1);
      expect(signersMap.has(paymentHash)).toBe(true);
    });

    it("should return stake signer when stake hash is requested", async () => {
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
      });

      const stakeHash =
        "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6";
      const signersMap = await manager.getCredentialsSigners(
        new Set([stakeHash]),
      );

      expect(signersMap.size).toBe(1);
      expect(signersMap.has(stakeHash)).toBe(true);
    });

    it("should return drep signer when drep hash is requested", async () => {
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
      });

      const drepSigner = await bip32.getSigner([
        1852 + 0x80000000,
        1815 + 0x80000000,
        0 + 0x80000000,
        3,
        0,
      ]);
      const drepHash = await drepSigner.getPublicKeyHash();

      const signersMap = await manager.getCredentialsSigners(
        new Set([drepHash]),
      );

      expect(signersMap.size).toBe(1);
      expect(signersMap.has(drepHash)).toBe(true);
    });

    it("should return multiple signers when multiple hashes are requested", async () => {
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
      });

      const paymentHash =
        "5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f";
      const stakeHash =
        "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6";
      const signersMap = await manager.getCredentialsSigners(
        new Set([paymentHash, stakeHash]),
      );

      expect(signersMap.size).toBe(2);
      expect(signersMap.has(paymentHash)).toBe(true);
      expect(signersMap.has(stakeHash)).toBe(true);
    });

    it("should return empty map when no matching hashes are found", async () => {
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
      });

      const signersMap = await manager.getCredentialsSigners(
        new Set(["nonexistenthash"]),
      );

      expect(signersMap.size).toBe(0);
    });

    it("should not return stake signer when stake credential is scriptHash", async () => {
      const scriptHash =
        "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8";
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
        customStakeCredentialSource: {
          type: "scriptHash",
          scriptHash,
        },
      });

      const signersMap = await manager.getCredentialsSigners(
        new Set([scriptHash]),
      );

      expect(signersMap.size).toBe(0);
    });

    it("should return all three signers when all three hashes are requested", async () => {
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
      });

      const paymentHash =
        "5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f";
      const stakeHash =
        "9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6";

      const drepSigner = await bip32.getSigner([
        1852 + 0x80000000,
        1815 + 0x80000000,
        0 + 0x80000000,
        3,
        0,
      ]);
      const drepHash = await drepSigner.getPublicKeyHash();

      const signersMap = await manager.getCredentialsSigners(
        new Set([paymentHash, stakeHash, drepHash]),
      );

      expect(signersMap.size).toBe(3);
      expect(signersMap.has(paymentHash)).toBe(true);
      expect(signersMap.has(stakeHash)).toBe(true);
      expect(signersMap.has(drepHash)).toBe(true);
    });
  });

  describe("mainnet vs testnet", () => {
    it("should generate mainnet addresses when networkId is 1", async () => {
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 1,
      });

      const baseAddress = await manager.getNextAddress(AddressType.Base);
      const addressBech32 = baseAddress.getAddressBech32();

      expect(addressBech32.startsWith("addr1")).toBe(true);
    });

    it("should generate testnet addresses when networkId is 0", async () => {
      const manager = await AddressManager.create({
        secretManager: bip32,
        networkId: 0,
      });

      const baseAddress = await manager.getNextAddress(AddressType.Base);
      const addressBech32 = baseAddress.getAddressBech32();

      expect(addressBech32.startsWith("addr_test1")).toBe(true);
    });
  });
});
