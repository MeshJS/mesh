import { Bip32PrivateKey, PrivateKey } from "@meshsdk/stricahq";

describe("bip32ed25519", (): void => {
  describe("159ccb8c732a2cf226cc6895618926ff0fb391df", (): void => {
    let xprv: any;
    beforeEach(async () => {
      xprv = await Bip32PrivateKey.fromEntropy(
        Buffer.from("159ccb8c732a2cf226cc6895618926ff0fb391df", "hex")
      );
    });

    const expectedExtPrivateKeyIndex0 =
      "b88d72f4fd0dec1cb4345adabc42d8bf04324d9e524e4e074362030fa3c8355f0d5e83076d34329f5a7a12fd3eec9b19ec3b3c752249e10bd7bddfe119db68728b42bcede75b29201fd3e2a4cf36d502b7d8ef18ac53e367f6b2b60889b274aa";
    const expectedHardendedExtPrivateKeyIndex0 =
      "68c9cef1630d29c1d00b186a06b0430f777b9f0a3eaa4f0a0bd0992ba3c8355fd1c4200a48634bd102ce0da6f1e3a476946b76f5dcce9d8e9544aa0c57787e3eda9ca611899a0fc3bdaf25d13eba6d1dd61bc1fa9dfcc7ad69205de3d9ac49ff";
    const expectedExtPublicKeyIndex0 =
      "62981a8cf80fdf478145e8c172c6d9c4bcd73aa37d378803cb1f70cc197edecb8b42bcede75b29201fd3e2a4cf36d502b7d8ef18ac53e367f6b2b60889b274aa";
    const expectedHardendedExtPublicKeyIndex0 =
      "610194b3f168ffa11a16a0ec31a9d91757f3a138d09be2ee1bf7974bef4c833fda9ca611899a0fc3bdaf25d13eba6d1dd61bc1fa9dfcc7ad69205de3d9ac49ff";

    const expectedPrivateKeyIndex0 =
      "b88d72f4fd0dec1cb4345adabc42d8bf04324d9e524e4e074362030fa3c8355f0d5e83076d34329f5a7a12fd3eec9b19ec3b3c752249e10bd7bddfe119db6872";
    const expectedHardendedPrivateKeyIndex0 =
      "68c9cef1630d29c1d00b186a06b0430f777b9f0a3eaa4f0a0bd0992ba3c8355fd1c4200a48634bd102ce0da6f1e3a476946b76f5dcce9d8e9544aa0c57787e3e";
    const expectedPublicKeyIndex0 =
      "62981a8cf80fdf478145e8c172c6d9c4bcd73aa37d378803cb1f70cc197edecb";
    const expectedHardendedPublicKeyIndex0 =
      "610194b3f168ffa11a16a0ec31a9d91757f3a138d09be2ee1bf7974bef4c833f";
    const expectedPrivateKeyPath =
      "d8c494b685c225a6103d5431a43897adb383832002a4b3956e30a027abc8355f5be390aaf7918c0f73d638f52a232974ece179ad591ef793d8683e95f0dd9ba7";
    const expectedPublicKeyPath =
      "c3f4f4b63d60ca921c029bf7851eaa68ae1a59d3f6f268bf2829c6510a7a76ab";

    const message =
      "a475ccfbd6e91b4a1e1ad7fe2c8ce5d2c52df1641920368f84bdc68b84bdc68b";
    const expectedSig =
      "3d1f84b69d90054c134ffd272dff2cafcad1749a27e1cf8936afa57e8f110faf263bc52e408f545950373f3aca752b9aa88ff46b2a178edaaff0b15f06645e0e";

    it("generates expected xprv at index 0", () => {
      const xprv0 = xprv.derive(0).toBytes().toString("hex");
      expect(xprv0).toBe(expectedExtPrivateKeyIndex0);
    });

    it("generates expected hardended xprv at index 0", () => {
      const xprv0 = xprv.deriveHardened(0).toBytes().toString("hex");
      expect(xprv0).toBe(expectedHardendedExtPrivateKeyIndex0);
    });

    it("generates expected xpub at index 0", () => {
      const xpub0 = xprv.derive(0).toBip32PublicKey().toBytes().toString("hex");
      expect(xpub0).toBe(expectedExtPublicKeyIndex0);
    });

    it("generates expected hardended xpub at index 0", () => {
      const xpub0 = xprv
        .deriveHardened(0)
        .toBip32PublicKey()
        .toBytes()
        .toString("hex");
      expect(xpub0).toBe(expectedHardendedExtPublicKeyIndex0);
    });

    it("generates expected privateKey at index 0", () => {
      const prv0 = xprv.derive(0).toPrivateKey().toBytes().toString("hex");
      expect(prv0).toBe(expectedPrivateKeyIndex0);
    });

    it("generates expected hardended privateKey at index 0", () => {
      const prv0 = xprv
        .deriveHardened(0)
        .toPrivateKey()
        .toBytes()
        .toString("hex");
      expect(prv0).toBe(expectedHardendedPrivateKeyIndex0);
    });

    it("generates expected publicKey at index 0", () => {
      const pub0 = xprv
        .derive(0)
        .toPrivateKey()
        .toPublicKey()
        .toBytes()
        .toString("hex");
      expect(pub0).toBe(expectedPublicKeyIndex0);
    });

    it("generates expected hardended publicKey at index 0", () => {
      const pub0 = xprv
        .deriveHardened(0)
        .toPrivateKey()
        .toPublicKey()
        .toBytes()
        .toString("hex");
      expect(pub0).toBe(expectedHardendedPublicKeyIndex0);
    });

    it("generates expected privateKey at path m/0'/0", () => {
      const prv0 = xprv
        .derivePath("m/0'/0")
        .toPrivateKey()
        .toBytes()
        .toString("hex");
      expect(prv0).toBe(expectedPrivateKeyPath);
    });

    it("generates expected publicKey at path m/0'/0", () => {
      const prv0 = xprv
        .derivePath("m/0'/0")
        .toPrivateKey()
        .toPublicKey()
        .toBytes()
        .toString("hex");
      expect(prv0).toBe(expectedPublicKeyPath);
    });

    it("generates expected signature with key at index 0 and verify", () => {
      const sig = xprv
        .derive(0)
        .toPrivateKey()
        .sign(Buffer.from(message, "hex"))
        .toString("hex");
      expect(sig).toBe(expectedSig);
      expect(
        xprv
          .derive(0)
          .toPrivateKey()
          .toPublicKey()
          .verify(Buffer.from(sig, "hex"), Buffer.from(message, "hex"))
      ).toBe(true);
    });
  });

  describe("000102030405060708090a0b0c0d0e0f", (): void => {
    let xprv: any;
    beforeEach(async () => {
      xprv = await Bip32PrivateKey.fromEntropy(
        Buffer.from("000102030405060708090a0b0c0d0e0f", "hex")
      );
    });

    const expectedExtPrivateKeyIndex0 =
      "b0fc5a8f38ed107a552e46311bd06c865fb1b073e9dc339dd9d66b6953520f454817c29889af06c56a713b045748e90ecdf69260f9e9138bd7a8e5de1fb4aafe9f370cb5bfac38df1c0b337dc5e53f35b47d6dc565de12fb5d0a4db1127ba1ab";
    const expectedExtPublicKeyIndex0 =
      "8fef8e327dc1fb0417b1d0ebffd048e06b055b5fe26e3b6885e6c654ab3211c39f370cb5bfac38df1c0b337dc5e53f35b47d6dc565de12fb5d0a4db1127ba1ab";

    const expectedPrivateKeyIndex0 =
      "b0fc5a8f38ed107a552e46311bd06c865fb1b073e9dc339dd9d66b6953520f454817c29889af06c56a713b045748e90ecdf69260f9e9138bd7a8e5de1fb4aafe";
    const expectedPublicKeyIndex0 =
      "8fef8e327dc1fb0417b1d0ebffd048e06b055b5fe26e3b6885e6c654ab3211c3";

    const message =
      "a475ccfbd6e91b4a1e1ad7fe2c8ce5d2c52df1641920368f84bdc68b84bdc68b";
    const expectedSig =
      "98c086fdb797de15e5150884fb542c879c6a6c8f541a895e86201f92d82ea83bcacb2a20d21a027f09cc9c331795f13483cbfe7469cad91134cf0e45dcdffb09";

    it("generates expected xprv at index 0", () => {
      const xprv0 = xprv.derive(0).toBytes().toString("hex");
      expect(xprv0).toBe(expectedExtPrivateKeyIndex0);
    });

    it("generates expected xpub at index 0", () => {
      const xpub0 = xprv.derive(0).toBip32PublicKey().toBytes().toString("hex");
      expect(xpub0).toBe(expectedExtPublicKeyIndex0);
    });

    it("generates expected privateKey at index 0", () => {
      const prv0 = xprv.derive(0).toPrivateKey().toBytes().toString("hex");
      expect(prv0).toBe(expectedPrivateKeyIndex0);
    });

    it("generates expected publicKey at index 0", () => {
      const pub0 = xprv
        .derive(0)
        .toPrivateKey()
        .toPublicKey()
        .toBytes()
        .toString("hex");
      expect(pub0).toBe(expectedPublicKeyIndex0);
    });

    it("generates expected signature with key at index 0 and verify", () => {
      const sig = xprv
        .derive(0)
        .toPrivateKey()
        .sign(Buffer.from(message, "hex"))
        .toString("hex");
      expect(sig).toBe(expectedSig);
      expect(
        xprv
          .derive(0)
          .toPrivateKey()
          .toPublicKey()
          .verify(Buffer.from(sig, "hex"), Buffer.from(message, "hex"))
      ).toBe(true);
    });
  });

  describe("fffcf9f6f3f0edeae7e4e1dedbd8d5d2cfccc9c6c3c0bdbab7b4b1aeaba8a5a29f9c999693908d8a8784817e7b7875726f6c696663605d5a5754514e4b484542", (): void => {
    let xprv: any;
    beforeEach(async () => {
      xprv = await Bip32PrivateKey.fromEntropy(
        Buffer.from(
          "fffcf9f6f3f0edeae7e4e1dedbd8d5d2cfccc9c6c3c0bdbab7b4b1aeaba8a5a29f9c999693908d8a8784817e7b7875726f6c696663605d5a5754514e4b484542",
          "hex"
        )
      );
    });

    const expectedExtPrivateKeyIndex0 =
      "b8da9f980f797d2f4731de4f020141bd0d4b359cd0c51bb5852d339ecbdb2c52341f87ad34119038cab17ef83d694175404305f1b09dc5e22d5e26c64e514d544195ce929e96f610fdf5ee5017f093ef832acaeab7d187a30b1eca5bef44b284";
    const expectedExtPublicKeyIndex0 =
      "fa0a707eb43b245522a19674ba2b8735600f3aa4beb884e9936c2f788cac16e74195ce929e96f610fdf5ee5017f093ef832acaeab7d187a30b1eca5bef44b284";

    const expectedPrivateKeyIndex0 =
      "b8da9f980f797d2f4731de4f020141bd0d4b359cd0c51bb5852d339ecbdb2c52341f87ad34119038cab17ef83d694175404305f1b09dc5e22d5e26c64e514d54";
    const expectedPublicKeyIndex0 =
      "fa0a707eb43b245522a19674ba2b8735600f3aa4beb884e9936c2f788cac16e7";

    const message =
      "a475ccfbd6e91b4a1e1ad7fe2c8ce5d2c52df1641920368f84bdc68b84bdc68b";
    const expectedSig =
      "f0fc4433499ca9e37fca660c1a53f783df024c73f23ac8621a7ea4a4707145c347d34b3cfcfb640d0c148ae3bfac50a789e10c6dcd5f9957cb5c6efc2364b601";

    it("generates expected xprv at index 0", () => {
      const xprv0 = xprv.derive(0).toBytes().toString("hex");
      expect(xprv0).toBe(expectedExtPrivateKeyIndex0);
    });

    it("generates expected xpub at index 0", () => {
      const xpub0 = xprv.derive(0).toBip32PublicKey().toBytes().toString("hex");
      expect(xpub0).toBe(expectedExtPublicKeyIndex0);
    });

    it("generates expected privateKey at index 0", () => {
      const prv0 = xprv.derive(0).toPrivateKey().toBytes().toString("hex");
      expect(prv0).toBe(expectedPrivateKeyIndex0);
    });

    it("generates expected publicKey at index 0", () => {
      const pub0 = xprv
        .derive(0)
        .toPrivateKey()
        .toPublicKey()
        .toBytes()
        .toString("hex");
      expect(pub0).toBe(expectedPublicKeyIndex0);
    });

    it("generates expected signature with key at index 0 and verify", () => {
      const sig = xprv
        .derive(0)
        .toPrivateKey()
        .sign(Buffer.from(message, "hex"))
        .toString("hex");
      expect(sig).toBe(expectedSig);
      expect(
        xprv
          .derive(0)
          .toPrivateKey()
          .toPublicKey()
          .verify(Buffer.from(sig, "hex"), Buffer.from(message, "hex"))
      ).toBe(true);
    });
  });

  describe("4b381541583be4423346c643850da4b320e46a87ae3d2a4e6da11eba819cd4acba45d239319ac14f863b8d5ab5a0d0c64d2e8a1e7d1457df2e5a3c51c73235be", (): void => {
    let xprv: any;
    beforeEach(async () => {
      xprv = await Bip32PrivateKey.fromEntropy(
        Buffer.from(
          "4b381541583be4423346c643850da4b320e46a87ae3d2a4e6da11eba819cd4acba45d239319ac14f863b8d5ab5a0d0c64d2e8a1e7d1457df2e5a3c51c73235be",
          "hex"
        )
      );
    });

    const expectedExtPrivateKeyIndex0 =
      "08c377d31cf52ceea457356c0171443e26c8fedbb842d2c77c0af57444525c49492be62a1927e90875a4a5f19424ac81606b0f24f792c1fab19e98f6e6a35a708d0f1db68b67f989dcc61dcafd9384229bcbd56f10537f673ed28c725a9c582e";
    const expectedExtPublicKeyIndex0 =
      "7090fc2d5d839f5b87160784a9be88ce0e86719ecb99d3ae64ec3c3c4df3511a8d0f1db68b67f989dcc61dcafd9384229bcbd56f10537f673ed28c725a9c582e";

    const expectedPrivateKeyIndex0 =
      "08c377d31cf52ceea457356c0171443e26c8fedbb842d2c77c0af57444525c49492be62a1927e90875a4a5f19424ac81606b0f24f792c1fab19e98f6e6a35a70";
    const expectedPublicKeyIndex0 =
      "7090fc2d5d839f5b87160784a9be88ce0e86719ecb99d3ae64ec3c3c4df3511a";

    const message =
      "a475ccfbd6e91b4a1e1ad7fe2c8ce5d2c52df1641920368f84bdc68b84bdc68b";
    const expectedSig =
      "e5f0ca75201a18ba8ba4edc8fa25f1660bf99535250f888941a057b467fa175be74fcdfe2d4c170d5049648ff71d5dc3529858760b453abfc11fd713deebca01";

    it("generates expected xprv at index 0", () => {
      const xprv0 = xprv.derive(0).toBytes().toString("hex");
      expect(xprv0).toBe(expectedExtPrivateKeyIndex0);
    });

    it("generates expected xpub at index 0", () => {
      const xpub0 = xprv.derive(0).toBip32PublicKey().toBytes().toString("hex");
      expect(xpub0).toBe(expectedExtPublicKeyIndex0);
    });

    it("generates expected privateKey at index 0", () => {
      const prv0 = xprv.derive(0).toPrivateKey().toBytes().toString("hex");
      expect(prv0).toBe(expectedPrivateKeyIndex0);
    });

    it("generates expected publicKey at index 0", () => {
      const pub0 = xprv
        .derive(0)
        .toPrivateKey()
        .toPublicKey()
        .toBytes()
        .toString("hex");
      expect(pub0).toBe(expectedPublicKeyIndex0);
    });

    it("generates expected signature with key at index 0 and verify", () => {
      const sig = xprv
        .derive(0)
        .toPrivateKey()
        .sign(Buffer.from(message, "hex"))
        .toString("hex");
      expect(sig).toBe(expectedSig);
      expect(
        xprv
          .derive(0)
          .toPrivateKey()
          .toPublicKey()
          .verify(Buffer.from(sig, "hex"), Buffer.from(message, "hex"))
      ).toBe(true);
    });
  });

  describe("3ddd5602285899a946114506157c7997e5444528f3003f6134712147db19b678", (): void => {
    let xprv: any;
    beforeEach(async () => {
      xprv = await Bip32PrivateKey.fromEntropy(
        Buffer.from(
          "3ddd5602285899a946114506157c7997e5444528f3003f6134712147db19b678",
          "hex"
        )
      );
    });

    const expectedExtPrivateKeyIndex0 =
      "105cd0fb7aee08d97aad765894e9f923dc8ff9c7a8c7a82b2992b3dfab0e8346fa0ae5ed16036bbc1ea983a58c77f96cad2730a6beca07ca751c2a1a96fee997f47c2ec594705fab6e71de0d459d908d5c26199b23881a3f189663eb220179e2";
    const expectedExtPublicKeyIndex0 =
      "840705c1e48fc2282a3e0b8f9e5de73f30e11635560be8bd9a39b6006550cf1ff47c2ec594705fab6e71de0d459d908d5c26199b23881a3f189663eb220179e2";

    const expectedPrivateKeyIndex0 =
      "105cd0fb7aee08d97aad765894e9f923dc8ff9c7a8c7a82b2992b3dfab0e8346fa0ae5ed16036bbc1ea983a58c77f96cad2730a6beca07ca751c2a1a96fee997";
    const expectedPublicKeyIndex0 =
      "840705c1e48fc2282a3e0b8f9e5de73f30e11635560be8bd9a39b6006550cf1f";

    const message =
      "a475ccfbd6e91b4a1e1ad7fe2c8ce5d2c52df1641920368f84bdc68b84bdc68b";
    const expectedSig =
      "5c6cdce0da66b78f59b16a5ce5df1b05578481849c0308408371e652f259a10daf05a4fee6dd08edbac94707d19f1406e97457784baf9313e4db6bf559259b0f";

    it("generates expected xprv at index 0", () => {
      const xprv0 = xprv.derive(0).toBytes().toString("hex");
      expect(xprv0).toBe(expectedExtPrivateKeyIndex0);
    });

    it("generates expected xpub at index 0", () => {
      const xpub0 = xprv.derive(0).toBip32PublicKey().toBytes().toString("hex");
      expect(xpub0).toBe(expectedExtPublicKeyIndex0);
    });

    it("generates expected privateKey at index 0", () => {
      const prv0 = xprv.derive(0).toPrivateKey().toBytes().toString("hex");
      expect(prv0).toBe(expectedPrivateKeyIndex0);
    });

    it("generates expected publicKey at index 0", () => {
      const pub0 = xprv
        .derive(0)
        .toPrivateKey()
        .toPublicKey()
        .toBytes()
        .toString("hex");
      expect(pub0).toBe(expectedPublicKeyIndex0);
    });

    it("generates expected signature with key at index 0 and verify", () => {
      const sig = xprv
        .derive(0)
        .toPrivateKey()
        .sign(Buffer.from(message, "hex"))
        .toString("hex");
      expect(sig).toBe(expectedSig);
      expect(
        xprv
          .derive(0)
          .toPrivateKey()
          .toPublicKey()
          .verify(Buffer.from(sig, "hex"), Buffer.from(message, "hex"))
      ).toBe(true);
    });
  });

  describe("ed25519", (): void => {
    describe("b7cbcc113d2fe1c6f97d858c2e512459b36034c67f630749567d8783757394c7", (): void => {
      let privKey: PrivateKey;
      beforeEach(async () => {
        privKey = PrivateKey.fromSecretKey(
          Buffer.from(
            "b7cbcc113d2fe1c6f97d858c2e512459b36034c67f630749567d8783757394c7",
            "hex"
          )
        );
      });

      const expectedPublicKey =
        "5ca51b304b1f79d92eada8c58c513e969458dcd27ce4f5bc47823ffa";

      const message =
        "15e7831b12b025a886a21f767f2aeecd5ad3220dd8c9de586284a04c545ecd04";
      const expectedSig =
        "6a88cc38cee78d8a2fafb5c8826f6be87686c60472e2a0eaac7576f7a7f51a5eeb0a65b9797975355e80dae1d91974ab59c301bb36edc27af676419ff269a10d";

      it("generates expected public key with ed25519 private key", () => {
        expect(Buffer.from(privKey.toPublicKey().hash()).toString("hex")).toBe(
          expectedPublicKey
        );
      });

      it("generates expected signature with ed25519 private key and verify", () => {
        const sig = privKey.sign(Buffer.from(message, "hex")).toString("hex");
        expect(sig).toBe(expectedSig);
        expect(
          privKey.verify(Buffer.from(sig, "hex"), Buffer.from(message, "hex"))
        );
      });
    });
  });
});
