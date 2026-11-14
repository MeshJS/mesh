import { createHash, createPublicKey, verify as nodeVerify } from "node:crypto";
import { inspect } from "node:util";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { bech32 } from "bech32";

import { mnemonicToEntropy, ProviderError } from "@meshsdk/common";
import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  deserializeAddress,
  IEvaluator,
  mConStr0,
  Protocol,
  pubKeyAddress,
  serializeAddressObj,
} from "@meshsdk/core";
import {
  CborReader,
  CborWriter,
  Crypto,
  HexBlob,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import type {
  BuildEvent,
  BuiltTxJSON,
  Signer,
  TxBuilderOptions,
  TxHashRequest,
  TxPlanStore,
  Utxo,
} from "../../src/tx-builder";
import type { KeyWitness } from "../../src/tx-builder/sign";
import {
  addWitnesses,
  BuiltTx,
  guard,
  keySigner,
  memoryPlanStore,
  output,
  requiredSigners,
  signedKeyHashes,
  signWitnesses,
  spend,
  TxBuilder,
  TxBuildError,
  TxError,
  TxPlanError,
} from "../../src/tx-builder";
import { readTransaction, withWitnesses } from "../../src/tx-builder/sign";
import { alwaysSucceedCbor, baseAddress } from "../test-util";
import { hashSigner, keysSigner, TestKey, testKey } from "./hash-signer-util";
import { pay, setup, walletOf } from "./plan/plan-emulator-util";

/*
 * The safety rules of signing, R1 to R8, each pinned across every call that signs, holds, writes
 * or sends a transaction. Each rule is one `describe`; where another file pins a case in detail,
 * this one pins the rule across the calls.
 *
 * Keys of these tests: the key of RFC 8032's first test vector, the payment key of the tests'
 * mnemonic, keys made from a fixed text, and keys made here. No key is given to expect(): a test
 * searches a text for the key and asserts on the names of what it found.
 */

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const recipient = baseAddress(2);
const ada = (n: number) => BigInt(n) * 1_000_000n;
const words = Array(24).fill("solution");
const HARDENED = 0x80000000;

/** The sentence the messages of SUBMIT_FAILED, REJECTED and CONFIRM_TIMEOUT end with */
const NO_REBUILD_TEXT =
  "Do not build another transaction to retry it: a new build may select other inputs, and both may land.";

/** RFC 8032, section 7.1, test 1 */
const rfc = {
  key: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
  vkey: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
  keyHash: "35dedd2982a03cf39e7dce03c839994ffdec2ec6b04f1cf2d40e61a3",
};

const toBech32 = (prefix: string, hex: string) =>
  bech32.encode(prefix, bech32.toWords(Buffer.from(hex, "hex")), 1023);

/** A preprod enterprise address of a payment key */
const enterprise = (keyHash: string) =>
  serializeAddressObj(pubKeyAddress(keyHash), 0);

let nextHash = 0;
const utxoAt = (address: string, lovelace = ada(100)): Utxo => ({
  txHash: (++nextHash).toString(16).padStart(64, "d"),
  outputIndex: 0,
  address,
  value: { lovelace },
});

/* ---------------------------------------------------------------------------------------------
 * Keys, and the search for them
 * ------------------------------------------------------------------------------------------- */

/** A private key of the tests, with the texts `keySigner` reads it from */
type KeyFixture = {
  name: string;
  /** The key: 32 bytes, or 64 of an extended key, in hex */
  hex: string;
  /** The hash of its public key */
  keyHash: string;
  /** Texts `keySigner` reads it from, by the name of the encoding */
  encodings: Record<string, string>;
  /** Other secret texts that go with it */
  more: Record<string, string>;
};

/** The two keys of the tests: a 32-byte key and an extended one, the mnemonic's payment key */
const keyFixtures = async () => {
  await Crypto.ready();
  const normal: KeyFixture = {
    name: "the 32-byte key",
    hex: rfc.key,
    keyHash: rfc.keyHash,
    encodings: {
      hex: rfc.key,
      "hex in upper case": rfc.key.toUpperCase(),
      "cborHex 5820": `5820${rfc.key}`,
      "bech32 ed25519_sk": toBech32("ed25519_sk", rfc.key),
      "bech32 addr_sk": toBech32("addr_sk", rfc.key),
    },
    more: {},
  };
  const payment = Crypto.Bip32PrivateKey.fromBip39Entropy(
    Buffer.from(mnemonicToEntropy(words.join(" ")), "hex"),
    "",
  ).derive([HARDENED + 1852, HARDENED + 1815, HARDENED, 0, 0]);
  const raw = payment.toRawKey();
  const hex = raw.hex() as string;
  const chained = payment.hex() as string;
  const full = hex + (raw.toPublic().hex() as string) + chained.slice(128);
  const extended: KeyFixture = {
    name: "the extended key",
    hex,
    keyHash: raw.toPublic().hash().hex() as string,
    encodings: {
      hex,
      "hex in upper case": hex.toUpperCase(),
      "cborHex 5880": `5880${full}`,
      "bech32 ed25519e_sk": toBech32("ed25519e_sk", hex),
      "bech32 addr_xsk of 96 bytes": toBech32("addr_xsk", chained),
      "bech32 stake_xsk of 128 bytes": toBech32("stake_xsk", full),
    },
    more: { "its chain code": chained.slice(128) },
  };
  return { normal, extended, all: [normal, extended] };
};

type Keys = Awaited<ReturnType<typeof keyFixtures>>;

/** A 32-byte key that passes the clamp check: followed by its public key it reads as extended */
const seedKey = (): KeyFixture & { vkey: string } => {
  const hex = createHash("sha256").update("seed 22").digest("hex");
  const vkey = Crypto.Ed25519PrivateKey.fromNormalBytes(Buffer.from(hex, "hex"))
    .toPublic()
    .hex() as string;
  return {
    name: "the key of seed 22",
    hex,
    vkey,
    keyHash: Crypto.blake2b.hash(HexBlob(vkey), 28).toString(),
    encodings: {
      "hex followed by its public key": hex + vkey,
      "bech32 ed25519e_sk followed by its public key": toBech32(
        "ed25519e_sk",
        hex + vkey,
      ),
      "bech32 addr_xsk followed by its public key": toBech32(
        "addr_xsk",
        hex + vkey + "00".repeat(32),
      ),
    },
    more: {},
  };
};

/** A text searched for, and how: as text in either case, as base64, or as a list of bytes */
type Secret = { text: string; kind: "text" | "base64" | "bytes" };
type Secrets = Record<string, Secret>;

/**
 * Every form a key is searched in: its hex (found in either case and with separators between
 * the bytes), both halves, base64 and base64url of each, the list of its bytes, and each text
 * it is given in
 */
const secretsOf = (...fixtures: KeyFixture[]): Secrets => {
  const secrets: Secrets = {};
  for (const fixture of fixtures) {
    const bytes = Buffer.from(fixture.hex, "hex");
    const half = bytes.length / 2;
    const parts: [string, Buffer][] = [
      ["", bytes],
      [", first half,", bytes.subarray(0, half)],
      [", second half,", bytes.subarray(half)],
    ];
    for (const [part, value] of parts) {
      const name = `${fixture.name}${part}`;
      secrets[`${name} in hex`] = { text: value.toString("hex"), kind: "text" };
      secrets[`${name} in base64`] = {
        text: value.toString("base64"),
        kind: "base64",
      };
      secrets[`${name} in base64url`] = {
        text: value.toString("base64url"),
        kind: "base64",
      };
      secrets[`${name} as bytes`] = {
        text: [...value].join(","),
        kind: "bytes",
      };
    }
    for (const [name, text] of Object.entries({
      ...fixture.encodings,
      ...fixture.more,
    }))
      secrets[`${fixture.name} as ${name}`] = {
        text: text.trim(),
        kind: "text",
      };
  }
  return secrets;
};

/**
 * Every text a value shows: printed with its hidden members and getters, as JSON, and of an
 * error its message, its stack and the same of its cause, down the chain
 */
const textsOf = (value: unknown, depth = 0): string[] => {
  const texts: string[] = [];
  try {
    texts.push(
      inspect(value, { depth: Infinity, showHidden: true, getters: true }),
    );
  } catch (error) {
    texts.push(`inspect threw: ${String(error)}`);
  }
  try {
    texts.push(String(JSON.stringify(value)));
  } catch (error) {
    texts.push(`JSON.stringify threw: ${String(error)}`);
  }
  if (value instanceof Error && depth < 20)
    texts.push(
      value.message,
      String(value.stack),
      ...textsOf(value.cause, depth + 1),
    );
  return texts;
};

/** The names of the secrets found in what a value shows */
const shown = (value: unknown, secrets: Secrets): string[] => {
  const all = textsOf(value).join("\n");
  const lower = all.toLowerCase();
  const squeezed = lower.replace(/[^0-9a-z_]/g, "");
  const exact = all.replace(/[^0-9A-Za-z+/_-]/g, "");
  const numbers = `,${all.replace(/[^0-9]+/g, ",")},`;
  return Object.entries(secrets)
    .filter(([, { text, kind }]) => {
      if (kind === "bytes") return numbers.includes(`,${text},`);
      if (kind === "base64") {
        const bare = text.replace(/=+$/, "");
        return all.includes(bare) || exact.includes(bare);
      }
      const wanted = text.toLowerCase();
      return (
        lower.includes(wanted) ||
        squeezed.includes(wanted.replace(/[^0-9a-z_]/g, ""))
      );
    })
    .map(([name]) => name);
};

/** A text given in a call, searched for as it is */
const givenText = (value: unknown): Secrets =>
  typeof value === "string" && value.trim().length >= 16
    ? { "the text given": { text: value.trim(), kind: "text" } }
    : {};

/* ---------------------------------------------------------------------------------------------
 * Transactions, witnesses and signers made by the test itself
 * ------------------------------------------------------------------------------------------- */

/** The top-level items of a transaction, each as its bytes in hex */
const itemsOf = (tx: string) => {
  const reader = new CborReader(HexBlob(tx));
  const length = Number(reader.readStartArray());
  const items: string[] = [];
  for (let i = 0; i < length; i++)
    items.push(Buffer.from(reader.readEncodedValue()).toString("hex"));
  return items;
};

/** blake2b-256 of the bytes of a transaction's body, as written in it */
const bodyHashOf = (tx: string) =>
  Crypto.blake2b.hash(HexBlob(itemsOf(tx)[0]!), 32).toString();

/** Whether an Ed25519 signature verifies, checked by node:crypto */
const nodeVerifies = (vkey: string, signature: string, message: string) => {
  try {
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(vkey, "hex"),
      ]),
      format: "der",
      type: "spki",
    });
    return nodeVerify(
      null,
      Buffer.from(message, "hex"),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
};

/**
 * What is wrong with a transaction the library gave out with witnesses, against the unsigned
 * one it was made from: a witness that does not verify against the body (checked by node:crypto
 * with the witness's own key, and by `signedKeyHashes`), or a difference outside the witness set
 * @returns Descriptions naming key hashes only; empty when nothing is wrong
 */
const problemsOf = async (signed: string, unsigned: string) => {
  const problems: string[] = [];
  const hash = bodyHashOf(unsigned);
  if (bodyHashOf(signed) !== hash) problems.push("another body");
  const [a, b] = [itemsOf(signed), itemsOf(unsigned)];
  if (a.length !== b.length || a.some((item, i) => i !== 1 && item !== b[i]))
    problems.push("a difference outside the witness set");
  const set = Transaction.fromCbor(TxCBOR(signed)).witnessSet();
  const keyHashes: string[] = [];
  const witnesses = [
    ...Array.from(set.vkeys()?.values() ?? []),
    ...Array.from(set.bootstraps()?.values() ?? []),
  ];
  for (const witness of witnesses) {
    const vkey = witness.vkey() as string;
    const keyHash = Crypto.blake2b.hash(HexBlob(vkey), 28).toString();
    if (!nodeVerifies(vkey, witness.signature() as string, hash))
      problems.push(`the witness of ${keyHash} does not verify`);
  }
  for (const witness of set.vkeys()?.values() ?? [])
    keyHashes.push(
      Crypto.blake2b.hash(HexBlob(witness.vkey() as string), 28).toString(),
    );
  const verified = (await signedKeyHashes(signed)).sort();
  if (JSON.stringify(verified) !== JSON.stringify([...keyHashes].sort()))
    problems.push("signedKeyHashes differs from the witnesses");
  return problems;
};

/** The key hashes of the vkey witnesses a transaction holds */
const witnessKeys = (tx: string) =>
  Array.from(
    Transaction.fromCbor(TxCBOR(tx)).witnessSet().vkeys()?.values() ?? [],
    (w) => Crypto.blake2b.hash(HexBlob(w.vkey() as string), 28).toString(),
  ).sort();

/** A witness set of vkey witnesses, each a public key and a signature, as given */
const witnessSetOf = (...pairs: { vkey: string; signature: string }[]) => {
  const writer = new CborWriter().writeStartMap(1).writeInt(0);
  writer.writeStartArray(pairs.length);
  for (const { vkey, signature } of pairs)
    writer
      .writeStartArray(2)
      .writeByteString(Buffer.from(vkey, "hex"))
      .writeByteString(Buffer.from(signature, "hex"));
  return writer.encodeAsHex();
};

/** The hex of the text of a hash: what a signer that signs the text, not the bytes, signs */
const textOfHash = (hash: string) => Buffer.from(hash, "utf8").toString("hex");

/** The rejection of a promise, or the throw of a call */
const caught = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
};

const codeOf = (error: unknown) =>
  TxError.is(error) ? (error as TxError).code : String(error);

/** Lets every pending callback run: turns of the event loop, not a span of time */
const settle = async () => {
  for (let i = 0; i < 10; i++)
    await new Promise((resolve) => setImmediate(resolve));
};

/** A promise the test settles when it chooses */
const gate = <T = unknown>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onValue) => {
    resolve = onValue;
  });
  return { promise, resolve };
};

/** Runs with jest's fake clock; the real one is put back after */
const onFakeClock = async (run: () => Promise<void>) => {
  jest.useFakeTimers({
    doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
  });
  try {
    await run();
  } finally {
    jest.useRealTimers();
  }
};

/** Every build and plan of this file reports here: R1 searches these events at the end */
const events: BuildEvent[] = [];
const trace = (event: BuildEvent) => {
  events.push(event);
};

/** A builder without a provider unless one is given: a build reads nothing */
const offline = (options: Partial<TxBuilderOptions> = {}) =>
  new TxBuilder({ network: "preprod", params, costModels, ...options });

/** A payment from the enterprise address of one key, which other keys must sign too as guards */
const payment = (
  builder: TxBuilder,
  payerKeyHash: string,
  guards: string[] = [],
  lovelace = ada(5),
) => {
  const address = enterprise(payerKeyHash);
  return builder.build(
    [
      output({ address: recipient, value: { lovelace } }),
      ...guards.map((keyHash) => guard.pubKey({ keyHash })),
    ],
    { payer: { changeAddress: address, utxos: [utxoAt(address)] }, trace },
  );
};

/** A payment the two keys of the tests must sign: the extended key pays, the other guards */
const twoKeyPayment = (builder: TxBuilder, keys: Keys) =>
  payment(builder, keys.extended.keyHash, [keys.normal.keyHash]);

/**
 * A plan on the emulator: the mnemonic wallet pays (the extended key signs for it), and the
 * key of `guardKeyHash` must sign too
 */
const planOf = async (
  guardKeyHash: string,
  options: { store?: TxPlanStore; id?: string } = {},
) => {
  const ctx = await setup({
    builder: options.store === undefined ? {} : { store: options.store },
  });
  const plan = ctx.builder.plan(
    [pay(), guard.pubKey({ keyHash: guardKeyHash })],
    {
      payer: ctx.address,
      trace,
      ...(options.id !== undefined && { id: options.id }),
    },
  );
  return { ...ctx, plan };
};

/** The calls of a plan that take signers */
const PLAN_CALLS = ["sign", "send", "advance"] as const;
type PlanCall = (typeof PLAN_CALLS)[number];

const callPlan = (
  plan: Awaited<ReturnType<typeof planOf>>["plan"],
  call: PlanCall,
  signers: unknown,
) =>
  call === "sign"
    ? plan.sign({ signers } as never)
    : plan[call]({ signers, waitFor: "included" } as never);

/** A signer of hashes in either form that answers whatever it is told to, recording requests */
const answering = (form: "object" | "callback", answer: unknown) =>
  hashSigner(form, () => answer);

const FORMS = ["object", "callback"] as const;

/* ---------------------------------------------------------------------------------------------
 * The search
 * ------------------------------------------------------------------------------------------- */

describe("the search for a key", () => {
  it("finds a key planted in a text, in each form and place it is searched in, and nothing where none is", async () => {
    const { normal, extended } = await keyFixtures();
    const secrets = secretsOf(normal, extended);
    const bytes = Buffer.from(extended.hex, "hex");
    const symbol = Symbol("key");
    const deep = new Error("outer", {
      cause: new Error("middle", {
        cause: new Error(`inner ${extended.hex.toUpperCase()}`),
      }),
    });
    const stacked = new Error("plain");
    stacked.stack = `Error: plain\n    at ${normal.hex}`;
    const planted: [string, unknown][] = [
      ["hex in upper case, in the message of a cause of a cause", deep],
      ["hex in a stack", stacked],
      [
        "the first half, in details",
        Object.assign(new Error("x"), {
          details: { value: extended.hex.slice(0, 64) },
        }),
      ],
      [
        "the second half, its bytes apart",
        extended.hex.slice(64).match(/../g)!.join(" "),
      ],
      [
        "bech32, in a nested object",
        { a: [{ b: normal.encodings["bech32 ed25519_sk"] }] },
      ],
      ["base64, in JSON", JSON.stringify({ k: bytes.toString("base64") })],
      ["base64url", bytes.subarray(32).toString("base64url")],
      ["its bytes, as a Buffer", { key: Buffer.from(normal.hex, "hex") }],
      ["its bytes, as a Uint8Array", new Uint8Array(bytes)],
      ["its bytes, as numbers in JSON", JSON.stringify([...bytes])],
      [
        "a member that is not enumerable",
        Object.defineProperty({}, "hidden", { value: normal.hex }),
      ],
      ["a member under a symbol", { [symbol]: normal.hex }],
      [
        "a getter",
        Object.defineProperty({}, "k", {
          get: () => normal.hex,
          enumerable: true,
        }),
      ],
      ["a key file's text", `5880${extended.hex}`],
      [
        "a cause that is not an error",
        new Error("x", { cause: { key: normal.hex } }),
      ],
    ];
    const missed = planted
      .filter(([, value]) => shown(value, secrets).length === 0)
      .map(([name]) => name);
    expect(missed).toEqual([]);
    // Public data of the same keys is no find
    expect(
      shown(
        {
          vkey: rfc.vkey,
          keyHash: normal.keyHash,
          other: extended.keyHash,
          error: new TxPlanError("SIGN_DECLINED", "the signer declined"),
        },
        secrets,
      ),
    ).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------------------------
 * R1
 * ------------------------------------------------------------------------------------------- */

describe("R1: key material never leaves the signer object", () => {
  let keys: Keys;
  let secrets: Secrets;
  beforeAll(async () => {
    keys = await keyFixtures();
    secrets = secretsOf(...keys.all, seedKey());
  });

  /** Malformed texts and values made of a key, each in a way keySigner refuses */
  const malformed = (f: KeyFixture): [string, unknown][] => {
    const hex = f.hex;
    const size = hex.length / 2;
    const own = size === 32 ? "ed25519_sk" : "ed25519e_sk";
    const bech = toBech32(own, hex);
    return [
      ["one byte short", hex.slice(2)],
      ["one byte long", `${hex}00`],
      ["an odd number of digits", hex.slice(1)],
      ["broken by a line", `${hex.slice(0, 32)}\n${hex.slice(32)}`],
      ["with 0x before it", `0x${hex}`],
      ["in quotes", `"${hex}"`],
      [
        "a key file's cborHex one byte short",
        `${size === 32 ? "5820" : "5880"}${hex.slice(2)}`,
      ],
      [
        "bech32 with a wrong character",
        bech.replace(/.$/, (c) => (c === "q" ? "p" : "q")),
      ],
      ["bech32 in mixed case", bech.replace(own, own.toUpperCase())],
      [
        "bech32 of the other size",
        toBech32(size === 32 ? "ed25519e_sk" : "ed25519_sk", hex),
      ],
      ["bech32 kes_sk", toBech32("kes_sk", hex)],
      ["bech32 vrf_sk", toBech32("vrf_sk", hex)],
      ["bech32 addr_vk", toBech32("addr_vk", hex)],
      ["bech32 root_xsk", toBech32("root_xsk", hex.padEnd(192, "0"))],
      ["bech32 acct_xsk", toBech32("acct_xsk", hex.padEnd(192, "0"))],
      ["bech32 xprv", toBech32("xprv", hex.padEnd(192, "0"))],
      ["hex of 96 bytes", hex.padEnd(192, "0")],
      ["hex of 128 bytes without its CBOR head", hex.padEnd(256, "0")],
      [
        "a cardano-cli key file",
        JSON.stringify(
          {
            type: "PaymentSigningKeyShelley_ed25519",
            description: "",
            cborHex: `5820${hex.slice(0, 64)}`,
          },
          null,
          4,
        ),
      ],
      ["an object { privateKey }", { privateKey: hex }],
      ["its bytes", Buffer.from(hex, "hex")],
      ["a list holding it", [hex]],
      [
        "an unclamped extended key",
        size === 32
          ? hex + rfc.vkey
          : (Buffer.from(hex, "hex")[0]! | 0x07).toString(16).padStart(2, "0") +
            hex.slice(2),
      ],
    ];
  };

  it("keySigner refuses each malformed key at the call, with an error that shows nothing of it", () => {
    const leaks: string[] = [];
    for (const fixture of keys.all)
      for (const [form, value] of malformed(fixture)) {
        let error: unknown;
        try {
          keySigner(value as string);
        } catch (thrown) {
          error = thrown;
        }
        const refused =
          TxError.is(error, "INVALID_OPTION") &&
          error.details.option === "key" &&
          error.details.value === (value === null ? "null" : typeof value) &&
          error.cause === undefined;
        if (!refused) leaks.push(`${fixture.name}, ${form}: not refused so`);
        for (const name of shown(error, { ...secrets, ...givenText(value) }))
          leaks.push(`${fixture.name}, ${form}: ${name}`);
      }
    expect(leaks).toEqual([]);
  });

  it("a key given where a signer, a submitter, options, a witness or a JSON goes is refused by every call, with errors that show nothing of it", async () => {
    const b = offline();
    const built = await twoKeyPayment(b, keys);
    const {
      plan,
      builder: planBuilder,
      address,
    } = await planOf(keys.normal.keyHash);
    await plan.build();
    const wallet = { signTxWitnesses: async () => "a0" };
    const calls: [string, (value: unknown) => Promise<unknown>][] = [
      ["signWitnesses", (v) => signWitnesses(v as never, built.tx)],
      ["sign({ signers })", (v) => built.sign({ signers: v } as never)],
      ["sign(options)", (v) => built.sign(v as never)],
      ["submit({ submitter })", (v) => built.submit({ submitter: v } as never)],
      ["submit(options)", (v) => built.submit(v as never)],
      ["awaitInclusion(options)", (v) => built.awaitInclusion(v as never)],
      ["addWitnesses", (v) => built.addWitnesses(v as never)],
      ["restore", (v) => b.restore(v as never)],
      ...PLAN_CALLS.map(
        (call): [string, (value: unknown) => Promise<unknown>] => [
          `plan.${call}`,
          (v) => callPlan(plan, call, v),
        ],
      ),
      ["plan.sign({ signal })", (v) => plan.sign({ signal: v } as never)],
      ["plan.send({ submitter })", (v) => plan.send({ submitter: v } as never)],
      [
        "plan.advance({ submitter })",
        (v) => plan.advance({ submitter: v } as never),
      ],
      ["plan.build(options)", (v) => plan.build(v as never)],
      ["plan.build({ payer })", (v) => plan.build({ payer: v } as never)],
      ["build({ payer })", (v) => b.build(pay(), { payer: v } as never)],
      [
        "build({ payer: { changeAddress } })",
        (v) =>
          b.build(pay(), { payer: { changeAddress: v, utxos: [] } } as never),
      ],
      ["readPayer", (v) => b.readPayer(v as never)],
      [
        "builder.plan({ after })",
        async (v) =>
          planBuilder.plan(pay(), { payer: address, after: v } as never),
      ],
    ];
    const leaks: string[] = [];
    let refusals = 0;
    for (const fixture of keys.all)
      for (const [encoding, key] of Object.entries(fixture.encodings)) {
        const shapes: [string, unknown][] = [
          ["as it is", key],
          ["in a list", [key]],
          ["in a list after a signer", [wallet, key]],
          ["as { privateKey }", { privateKey: key }],
        ];
        for (const [shape, value] of shapes)
          for (const [call, run] of calls) {
            const where = `${fixture.name} (${encoding}) ${shape} to ${call}`;
            const error = await caught(() => run(value));
            refusals += 1;
            if (!(error instanceof Error)) leaks.push(`${where}: not an Error`);
            // An INVALID_OPTION names only the JavaScript type of what was given
            if (
              TxError.is(error, "INVALID_OPTION") &&
              !["string", "object"].includes(
                (error as TxBuildError<"INVALID_OPTION">).details
                  .value as string,
              )
            )
              leaks.push(`${where}: details.value is not a type`);
            for (const name of shown(error, { ...secrets, ...givenText(key) }))
              leaks.push(`${where}: ${name}`);
          }
      }
    expect(leaks).toEqual([]);
    const encodings = keys.all.flatMap((f) => Object.keys(f.encodings));
    expect(refusals).toBe(encodings.length * 4 * calls.length);
    // Nothing of them is held
    for (const value of [built, built.toJSON(), plan.toJSON(), plan])
      expect(shown(value, secrets)).toEqual([]);
    expect(built.missing).toHaveLength(2);
  });

  it("a key given as tx to a signing function is refused, with an error that shows nothing of it", async () => {
    const wallet = { signTxWitnesses: async () => "a0" };
    const calls: [string, (value: unknown) => unknown][] = [
      ["signWitnesses", (v) => signWitnesses(wallet, v as never)],
      ["addWitnesses", (v) => addWitnesses(v as never)],
      ["addWitnesses with a set", (v) => addWitnesses(v as never, "a0")],
      ["signedKeyHashes", (v) => signedKeyHashes(v as never)],
      ["requiredSigners", (v) => requiredSigners(v as never, [])],
    ];
    const leaks: string[] = [];
    let refusals = 0;
    for (const fixture of [...keys.all, seedKey()])
      for (const [encoding, key] of Object.entries(fixture.encodings)) {
        const shapes: [string, unknown][] = [
          ["as it is", key],
          ["in a list", [key]],
          ["as { privateKey }", { privateKey: key }],
        ];
        for (const [shape, value] of shapes)
          for (const [call, run] of calls) {
            const where = `${fixture.name} (${encoding}) ${shape} to ${call}`;
            const error = await caught(() => run(value));
            refusals += 1;
            if (!TxError.is(error, "INVALID_OPTION")) {
              leaks.push(`${where}: not INVALID_OPTION`);
              continue;
            }
            // The details name the JavaScript type of what was given, and nothing else of it
            expect(error.details).toEqual({
              option: "tx",
              value: typeof value,
              allowed: "a transaction in CBOR hex",
            });
            for (const name of shown(error, { ...secrets, ...givenText(key) }))
              leaks.push(`${where}: ${name}`);
          }
      }
    expect(leaks).toEqual([]);
    const encodings = [...keys.all, seedKey()].flatMap((f) =>
      Object.keys(f.encodings),
    );
    expect(refusals).toBe(encodings.length * 3 * calls.length);
  });

  it("a signer that fails, declines, or answers with a key shows nothing of it on any path that signs", async () => {
    const seed = seedKey();
    const b = offline();
    const built = await payment(b, keys.extended.keyHash, [
      keys.normal.keyHash,
      seed.keyHash,
    ]);
    const { plan } = await planOf(seed.keyHash);
    await plan.build();
    const wrongFile = (() => {
      const own = keys.extended.encodings["bech32 stake_xsk of 128 bytes"]!;
      const bytes = Buffer.from(
        bech32.fromWords(bech32.decode(own, 1023).words),
      );
      bytes.set(Buffer.from(rfc.vkey, "hex"), 64);
      return toBech32("addr_xsk", bytes.toString("hex"));
    })();
    const hostile = (f: KeyFixture): [string, () => Signer][] => {
      const sig = (f.hex + f.hex + f.hex + f.hex).slice(0, 128);
      return [
        [
          "a key signer whose key is a key followed by its public key",
          () => keySigner(seed.encodings["hex followed by its public key"]!),
        ],
        [
          "a key signer of a key file whose public key is not its own",
          () => keySigner(wrongFile),
        ],
        ...FORMS.flatMap((form): [string, () => Signer][] => [
          [
            `a signer of hashes (${form}) that throws`,
            () =>
              hashSigner(form, () => {
                throw new Error("the key service is down");
              }).signer,
          ],
          [
            `a signer of hashes (${form}) that declines`,
            () =>
              hashSigner(form, () => {
                throw new TxPlanError("SIGN_DECLINED", "the operator said no");
              }).signer,
          ],
          [
            `a signer of hashes (${form}) that answers with the key as its vkey`,
            () =>
              answering(form, [{ vkey: f.hex.slice(0, 64), signature: sig }])
                .signer,
          ],
          [
            `a signer of hashes (${form}) that answers with the key as its signature`,
            () => answering(form, [{ vkey: rfc.vkey, signature: sig }]).signer,
          ],
          [
            `a signer of hashes (${form}) that answers with the key, as it is, as its signature`,
            () =>
              answering(form, [{ vkey: rfc.vkey, signature: f.hex }]).signer,
          ],
          [
            `a signer of hashes (${form}) that answers with the key, as it is, as its vkey`,
            () => answering(form, [{ vkey: f.hex, signature: sig }]).signer,
          ],
          [
            `a signer of hashes (${form}) that answers with the key's text`,
            () => answering(form, f.hex).signer,
          ],
          [
            `a signer of hashes (${form}) that answers with { privateKey }`,
            () => answering(form, [{ privateKey: f.hex }]).signer,
          ],
        ]),
        [
          "a wallet that answers with the key's text",
          () => ({ signTxWitnesses: async () => f.hex }),
        ],
      ];
    };
    const paths: [string, (signer: Signer) => Promise<unknown>][] = [
      ["BuiltTx.sign", (s) => built.sign({ signers: s })],
      ["signWitnesses", (s) => signWitnesses(s, built.tx)],
      ...PLAN_CALLS.map((call): [string, (s: Signer) => Promise<unknown>] => [
        `plan.${call}`,
        (s) => callPlan(plan, call, s),
      ]),
    ];
    const leaks: string[] = [];
    for (const fixture of keys.all)
      for (const [name, make] of hostile(fixture))
        for (const [path, run] of paths) {
          const error = await caught(() => run(make()));
          const where = `${fixture.name}, ${name}, ${path}`;
          if (
            !["SIGNER_FAILED", "SIGN_DECLINED", "MISSING_SIGNATURES"].includes(
              codeOf(error),
            )
          )
            leaks.push(`${where}: ${codeOf(error)}`);
          for (const found of shown(error, secrets))
            leaks.push(`${where}: ${found}`);
        }
    expect(leaks).toEqual([]);
    // Nothing was kept, and nothing of them is held
    expect(built.missing).toHaveLength(3);
    expect(built.partialTx).toBe(built.tx);
    for (const value of [built, built.toJSON(), plan.toJSON(), plan])
      expect(shown(value, secrets)).toEqual([]);
  });

  it("no result, member, copy, JSON, plan record or stored record shows a key signers signed with", async () => {
    const leaks: string[] = [];
    const look = (where: string, value: unknown) => {
      for (const name of shown(value, secrets)) leaks.push(`${where}: ${name}`);
    };
    const encodings = Object.keys(keys.extended.encodings).map((name, i) => [
      Object.values(keys.normal.encodings)[
        i % Object.keys(keys.normal.encodings).length
      ]!,
      keys.extended.encodings[name]!,
    ]);
    for (const [normalText, extendedText] of encodings) {
      const b = offline();
      const built = await twoKeyPayment(b, keys);
      const signers = [keySigner(normalText!), keySigner(extendedText!)];
      // One key first, then the other: a partly signed object is searched too
      await built.sign({ signers: signers[0]! });
      look("partialTx after one key", built.partialTx);
      look("missing after one key", built.missing);
      look("the JSON after one key", JSON.stringify(built));
      await built.sign({ signers, partial: false });
      expect(built.signedTx).toBeDefined();
      expect(await problemsOf(built.signedTx!, built.tx)).toEqual([]);
      look("signedTx", built.signedTx);
      look("partialTx", built.partialTx);
      look("missing", built.missing);
      look("the object", built);
      for (const name of Object.getOwnPropertyNames(built))
        look(
          `member ${name}`,
          (built as unknown as Record<string, unknown>)[name],
        );
      look("a spread copy", { ...built });
      look("a structured clone", structuredClone(built));
      const json = JSON.stringify(built);
      look("the JSON", json);
      const restored = await b.restore(JSON.parse(json) as BuiltTxJSON);
      look("the object restored", restored);
      look("the JSON of the object restored", JSON.stringify(restored));
      look("signWitnesses", await signWitnesses(signers[0]!, built.tx));
      look(
        "signWitnesses with key hashes",
        await signWitnesses(signers[1]!, built.tx, [keys.extended.keyHash]),
      );
    }
    // A plan, with a store: its record after signing and after sending
    const store = memoryPlanStore();
    const { plan } = await planOf(keys.normal.keyHash, {
      store,
      id: "order",
    });
    await plan.build();
    await plan.sign({
      signers: [
        keySigner(keys.normal.encodings["bech32 addr_sk"]!),
        keySigner(keys.extended.encodings["cborHex 5880"]!),
      ],
    });
    expect(plan.status).toBe("signed");
    expect(await problemsOf(plan.signedTx!, plan.built!.tx)).toEqual([]);
    look("plan.toJSON() after signing", plan.toJSON());
    look("the stored record after signing", await store.load("order"));
    look("plan.signedTx", plan.signedTx);
    look("plan.built", plan.built);
    look("the plan", plan);
    await plan.send({ waitFor: "included" });
    look("plan.toJSON() after sending", plan.toJSON());
    look("the stored record after sending", await store.load("order"));
    // A plan that signs and sends in one call
    const sent = await planOf(keys.normal.keyHash);
    await sent.plan.send({
      signers: [
        keySigner(keys.normal.encodings.hex!),
        keySigner(keys.extended.encodings["bech32 ed25519e_sk"]!),
      ],
      waitFor: "included",
    });
    look("a plan sent with key signers", sent.plan.toJSON());
    expect(leaks).toEqual([]);
  });

  it("the signer object holds its key in no member, no JSON, no printing and no clone, before and after use", async () => {
    const leaks: string[] = [];
    const { tx } = await twoKeyPayment(offline(), keys);
    for (const fixture of keys.all)
      for (const [encoding, text] of Object.entries(fixture.encodings)) {
        const signer = keySigner(text);
        for (const moment of ["before use", "after use"]) {
          if (moment === "after use")
            expect(await signWitnesses(signer, tx)).not.toBe("a0");
          const where = `${fixture.name} (${encoding}) ${moment}`;
          const facts = {
            json: JSON.stringify(signer) === "{}",
            names:
              JSON.stringify(Object.getOwnPropertyNames(signer)) ===
              '["signTxHash"]',
            keys: Reflect.ownKeys(signer).length === 1,
            frozen: Object.isFrozen(signer),
            clone: (() => {
              try {
                structuredClone(signer);
                return false;
              } catch {
                return true;
              }
            })(),
          };
          for (const [fact, holds] of Object.entries(facts))
            if (!holds) leaks.push(`${where}: ${fact}`);
          for (const value of [
            signer,
            Object.getOwnPropertyDescriptors(signer),
            String(signer.signTxHash),
          ])
            for (const name of shown(value, { ...secrets, ...givenText(text) }))
              leaks.push(`${where}: ${name}`);
        }
      }
    expect(leaks).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------------------------
 * R1, added: the object keeps no signer, and the payer of its build only where nothing shows it
 * ------------------------------------------------------------------------------------------- */

/** A full collection of garbage, through V8's own function */
const collectGarbage = (() => {
  let gc: (() => void) | undefined;
  return () => {
    if (gc === undefined) {
      setFlagsFromString("--expose-gc");
      gc = runInNewContext("gc") as () => void;
    }
    gc();
  };
})();

/** Whether the value a weak reference points to is collected, after a few collections */
const isCollected = async (ref: WeakRef<object>) => {
  for (let i = 0; i < 10; i++) {
    await settle();
    collectGarbage();
    await settle();
    if (ref.deref() === undefined) return true;
  }
  return false;
};

/** Every value reachable from the own members of a value, hidden members and symbols included */
const reachable = (root: object) => {
  const seen = new Set<unknown>();
  const walk = (value: unknown) => {
    if (
      (typeof value !== "object" && typeof value !== "function") ||
      value === null ||
      seen.has(value)
    )
      return;
    seen.add(value);
    for (const key of Reflect.ownKeys(value as object)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      walk(descriptor.value);
      walk(descriptor.get);
    }
  };
  for (const key of Reflect.ownKeys(root))
    walk(Object.getOwnPropertyDescriptor(root, key)!.value);
  return seen;
};

/** A payer given as a wallet over a test key, with a marker of its own, that signs hashes */
const signingPayer = (key: TestKey, marker: string) => {
  let answer: "sign" | "fail" | "decline" = "sign";
  const payer = {
    marker,
    getChangeAddress: async () => key.address,
    getUtxos: async () => [utxoAt(key.address)],
    signTxHash: async ({ txHash }: TxHashRequest) => {
      if (answer === "fail") throw new Error("down");
      if (answer === "decline") throw { code: 2, info: "declined" };
      return [key.answer(txHash)];
    },
  };
  return {
    payer,
    answers: (next: typeof answer) => {
      answer = next;
    },
  };
};

describe("R1, added: the object keeps no signer, and the payer of its build only where nothing shows it", () => {
  /** A signer of each form and outcome, with a marker of its own */
  const cases: [string, (marker: string, key: TestKey) => Signer][] = [
    ...FORMS.map((form): [string, (m: string, k: TestKey) => Signer] => [
      `a signer of hashes (${form}) that signs`,
      (marker, key) =>
        Object.assign(keysSigner(form, key).signer, { marker }) as Signer,
    ]),
    ...FORMS.map((form): [string, (m: string, k: TestKey) => Signer] => [
      `a signer of hashes (${form}) that throws`,
      (marker) =>
        Object.assign(
          hashSigner(form, () => {
            throw new Error("down");
          }).signer,
          { marker },
        ) as Signer,
    ]),
    [
      "a wallet that declines",
      (marker) => ({
        marker,
        signTxWitnesses: async () => {
          throw { code: 2, info: "declined" };
        },
      }),
    ],
    [
      "a wallet whose witness is of another body",
      (marker, key) => ({
        marker,
        signTxWitnesses: async () => witnessSetOf(key.answer("ab".repeat(32))),
      }),
    ],
  ];

  it.each(cases)(
    "%s: after sign returns or throws, nothing of it is reachable from the object's members, its JSON or its printing",
    async (_, make) => {
      await Crypto.ready();
      const payer = testKey();
      const built = await payment(offline(), payer.keyHash);
      const marker = `signer-marker-${Math.random().toString(36).slice(2)}`;
      const signer = make(marker, payer);
      await built.sign({ signers: signer }).catch(() => undefined);
      await built
        .sign({ signers: [signer], partial: false })
        .catch(() => undefined);
      const found = reachable(built);
      expect(found.has(signer)).toBe(false);
      expect(
        [...found].some(
          (value) =>
            typeof value === "function" &&
            (value === (signer as { signTxHash?: unknown }).signTxHash ||
              value ===
                (signer as { signTxWitnesses?: unknown }).signTxWitnesses),
        ),
      ).toBe(false);
      const markers = { marker: { text: marker, kind: "text" as const } };
      expect(shown(built, markers)).toEqual([]);
      expect(shown(JSON.stringify(built), markers)).toEqual([]);
      expect(shown([...found], markers)).toEqual([]);
    },
  );

  it("lets the signers and the payer go: they are collected while the object and its builder live", async () => {
    await Crypto.ready();
    const b = offline();
    const refs: [string, WeakRef<object>][] = [];
    const make = async () => {
      const payer = testKey();
      const guardKey = testKey();
      const snapshot = {
        changeAddress: payer.address,
        utxos: [utxoAt(payer.address)],
      };
      const built = await b.build(
        [
          output({ address: recipient, value: { lovelace: ada(5) } }),
          guard.pubKey({ keyHash: guardKey.keyHash }),
        ],
        { payer: snapshot, trace },
      );
      const signing = keysSigner("object", payer).signer;
      const callback = keysSigner("callback", guardKey).signer;
      const failing = hashSigner("object", () => {
        throw new Error("down");
      }).signer;
      await caught(() => built.sign({ signers: failing }));
      await built.sign({ signers: [signing, callback] });
      refs.push(
        ["the payer", new WeakRef(snapshot)],
        ["a signer of hashes", new WeakRef(signing as object)],
        ["a callback", new WeakRef(callback as object)],
        ["a signer that failed", new WeakRef(failing as object)],
      );
      return built;
    };
    const built = await make();
    // The control: a value something still holds is not collected
    const held = { held: true };
    const holder = [held];
    const control = new WeakRef(held);
    const kept: string[] = [];
    for (const [name, ref] of refs)
      if (!(await isCollected(ref))) kept.push(name);
    expect(kept).toEqual([]);
    expect(await isCollected(control)).toBe(false);
    // The object and its builder are alive and complete
    expect(holder).toHaveLength(1);
    expect(built.signedTx).toBeDefined();
    expect(b.network.name).toBe("preprod");
  });

  it("keeps the payer of its build, when it can sign, where nothing shows it: not its members, its JSON, its printing, its errors or the trace", async () => {
    await Crypto.ready();
    const key = testKey();
    const guardKey = testKey();
    const marker = `payer-marker-${Math.random().toString(36).slice(2)}`;
    const { payer, answers } = signingPayer(key, marker);
    const from = events.length;
    const built = await offline().build(
      [output({ address: recipient, value: { lovelace: ada(5) } })],
      { payer, trace },
    );
    // The same payer, with a guard key that it cannot sign for
    const guarded = await offline().build(
      [
        output({ address: recipient, value: { lovelace: ada(5) } }),
        guard.pubKey({ keyHash: guardKey.keyHash }),
      ],
      { payer, trace },
    );
    const errors: unknown[] = [];
    for (const answer of ["fail", "decline"] as const) {
      answers(answer);
      errors.push(await caught(() => built.sign()));
    }
    answers("sign");
    const aborted = new AbortController();
    aborted.abort();
    errors.push(
      await caught(() => built.sign({ partial: "no" as never })),
      await caught(() => built.sign({ signer: payer } as never)),
      await caught(() => built.sign({ signal: aborted.signal })),
      await caught(() => guarded.sign({ partial: false })),
    );
    expect(errors.map(codeOf)).toEqual([
      "SIGNER_FAILED",
      "SIGN_DECLINED",
      "INVALID_OPTION",
      "INVALID_OPTION",
      "ABORTED",
      "MISSING_SIGNATURES",
    ]);
    await built.sign({ partial: false });
    expect(built.signedTx).toBeDefined();
    const markers = { marker: { text: marker, kind: "text" as const } };
    const traced = events.slice(from);
    expect(traced.length).toBeGreaterThan(0);
    for (const [where, value] of [
      ["the object", built],
      ["an object signed in part", guarded],
      ["its JSON", JSON.stringify(built)],
      ["the JSON of one signed in part", JSON.stringify(guarded)],
      ["its errors", errors],
      ["its trace", traced],
    ] as const) {
      const found = reachable({ value });
      expect([where, found.has(payer)]).toEqual([where, false]);
      expect([
        where,
        [...found].some(
          (each) =>
            each === payer.signTxHash || each === payer.getChangeAddress,
        ),
      ]).toEqual([where, false]);
      expect([where, shown(value, markers)]).toEqual([where, []]);
      expect([where, shown([...found], markers)]).toEqual([where, []]);
    }
  });

  it("does not keep a payer without a signing method, a snapshot or a wallet, and keeps a snapshot that carries one while the object lives", async () => {
    await Crypto.ready();
    const b = offline();
    const holder: { signing?: BuiltTx } = {};
    const buildFor = (payer: object) =>
      b.build([output({ address: recipient, value: { lovelace: ada(5) } })], {
        payer: payer as never,
        trace,
      });
    const make = async () => {
      const key = testKey();
      const { payer } = signingPayer(key, "snapshot");
      const plain = {
        changeAddress: key.address,
        utxos: [utxoAt(key.address)],
      };
      const watching = {
        getChangeAddress: payer.getChangeAddress,
        getUtxos: payer.getUtxos,
      };
      const signing = { ...plain, signTxHash: payer.signTxHash };
      const unkept = [await buildFor(plain), await buildFor(watching)];
      holder.signing = await buildFor(signing);
      return {
        unkept,
        unkeptRefs: [new WeakRef(plain), new WeakRef(watching)],
        signing: new WeakRef(signing),
      };
    };
    const { unkept, unkeptRefs, signing } = await make();
    for (const ref of unkeptRefs) expect(await isCollected(ref)).toBe(true);
    for (const built of unkept)
      expect(codeOf(await caught(() => built.sign()))).toBe(
        "MISSING_SIGNATURES",
      );
    expect(await isCollected(signing)).toBe(false);
    await holder.signing!.sign({ partial: false });
    expect(holder.signing!.signedTx).toBeDefined();
    const built = new WeakRef(holder.signing!);
    delete holder.signing;
    expect(await isCollected(built)).toBe(true);
    expect(await isCollected(signing)).toBe(true);
  });

  it("holds no payer in an object restored from JSON or made by finalize(): the wallet that paid goes while they live", async () => {
    await Crypto.ready();
    const b = offline();
    let ref: WeakRef<object> | undefined;
    const make = async () => {
      const key = testKey();
      const { payer } = signingPayer(key, "restored");
      const built = await b.build(
        [output({ address: recipient, value: { lovelace: ada(5) } })],
        { payer, trace },
      );
      ref = new WeakRef(payer);
      return {
        restored: await b.restore(JSON.parse(JSON.stringify(built))),
        final: await b.finalize(structuredClone(built.prototype), {
          inputs: built.inputs,
          changeAddress: key.address,
        }),
      };
    };
    const { restored, final } = await make();
    expect(await isCollected(ref!)).toBe(true);
    for (const built of [restored, final])
      expect(codeOf(await caught(() => built.sign()))).toBe(
        "MISSING_SIGNATURES",
      );
  });

  it("keeps a wallet that paid while the object lives, and lets it go with the object", async () => {
    const { builder } = await setup();
    const holder: { built?: BuiltTx } = {};
    const make = async () => {
      const wallet = await walletOf();
      const built = await builder.build(pay(), { payer: wallet, trace });
      await built.sign();
      holder.built = built;
      return new WeakRef(wallet);
    };
    const wallet = await make();
    // The object signs with it: it is held while the object is
    expect(await isCollected(wallet)).toBe(false);
    expect(holder.built!.signedTx).toBeDefined();
    const built = new WeakRef(holder.built!);
    delete holder.built;
    expect(await isCollected(built)).toBe(true);
    expect(await isCollected(wallet)).toBe(true);
  });
});

/* ---------------------------------------------------------------------------------------------
 * R2
 * ------------------------------------------------------------------------------------------- */

describe("R2: nothing is signed but the hash of the body of the transaction given", () => {
  let keys: Keys;
  let wallet: MeshWallet;
  beforeAll(async () => {
    keys = await keyFixtures();
    wallet = await walletOf();
  });

  /** Signers that record what they are given: two signers of hashes and two wallets */
  const recorders = () => {
    const object = hashSigner("object", () => []);
    const callback = hashSigner("callback", () => []);
    const seen: string[] = [];
    const witnesses = {
      signTxWitnesses: async (tx: string, keyHashes?: string[]) => {
        seen.push(tx);
        return wallet.signTxWitnesses(tx, keyHashes);
      },
    };
    const cip30 = {
      signTx: async (tx: string) => {
        seen.push(tx);
        return "a0";
      },
    };
    return {
      signers: [object.signer, callback.signer, cip30, witnesses],
      requests: () => [...object.requests, ...callback.requests],
      seen,
    };
  };

  /** What differs from the hash the test computes, in what the recorders were given */
  const wrongs = (
    recorded: ReturnType<typeof recorders>,
    expected: string,
    calls: number,
  ) => {
    const found: string[] = [];
    const requests = recorded.requests();
    if (requests.length !== 2 * calls)
      found.push(`${requests.length} requests`);
    if (recorded.seen.length !== 2 * calls)
      found.push(`${recorded.seen.length} wallet calls`);
    for (const request of requests) {
      if (request.txHash !== expected) found.push("a request of another hash");
      if (bodyHashOf(request.tx) !== expected)
        found.push("a request with another transaction");
    }
    for (const tx of recorded.seen)
      if (bodyHashOf(tx) !== expected)
        found.push("a wallet given another body");
    return found;
  };

  it("the object asks every form of signer for that hash, also after a key has signed", async () => {
    const built = await payment(offline(), keys.extended.keyHash, [
      keys.normal.keyHash,
    ]);
    const expected = bodyHashOf(built.tx);
    const recorded = recorders();
    await built.sign({ signers: recorded.signers });
    // The wallet signed the extended key; the others are asked again with that witness held
    expect(built.missing.map((k) => k.keyHash)).toEqual([keys.normal.keyHash]);
    await built.sign({ signers: recorded.signers });
    expect(wrongs(recorded, expected, 2)).toEqual([]);
  });

  it.each(PLAN_CALLS)(
    "a plan's %s() asks every form of signer for the hash of its attempt's body",
    async (call) => {
      const { plan } = await planOf(keys.normal.keyHash);
      if (call === "sign") await plan.build();
      const recorded = recorders();
      await callPlan(plan, call, [
        ...recorded.signers,
        keySigner(keys.normal.encodings.hex!),
      ]);
      const expected = bodyHashOf(plan.built!.tx);
      expect(wrongs(recorded, expected, 1)).toEqual([]);
      expect(plan.signedTx === undefined).toBe(false);
    },
  );

  it("signWitnesses asks every form of signer for the hash of the body of the tx it is given", async () => {
    const built = await twoKeyPayment(offline(), keys);
    const expected = bodyHashOf(built.tx);
    const recorded = recorders();
    for (const signer of recorded.signers) {
      await signWitnesses(signer, built.tx);
      await signWitnesses(signer, built.tx, [keys.normal.keyHash]);
    }
    expect(wrongs(recorded, expected, 2)).toEqual([]);
  });

  it("keySigner refuses a request whose txHash is not the hash of the body of its tx, in every encoding", async () => {
    const b = offline();
    const built = await twoKeyPayment(b, keys);
    const other = await payment(
      b,
      keys.extended.keyHash,
      [keys.normal.keyHash],
      ada(6),
    );
    const signed = (
      await built.sign({
        signers: [
          keySigner(keys.normal.encodings.hex!),
          keySigner(keys.extended.encodings.hex!),
        ],
      })
    ).signedTx!;
    const wholeHash = Crypto.blake2b.hash(HexBlob(built.tx), 32).toString();
    const bad: [string, TxHashRequest][] = [
      ["the hash of another body", { txHash: other.txHash, tx: built.tx }],
      [
        "the hash of the whole transaction",
        { txHash: wholeHash, tx: built.tx },
      ],
      [
        "its hash with another transaction",
        { txHash: built.txHash, tx: other.tx },
      ],
      [
        "the hash of the signed transaction's bytes",
        {
          txHash: Crypto.blake2b.hash(HexBlob(signed), 32).toString(),
          tx: signed,
        },
      ],
    ];
    const signedAnyway: string[] = [];
    for (const fixture of keys.all)
      for (const [encoding, text] of Object.entries(fixture.encodings)) {
        const signer = keySigner(text);
        for (const [name, request] of bad) {
          const error = await caught(() => signer.signTxHash(request));
          if (
            !TxError.is(error, "INVALID_OPTION") ||
            error.details.option !== "txHash"
          )
            signedAnyway.push(`${fixture.name} (${encoding}): ${name}`);
        }
        // Its own body, with or without witnesses, is signed
        for (const tx of [built.tx, signed])
          expect(
            (await signer.signTxHash({ txHash: built.txHash, tx })).length,
          ).toBe(1);
      }
    expect(signedAnyway).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------------------------
 * R3
 * ------------------------------------------------------------------------------------------- */

describe("R3: a signature is accepted only after it verifies", () => {
  let keys: Keys;
  let wallet: MeshWallet;
  beforeAll(async () => {
    keys = await keyFixtures();
    wallet = await walletOf();
  });

  it("every witness of every signedTx and partialTx made by each form of signer verifies against the body, and nothing else differs", async () => {
    const problems: string[] = [];
    const check = async (
      where: string,
      signed: string | undefined,
      tx: string,
    ) => {
      if (signed === undefined) return problems.push(`${where}: none`);
      for (const problem of await problemsOf(signed, tx))
        problems.push(`${where}: ${problem}`);
    };
    const b = offline();
    // Key signers, in every encoding
    for (const [normalText, extendedText] of Object.values(
      keys.normal.encodings,
    ).map((text, i) => [text, Object.values(keys.extended.encodings)[i]!])) {
      const built = await twoKeyPayment(b, keys);
      await built.sign({ signers: keySigner(normalText!) });
      await check("partialTx of one key signer", built.partialTx, built.tx);
      await built.sign({ signers: keySigner(extendedText!) });
      await check("signedTx of key signers", built.signedTx, built.tx);
    }
    // Signers of hashes in either form, the mnemonic wallet, its signTx, and witnesses given
    await Crypto.ready();
    for (const form of FORMS) {
      const payer = testKey();
      const guardKey = testKey();
      const built = await payment(b, payer.keyHash, [guardKey.keyHash]);
      await built.sign({ signers: keysSigner(form, payer).signer });
      await check(`partialTx (${form})`, built.partialTx, built.tx);
      await built.addWitnesses(witnessSetOf(guardKey.answer(built.txHash)));
      await check(`signedTx (${form}, addWitnesses)`, built.signedTx, built.tx);
      const json = JSON.stringify(built);
      const restored = await b.restore(JSON.parse(json) as BuiltTxJSON);
      await check(`signedTx restored (${form})`, restored.signedTx, built.tx);
      await check(`partialTx restored (${form})`, restored.partialTx, built.tx);
    }
    for (const [name, signer] of [
      ["a Mesh wallet", wallet],
      [
        "signTx of a Mesh wallet",
        {
          signTx: (tx: string, partial?: boolean) => wallet.signTx(tx, partial),
        },
      ],
    ] as [string, Signer][]) {
      const built = await payment(b, keys.extended.keyHash, [
        keys.normal.keyHash,
      ]);
      await built.sign({ signers: signer });
      await check(`partialTx of ${name}`, built.partialTx, built.tx);
      expect(built.missing.map((k) => k.keyHash)).toEqual([
        keys.normal.keyHash,
      ]);
      await built.addWitnesses(
        await signWitnesses(keySigner(keys.normal.hex), built.tx),
      );
      await check(`signedTx of ${name}`, built.signedTx, built.tx);
    }
    // A plan
    const { plan } = await planOf(keys.normal.keyHash);
    await plan.send({
      signers: [wallet, keySigner(keys.normal.hex)],
      waitFor: "included",
    });
    await check("a plan's signedTx", plan.signedTx, plan.built!.tx);
    expect(problems).toEqual([]);
  });

  /** Answers of a signer, each with a signature that does not verify against the body */
  const forged = (
    key: TestKey,
    other: TestKey,
    txHash: string,
    otherTx: string,
    otherHash: string,
  ): [string, Signer][] => [
    ...FORMS.flatMap((form): [string, Signer][] => [
      [
        `a signature of another hash (${form})`,
        answering(form, [key.answer(otherHash)]).signer,
      ],
      [
        `a signature of the hex text of the hash (${form})`,
        answering(form, [
          { vkey: key.vkey, signature: key.sign(textOfHash(txHash)) },
        ]).signer,
      ],
      [
        `another key's vkey (${form})`,
        answering(form, [{ vkey: other.vkey, signature: key.sign(txHash) }])
          .signer,
      ],
    ]),
    [
      "a witness set of another body",
      { signTxWitnesses: async () => witnessSetOf(key.answer(otherHash)) },
    ],
    [
      "a transaction of another body",
      {
        signTx: async () =>
          withWitnesses(readTransaction(otherTx), [
            {
              kind: "vkey",
              vkey: key.vkey,
              signature: key.sign(otherHash),
              keyHash: key.keyHash,
            },
          ]),
      },
    ],
  ];

  it("an answer whose signature does not verify leaves nothing in the object or its JSON", async () => {
    await Crypto.ready();
    const b = offline();
    const kept: string[] = [];
    const key = testKey();
    const other = testKey();
    const otherBuilt = await payment(b, key.keyHash, [], ada(7));
    const count = forged(key, other, otherBuilt.txHash, "", "").length;
    for (let index = 0; index < count; index++) {
      // A fresh object each time, and the answer forged for its own hash
      const built = await payment(b, key.keyHash, [other.keyHash]);
      const [name, signer] = forged(
        key,
        other,
        built.txHash,
        otherBuilt.tx,
        otherBuilt.txHash,
      )[index]!;
      const error = await caught(() => built.sign({ signers: signer }));
      if (codeOf(error) !== "SIGNER_FAILED")
        kept.push(`${name}: ${codeOf(error)}`);
      if (built.partialTx !== built.tx) kept.push(`${name}: partialTx`);
      if (built.missing.length !== 2) kept.push(`${name}: missing`);
      if ("witnesses" in built.toJSON()) kept.push(`${name}: the JSON`);
    }
    expect(kept).toEqual([]);
  });

  it("an answer whose signature does not verify leaves nothing in a plan or its record", async () => {
    await Crypto.ready();
    const key = testKey();
    const other = testKey();
    const store = memoryPlanStore();
    const { plan } = await planOf(key.keyHash, { store, id: "order" });
    await plan.build();
    const otherBuilt = await payment(offline(), key.keyHash);
    const kept: string[] = [];
    for (const [name, signer] of forged(
      key,
      other,
      plan.built!.txHash,
      otherBuilt.tx,
      otherBuilt.txHash,
    )) {
      const error = await caught(() => plan.sign({ signers: signer }));
      if (codeOf(error) !== "SIGNER_FAILED")
        kept.push(`${name}: ${codeOf(error)}`);
      if (plan.missing.length !== 2) kept.push(`${name}: missing`);
      if (plan.signedTx !== undefined) kept.push(`${name}: signedTx`);
      for (const [where, value] of [
        ["the record", plan.toJSON()],
        ["the stored record", await store.load("order")],
      ] as const)
        if (JSON.stringify(value).includes(key.vkey))
          kept.push(`${name}: ${where}`);
    }
    expect(kept).toEqual([]);
    expect(plan.status).toBe("built");
  });

  it("signWitnesses refuses an answer of a signer of hashes that does not verify", async () => {
    await Crypto.ready();
    const b = offline();
    const key = testKey();
    const other = testKey();
    const built = await payment(b, key.keyHash);
    const otherBuilt = await payment(b, key.keyHash, [], ada(7));
    const refused = forged(
      key,
      other,
      built.txHash,
      otherBuilt.tx,
      otherBuilt.txHash,
    )
      .slice(0, 6)
      .map(async ([name, signer]) => [
        name,
        codeOf(await caught(() => signWitnesses(signer, built.tx))),
      ]);
    for (const [name, code] of await Promise.all(refused))
      expect([name, code]).toEqual([name, "SIGNER_FAILED"]);
  });

  it("addWitnesses keeps nothing of a call that holds a witness that does not verify", async () => {
    await Crypto.ready();
    const b = offline();
    const key = testKey();
    const other = testKey();
    const built = await payment(b, key.keyHash, [other.keyHash]);
    const otherBuilt = await payment(b, key.keyHash, [], ada(7));
    const good = witnessSetOf(other.answer(built.txHash));
    const bad: [string, string][] = [
      [
        "a signature of another hash",
        witnessSetOf(key.answer(otherBuilt.txHash)),
      ],
      [
        "a signature of the hex text of the hash",
        witnessSetOf({
          vkey: key.vkey,
          signature: key.sign(textOfHash(built.txHash)),
        }),
      ],
      [
        "another key's vkey",
        witnessSetOf({
          vkey: testKey().vkey,
          signature: key.sign(built.txHash),
        }),
      ],
      [
        "a transaction of another body",
        withWitnesses(readTransaction(otherBuilt.tx), [
          {
            kind: "vkey",
            vkey: key.vkey,
            signature: key.sign(otherBuilt.txHash),
            keyHash: key.keyHash,
          },
        ]),
      ],
    ];
    for (const [name, witnesses] of bad) {
      const outcome = await built.addWitnesses(good, witnesses).then(
        () => "kept",
        (thrown: unknown) => codeOf(thrown),
      );
      expect([name, outcome]).toEqual([name, "INVALID_WITNESS"]);
      expect(built.partialTx === built.tx).toBe(true);
    }
  });

  it("restore refuses a JSON that holds a witness that does not verify, in witnesses or inside built.tx", async () => {
    await Crypto.ready();
    const b = offline();
    const key = testKey();
    const other = testKey();
    const built = await payment(b, key.keyHash, [other.keyHash]);
    const otherBuilt = await payment(b, key.keyHash, [], ada(7));
    await built.sign({ signers: keysSigner("object", other).signer });
    const json = JSON.parse(JSON.stringify(built)) as BuiltTxJSON;
    const forgedWitness = (signature: string, vkey = key.vkey): KeyWitness => ({
      kind: "vkey",
      vkey,
      signature,
      keyHash: Crypto.blake2b.hash(HexBlob(vkey), 28).toString(),
    });
    const witnesses: [string, KeyWitness][] = [
      [
        "a signature of another hash",
        forgedWitness(key.sign(otherBuilt.txHash)),
      ],
      [
        "a signature of the hex text of the hash",
        forgedWitness(key.sign(textOfHash(built.txHash))),
      ],
      ["another key's vkey", forgedWitness(key.sign(built.txHash), other.vkey)],
    ];
    const refusedNot: string[] = [];
    for (const [name, witness] of witnesses) {
      const variants: [string, unknown][] = [
        [
          "in witnesses",
          {
            ...json,
            witnesses: witnessSetOf(witness, other.answer(built.txHash)),
          },
        ],
        [
          "inside built.tx",
          {
            ...json,
            built: {
              ...json.built,
              tx: withWitnesses(readTransaction(built.tx), [witness]),
            },
          },
        ],
      ];
      for (const [where, variant] of variants) {
        const error = await caught(() => b.restore(variant as BuiltTxJSON));
        if (
          !TxError.is(error, "INVALID_OPTION") ||
          error.details.option !== "json"
        )
          refusedNot.push(`${name} ${where}: ${codeOf(error)}`);
      }
    }
    expect(refusedNot).toEqual([]);
    // The JSON as written is taken
    expect((await b.restore(json)).partialTx).toBe(built.partialTx);
  });

  describe.each(["scalus", "cquisitor"] as const)(
    "on TxEmulator (%s)",
    (validator) => {
      it("the ledger accepts what the object kept and refuses a witness that does not verify", async () => {
        const emulator = await TxEmulator.create({
          validator,
          network: "preprod",
          slot: 100_000_000,
        });
        const builder = new TxBuilder({
          network: "preprod",
          provider: emulator,
          evaluator: emulator,
        });
        const address = enterprise(keys.extended.keyHash);
        emulator.fund(address, { lovelace: 100_000_000n });
        const built = await builder.build(pay(), { payer: address, trace });
        // A witness that does not verify, put in by hand, is refused by the ledger
        await Crypto.ready();
        // The payer's own public key, with a signature another key made
        const vkey = Crypto.Ed25519PrivateKey.fromExtendedBytes(
          Buffer.from(keys.extended.hex, "hex"),
        )
          .toPublic()
          .hex() as string;
        expect(deserializeAddress(address).pubKeyHash).toBe(
          keys.extended.keyHash,
        );
        const forgedTx = withWitnesses(readTransaction(built.tx), [
          {
            kind: "vkey",
            vkey,
            signature: testKey().sign(built.txHash),
            keyHash: keys.extended.keyHash,
          },
        ]);
        expect((await emulator.simulate(forgedTx)).accepted).toBe(false);
        await built.sign({
          signers: keySigner(
            keys.extended.encodings["bech32 addr_xsk of 96 bytes"]!,
          ),
        });
        expect(await problemsOf(built.signedTx!, built.tx)).toEqual([]);
        expect((await emulator.simulate(built.signedTx!)).accepted).toBe(true);
        await built.submit();
        expect(
          (await built.awaitInclusion({ timeoutMs: 1_000, pollMs: 1 })).txHash,
        ).toBe(built.txHash);
      });
    },
  );
});

/* ---------------------------------------------------------------------------------------------
 * R4
 * ------------------------------------------------------------------------------------------- */

/** The methods of a provider and of a submitter, every one of which is watched */
const PROVIDER_METHODS = [
  "fetchAccountInfo",
  "fetchAddressUTxOs",
  "fetchAddressTxs",
  "fetchAssetAddresses",
  "fetchAssetMetadata",
  "fetchBlockInfo",
  "fetchCollectionAssets",
  "fetchGovernanceProposal",
  "fetchHandle",
  "fetchHandleAddress",
  "fetchProtocolParameters",
  "fetchTxInfo",
  "fetchUTxOs",
  "get",
  "submitTx",
];

/**
 * A provider, or a submitter, that records every call of its methods; in `throw` mode every call
 * throws, else it answers as told (a search finds nothing by default, a submit is taken)
 */
const watched = (
  answers: Record<string, (...args: unknown[]) => unknown> = {},
) => {
  const control = {
    mode: "record" as "record" | "throw",
    calls: [] as string[],
  };
  const object: Record<string, unknown> = {};
  for (const name of PROVIDER_METHODS)
    object[name] = (...args: unknown[]) => {
      control.calls.push(name);
      if (control.mode === "throw") throw new Error(`${name} was called`);
      return Promise.resolve().then(() => {
        const answer = answers[name];
        if (answer) return answer(...args);
        if (name === "submitTx") return "";
        throw { kind: "notFound", status: 404 };
      });
    };
  return { control, object };
};

const foundInfo = (hash: string, extra: Record<string, unknown> = {}) => ({
  hash,
  slot: "1200",
  block: "b".repeat(64),
  blockHeight: 1200,
  ...extra,
});

/** Thrown as the ledger's refusal is thrown */
const refusal = () => ({ kind: "rejected", status: 400 });

describe("R4: signing sends nothing", () => {
  let keys: Keys;
  beforeAll(async () => {
    keys = await keyFixtures();
  });

  it.each(["record", "throw"] as const)(
    "sign and addWitnesses of the object, toJSON and restore call neither the provider nor the submitter (%s)",
    async (mode) => {
      const provider = watched();
      const submitter = watched();
      const b = offline({
        provider: provider.object as unknown as TxBuilderOptions["provider"],
        submitter: submitter.object as unknown as TxBuilderOptions["submitter"],
      });
      const built = await twoKeyPayment(b, keys);
      provider.control.calls.length = 0;
      submitter.control.calls.length = 0;
      provider.control.mode = mode;
      submitter.control.mode = mode;
      await built.sign({ signers: keySigner(keys.extended.hex) });
      const json = JSON.stringify(built);
      const restored = await b.restore(JSON.parse(json) as BuiltTxJSON);
      await restored.sign({
        signers: [
          hashSigner("callback", () => []).signer,
          { signTxWitnesses: async () => "a0" },
        ],
      });
      await restored.addWitnesses(
        await signWitnesses(keySigner(keys.normal.hex), built.tx),
      );
      await built.addWitnesses(restored.partialTx);
      expect(restored.signedTx).toBeDefined();
      expect(built.signedTx).toBe(restored.signedTx);
      JSON.stringify(restored);
      await b.restore(restored.toJSON());
      expect(provider.control.calls).toEqual([]);
      expect(submitter.control.calls).toEqual([]);
    },
  );

  it("submit calls the submitter, and the provider only for one search after a refusal", async () => {
    const cases: [
      string,
      Record<string, (...a: unknown[]) => unknown>,
      string[],
      string[],
    ][] = [
      ["taken", {}, ["submitTx"], []],
      [
        "refused",
        {
          submitTx: () => {
            throw refusal();
          },
        },
        ["submitTx"],
        ["fetchTxInfo"],
      ],
    ];
    for (const [name, answers, submitterCalls, providerCalls] of cases) {
      const provider = watched();
      const submitter = watched(answers);
      const b = offline({
        provider: provider.object as unknown as TxBuilderOptions["provider"],
        submitter: submitter.object as unknown as TxBuilderOptions["submitter"],
      });
      const built = await twoKeyPayment(b, keys);
      await built.sign({
        signers: [keySigner(keys.extended.hex), keySigner(keys.normal.hex)],
      });
      provider.control.calls.length = 0;
      await built.submit().catch(() => undefined);
      expect([name, submitter.control.calls, provider.control.calls]).toEqual([
        name,
        submitterCalls,
        providerCalls,
      ]);
    }
  });

  it("awaitInclusion calls only the provider's search", async () => {
    const provider = watched({
      fetchTxInfo: (hash) => foundInfo(hash as string),
    });
    const submitter = watched();
    const b = offline({
      provider: provider.object as unknown as TxBuilderOptions["provider"],
      submitter: submitter.object as unknown as TxBuilderOptions["submitter"],
    });
    const built = await twoKeyPayment(b, keys);
    provider.control.calls.length = 0;
    await built.awaitInclusion();
    expect(provider.control.calls).toEqual(["fetchTxInfo"]);
    expect(submitter.control.calls).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------------------------
 * R5
 * ------------------------------------------------------------------------------------------- */

describe("R5: an extended key is used only if it is one", () => {
  let keys: Keys;
  beforeAll(async () => {
    keys = await keyFixtures();
  });

  it("an unclamped key is refused by keySigner itself, in every encoding", () => {
    const unclamped =
      (Buffer.from(keys.extended.hex, "hex")[0]! | 0x07)
        .toString(16)
        .padStart(2, "0") + keys.extended.hex.slice(2);
    const texts = [
      unclamped,
      toBech32("ed25519e_sk", unclamped),
      toBech32("addr_xsk", unclamped + "00".repeat(32)),
      rfc.key + rfc.vkey,
      toBech32("ed25519e_sk", rfc.key + rfc.vkey),
    ];
    const made = texts.filter((text) => {
      try {
        keySigner(text);
        return true;
      } catch (error) {
        return !TxError.is(error, "INVALID_OPTION");
      }
    });
    expect(made).toHaveLength(0);
  });

  /** The forms keySigner reads and then refuses at their first use */
  const refusedAtUse = (seed: ReturnType<typeof seedKey>) => {
    const own = keys.extended.encodings["bech32 stake_xsk of 128 bytes"]!;
    const bytes = Buffer.from(bech32.fromWords(bech32.decode(own, 1023).words));
    bytes.set(Buffer.from(rfc.vkey, "hex"), 64);
    const wrong = bytes.toString("hex");
    return [
      ...Object.entries(seed.encodings).map(
        ([name, text]): [string, string, string] => [
          `a 32-byte key followed by its public key, ${name}`,
          text,
          seed.keyHash,
        ],
      ),
      [
        "a key file whose public key is not its own, cborHex 5880",
        `5880${wrong}`,
        keys.extended.keyHash,
      ] as [string, string, string],
      [
        "a key file whose public key is not its own, bech32 addr_xsk",
        toBech32("addr_xsk", wrong),
        keys.extended.keyHash,
      ] as [string, string, string],
    ];
  };

  it("a key refused at its first use gives no signature on any path", async () => {
    const seed = seedKey();
    const b = offline();
    const signedAnyway: string[] = [];
    for (const [name, text, keyHash] of refusedAtUse(seed)) {
      const built = await payment(b, keys.normal.keyHash, [keyHash]);
      const { plan } = await planOf(keyHash);
      await plan.build();
      const asked = plan.missing.length;
      const paths: [string, () => Promise<unknown>][] = [
        [
          "signTxHash",
          () =>
            keySigner(text).signTxHash({
              txHash: built.txHash,
              tx: built.tx,
              keys: [{ keyHash, roles: ["guard"] }],
            }),
        ],
        ["signWitnesses", () => signWitnesses(keySigner(text), built.tx)],
        [
          "BuiltTx.sign",
          () => built.sign({ signers: keySigner(text), partial: false }),
        ],
        ...PLAN_CALLS.map((call): [string, () => Promise<unknown>] => [
          `plan.${call}`,
          () => callPlan(plan, call, keySigner(text)),
        ]),
      ];
      for (const [path, run] of paths) {
        const error = await caught(run);
        const code = codeOf(error);
        if (code !== "INVALID_OPTION" && code !== "SIGNER_FAILED")
          signedAnyway.push(`${name}, ${path}: ${code}`);
      }
      if (built.partialTx !== built.tx)
        signedAnyway.push(`${name}: the object`);
      if (plan.missing.length !== asked) signedAnyway.push(`${name}: the plan`);
    }
    expect(signedAnyway).toEqual([]);
  });

  it("a fresh signer of such a key gives no signature to two calls that start at once", async () => {
    const seed = seedKey();
    const b = offline();
    const signedAnyway: string[] = [];
    for (const [name, text, keyHash] of refusedAtUse(seed)) {
      const first = await payment(b, keys.normal.keyHash, [keyHash]);
      const second = await payment(b, keys.normal.keyHash, [keyHash]);
      const request = {
        txHash: first.txHash,
        tx: first.tx,
        keys: [{ keyHash, roles: ["guard" as const] }],
      };
      const direct = keySigner(text);
      const answers = await Promise.allSettled([
        direct.signTxHash(request),
        direct.signTxHash(request),
      ]);
      if (answers.some((a) => a.status === "fulfilled"))
        signedAnyway.push(`${name}: signTxHash`);
      const shared = keySigner(text);
      const signs = await Promise.allSettled([
        first.sign({ signers: shared }),
        second.sign({ signers: shared }),
      ]);
      if (signs.some((a) => a.status === "fulfilled"))
        signedAnyway.push(`${name}: sign`);
      if (first.partialTx !== first.tx || second.partialTx !== second.tx)
        signedAnyway.push(`${name}: a witness kept`);
    }
    expect(signedAnyway).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------------------------
 * R6
 * ------------------------------------------------------------------------------------------- */

describe("R6: one object, one body", () => {
  let keys: Keys;
  beforeAll(async () => {
    keys = await keyFixtures();
  });

  it("no call changes tx or txHash", async () => {
    const provider = watched({
      fetchTxInfo: (hash) => foundInfo(hash as string),
    });
    const b = offline({
      provider: provider.object as unknown as TxBuilderOptions["provider"],
    });
    const built = await twoKeyPayment(b, keys);
    const { tx, txHash } = built;
    const changed: string[] = [];
    const steps: [string, () => Promise<unknown>][] = [
      ["sign", () => built.sign({ signers: keySigner(keys.extended.hex) })],
      [
        "addWitnesses",
        async () =>
          built.addWitnesses(
            await signWitnesses(keySigner(keys.normal.hex), built.tx),
          ),
      ],
      ["toJSON", async () => built.toJSON()],
      ["submit", () => built.submit()],
      ["awaitInclusion", () => built.awaitInclusion()],
      ["restore", () => b.restore(built.toJSON())],
    ];
    for (const [name, run] of steps) {
      const result = await run();
      if (built.tx !== tx || built.txHash !== txHash) changed.push(name);
      if (result instanceof BuiltTx && result.tx !== tx)
        changed.push(`${name}: result`);
    }
    expect(changed).toEqual([]);
    expect(await problemsOf(built.signedTx!, tx)).toEqual([]);
  });

  it("signs, holds, writes and sends the first body after its members are changed through casts", async () => {
    const sent: string[] = [];
    const b = offline({
      submitter: {
        submitTx: async (tx: string) => {
          sent.push(tx);
          return "";
        },
      },
    });
    const built = await twoKeyPayment(b, keys);
    const other = await payment(
      b,
      keys.extended.keyHash,
      [keys.normal.keyHash],
      ada(9),
    );
    const { tx, txHash } = built;
    const loose = built as unknown as Record<string, unknown>;
    // Each change is tried, whether or not the object lets it happen
    const attempts = [
      () => {
        loose.tx = other.tx;
      },
      () => Reflect.set(built, "tx", other.tx),
      () => Object.defineProperty(built, "tx", { value: other.tx }),
      () => {
        loose.txHash = other.txHash;
      },
      () => Object.defineProperty(built, "txHash", { value: other.txHash }),
      () => {
        loose.signers = other.signers;
      },
      () => {
        (built.signers.keyHashes as string[]).length = 0;
        (built.signers.keys as unknown[]).length = 0;
      },
      () => {
        (built.prototype as { body: { fee: string } }).body.fee = "1";
      },
    ];
    for (const attempt of attempts)
      try {
        attempt();
      } catch {
        // A frozen member refuses the change
      }
    const recorded = hashSigner("object", (request) =>
      keySigner(keys.normal.hex).signTxHash(request),
    );
    await built.sign({
      signers: [recorded.signer, keySigner(keys.extended.hex)],
    });
    expect(recorded.requests.map((r) => r.txHash === txHash)).toEqual([true]);
    expect(recorded.requests.map((r) => bodyHashOf(r.tx) === txHash)).toEqual([
      true,
    ]);
    expect(built.missing).toEqual([]);
    expect(bodyHashOf(built.partialTx) === txHash).toBe(true);
    expect(await problemsOf(built.signedTx!, tx)).toEqual([]);
    const json = built.toJSON();
    expect(json.txHash === txHash).toBe(true);
    expect(bodyHashOf(json.built.tx as string) === txHash).toBe(true);
    await built.submit();
    const restored = await b.restore(json);
    await restored.submit();
    expect(sent.map(bodyHashOf).every((h) => h === txHash)).toBe(true);
    expect(sent).toHaveLength(2);
    expect(new Set(sent).size).toBe(1);
  });

  it("a recording submitter sees one byte string from every submit of an object, of its JSON restored and of a restore of a restore", async () => {
    const sent: string[] = [];
    let answer: () => unknown = () => "";
    const b = offline({
      submitter: {
        submitTx: async (tx: string) => {
          sent.push(tx);
          return answer() as string;
        },
      },
    });
    const built = await twoKeyPayment(b, keys);
    await built.sign({
      signers: [keySigner(keys.extended.hex), keySigner(keys.normal.hex)],
    });
    await built.submit();
    answer = () => {
      throw new Error("socket hang up");
    };
    await caught(() => built.submit());
    answer = () => {
      throw refusal();
    };
    await built.submit();
    const restored = await b.restore(JSON.parse(JSON.stringify(built)));
    await restored.submit();
    const again = await offline({
      submitter: {
        submitTx: async (tx: string) => {
          sent.push(tx);
          return "";
        },
      },
    }).restore(JSON.parse(JSON.stringify(restored)));
    await again.submit();
    expect(sent).toHaveLength(5);
    expect(new Set(sent).size).toBe(1);
    expect(sent[0] === built.signedTx).toBe(true);
  });
});

/* ---------------------------------------------------------------------------------------------
 * R7
 * ------------------------------------------------------------------------------------------- */

describe("R7: submit sends signedTx only", () => {
  let keys: Keys;
  beforeAll(async () => {
    keys = await keyFixtures();
  });

  /** A signed object on a builder whose provider answers searches as told */
  const signed = async (fetchTxInfo?: (hash: unknown) => unknown) => {
    const provider = watched(fetchTxInfo ? { fetchTxInfo } : {});
    const b = offline({
      provider: provider.object as unknown as TxBuilderOptions["provider"],
    });
    const built = await twoKeyPayment(b, keys);
    await built.sign({
      signers: [keySigner(keys.extended.hex), keySigner(keys.normal.hex)],
    });
    provider.control.calls.length = 0;
    return { built, provider, b };
  };

  it("sends nothing while a key is missing: after one key, after none, and after restore", async () => {
    const provider = watched();
    const sent: string[] = [];
    const submitter = {
      submitTx: async (tx: string) => {
        sent.push(tx);
        return "";
      },
    };
    const b = offline({
      provider: provider.object as unknown as TxBuilderOptions["provider"],
      submitter,
    });
    const none = await twoKeyPayment(b, keys);
    const one = await twoKeyPayment(b, keys);
    await one.sign({ signers: keySigner(keys.extended.hex) });
    const restored = await b.restore(JSON.parse(JSON.stringify(one)));
    provider.control.calls.length = 0;
    for (const built of [none, one, restored])
      for (const options of [undefined, { submitter }]) {
        const error = await caught(() => built.submit(options));
        expect(codeOf(error)).toBe("MISSING_SIGNATURES");
      }
    expect(sent).toEqual([]);
    expect(provider.control.calls).toEqual([]);
  });

  /** A submitter whose answers the scenario sets, recording what it is handed */
  const scripted = () => {
    const sent: string[] = [];
    const answers: (() => unknown)[] = [];
    return {
      sent,
      answers,
      submitter: {
        submitTx: async (tx: string) => {
          sent.push(tx);
          return (answers.shift() ?? (() => ""))() as string;
        },
      },
    };
  };

  const table: [
    string,
    ((hash: unknown) => unknown) | undefined,
    (built: BuiltTx, s: ReturnType<typeof scripted>) => Promise<unknown>,
    "returns" | "REJECTED",
    number,
  ][] = [
    [
      "a refusal after a taken delivery",
      undefined,
      async (built, s) => {
        await built.submit({ submitter: s.submitter });
        s.answers.push(() => {
          throw refusal();
        });
        return built.submit({ submitter: s.submitter });
      },
      "returns",
      0,
    ],
    [
      "a refusal after a lost answer",
      undefined,
      async (built, s) => {
        s.answers.push(() => {
          throw new Error("socket hang up");
        });
        expect(
          codeOf(await caught(() => built.submit({ submitter: s.submitter }))),
        ).toBe("SUBMIT_FAILED");
        s.answers.push(() => {
          throw refusal();
        });
        return built.submit({ submitter: s.submitter });
      },
      "returns",
      0,
    ],
    [
      "a refusal while another delivery has not answered",
      undefined,
      async (built, s) => {
        const held = gate<string>();
        s.answers.push(() => held.promise);
        const first = built.submit({ submitter: s.submitter });
        s.answers.push(() => {
          throw refusal();
        });
        const second = built.submit({ submitter: s.submitter });
        await settle();
        held.resolve("");
        await first;
        return second;
      },
      "returns",
      0,
    ],
    [
      "a refusal with the transaction already found",
      (hash) => foundInfo(hash as string),
      async (built, s) => {
        s.answers.push(() => {
          throw refusal();
        });
        return built.submit({ submitter: s.submitter });
      },
      "returns",
      1,
    ],
    [
      "a first refusal with nothing found",
      undefined,
      async (built, s) => {
        s.answers.push(() => {
          throw refusal();
        });
        return built.submit({ submitter: s.submitter });
      },
      "REJECTED",
      1,
    ],
  ];

  it.each(table)("%s", async (_, fetchTxInfo, run, outcome, searches) => {
    const { built, provider } = await signed(fetchTxInfo);
    const s = scripted();
    const error = await run(built, s).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error === undefined ? "returns" : codeOf(error)).toBe(outcome);
    expect(
      provider.control.calls.filter((c) => c === "fetchTxInfo"),
    ).toHaveLength(searches);
    expect(provider.control.calls.filter((c) => c !== "fetchTxInfo")).toEqual(
      [],
    );
    expect(s.sent.every((tx) => tx === built.signedTx)).toBe(true);
    if (outcome === "REJECTED") {
      const { details, retryable } = error as TxPlanError<"REJECTED">;
      expect([details, retryable]).toEqual([{ otherLive: [] }, false]);
    }
  });

  it("no reason of SUBMIT_FAILED changes what a later refusal does, and its details show nothing of the transaction, a key or an answer", async () => {
    const BODY = "the provider's answer body";
    const reasons: [string, (built: BuiltTx) => unknown][] = [
      [
        "unavailable",
        (built) =>
          new ProviderError(BODY, {
            kind: "unavailable",
            status: 503,
            body: { tx: built.signedTx, text: BODY },
          }),
      ],
      [
        "rateLimited",
        (built) =>
          JSON.stringify({
            data: { tx: built.signedTx, text: BODY },
            headers: {},
            status: 429,
          }),
      ],
      [
        "unauthorized",
        (built) => ({ status: 401, data: built.signedTx, text: BODY }),
      ],
      [
        "unknown",
        (built) =>
          Object.assign(new Error(BODY), { tx: built.signedTx, keys: keys }),
      ],
    ];
    const secrets = secretsOf(...keys.all);
    for (const [reason, thrown] of reasons) {
      const { built, provider } = await signed();
      const s = scripted();
      s.answers.push(() => {
        throw thrown(built);
      });
      const error = await caught(() =>
        built.submit({ submitter: s.submitter }),
      );
      expect(codeOf(error)).toBe("SUBMIT_FAILED");
      const { details } = error as TxPlanError<"SUBMIT_FAILED">;
      expect(details.reason).toBe(reason);
      expect(
        Object.keys(details).every((k) => k === "reason" || k === "status"),
      ).toBe(true);
      const text = JSON.stringify(details);
      for (const part of [built.signedTx!, built.txHash, BODY])
        expect(text).not.toContain(part);
      expect(shown(details, secrets)).toEqual([]);
      // The delivery may have gone through: the refusal proves nothing, and nothing is read
      s.answers.push(() => {
        throw refusal();
      });
      expect(await built.submit({ submitter: s.submitter })).toBe(built);
      expect(provider.control.calls).toEqual([]);
      expect(s.sent).toEqual([built.signedTx, built.signedTx]);
    }
  });

  it("SUBMIT_FAILED, REJECTED and CONFIRM_TIMEOUT end with the sentence that tells not to build another transaction to retry", async () => {
    const lost = await signed();
    const failed = await caught(() =>
      lost.built.submit({
        submitter: {
          submitTx: async () => {
            throw new Error("socket hang up");
          },
        },
      }),
    );
    const refused = await signed();
    const rejected = await caught(() =>
      refused.built.submit({
        submitter: {
          submitTx: async () => {
            throw refusal();
          },
        },
      }),
    );
    const waiting = await signed();
    let timedOut: unknown;
    await onFakeClock(async () => {
      const call = waiting.built
        .awaitInclusion({ timeoutMs: 20, pollMs: 5 })
        .catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(20);
      timedOut = await call;
    });
    const endings = [failed, rejected, timedOut].map((error) => [
      codeOf(error),
      (error as Error).message.endsWith(` ${NO_REBUILD_TEXT}`),
    ]);
    expect(endings).toEqual([
      ["SUBMIT_FAILED", true],
      ["REJECTED", true],
      ["CONFIRM_TIMEOUT", true],
    ]);
  });
});

/* ---------------------------------------------------------------------------------------------
 * R8
 * ------------------------------------------------------------------------------------------- */

describe("R8: awaitInclusion changes nothing", () => {
  let keys: Keys;
  beforeAll(async () => {
    keys = await keyFixtures();
  });

  /** Prices every redeemer of a transaction at fixed units */
  const TAGS = ["SPEND", "MINT", "CERT", "REWARD", "VOTE", "PROPOSE"] as const;
  const fakeEvaluator: IEvaluator = {
    evaluateTx: async (tx) =>
      (
        Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ??
        []
      ).map((r) => ({
        tag: TAGS[r.tag()]!,
        index: Number(r.index()),
        budget: { mem: 1000, steps: 2000 },
      })),
  };
  const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

  /** A spend of an always-succeeding script, on a builder whose provider answers as told */
  const plutusSpend = async (fetchTxInfo: (hash: unknown) => unknown) => {
    const provider = watched({ fetchTxInfo });
    const b = offline({
      evaluator: fakeEvaluator,
      provider: provider.object as unknown as TxBuilderOptions["provider"],
    });
    const address = enterprise(keys.extended.keyHash);
    const built = await b.build(
      [
        spend.plutus({
          utxo: {
            ...utxoAt(b.scriptAddress(plutus), ada(10)),
            datum: {
              type: "inline",
              data: { type: "CBOR", content: "d87980" },
            },
          },
          script: plutus,
          redeemer: { data: mConStr0([]) },
        }),
        output({ address: recipient, value: { lovelace: ada(2) } }),
      ],
      {
        payer: {
          changeAddress: address,
          utxos: [utxoAt(address), utxoAt(address, ada(5))],
        },
        trace,
      },
    );
    return built;
  };

  /** A key-signed payment on a builder whose provider answers searches as told */
  const plain = async (fetchTxInfo: (hash: unknown) => unknown) => {
    const provider = watched({ fetchTxInfo });
    const built = await twoKeyPayment(
      offline({
        provider: provider.object as unknown as TxBuilderOptions["provider"],
      }),
      keys,
    );
    await built.sign({ signers: keySigner(keys.extended.hex) });
    return built;
  };

  const outcomes: [string, (hash: unknown) => unknown, string][] = [
    ["found", (hash) => foundInfo(hash as string), "found"],
    [
      "found with is_valid = false",
      (hash) => foundInfo(hash as string, { validContract: false }),
      "SCRIPT_FAILED",
    ],
    [
      "a provider that cannot search",
      () => {
        throw { kind: "unsupported" };
      },
      "CANNOT_OBSERVE",
    ],
    [
      "not found",
      () => {
        throw { kind: "notFound", status: 404 };
      },
      "CONFIRM_TIMEOUT",
    ],
    [
      "an answer about another transaction",
      () => foundInfo("c".repeat(64)),
      "CONFIRM_TIMEOUT",
    ],
  ];

  it.each(outcomes)(
    "%s: the object's JSON, partialTx, signedTx and missing are the same after it",
    async (_, fetchTxInfo, expected) => {
      const built = await plain(fetchTxInfo);
      const before = {
        json: JSON.stringify(built),
        partialTx: built.partialTx,
        signedTx: built.signedTx,
        missing: JSON.stringify(built.missing),
      };
      let result: unknown;
      await onFakeClock(async () => {
        const call = built.awaitInclusion({ timeoutMs: 20, pollMs: 5 }).then(
          () => "found",
          (error: unknown) => codeOf(error),
        );
        await jest.advanceTimersByTimeAsync(20);
        result = await call;
      });
      expect(result).toBe(expected);
      expect({
        json: JSON.stringify(built),
        partialTx: built.partialTx,
        signedTx: built.signedTx,
        missing: JSON.stringify(built.missing),
      }).toEqual(before);
    },
  );

  it("finds a transaction that runs a Plutus script only with validContract: true; unknown is never no", async () => {
    const results: [string, string][] = [];
    const answers: [string, (hash: unknown) => unknown][] = [
      [
        "validContract: true",
        (hash) => foundInfo(hash as string, { validContract: true }),
      ],
      ["no validContract", (hash) => foundInfo(hash as string)],
      [
        "validContract: false",
        (hash) => foundInfo(hash as string, { validContract: false }),
      ],
    ];
    for (const [name, answer] of answers) {
      const built = await plutusSpend(answer);
      expect(built.redeemers.length).toBeGreaterThan(0);
      const restored = await offline({
        provider: watched({ fetchTxInfo: answer })
          .object as unknown as TxBuilderOptions["provider"],
      }).restore(JSON.parse(JSON.stringify(built)));
      for (const [which, object] of [
        ["built", built],
        ["restored", restored],
      ] as const) {
        const outcome = await object.awaitInclusion().then(
          () => "found",
          (error: unknown) =>
            `${codeOf(error)} ${
              (error as TxPlanError<"CANNOT_OBSERVE">).details?.reason ?? ""
            }`.trim(),
        );
        results.push([`${name}, ${which}`, outcome]);
      }
    }
    expect(results).toEqual([
      ["validContract: true, built", "found"],
      ["validContract: true, restored", "found"],
      ["no validContract, built", "CANNOT_OBSERVE noValidity"],
      ["no validContract, restored", "CANNOT_OBSERVE noValidity"],
      ["validContract: false, built", "SCRIPT_FAILED"],
      ["validContract: false, restored", "SCRIPT_FAILED"],
    ]);
    // A transaction without a Plutus script is found without validContract
    expect(
      (
        await (
          await plain((hash) => foundInfo(hash as string))
        ).awaitInclusion()
      ).blockHeight,
    ).toBe(1200);
  });
});

/* ---------------------------------------------------------------------------------------------
 * R1, over the whole file
 * ------------------------------------------------------------------------------------------- */

describe("R1, over the whole file: no trace event of its builds and plans shows a key", () => {
  it("searches every event the builds and plans above reported", async () => {
    const keys = await keyFixtures();
    // One build of its own, so that the test also stands when it is run alone
    await twoKeyPayment(offline(), keys);
    expect(events.length).toBeGreaterThan(0);
    expect(shown(events, secretsOf(...keys.all, seedKey()))).toEqual([]);
  });
});
