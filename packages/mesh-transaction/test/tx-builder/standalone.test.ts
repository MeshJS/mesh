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
  TxBuildError,
  TxHashRequest,
  TxPlanError,
  Utxo,
  utxosAfter,
} from "../../src/tx-builder";
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
const fixture = async (options: { native?: boolean } = {}) => {
  await Crypto.ready();
  const payer = testKey();
  const guardKey = testKey();
  const scriptKey = testKey();
  const native: NativeScript = { type: "sig", keyHash: scriptKey.keyHash };
  const b = builder();
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
