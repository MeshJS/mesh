import {
  createHash,
  createPrivateKey,
  sign as nodeSign,
  randomBytes,
} from "node:crypto";
import { inspect } from "node:util";
import { bech32 } from "bech32";

import { mnemonicToEntropy } from "@meshsdk/common";
import { Crypto, HexBlob } from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

import type { SignOptions, TxHashSigner } from "../../src/tx-builder";
import {
  addWitnesses,
  keySigner,
  output,
  signedKeyHashes,
  signWitnesses,
  TxBuildError,
  TxError,
  TxPlanError,
} from "../../src/tx-builder";
import { baseAddress } from "../test-util";
import { builderOf, emulatorOf } from "./plan/plan-emulator-util";

/*
 * Keys of these tests: the key of RFC 8032's first test vector, the payment key of the tests'
 * mnemonic, and keys made here. A failed check prints hashes, public keys, signatures, booleans
 * or the names of fixtures, never a key: no key is given to expect().
 */

/** An unsigned payment of the tests' mnemonic wallet, and its hash */
const tx =
  "84a300d9010281825820cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc000182825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a001e8480825839005867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f9d4dcd7e454d2434164f4efb8edeb358d86a1dad9ec6224cfcbce3e61a00778133021a000290cda0f5f6";
const txHash =
  "453814294bb5d1e52540785b425ca9ffe7086feb71b84fda563b1de5c1e5c595";
/** The witness the mnemonic wallet made for it, recorded */
const recorded = {
  vkey: "c32dfdb461dd016e8fdd9b6d424a77439eab8f8c644a804b013b6cefa2454f95",
  signature:
    "452c3157e857ad63ed729b6b518110516a0f9cc1f5972faa39ad71f676e0287a5a13b86afe1f3bfde941f3340ad28c88c3e72d134b5e6695bfcfb26c9de1420a",
};
const recordedKeyHash =
  "5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f";

/** Another transaction: the same, with another fee */
const otherTx = tx.replace("021a000290cd", "021a000290ce");

/** RFC 8032, section 7.1, test 1 */
const rfc = {
  key: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
  vkey: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
  keyHash: "35dedd2982a03cf39e7dce03c839994ffdec2ec6b04f1cf2d40e61a3",
};

const words = Array(24).fill("solution");

/** A key made for the key file of these tests */
const fileKey = createHash("sha256").update("key file").digest("hex");
/** A cardano-cli signing key file of that key, as read from disk */
const keyFile = `${JSON.stringify(
  {
    type: "PaymentSigningKeyShelley_ed25519",
    description: "Payment Signing Key",
    cborHex: `5820${fileKey}`,
  },
  null,
  4,
)}\n`;
const HARDENED = 0x80000000;

const toBech32 = (prefix: string, hex: string) =>
  bech32.encode(prefix, bech32.toWords(Buffer.from(hex, "hex")), 1023);

/** The signature node:crypto makes with a 32-byte Ed25519 key */
const nodeSignature = (key: string, message: string) =>
  nodeSign(
    null,
    Buffer.from(message, "hex"),
    createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        Buffer.from(key, "hex"),
      ]),
      format: "der",
      type: "pkcs8",
    }),
  ).toString("hex");

const clamped = (hex: string) => {
  const bytes = Buffer.from(hex, "hex");
  return (bytes[0]! & 0x07) === 0 && (bytes[31]! & 0xc0) === 0x40;
};

/** Every text a value shows: as JSON, as printed, and of an error its message, stack and cause */
const textsOf = (value: unknown): string[] => {
  const texts = [inspect(value, { depth: Infinity, showHidden: true })];
  try {
    texts.push(String(JSON.stringify(value)));
  } catch (error) {
    texts.push(String(error));
  }
  if (value instanceof Error)
    texts.push(value.message, String(value.stack), ...textsOf(value.cause));
  return texts;
};

/** The names of the secrets found in what a value shows, in either case */
const shownSecrets = (value: unknown, secrets: Record<string, string>) => {
  const all = textsOf(value).join("\n").toLowerCase();
  return Object.entries(secrets)
    .filter(([, secret]) => all.includes(secret.toLowerCase()))
    .map(([name]) => name);
};

const caught = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected an error");
};

const asBuildError = (error: unknown) => {
  expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
  return error as TxBuildError<"INVALID_OPTION">;
};

/** The witness a signer of hashes answers for the recorded transaction */
const answerOf = (signer: TxHashSigner, keyHashes?: readonly string[]) =>
  signer.signTxHash({ txHash, tx, ...(keyHashes && { keyHashes }) });

/** The fixtures that need the crypto library: built once */
const fixtures = async () => {
  await Crypto.ready();
  const root = Crypto.Bip32PrivateKey.fromBip39Entropy(
    Buffer.from(mnemonicToEntropy(words.join(" ")), "hex"),
    "",
  );
  const payment = root.derive([
    HARDENED + 1852,
    HARDENED + 1815,
    HARDENED,
    0,
    0,
  ]);
  const raw = payment.toRawKey();
  /** 64 bytes: the extended key */
  const extended = raw.hex() as string;
  /** 96 bytes: the extended key and its chain code */
  const chained = payment.hex() as string;
  const vkey = raw.toPublic().hex() as string;
  /** 128 bytes: the extended key, its public key and its chain code */
  const full = extended + vkey + chained.slice(128);
  return {
    root,
    rootHex: root.hex() as string,
    account: root
      .derive([HARDENED + 1852, HARDENED + 1815, HARDENED])
      .hex() as string,
    extended,
    chained,
    full,
    vkey,
  };
};

type Fixtures = Awaited<ReturnType<typeof fixtures>>;

describe("keySigner", () => {
  let f: Fixtures;
  beforeAll(async () => {
    f = await fixtures();
  });

  describe("known answers", () => {
    it("signs with RFC 8032's key as node:crypto does", async () => {
      const answer = await answerOf(keySigner(rfc.key));
      expect(answer).toEqual([
        { vkey: rfc.vkey, signature: nodeSignature(rfc.key, txHash) },
      ]);
      expect(Crypto.blake2b.hash(HexBlob(rfc.vkey), 28).toString()).toBe(
        rfc.keyHash,
      );
      expect(
        await answerOf(keySigner(rfc.key), [rfc.keyHash.toUpperCase()]),
      ).toEqual(answer);
    });

    it("reads a 32-byte key in each encoding as the library key", async () => {
      const library = Crypto.Ed25519PrivateKey.fromNormalBytes(
        Buffer.from(rfc.key, "hex"),
      );
      const expected = [
        {
          vkey: library.toPublic().hex(),
          signature: library.sign(HexBlob(txHash)).hex(),
        },
      ];
      const encodings: Record<string, string> = {
        hex: rfc.key,
        "hex in upper case, with spaces around": ` ${rfc.key.toUpperCase()}\n`,
        "cborHex 5820": `5820${rfc.key}`,
        "bech32 in upper case": toBech32("ed25519_sk", rfc.key).toUpperCase(),
      };
      for (const prefix of [
        "ed25519_sk",
        "addr_sk",
        "stake_sk",
        "drep_sk",
        "cc_cold_sk",
        "cc_hot_sk",
        "pool_sk",
        "policy_sk",
        "addr_shared_sk",
        "stake_shared_sk",
      ])
        encodings[`bech32 ${prefix}`] = toBech32(prefix, rfc.key);
      const differing: string[] = [];
      for (const [name, text] of Object.entries(encodings))
        if (
          JSON.stringify(await answerOf(keySigner(text))) !==
          JSON.stringify(expected)
        )
          differing.push(name);
      expect(differing).toEqual([]);
    });

    it("reads the mnemonic's payment key in each extended encoding and signs as the wallet did", async () => {
      const expected = [recorded];
      const library = Crypto.Ed25519PrivateKey.fromExtendedBytes(
        Buffer.from(f.extended, "hex"),
      );
      expect(library.sign(HexBlob(txHash)).hex()).toBe(recorded.signature);
      const encodings: Record<string, string> = {
        "hex of 64 bytes": f.extended,
        "cborHex 5880": `5880${f.full}`,
        "bech32 ed25519e_sk": toBech32("ed25519e_sk", f.extended),
      };
      for (const prefix of [
        "addr_xsk",
        "stake_xsk",
        "drep_xsk",
        "cc_cold_xsk",
        "cc_hot_xsk",
        "pool_xsk",
        "addr_shared_xsk",
        "stake_shared_xsk",
      ]) {
        encodings[`bech32 ${prefix} of 96 bytes`] = toBech32(prefix, f.chained);
        encodings[`bech32 ${prefix} of 128 bytes`] = toBech32(prefix, f.full);
      }
      const differing: string[] = [];
      for (const [name, text] of Object.entries(encodings))
        if (
          JSON.stringify(await answerOf(keySigner(text), [recordedKeyHash])) !==
          JSON.stringify(expected)
        )
          differing.push(name);
      expect(differing).toEqual([]);
    });

    it("gives the witnesses MeshWallet gives, for a cardano-cli key and for the mnemonic's payment key", async () => {
      const cli = new MeshWallet({
        networkId: 0,
        key: { type: "cli", payment: `5820${rfc.key}` },
      });
      const mnemonic = new MeshWallet({
        networkId: 0,
        key: { type: "mnemonic", words },
      });
      const cases: [MeshWallet, string, string][] = [
        [cli, `5820${rfc.key}`, rfc.keyHash],
        [mnemonic, toBech32("addr_xsk", f.chained), recordedKeyHash],
        [mnemonic, `5880${f.full}`, recordedKeyHash],
      ];
      for (const [wallet, key, keyHash] of cases) {
        const byWallet = await addWitnesses(
          tx,
          await wallet.signTxWitnesses(tx, [keyHash]),
        );
        const byKey = await addWitnesses(
          tx,
          await signWitnesses(keySigner(key), tx, [keyHash]),
        );
        expect(byKey).toBe(byWallet);
        expect(await signedKeyHashes(byKey)).toEqual([keyHash]);
      }
    });
  });

  describe("refusals", () => {
    /** The cases; a function makes the value, as some need the fixtures */
    const refused: [string, (f: Fixtures) => unknown, string, string][] = [
      [
        "bech32 root_xsk",
        (f) => toBech32("root_xsk", f.rootHex),
        "string",
        "the prefix root_xsk, which needs a derivation path",
      ],
      [
        "bech32 root_shared_xsk",
        (f) => toBech32("root_shared_xsk", f.rootHex),
        "string",
        "derivation path",
      ],
      [
        "bech32 acct_xsk",
        (f) => toBech32("acct_xsk", f.account),
        "string",
        "the prefix acct_xsk, which needs a derivation path",
      ],
      [
        "bech32 xprv",
        (f) => toBech32("xprv", f.rootHex),
        "string",
        "the prefix xprv, which needs a derivation path",
      ],
      ["hex of 96 bytes", (f) => f.chained, "string", "hex of 96 bytes"],
      ["hex of 31 bytes", () => rfc.key.slice(2), "string", "hex of 31 bytes"],
      ["hex of 33 bytes", () => `${rfc.key}00`, "string", "hex of 33 bytes"],
      [
        "hex of an odd length",
        () => rfc.key.slice(1),
        "string",
        "hex of 63 digits",
      ],
      [
        "cborHex 5820 with 31 bytes",
        () => `5820${rfc.key.slice(2)}`,
        "string",
        "hex of 33 bytes",
      ],
      [
        "cborHex 5880 with a short key",
        (f) => `5880${f.full.slice(2)}`,
        "string",
        "hex of 129 bytes",
      ],
      [
        "hex of 128 bytes without its CBOR head",
        (f) => f.full,
        "string",
        "hex of 128 bytes",
      ],
      [
        "bech32 with a wrong character",
        () =>
          toBech32("ed25519_sk", rfc.key).replace(/.$/, (c) =>
            c === "q" ? "p" : "q",
          ),
        "string",
        "neither hex nor bech32",
      ],
      [
        "bech32 in mixed case",
        () =>
          toBech32("ed25519_sk", rfc.key).replace("ed25519_sk", "Ed25519_sk"),
        "string",
        "neither hex nor bech32",
      ],
      [
        "bech32 ed25519_sk of 64 bytes",
        (f) => toBech32("ed25519_sk", f.extended),
        "string",
        "a key with the prefix ed25519_sk of 64 bytes",
      ],
      [
        "bech32 ed25519e_sk of 32 bytes",
        () => toBech32("ed25519e_sk", rfc.key),
        "string",
        "a key with the prefix ed25519e_sk of 32 bytes",
      ],
      [
        "bech32 addr_xsk of 64 bytes",
        (f) => toBech32("addr_xsk", f.extended),
        "string",
        "a key with the prefix addr_xsk of 64 bytes",
      ],
      [
        "bech32 kes_sk",
        () => toBech32("kes_sk", rfc.key),
        "string",
        "the prefix kes_sk",
      ],
      [
        "bech32 vrf_sk",
        () => toBech32("vrf_sk", rfc.key + rfc.vkey),
        "string",
        "the prefix vrf_sk",
      ],
      [
        "bech32 addr_vk",
        () => toBech32("addr_vk", rfc.vkey),
        "string",
        "the prefix addr_vk",
      ],
      ["an address", () => baseAddress(1), "string", "the prefix addr_test"],
      [
        "a mnemonic",
        () => words.join(" "),
        "string",
        "text of 24 words: a mnemonic",
      ],
      [
        "a mnemonic of 12 words",
        () => words.slice(0, 12).join("  "),
        "string",
        "text of 12 words: a mnemonic",
      ],
      [
        "a cardano-cli signing key file",
        () => keyFile,
        "string",
        `text of ${keyFile.trim().length} characters with whitespace inside: give the key's hex, the cborHex of a key file, or its bech32`,
      ],
      [
        "hex broken by a line",
        () => `${rfc.key.slice(0, 32)}\n${rfc.key.slice(32)}`,
        "string",
        "text of 65 characters with whitespace inside",
      ],
      [
        "words that are not a mnemonic",
        () => words.slice(0, 11).join(" "),
        "string",
        "with whitespace inside",
      ],
      ["an empty text", () => "", "string", "an empty text"],
      ["spaces", () => "  \n", "string", "an empty text"],
      ["a number", () => 5, "number", "a value of type number"],
      ["null", () => null, "null", "a value of type null"],
      ["undefined", () => undefined, "undefined", "a value of type undefined"],
      [
        "an object holding a key",
        () => ({ privateKey: rfc.key }),
        "object",
        "a value of type object",
      ],
      [
        "bytes",
        () => Buffer.from(rfc.key, "hex"),
        "object",
        "a value of type object",
      ],
      [
        "an unclamped extended key: a 32-byte key followed by its public key",
        () => rfc.key + rfc.vkey,
        "string",
        "not a clamped scalar",
      ],
    ];

    it.each(refused)(
      "refuses %s at the call, holding nothing of it",
      (_, make, type, got) => {
        const value = make(f);
        const error = asBuildError(
          (() => {
            try {
              keySigner(value as string);
            } catch (error) {
              return error;
            }
            return undefined;
          })(),
        );
        expect(error).toBeInstanceOf(TxBuildError);
        expect(error.details.option).toBe("key");
        expect(error.details.value === type).toBe(true);
        expect(error.details.allowed).toContain("hex of 32 bytes");
        expect(error.cause).toBeUndefined();
        expect("cause" in error).toBe(false);
        // The message names the form found, after "got"
        expect(error.message.split("; got ")[1]?.includes(got)).toBe(true);
        const secrets: Record<string, string> = {
          "the RFC key": rfc.key,
          "the payment key": f.extended,
          "the payment key's first half": f.extended.slice(0, 64),
          "the payment key's second half": f.extended.slice(64),
          "the root key": f.rootHex.slice(0, 64),
          "the account key": f.account.slice(0, 64),
          "the mnemonic": words.slice(0, 3).join(" "),
          "the key file's key": fileKey,
          "the key file's key, first half": fileKey.slice(0, 32),
          "the key file's key, second half": fileKey.slice(32),
        };
        if (typeof value === "string" && value.trim().length > 8)
          secrets["the text given"] = value.trim();
        if (typeof value === "string" && value.trim().length > 20)
          secrets["the end of the text given"] = value.trim().slice(-16);
        expect(shownSecrets(error, secrets)).toEqual([]);
      },
    );

    it("refuses a 32-byte key followed by its public key that passes the clamp check, at its first use, signing nothing", async () => {
      const seed = createHash("sha256").update("seed 22").digest("hex");
      expect(clamped(seed)).toBe(true);
      const vkey = Crypto.Ed25519PrivateKey.fromNormalBytes(
        Buffer.from(seed, "hex"),
      )
        .toPublic()
        .hex();
      const keyHash = Crypto.blake2b.hash(HexBlob(vkey), 28).toString();
      const secrets = { "the key": seed, "its public key": vkey };
      for (const text of [
        seed + vkey,
        toBech32("ed25519e_sk", seed + vkey),
        toBech32("addr_xsk", seed + vkey + "00".repeat(32)),
      ]) {
        // Read without the crypto library, it looks like an extended key
        const signer = keySigner(text);
        for (const keyHashes of [[keyHash], ["ab".repeat(28)], undefined]) {
          const error = asBuildError(
            await caught(() => answerOf(signer, keyHashes)),
          );
          expect(error.details.option).toBe("key");
          expect(
            error.message.includes("a 32-byte key followed by its public key"),
          ).toBe(true);
          expect(error.cause).toBeUndefined();
          expect(shownSecrets(error, secrets)).toEqual([]);
        }
        // Through signWitnesses: SIGNER_FAILED, with that error as its cause
        const failed = await caught(() => signWitnesses(signer, tx));
        expect(TxError.is(failed, "SIGNER_FAILED")).toBe(true);
        expect(
          TxError.is((failed as TxPlanError).cause, "INVALID_OPTION"),
        ).toBe(true);
        expect(shownSecrets(failed, secrets)).toEqual([]);
      }
      // Its first 32 bytes are the key
      expect((await answerOf(keySigner(seed)))[0]!.vkey).toBe(vkey);
    });

    it("refuses a key file whose public key is not its own, at its first use", async () => {
      const wrong = f.extended + rfc.vkey + f.chained.slice(128);
      const secrets = {
        "the key": f.extended.slice(0, 64),
        "its other half": f.extended.slice(64),
      };
      for (const text of [`5880${wrong}`, toBech32("addr_xsk", wrong)]) {
        const signer = keySigner(text);
        const error = asBuildError(
          await caught(() => answerOf(signer, [recordedKeyHash])),
        );
        expect(
          error.message.includes(
            "public key is not the public key of its signing key",
          ),
        ).toBe(true);
        expect(shownSecrets(error, secrets)).toEqual([]);
        // Every later use is refused too
        asBuildError(await caught(() => answerOf(signer)));
      }
    });
  });

  describe("signing", () => {
    it("signs when its key is asked for, answers with nothing when it is not, and signs without a list", async () => {
      const signer = keySigner(f.extended);
      expect(await answerOf(signer, [recordedKeyHash])).toEqual([recorded]);
      expect(
        await answerOf(signer, [
          "ab".repeat(28),
          recordedKeyHash.toUpperCase(),
        ]),
      ).toEqual([recorded]);
      expect(await answerOf(signer, ["ab".repeat(28)])).toEqual([]);
      expect(await answerOf(signer, [])).toEqual([]);
      expect(await answerOf(signer)).toEqual([recorded]);

      // As a signer of signWitnesses
      expect(await signWitnesses(signer, tx, ["ab".repeat(28)])).toBe("a0");
      const signed = await addWitnesses(tx, await signWitnesses(signer, tx));
      expect(await signedKeyHashes(signed)).toEqual([recordedKeyHash]);
    });

    it("signs only the hash of the body of the transaction it is shown", async () => {
      const signer = keySigner(rfc.key);
      const bad: [string, unknown, string][] = [
        ["the hash of another transaction", { txHash, tx: otherTx }, "txHash"],
        ["a hash of 33 bytes", { txHash: `${txHash}00`, tx }, "txHash"],
        ["a hash of 31 bytes", { txHash: txHash.slice(2), tx }, "txHash"],
        ["a hash that is not hex", { txHash: "zz".repeat(32), tx }, "txHash"],
        ["no hash", { tx }, "txHash"],
        ["no transaction", { txHash }, "tx"],
        ["a tx that is not a transaction", { txHash, tx: "00" }, "tx"],
        [
          "keyHashes that are not a list",
          { txHash, tx, keyHashes: rfc.keyHash },
          "keyHashes",
        ],
        ["no request", undefined, "request"],
      ];
      const signedAnyway: string[] = [];
      for (const [name, request, option] of bad) {
        const error = await caught(() => signer.signTxHash(request as never));
        if (
          !TxError.is(error, "INVALID_OPTION") ||
          error.details.option !== option ||
          error.cause !== undefined
        )
          signedAnyway.push(name);
      }
      expect(signedAnyway).toEqual([]);
      // The hash of the other transaction, shown with it, is signed
      const hashOfOther = (await signWitnesses(signer, otherTx)) !== "a0";
      expect(hashOfOther).toBe(true);
    });

    it("is one frozen member, which shows nothing of the key", async () => {
      const keys = {
        "the RFC key": rfc.key,
        "the payment key": f.extended,
        "the payment key's first half": f.extended.slice(0, 64),
        "the payment key's second half": f.extended.slice(64),
      };
      for (const signer of [keySigner(rfc.key), keySigner(`5880${f.full}`)]) {
        await answerOf(signer);
        expect(Object.getOwnPropertyNames(signer)).toEqual(["signTxHash"]);
        expect(Object.getOwnPropertySymbols(signer)).toEqual([]);
        expect(Object.isFrozen(signer)).toBe(true);
        expect(JSON.stringify(signer)).toBe("{}");
        expect(() => structuredClone(signer)).toThrow();
        expect(shownSecrets(signer, keys)).toEqual([]);
        expect(shownSecrets(String(signer.signTxHash), keys)).toEqual([]);
      }
    });

    it("signs for a key it was made with, and not for another made at the same time", async () => {
      const a = randomBytes(32).toString("hex");
      const b = randomBytes(32).toString("hex");
      const [first, second] = [keySigner(a), keySigner(b)];
      const [answerA] = await answerOf(first);
      const [answerB] = await answerOf(second);
      expect(answerA!.vkey === answerB!.vkey).toBe(false);
      expect(answerA!.signature === nodeSignature(a, txHash)).toBe(true);
      expect(answerB!.signature === nodeSignature(b, txHash)).toBe(true);
    });
  });

  describe("a key given where a signer goes", () => {
    const key = randomBytes(32).toString("hex");

    it("is refused by signWitnesses and a plan with a hint, naming no value", async () => {
      const hint = "a private key is given as keySigner(key)";
      const error = asBuildError(
        await caught(() => signWitnesses(key as never, tx)),
      );
      expect(error.message.includes(hint)).toBe(true);
      expect(error.message.includes(key)).toBe(false);

      const builder = builderOf(await emulatorOf());
      const plan = builder.plan(
        output({ address: baseAddress(2), value: { lovelace: 2_000_000n } }),
        { payer: baseAddress(1) },
      );
      const wallet = { signTxWitnesses: async () => "a0" };
      for (const signers of [key, [wallet, key]]) {
        const refused = asBuildError(
          await caught(() => plan.sign({ signers } as never)),
        );
        expect(refused.details.option).toBe("signers");
        expect(refused.message.includes(hint)).toBe(true);
        expect(textsOf(refused).some((text) => text.includes(key))).toBe(false);
      }
      // An object holding a key gets no hint about strings
      const object = asBuildError(
        await caught(() => signWitnesses({ privateKey: key } as never, tx)),
      );
      expect(object.message.includes(hint)).toBe(false);
    });

    it("does not compile as a signer: keySigner(key) makes one", () => {
      const options: SignOptions[] = [
        // @ts-expect-error a key is not a signer
        { signers: key },
        // @ts-expect-error nor is an object holding a key
        { signers: { privateKey: key } },
        // @ts-expect-error nor a list holding a key
        { signers: [key] },
        { signers: keySigner(key) },
        { signers: [keySigner(key)] },
      ];
      // @ts-expect-error keySigner reads text only
      expect(() => keySigner(Buffer.from(key, "hex"))).toThrow(TxBuildError);
      expect(options).toHaveLength(5);
    });
  });
});
