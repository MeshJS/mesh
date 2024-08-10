import { checkSignature, generateNonce } from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

describe("Mesh Wallet data sign and verify", () => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: {
      type: "mnemonic",
      words: "solution,".repeat(24).split(",").slice(0, 24),
    },
  });

  const nonce = generateNonce("Mesh wallet data sign test");

  const signature = wallet.signData(nonce);

  const result = checkSignature(nonce, signature);

  it("should checkSignature return true", () => {
    expect(result).toEqual(true);
  });
});
