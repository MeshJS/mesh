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
  CborReader,
  CborWriter,
  HexBlob,
  keyHashToRewardAddress,
  scriptHashToRewardAddress,
  Serialization,
  toNativeScript,
  Transaction,
  transactionPrototypeToHex,
  TxCBOR,
} from "@meshsdk/core-cst";
import { AppWallet, BrowserWallet, MeshWallet } from "@meshsdk/wallet";

import * as publicApi from "../../src";
import {
  addWitnesses,
  Assets,
  BuiltTx,
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
  signWitnesses,
  spend,
  toUtxo,
  TxBuilder,
  TxBuildError,
  TxError,
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
import {
  alwaysSucceedCbor,
  baseAddress,
  keyHashHex,
  vrfKeyHashHex,
} from "../test-util";
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

/** `TxSigners` without labels, every list sorted, to compare two of them */
const normalized = (signers: TxSigners) => {
  const json = (v: unknown) => JSON.stringify(v);
  return {
    keyHashes: [...signers.keyHashes].sort(),
    keys: signers.keys
      .map((k) => ({
        keyHash: k.keyHash,
        neededBy: k.neededBy
          .map(({ part, role }) => ({ part, role }))
          .sort((a, b) => json(a).localeCompare(json(b))),
      }))
      .sort((a, b) => a.keyHash.localeCompare(b.keyHash)),
    byronAddresses: [...signers.byronAddresses].sort(),
    nativeScripts: [...signers.nativeScripts].sort((a, b) =>
      json(a).localeCompare(json(b)),
    ),
  };
};
/** The UTxOs of a built transaction's inputs and collateral */
const spentBy = (built: BuiltTx) => [
  ...built.inputs,
  ...(built.collateral?.inputs ?? []),
];
const expectAgrees = (built: BuiltTx, spent = spentBy(built)) =>
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
    const full = await wallets.payment.signTx(tx, true);
    expect(topItems(full)[2]).toBe("f5");
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
      expect(error.details).toEqual({
        option: "tx",
        value: tx,
        allowed: "a transaction in CBOR hex",
      });
      // Hex is handed to the decoder, whose error is the cause
      if (tx === "00" || tx === "a0") expect(error.cause).toBeInstanceOf(Error);
      else expect(error.cause).toBeUndefined();
    }
  });
});

describe("requiredSigners", () => {
  const neededBy = (signers: TxSigners, keyHash: string) =>
    signers.keys.find((k) => k.keyHash === keyHash)?.neededBy;
  const hasNoLabel = (signers: TxSigners) =>
    signers.keys.every((k) => k.neededBy.every((n) => !("label" in n)));

  it("names each key with the part kind and role that need it", async () => {
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
    expect(neededBy(signers, keyOf(spender))).toEqual([
      { part: "spend", role: "input" },
    ]);
    expect(neededBy(signers, keyOf(collateralOwner))).toEqual([
      { part: "collateral", role: "collateral" },
    ]);
    // As the build reports it until the part is renamed
    expect(neededBy(signers, keyHashHex(10))).toEqual([
      { part: "guard", role: "guard" },
    ]);
    expect(neededBy(built.signers, keyHashHex(10))).toEqual([
      { part: "guard", label: "approver", role: "guard" },
    ]);
    expect(neededBy(signers, keyHashHex(11))).toEqual([
      { part: "withdrawal", role: "withdrawal" },
    ]);
    expect(neededBy(signers, keyHashHex(12))).toEqual([
      { part: "certificate", role: "certificate" },
    ]);
    expect(neededBy(signers, keyHashHex(13))).toEqual([
      { part: "certificate", role: "certificate" },
    ]);
    expect(neededBy(signers, keyHashHex(14))).toEqual([
      { part: "certificate", role: "poolOwner" },
    ]);
    expect(neededBy(signers, keyHashHex(15))).toEqual([
      { part: "vote", role: "vote" },
    ]);
    // A stake registration without its deposit takes no witness
    expect(signers.keyHashes).not.toContain(keyHashHex(18));
    expect(hasNoLabel(signers)).toBe(true);
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
      expect(neededBy(signers, keyHash)).toEqual([
        { part: "vote", role: "vote" },
      ]);
    for (const keyHash of [keyHashHex(42), keyHashHex(43), keyHashHex(45)])
      expect(neededBy(signers, keyHash)).toEqual([
        { part: "certificate", role: "certificate" },
      ]);
    // The hot credential authorised does not sign
    expect(signers.keyHashes).not.toContain(keyHashHex(44));
    expect(hasNoLabel(signers)).toBe(true);
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
    expect(signers.keys.map((k) => k.neededBy)).toEqual([
      [{ part: "spend", role: "input" }],
    ]);
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
    for (const spent of [undefined, null, {}]) {
      let error: unknown;
      try {
        requiredSigners(tx, spent as never);
      } catch (e) {
        error = e;
      }
      expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
      expect((error as TxBuildError<"INVALID_OPTION">).details).toEqual({
        option: "spent",
        value: spent,
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
    expect(nullEntry.details).toEqual({
      option: "spent",
      value: null,
      allowed: "a list of UTxOs",
    });
    expect(nullEntry.cause).toBeInstanceOf(Error);

    // An address that cannot be read would drop the key that signs for the input
    for (const address of ["nope", 5]) {
      const [first, ...rest] = built.inputs;
      const mangled = { ...first!, address };
      const error = thrown([mangled, ...rest]);
      expect(error.details.value).toBe(mangled);
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
      allowed: "an object with signTxWitnesses or signTx",
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

/** The witness set of a transaction, in hex */
const witnessSetOf = (tx: string) => topItems(tx)[1]!;

describe("types", () => {
  it("compile as declared", async () => {
    const meshWallet: Signer = wallets.payment;
    const cip30 = {} as Cip30WalletApi;
    const fromCip30: Signer = cip30;
    const browser: Signer = {} as BrowserWallet;
    const withWitnesses: Signer = {
      signTxWitnesses: async () => "a0",
    };
    void [meshWallet, fromCip30, browser, withWitnesses];

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
