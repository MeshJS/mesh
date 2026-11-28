import { addWitnesses, signedKeyHashes } from "../../src/tx-builder";

/*
 * A process that only merges signatures: no wallet is made and nothing is awaited before the
 * two calls, so they must start the signature check themselves.
 */

/** An unsigned payment of the fixture's preprod wallet */
const tx =
  "84a300d9010281825820cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc000182825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a001e8480825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a00778133021a000290cda0f5f6";
/** The wallet's witness set for it, as `signTx(tx, true, false)` gives it */
const witnessSet =
  "a10081825820c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f955840452c3157e857ad63ed729b6b518110516a0f9cc1f5972faa39ad71f676e0287a5a13b86afe1f3bfde941f3340ad28c88c3e72d134b5e6695bfcfb26c9de1420a";
const keyHash = "5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f";

/** The transaction signed with that witness set, the set tagged as the body's sets are */
const signedTx =
  tx.slice(0, -"a0f5f6".length) +
  "a100d9010281" +
  witnessSet.slice("a10081".length) +
  "f5f6";

describe("signing functions on a cold start", () => {
  it("verify signatures without anything awaited before", async () => {
    // Both calls start before anything else is awaited
    const [keys, signed] = await Promise.all([
      signedKeyHashes(signedTx),
      addWitnesses(tx, witnessSet),
    ]);
    expect(keys).toEqual([keyHash]);
    expect(signed).toBe(signedTx);
  });
});
