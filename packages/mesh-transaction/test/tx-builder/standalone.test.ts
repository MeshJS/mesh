import { getEventListeners } from "node:events";

import { CachedFetcher } from "@meshsdk/common";
import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  NativeScript,
  Protocol,
  pubKeyAddress,
  serializeAddressObj,
} from "@meshsdk/core";
import { CborWriter, Crypto, Transaction, TxCBOR } from "@meshsdk/core-cst";

import type { AskedKey } from "../../src/tx-builder";
import {
  addWitnesses,
  BuiltTx,
  guard,
  output,
  outputOf,
  signedKeyHashes,
  Signer,
  spend,
  StandaloneTx,
  TxBuilder,
  TxBuilderOptions,
  TxBuildError,
  TxHashRequest,
  TxInclusion,
  TxPlanError,
  Utxo,
  utxosAfter,
} from "../../src/tx-builder";
import { NO_REBUILD } from "../../src/tx-builder/errors";
import { baseAddress } from "../test-util";
import { hashSigner, keysSigner, TestKey, testKey } from "./hash-signer-util";
import { pay, setup } from "./plan/plan-emulator-util";
import { ref } from "./utxo-util";

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const recipient = baseAddress(2);
const ada = (n: number) => BigInt(n) * 1_000_000n;

/** A builder without a provider: a build reads nothing */
const builder = (network: "preprod" | "mainnet" = "preprod") =>
  new TxBuilder({ network, params, costModels });

let nextHash = 0;
const utxoAt = (address: string, lovelace = ada(100)): Utxo => ({
  txHash: (++nextHash).toString(16).padStart(64, "e"),
  outputIndex: 0,
  address,
  value: { lovelace },
});

/** The members of `BuiltTx` a build without collateral and validity has */
const BUILT_MEMBERS = [
  "tx",
  "txHash",
  "prototype",
  "fee",
  "exUnits",
  "redeemers",
  "inputs",
  "selectedInputs",
  "referenceInputs",
  "outputs",
  "change",
  "signers",
  "network",
  "warnings",
  "parts",
];

/**
 * A payment from the payer's key that a guard key must sign too, and that a native script naming
 * a third key spends from: two required keys and one that only a script names
 */
const fixture = async (
  options: { native?: boolean; builder?: Partial<TxBuilderOptions> } = {},
) => {
  await Crypto.ready();
  const payer = testKey();
  const guardKey = testKey();
  const scriptKey = testKey();
  const native: NativeScript = { type: "sig", keyHash: scriptKey.keyHash };
  const b =
    options.builder === undefined
      ? builder()
      : new TxBuilder({
          network: "preprod",
          params,
          costModels,
          ...options.builder,
        });
  const built = await b.build(
    [
      output({ address: recipient, value: { lovelace: ada(5) }, label: "pay" }),
      guard.pubKey({ keyHash: guardKey.keyHash }),
      options.native &&
        spend.native({
          utxo: utxoAt(b.scriptAddress(native), ada(2)),
          script: native,
        }),
    ],
    { payer: { changeAddress: payer.address, utxos: [utxoAt(payer.address)] } },
  );
  return { built, payer, guardKey, scriptKey, builder: b };
};

/** A witness set holding the vkey witnesses of these keys over a transaction hash */
const witnessSet = (txHash: string, ...keys: TestKey[]) => {
  const writer = new CborWriter().writeStartMap(1).writeInt(0);
  writer.writeStartArray(keys.length);
  for (const key of keys)
    writer
      .writeStartArray(2)
      .writeByteString(Buffer.from(key.vkey, "hex"))
      .writeByteString(Buffer.from(key.sign(txHash), "hex"));
  return writer.encodeAsHex();
};

/** A witness set holding one bootstrap witness of a key over a transaction hash */
const bootstrapSet = (txHash: string, key: TestKey) =>
  new CborWriter()
    .writeStartMap(1)
    .writeInt(2)
    .writeStartArray(1)
    .writeStartArray(4)
    .writeByteString(Buffer.from(key.vkey, "hex"))
    .writeByteString(Buffer.from(key.sign(txHash), "hex"))
    .writeByteString(new Uint8Array(32))
    .writeByteString(Buffer.from("a0", "hex"))
    .encodeAsHex();

/** The public keys of a transaction's vkey and bootstrap witnesses */
const vkeysOf = (tx: string) => {
  const set = Transaction.fromCbor(TxCBOR(tx)).witnessSet();
  return {
    vkeys: Array.from(set.vkeys()?.values() ?? [], (w) => w.vkey() as string),
    bootstraps: Array.from(
      set.bootstraps()?.values() ?? [],
      (w) => w.vkey() as string,
    ),
  };
};

/** The rejection of a promise, or the throw of a call */
const caught = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
};

const keyOf = (keyHash: string, ...roles: AskedKey["roles"]) => ({
  keyHash,
  roles,
});

describe("StandaloneTx: the object", () => {
  it("is an instance of the class whose own members are exactly the data of the build, frozen", async () => {
    const { built } = await fixture();
    expect(built).toBeInstanceOf(StandaloneTx);
    expect(Object.keys(built)).toEqual(BUILT_MEMBERS);
    expect(Reflect.ownKeys(built)).toEqual(BUILT_MEMBERS);
    expect(Object.isFrozen(built)).toBe(true);
    for (const key of Reflect.ownKeys(built)) {
      const descriptor = Object.getOwnPropertyDescriptor(built, key)!;
      expect(descriptor.enumerable).toBe(true);
      expect(descriptor.writable).toBe(false);
      expect(typeof descriptor.value).not.toBe("function");
    }
    expect(() => {
      (built as { fee: bigint }).fee = 0n;
    }).toThrow(TypeError);
    // The calls and getters are the class's, not the object's
    for (const name of [
      "sign",
      "addWitnesses",
      "submit",
      "awaitInclusion",
      "signedTx",
      "partialTx",
      "missing",
    ])
      expect(Object.getOwnPropertyNames(StandaloneTx.prototype)).toContain(
        name,
      );
  });

  it("copies as the same plain data", async () => {
    const { built } = await fixture();
    const spread = { ...built };
    const cloned = structuredClone(built);
    for (const copy of [spread, cloned]) {
      expect(copy).not.toBeInstanceOf(StandaloneTx);
      expect(Object.getPrototypeOf(Object.getPrototypeOf(copy))).toBeNull();
      expect(Object.keys(copy)).toEqual(BUILT_MEMBERS);
    }
    expect(cloned).toEqual(spread);
    expect(spread.tx).toBe(built.tx);
    expect("sign" in spread).toBe(false);
  });

  it("signs and asks for what was built, whatever is changed in its members later", async () => {
    const { built, payer, guardKey, scriptKey } = await fixture({
      native: true,
    });
    const tx = built.tx;
    // Every nested member the object could read is changed or emptied
    const signers = built.signers as {
      keyHashes: string[];
      keys: { keyHash: string; roles: string[] }[];
      byronAddresses: string[];
      nativeScripts: unknown[];
    };
    signers.keys[0]!.roles.push("vote");
    signers.keys[0]!.keyHash = scriptKey.keyHash;
    signers.keys.length = 1;
    signers.keyHashes.length = 0;
    signers.nativeScripts.length = 0;
    signers.byronAddresses.push(
      "Ae2tdPwUPEZ4YjgvykNpoFeYUxoyhNj2kg8KfKWN2FizsSpLUPv68MpTVDo",
    );
    (built.prototype.body as { fee: string }).fee = "1";

    expect(built.missing).toEqual([
      keyOf(guardKey.keyHash, "guard"),
      keyOf(payer.keyHash, "input"),
    ]);
    // The build spends from no Byron address: a bootstrap witness is still not kept
    await built.addWitnesses(bootstrapSet(built.txHash, testKey()));
    expect(vkeysOf(built.partialTx).bootstraps).toEqual([]);
    expect(built.partialTx).toBe(tx);
    const { signer, requests } = keysSigner("object", payer, scriptKey);
    await built.sign({ signers: signer });
    expect(requests[0]!.keys).toEqual([
      keyOf(guardKey.keyHash, "guard"),
      keyOf(payer.keyHash, "input"),
      keyOf(scriptKey.keyHash, "nativeScript"),
    ]);
    expect(requests[0]!.tx).toBe(tx);
    expect(built.missing).toEqual([keyOf(guardKey.keyHash, "guard")]);
    await built.addWitnesses(witnessSet(built.txHash, guardKey));
    expect(built.signedTx).toBe(
      await addWitnesses(
        tx,
        witnessSet(built.txHash, payer, scriptKey),
        witnessSet(built.txHash, guardKey),
      ),
    );
  });

  it("returns plain data from what is not a build of the builder: a plan's build", async () => {
    const { builder: planBuilder, address } = await setup();
    const plan = planBuilder.plan(pay(), { payer: address });
    const data = await plan.build();
    expect(data).not.toBeInstanceOf(StandaloneTx);
    expect("sign" in data).toBe(false);
    expect(plan.built).not.toBeInstanceOf(StandaloneTx);
    // A plan takes plans only as `after`
    const built = await planBuilder.build(pay(), { payer: address });
    expect(built).toBeInstanceOf(StandaloneTx);
    const error = await caught(() =>
      planBuilder.plan(pay(), {
        payer: address,
        after: built as never,
      }),
    );
    expect(error).toBeInstanceOf(TxBuildError);
    expect((error as TxBuildError).code).toBe("INVALID_OPTION");
    expect((error as TxBuildError<"INVALID_OPTION">).details.option).toBe(
      "after",
    );
  });

  it("goes wherever a built transaction goes: after, utxosAfter, outputOf", async () => {
    const { built, payer, builder: b } = await fixture();
    expect(outputOf(built, "pay").address).toBe(recipient);
    const after = utxosAfter(built.inputs, built);
    expect(after.map(ref)).toEqual(built.change.map(ref));
    for (const given of [built, [built]]) {
      const next = await b.build(
        [output({ address: recipient, value: { lovelace: ada(2) } })],
        { payer: { changeAddress: payer.address, utxos: [] }, after: given },
      );
      expect(next).toBeInstanceOf(StandaloneTx);
      expect(next.inputs.map(ref)).toEqual(built.change.map(ref));
    }
  });

  it("is what finalize returns too, and signs there", async () => {
    const { built, payer, guardKey, builder: b } = await fixture();
    const final = await b.finalize(structuredClone(built.prototype), {
      inputs: built.inputs,
      changeAddress: payer.address,
    });
    expect(final).toBeInstanceOf(StandaloneTx);
    expect(Object.isFrozen(final)).toBe(true);
    // The keys of the body, in the body's order
    expect(
      [...final.missing].sort((a, b) => a.keyHash.localeCompare(b.keyHash)),
    ).toEqual(
      [...built.missing].sort((a, b) => a.keyHash.localeCompare(b.keyHash)),
    );
    await final.sign({
      signers: keysSigner("callback", payer, guardKey).signer,
    });
    expect(final.missing).toEqual([]);
    expect((await signedKeyHashes(final.signedTx!)).sort()).toEqual(
      [payer.keyHash, guardKey.keyHash].sort(),
    );
  });

  it("types: build and finalize give the class, a plan's build the data alone", async () => {
    const { built } = await fixture();
    const data: BuiltTx = built;
    expect(data).toBe(built);
    const { builder: planBuilder, address } = await setup();
    const attempt = await planBuilder.plan(pay(), { payer: address }).build();
    // @ts-expect-error: a plan's attempt is data and has no sign
    expect(attempt.sign).toBeUndefined();
    // @ts-expect-error: signers are required
    await expect(built.sign({})).rejects.toThrow(TxPlanError);
    // @ts-expect-error: partial is a boolean
    await expect(built.sign({ signers: [], partial: "no" })).rejects.toThrow(
      TxBuildError,
    );
    // @ts-expect-error: the data members are read-only
    expect(() => (built.txHash = "")).toThrow(TypeError);
  });
});

describe("StandaloneTx.sign", () => {
  describe("its options", () => {
    const secret =
      "ed25519_sk1n8u6zhjphv3hf7mkt3h03y4lqhkr0lrzk4m3k35ydxdeffegeldsauu57r";

    it.each<[string, () => unknown, string, string]>([
      ["options that are null", () => null, "options", "null"],
      ["options that are a string", () => secret, "options", "string"],
      ["options that are a number", () => 7, "options", "number"],
      [
        "options that are a signer object",
        () => ({ signTxHash: async () => [] }),
        "options",
        "object",
      ],
      [
        "options that are a function",
        () => async () => [],
        "options",
        "function",
      ],
      [
        "options that are a list of signers",
        () => [{ signTxHash: async () => [] }],
        "options",
        "object",
      ],
      ["a key as signers", () => ({ signers: secret }), "signers", "string"],
      [
        "a key among signers",
        () => ({ signers: [{ signTxHash: async () => [] }, secret] }),
        "signers",
        "object",
      ],
      [
        "a private key object as signers",
        () => ({ signers: { privateKey: secret } }),
        "signers",
        "object",
      ],
      [
        "a partial that is not a boolean",
        () => ({ signers: [], partial: "false" }),
        "partial",
        "string",
      ],
      [
        "a partial that is a key",
        () => ({ signers: [], partial: secret }),
        "partial",
        "string",
      ],
      [
        "a signal that is not an AbortSignal",
        () => ({ signers: [], signal: { aborted: false } }),
        "signal",
        "object",
      ],
    ])(
      "refuses %s with INVALID_OPTION naming only its type, and asks nobody",
      async (_, options, option, type) => {
        const { built, payer } = await fixture();
        const { signer, requests } = keysSigner("object", payer);
        const given = options();
        // A signer to ask, wherever the options leave room for one
        if (
          typeof given === "object" &&
          given !== null &&
          !Array.isArray(given) &&
          "signers" in given &&
          Array.isArray((given as { signers: unknown }).signers)
        )
          ((given as { signers: unknown[] }).signers as unknown[]).unshift(
            signer,
          );
        const error = await caught(() => built.sign(given as never));
        expect(error).toBeInstanceOf(TxBuildError);
        const { code, details, message, stack } =
          error as TxBuildError<"INVALID_OPTION">;
        expect(code).toBe("INVALID_OPTION");
        // Searched first, and then compared as booleans: a failure prints no key
        expect(
          [message, stack, JSON.stringify(details)].some((text) =>
            text?.includes(secret.slice(14)),
          ),
        ).toBe(false);
        expect(details.option === option).toBe(true);
        expect(details.value === type).toBe(true);
        expect(requests).toHaveLength(0);
        expect(built.partialTx).toBe(built.tx);
      },
    );

    it("tells options given as a signer to give it as { signers }", async () => {
      const { built } = await fixture();
      const error = await caught(() =>
        built.sign({ signTxHash: async () => [] } as never),
      );
      expect((error as Error).message).toContain("{ signers }");
    });
  });

  it.each([
    ["no options", undefined],
    ["no signers", {}],
    ["an empty list", { signers: [] }],
    ["an empty list, partial: false", { signers: [], partial: false }],
    ["an empty list, partial: true", { signers: [], partial: true }],
  ])(
    "is MISSING_SIGNATURES with the missing keys for %s",
    async (_, options) => {
      const { built, payer, guardKey } = await fixture();
      const error = await caught(() => built.sign(options as never));
      expect(error).toBeInstanceOf(TxPlanError);
      const { code, details, retryable } =
        error as TxPlanError<"MISSING_SIGNATURES">;
      expect(code).toBe("MISSING_SIGNATURES");
      expect(retryable).toBe(false);
      expect(details.missing).toEqual([
        keyOf(guardKey.keyHash, "guard"),
        keyOf(payer.keyHash, "input"),
      ]);
    },
  );

  it("adds what its signers give and returns the same object; tx never changes", async () => {
    const { built, payer, guardKey } = await fixture();
    const tx = built.tx;
    expect(built.signedTx).toBeUndefined();
    expect(built.partialTx).toBe(tx);

    const first = await built.sign({
      signers: keysSigner("object", payer).signer,
    });
    expect(first).toBe(built);
    expect(built.tx).toBe(tx);
    expect(built.signedTx).toBeUndefined();
    expect(built.missing).toEqual([keyOf(guardKey.keyHash, "guard")]);
    expect(built.partialTx).toBe(
      await addWitnesses(tx, witnessSet(built.txHash, payer)),
    );
    expect(await signedKeyHashes(built.partialTx)).toEqual([payer.keyHash]);

    expect(
      await built.sign({ signers: keysSigner("callback", guardKey).signer }),
    ).toBe(built);
    expect(built.tx).toBe(tx);
    expect(built.missing).toEqual([]);
    const expected = await addWitnesses(
      tx,
      witnessSet(built.txHash, payer),
      witnessSet(built.txHash, guardKey),
    );
    expect(built.signedTx).toBe(expected);
    expect(built.partialTx).toBe(built.signedTx);
    // The body is the one built
    expect(Transaction.fromCbor(TxCBOR(built.signedTx!)).getId()).toBe(
      built.txHash,
    );
  });

  describe("the forms of a signer", () => {
    it("hands each form what it takes, with the keys that have not signed yet", async () => {
      const { built, payer, guardKey, scriptKey } = await fixture({
        native: true,
      });
      const calls: unknown[][] = [];
      const answering = (...keys: TestKey[]) =>
        Promise.resolve(witnessSet(built.txHash, ...keys));
      const withWitnesses: Signer = {
        signTxWitnesses: (tx: string, keyHashes?: string[]) => {
          calls.push(["signTxWitnesses", tx, keyHashes]);
          return answering(payer);
        },
      };
      const meshWallet = {
        getUtxosHex: async () => [],
        signTx: (...args: unknown[]) => {
          calls.push(["mesh", ...args]);
          return answering();
        },
      } as unknown as Signer;
      const cip30: Signer = {
        signTx: (...args: unknown[]) => {
          calls.push(["cip30", ...args]);
          return answering();
        },
      } as unknown as Signer;
      const object = keysSigner("object", guardKey);
      const callback = keysSigner("callback", scriptKey);
      await built.sign({
        signers: [
          withWitnesses,
          meshWallet,
          cip30,
          object.signer,
          callback.signer,
        ],
      });
      expect(calls).toEqual([
        [
          "signTxWitnesses",
          built.tx,
          [guardKey.keyHash, payer.keyHash, scriptKey.keyHash],
        ],
        ["mesh", built.tx, true, false],
        ["cip30", built.tx, true],
      ]);
      expect(object.requests).toHaveLength(1);
      expect(object.requests[0]).toEqual({
        txHash: built.txHash,
        keys: [
          keyOf(guardKey.keyHash, "guard"),
          keyOf(scriptKey.keyHash, "nativeScript"),
        ],
        tx: built.tx,
      });
      expect(Object.isFrozen(object.requests[0]!.keys)).toBe(true);
      expect(callback.requests[0]!.keys).toEqual([
        keyOf(scriptKey.keyHash, "nativeScript"),
      ]);
      expect(callback.self).toEqual([undefined]);
      expect(built.missing).toEqual([]);
      expect((await signedKeyHashes(built.signedTx!)).sort()).toEqual(
        [payer.keyHash, guardKey.keyHash, scriptKey.keyHash].sort(),
      );
    });

    it("asks no signer of hashes when nothing is left, and a wallet with an empty list", async () => {
      const { built, payer, guardKey } = await fixture();
      await built.addWitnesses(witnessSet(built.txHash, payer, guardKey));
      const object = keysSigner("object", payer);
      const callback = keysSigner("callback", payer);
      const lists: unknown[] = [];
      const wallet: Signer = {
        signTxWitnesses: async (_tx: string, keyHashes?: string[]) => {
          lists.push(keyHashes);
          return "a0";
        },
      };
      await built.sign({ signers: [object.signer, wallet, callback.signer] });
      expect(object.requests).toHaveLength(0);
      expect(callback.requests).toHaveLength(0);
      expect(lists).toEqual([[]]);
    });

    it("hands the call's signal to a signer of hashes", async () => {
      const { built, payer } = await fixture();
      const controller = new AbortController();
      const { signer, requests } = keysSigner("object", payer);
      await built.sign({ signers: signer, signal: controller.signal });
      expect(requests[0]!.signal).toBe(controller.signal);
    });
  });

  describe("partial: false", () => {
    it("is MISSING_SIGNATURES with the roles of the keys still missing, and keeps what was given", async () => {
      const { built, payer, guardKey } = await fixture();
      const error = await caught(() =>
        built.sign({
          signers: keysSigner("object", payer).signer,
          partial: false,
        }),
      );
      expect(error).toBeInstanceOf(TxPlanError);
      const { code, details, message } =
        error as TxPlanError<"MISSING_SIGNATURES">;
      expect(code).toBe("MISSING_SIGNATURES");
      expect(details.missing).toEqual([keyOf(guardKey.keyHash, "guard")]);
      expect(message).toContain(guardKey.keyHash);
      expect(built.missing).toEqual([keyOf(guardKey.keyHash, "guard")]);
      expect(await signedKeyHashes(built.partialTx)).toEqual([payer.keyHash]);
    });

    it("returns the object once nothing is missing", async () => {
      const { built, payer, guardKey } = await fixture();
      await expect(
        built.sign({
          signers: keysSigner("object", payer, guardKey).signer,
          partial: false,
        }),
      ).resolves.toBe(built);
      expect(built.signedTx).toBeDefined();
    });
  });

  describe("a failing signer", () => {
    it.each<[string, () => Promise<never>, "SIGN_DECLINED" | "SIGNER_FAILED"]>([
      [
        "declines",
        () => Promise.reject(new TxPlanError("SIGN_DECLINED", "no")),
        "SIGN_DECLINED",
      ],
      [
        "declines as CIP-30",
        () => Promise.reject({ code: 2 }),
        "SIGN_DECLINED",
      ],
      ["fails", () => Promise.reject(new Error("down")), "SIGNER_FAILED"],
    ])(
      "keeps the witnesses of the signer before one that %s",
      async (_, fail, code) => {
        const { built, payer, guardKey } = await fixture();
        const error = await caught(() =>
          built.sign({
            signers: [
              keysSigner("object", payer).signer,
              hashSigner("callback", fail).signer,
            ],
          }),
        );
        expect(error).toBeInstanceOf(TxPlanError);
        expect((error as TxPlanError).code).toBe(code);
        expect(built.missing).toEqual([keyOf(guardKey.keyHash, "guard")]);
        expect(await signedKeyHashes(built.partialTx)).toEqual([payer.keyHash]);
      },
    );

    it("is SIGNER_FAILED for an answer with a witness of another body, and keeps none of it", async () => {
      const { built, payer, guardKey } = await fixture();
      const other = (await fixture()).built;
      const error = await caught(() =>
        built.sign({
          signers: {
            signTxWitnesses: async () =>
              witnessSet(other.txHash, payer, guardKey),
          },
        }),
      );
      expect(error).toBeInstanceOf(TxPlanError);
      const { code, cause } = error as TxPlanError<"SIGNER_FAILED">;
      expect(code).toBe("SIGNER_FAILED");
      expect(TxPlanError.is(cause, "INVALID_WITNESS")).toBe(true);
      expect(built.partialTx).toBe(built.tx);
    });
  });

  describe("what is kept", () => {
    it("drops a key nobody asked for, and keeps a key a native script names", async () => {
      const { built, payer, guardKey, scriptKey } = await fixture({
        native: true,
      });
      const stranger = testKey();
      await built.sign({
        signers: [
          hashSigner("object", ({ txHash }) => [
            payer.answer(txHash),
            stranger.answer(txHash),
            scriptKey.answer(txHash),
          ]).signer,
        ],
      });
      await built.addWitnesses(witnessSet(built.txHash, stranger, guardKey));
      expect(vkeysOf(built.signedTx!).vkeys).toEqual([
        payer.vkey,
        scriptKey.vkey,
        guardKey.vkey,
      ]);
    });

    it("never lists a key only a native script names, and does not wait for it", async () => {
      const { built, payer, guardKey, scriptKey } = await fixture({
        native: true,
      });
      expect(built.missing).toEqual([
        keyOf(guardKey.keyHash, "guard"),
        keyOf(payer.keyHash, "input"),
      ]);
      await built.sign({
        signers: keysSigner("object", payer, guardKey).signer,
      });
      expect(built.missing).toEqual([]);
      expect(built.signedTx).toBeDefined();
      const signed = await signedKeyHashes(built.signedTx!);
      expect(signed.sort()).toEqual([payer.keyHash, guardKey.keyHash].sort());
      expect(signed.includes(scriptKey.keyHash)).toBe(false);
    });

    it("keeps as many witnesses of other keys as the build's extraKeyWitnesses", async () => {
      await Crypto.ready();
      const payer = testKey();
      const coSigner = testKey();
      const another = testKey();
      const b = builder();
      const options = {
        payer: { changeAddress: payer.address, utxos: [utxoAt(payer.address)] },
      };
      const parts = output({ address: recipient, value: { lovelace: ada(5) } });
      const built = await b.build(parts, { ...options, extraKeyWitnesses: 1 });
      // The fee counts one witness more than the build without the option
      expect(built.fee).toBeGreaterThan((await b.build(parts, options)).fee);
      await built.sign({
        signers: hashSigner("object", ({ txHash }) => [
          payer.answer(txHash),
          coSigner.answer(txHash),
        ]).signer,
      });
      await built.addWitnesses(witnessSet(built.txHash, another));
      expect(vkeysOf(built.signedTx!).vkeys).toEqual([
        payer.vkey,
        coSigner.vkey,
      ]);
      // Without the option no witness of another key is kept
      const plain = await b.build(parts, options);
      await plain.addWitnesses(witnessSet(plain.txHash, coSigner, payer));
      expect(vkeysOf(plain.signedTx!).vkeys).toEqual([payer.vkey]);
    });

    it("keeps one witness per key, the first given", async () => {
      const { built, payer, guardKey } = await fixture();
      await built.addWitnesses(witnessSet(built.txHash, payer));
      const before = built.partialTx;
      await built.sign({
        signers: [keysSigner("object", payer, guardKey).signer],
      });
      await built.addWitnesses(before, witnessSet(built.txHash, payer));
      expect(vkeysOf(built.signedTx!).vkeys).toEqual([
        payer.vkey,
        guardKey.vkey,
      ]);
    });

    it("keeps bootstrap witnesses up to the Byron addresses spent from", async () => {
      await Crypto.ready();
      const byron =
        "Ae2tdPwUPEZ4YjgvykNpoFeYUxoyhNj2kg8KfKWN2FizsSpLUPv68MpTVDo";
      const payer = testKey();
      const shelley = serializeAddressObj(pubKeyAddress(payer.keyHash), 1);
      const built = await builder("mainnet").build(
        [
          spend.pubKey({ utxo: utxoAt(byron, ada(5)) }),
          output({ address: shelley, value: { lovelace: ada(10) } }),
        ],
        { payer: { changeAddress: shelley, utxos: [utxoAt(shelley)] } },
      );
      expect(built.signers.byronAddresses).toEqual([byron]);
      const [first, second] = [testKey(), testKey()];
      await built.addWitnesses(
        bootstrapSet(built.txHash, first!),
        bootstrapSet(built.txHash, second!),
      );
      await built.sign({
        signers: {
          signTxWitnesses: async () => bootstrapSet(built.txHash, second!),
        },
      });
      expect(vkeysOf(built.partialTx).bootstraps).toEqual([first!.vkey]);
      // Bootstrap witnesses are not waited for
      await built.addWitnesses(witnessSet(built.txHash, payer));
      expect(built.signedTx).toBe(built.partialTx);
    });
  });

  describe("abort and calls at once", () => {
    it("asks nobody when the signal is aborted already", async () => {
      const { built, payer } = await fixture();
      const { signer, requests } = keysSigner("object", payer);
      const error = await caught(() =>
        built.sign({ signers: signer, signal: AbortSignal.abort() }),
      );
      expect((error as TxBuildError).code).toBe("ABORTED");
      expect(requests).toHaveLength(0);
    });

    it("stops waiting for a signer on abort, keeping what an earlier signer gave", async () => {
      const { built, payer, guardKey } = await fixture();
      const controller = new AbortController();
      const waiting = hashSigner("callback", () => new Promise(() => {}));
      const later = keysSigner("object", guardKey);
      const call = built.sign({
        signers: [
          keysSigner("object", payer).signer,
          waiting.signer,
          later.signer,
        ],
        signal: controller.signal,
      });
      while (waiting.requests.length === 0)
        await new Promise((resolve) => setTimeout(resolve, 1));
      controller.abort(new Error("enough"));
      const error = await caught(() => call);
      expect(error).toBeInstanceOf(TxBuildError);
      expect((error as TxBuildError).code).toBe("ABORTED");
      expect(later.requests).toHaveLength(0);
      expect(await signedKeyHashes(built.partialTx)).toEqual([payer.keyHash]);
    });

    it("keeps one witness per key when three calls sign at once", async () => {
      const { built, payer, guardKey } = await fixture();
      const signers = () => [
        keysSigner("object", payer).signer,
        keysSigner("callback", guardKey, payer).signer,
      ];
      const results = await Promise.all([
        built.sign({ signers: signers() }),
        built.sign({ signers: signers() }),
        built.addWitnesses(witnessSet(built.txHash, guardKey, payer)),
        built.sign({ signers: signers() }),
      ]);
      for (const result of results) expect(result).toBe(built);
      const { vkeys } = vkeysOf(built.signedTx!);
      expect([...vkeys].sort()).toEqual([payer.vkey, guardKey.vkey].sort());
    });
  });
});

describe("StandaloneTx.addWitnesses", () => {
  it("takes witness sets and full transactions, several in a call", async () => {
    const { built, payer, guardKey } = await fixture();
    const other = (await fixture()).built;
    // A full transaction of this body, signed elsewhere by the payer
    const signedElsewhere = await addWitnesses(
      built.tx,
      witnessSet(built.txHash, payer),
    );
    expect(await built.addWitnesses(signedElsewhere)).toBe(built);
    expect(built.missing).toEqual([keyOf(guardKey.keyHash, "guard")]);
    await built.addWitnesses(
      witnessSet(built.txHash, payer),
      witnessSet(built.txHash, guardKey),
    );
    expect(built.signedTx).toBe(
      await addWitnesses(
        built.tx,
        witnessSet(built.txHash, payer),
        witnessSet(built.txHash, guardKey),
      ),
    );
    expect(other.partialTx).toBe(other.tx);
  });

  it.each<[string, (txHash: string, other: string) => string, string]>([
    ["text that is not CBOR", () => "zz", "undecodable"],
    ["the empty string", () => "", "undecodable"],
    ["a CBOR number", () => "07", "undecodable"],
    [
      "a witness of another body",
      (_, other) => witnessSet(other, testKey()),
      "wrongBody",
    ],
  ])(
    "refuses %s as INVALID_WITNESS with its argument, keeping nothing of the call",
    async (_, bad, reason) => {
      const { built, payer } = await fixture();
      const other = (await fixture()).built;
      const error = await caught(() =>
        built.addWitnesses(
          witnessSet(built.txHash, payer),
          bad(built.txHash, other.txHash),
        ),
      );
      expect(error).toBeInstanceOf(TxPlanError);
      const { code, details } = error as TxPlanError<"INVALID_WITNESS">;
      expect(code).toBe("INVALID_WITNESS");
      expect(details.reason).toBe(reason);
      expect(details.argument).toBe(1);
      expect(built.partialTx).toBe(built.tx);
      expect(built.missing).toHaveLength(2);
    },
  );

  it("names the key of a witness of another body", async () => {
    const { built } = await fixture();
    const other = (await fixture()).built;
    const key = testKey();
    const error = await caught(() =>
      built.addWitnesses(witnessSet(other.txHash, key)),
    );
    expect((error as TxPlanError<"INVALID_WITNESS">).details).toEqual({
      reason: "wrongBody",
      argument: 0,
      keyHash: key.keyHash,
    });
  });
});

describe("StandaloneTx.partialTx", () => {
  it("is tx while nothing is held, holds what is held, and is signedTx once complete", async () => {
    const { built, payer, guardKey } = await fixture();
    expect(built.partialTx).toBe(built.tx);
    await built.sign({ signers: keysSigner("object", guardKey).signer });
    expect(built.signedTx).toBeUndefined();
    expect(vkeysOf(built.partialTx).vkeys).toEqual([guardKey.vkey]);
    expect(await signedKeyHashes(built.partialTx)).toEqual([guardKey.keyHash]);
    // A party given partialTx answers with a full transaction, which addWitnesses takes
    const theirs = await addWitnesses(
      built.partialTx,
      witnessSet(built.txHash, payer),
    );
    await built.addWitnesses(theirs);
    expect(built.missing).toEqual([]);
    expect(built.partialTx).toBe(built.signedTx);
    expect(built.signedTx).toBe(theirs);
  });

  it("does not change when a witness held is given again", async () => {
    const { built, payer } = await fixture();
    await built.addWitnesses(witnessSet(built.txHash, payer));
    const first = built.partialTx;
    await built.addWitnesses(witnessSet(built.txHash, payer));
    expect(built.partialTx).toBe(first);
  });
});

describe("StandaloneTx: what a request is", () => {
  it("is frozen at every level, and changing a member of it is refused", async () => {
    const { built, payer } = await fixture();
    let request: TxHashRequest | undefined;
    await built.sign({
      signers: (r: TxHashRequest) => {
        request = r;
        return Promise.resolve([payer.answer(r.txHash)]);
      },
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request!.keys)).toBe(true);
    expect(Object.isFrozen(request!.keys![0])).toBe(true);
    expect(Object.isFrozen(request!.keys![0]!.roles)).toBe(true);
    expect(Object.isFrozen(built.missing)).toBe(true);
  });
});

/**
 * A provider that answers only what a test gives it: a search for transactions and a submitter,
 * each call recorded. The build reads nothing from it: the payer is a snapshot and the builder
 * has `params` and `costModels`
 */
const fakeProvider = (
  answers: {
    fetchTxInfo?: ((hash: string) => unknown) | null;
    submitTx?: ((tx: string) => unknown) | null;
  } = {},
) => {
  const searches: string[] = [];
  const sent: string[] = [];
  const provider: Record<string, unknown> = {};
  if (answers.fetchTxInfo !== null)
    provider.fetchTxInfo = async (hash: string) => {
      searches.push(hash);
      if (answers.fetchTxInfo) return answers.fetchTxInfo(hash);
      throw { kind: "notFound", status: 404 };
    };
  if (answers.submitTx !== null)
    provider.submitTx = async (tx: string) => {
      sent.push(tx);
      if (answers.submitTx) return answers.submitTx(tx);
      return "";
    };
  return {
    provider: provider as unknown as TxBuilderOptions["provider"],
    searches,
    sent,
  };
};

/** A submitter that records what it is handed and answers as told: by default it takes it */
const recorder = (answer: (tx: string) => unknown = () => "") => {
  const sent: string[] = [];
  return {
    sent,
    submitter: {
      submitTx: async (tx: string) => {
        sent.push(tx);
        return answer(tx) as string;
      },
    },
  };
};

/** The fixture's transaction, signed by both keys it needs, built by a builder with these options */
const signedFixture = async (options: Partial<TxBuilderOptions> = {}) => {
  const fixed = await fixture({ builder: options });
  await fixed.built.sign({
    signers: keysSigner("object", fixed.payer, fixed.guardKey).signer,
  });
  expect(fixed.built.signedTx).toBeDefined();
  return fixed;
};

/** What a provider answers for a transaction found in a block */
const foundInfo = (hash: string, extra: Record<string, unknown> = {}) => ({
  hash,
  slot: "1200",
  block: "b".repeat(64),
  blockHeight: 1200,
  ...extra,
});

/** Thrown as the ledger's refusal is thrown */
const refusal = () => ({ kind: "rejected", status: 400 });

/** Thrown as a provider says that it does not find a transaction */
const notFound = () => ({ kind: "notFound", status: 404 });

/** A promise the test settles when it chooses */
const gate = <T = unknown>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onValue, onError) => {
    resolve = onValue;
    reject = onError;
  });
  return { promise, resolve, reject };
};

/** Lets every pending callback run: turns of the event loop, not a span of time */
const settle = async () => {
  for (let i = 0; i < 10; i++)
    await new Promise((resolve) => setImmediate(resolve));
};

/** What a call ended with, read without waiting for it: nothing while it runs */
const track = <T>(promise: Promise<T>) => {
  const ended: { returned?: T; thrown?: unknown; done: boolean } = {
    done: false,
  };
  promise.then(
    (value) => {
      ended.returned = value;
      ended.done = true;
    },
    (error) => {
      ended.thrown = error;
      ended.done = true;
    },
  );
  return ended;
};

/** The code of what a call threw */
const codeOf = (error: unknown) => (error as TxPlanError).code;

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

describe("StandaloneTx.submit", () => {
  it("sends through the call's submitter, else the builder's, else the provider", async () => {
    const call = recorder();
    const own = recorder();
    const viaProvider = fakeProvider();
    const { built } = await signedFixture({
      provider: viaProvider.provider,
      submitter: own.submitter,
    });
    expect(await built.submit({ submitter: call.submitter })).toBe(built);
    expect(call.sent).toEqual([built.signedTx]);
    await built.submit();
    expect(own.sent).toEqual([built.signedTx]);
    expect(viaProvider.sent).toEqual([]);

    const onlyProvider = fakeProvider();
    const second = await signedFixture({ provider: onlyProvider.provider });
    await second.built.submit();
    expect(onlyProvider.sent).toEqual([second.built.signedTx]);
    // Sending reads nothing
    expect(onlyProvider.searches).toEqual([]);
  });

  it("works with the call's submitter on a builder without a provider", async () => {
    const { built } = await signedFixture();
    const call = recorder();
    await built.submit({ submitter: call.submitter });
    expect(call.sent).toEqual([built.signedTx]);
  });

  it("is MISSING_SUBMITTER, and sends nothing, with nothing to submit through", async () => {
    const searchOnly = fakeProvider({ submitTx: null });
    for (const options of [{}, { provider: searchOnly.provider }]) {
      const { built } = await signedFixture(options);
      const error = await caught(() => built.submit());
      expect(error).toBeInstanceOf(TxPlanError);
      expect((error as TxPlanError).code).toBe("MISSING_SUBMITTER");
      expect((error as TxPlanError).retryable).toBe(false);
      expect((error as Error).message).toContain("nothing was sent");
    }
    expect(searchOnly.searches).toEqual([]);
  });

  it("is MISSING_SIGNATURES with the missing keys, and sends nothing, while a key has not signed", async () => {
    const call = recorder();
    const viaProvider = fakeProvider();
    const { built, payer, guardKey } = await fixture({
      builder: { provider: viaProvider.provider },
    });
    const missing = async () => {
      const error = await caught(() =>
        built.submit({ submitter: call.submitter }),
      );
      expect(error).toBeInstanceOf(TxPlanError);
      const { code, details, retryable, message } =
        error as TxPlanError<"MISSING_SIGNATURES">;
      expect([code, retryable]).toEqual(["MISSING_SIGNATURES", false]);
      expect(message).toContain("nothing was sent");
      return details.missing;
    };
    expect(await missing()).toEqual([
      keyOf(guardKey.keyHash, "guard"),
      keyOf(payer.keyHash, "input"),
    ]);
    await built.sign({ signers: keysSigner("object", payer).signer });
    expect(await missing()).toEqual([keyOf(guardKey.keyHash, "guard")]);
    // Without a submitter too, the missing key comes first
    const bare = await fixture();
    expect(
      ((await caught(() => bare.built.submit())) as TxPlanError).code,
    ).toBe("MISSING_SIGNATURES");
    expect(call.sent).toEqual([]);
    expect(viaProvider.sent).toEqual([]);
    expect(viaProvider.searches).toEqual([]);
  });

  it("sends signedTx, the same bytes on every call, and clears the builder's cache after each hand-off", async () => {
    const viaProvider = fakeProvider();
    const { built, builder: b } = await signedFixture({
      provider: viaProvider.provider,
    });
    const cache = (b as unknown as { cache: { clearVolatile(): void } }).cache;
    const clear = jest.spyOn(cache, "clearVolatile");
    const lossy = recorder(() => {
      throw new Error("socket hang up");
    });
    await built.submit();
    expect(clear).toHaveBeenCalledTimes(1);
    await caught(() => built.submit({ submitter: lossy.submitter }));
    expect(clear).toHaveBeenCalledTimes(2);
    await built.submit();
    expect(clear).toHaveBeenCalledTimes(3);
    expect([...viaProvider.sent, ...lossy.sent]).toEqual([
      built.signedTx,
      built.signedTx,
      built.signedTx,
    ]);
    // Nothing is cleared when nothing was handed off
    const unsigned = await fixture({
      builder: { provider: viaProvider.provider },
    });
    const otherCache = (
      unsigned.builder as unknown as { cache: { clearVolatile(): void } }
    ).cache;
    const otherClear = jest.spyOn(otherCache, "clearVolatile");
    otherClear.mockClear();
    await caught(() => unsigned.built.submit());
    expect(otherClear).not.toHaveBeenCalled();
  });

  it("returns when the submitter takes the bytes, without reading the provider", async () => {
    const viaProvider = fakeProvider({ submitTx: () => "f".repeat(64) });
    const { built } = await signedFixture({ provider: viaProvider.provider });
    // Another hash in the answer is not read: the hash is txHash
    expect(await built.submit()).toBe(built);
    expect(viaProvider.searches).toEqual([]);
  });

  it("is REJECTED when the first delivery is refused and one look does not find it", async () => {
    const thrown = refusal();
    const viaProvider = fakeProvider({
      submitTx: () => {
        throw thrown;
      },
    });
    const { built } = await signedFixture({ provider: viaProvider.provider });
    const error = await caught(() => built.submit());
    expect(error).toBeInstanceOf(TxPlanError);
    const { code, details, retryable, cause, message } =
      error as TxPlanError<"REJECTED">;
    expect([code, retryable]).toEqual(["REJECTED", false]);
    expect(details).toEqual({ otherLive: [] });
    expect(cause).toBe(thrown);
    expect(message).toContain("the provider does not find the transaction");
    expect(message).not.toContain("could not be asked");
    expect(message.endsWith(NO_REBUILD)).toBe(true);
    expect(viaProvider.searches).toEqual([built.txHash]);
    // Refused again, and still not found: still REJECTED
    expect(((await caught(() => built.submit())) as TxPlanError).code).toBe(
      "REJECTED",
    );
  });

  it("ends the sentence it tells with not to build another transaction to retry", () => {
    expect(NO_REBUILD).toBe(
      "Do not build another transaction to retry it: a new build may select other inputs, and both may land.",
    );
  });

  it.each<
    [
      string,
      { provider?: true; fetchTxInfo?: ((hash: string) => unknown) | null },
      number,
    ]
  >([
    ["a builder without a provider", {}, 0],
    [
      "a provider without fetchTxInfo",
      { provider: true, fetchTxInfo: null },
      0,
    ],
    [
      "a search that throws",
      {
        provider: true,
        fetchTxInfo: () => {
          throw new Error("timeout");
        },
      },
      1,
    ],
    [
      "a search that says that it cannot search",
      {
        provider: true,
        fetchTxInfo: () => {
          throw { kind: "unsupported" };
        },
      },
      1,
    ],
    [
      "an answer about another transaction",
      { provider: true, fetchTxInfo: () => foundInfo("c".repeat(64)) },
      1,
    ],
  ])(
    "is REJECTED after a refusal when no look can tell: %s",
    async (_, given, searches) => {
      const thrown = refusal();
      const refusing = recorder(() => {
        throw thrown;
      });
      const viaProvider = fakeProvider({ fetchTxInfo: given.fetchTxInfo });
      const { built } = await signedFixture(
        given.provider ? { provider: viaProvider.provider } : {},
      );
      const error = await caught(() =>
        built.submit({ submitter: refusing.submitter }),
      );
      expect(error).toBeInstanceOf(TxPlanError);
      const { code, details, cause, message } =
        error as TxPlanError<"REJECTED">;
      expect(code).toBe("REJECTED");
      expect(details).toEqual({ otherLive: [] });
      expect(cause).toBe(thrown);
      expect(message).toContain(
        "the provider could not be asked whether it holds the transaction",
      );
      expect(message).not.toContain("does not find");
      expect(message.endsWith(NO_REBUILD)).toBe(true);
      expect(viaProvider.searches).toHaveLength(searches);
      expect(refusing.sent).toEqual([built.signedTx]);
    },
  );

  it("looks past the cache the builder shares after a refusal", async () => {
    // The first answer is about another transaction: a cache would give it back again
    let reads = 0;
    const inner = fakeProvider({
      fetchTxInfo: (hash) =>
        ++reads === 1 ? foundInfo("c".repeat(64)) : foundInfo(hash),
      submitTx: () => {
        throw refusal();
      },
    });
    const cached = CachedFetcher.wrap(
      inner.provider as unknown as Parameters<typeof CachedFetcher.wrap>[0],
    );
    const { built, builder: b } = await signedFixture({
      provider: cached as unknown as TxBuilderOptions["provider"],
      submitter: inner.provider as unknown as TxBuilderOptions["submitter"],
    });
    // The builder's own cache holds that first answer
    await (b as unknown as { cache: CachedFetcher }).cache.fetchTxInfo(
      built.txHash,
    );
    expect(reads).toBe(1);
    expect(await built.submit()).toBe(built);
    expect(inner.sent).toEqual([built.signedTx]);
    expect(reads).toBe(2);
  });

  it("returns after a refusal when the provider already finds the transaction", async () => {
    const viaProvider = fakeProvider({
      fetchTxInfo: (hash) => foundInfo(hash),
      submitTx: () => {
        throw refusal();
      },
    });
    const { built } = await signedFixture({ provider: viaProvider.provider });
    expect(await built.submit()).toBe(built);
    expect(viaProvider.searches).toEqual([built.txHash]);
  });

  it("is SUBMIT_FAILED (retryable) when the outcome is unknown, and a refusal of the repeat proves nothing", async () => {
    const thrown = new Error("socket hang up");
    const viaProvider = fakeProvider({
      submitTx: () => {
        throw refusal();
      },
    });
    const { built } = await signedFixture({ provider: viaProvider.provider });
    const lossy = recorder(() => {
      throw thrown;
    });
    const error = await caught(() =>
      built.submit({ submitter: lossy.submitter }),
    );
    expect(error).toBeInstanceOf(TxPlanError);
    const { code, details, retryable, cause, message } =
      error as TxPlanError<"SUBMIT_FAILED">;
    expect([code, retryable]).toEqual(["SUBMIT_FAILED", true]);
    expect(details).toEqual({});
    expect(cause).toBe(thrown);
    expect(message.endsWith(NO_REBUILD)).toBe(true);
    // The same call through the provider: refused, which proves nothing now, and nothing is read
    expect(await built.submit()).toBe(built);
    expect(viaProvider.sent).toEqual([built.signedTx]);
    expect(viaProvider.searches).toEqual([]);
  });

  it("returns when a delivery taken earlier is refused later", async () => {
    let refuse = false;
    const viaProvider = fakeProvider({
      submitTx: () => {
        if (refuse) throw refusal();
        return "";
      },
    });
    const { built } = await signedFixture({ provider: viaProvider.provider });
    await built.submit();
    refuse = true;
    expect(await built.submit()).toBe(built);
    expect(viaProvider.sent).toEqual([built.signedTx, built.signedTx]);
    expect(viaProvider.searches).toEqual([]);
  });

  describe("deliveries at once", () => {
    /** A signed transaction whose provider answers searches as told; the calls bring submitters */
    const atOnce = async (fetchTxInfo?: (hash: string) => unknown) => {
      const viaProvider = fakeProvider({ fetchTxInfo, submitTx: null });
      const { built } = await signedFixture({ provider: viaProvider.provider });
      return { built, searches: viaProvider.searches };
    };
    const refusing = () =>
      recorder(() => {
        throw refusal();
      });
    /** A submitter whose answer the test holds */
    const holding = () => {
      const answer = gate<string>();
      return { answer, ...recorder(() => answer.promise) };
    };

    it("returns when another call is taken while its look is held", async () => {
      const look = gate();
      const { built, searches } = await atOnce(() => look.promise);
      const first = track(built.submit({ submitter: refusing().submitter }));
      await settle();
      expect(searches).toHaveLength(1);
      expect(await built.submit({ submitter: recorder().submitter })).toBe(
        built,
      );
      look.reject(notFound());
      await settle();
      expect(first).toEqual({ returned: built, done: true });
      expect(searches).toHaveLength(1);
    });

    it("waits for a call handed off while its look is held, and returns when that is taken", async () => {
      const look = gate();
      const { built, searches } = await atOnce(() => look.promise);
      const first = track(built.submit({ submitter: refusing().submitter }));
      await settle();
      const slow = holding();
      const second = track(built.submit({ submitter: slow.submitter }));
      await settle();
      expect(slow.sent).toEqual([built.signedTx]);
      look.reject(notFound());
      await settle();
      // Not found, and a delivery is on its way: neither REJECTED nor returned yet
      expect(first.done).toBe(false);
      slow.answer.resolve("");
      await settle();
      expect(first).toEqual({ returned: built, done: true });
      expect(second).toEqual({ returned: built, done: true });
      expect(searches).toHaveLength(1);
    });

    it("waits for a delivery in flight, and both are REJECTED when it is refused too", async () => {
      const { built, searches } = await atOnce();
      const slow = holding();
      const a = track(built.submit({ submitter: slow.submitter }));
      const b = track(built.submit({ submitter: refusing().submitter }));
      await settle();
      expect([a.done, b.done]).toEqual([false, false]);
      expect(searches).toHaveLength(0);
      slow.answer.reject(refusal());
      await settle();
      expect([codeOf(a.thrown), codeOf(b.thrown)]).toEqual([
        "REJECTED",
        "REJECTED",
      ]);
      expect("returned" in a || "returned" in b).toBe(false);
      // Each call looked once, after every delivery had answered
      expect(searches).toEqual([built.txHash, built.txHash]);
    });

    it("returns both when the delivery in flight is taken after the other is refused", async () => {
      const { built, searches } = await atOnce();
      const slow = holding();
      const a = track(built.submit({ submitter: slow.submitter }));
      const b = track(built.submit({ submitter: refusing().submitter }));
      await settle();
      expect(b.done).toBe(false);
      slow.answer.resolve("");
      await settle();
      expect(a).toEqual({ returned: built, done: true });
      expect(b).toEqual({ returned: built, done: true });
      expect(searches).toHaveLength(0);
    });

    it("returns the refused call when the delivery in flight fails with an unknown outcome", async () => {
      const { built, searches } = await atOnce();
      const slow = holding();
      const a = track(built.submit({ submitter: slow.submitter }));
      const b = track(built.submit({ submitter: refusing().submitter }));
      await settle();
      slow.answer.reject(new Error("socket hang up"));
      await settle();
      expect(codeOf(a.thrown)).toBe("SUBMIT_FAILED");
      expect(b).toEqual({ returned: built, done: true });
      expect(searches).toHaveLength(0);
    });

    it("is ABORTED while it waits for a delivery in flight, and sets no mark: a later refusal is REJECTED", async () => {
      const { built, searches } = await atOnce();
      const slow = holding();
      const a = track(built.submit({ submitter: slow.submitter }));
      const controller = new AbortController();
      const b = track(
        built.submit({
          submitter: refusing().submitter,
          signal: controller.signal,
        }),
      );
      await settle();
      controller.abort();
      await settle();
      expect(TxBuildError.is(b.thrown, "ABORTED")).toBe(true);
      expect(a.done).toBe(false);
      slow.answer.reject(refusal());
      await settle();
      expect(codeOf(a.thrown)).toBe("REJECTED");
      expect(searches).toEqual([built.txHash]);
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    });

    it("marks a taken delivery as sent even when what runs after it throws", async () => {
      let refuse = false;
      const viaProvider = fakeProvider({
        submitTx: () => {
          if (refuse) throw refusal();
          return "";
        },
      });
      const { built, builder: b } = await signedFixture({
        provider: viaProvider.provider,
      });
      const cache = (b as unknown as { cache: { clearVolatile(): void } })
        .cache;
      const broken = new Error("the cache broke");
      jest.spyOn(cache, "clearVolatile").mockImplementationOnce(() => {
        throw broken;
      });
      // Taken; the error comes from clearing the cache after it
      expect(await caught(() => built.submit())).toBe(broken);
      refuse = true;
      expect(await built.submit()).toBe(built);
      expect(viaProvider.sent).toEqual([built.signedTx, built.signedTx]);
      expect(viaProvider.searches).toEqual([]);
    });
  });

  it.each<[string, Record<string, unknown>, unknown, number | undefined]>([
    [
      "a CIP-30 api",
      { signTx: async () => "" },
      { code: 1, info: "refused" },
      1,
    ],
    [
      "a wallet that reads its own address",
      { getChangeAddress: async () => "" },
      { kind: "rejected", status: 400 },
      undefined,
    ],
    [
      "a signer of witnesses",
      { signTxWitnesses: async () => "" },
      { kind: "rejected", code: 2 },
      2,
    ],
  ])(
    "is SUBMIT_FAILED, never REJECTED, for %s that fails to submit",
    async (_, methods, thrown, walletCode) => {
      const viaProvider = fakeProvider();
      const { built } = await signedFixture({ provider: viaProvider.provider });
      const wallet = {
        ...methods,
        submitTx: async () => {
          throw thrown;
        },
      };
      const error = await caught(() => built.submit({ submitter: wallet }));
      const { code, details, cause } = error as TxPlanError<"SUBMIT_FAILED">;
      expect(code).toBe("SUBMIT_FAILED");
      expect(details.walletCode).toBe(walletCode);
      expect(cause).toBe(thrown);
      expect(viaProvider.searches).toEqual([]);
    },
  );

  it("is ABORTED before the hand-off, and nothing is sent", async () => {
    const call = recorder();
    const { built } = await signedFixture();
    const controller = new AbortController();
    controller.abort();
    const error = await caught(() =>
      built.submit({ submitter: call.submitter, signal: controller.signal }),
    );
    expect(TxBuildError.is(error, "ABORTED")).toBe(true);
    expect(call.sent).toEqual([]);
  });

  it("is ABORTED after the hand-off, and the bytes count as sent: a later refusal proves nothing", async () => {
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    // It answers only after the call was aborted
    const hanging = recorder(() => answered.then(() => ""));
    const viaProvider = fakeProvider({
      submitTx: () => {
        throw refusal();
      },
    });
    const { built } = await signedFixture({ provider: viaProvider.provider });
    const controller = new AbortController();
    const sending = built.submit({
      submitter: hanging.submitter,
      signal: controller.signal,
    });
    await Promise.resolve();
    expect(hanging.sent).toEqual([built.signedTx]);
    controller.abort();
    expect(TxBuildError.is(await caught(() => sending), "ABORTED")).toBe(true);
    answer();
    await answered;
    await settle();
    expect(await built.submit()).toBe(built);
    expect(viaProvider.searches).toEqual([]);
  });

  describe("its options", () => {
    it.each<[string, unknown, string, string]>([
      ["options that are null", null, "options", "null"],
      ["options that are a string", "options", "options", "string"],
      [
        "options that are a submitter",
        { submitTx: async () => "" },
        "options",
        "object",
      ],
      ["options that are a list", [], "options", "object"],
      [
        "a submitter without submitTx",
        { submitter: { signTx: async () => "" } },
        "submitter",
        "object",
      ],
      [
        "a submitter that is a string",
        { submitter: "x" },
        "submitter",
        "string",
      ],
      [
        "a signal that is not an AbortSignal",
        { signal: { aborted: false } },
        "signal",
        "object",
      ],
    ])(
      "refuses %s with INVALID_OPTION naming only its type, and sends nothing",
      async (_, options, option, type) => {
        const viaProvider = fakeProvider();
        const { built } = await signedFixture({
          provider: viaProvider.provider,
        });
        const error = await caught(() => built.submit(options as never));
        expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
        const { details } = error as TxBuildError<"INVALID_OPTION">;
        expect([details.option, details.value]).toEqual([option, type]);
        expect(viaProvider.sent).toEqual([]);
      },
    );

    it("tells options given as a submitter to give it as { submitter }", async () => {
      const { built } = await signedFixture();
      const error = await caught(() =>
        built.submit({ submitTx: async () => "" } as never),
      );
      expect((error as Error).message).toContain("{ submitter }");
    });
  });
});

describe("StandaloneTx.awaitInclusion", () => {
  it("returns what the provider's answer gave of the block when it finds the transaction at once", async () => {
    const viaProvider = fakeProvider({
      fetchTxInfo: (hash) =>
        foundInfo(hash, { validContract: true, fees: "170000" }),
    });
    const { built } = await signedFixture({ provider: viaProvider.provider });
    const found: TxInclusion = await built.awaitInclusion();
    expect(found).toEqual({
      txHash: built.txHash,
      slot: 1200,
      block: "b".repeat(64),
      blockHeight: 1200,
    });
    expect(Object.isFrozen(found)).toBe(true);
    expect(viaProvider.searches).toEqual([built.txHash]);
    expect(viaProvider.sent).toEqual([]);
  });

  it("returns the hash alone when the answer gives nothing of the block, and needs no validity without a Plutus script", async () => {
    const viaProvider = fakeProvider({ fetchTxInfo: () => ({}) });
    const { built } = await fixture({
      builder: { provider: viaProvider.provider },
    });
    // Before any signature or delivery: it looks only
    expect(await built.awaitInclusion()).toEqual({ txHash: built.txHash });
  });

  /**
   * A provider whose searches answer as `answer` says, each recorded with the moment of the fake
   * clock it was made at, counted from `start()`
   */
  const timedProvider = (
    answer: (hash: string) => unknown = () => {
      throw notFound();
    },
  ) => {
    const at: number[] = [];
    let started = 0;
    const viaProvider = fakeProvider({
      fetchTxInfo: (hash) => {
        at.push(Date.now() - started);
        return answer(hash);
      },
    });
    return {
      ...viaProvider,
      at,
      /** Starts counting the moments: call it on the fake clock, right before the call */
      start: () => {
        started = Date.now();
      },
    };
  };

  it("looks again every pollMs until it finds it: not found and unknown answers are not a no", async () => {
    const answers: (() => unknown)[] = [
      () => {
        throw notFound();
      },
      () => {
        throw new Error("timeout");
      },
      () => foundInfo("c".repeat(64)),
      () => null,
    ];
    const paced = timedProvider((hash) =>
      (answers.shift() ?? (() => foundInfo(hash)))(),
    );
    const { built } = await signedFixture({ provider: paced.provider });
    await onFakeClock(async () => {
      paced.start();
      const found = track(built.awaitInclusion({ pollMs: 5 }));
      await jest.advanceTimersByTimeAsync(20);
      expect(found.done).toBe(true);
      expect(found.returned?.txHash).toBe(built.txHash);
      expect(paced.at).toEqual([0, 5, 10, 15, 20]);
    });
  });

  it("is CONFIRM_TIMEOUT (retryable) at timeoutMs when it is not found in time", async () => {
    const paced = timedProvider();
    const { built } = await signedFixture({ provider: paced.provider });
    await onFakeClock(async () => {
      paced.start();
      const waiting = track(
        built.awaitInclusion({ timeoutMs: 60, pollMs: 25 }),
      );
      await jest.advanceTimersByTimeAsync(59);
      expect(waiting.done).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(waiting.done).toBe(true);
      const error = waiting.thrown;
      expect(error).toBeInstanceOf(TxPlanError);
      const { code, details, retryable, message } =
        error as TxPlanError<"CONFIRM_TIMEOUT">;
      expect([code, retryable]).toEqual(["CONFIRM_TIMEOUT", true]);
      expect(details).toEqual({ waitedFor: "included", timeoutMs: 60 });
      expect(message).toContain("does not mean that it will not land");
      expect(message.endsWith(NO_REBUILD)).toBe(true);
      // The last pause is cut to the time left, and one more look is made then
      expect(paced.at).toEqual([0, 25, 50, 60]);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  it("looks every planDefaults.pollMs of the builder", async () => {
    const paced = timedProvider();
    const { built } = await signedFixture({
      provider: paced.provider,
      planDefaults: { pollMs: 10 },
    });
    await onFakeClock(async () => {
      paced.start();
      const waiting = track(built.awaitInclusion({ timeoutMs: 50 }));
      await jest.advanceTimersByTimeAsync(50);
      expect(codeOf(waiting.thrown)).toBe("CONFIRM_TIMEOUT");
      expect(paced.at).toEqual([0, 10, 20, 30, 40, 50]);
    });
  });

  it("looks every 5 000 ms without planDefaults.pollMs, and waits 120 000 ms by default", async () => {
    const paced = timedProvider();
    const { built } = await signedFixture({ provider: paced.provider });
    await onFakeClock(async () => {
      paced.start();
      const waiting = track(built.awaitInclusion());
      await jest.advanceTimersByTimeAsync(4_999);
      expect(paced.at).toEqual([0]);
      await jest.advanceTimersByTimeAsync(1);
      expect(paced.at).toEqual([0, 5_000]);
      await jest.advanceTimersByTimeAsync(120_000 - 5_000 - 1);
      expect(waiting.done).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(codeOf(waiting.thrown)).toBe("CONFIRM_TIMEOUT");
      expect(
        (waiting.thrown as TxPlanError<"CONFIRM_TIMEOUT">).details.timeoutMs,
      ).toBe(120_000);
      expect(paced.at).toHaveLength(25);
    });
  });

  it("is CONFIRM_TIMEOUT at timeoutMs when a look never answers", async () => {
    const paced = timedProvider(() => new Promise(() => {}));
    const { built } = await signedFixture({ provider: paced.provider });
    await onFakeClock(async () => {
      paced.start();
      const waiting = track(
        built.awaitInclusion({ timeoutMs: 1_000, pollMs: 100 }),
      );
      await jest.advanceTimersByTimeAsync(999);
      expect(waiting.done).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(codeOf(waiting.thrown)).toBe("CONFIRM_TIMEOUT");
      expect(paced.at).toEqual([0]);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  it.each<[string, (look: ReturnType<typeof gate>, hash: string) => void]>([
    ["finds it late", (look, hash) => look.resolve(foundInfo(hash))],
    ["fails late", (look) => look.reject(new Error("too late"))],
  ])(
    "never waits for a first look that hangs past the limit and then %s",
    async (_, late) => {
      const look = gate();
      const paced = timedProvider(() => look.promise);
      const { built } = await signedFixture({ provider: paced.provider });
      await onFakeClock(async () => {
        paced.start();
        const waiting = track(
          built.awaitInclusion({ timeoutMs: 300, pollMs: 100 }),
        );
        await jest.advanceTimersByTimeAsync(300);
        expect(codeOf(waiting.thrown)).toBe("CONFIRM_TIMEOUT");
        late(look, built.txHash);
        await jest.advanceTimersByTimeAsync(1_000);
        await settle();
        // The late answer changes nothing, and nothing looks again
        expect(codeOf(waiting.thrown)).toBe("CONFIRM_TIMEOUT");
        expect(paced.at).toEqual([0]);
        expect(jest.getTimerCount()).toBe(0);
      });
    },
  );

  it.each<[string, "found" | "timeout" | "abort"]>([
    ["it returns", "found"],
    ["the time is up", "timeout"],
    ["it is aborted", "abort"],
  ])(
    "leaves no timer and no listener on its signal after %s",
    async (_, end) => {
      let looks = 0;
      const paced = timedProvider((hash) => {
        looks += 1;
        if (end === "found" && looks === 2) return foundInfo(hash);
        if (end === "found") throw notFound();
        return new Promise(() => {});
      });
      const { built } = await signedFixture({ provider: paced.provider });
      const controller = new AbortController();
      await onFakeClock(async () => {
        paced.start();
        const waiting = track(
          built.awaitInclusion({
            timeoutMs: 1_000,
            pollMs: 100,
            signal: controller.signal,
          }),
        );
        if (end === "abort") {
          await jest.advanceTimersByTimeAsync(500);
          controller.abort();
          await settle();
        } else await jest.advanceTimersByTimeAsync(1_000);
        expect(waiting.done).toBe(true);
        if (end === "found")
          expect(waiting.returned?.txHash).toBe(built.txHash);
        if (end === "timeout")
          expect(codeOf(waiting.thrown)).toBe("CONFIRM_TIMEOUT");
        if (end === "abort")
          expect(TxBuildError.is(waiting.thrown, "ABORTED")).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
        expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
      });
    },
  );

  it("is SCRIPT_FAILED for a transaction found with is_valid = false", async () => {
    const viaProvider = fakeProvider({
      fetchTxInfo: (hash) => foundInfo(hash, { validContract: false }),
    });
    const { built } = await signedFixture({ provider: viaProvider.provider });
    const error = await caught(() => built.awaitInclusion());
    expect(error).toBeInstanceOf(TxPlanError);
    expect((error as TxPlanError).code).toBe("SCRIPT_FAILED");
    expect((error as TxPlanError).retryable).toBe(false);
  });

  it.each<[string, (hash: string) => unknown]>([
    ["has no fetchTxInfo", null as never],
    [
      "says that it cannot search",
      () => {
        throw { kind: "unsupported" };
      },
    ],
  ])(
    "is CANNOT_OBSERVE (noSearch) for a provider that %s",
    async (_, answer) => {
      const viaProvider = fakeProvider({ fetchTxInfo: answer });
      const { built } = await signedFixture({ provider: viaProvider.provider });
      const error = await caught(() => built.awaitInclusion());
      expect(error).toBeInstanceOf(TxPlanError);
      const { code, details, retryable } =
        error as TxPlanError<"CANNOT_OBSERVE">;
      expect([code, details.reason, retryable]).toEqual([
        "CANNOT_OBSERVE",
        "noSearch",
        false,
      ]);
    },
  );

  it("is MISSING_FETCHER on a builder without a provider, a submitter of its own notwithstanding", async () => {
    const { built } = await signedFixture({
      submitter: recorder().submitter,
    });
    const error = await caught(() => built.awaitInclusion());
    expect(TxBuildError.is(error, "MISSING_FETCHER")).toBe(true);
  });

  it("reads the provider itself, past the cache the builder shares", async () => {
    // The first answer is about another transaction: a cache would give it back again
    let reads = 0;
    const inner = fakeProvider({
      fetchTxInfo: (hash) =>
        ++reads === 1 ? foundInfo("c".repeat(64)) : foundInfo(hash),
    });
    const cached = CachedFetcher.wrap(
      inner.provider as unknown as Parameters<typeof CachedFetcher.wrap>[0],
    );
    const { built, builder: b } = await signedFixture({
      provider: cached as unknown as TxBuilderOptions["provider"],
    });
    // The builder's own cache holds that first answer
    await (b as unknown as { cache: CachedFetcher }).cache.fetchTxInfo(
      built.txHash,
    );
    expect(reads).toBe(1);
    await onFakeClock(async () => {
      const found = track(
        built.awaitInclusion({ pollMs: 5, timeoutMs: 1_000 }),
      );
      await jest.advanceTimersByTimeAsync(5);
      expect(found.returned?.txHash).toBe(built.txHash);
    });
    expect(reads).toBe(2);
  });

  it("is ABORTED by its signal while it waits", async () => {
    const viaProvider = fakeProvider();
    const { built } = await signedFixture({ provider: viaProvider.provider });
    const controller = new AbortController();
    await onFakeClock(async () => {
      const waiting = track(
        built.awaitInclusion({ pollMs: 10_000, signal: controller.signal }),
      );
      await jest.advanceTimersByTimeAsync(20);
      controller.abort();
      await settle();
      expect(TxBuildError.is(waiting.thrown, "ABORTED")).toBe(true);
    });
    expect(viaProvider.searches).toHaveLength(1);
  });

  it.each<[string, unknown, string]>([
    ["options that are a string", "fast", "options"],
    ["a timeoutMs of 0", { timeoutMs: 0 }, "timeoutMs"],
    ["a negative timeoutMs", { timeoutMs: -1 }, "timeoutMs"],
    ["a timeoutMs that is not a number", { timeoutMs: "100" }, "timeoutMs"],
    ["an infinite timeoutMs", { timeoutMs: Infinity }, "timeoutMs"],
    ["a pollMs of 0", { pollMs: 0 }, "pollMs"],
    ["a pollMs that is NaN", { pollMs: NaN }, "pollMs"],
    ["a signal that is not an AbortSignal", { signal: {} }, "signal"],
  ])(
    "refuses %s with INVALID_OPTION, and reads nothing",
    async (_, options, option) => {
      const viaProvider = fakeProvider();
      const { built } = await signedFixture({ provider: viaProvider.provider });
      const error = await caught(() => built.awaitInclusion(options as never));
      expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
      expect((error as TxBuildError<"INVALID_OPTION">).details.option).toBe(
        option,
      );
      expect(viaProvider.searches).toEqual([]);
    },
  );
});
