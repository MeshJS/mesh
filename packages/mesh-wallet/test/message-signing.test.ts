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

  const signature = wallet.signData(
    nonce,
    "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
  );
  const result = checkSignature(nonce, signature);

  it("should checkSignature return true", () => {
    expect(result).toEqual(true);
  });
});
