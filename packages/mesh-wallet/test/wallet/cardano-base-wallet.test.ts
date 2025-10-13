import { MeshTxBuilder } from "@meshsdk/transaction";

import { BaseCardanoWallet } from "../../src/cardano/wallet/cardano-base-wallet";

describe("CardanoBaseWallet", () => {
  it("should create correct wallet from signer", async () => {
    const wallet = await BaseCardanoWallet.fromMnemonic(
      0,
      "solution,".repeat(24).split(",").slice(0, 24),
    );

    expect(await wallet.getChangeAddress()).toBe(
      "005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
    );
  });

  it("should create correct wallet from wallet sources", async () => {
    const wallet = await BaseCardanoWallet.fromWalletSources(0, {
      paymentKey: {
        type: "ed25519ExtendedPrivateKeyHex",
        keyHex:
          "f083e5878c6f980c53d30b9cc2baadd780307b08acec9e0792892e013bbe9241eebbb8e9d5d47d91cafc181111fdba61513bbbe6e80127e3b6237bcf347e9d05",
      },
      stakeKey: {
        type: "ed25519ExtendedPrivateKeyHex",
        keyHex:
          "b810d6398db44f380a9ab279f63950c4b95432f44fafb5a6f026afe23bbe92416a05410d56bb31b9e3631ae60ecabaec2b0355bfc8c830da138952ea9454de50",
      },
    });

    expect(await wallet.getChangeAddress()).toBe(
      "005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e6",
    );
    expect((wallet as any).address.getBaseAddressBech32()).toBe(
      "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
    );

    const wallet2 = await BaseCardanoWallet.fromWalletSources(0, {
      paymentKey: {
        type: "ed25519PrivateKeyHex",
        keyHex:
          "d4ffb1e83d44b66849b4f16183cbf2ba1358c491cfeb39f0b66b5f811a88f182",
      },
    });
    expect(await wallet2.getChangeAddress()).toBe(
      "6091af38e77f68201a084e6cbe7a5e13477678d866afbbbb26c61e86fc",
    );
    expect((wallet2 as any).address.getEnterpriseAddressBech32()).toBe(
      "addr_test1vzg67w880a5zqxsgfektu7j7zdrhv7xcv6hmhwexcc0gdlqm7wz4f",
    );
    expect((wallet2 as any).signer.paymentSigner.getPublicKey()).resolves.toBe(
      "a5aa30e677bdd5936095f0f16b29f2716e35a909163a51f91995a1c3ed19a9e1",
    );
  });
});
