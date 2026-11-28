import { createPrivateKey, sign } from "node:crypto";

import {
  addWitnesses,
  keySigner,
  signedKeyHashes,
  signWitnesses,
} from "../../src/tx-builder";

/*
 * A process that only signs with keys: nothing is awaited before the signers are asked, so they
 * must start the crypto library themselves. The test is alone in its file, as the library is
 * started once.
 */

/** RFC 8032, section 7.1, test 1: a public test key */
const key = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const keyHash = "35dedd2982a03cf39e7dce03c839994ffdec2ec6b04f1cf2d40e61a3";
/** An unsigned payment, and its hash */
const tx =
  "84a300d9010281825820cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc000182825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a001e8480825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a00778133021a000290cda0f5f6";
const txHash =
  "453814294bb5d1e52540785b425ca9ffe7086feb71b84fda563b1de5c1e5c595";

/** The signature node:crypto makes with the key */
const expected = () =>
  sign(
    null,
    Buffer.from(txHash, "hex"),
    createPrivateKey({
      key: Buffer.from(`302e020100300506032b657004220420${key}`, "hex"),
      format: "der",
      type: "pkcs8",
    }),
  ).toString("hex");

describe("key signers on a cold start", () => {
  it("sign without anything awaited before", async () => {
    // Both signers are asked before anything else is awaited
    const [answer, witnesses] = await Promise.all([
      keySigner(key).signTxHash({ txHash, tx }),
      signWitnesses(keySigner(`5820${key}`), tx),
    ]);
    expect(answer[0]?.signature === expected()).toBe(true);
    expect(await signedKeyHashes(await addWitnesses(tx, witnesses))).toEqual([
      keyHash,
    ]);
  });
});
