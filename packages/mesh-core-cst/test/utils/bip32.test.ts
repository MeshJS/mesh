import { ready } from "@cardano-sdk/crypto";

import { mnemonicToEntropy } from "@meshsdk/common";

import {
  buildBip32PrivateKey,
  buildEd25519PrivateKeyFromSecretKey,
  buildKeys,
} from "../../src";

describe("BIP32 Key Derivation", () => {
  beforeAll(() => ready());

  it("should derive BIP32 keys correctly", async () => {
    const entropy = mnemonicToEntropy(
      "solution,".repeat(24).split(",").slice(0, 24).join(" "),
    );

    const { paymentKey, stakeKey, dRepKey } = buildKeys(
      buildBip32PrivateKey(entropy).hex(),
      0,
      0,
    );

    expect(paymentKey.hex()).toEqual(
      "f083e5878c6f980c53d30b9cc2baadd780307b08acec9e0792892e013bbe9241eebbb8e9d5d47d91cafc181111fdba61513bbbe6e80127e3b6237bcf347e9d05",
    );

    expect(stakeKey.hex()).toEqual(
      "b810d6398db44f380a9ab279f63950c4b95432f44fafb5a6f026afe23bbe92416a05410d56bb31b9e3631ae60ecabaec2b0355bfc8c830da138952ea9454de50",
    );

    expect(dRepKey!.hex()).toEqual(
      "d0d688c2656084823bbfb439b6b948789ee55119e4a9989713f197b835be9241b326dd8ba8bcb632ed4a991b874e950e9d10e3dd68c4569e771148179497c5bb",
    );
  });

  it("should derive keys from secret correctly", async () => {
    const privateKeyHex: [string, string] = [
      "f083e5878c6f980c53d30b9cc2baadd780307b08acec9e0792892e013bbe9241",
      "b810d6398db44f380a9ab279f63950c4b95432f44fafb5a6f026afe23bbe9241",
    ];

    const paymentKey = buildEd25519PrivateKeyFromSecretKey(privateKeyHex[0]);
    const stakeKey = buildEd25519PrivateKeyFromSecretKey(privateKeyHex[1]);

    expect(paymentKey.hex()).toEqual(
      "484e934a6c950a9df50b4a8c2163b7eff51704c6c28349d7b3331523a072234ba0b9dac005eeb945581ceab4de83fd83e4ead554ebdbceeade9a0b17e5f0c0c6",
    );
    expect(stakeKey.hex()).toEqual(
      "98f39207b3bf13df8af53d2709b7e930181336befff1370db2a840daa5ece05437beceb0fed3bbdbc1c7669794c6fea3977855778ed803dec129aea0e97bb75e",
    );
  });
});
