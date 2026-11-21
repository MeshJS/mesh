import { inConwayEra, setInConwayEra } from "@cardano-sdk/core";
import * as Crypto from "@cardano-sdk/crypto";

import { CardanoSDKSerializer } from "../../src/serializer";
import {
  Ed25519PublicKeyHex,
  Ed25519SignatureHex,
  Transaction,
  TxCBOR,
  VkeyWitness,
} from "../../src/types";
import {
  addVKeyWitnessesToTransaction,
  addVKeyWitnessSetToTransaction,
  keyWitnessSetTags,
  vkeyWitnessSetFor,
} from "../../src/utils/witness-set";

describe("Witness Set", () => {
  it("should append witness set vkeys correctly", () => {
    const tx =
      "84a40081825820ad91133a2c769247d384c0519206766e755b50847b41504b8555932917e492a90201818258390004845038ee499ee8bc0afe56f688f27b2dd76f230d3698a9afcc1b66e0464447c1f51adaefe1ebfb0dd485a349a70479ced1d198cbdf7fe71a38c5ed05021a00028b21075820bdaa99eb158414dea0a91d6c727e2268574b23efe6e08ab3b841abe8059a030ca0f5d90103a0";
    const signature =
      "a1008182582089f4b576f05f5aad99bce0bdd51afe48529772f7561bb2ac9d84a4afbda1ecd658402702ebaab96e33259eacc175edffcf5b74cdb2bc28d8bf0a99e5c3bb4999597828470aa46ea6baf2d3234efc11e81bb7907a992a0ff97c94725e4fe290eef006";

    const newTx = addVKeyWitnessSetToTransaction(tx, signature);
    expect(newTx).toEqual(
      "84a40081825820ad91133a2c769247d384c0519206766e755b50847b41504b8555932917e492a90201818258390004845038ee499ee8bc0afe56f688f27b2dd76f230d3698a9afcc1b66e0464447c1f51adaefe1ebfb0dd485a349a70479ced1d198cbdf7fe71a38c5ed05021a00028b21075820bdaa99eb158414dea0a91d6c727e2268574b23efe6e08ab3b841abe8059a030ca1008182582089f4b576f05f5aad99bce0bdd51afe48529772f7561bb2ac9d84a4afbda1ecd658402702ebaab96e33259eacc175edffcf5b74cdb2bc28d8bf0a99e5c3bb4999597828470aa46ea6baf2d3234efc11e81bb7907a992a0ff97c94725e4fe290eef006f5d90103a0",
    );
  });
});

/** A body spending one input and paying one output, its inputs with the set tag or without */
const body = (tagged: boolean) =>
  `a300${tagged ? "d90102" : ""}81825820${"11".repeat(32)}00` +
  `018182583900${"22".repeat(56)}1a000f4240021a0002a3b0`;
/** A transaction of these items: its validity flag true and no auxiliary data by default */
const tx = (bodyHex: string, witnessSet = "a0", valid = "f5", aux = "f6") =>
  `84${bodyHex}${witnessSet}${valid}${aux}`;
/** A vkey witness of its own key: the signatures are not checked here */
const witness = (n: number) =>
  new VkeyWitness(
    Ed25519PublicKeyHex(n.toString(16).padStart(64, "0")),
    Ed25519SignatureHex("ee".repeat(64)),
  );
const written = (n: number) =>
  `825820${n.toString(16).padStart(64, "0")}5840${"ee".repeat(64)}`;
const tag = (tagged: boolean) => (tagged ? "d90102" : "");
const txId = (txHex: string) => Transaction.fromCbor(TxCBOR(txHex)).getId();

describe("the form of the vkey witnesses written into a transaction", () => {
  it("writes a new vkey set in the form of the body's inputs", () => {
    for (const tagged of [true, false]) {
      const unsigned = tx(body(tagged));
      expect(keyWitnessSetTags(unsigned)).toEqual({
        vkey: tagged,
        bootstrap: tagged,
      });
      expect(addVKeyWitnessesToTransaction(unsigned, [witness(1)])).toBe(
        tx(body(tagged), `a100${tag(tagged)}81${written(1)}`),
      );
      expect(vkeyWitnessSetFor(unsigned, [witness(1), witness(2)])).toBe(
        `a100${tag(tagged)}82${written(1)}${written(2)}`,
      );
      expect(
        addVKeyWitnessSetToTransaction(unsigned, `a10081${written(1)}`),
      ).toBe(tx(body(tagged), `a100${tag(tagged)}81${written(1)}`));
    }
    expect(vkeyWitnessSetFor(tx(body(true)), [])).toBe("a0");
  });

  it("keeps the form of a vkey set the transaction holds, in a body of either form", () => {
    for (const tagged of [true, false])
      for (const held of [true, false]) {
        const signed = tx(body(tagged), `a100${tag(held)}81${written(1)}`);
        expect(keyWitnessSetTags(signed)).toEqual({
          vkey: held,
          bootstrap: tagged,
        });
        expect(addVKeyWitnessesToTransaction(signed, [witness(2)])).toBe(
          tx(body(tagged), `a100${tag(held)}82${written(1)}${written(2)}`),
        );
        expect(vkeyWitnessSetFor(signed, [witness(2)])).toBe(
          `a100${tag(held)}81${written(2)}`,
        );
        // A key that has signed, or given twice, is added once
        expect(
          addVKeyWitnessesToTransaction(signed, [witness(1), witness(2)]),
        ).toBe(addVKeyWitnessesToTransaction(signed, [witness(2), witness(2)]));
        expect(addVKeyWitnessesToTransaction(signed, [witness(1)])).toBe(
          signed,
        );
      }
    // A bootstrap set holds its own form, and an empty set keeps its form too
    expect(
      keyWitnessSetTags(tx(body(false), "a200d901028002d9010280")),
    ).toEqual({ vkey: true, bootstrap: true });
    expect(
      addVKeyWitnessesToTransaction(tx(body(true), "a10080"), [witness(1)]),
    ).toBe(tx(body(true), `a10081${written(1)}`));
  });

  it("writes only the vkey entry: the body, the other entries, the flag and the data keep their bytes", () => {
    // Native scripts with the set tag, data without, in a body without tags; a map of
    // indefinite length; a transaction marked failing, with auxiliary data
    const native = `01d9010281820181${"8200581c" + "44".repeat(28)}`;
    const data = "048100";
    for (const [set, signed] of [
      [`a2${native}${data}`, `a300${"81" + written(1)}${native}${data}`],
      [`bf${data}${native}ff`, `bf00${"81" + written(1)}${data}${native}ff`],
      [
        `a2${native}00${"81" + written(2)}`,
        `a2${native}00${"82" + written(2) + written(1)}`,
      ],
    ] as const) {
      const unsigned = tx(body(false), set, "f4", "a11902a2a0");
      const result = addVKeyWitnessesToTransaction(unsigned, [witness(1)]);
      expect(result).toBe(tx(body(false), signed, "f4", "a11902a2a0"));
      expect(txId(result)).toBe(txId(unsigned));
      expect(Transaction.fromCbor(TxCBOR(result)).isValid()).toBe(false);
    }
  });

  it("restores the set-tag flag of the SDK after writing, whatever it was", () => {
    const before = inConwayEra;
    try {
      for (const flag of [true, false]) {
        setInConwayEra(flag);
        for (const tagged of [true, false]) {
          const unsigned = tx(body(tagged));
          expect(addVKeyWitnessesToTransaction(unsigned, [witness(1)])).toBe(
            tx(body(tagged), `a100${tag(tagged)}81${written(1)}`),
          );
          expect(inConwayEra).toBe(flag);
          expect(vkeyWitnessSetFor(unsigned, [witness(1)])).toBe(
            `a100${tag(tagged)}81${written(1)}`,
          );
          expect(inConwayEra).toBe(flag);
        }
      }
    } finally {
      setInConwayEra(before);
    }
  });

  it("refuses a witness set that repeats a key, any key: of its vkey, of its bootstrap witnesses or another", () => {
    for (const set of [
      `a200${"81" + written(1)}00${"81" + written(2)}`,
      `a2008000${"81" + written(2)}`,
      "a20280" + "0280",
      "a30080" + "0480" + "0480",
    ])
      expect(() =>
        addVKeyWitnessesToTransaction(tx(body(false), set), [witness(3)]),
      ).toThrow(
        "the witness set of the transaction repeats a key, and a reader may take another entry than the one a witness is written into: none is written",
      );
  });

  it("signs with the serializer's keys in the form of the transaction", async () => {
    await Crypto.ready();
    const serializer = new CardanoSDKSerializer();
    const key = "5820" + "55".repeat(32);
    for (const tagged of [true, false]) {
      const unsigned = tx(body(tagged));
      const signed = serializer.addSigningKeys(unsigned, [key]);
      expect(signed.startsWith(`84${body(tagged)}a100${tag(tagged)}81`)).toBe(
        true,
      );
      expect(txId(signed)).toBe(txId(unsigned));
    }
  });
});
