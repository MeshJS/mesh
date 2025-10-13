import { Ed25519PublicKey, Ed25519PublicKeyHex } from "@cardano-sdk/crypto";

import { BaseBip32 } from "../../src/bip32/base-bip32";
import { HARDENED_OFFSET } from "../../src/utils/constants";

describe("BaseBip32", () => {
  it("should create a BaseBip32 instance from mnemonic", async () => {
    const bip32 = await BaseBip32.fromMnemonic(
      "solution,".repeat(24).split(",").slice(0, 24),
    );

    expect(bip32).toBeInstanceOf(BaseBip32);
    let accountKey = await bip32.derive([
      1852 + HARDENED_OFFSET,
      1815 + HARDENED_OFFSET,
      0 + HARDENED_OFFSET,
    ]);

    accountKey = await accountKey.derive([0, 0]);
    const paymentSigner = await accountKey.toSigner();

    expect(
      Ed25519PublicKey.fromHex(
        Ed25519PublicKeyHex(await paymentSigner.getPublicKey()),
      )
        .hash()
        .hex(),
    ).toBe("5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f");
  });
});
