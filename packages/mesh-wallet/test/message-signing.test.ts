import { blake2b, checkSignature, generateNonce } from "@meshsdk/core-cst";
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

  it("check signature when message is hashed", async () => {
    const nonce =
      "5369676e20746f207369676e696e20666f7220796f7572206163636f756e743a20616464725f746573743171706a76686171376d63347a686b6335707173676e737564326d767936306472327a6a616e357a6830356d75756c72636d3066786a6164757030707639306466397a796d6a37673863356d73307a7866337233613361673530396d716437367a6b722e2054696d657374616d703a20313736393134383736373231386b324837696b3133794f4c7235464c4e6b3573467051584c3632383343487152";
    const signature =
      "845846a20127676164647265737358390064cbf41ede2a2bdb14082089c38d56d84d3da350a5d9d0577d37ce7c78dbd26975bc0bc2c2bda92889b97907c5370788c988e3d8f5147976a166686173686564f5581c94d5c9384d7fb83230fdd96c9b631df39604ae85143f3e3ccae21a6d5840ed664b2a0723ca7365f3262cfde679354baa8d29dade0da0d224f2e5cc8257ccda81fbdabc3d76848dc233bc1d00dd455997b430a4197935484d0e09693eb106";

    const result = await checkSignature(nonce, {
      signature,
      key: "a40101032720062158209f64ccd549dfbe6d62295a5b54f4ff6d4df7d5a5f1b1f9a23c7da344dd9d9f87",
    });
    console.log(result);
  });
});
