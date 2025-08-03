import { checkSignature, generateNonce } from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

describe("Mesh Wallet data sign and verify", () => {
  let wallet: MeshWallet;
  beforeAll(async () => {
    wallet = new MeshWallet({
      networkId: 0,
      key: {
        type: "mnemonic",
        words: "solution,".repeat(24).split(",").slice(0, 24),
      },
    });
    await wallet.init();
  });

  it("checkSignature should return true", async () => {
    const nonce = generateNonce("Mesh wallet data sign test");

    const signature = await wallet.signData(nonce);

    const result = await checkSignature(nonce, signature);

    expect(result).toEqual(true);
  });

  it("should be possible to sign with stake key", async () => {
    const nonce = generateNonce("Mesh wallet stake key sign test");
    const { rewardAddressBech32 } = wallet.getAddresses();
    const signature = await wallet.signData(nonce, rewardAddressBech32);

    const result = await checkSignature(nonce, signature, rewardAddressBech32);
    expect(rewardAddressBech32).toEqual(
      "stake_test1uzw5mnt7g4xjgdqkfa80hrk7kdvds6sa4k0vvgjvlj7w8eskffj2n",
    );
    expect(result).toEqual(true);
  });
});
