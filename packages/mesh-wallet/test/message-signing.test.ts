import { checkSignature, generateNonce } from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

describe("Mesh Wallet data sign and verify", () => {
  it("should checkSignature return true", async () => {
    const wallet = new MeshWallet({
      networkId: 0,
      key: {
        type: "mnemonic",
        words: "solution,".repeat(24).split(",").slice(0, 24),
      },
    });
    await wallet.init();

    const nonce = generateNonce("Mesh wallet data sign test");

    const signature = await wallet.signData(nonce);

    const result = await checkSignature(nonce, signature);

    expect(result).toEqual(true);
  });
});
