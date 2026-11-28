import { NativeScript } from "@meshsdk/core";
import { Cardano, CborWriter, Crypto } from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";

import {
  keySigner,
  mint,
  toMeshUtxo,
  TxBuilder,
  validity,
} from "../../src/tx-builder";

/*
 * A native script whose time lock holds a slot past 2^53, built, signed and taken by a
 * validator: the bytes the builder writes are the ones the ledger reads. Scalus reads a slot as a
 * signed integer of 64 bits, and refuses a transaction that holds one of 2^63 or more; the
 * ledger, and cquisitor, read up to 2^64 - 1.
 */

const KEY = "11".repeat(32);
/** The hash of the key `KEY`, checked in `beforeAll` */
const keyHash = "5ae193abe694a607531e20f85d8358ade9a474a4f45ac4e15e962da1";
const address = Cardano.EnterpriseAddress.fromCredentials(0, {
  type: Cardano.CredentialType.KeyHash,
  hash: keyHash as Cardano.Credential["hash"],
})
  .toAddress()
  .toBech32();
const int = (n: bigint) => new CborWriter().writeInt(n).encodeAsHex();
/** `all` of the key and `before` the slot, as CBOR */
const lockedBefore = (slot: bigint) =>
  `820182${`8200581c${keyHash}`}8205${int(slot)}`;

beforeAll(async () => {
  await Crypto.ready();
  expect(
    Crypto.Ed25519PrivateKey.fromNormalHex(KEY).toPublic().hash().hex(),
  ).toBe(keyHash);
});

describe.each(["scalus", "cquisitor"] as const)(
  "A time lock past 2^53, submitted (%s)",
  (validator) => {
    const SLOTS = [2n ** 53n + 1n, 2n ** 63n - 1n, 2n ** 63n, 2n ** 64n - 1n];
    it.each(SLOTS.map((slot) => [slot.toString(), slot]))(
      "builds and signs a mint under `before %s`, given as CBOR and as an object, which the validator takes (Scalus below 2^63)",
      async (_, slot) => {
        for (const script of [
          lockedBefore(slot),
          {
            type: "all",
            scripts: [
              { type: "sig", keyHash },
              { type: "before", slot: slot.toString() },
            ],
          } as NativeScript,
        ]) {
          const emulator = await TxEmulator.create({
            validator,
            network: "preprod",
            utxos: [
              toMeshUtxo({
                txHash: "f".repeat(64),
                outputIndex: 0,
                address,
                value: { lovelace: 100_000_000n },
              }),
            ],
          });
          const builder = new TxBuilder({
            network: "preprod",
            provider: emulator,
          });
          const built = await builder.build(
            [
              mint.native({ script, assets: { "41": 1n } }),
              validity({ until: Date.now() + 3_600_000 }),
            ],
            { payer: address },
          );
          await built.sign({ signers: keySigner(KEY) });
          if (validator === "scalus" && slot >= 2n ** 63n)
            await expect(emulator.submitTx(built.signedTx!)).rejects.toThrow(
              "Expected Long but got OverLong",
            );
          else
            expect(await emulator.submitTx(built.signedTx!)).toBe(built.txHash);
        }
      },
      60_000,
    );
  },
);
