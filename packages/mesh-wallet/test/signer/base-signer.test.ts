import { Transaction, TxCBOR } from "@meshsdk/core-cst";

import { InMemoryBip32 } from "../../src";

const HARDENED_OFFSET = 0x80000000;

describe("BaseSigner", () => {
  it("base wallet signing should produce correct signature", async () => {
    const bip32 = await InMemoryBip32.fromMnemonic(
      "globe cupboard camera aim congress cradle decorate enter fringe dove margin witness police coral junk genius harbor fire evolve climb rather broccoli post snack".split(
        " ",
      ),
    );

    const paymentSigner = await bip32.getSigner([
      1852 + HARDENED_OFFSET,
      1815 + HARDENED_OFFSET,
      0 + HARDENED_OFFSET,
      0,
      0,
    ]);

    expect(
      await paymentSigner.sign(
        Transaction.fromCbor(
          TxCBOR(
            "84a500d9010281825820a470216e713ffdb9c2dcc473ed53a337c7176d8aaf0d0bfc686ab6f11641a200020181825839003f1b5974f4f09f0974be655e4ce94f8a2d087df378b79ef3916c26b2b1f70b573b204c6695b8f66eb6e7c78c55ede9430024ebec6fd5f85d821a1c0ec17fa1581c24c41ab3924359ea8a9b5a815514192dc7f683e2bb121db47405e9bfa1494d657368546f6b656e01021a0002ca3507582099fec4b2c36aeaf674ff7c894e1c8c28f6547eea55b1d43a29ad1d2a8b53ba6a09a1581c24c41ab3924359ea8a9b5a815514192dc7f683e2bb121db47405e9bfa1494d657368546f6b656e01a101d90102818200581c3f1b5974f4f09f0974be655e4ce94f8a2d087df378b79ef3916c26b2f5a11902d1a178383234633431616233393234333539656138613962356138313535313431393264633766363833653262623132316462343734303565396266a1694d657368546f6b656ea4646e616d656a4d65736820546f6b656e65696d6167657835697066733a2f2f516d527a6963705265757477436b4d36616f74754b6a4572464355443231334470775071364279757a4d4a617561696d656469615479706569696d6167652f6a70676b6465736372697074696f6e783254686973204e465420776173206d696e746564206279204d657368202868747470733a2f2f6d6573686a732e6465762f292e",
          ),
        ).getId(),
      ),
    ).toBe(
      "413aa5097637a3ffbc7e81d4ab7ca3041113739574f6c3ef3c8b11bdbfbdefa7f6f7908b206283d28a469fec7e6a322d6acd38d81ea3a88285f0b809fc0eb903",
    );
  });
});
