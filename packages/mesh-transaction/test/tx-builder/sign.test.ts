import {
  Action,
  Cip30WalletApi,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  deserializeAddress,
  IEvaluator,
  mConStr0,
  NativeScript,
  Protocol,
  pubKeyAddress,
  resolveDataHash,
  resolveNativeScriptHash,
  serializeAddressObj,
} from "@meshsdk/core";
import {
  Address,
  CborReader,
  CborWriter,
  Crypto,
  HexBlob,
  keyHashToRewardAddress,
  scriptHashToBech32,
  scriptHashToRewardAddress,
  Serialization,
  toNativeScript,
  Transaction,
  transactionPrototypeToHex,
  TxCBOR,
} from "@meshsdk/core-cst";
import { AppWallet, BrowserWallet, MeshWallet } from "@meshsdk/wallet";

import type { AskedKey } from "../../src/tx-builder";
import * as publicApi from "../../src";
import {
  addWitnesses,
  Assets,
  BuiltTxData,
  certificate,
  collateral,
  guard,
  metadata,
  mint,
  output,
  OutputDatum,
  OutputScript,
  proposal,
  referenceInput,
  requiredSigners,
  signedKeyHashes,
  Signer,
  SignTxHash,
  signWitnesses,
  spend,
  toUtxo,
  TxBuilder,
  TxBuildError,
  TxError,
  TxHashSigner,
  TxPlanError,
  TxPlanErrorCode,
  TxPlanErrorDetails,
  TxSigners,
  Utxo,
  UtxoInput,
  vote,
  withdrawal,
} from "../../src/tx-builder";
import { feeForSize } from "../../src/tx-builder/fee";
import * as utxoModule from "../../src/tx-builder/parts/utxo";
import {
  askSigner,
  KeyWitness,
  keyWitnessTags,
  readTransaction,
  readWitnessArgument,
  withoutKeyWitnesses,
  withWitnesses,
  writeWitnessSet,
} from "../../src/tx-builder/sign";
import { askedKeys, countedKeys } from "../../src/tx-builder/witnesses";
import {
  alwaysSucceedCbor,
  baseAddress,
  keyHashHex,
  vrfKeyHashHex,
} from "../test-util";
import * as cbor from "./cbor-util";
import { hashSigner, TestKey, testKey } from "./hash-signer-util";
import { ref } from "./utxo-util";

const network = "preprod";
const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const recipient = baseAddress(2);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const deposits = { drepDeposit: 500_000_000n, govActionDeposit: 1_000_000n };
const words = Array(24).fill("solution");

const TAGS: Action["tag"][] = [
  "SPEND",
  "MINT",
  "CERT",
  "REWARD",
  "VOTE",
  "PROPOSE",
];

/** Prices every redeemer of a transaction at fixed units */
const fakeEvaluator = (budget = { mem: 1000, steps: 2000 }): IEvaluator => ({
  evaluateTx: async (tx) =>
    (
      Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ?? []
    ).map((r) => ({ tag: TAGS[r.tag()]!, index: Number(r.index()), budget })),
});

const builder = () =>
  new TxBuilder({
    network,
    params,
    costModels,
    evaluator: fakeEvaluator(),
    deposits,
  });

const ada = (n: number) => BigInt(n) * 1_000_000n;
const lovelace = (n: bigint): Assets => ({ lovelace: n });
const unitInline: OutputDatum = {
  type: "inline",
  data: { type: "CBOR", content: "d87980" },
};
/** A native script as an output holds it for reference */
const nativeRefOf = (script: NativeScript): OutputScript => ({
  type: "native",
  cbor: toNativeScript(script).toCbor().toString(),
  hash: resolveNativeScriptHash(script),
});

type Wallets = Record<"payment" | "stake" | "drep", MeshWallet>;
let wallets: Wallets;
let address: string;
let paymentKey: string;
let stakeKey: string;

beforeAll(async () => {
  const walletOf = async (accountType: "payment" | "stake" | "drep") => {
    const wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words },
      accountType,
    });
    await wallet.init();
    return wallet;
  };
  wallets = {
    payment: await walletOf("payment"),
    stake: await walletOf("stake"),
    drep: await walletOf("drep"),
  };
  address = (await wallets.payment.getChangeAddress())!;
  ({ pubKeyHash: paymentKey, stakeCredentialHash: stakeKey } =
    deserializeAddress(address));
});

let nextHash = 0;
const utxo = (
  value: Assets,
  extra: Partial<Utxo> = {},
  at = address,
): Utxo => ({
  txHash: (++nextHash).toString(16).padStart(64, "c"),
  outputIndex: 0,
  address: at,
  value,
  ...extra,
});
const payer = (...utxos: Utxo[]) => ({ changeAddress: address, utxos });

/** A payment from the fixture's wallet: one key signs it */
const payment = async (lovelaceOut = ada(5)) => {
  const built = await builder().build(
    [output({ address: recipient, value: { lovelace: lovelaceOut } })],
    { payer: payer(utxo(lovelace(ada(100)))) },
  );
  expectAgrees(built);
  return built;
};

/* CBOR as raw items, to compare bytes */

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const topItems = (tx: string) => {
  const reader = new CborReader(HexBlob(tx));
  const length = reader.readStartArray()!;
  return Array.from({ length }, () => hex(reader.readEncodedValue()));
};
/** The entries of a transaction's witness set, in order, values in hex */
const witnessEntries = (tx: string): [number, string][] => {
  const reader = new CborReader(HexBlob(topItems(tx)[1]!));
  const length = reader.readStartMap()!;
  return Array.from({ length }, () => [
    Number(reader.readUInt()),
    hex(reader.readEncodedValue()),
  ]);
};
const entry = (tx: string, key: number) =>
  witnessEntries(tx).find(([k]) => k === key)?.[1];
const txIdOf = (tx: string) => Transaction.fromCbor(TxCBOR(tx)).getId();
/** The public keys of a transaction's vkey witnesses, in order */
const vkeysOf = (tx: string) =>
  Array.from(
    Transaction.fromCbor(TxCBOR(tx)).witnessSet().vkeys()?.values() ?? [],
    (w) => w.vkey(),
  );
const vkeysOfSet = (witnessSet: string) =>
  Array.from(
    Serialization.TransactionWitnessSet.fromCbor(HexBlob(witnessSet))
      .vkeys()
      ?.values() ?? [],
    (w) => w.vkey(),
  );
const bootstrapsOfSet = (witnessSet: string) =>
  Array.from(
    Serialization.TransactionWitnessSet.fromCbor(HexBlob(witnessSet))
      .bootstraps()
      ?.values() ?? [],
    (w) => w.vkey(),
  );

type VkeyWitness = { vkey: string; signature: string };
/** A witness set holding these vkey witnesses, `[vkey, signature]` in hex */
const vkeyWitnessSet = (witnesses: VkeyWitness[], tagged = false) => {
  const writer = new CborWriter().writeStartMap(1).writeInt(0);
  if (tagged) writer.writeTag(258);
  writer.writeStartArray(witnesses.length);
  for (const { vkey, signature } of witnesses)
    writer
      .writeStartArray(2)
      .writeByteString(Buffer.from(vkey, "hex"))
      .writeByteString(Buffer.from(signature, "hex"));
  return writer.encodeAsHex();
};
/** The transaction with its witness set replaced */
const withWitnessSet = (tx: string, witnessSet: string) => {
  const [body, , ...rest] = topItems(tx);
  const writer = new CborWriter().writeStartArray(2 + rest.length);
  for (const item of [body!, witnessSet, ...rest])
    writer.writeEncodedValue(Buffer.from(item, "hex"));
  return writer.encodeAsHex();
};
/** The vkey and signature of the single vkey witness of a witness set */
const firstVkeyWitness = (witnessSet: string) => {
  const witness = Serialization.TransactionWitnessSet.fromCbor(
    HexBlob(witnessSet),
  )
    .vkeys()!
    .values()[0]!;
  return {
    vkey: witness.vkey() as string,
    signature: witness.signature() as string,
  };
};
/** A witness set holding one bootstrap witness made of a vkey witness's key and signature */
const bootstrapWitnessSet = (vkey: string, signature: string) =>
  new CborWriter()
    .writeStartMap(1)
    .writeInt(2)
    .writeStartArray(1)
    .writeStartArray(4)
    .writeByteString(Buffer.from(vkey, "hex"))
    .writeByteString(Buffer.from(signature, "hex"))
    .writeByteString(new Uint8Array(32))
    .writeByteString(Buffer.from("a0", "hex"))
    .encodeAsHex();

/** The rejection of a promise, or the throw of a call */
const caught = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
};
const planError = async <C extends TxPlanErrorCode>(
  run: () => unknown,
  code: C,
) => {
  const error = await caught(run);
  expect(error).toBeInstanceOf(TxPlanError);
  expect((error as TxPlanError).code).toBe(code);
  return error as TxPlanError<C>;
};
const buildError = async <C extends "INVALID_OPTION" | "UTXO_NOT_FOUND">(
  run: () => unknown,
  code: C,
) => {
  const error = await caught(run);
  expect(error).toBeInstanceOf(TxBuildError);
  expect((error as TxBuildError).code).toBe(code);
  return error as TxBuildError<C>;
};

/** `TxSigners` with every list but the roles of a key sorted, to compare two of them */
const normalized = (signers: TxSigners) => {
  const json = (v: unknown) => JSON.stringify(v);
  return {
    keyHashes: [...signers.keyHashes].sort(),
    keys: signers.keys
      .map((k) => ({ keyHash: k.keyHash, roles: k.roles }))
      .sort((a, b) => a.keyHash.localeCompare(b.keyHash)),
    byronAddresses: [...signers.byronAddresses].sort(),
    nativeScripts: [...signers.nativeScripts].sort((a, b) =>
      json(a).localeCompare(json(b)),
    ),
  };
};
/** The UTxOs of a built transaction's inputs and collateral */
const spentBy = (built: BuiltTxData) => [
  ...built.inputs,
  ...(built.collateral?.inputs ?? []),
];
const expectAgrees = (built: BuiltTxData, spent = spentBy(built)) =>
  expect(normalized(requiredSigners(built.tx, spent))).toEqual(
    normalized(built.signers),
  );

/** A transaction with a datum, a redeemer, a Plutus and a native script, auxiliary data, and a failing validity flag */
const scriptTx = async (taggedSets = true) => {
  const native: NativeScript = { type: "sig", keyHash: keyHashHex(31) };
  const datum = mConStr0([1]);
  const scriptAddress = builder().scriptAddress(plutusScript);
  const locked = utxo(
    lovelace(ada(10)),
    { datum: { type: "hash", hash: resolveDataHash(datum) } },
    scriptAddress,
  );
  const built = await builder().build(
    [
      spend.plutus({
        utxo: locked,
        script: plutusScript,
        redeemer: { data: mConStr0([]) },
        datum: { data: datum },
      }),
      spend.native({
        utxo: utxo(lovelace(ada(10)), {}, builder().scriptAddress(native)),
        script: native,
      }),
      metadata({ metadataLabel: 674, value: { msg: ["signing"] } }),
      output({ address: recipient, value: { lovelace: ada(25) } }),
    ],
    { payer: payer(utxo(lovelace(ada(100)))) },
  );
  expectAgrees(built);
  const prototype = structuredClone(built.prototype);
  prototype.is_valid = false;
  return transactionPrototypeToHex(prototype, { taggedSets });
};

/** The fixture's wallet's witness set for a transaction */
const paymentWitnesses = (tx: string) =>
  wallets.payment.signTx(tx, true, false);
const stakeWitnesses = (tx: string) => wallets.stake.signTx(tx, true, false);

describe("addWitnesses", () => {
  it("changes only the vkey entry, written as the body writes its sets", async () => {
    for (const taggedSets of [true, false]) {
      const tx = await scriptTx(taggedSets);
      const signed = await addWitnesses(tx, await paymentWitnesses(tx));
      const [body, , valid, aux] = topItems(tx);
      const after = topItems(signed);
      expect(after[0]).toBe(body);
      expect(after[2]).toBe(valid);
      expect(after[2]).toBe("f4");
      expect(after[3]).toBe(aux);
      expect(txIdOf(signed)).toBe(txIdOf(tx));
      const before = witnessEntries(tx);
      const entries = witnessEntries(signed);
      expect(entries.filter(([k]) => k !== 0 && k !== 2)).toEqual(before);
      expect(before.map(([k]) => k)).toEqual(
        expect.arrayContaining([1, 4, 5, 7]),
      );
      // Key 0 comes first, one witness in a definite-length list, tagged as the body's sets
      expect(entries[0]![0]).toBe(0);
      expect(entries[0]![1]).toMatch(taggedSets ? /^d9010281/ : /^81/);
      expect(vkeysOf(signed)).toEqual(vkeysOfSet(await paymentWitnesses(tx)));
    }
  });

  it("appends to a vkey entry in the form it has", async () => {
    const tx = await scriptTx(true);
    // The stake key's witness as a plain list, though the transaction's sets are tagged
    const stake = firstVkeyWitness(await stakeWitnesses(tx));
    const plain = new CborWriter()
      .writeStartArray(1)
      .writeStartArray(2)
      .writeByteString(Buffer.from(stake.vkey, "hex"))
      .writeByteString(Buffer.from(stake.signature, "hex"))
      .encode();
    const [body, ws, valid, aux] = topItems(tx);
    const reader = new CborReader(HexBlob(ws!));
    const count = reader.readStartMap()!;
    const set = new CborWriter().writeStartMap(count + 1);
    set.writeInt(0).writeEncodedValue(plain);
    for (let i = 0; i < count; i++)
      set
        .writeEncodedValue(reader.readEncodedValue())
        .writeEncodedValue(reader.readEncodedValue());
    const withStake = new CborWriter()
      .writeStartArray(4)
      .writeEncodedValue(Buffer.from(body!, "hex"))
      .writeEncodedValue(set.encode())
      .writeEncodedValue(Buffer.from(valid!, "hex"))
      .writeEncodedValue(Buffer.from(aux!, "hex"))
      .encodeAsHex();

    const signed = await addWitnesses(withStake, await paymentWitnesses(tx));
    const vkeys = entry(signed, 0)!;
    expect(vkeys).toMatch(/^82/);
    expect(vkeys.startsWith(`82${hex(plain).slice(2)}`)).toBe(true);
    expect(vkeysOf(signed)).toEqual([
      stake.vkey,
      ...vkeysOfSet(await paymentWitnesses(tx)),
    ]);
  });

  it("adds a witness once", async () => {
    const built = await payment();
    const ws = await paymentWitnesses(built.tx);
    const once = await addWitnesses(built.tx, ws);
    expect(await addWitnesses(built.tx, ws, ws)).toBe(once);
    expect(await addWitnesses(once, ws)).toBe(once);
    // A witness the transaction holds keeps its place
    const stakeWs = await stakeWitnesses(built.tx);
    const both = await addWitnesses(once, stakeWs, ws);
    expect(vkeysOf(both)).toEqual([...vkeysOfSet(ws), ...vkeysOfSet(stakeWs)]);
  });

  it("returns the transaction as given when nothing is new", async () => {
    const { tx } = await payment();
    expect(await addWitnesses(tx)).toBe(tx);
    expect(await addWitnesses(tx, "a0")).toBe(tx);
  });

  it("takes only the witnesses of a full transaction, keeping the validity flag", async () => {
    const tx = await scriptTx();
    // The wallet keeps the flag; a full transaction marked otherwise is made of its items
    const [body, witnessSet, valid, aux] = topItems(
      await wallets.payment.signTx(tx, true),
    );
    expect(valid).toBe("f4");
    const full = cbor.tx(body!, witnessSet, { valid: "f5", aux });
    const signed = await addWitnesses(tx, full);
    expect(topItems(signed)[2]).toBe("f4");
    expect(vkeysOf(signed)).toEqual(vkeysOf(full));
    expect(signed).toBe(await addWitnesses(tx, await paymentWitnesses(tx)));
  });

  it("adds witness sets of two keys in one call", async () => {
    const { tx } = await payment();
    const signed = await addWitnesses(
      tx,
      await paymentWitnesses(tx),
      await stakeWitnesses(tx),
    );
    expect((await signedKeyHashes(signed)).sort()).toEqual(
      [paymentKey, stakeKey].sort(),
    );
  });

  it("adds a bootstrap witness once, which signedKeyHashes does not list", async () => {
    const { tx } = await payment();
    const { vkey, signature } = firstVkeyWitness(await paymentWitnesses(tx));
    const bootstrap = bootstrapWitnessSet(vkey, signature);
    const signed = await addWitnesses(tx, bootstrap, bootstrap);
    const witnessSet = Transaction.fromCbor(TxCBOR(signed)).witnessSet();
    expect(witnessSet.bootstraps()?.size()).toBe(1);
    expect(witnessSet.bootstraps()!.values()[0]!.vkey()).toBe(vkey);
    expect(witnessSet.vkeys()).toBeUndefined();
    expect(await addWitnesses(signed, bootstrap)).toBe(signed);
    expect(await signedKeyHashes(signed)).toEqual([]);
  });

  describe("an argument that cannot be read", () => {
    let tx: string;
    let good: string;
    beforeAll(async () => {
      tx = (await payment()).tx;
      good = await paymentWitnesses(tx);
    });
    const shortKey = () => {
      const { vkey, signature } = firstVkeyWitness(good);
      return vkeyWitnessSet([{ vkey: vkey.slice(2), signature }]);
    };

    it.each([
      ["text that is not hex", () => "zz"],
      ["an empty string", () => ""],
      ["CBOR that is neither a map nor an array", () => "00"],
      ["a truncated witness set", () => good.slice(0, -2)],
      ["a vkey witness whose key is not 32 bytes", shortKey],
    ])("%s is undecodable, numbered from 0", async (_, bad) => {
      for (const [args, argument] of [
        [[good, bad()], 1],
        [[bad()], 0],
      ] as const) {
        const error = await planError(
          () => addWitnesses(tx, ...args),
          "INVALID_WITNESS",
        );
        expect(error.details).toEqual({ reason: "undecodable", argument });
        expect(error.details.keyHash).toBeUndefined();
        // The decoder's error is the cause
        expect(error.cause).toBeInstanceOf(Error);
      }
    });
  });

  it("refuses a witness of another transaction as wrongBody, naming its key", async () => {
    const { tx } = await payment();
    const other = await paymentWitnesses((await payment(ada(6))).tx);
    for (const [args, argument] of [
      [[other], 0],
      [[await stakeWitnesses(tx), other], 1],
    ] as const) {
      const error = await planError(
        () => addWitnesses(tx, ...args),
        "INVALID_WITNESS",
      );
      expect(error.details).toEqual({
        reason: "wrongBody",
        argument,
        keyHash: paymentKey,
      });
    }
  });

  it("refuses a bootstrap witness of another transaction as wrongBody, naming its key", async () => {
    const { tx } = await payment();
    const good = await stakeWitnesses(tx);
    const { vkey, signature } = firstVkeyWitness(
      await paymentWitnesses((await payment(ada(6))).tx),
    );
    const error = await planError(
      () => addWitnesses(tx, good, bootstrapWitnessSet(vkey, signature)),
      "INVALID_WITNESS",
    );
    expect(error.details).toEqual({
      reason: "wrongBody",
      argument: 1,
      keyHash: paymentKey,
    });
  });

  it("raises a plan error, recognised by TxError.is, that is not retryable and names no plan", async () => {
    const { tx } = await payment();
    const error = await caught(() => addWitnesses(tx, "00"));
    expect(TxError.is(error, "INVALID_WITNESS")).toBe(true);
    if (!TxError.is(error, "INVALID_WITNESS")) throw error;
    const reason: TxPlanErrorDetails["INVALID_WITNESS"]["reason"] =
      error.details.reason;
    expect(reason).toBe("undecodable");
    expect(error.details.argument).toBe(0);
    expect(error.retryable).toBe(false);
    expect(error.retryAfterMs).toBeUndefined();
    expect(error.planId).toBeUndefined();
    expect(error.txHash).toBeUndefined();
    expect((error as unknown as Record<string, unknown>).plan).toBeUndefined();
    expect(
      (error as unknown as Record<string, unknown>).status,
    ).toBeUndefined();
  });

  it("keeps the fee enough for the signed transaction", async () => {
    const built = await payment();
    const signed = await addWitnesses(
      built.tx,
      await signWitnesses(wallets.payment, built.tx),
    );
    const min = feeForSize(signed.length / 2, 0n, built.exUnits, params);
    expect(built.fee).toBeGreaterThanOrEqual(min);
    expect(built.fee - min).toBeLessThanOrEqual(5n * 44n);
  });
});

describe("the set tag of the key witnesses", () => {
  /** A vkey witness and a bootstrap witness of a new key over a transaction hash */
  const witnessesOf = (txId: string): [KeyWitness, KeyWitness] => {
    const key = testKey();
    const signature = key.sign(txId);
    const own = { vkey: key.vkey, signature, keyHash: key.keyHash };
    return [
      { kind: "vkey", ...own },
      {
        kind: "bootstrap",
        ...own,
        chainCode: "00".repeat(32),
        attributes: "a0",
      },
    ];
  };
  const FORMS = [
    { vkey: true, bootstrap: true },
    { vkey: true, bootstrap: false },
    { vkey: false, bootstrap: true },
    { vkey: false, bootstrap: false },
  ];
  /** An entry of one witness, or of two, with the set tag or without */
  const form = (tagged: boolean, count = 1) =>
    new RegExp(`^${tagged ? "d90102" : ""}8${count}`);

  it("withWitnesses writes an entry the transaction does not have in the form asked for, each entry on its own", async () => {
    await Crypto.ready();
    for (const taggedSets of [true, false]) {
      const tx = await scriptTx(taggedSets);
      const raw = readTransaction(tx);
      const added = witnessesOf(raw.txId);
      // Left out, both entries are written as the body writes its input set
      expect(withWitnesses(raw, added)).toBe(
        withWitnesses(raw, added, taggedSets),
      );
      expect(entry(withWitnesses(raw, added), 0)).toMatch(form(taggedSets));
      expect(entry(withWitnesses(raw, added), 2)).toMatch(form(taggedSets));
      for (const tags of FORMS) {
        const written = withWitnesses(raw, added, tags);
        expect(entry(written, 0)).toMatch(form(tags.vkey));
        expect(entry(written, 2)).toMatch(form(tags.bootstrap));
        // Only the two entries change
        const [body, , ...rest] = topItems(tx);
        expect(topItems(written)[0]).toBe(body);
        expect(topItems(written).slice(2)).toEqual(rest);
        expect(
          witnessEntries(written).filter(([k]) => k !== 0 && k !== 2),
        ).toEqual(witnessEntries(tx));
        expect(written).toBe(
          withWitnesses(
            raw,
            added,
            tags.vkey === tags.bootstrap ? tags.vkey : tags,
          ),
        );
      }
    }
  });

  it("withWitnesses leaves an entry the transaction has in its own form, whatever is asked", async () => {
    await Crypto.ready();
    const raw = readTransaction(await scriptTx(true));
    for (const tags of FORMS) {
      const first = readTransaction(
        withWitnesses(raw, witnessesOf(raw.txId), tags),
      );
      const flipped = { vkey: !tags.vkey, bootstrap: !tags.bootstrap };
      for (const asked of [flipped, tags, true, false]) {
        const more = withWitnesses(first, witnessesOf(raw.txId), asked);
        expect(entry(more, 0)).toMatch(form(tags.vkey, 2));
        expect(entry(more, 2)).toMatch(form(tags.bootstrap, 2));
        expect(topItems(more)[0]).toBe(topItems(first.hex)[0]);
      }
    }
  });

  it("writeWitnessSet writes each entry with the set tag asked for it", async () => {
    await Crypto.ready();
    const raw = readTransaction(await scriptTx(true));
    const [vkey, bootstrap] = witnessesOf(raw.txId);
    for (const tags of FORMS) {
      const set = writeWitnessSet([vkey, bootstrap], tags);
      const { witnessSet, witnesses } = readWitnessArgument(set);
      expect(witnesses).toEqual([vkey, bootstrap]);
      expect(witnessSet.vkeys!.tagged).toBe(tags.vkey);
      expect(witnessSet.bootstraps!.tagged).toBe(tags.bootstrap);
      if (tags.vkey === tags.bootstrap)
        expect(writeWitnessSet([vkey, bootstrap], tags.vkey)).toBe(set);
    }
    // An entry without a witness is not written, whatever its tag
    expect(writeWitnessSet([vkey], { vkey: false, bootstrap: true })).toBe(
      writeWitnessSet([vkey], false),
    );
  });

  it("keyWitnessTags gives the form of each entry that holds a witness, and nothing for an empty one", async () => {
    await Crypto.ready();
    const raw = readTransaction(await scriptTx(true));
    const [vkey, bootstrap] = witnessesOf(raw.txId);
    const tagsOf = (set: string) =>
      keyWitnessTags(readWitnessArgument(set).witnessSet);
    for (const tags of FORMS) {
      expect(tagsOf(writeWitnessSet([vkey, bootstrap], tags))).toEqual(tags);
      expect(tagsOf(writeWitnessSet([vkey], tags))).toEqual({
        vkey: tags.vkey,
      });
      expect(tagsOf(writeWitnessSet([bootstrap], tags))).toEqual({
        bootstrap: tags.bootstrap,
      });
      // Read from a transaction as from a witness set
      const tx = withWitnesses(raw, [vkey, bootstrap], tags);
      expect(keyWitnessTags(readTransaction(tx).witnessSet)).toEqual(tags);
    }
    expect(tagsOf("a0")).toEqual({});
    expect(keyWitnessTags(raw.witnessSet)).toEqual({});
    // Empty entries, tagged and plain
    expect(tagsOf("a200d901028002d9010280")).toEqual({});
    expect(tagsOf("a200800280")).toEqual({});
  });

  it("signWitnesses writes the witness set in the form of the transaction, whatever form the signer answers in", async () => {
    await Crypto.ready();
    const key = testKey();
    /** A CIP-30 api answering the wallet's witnesses with the set tag or without, always */
    const cip30 = (tagged: boolean) => ({
      signTx: async (tx: string) =>
        writeWitnessSet(
          readWitnessArgument(await wallets.payment.signTxWitnesses(tx))
            .witnesses,
          tagged,
        ),
    });
    const signers: Signer[] = [
      wallets.payment,
      cip30(true),
      cip30(false),
      hashSigner("object", ({ txHash }) => [key.answer(txHash)]).signer,
      hashSigner("callback", ({ txHash }) => [key.answer(txHash)]).signer,
      // A signer that answers with the transaction signed
      { signTx: async (tx: string) => wallets.payment.signTx(tx, true) },
    ];
    for (const taggedSets of [true, false]) {
      const unsigned = await scriptTx(taggedSets);
      const raw = readTransaction(unsigned);
      // A transaction that holds a vkey witness, written in the other form than its body's
      const held = withWitnesses(raw, [witnessesOf(raw.txId)[0]], !taggedSets);
      for (const signer of signers) {
        for (const [tx, tagged] of [
          [unsigned, taggedSets],
          [held, !taggedSets],
        ] as const) {
          const set = await signWitnesses(signer, tx);
          const { witnessSet, witnesses } = readWitnessArgument(set);
          expect(witnesses).toHaveLength(1);
          expect(witnessSet.vkeys!.tagged).toBe(tagged);
          // Added to the transaction, it is written as the transaction writes its own
          expect(await addWitnesses(tx, set)).toBe(
            withWitnesses(readTransaction(tx), witnesses),
          );
        }
      }
    }
  });
});

describe("withoutKeyWitnesses", () => {
  /** A vkey witness and a bootstrap witness of new keys over a transaction hash, as hex */
  const keyWitnesses = (txId: string) => {
    const vkey = cbor.vkeyWitness(testKey(), txId);
    const key = testKey();
    const bootstrap = cbor.arr(
      cbor.bytes(key.vkey),
      cbor.bytes(key.sign(txId)),
      cbor.bytes("00".repeat(32)),
      cbor.bytes("a0"),
    );
    return { vkey, bootstrap };
  };
  /** Plutus data in odd encodings, and a native script: entries that are not key witnesses */
  const datums = cbor.arrIndef(
    cbor.constr0Indef(cbor.uint64(1), cbor.chunkedBytes("cafe")),
  );
  const nativeScripts = cbor.arr(
    cbor.arr(cbor.uint(0), cbor.bytes("22".repeat(28))),
  );

  it("returns a transaction without key witnesses as it is", async () => {
    await Crypto.ready();
    const to = `60${"33".repeat(28)}`;
    for (const form of ["tagged", "plain", "odd"] as const) {
      const body = cbor.body(form, { to });
      for (const set of [
        cbor.map(),
        cbor.map([cbor.uint(4), datums]),
        cbor.mapIndef([cbor.uint(4), datums], [cbor.uint(1), nativeScripts]),
      ]) {
        const given = cbor.tx(body, set, { aux: "f6" });
        expect(withoutKeyWitnesses(readTransaction(given))).toBe(given);
      }
    }
  });

  it("takes out both entries and nothing else of one that has them", async () => {
    await Crypto.ready();
    const to = `60${"33".repeat(28)}`;
    for (const form of ["tagged", "plain", "odd"] as const) {
      const body = cbor.body(form, { to });
      const { vkey, bootstrap } = keyWitnesses(cbor.txHashOf(body));
      const vkeys = [
        cbor.arr(vkey),
        cbor.tag258(cbor.arr(vkey)),
        cbor.arrIndef(vkey),
      ];
      for (const vkeyEntry of vkeys) {
        const others: [string, string][] = [
          [cbor.uint(4), datums],
          [cbor.uint(1), nativeScripts],
        ];
        const cases: [string, string][] = [
          // A stated length: written again for the entries left
          [
            cbor.map(
              [cbor.uint(4), datums],
              [cbor.uint(0), vkeyEntry],
              [cbor.uint(2), cbor.arr(bootstrap)],
              [cbor.uint(1), nativeScripts],
            ),
            cbor.map(...others),
          ],
          // An indefinite length: its header and its break stay
          [
            cbor.mapIndef(
              [cbor.uint(4), datums],
              [cbor.uint(0), vkeyEntry],
              [cbor.uint(1), nativeScripts],
              [cbor.uint(2), cbor.tag258(cbor.arr(bootstrap))],
            ),
            cbor.mapIndef(...others),
          ],
          // A key written in two bytes is taken out too; an empty bootstrap entry stays as it is
          [
            cbor.map(
              [cbor.uint(4), datums],
              ["1800", vkeyEntry],
              [cbor.uint(2), cbor.tag258(cbor.arr())],
              [cbor.uint(1), nativeScripts],
            ),
            cbor.map(
              [cbor.uint(4), datums],
              [cbor.uint(2), cbor.tag258(cbor.arr())],
              [cbor.uint(1), nativeScripts],
            ),
          ],
          // Only key witnesses: an empty witness set is left
          [
            cbor.map(
              [cbor.uint(0), vkeyEntry],
              [cbor.uint(2), cbor.arr(bootstrap)],
            ),
            cbor.map(),
          ],
        ];
        for (const [set, left] of cases)
          for (const rest of [
            { valid: "f5", aux: "f6" },
            { valid: "f4", aux: cbor.map([cbor.uint(0), cbor.uint(1)]) },
          ]) {
            const given = cbor.tx(body, set, rest);
            const raw = readTransaction(given);
            const unsigned = withoutKeyWitnesses(raw);
            expect(unsigned).toBe(cbor.tx(body, left, rest));
            // The body and the items after the witness set stay byte for byte
            expect(cbor.topItems(unsigned)[0]).toBe(body);
            expect(cbor.topItems(unsigned).slice(2)).toEqual(
              cbor.topItems(given).slice(2),
            );
            const read = readTransaction(unsigned);
            expect(read.txId).toBe(raw.txId);
            expect(read.witnessSet.vkeys).toBeUndefined();
            expect(read.witnessSet.bootstraps?.witnesses ?? []).toEqual([]);
          }
      }
    }
  });
});

describe("an empty key witness entry a transaction holds", () => {
  it("keeps its form when a witness is added: the object of fromCbor signs as a wallet signs, also restored and through addWitnesses", async () => {
    await Crypto.ready();
    const spent = utxo(lovelace(ada(100)));
    const built = await builder().build(
      [output({ address: recipient, value: { lovelace: ada(5) } })],
      { payer: payer(spent) },
    );
    for (const taggedSets of [true, false]) {
      const [body, , valid, aux] = topItems(
        transactionPrototypeToHex(built.prototype, { taggedSets }),
      );
      // The empty vkey entry in either form, the other form than the body's among them
      for (const empty of [cbor.arr(), cbor.tag258(cbor.arr())]) {
        const tx = cbor.tx(body!, cbor.map([cbor.uint(0), empty]), {
          valid: valid!,
          aux: aux!,
        });
        const byWallet = await wallets.payment.signTx(tx, true);
        // The wallet writes the witness into the entry, in its form
        expect(entry(byWallet, 0)).toMatch(
          empty === cbor.arr() ? /^81825820/ : /^d9010281825820/,
        );
        const read = await builder().fromCbor(tx, { knownUtxos: [spent] });
        expect(entry(read.tx, 0)).toBe(empty);
        const restored = await builder().restore(
          JSON.parse(JSON.stringify(read)),
        );
        await read.sign({ signers: wallets.payment });
        await restored.sign({ signers: wallets.payment });
        const added = await (
          await builder().fromCbor(tx, { knownUtxos: [spent] })
        ).addWitnesses(await paymentWitnesses(tx));
        for (const signed of [read, restored, added])
          expect([taggedSets, empty, signed.signedTx]).toEqual([
            taggedSets,
            empty,
            byWallet,
          ]);
      }
    }
  });

  it("refuses a witness into a witness set that repeats a key, the key of the vkey or of the bootstrap witnesses, as the wallets refuse it, with one message", async () => {
    await Crypto.ready();
    const spent = utxo(lovelace(ada(100)));
    const built = await builder().build(
      [output({ address: recipient, value: { lovelace: ada(5) } })],
      { payer: payer(spent) },
    );
    const message =
      "the witness set of the transaction repeats a key, and a reader may take another entry than the one a witness is written into: none is written";
    for (const taggedSets of [true, false]) {
      const [body, , valid, aux] = topItems(
        transactionPrototypeToHex(built.prototype, { taggedSets }),
      );
      const txOf = (...entries: [number, string][]) =>
        cbor.tx(
          body!,
          cbor.map(
            ...entries.map(([k, v]): [string, string] => [cbor.uint(k), v]),
          ),
          { valid: valid!, aux: aux! },
        );
      // A witness of another key than the wallet's, which the entry read last hides
      const witness = entry(await wallets.stake.signTx(txOf(), true), 0)!;
      const repeated: [string, string][] = [
        [
          "key 0: a witness, then an empty entry",
          txOf([0, witness], [0, cbor.arr()]),
        ],
        ["key 0: two empty entries", txOf([0, cbor.arr()], [0, cbor.arr()])],
        ["key 2: two empty entries", txOf([2, cbor.arr()], [2, cbor.arr()])],
      ];
      for (const [what, tx] of repeated) {
        // A wallet
        expect([
          what,
          ((await caught(() => wallets.payment.signTx(tx, true))) as Error)
            .message,
        ]).toEqual([what, message]);
        // The object of fromCbor holds the witness set as given, and signs nothing into it
        const read = await builder().fromCbor(tx, { knownUtxos: [spent] });
        expect([what, read.tx]).toEqual([what, tx]);
        const witnesses = await paymentWitnesses(tx);
        for (const run of [
          () => read.sign({ signers: wallets.payment }),
          () => read.addWitnesses(witnesses),
          () => addWitnesses(tx, witnesses),
        ]) {
          const error = await buildError(run, "INVALID_OPTION");
          expect([what, error.message]).toEqual([what, message]);
        }
        expect(read.missing.map((m) => m.keyHash)).toEqual([paymentKey]);
      }
    }
  });
});

describe("signedKeyHashes", () => {
  it("lists the keys whose witness verifies against the body", async () => {
    const { tx } = await payment();
    expect(await signedKeyHashes(tx)).toEqual([]);
    const one = await addWitnesses(tx, await paymentWitnesses(tx));
    expect(await signedKeyHashes(one)).toEqual([paymentKey]);
    const two = await addWitnesses(one, await stakeWitnesses(tx));
    expect(await signedKeyHashes(two)).toEqual([paymentKey, stakeKey]);

    // One byte of the signature changed: left out, not an error
    const { vkey, signature } = firstVkeyWitness(await stakeWitnesses(tx));
    const changed = (parseInt(signature.slice(0, 2), 16) ^ 1)
      .toString(16)
      .padStart(2, "0");
    const withForged = withWitnessSet(
      tx,
      vkeyWitnessSet(
        [
          firstVkeyWitness(await paymentWitnesses(tx)),
          { vkey, signature: changed + signature.slice(2) },
        ],
        true,
      ),
    );
    expect(vkeysOf(withForged)).toHaveLength(2);
    expect(await signedKeyHashes(withForged)).toEqual([paymentKey]);
  });

  it.each([
    ["text that is not hex", "zz"],
    ["CBOR that is not a transaction", "00"],
    ["a witness set", "a0"],
    ["a number", 42 as unknown as string],
  ])("refuses %s as tx with INVALID_OPTION", async (_, tx) => {
    for (const run of [
      () => signedKeyHashes(tx),
      () => addWitnesses(tx),
      () => addWitnesses(tx, "zz"),
    ]) {
      const result = run();
      expect(result).toBeInstanceOf(Promise);
      const error = await buildError(() => result, "INVALID_OPTION");
      // Only the JavaScript type of what was given: a key may be given there by mistake
      expect(error.details).toEqual({
        option: "tx",
        value: typeof tx,
        allowed: "a transaction in CBOR hex",
      });
      // Hex is handed to the decoder, whose error is the cause
      if (tx === "00" || tx === "a0") expect(error.cause).toBeInstanceOf(Error);
      else expect(error.cause).toBeUndefined();
    }
  });
});

describe("requiredSigners", () => {
  const roles = (signers: TxSigners, keyHash: string) =>
    signers.keys.find((k) => k.keyHash === keyHash)?.roles;
  /** Each key holds its hash and its roles, and nothing else */
  const onlyRoles = (signers: TxSigners) =>
    signers.keys.every(
      (k) => JSON.stringify(Object.keys(k).sort()) === '["keyHash","roles"]',
    );

  it("names each key with the role it is needed in", async () => {
    const spender = baseAddress(3);
    const collateralOwner = baseAddress(4);
    const keyOf = (a: string) => deserializeAddress(a).pubKeyHash;
    const action = { txHash: "a".repeat(64), index: 0 };
    const built = await builder().build(
      [
        spend.pubKey({
          utxo: utxo(lovelace(ada(50)), {}, spender),
          label: "spent",
        }),
        collateral({
          utxo: utxo(lovelace(ada(5)), {}, collateralOwner),
          label: "backing",
        }),
        guard.pubKey({ keyHash: keyHashHex(10), label: "approver" }),
        withdrawal.pubKey({
          rewardAddress: keyHashToRewardAddress(keyHashHex(11), 0),
          amount: 0n,
          label: "rewards",
        }),
        certificate.stakeDelegation({
          stake: keyHashToRewardAddress(keyHashHex(12), 0),
          pool: keyHashHex(17),
          label: "delegate",
        }),
        certificate.legacyStakeRegistration({
          stake: keyHashToRewardAddress(keyHashHex(18), 0),
        }),
        certificate.poolRegistration({
          params: {
            operator: keyHashHex(13),
            vrfKeyHash: vrfKeyHashHex(1),
            pledge: "1000000",
            cost: "340000000",
            margin: [1, 100],
            relays: [],
            owners: [keyHashHex(14)],
            rewardAddress: keyHashToRewardAddress(keyHashHex(14), 0),
          },
          label: "pool",
        }),
        vote({
          voter: { drep: { type: "KEY", value: keyHashHex(15) } },
          votes: [{ action, vote: "yes" }],
          label: "ballot",
        }),
      ],
      { payer: payer(utxo(lovelace(ada(1000)))) },
    );
    const signers = requiredSigners(built.tx, spentBy(built));
    expect(roles(signers, keyOf(spender))).toEqual(["input"]);
    expect(roles(signers, keyOf(collateralOwner))).toEqual(["collateral"]);
    expect(roles(signers, keyHashHex(10))).toEqual(["guard"]);
    expect(roles(built.signers, keyHashHex(10))).toEqual(["guard"]);
    expect(roles(signers, keyHashHex(11))).toEqual(["withdrawal"]);
    expect(roles(signers, keyHashHex(12))).toEqual(["certificate"]);
    expect(roles(signers, keyHashHex(13))).toEqual(["certificate"]);
    expect(roles(signers, keyHashHex(14))).toEqual(["poolOwner"]);
    expect(roles(signers, keyHashHex(15))).toEqual(["vote"]);
    // A stake registration without its deposit takes no witness
    expect(signers.keyHashes).not.toContain(keyHashHex(18));
    expect(onlyRoles(signers)).toBe(true);
    expect(signers.keyHashes).toEqual(signers.keys.map((k) => k.keyHash));
    expectAgrees(built);

    // Witnesses in the transaction change nothing
    const signed = await addWitnesses(
      built.tx,
      await paymentWitnesses(built.tx),
    );
    expect(requiredSigners(signed, spentBy(built))).toEqual(signers);
  });

  it("lists a native script it runs, not the keys it names", async () => {
    const native: NativeScript = {
      type: "all",
      scripts: [
        { type: "sig", keyHash: keyHashHex(31) },
        { type: "sig", keyHash: keyHashHex(32) },
      ],
    };
    const built = await builder().build(
      [
        spend.native({
          utxo: utxo(lovelace(ada(10)), {}, builder().scriptAddress(native)),
          script: native,
        }),
        output({ address: recipient, value: { lovelace: ada(15) } }),
      ],
      { payer: payer(utxo(lovelace(ada(50)))) },
    );
    const signers = requiredSigners(built.tx, spentBy(built));
    expect(signers.nativeScripts).toHaveLength(1);
    expect(signers.nativeScripts).toEqual(built.signers.nativeScripts);
    expect(signers.keyHashes).toEqual([paymentKey]);
    expectAgrees(built);
  });

  it("lists the Byron addresses spent from", async () => {
    const byron = "Ae2tdPwUPEZ4YjgvykNpoFeYUxoyhNj2kg8KfKWN2FizsSpLUPv68MpTVDo";
    const shelley = serializeAddressObj(pubKeyAddress(keyHashHex(1)), 1);
    const mainnet = new TxBuilder({ network: "mainnet", params });
    const built = await mainnet.build(
      [
        spend.pubKey({ utxo: utxo(lovelace(ada(5)), {}, byron) }),
        output({ address: shelley, value: { lovelace: ada(10) } }),
      ],
      {
        payer: {
          changeAddress: shelley,
          utxos: [utxo(lovelace(ada(50)), {}, shelley)],
        },
      },
    );
    const signers = requiredSigners(built.tx, spentBy(built));
    expect(signers.byronAddresses).toEqual([byron]);
    expect(signers.keyHashes).toEqual([keyHashHex(1)]);
    expectAgrees(built);
  });

  it("names pool and committee voters, DRep and committee certificates, and pool retirement", async () => {
    const action = { txHash: "b".repeat(64), index: 0 };
    const votes = [{ action, vote: "no" as const }];
    const built = await builder().build(
      [
        vote({ voter: { pool: keyHashHex(40) }, votes }),
        vote({
          voter: { committee: { type: "KEY", value: keyHashHex(41) } },
          votes,
        }),
        certificate.drepRegistration({
          drep: { type: "KEY", value: keyHashHex(42) },
        }),
        certificate.committeeHotAuth({
          cold: { type: "KEY", value: keyHashHex(43) },
          hot: { type: "KEY", value: keyHashHex(44) },
        }),
        certificate.poolRetirement({ pool: keyHashHex(45), epoch: 300 }),
      ],
      { payer: payer(utxo(lovelace(ada(1000)))) },
    );
    const signers = requiredSigners(built.tx, spentBy(built));
    for (const keyHash of [keyHashHex(40), keyHashHex(41)])
      expect(roles(signers, keyHash)).toEqual(["vote"]);
    for (const keyHash of [keyHashHex(42), keyHashHex(43), keyHashHex(45)])
      expect(roles(signers, keyHash)).toEqual(["certificate"]);
    // The hot credential authorised does not sign
    expect(signers.keyHashes).not.toContain(keyHashHex(44));
    expect(onlyRoles(signers)).toBe(true);
    expectAgrees(built);
  });

  it("lists every role of a key once, in the order of SignerRole, as the build does", async () => {
    const spender = baseAddress(3);
    const key = deserializeAddress(spender).pubKeyHash;
    const built = await builder().build(
      [
        guard.pubKey({ keyHash: key }),
        withdrawal.pubKey({
          rewardAddress: keyHashToRewardAddress(key, 0),
          amount: 0n,
        }),
        spend.pubKey({ utxo: utxo(lovelace(ada(2)), {}, spender) }),
        spend.pubKey({ utxo: utxo(lovelace(ada(3)), {}, spender) }),
        certificate.poolRegistration({
          params: {
            operator: keyHashHex(13),
            vrfKeyHash: vrfKeyHashHex(1),
            pledge: "1000000",
            cost: "340000000",
            margin: [1, 100],
            relays: [],
            owners: [keyHashHex(13)],
            rewardAddress: keyHashToRewardAddress(keyHashHex(13), 0),
          },
        }),
      ],
      { payer: payer(utxo(lovelace(ada(1000)))) },
    );
    const signers = requiredSigners(built.tx, spentBy(built));
    for (const found of [signers, built.signers]) {
      expect(roles(found, key)).toEqual(["input", "withdrawal", "guard"]);
      expect(roles(found, keyHashHex(13))).toEqual([
        "certificate",
        "poolOwner",
      ]);
      expect(onlyRoles(found)).toBe(true);
    }
    expectAgrees(built);
  });

  it("adds no key for script credentials, and lists the native scripts they run from reference inputs", async () => {
    const script = (index: number): NativeScript => ({
      type: "sig",
      keyHash: keyHashHex(index),
    });
    // One native script for each item that runs one, each held in a reference input
    const [rewards, staking, drep, guardrail, policy] = [
      50, 51, 52, 53, 54,
    ].map(script) as [
      NativeScript,
      NativeScript,
      NativeScript,
      NativeScript,
      NativeScript,
    ];
    const holderOf = (native: NativeScript) =>
      utxo(lovelace(ada(20)), { script: nativeRefOf(native) });
    const holders = [rewards, staking, drep, guardrail, policy].map(holderOf);
    const [rewardsAt, stakingAt, drepAt, guardrailAt, policyAt] = holders as [
      Utxo,
      Utxo,
      Utxo,
      Utxo,
      Utxo,
    ];
    const credentialOf = (native: NativeScript) => ({
      type: "SCRIPT" as const,
      value: resolveNativeScriptHash(native),
    });
    const action = { txHash: "c".repeat(64), index: 1 };
    const built = await builder().build(
      [
        withdrawal.native({
          rewardAddress: scriptHashToRewardAddress(
            resolveNativeScriptHash(rewards),
            0,
          ),
          amount: 0n,
          script: { reference: rewardsAt },
        }),
        certificate.stakeDelegation({
          stake: credentialOf(staking),
          pool: keyHashHex(17),
          witness: { native: { reference: stakingAt } },
        }),
        vote({
          voter: { drep: credentialOf(drep) },
          votes: [{ action, vote: "abstain" }],
          witness: { native: { reference: drepAt } },
        }),
        proposal.parameterChange({
          rewardAccount: keyHashToRewardAddress(keyHashHex(55), 0),
          anchor: { url: "https://example.com/p", dataHash: "d".repeat(64) },
          updates: { max_tx_size: 16384 },
          guardrail: { native: { reference: guardrailAt } },
        }),
        mint.native({
          script: { reference: policyAt },
          assets: { "01": 1n },
        }),
      ],
      { payer: payer(utxo(lovelace(ada(1000)))) },
    );
    expect(built.referenceInputs).toHaveLength(5);
    expect(built.signers.nativeScripts).toHaveLength(5);
    const withHolders = [...spentBy(built), ...built.referenceInputs];
    expectAgrees(built, withHolders);

    const signers = requiredSigners(built.tx, withHolders);
    // Only the payer's key: script credentials add none, nor do the keys their scripts name
    expect(signers.keyHashes).toEqual([paymentKey]);
    expect(signers.keys.map((k) => k.roles)).toEqual([["input"]]);
    // Without the reference inputs' UTxOs no script is listed, and nothing is thrown
    const without = requiredSigners(built.tx, spentBy(built));
    expect(without.nativeScripts).toEqual([]);
    expect(without.keyHashes).toEqual([paymentKey]);
    // Each script is listed only with its own holder
    const alone = holders.map(
      (holder) =>
        requiredSigners(built.tx, [...spentBy(built), holder]).nativeScripts,
    );
    for (const listed of alone) expect(listed).toHaveLength(1);
    expect(normalized({ ...signers, nativeScripts: alone.flat() })).toEqual(
      normalized(signers),
    );
  });

  it("reads a transaction that proposes a parameter change", async () => {
    const guardrail: NativeScript = { type: "sig", keyHash: keyHashHex(56) };
    const built = await builder().build(
      [
        proposal.parameterChange({
          rewardAccount: keyHashToRewardAddress(keyHashHex(57), 0),
          anchor: { url: "https://example.com/p", dataHash: "e".repeat(64) },
          updates: { max_tx_size: 16384, key_deposit: "2000000" },
          guardrail: { native: guardrail },
        }),
      ],
      { payer: payer(utxo(lovelace(ada(1000)))) },
    );
    expect(built.signers.nativeScripts).toHaveLength(1);
    expectAgrees(built);
    expect(requiredSigners(built.tx, spentBy(built)).keyHashes).toEqual([
      paymentKey,
    ]);
  });

  it("throws INVALID_OPTION at the call for a tx that is not a transaction", () => {
    for (const tx of ["zz", "00", "a0", 42 as unknown as string]) {
      let error: unknown;
      try {
        requiredSigners(tx, []);
      } catch (e) {
        error = e;
      }
      expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
      expect((error as TxBuildError<"INVALID_OPTION">).details.option).toBe(
        "tx",
      );
    }
  });

  it("throws INVALID_OPTION at the call for a spent that is not a list", async () => {
    const { tx } = await payment();
    // A value that may hold a text is named by its type
    for (const [spent, held] of [
      [undefined, undefined],
      [null, null],
      [{}, "object"],
    ]) {
      let error: unknown;
      try {
        requiredSigners(tx, spent as never);
      } catch (e) {
        error = e;
      }
      expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
      expect((error as TxBuildError<"INVALID_OPTION">).details).toEqual({
        option: "spent",
        value: held,
        allowed: "a list of UTxOs",
      });
    }
  });

  it("throws INVALID_OPTION for an entry of spent that is not a UTxO", async () => {
    const built = await payment();
    const thrown = (spent: unknown[]) => {
      let error: unknown;
      try {
        requiredSigners(built.tx, spent as never);
      } catch (e) {
        error = e;
      }
      expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
      return error as TxBuildError<"INVALID_OPTION">;
    };

    const nullEntry = thrown([null, ...built.inputs]);
    // Only the JavaScript type of the entry: an address in it may be a key given by mistake
    expect(nullEntry.details).toEqual({
      option: "spent",
      value: "null",
      allowed: "a list of UTxOs",
    });
    expect(nullEntry.cause).toBeInstanceOf(Error);

    // An address that cannot be read would drop the key that signs for the input
    for (const address of ["nope", 5]) {
      const [first, ...rest] = built.inputs;
      const mangled = { ...first!, address };
      const error = thrown([mangled, ...rest]);
      expect(error.details.value).toBe("object");
      expect(error.cause).toBeInstanceOf(Error);
    }

    expect(requiredSigners(built.tx, built.inputs)).toEqual(built.signers);
  });

  describe("the UTxOs given", () => {
    const native: NativeScript = {
      type: "any",
      scripts: [
        { type: "sig", keyHash: keyHashHex(33) },
        { type: "sig", keyHash: keyHashHex(34) },
      ],
    };

    it("must hold every input and collateral input", async () => {
      const scriptAddress = builder().scriptAddress(plutusScript);
      const built = await builder().build(
        [
          spend.plutus({
            utxo: utxo(lovelace(ada(10)), { datum: unitInline }, scriptAddress),
            script: plutusScript,
            redeemer: { data: mConStr0([]) },
          }),
        ],
        { payer: payer(utxo(lovelace(ada(50))), utxo(lovelace(ada(6)))) },
      );
      expectAgrees(built);
      const outRef = (u: UtxoInput) => {
        const { txHash, outputIndex } = toUtxo(u);
        return `${txHash}#${outputIndex}`;
      };
      for (const missing of [built.inputs[0]!, built.collateral!.inputs[0]!]) {
        const spent = spentBy(built).filter(
          (u) => outRef(u) !== outRef(missing),
        );
        const error = await buildError(
          () => requiredSigners(built.tx, spent),
          "UTXO_NOT_FOUND",
        );
        expect(error.details).toEqual({ input: ref(missing) });
      }
    });

    it("lists a native script held in a reference input only with its UTxO", async () => {
      const holder = utxo(lovelace(ada(20)), { script: nativeRefOf(native) });
      const built = await builder().build(
        [
          spend.native({
            utxo: utxo(lovelace(ada(10)), {}, builder().scriptAddress(native)),
            script: { reference: holder },
          }),
          output({ address: recipient, value: { lovelace: ada(15) } }),
        ],
        { payer: payer(utxo(lovelace(ada(50)))) },
      );
      expect(built.referenceInputs).toHaveLength(1);
      expect(built.signers.nativeScripts).toHaveLength(1);
      expectAgrees(built, [...spentBy(built), ...built.referenceInputs]);
      const without = requiredSigners(built.tx, spentBy(built));
      expect(without.nativeScripts).toEqual([]);
      expect(without.keyHashes).toEqual(built.signers.keyHashes);
    });

    it("ignores native scripts the transaction does not run, and UTxOs it does not use", async () => {
      const holder = utxo(lovelace(ada(20)), { script: nativeRefOf(native) });
      const built = await builder().build(
        [
          referenceInput({ utxo: holder }),
          output({ address: recipient, value: { lovelace: ada(15) } }),
        ],
        { payer: payer(utxo(lovelace(ada(50)))) },
      );
      const unused = utxo(lovelace(ada(1)), {}, baseAddress(9));
      const signers = requiredSigners(built.tx, [
        ...spentBy(built),
        holder,
        unused,
      ]);
      expect(signers.nativeScripts).toEqual([]);
      expect(signers).toEqual(requiredSigners(built.tx, spentBy(built)));
      expectAgrees(built);
    });

    /** `all` around a script `levels` times, by default one key, and `all` of `count` keys */
    const nestedCbor = (
      levels: number,
      inner = cbor.arr(cbor.uint(0), cbor.bytes(keyHashHex(35))),
    ) => "820181".repeat(levels) + inner;
    const keysCbor = (count: number, from = 100) =>
      `8201${cbor.head(4, count)}${Array.from({ length: count }, (_, i) =>
        cbor.arr(cbor.uint(0), cbor.bytes(keyHashHex(from + i))),
      ).join("")}`;
    /**
     * Native scripts whose keys are read, at any number of keys and nested no deeper than 512
     * levels as the walk counts them, `[0, script]` the first: `all` around a key 255 times
     * reaches 512; and those whose keys are not read
     */
    const shapes: [string, string, "keys" | "deep" | "unknown"][] = [
      ["nested 34 deep", nestedCbor(34), "keys"],
      ["of 190 keys", keysCbor(190), "keys"],
      [
        "15 KB of an all of 20 nested 250 deep",
        `8201${cbor.head(4, 20)}${nestedCbor(250).repeat(20)}`,
        "keys",
      ],
      ["nested 255 deep, 512 levels", nestedCbor(255), "keys"],
      [
        "nested 255 deep around all [], 513 levels",
        nestedCbor(255, cbor.arr(cbor.uint(1), cbor.arr())),
        "deep",
      ],
      ["nested 511 deep, 1 024 levels", nestedCbor(511), "deep"],
      ["nested 3 000 deep", nestedCbor(3_000), "deep"],
      // A well-formed item that is not a native script
      ["a byte string, not a native script", cbor.bytes("ab"), "unknown"],
    ];
    /** A UTxO holding the native script, given as bytes, and an output it locks */
    const heldScript = (native: string) => {
      const hash = cbor.blake(`00${native}`, 28);
      const holder = utxo(lovelace(ada(20)), {
        script: { type: "unknown", scriptRef: `8200${native}` },
      });
      const locked = utxo(
        lovelace(ada(10)),
        {},
        scriptHashToBech32(hash, undefined, 0),
      );
      return { hash, holder, locked };
    };
    const input = (u: Utxo) =>
      cbor.arr(cbor.bytes(u.txHash), cbor.uint(u.outputIndex));
    /** A transaction that spends these UTxOs and reads these, written by hand */
    const handTx = (spends: Utxo[], reads: Utxo[]) =>
      cbor.tx(
        cbor.map(
          [cbor.uint(0), cbor.tag258(cbor.arr(...spends.map(input)))],
          [
            cbor.uint(1),
            cbor.arr(
              cbor.map(
                [
                  cbor.uint(0),
                  cbor.bytes(Address.fromBech32(recipient).toBytes()),
                ],
                [cbor.uint(1), cbor.uint(3_000_000)],
              ),
            ),
          ],
          [cbor.uint(2), cbor.uint(200_000)],
          [cbor.uint(18), cbor.tag258(cbor.arr(...reads.map(input)))],
        ),
      );

    it("reads the keys of a native script a reference input holds from its bytes, at any number of keys and up to 512 levels: a spend and a mint through one build with its keys priced; one level deeper, and what is not a native script, are INVALID_SCRIPT at once", async () => {
      // 190 keys priced do not fit in a transaction: 120 stand for them
      const buildable: [string, string, "keys" | "deep" | "unknown"][] = [
        ["of 120 keys", keysCbor(120), "keys"],
        ...shapes.filter(([name]) => name !== "of 190 keys"),
      ];
      for (const [name, native, read] of buildable) {
        const { hash, holder, locked } = heldScript(native);
        expect([name, toUtxo(holder).script]).toEqual([
          name,
          read === "unknown"
            ? { type: "unknown", scriptRef: `8200${native}` }
            : { type: "native", cbor: native, hash },
        ]);
        // The keys it names, each `[0, key hash]`
        const named = [...native.matchAll(/8200581c([0-9a-f]{56})/g)].map(
          ([, keyHash]) => keyHash!,
        );
        for (const part of [
          () => spend.native({ utxo: locked, script: { reference: holder } }),
          () =>
            mint.native({
              script: { reference: holder },
              assets: { "01": 1n },
            }),
        ]) {
          const started = performance.now();
          let built: BuiltTxData | undefined;
          let error: unknown;
          try {
            built = await builder().build([part()], {
              payer: payer(utxo(lovelace(ada(50)))),
            });
          } catch (e) {
            error = e;
          }
          expect(performance.now() - started).toBeLessThan(
            read === "keys" ? 5_000 : 2_000,
          );
          if (read === "keys") {
            expect([name, error]).toEqual([name, undefined]);
            expect(built!.signers.nativeScripts).toHaveLength(1);
            // Every key the script names is priced and asked for
            const counted = new Set(countedKeys(built!.signers));
            expect(named.length).toBeGreaterThan(0);
            for (const keyHash of named)
              expect(counted.has(keyHash)).toBe(true);
          } else {
            expect([name, (error as { code?: string }).code]).toEqual([
              name,
              "INVALID_SCRIPT",
            ]);
            expect((error as Error).message).toContain(
              read === "deep"
                ? `${holder.txHash}#0 holds a native script whose keys this library does not read`
                : `${holder.txHash}#0 holds a reference script this library cannot read`,
            );
          }
        }
      }
    });

    it("lists a native script a reference input holds, for a transaction read whole, where its keys are read: at any number of keys and up to 512 levels, not one level deeper nor what is not a native script, and the transaction is read at once", async () => {
      for (const [name, native, read] of shapes) {
        const { holder, locked } = heldScript(native);
        const keyInput = utxo(lovelace(ada(50)));
        // It spends the key input and the script's output, and reads the holder
        const tx = handTx([keyInput, locked], [holder]);
        const spent = [keyInput, locked, holder];
        const started = performance.now();
        const signers = requiredSigners(tx, spent);
        const whole = await builder().fromCbor(tx, { knownUtxos: spent });
        expect(performance.now() - started).toBeLessThan(2_000);
        const listed = read === "keys" ? 1 : 0;
        expect([
          name,
          signers.nativeScripts.length,
          whole.signers.nativeScripts.length,
        ]).toEqual([name, listed, listed]);
        expect(whole.signers.keyHashes).toEqual(signers.keyHashes);
      }
    });

    it("reads the keys of no native script a reference input holds that the transaction does not run, its hash known without them: 12 reference inputs whose UTxOs hold 16 KB of keys each, as many as a node takes; of one the transaction runs, those of that one alone", async () => {
      const holders = Array.from(
        { length: 12 },
        (_, i) => heldScript(keysCbor(510, 1_000 + 510 * i)).holder,
      );
      expect(
        utxoModule.scriptSize(toUtxo(holders[0]!).script!),
      ).toBeGreaterThan(16_300);
      const keyInput = utxo(lovelace(ada(50)));
      const keysRead = jest.spyOn(utxoModule, "heldNativeScript");
      const idle = handTx([keyInput], holders);
      expect(
        requiredSigners(idle, [keyInput, ...holders]).nativeScripts,
      ).toEqual([]);
      await builder().fromCbor(idle, { knownUtxos: [keyInput, ...holders] });
      expect(keysRead).not.toHaveBeenCalled();
      const { locked } = heldScript(keysCbor(510, 1_000));
      const runs = handTx([keyInput, locked], holders);
      const signers = requiredSigners(runs, [keyInput, locked, ...holders]);
      expect(signers.nativeScripts).toHaveLength(1);
      expect(keysRead).toHaveBeenCalledTimes(1);
      keysRead.mockRestore();
    });
  });
});

/** A signer that records its calls and answers with `answer` */
const recording = (
  methods: readonly string[],
  answer: () => Promise<unknown>,
  extra: object = {},
) => {
  const calls: { method: string; args: unknown[] }[] = [];
  const signer = { ...extra } as Record<string, unknown>;
  for (const method of methods)
    signer[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return answer();
    };
  return { signer: signer as unknown as Signer, calls };
};

describe("signWitnesses", () => {
  let tx: string;
  let paymentSet: string;
  beforeAll(async () => {
    tx = (await payment()).tx;
    paymentSet = await paymentWitnesses(tx);
  });
  const keyHashes = ["ab".repeat(28)];

  it("calls the signer the way it takes a transaction, once", async () => {
    const both = recording(
      ["signTxWitnesses", "signTx"],
      async () => paymentSet,
    );
    await signWitnesses(both.signer, tx, keyHashes);
    expect(both.calls).toEqual([
      { method: "signTxWitnesses", args: [tx, keyHashes] },
    ]);
    await signWitnesses(both.signer, tx);
    expect(both.calls[1]).toEqual({ method: "signTxWitnesses", args: [tx] });

    for (const extra of [{ getUtxosHex: () => [] }, { _walletInstance: {} }]) {
      const mesh = recording(["signTx"], async () => paymentSet, extra);
      await signWitnesses(mesh.signer, tx, keyHashes);
      expect(mesh.calls).toEqual([
        { method: "signTx", args: [tx, true, false] },
      ]);
    }
    const cip30 = recording(["signTx"], async () => paymentSet);
    await signWitnesses(cip30.signer, tx, keyHashes);
    expect(cip30.calls).toEqual([{ method: "signTx", args: [tx, true] }]);
  });

  it("refuses a tx that is not a transaction before calling the signer", async () => {
    const stub = recording(["signTx"], async () => paymentSet);
    const error = await buildError(
      () => signWitnesses(stub.signer, "00"),
      "INVALID_OPTION",
    );
    expect(error.details.option).toBe("tx");
    expect(error.cause).toBeInstanceOf(Error);
    expect(stub.calls).toEqual([]);
  });

  it("checks the signer before tx", async () => {
    const error = await buildError(
      () => signWitnesses({} as Signer, "00"),
      "INVALID_OPTION",
    );
    expect(error.details.option).toBe("signer");
  });

  it.each([
    ["a set", new Set(keyHashes), "object", "a value of type object"],
    ["a text", keyHashes[0], "string", "a value of type string"],
    ["a list holding a number", [7], "object", "entry 0 is of type number"],
  ])(
    "refuses %s as keyHashes, naming only its type, before calling any signer",
    async (_, given, type, got) => {
      const wallet = recording(["signTxWitnesses"], async () => paymentSet);
      const hashes = hashSigner("object", () => []);
      for (const signer of [wallet.signer, hashes.signer]) {
        const error = await buildError(
          () => signWitnesses(signer, tx, given as never),
          "INVALID_OPTION",
        );
        expect(error.details).toEqual({
          option: "keyHashes",
          value: type,
          allowed: "a list of key hashes in hex",
        });
        expect(error.message).toContain(got);
      }
      expect(wallet.calls).toEqual([]);
      expect(hashes.requests).toEqual([]);
    },
  );

  it.each([
    ["an empty object", {}, "object"],
    ["undefined", undefined, "undefined"],
    ["null", null, "null"],
    ["an object holding only a key", { key: "secret".repeat(4) }, "object"],
  ])("refuses %s as signer, naming only its type", async (_, signer, type) => {
    const error = await buildError(
      () => signWitnesses(signer as unknown as Signer, tx),
      "INVALID_OPTION",
    );
    expect(error.details).toEqual({
      option: "signer",
      value: type,
      allowed:
        "an object with signTxWitnesses, signTxHash or signTx, or a function that signs a transaction hash",
    });
    expect(error.message).not.toContain("secret");
  });

  describe("the answer", () => {
    it('reads "" as the empty witness set', async () => {
      const stub = recording(["signTx"], async () => "");
      expect(await signWitnesses(stub.signer, tx)).toBe("a0");
    });

    it("keeps the witnesses of a witness set, and only those", async () => {
      const stub = recording(["signTx"], async () => paymentSet);
      const result = await signWitnesses(stub.signer, tx);
      expect(vkeysOfSet(result)).toEqual(vkeysOfSet(paymentSet));

      // A set that also carries a native script: entries 0 and 2 only
      const { vkey, signature } = firstVkeyWitness(paymentSet);
      const withScript = new CborWriter()
        .writeStartMap(3)
        .writeInt(0)
        .writeEncodedValue(
          Buffer.from(entry(await addWitnesses(tx, paymentSet), 0)!, "hex"),
        )
        .writeInt(1)
        .writeStartArray(1)
        .writeStartArray(2)
        .writeInt(0)
        .writeByteString(Buffer.from(keyHashHex(1), "hex"))
        .writeInt(2)
        .writeEncodedValue(
          Buffer.from(
            entry(
              await addWitnesses(tx, bootstrapWitnessSet(vkey, signature)),
              2,
            )!,
            "hex",
          ),
        )
        .encodeAsHex();
      const reduced = await signWitnesses(
        recording(["signTx"], async () => withScript).signer,
        tx,
      );
      const set = Serialization.TransactionWitnessSet.fromCbor(
        HexBlob(reduced),
      );
      expect(set.nativeScripts()).toBeUndefined();
      expect(vkeysOfSet(reduced)).toEqual([vkey]);
      expect(bootstrapsOfSet(reduced)).toEqual([vkey]);
    });

    it("keeps from a full transaction only the witnesses tx does not hold", async () => {
      const signedByStake = await addWitnesses(tx, await stakeWitnesses(tx));
      const full = await addWitnesses(signedByStake, paymentSet);
      const stub = recording(["signTx"], async () => full);
      const result = await signWitnesses(stub.signer, signedByStake);
      expect(vkeysOfSet(result)).toEqual(vkeysOfSet(paymentSet));
    });

    it.each([
      ["CBOR that is neither a map nor an array", "00"],
      ["text that is not hex", "zz"],
      ["a truncated map", "a10081"],
      ["a value that is not a string", 42],
    ])("refuses %s as SIGNER_FAILED", async (_, answer) => {
      const stub = recording(["signTx"], async () => answer);
      const error = await planError(
        () => signWitnesses(stub.signer, tx),
        "SIGNER_FAILED",
      );
      expect(error.details).toEqual({ reason: "error" });
      // The decoder's error is the cause
      expect(error.cause).toBeInstanceOf(Error);
    });

    it("does not filter the answer by keyHashes", async () => {
      const both = await addWitnesses(tx, paymentSet, await stakeWitnesses(tx));
      const twoKeys = witnessSetOf(both);
      for (const methods of [["signTx"], ["signTxWitnesses"]] as const) {
        const stub = recording([...methods], async () => twoKeys);
        const result = await signWitnesses(stub.signer, tx, [paymentKey]);
        expect(vkeysOfSet(result)).toHaveLength(2);
        expect(stub.calls[0]!.args).toEqual(
          methods[0] === "signTx" ? [tx, true] : [tx, [paymentKey]],
        );
      }
    });
  });

  describe("1.9 wallets", () => {
    it("MeshWallet: a witness set of its payment key, through either method", async () => {
      const result = await signWitnesses(wallets.payment, tx);
      expect(vkeysOfSet(result)).toEqual(vkeysOfSet(paymentSet));
      const released = {
        getUtxosHex: () => wallets.payment.getUtxosHex(),
        signTx: (t: string, partial?: boolean, full?: boolean) =>
          wallets.payment.signTx(t, partial, full),
      };
      const viaSignTx = await signWitnesses(released, tx);
      expect(vkeysOfSet(viaSignTx)).toEqual(vkeysOfSet(paymentSet));
    });

    it("BrowserWallet: the empty set for an empty answer, and vkey and bootstrap witnesses", async () => {
      const { vkey, signature } = firstVkeyWitness(paymentSet);
      const browser = (signTx: () => Promise<string>) =>
        new (
          BrowserWallet as unknown as new (
            api: object,
            name: string,
          ) => BrowserWallet
        )({ signTx }, "fake");

      const empty = browser(async () => "");
      expect(await empty.signTx(tx, true, false)).toBe(tx);
      expect(await signWitnesses(empty, tx)).toBe("a0");

      const answer = new CborWriter()
        .writeStartMap(2)
        .writeInt(0)
        .writeEncodedValue(
          Buffer.from(entry(await addWitnesses(tx, paymentSet), 0)!, "hex"),
        )
        .writeInt(2)
        .writeEncodedValue(
          Buffer.from(
            entry(
              await addWitnesses(tx, bootstrapWitnessSet(vkey, signature)),
              2,
            )!,
            "hex",
          ),
        )
        .encodeAsHex();
      const result = await signWitnesses(
        browser(async () => answer),
        tx,
      );
      expect(vkeysOfSet(result)).toEqual([vkey]);
      expect(bootstrapsOfSet(result)).toEqual([vkey]);
    });

    it("AppWallet: a witness set, though the wallet answers with a full transaction", async () => {
      const app = new AppWallet({
        networkId: 0,
        key: { type: "mnemonic", words },
      });
      await app.init();
      const result = await signWitnesses(app, tx);
      expect(result).not.toBe(tx);
      expect(result).toMatch(/^a1/);
      expect(vkeysOfSet(result)).toEqual(vkeysOfSet(paymentSet));
    });
  });

  describe("a failing signer", () => {
    const forms: [string, string[], object][] = [
      ["signTxWitnesses", ["signTxWitnesses"], {}],
      ["signTxHash", ["signTxHash"], {}],
      ["a Mesh wallet", ["signTx"], { getUtxosHex: () => [] }],
      ["a CIP-30 api", ["signTx"], {}],
    ];
    const failures: [string, unknown, TxPlanErrorCode, unknown][] = [
      ["UserDeclined", { code: 2, info: "no" }, "SIGN_DECLINED", undefined],
      [
        "AccountChange",
        { code: -4, info: "changed" },
        "SIGNER_FAILED",
        { reason: "accountChanged", walletCode: -4 },
      ],
      [
        "ProofGeneration",
        { code: 1, info: "x" },
        "SIGNER_FAILED",
        { reason: "error", walletCode: 1 },
      ],
      [
        "InternalError",
        { code: -2, info: "x" },
        "SIGNER_FAILED",
        { reason: "error", walletCode: -2 },
      ],
      [
        "a TxPlanError SIGN_DECLINED",
        new TxPlanError("SIGN_DECLINED", "no"),
        "SIGN_DECLINED",
        undefined,
      ],
      [
        "a TxPlanError of another code",
        new TxPlanError("MISSING_ID", "no"),
        "SIGNER_FAILED",
        { reason: "error" },
      ],
      ["an Error", new Error("x"), "SIGNER_FAILED", { reason: "error" }],
      ["a string", "x", "SIGNER_FAILED", { reason: "error" }],
    ];

    it.each(forms)("maps the errors of %s", async (_, methods, extra) => {
      for (const [, thrown, code, details] of failures) {
        const stub = recording(methods, () => Promise.reject(thrown), extra);
        const error = await planError(
          () => signWitnesses(stub.signer, tx),
          code,
        );
        expect(TxError.is(error, "SIGN_DECLINED", "SIGNER_FAILED")).toBe(true);
        expect(error.cause).toBe(thrown);
        expect(error.details).toEqual(details);
        expect(error.retryable).toBe(false);
        expect(error.planId).toBeUndefined();
        expect(error.txHash).toBeUndefined();
        expect(
          (error as unknown as Record<string, unknown>).plan,
        ).toBeUndefined();
        expect(
          (error as unknown as Record<string, unknown>).status,
        ).toBeUndefined();
        expect(stub.calls).toHaveLength(1);
      }
    });

    it("reads a CIP-30 error's info into the message", async () => {
      for (const [thrown, code, text] of [
        [
          { code: 2, info: "user declined" },
          "SIGN_DECLINED",
          "declined to sign: user declined (code 2)",
        ],
        [
          { code: -4, info: "account changed" },
          "SIGNER_FAILED",
          "the signer failed: account changed (code -4)",
        ],
        [
          { code: -2, message: "internal" },
          "SIGNER_FAILED",
          "the signer failed: internal (code -2)",
        ],
        [{ reason: "odd" }, "SIGNER_FAILED", '{"reason":"odd"}'],
      ] as const) {
        const stub = recording(["signTx"], () => Promise.reject(thrown), {});
        const error = await planError(
          () => signWitnesses(stub.signer, tx),
          code,
        );
        expect(error.message).toContain(text);
        expect(error.message).not.toContain("[object Object]");
      }
    });
  });
});

describe("signWitnesses with a signer of transaction hashes", () => {
  let tx: string;
  let txHash: string;
  let paymentSet: string;
  beforeAll(async () => {
    await Crypto.ready();
    tx = (await payment()).tx;
    txHash = txIdOf(tx);
    paymentSet = await paymentWitnesses(tx);
  });

  describe.each(["object", "callback"] as const)("as %s", (form) => {
    it("is asked with the body's hash, the keys in lower case, and the transaction", async () => {
      const key = testKey();
      const asked = hashSigner(form, (r) => [key.answer(r.txHash)]);
      const keyHashes = [key.keyHash.toUpperCase(), "ab".repeat(28)];
      const result = await signWitnesses(asked.signer, tx, keyHashes);

      expect(asked.requests).toHaveLength(1);
      const request = asked.requests[0]!;
      expect(request.txHash).toBe(txHash);
      expect(request.txHash).toBe(readTransaction(tx).txId);
      expect(request.keys).toEqual([
        { keyHash: key.keyHash, roles: [] },
        { keyHash: "ab".repeat(28), roles: [] },
      ]);
      expect("keyHashes" in request).toBe(false);
      expect(Object.isFrozen(request)).toBe(true);
      expect(Object.isFrozen(request.keys)).toBe(true);
      for (const entry of request.keys!) {
        expect(Object.isFrozen(entry)).toBe(true);
        expect(Object.isFrozen(entry.roles)).toBe(true);
      }
      expect(request.tx).toBe(tx);
      expect("signal" in request).toBe(false);
      // The list given is not the one handed on, and is left as it was
      expect(keyHashes[0]).toBe(key.keyHash.toUpperCase());

      expect(vkeysOfSet(result)).toEqual([key.vkey]);
      const signed = await addWitnesses(tx, result);
      expect(await signedKeyHashes(signed)).toEqual([key.keyHash]);
    });

    it("is asked without keys when no key hashes are given, and with the call's signal", async () => {
      const key = testKey();
      const asked = hashSigner(form, (r) => [key.answer(r.txHash)]);
      await signWitnesses(asked.signer, tx);
      expect("keys" in asked.requests[0]!).toBe(false);
      expect("keyHashes" in asked.requests[0]!).toBe(false);

      const signal = new AbortController().signal;
      const result = await askSigner(asked.signer, readTransaction(tx), {
        keys: [{ keyHash: key.keyHash, roles: ["input"] }],
        signal,
      });
      expect(asked.requests[1]!.signal).toBe(signal);
      expect(vkeysOfSet(result)).toEqual([key.vkey]);
    });

    it("is not asked when no key is left to sign", async () => {
      const asked = hashSigner(form, () => []);
      expect(await signWitnesses(asked.signer, tx, [])).toBe("a0");
      expect(asked.requests).toEqual([]);
    });

    it("reads an empty answer as the empty witness set", async () => {
      const asked = hashSigner(form, () => []);
      expect(await signWitnesses(asked.signer, tx, ["ab".repeat(28)])).toBe(
        "a0",
      );
      expect(asked.requests).toHaveLength(1);
    });

    it("keeps a key's signature once, and one of a key not asked for", async () => {
      const key = testKey();
      const other = testKey();
      const asked = hashSigner(form, (r) => [
        key.answer(r.txHash),
        key.answer(r.txHash),
        other.answer(r.txHash),
      ]);
      const result = await signWitnesses(asked.signer, tx, [key.keyHash]);
      expect(vkeysOfSet(result)).toEqual([key.vkey, other.vkey]);
    });

    it.each([
      ["a value that is not a list", () => ({})],
      ["null", () => null],
      ["a witness set", () => "a0"],
      ["an entry that is not an object", () => ["ab"]],
      [
        "an entry without a signature",
        (k: TestKey, h: string) => [{ vkey: k.vkey, h }],
      ],
      [
        "a vkey as bytes",
        (k: TestKey, h: string) => [
          { vkey: Buffer.from(k.vkey, "hex"), signature: k.sign(h) },
        ],
      ],
      [
        "a signature as bytes",
        (k: TestKey, h: string) => [
          { vkey: k.vkey, signature: Buffer.from(k.sign(h), "hex") },
        ],
      ],
      [
        "a vkey of 31 bytes",
        (k: TestKey, h: string) => [
          { vkey: k.vkey.slice(2), signature: k.sign(h) },
        ],
      ],
      [
        "a signature of another hash",
        (k: TestKey) => [{ vkey: k.vkey, signature: k.sign("cd".repeat(32)) }],
      ],
      [
        "a signature of the hash's hex text",
        (k: TestKey, h: string) => [
          {
            vkey: k.vkey,
            signature: k.sign(Buffer.from(h, "utf8").toString("hex")),
          },
        ],
      ],
      [
        "another key's vkey",
        (k: TestKey, h: string) => [
          { vkey: testKey().vkey, signature: k.sign(h) },
        ],
      ],
      [
        "a good signature followed by one that does not verify",
        (k: TestKey, h: string) => [
          k.answer(h),
          { vkey: k.vkey, signature: k.sign("cd".repeat(32)) },
        ],
      ],
    ])("refuses %s as SIGNER_FAILED", async (_, answer) => {
      const key = testKey();
      const asked = hashSigner(form, (r) =>
        (answer as (k: TestKey, h: string) => unknown)(key, r.txHash),
      );
      const error = await planError(
        () => signWitnesses(asked.signer, tx, [key.keyHash]),
        "SIGNER_FAILED",
      );
      expect(error.details).toEqual({ reason: "error" });
      expect(error.cause).toBeUndefined();
      expect(asked.requests).toHaveLength(1);
    });

    it("declines on a TxPlanError SIGN_DECLINED or a CIP-30 code 2, and fails on anything else", async () => {
      const declined = new TxPlanError("SIGN_DECLINED", "the operator said no");
      for (const [thrown, code] of [
        [declined, "SIGN_DECLINED"],
        [{ code: 2, info: "no" }, "SIGN_DECLINED"],
        [new Error("down"), "SIGNER_FAILED"],
        ["down", "SIGNER_FAILED"],
      ] as const) {
        const asked = hashSigner(form, () => Promise.reject(thrown));
        const error = await planError(
          () => signWitnesses(asked.signer, tx, ["ab".repeat(28)]),
          code,
        );
        expect(error.cause).toBe(thrown);
        if (code === "SIGNER_FAILED")
          expect(error.details).toEqual({ reason: "error" });
      }
      // A new error: the signer's own is left as it was thrown
      const error = await planError(
        () =>
          signWitnesses(
            hashSigner(form, () => Promise.reject(declined)).signer,
            tx,
            ["ab".repeat(28)],
          ),
        "SIGN_DECLINED",
      );
      expect(error).not.toBe(declined);
      expect(error.message).toContain("the operator said no");
      expect(declined.message).toBe("the operator said no");
    });

    it("fails on a signer that throws at once", async () => {
      const thrown = new Error("thrown at once");
      let calls = 0;
      // Throws during the call itself, before any promise exists
      const throwing = () => {
        calls++;
        throw thrown;
      };
      const signer: Signer =
        form === "object"
          ? { signTxHash: throwing as TxHashSigner["signTxHash"] }
          : (throwing as SignTxHash);
      const error = await planError(
        () => signWitnesses(signer, tx, ["ab".repeat(28)]),
        "SIGNER_FAILED",
      );
      expect(calls).toBe(1);
      expect(error.cause).toBe(thrown);
      expect(error.details).toEqual({ reason: "error" });
    });

    it.each([
      [
        "an entry whose vkey getter throws",
        (k: TestKey, h: string, thrown: unknown) => [
          {
            get vkey(): string {
              throw thrown;
            },
            signature: k.sign(h),
          },
        ],
      ],
      [
        "a list whose reading throws",
        (_k: TestKey, _h: string, thrown: unknown) =>
          // Not a thenable, so the signer's promise resolves to it
          new Proxy([], {
            get(_target, name) {
              if (name === "then") return undefined;
              throw thrown;
            },
          }),
      ],
    ])(
      "refuses %s as SIGNER_FAILED, without what was thrown",
      async (_, answer) => {
        const key = testKey();
        for (const thrown of [
          new Error("thrown while read"),
          new TxPlanError("SIGN_DECLINED", "thrown while read"),
        ]) {
          const asked = hashSigner(form, (r) => answer(key, r.txHash, thrown));
          const error = await planError(
            () => signWitnesses(asked.signer, tx, [key.keyHash]),
            "SIGNER_FAILED",
          );
          expect(error).not.toBe(thrown);
          expect(error.details).toEqual({ reason: "error" });
          expect(error.cause).toBeUndefined();
          expect(error.message.includes("thrown while read")).toBe(false);
          // The thrown error is left as it was
          expect(thrown.message).toBe("thrown while read");
        }
      },
    );

    it("reads the answer by index, never through its own methods", async () => {
      const key = testKey();
      const asked = hashSigner(form, (r) => {
        const list = [key.answer(r.txHash)];
        for (const name of ["entries", "values", Symbol.iterator] as const)
          Object.defineProperty(list, name, {
            value: () => {
              throw new Error("not to be called");
            },
          });
        return list;
      });
      const result = await signWitnesses(asked.signer, tx, [key.keyHash]);
      expect(vkeysOfSet(result)).toEqual([key.vkey]);
    });
  });

  it("calls the callback form without a this, and signTxHash on its object", async () => {
    const callback = hashSigner("callback", () => []);
    await signWitnesses(callback.signer, tx, ["ab".repeat(28)]);
    expect(callback.self).toEqual([undefined]);
    const object = hashSigner("object", () => []);
    await signWitnesses(object.signer, tx, ["ab".repeat(28)]);
    expect(object.self).toEqual([object.signer]);
  });

  it("tells the forms apart by their methods: signTxWitnesses, signTxHash, then signTx", async () => {
    const key = testKey();
    const calls: string[] = [];
    const method = (name: string, answer: () => unknown) => async () => {
      calls.push(name);
      return answer();
    };
    const witnesses = method("signTxWitnesses", () => paymentSet);
    const hash = method("signTxHash", () => [key.answer(txHash)]);
    const signTx = method("signTx", () => paymentSet);

    const cases: [unknown, string][] = [
      [
        { signTxWitnesses: witnesses, signTxHash: hash, signTx },
        "signTxWitnesses",
      ],
      [{ signTxHash: hash, signTx }, "signTxHash"],
      [{ signTx }, "signTx"],
      [
        Object.assign(
          method("callback", () => []),
          { signTxHash: hash },
        ),
        "signTxHash",
      ],
      [
        Object.assign(
          method("callback", () => []),
          { signTx },
        ),
        "signTx",
      ],
      [
        Object.assign(
          method("callback", () => []),
          { signTxHash: "no" },
        ),
        "callback",
      ],
    ];
    for (const [signer, called] of cases) {
      calls.length = 0;
      await signWitnesses(signer as Signer, tx, [key.keyHash]);
      expect(calls).toEqual([called]);
    }
  });

  it("is a signer only by its methods: other values are refused, naming only their type", async () => {
    for (const [value, type] of [
      [{ signTxHash: "not a function" }, "object"],
      ["ab".repeat(32), "string"],
      [[async () => []], "object"],
    ] as const) {
      const error = await buildError(
        () => signWitnesses(value as unknown as Signer, tx),
        "INVALID_OPTION",
      );
      expect(error.details.value).toBe(type);
    }
  });
});

/** The witness set of a transaction, in hex */
const witnessSetOf = (tx: string) => topItems(tx)[1]!;

describe("askedKeys", () => {
  const [a, b, c, d] = [1, 2, 3, 4].map((n) => keyHashHex(n));
  const sig = (keyHash: string) => ({
    type: "SCRIPT_PUBKEY" as const,
    value: { addr_keyhash: keyHash },
  });
  const signers: Pick<TxSigners, "keys" | "nativeScripts"> = {
    keys: [
      { keyHash: a!, roles: ["input", "guard"] },
      { keyHash: b!, roles: ["certificate"] },
    ],
    nativeScripts: [
      {
        type: "SCRIPT_ALL",
        value: {
          native_scripts: [
            sig(c!),
            sig(b!),
            {
              type: "SCRIPT_N_OF_K",
              value: { n: 1n, native_scripts: [sig(d!), sig(c!)] },
            },
          ],
        },
      },
      { type: "SCRIPT_ANY", value: { native_scripts: [sig(b!)] } },
    ],
  };

  it("lists the required keys with their roles, then the keys only native scripts name", () => {
    expect(askedKeys(signers)).toEqual([
      { keyHash: a, roles: ["input", "guard"] },
      { keyHash: b, roles: ["certificate", "nativeScript"] },
      { keyHash: c, roles: ["nativeScript"] },
      { keyHash: d, roles: ["nativeScript"] },
    ]);
    // The keys the fee counts are their hashes
    expect(countedKeys(signers)).toEqual([a, b, c, d]);
    // The roles given are not changed
    expect(signers.keys[1]!.roles).toEqual(["certificate"]);
  });

  it("is the required keys alone without native scripts, and empty for none", () => {
    expect(askedKeys({ keys: signers.keys, nativeScripts: [] })).toEqual(
      signers.keys,
    );
    expect(askedKeys({ keys: [], nativeScripts: [] })).toEqual([]);
  });

  it("lists a key named in upper case once, in lower case, as a witness names it", () => {
    const upper: Pick<TxSigners, "keys" | "nativeScripts"> = {
      keys: [
        { keyHash: a!, roles: ["input"] },
        { keyHash: b!.toUpperCase(), roles: ["guard"] },
        { keyHash: b!, roles: ["certificate"] },
      ],
      nativeScripts: [
        {
          type: "SCRIPT_ALL",
          value: {
            native_scripts: [sig(a!.toUpperCase()), sig(c!.toUpperCase())],
          },
        },
        sig(c!),
      ],
    };
    expect(askedKeys(upper)).toEqual([
      { keyHash: a, roles: ["input", "nativeScript"] },
      { keyHash: b, roles: ["certificate", "guard"] },
      { keyHash: c, roles: ["nativeScript"] },
    ]);
    expect(countedKeys(upper)).toEqual([a, b, c]);
  });
});

describe("askSigner with asked keys", () => {
  let tx: string;
  let paymentSet: string;
  beforeAll(async () => {
    await Crypto.ready();
    tx = (await payment()).tx;
    paymentSet = await paymentWitnesses(tx);
  });
  const keys: AskedKey[] = [
    { keyHash: "ab".repeat(28), roles: ["input", "nativeScript"] },
    { keyHash: "cd".repeat(28), roles: ["nativeScript"] },
  ];

  it("hands a wallet the hashes of the keys, and a signer of hashes the keys with their roles", async () => {
    const wallet = recording(["signTxWitnesses"], async () => paymentSet);
    await askSigner(wallet.signer, readTransaction(tx), { keys });
    expect(wallet.calls).toEqual([
      {
        method: "signTxWitnesses",
        args: [tx, ["ab".repeat(28), "cd".repeat(28)]],
      },
    ]);

    for (const form of ["object", "callback"] as const) {
      const asked = hashSigner(form, () => []);
      await askSigner(asked.signer, readTransaction(tx), { keys });
      const request = asked.requests[0]!;
      expect(request.keys).toEqual(keys);
      // A frozen copy: the signer changes nothing the caller holds
      expect(request.keys).not.toBe(keys);
      expect(request.keys![0]).not.toBe(keys[0]);
      expect(request.keys![0]!.roles).not.toBe(keys[0]!.roles);
      expect(Object.isFrozen(request.keys![0]!.roles)).toBe(true);
      expect(Object.isFrozen(keys)).toBe(false);
    }
  });
});

describe("types", () => {
  it("compile as declared", async () => {
    const meshWallet: Signer = wallets.payment;
    const cip30 = {} as Cip30WalletApi;
    const fromCip30: Signer = cip30;
    const browser: Signer = {} as BrowserWallet;
    const withWitnesses: Signer = {
      signTxWitnesses: async () => "a0",
    };
    const ofHashes: TxHashSigner = {
      signTxHash: async ({ txHash, keys, tx, signal }) => {
        void [txHash, keys, tx, signal];
        return [];
      },
    };
    const callback: SignTxHash = async (request) =>
      request.keys === undefined ? [] : [];
    const roles: SignTxHash = async ({ keys }) =>
      (keys ?? []).some(({ roles }) => roles.includes("nativeScript"))
        ? []
        : [];
    // @ts-expect-error: the request names its keys in keys, with their roles
    const oldList: SignTxHash = async ({ keyHashes }) => (void keyHashes, []);
    const pushes: SignTxHash = async ({ keys }) => {
      // @ts-expect-error: the roles of an asked key are read only
      keys![0]!.roles.push("guard");
      return [];
    };
    // @ts-expect-error: a role is a SignerRole or "nativeScript"
    const unknownRole: AskedKey = { keyHash: "", roles: ["script"] };
    void [roles, oldList, pushes, unknownRole];
    const signers: Signer[] = [ofHashes, callback, async () => []];
    // @ts-expect-error: a signer of hashes answers with signatures, not a witness set
    const witnessSetCallback: Signer = async () => "a0";
    // @ts-expect-error: the request is read only
    const writes: SignTxHash = async (request) => ((request.txHash = ""), []);
    void [meshWallet, fromCip30, browser, withWitnesses, signers];
    void [witnessSetCallback, writes];

    // @ts-expect-error: no such code
    const noSigner: TxPlanErrorCode = "NO_SIGNER";
    // @ts-expect-error: no such code
    const notWitnessSet: TxPlanErrorCode = "NOT_A_WITNESS_SET";
    // @ts-expect-error: an aborted signal is ABORTED, not a reason
    const aborted: TxPlanErrorDetails["SIGNER_FAILED"]["reason"] = "aborted";
    void [noSigner, notWitnessSet, aborted];

    const built = await payment();
    const { tx } = built;
    const added: Promise<string> = addWitnesses(tx);
    const signed: Promise<string[]> = signedKeyHashes(tx);
    const witnesses: Promise<string> = signWitnesses(withWitnesses, tx);
    const required: TxSigners = requiredSigners(tx, spentBy(built));
    await Promise.all([added, signed, witnesses]);
    expect(required.keyHashes).toEqual([paymentKey]);
  });
});

/* Types the package does not export */
// @ts-expect-error: the package has no SignedTx
export type NoSignedTx = import("../../src").SignedTx;
// @ts-expect-error: the package has no SentTx
export type NoSentTx = import("../../src").SentTx;
// @ts-expect-error: the package has no SubmitOptions
export type NoSubmitOptions = import("../../src").SubmitOptions;

describe("TxBuilder", () => {
  it("has no sign, submit, awaitTx or send", () => {
    const instance = builder();
    for (const name of ["sign", "submit", "awaitTx", "send"]) {
      expect(name in TxBuilder.prototype).toBe(false);
      expect(name in instance).toBe(false);
    }
    expect(publicApi).not.toHaveProperty("TxSignError");
    expect(publicApi).not.toHaveProperty("TxSubmitError");
  });
});
