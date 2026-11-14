import { randomBytes } from "node:crypto";

import {
  Action,
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
  resolveNativeScriptHash,
  serializeAddressObj,
} from "@meshsdk/core";
import {
  Address,
  Crypto,
  HexBlob,
  keyHashToRewardAddress,
  toNativeScript,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

import type { AskedKey } from "../../src/tx-builder";
import {
  BuiltTx,
  BuiltTxData,
  BuiltTxJSON,
  certificate,
  collateral,
  collateralReturn,
  guard,
  keySigner,
  mint,
  output,
  OutputScript,
  Signer,
  spend,
  TxBuilder,
  TxBuilderOptions,
  TxPlanError,
  Utxo,
  UtxoInput,
  validity,
  vote,
  withdrawal,
} from "../../src/tx-builder";
import { plainUtxo } from "../../src/tx-builder/parts/utxo";
import { decodeBuilt, encodeBuilt } from "../../src/tx-builder/plan/json";
import {
  readTransaction,
  readWitnessArgument,
} from "../../src/tx-builder/sign";
import { alwaysSucceedCbor, baseAddress, keyHashHex } from "../test-util";
import * as cbor from "./cbor-util";
import { hashSigner, keysSigner, TestKey, testKey } from "./hash-signer-util";

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const deposits = { drepDeposit: 500_000_000n, govActionDeposit: 1_000_000n };
const recipient = baseAddress(2);
const ada = (n: number) => BigInt(n) * 1_000_000n;
const BYRON = "Ae2tdPwUPEZ4YjgvykNpoFeYUxoyhNj2kg8KfKWN2FizsSpLUPv68MpTVDo";

const TAGS: Action["tag"][] = [
  "SPEND",
  "MINT",
  "CERT",
  "REWARD",
  "VOTE",
  "PROPOSE",
];
/** Prices every redeemer of a transaction at fixed units */
const fakeEvaluator: IEvaluator = {
  evaluateTx: async (tx) =>
    (
      Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ?? []
    ).map((r) => ({
      tag: TAGS[r.tag()]!,
      index: Number(r.index()),
      budget: { mem: 1000, steps: 2000 },
    })),
};
const plutus = { code: alwaysSucceedCbor, version: "V3" as const };
const redeemer = { data: mConStr0([]) };

/** A builder without a provider: nothing is read */
const offline = (
  network: "preprod" | "mainnet" = "preprod",
  extra: Partial<TxBuilderOptions> = {},
) =>
  new TxBuilder({
    network,
    params,
    costModels,
    evaluator: fakeEvaluator,
    deposits,
    ...extra,
  });

let nextHash = 0;
const utxoAt = (address: string, lovelace = ada(100)): Utxo => ({
  txHash: (++nextHash).toString(16).padStart(64, "d"),
  outputIndex: 0,
  address,
  value: { lovelace },
});

/** The UTxO of input `TX_IN#index` of a hand-made body */
const handUtxo = (address: string, outputIndex = 0, lovelace = ada(10)) => ({
  txHash: cbor.TX_IN,
  outputIndex,
  address,
  value: { lovelace },
});

/** A preprod enterprise address of a key, in hex */
const addressHex = (key: { keyHash: string }, network: 0 | 1 = 0) =>
  `${network === 0 ? "60" : "61"}${key.keyHash}`;
/** The same address in bech32 */
const addressOf = (key: { keyHash: string }, network: 0 | 1 = 0) =>
  serializeAddressObj(pubKeyAddress(key.keyHash), network);

/** A bootstrap witness of a key over a transaction hash */
const bootstrapWitness = (key: TestKey, txHash: string) =>
  cbor.arr(
    cbor.bytes(key.vkey),
    cbor.bytes(key.sign(txHash)),
    cbor.bytes("00".repeat(32)),
    cbor.bytes("a0"),
  );

/** The form a key-witness list is written in */
type ListForm = "tagged" | "plain" | "indefinite";
const list = (form: ListForm, ...items: string[]) =>
  form === "tagged"
    ? cbor.tag258(cbor.arr(...items))
    : form === "plain"
      ? cbor.arr(...items)
      : cbor.arrIndef(...items);

/** The rejection of a promise, or the throw of a call */
const caught = async (run: () => unknown): Promise<any> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
};

/** The public keys of a transaction's vkey and bootstrap witnesses */
const keysOf = (tx: string) => {
  const { vkeys, bootstraps } = readTransaction(tx).witnessSet;
  return {
    vkeys: (vkeys?.witnesses ?? []).map((w) => w.vkey),
    bootstraps: (bootstraps?.witnesses ?? []).map((w) => w.vkey),
  };
};

/** Whether every vkey and bootstrap witness of a transaction verifies against a hash */
const allVerify = (tx: string, txHash: string) => {
  const { vkeys, bootstraps } = readTransaction(tx).witnessSet;
  return [...(vkeys?.witnesses ?? []), ...(bootstraps?.witnesses ?? [])].every(
    (w) =>
      Crypto.Ed25519PublicKey.fromHex(
        w.vkey as Crypto.Ed25519PublicKeyHex,
      ).verify(
        Crypto.Ed25519Signature.fromHex(
          w.signature as Crypto.Ed25519SignatureHex,
        ),
        HexBlob(txHash),
      ),
  );
};

const throughText = (built: BuiltTx) =>
  JSON.parse(JSON.stringify(built)) as BuiltTxJSON;

/** The UTxOs a build's transaction names: of its inputs, reference inputs and collateral */
const namedBy = (built: BuiltTxData): Utxo[] => [
  ...built.inputs,
  ...built.referenceInputs,
  ...(built.collateral?.inputs ?? []),
];

/** What a transaction made by `fromCbor` and the build that made it have alike */
const viewOf = (built: BuiltTxData) => {
  const sorted = <T>(items: readonly T[]) =>
    [...items].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  return {
    tx: built.tx,
    txHash: built.txHash,
    fee: built.fee,
    exUnits: built.exUnits,
    redeemers: built.redeemers.map(({ part: _p, label: _l, ...rest }) => rest),
    inputs: built.inputs.map(plainUtxo),
    referenceInputs: built.referenceInputs.map(plainUtxo),
    outputs: built.outputs.map(plainUtxo),
    collateral: built.collateral && {
      inputs: built.collateral.inputs.map(plainUtxo),
      total: built.collateral.total,
      return: built.collateral.return && plainUtxo(built.collateral.return),
    },
    validity: built.validity,
    network: built.network,
    signers: {
      keys: sorted(built.signers.keys),
      keyHashes: sorted(built.signers.keyHashes),
      byronAddresses: sorted(built.signers.byronAddresses),
      nativeScripts: sorted(built.signers.nativeScripts),
    },
  };
};

/** A native script as an output holds it for reference */
const nativeRefOf = (script: NativeScript): OutputScript => ({
  type: "native",
  cbor: toNativeScript(script).toCbor().toString(),
  hash: resolveNativeScriptHash(script),
});

/* Builds of this builder, each a transaction of a kind */

/**
 * A Plutus spend with a mint and a withdrawal of the script, collateral with a return, and an
 * output the script's lovelace does not cover: inputs are selected, and change is returned
 */
const plutusSpend = async () => {
  await Crypto.ready();
  const payer = testKey();
  const b = offline();
  const built = await b.build(
    [
      spend.plutus({
        utxo: {
          ...utxoAt(b.scriptAddress(plutus), ada(10)),
          datum: { type: "inline", data: { type: "CBOR", content: "d87980" } },
        },
        script: plutus,
        redeemer,
        label: "unlock",
      }),
      mint.plutus({ script: plutus, redeemer, assets: { abcd: 1n } }),
      withdrawal.plutus({ amount: 0n, script: plutus, redeemer }),
      output({
        address: recipient,
        value: { lovelace: ada(20) },
        label: "pay",
      }),
      validity({ invalidHereafter: 90_000_000 }),
    ],
    {
      payer: {
        changeAddress: payer.address,
        utxos: [utxoAt(payer.address), utxoAt(payer.address, ada(5))],
      },
    },
  );
  return { built, payer, builder: b };
};

/** A native script and a Byron address spent from, on mainnet */
const nativeAndByron = async () => {
  await Crypto.ready();
  const payer = testKey();
  const scriptKey = testKey();
  const native: NativeScript = {
    type: "all",
    scripts: [
      { type: "sig", keyHash: scriptKey.keyHash },
      { type: "after", slot: "1000" },
    ],
  };
  const shelley = addressOf(payer, 1);
  const b = offline("mainnet");
  const built = await b.build(
    [
      spend.native({
        utxo: utxoAt(b.scriptAddress(native), ada(2)),
        script: native,
      }),
      spend.pubKey({ utxo: utxoAt(BYRON, ada(5)) }),
      output({ address: shelley, value: { lovelace: ada(10) } }),
      validity({ invalidBefore: 2_000 }),
    ],
    { payer: { changeAddress: shelley, utxos: [utxoAt(shelley)] } },
  );
  return { built, payer, scriptKey, builder: b };
};

/** A native script read from a reference input, and a guard key */
const nativeByReference = async () => {
  await Crypto.ready();
  const payer = testKey();
  const scriptKey = testKey();
  const guardKey = testKey();
  const native: NativeScript = { type: "sig", keyHash: scriptKey.keyHash };
  const b = offline();
  const holder: Utxo = {
    ...utxoAt(payer.address, ada(20)),
    script: nativeRefOf(native),
  };
  const built = await b.build(
    [
      spend.native({
        utxo: utxoAt(b.scriptAddress(native), ada(10)),
        script: { reference: holder },
      }),
      guard.pubKey({ keyHash: guardKey.keyHash }),
      output({ address: recipient, value: { lovelace: ada(15) } }),
    ],
    { payer: { changeAddress: payer.address, utxos: [utxoAt(payer.address)] } },
  );
  return { built, payer, scriptKey, guardKey, builder: b };
};

/** A stake delegation with a withdrawal */
const certificateAndWithdrawal = async () => {
  await Crypto.ready();
  const payer = testKey();
  const b = offline();
  const built = await b.build(
    [
      certificate.stakeDelegation({
        stake: keyHashToRewardAddress(keyHashHex(12), 0),
        pool: keyHashHex(17),
      }),
      withdrawal.pubKey({
        rewardAddress: keyHashToRewardAddress(keyHashHex(11), 0),
        amount: 0n,
      }),
    ],
    { payer: { changeAddress: payer.address, utxos: [utxoAt(payer.address)] } },
  );
  return { built, payer, builder: b };
};

const BUILDS: [
  string,
  () => Promise<{ built: BuiltTx; builder: TxBuilder }>,
][] = [
  ["a Plutus spend with a mint and a withdrawal", plutusSpend],
  ["a native script with a Byron address", nativeAndByron],
  [
    "a native script read from a reference input with a guard",
    nativeByReference,
  ],
  ["a certificate with a withdrawal", certificateAndWithdrawal],
];

/** The object of a build's transaction, its UTxOs given */
const fromBuild = (built: BuiltTxData, b: TxBuilder, tx = built.tx) =>
  b.fromCbor(tx, { knownUtxos: namedBy(built) });

/* Hand-made transactions */

/**
 * A hand-made preprod payment from `TX_IN#0` at the address of `key`, in the body form asked for
 * @param witnessSet The witness set, made from the body's hash
 */
const handPayment = (
  form: cbor.BodyForm,
  key: TestKey,
  witnessSet: (txHash: string) => string = () => cbor.map(),
  extra: [string, string][] = [],
) => {
  const body = cbor.body(form, { to: addressHex(key), extra });
  const txHash = cbor.txHashOf(body);
  return {
    body,
    txHash,
    tx: cbor.tx(body, witnessSet(txHash)),
    unsigned: cbor.tx(body),
    knownUtxos: [handUtxo(key.address)],
  };
};

describe("TxBuilder.fromCbor: the object", () => {
  it("is a BuiltTx whose own members are those of the data of a build, frozen, and copies as the same plain data", async () => {
    for (const [, make] of BUILDS) {
      const { built, builder: b } = await make();
      const made = await fromBuild(built, b);
      expect(made).toBeInstanceOf(BuiltTx);
      expect(Reflect.ownKeys(made)).toEqual(Object.keys(built));
      expect(Object.isFrozen(made)).toBe(true);
      for (const key of Reflect.ownKeys(made)) {
        const descriptor = Object.getOwnPropertyDescriptor(made, key)!;
        expect(descriptor.writable).toBe(false);
        expect(descriptor.enumerable).toBe(true);
      }
      const spread = { ...made };
      const cloned = structuredClone(made);
      expect(cloned).not.toBeInstanceOf(BuiltTx);
      expect(cloned).toEqual(spread);
      expect(Object.keys(cloned)).toEqual(Object.keys(built));
    }
  });

  it.each(BUILDS)(
    "gives the members of the build that made the transaction: %s",
    async (_, make) => {
      const { built, builder: b } = await make();
      const made = await fromBuild(built, b);
      expect(viewOf(made)).toEqual(viewOf(built));
      // The same keys with the same roles
      expect(made.signers.keys.length).toBe(built.signers.keys.length);
    },
  );

  it("builds what the cases name", async () => {
    const { built: spent } = await plutusSpend();
    expect(spent.redeemers.map((r) => r.tag).sort()).toEqual([
      "MINT",
      "REWARD",
      "SPEND",
    ]);
    expect(spent.collateral?.return).toBeDefined();
    const { built: byron } = await nativeAndByron();
    expect(byron.signers.byronAddresses).toEqual([BYRON]);
    expect(byron.signers.nativeScripts).toHaveLength(1);
    const { built: byReference } = await nativeByReference();
    expect(byReference.referenceInputs).toHaveLength(1);
    expect(byReference.signers.nativeScripts).toHaveLength(1);
    expect(byReference.signers.keys.map((k) => k.roles)).toContainEqual([
      "guard",
    ]);
    const { built: delegation } = await certificateAndWithdrawal();
    expect(delegation.signers.keys.map((k) => k.roles).flat()).toEqual(
      expect.arrayContaining(["certificate", "withdrawal", "input"]),
    );
  });

  it("reads a transaction that pays a Byron address and returns collateral to one, each address in base58, and takes it through JSON", async () => {
    await Crypto.ready();
    const key = testKey();
    const byron = Address.fromBase58(BYRON).toBytes() as string;
    const body = cbor.body("tagged", {
      to: byron,
      extra: [
        [
          cbor.uint(13),
          cbor.tag258(cbor.arr(cbor.arr(cbor.bytes(cbor.TX_IN), cbor.uint(1)))),
        ],
        [cbor.uint(16), cbor.arr(cbor.bytes(byron), cbor.uint(4_000_000))],
      ],
    });
    const knownUtxos = [
      handUtxo(addressOf(key, 1)),
      handUtxo(addressOf(key, 1), 1, ada(5)),
    ];
    const b = offline("mainnet");
    const made = await b.fromCbor(cbor.tx(body), { knownUtxos });
    expect(made.tx).toBe(cbor.tx(body));
    expect(made.outputs.map((o) => [o.address, o.value.lovelace])).toEqual([
      [BYRON, 3_000_000n],
    ]);
    expect(made.collateral!.return!.address).toBe(BYRON);
    expect(made.prototype.body.outputs[0]!.address).toBe(BYRON);
    expect(made.prototype.body.collateral_return!.address).toBe(BYRON);
    expect(made.prototype.body.fee).toBe("170000");
    const restored = await b.restore(throughText(made));
    expect(restored.outputs).toEqual(made.outputs);
    expect(restored.prototype).toEqual(made.prototype);
    // A Byron address of mainnet is of another network for a preprod builder
    const error = await caught(() =>
      offline().fromCbor(cbor.tx(body), {
        knownUtxos: [handUtxo(key.address), handUtxo(key.address, 1)],
      }),
    );
    expect(error.code).toBe("NETWORK_MISMATCH");
  });

  it("leaves selectedInputs, change and parts empty, outputs without label and change, redeemers without part", async () => {
    const { built, builder: b } = await plutusSpend();
    expect(built.selectedInputs.length).toBeGreaterThan(0);
    expect(built.change.length).toBeGreaterThan(0);
    expect(built.outputs.some((o) => o.label !== undefined)).toBe(true);
    expect(built.redeemers.every((r) => r.part !== undefined)).toBe(true);
    const made = await fromBuild(built, b);
    expect(made.selectedInputs).toEqual([]);
    expect(made.change).toEqual([]);
    expect(made.parts).toEqual([]);
    for (const out of made.outputs) {
      expect("label" in out).toBe(false);
      expect("change" in out).toBe(false);
    }
    for (const r of made.redeemers) {
      expect("part" in r).toBe(false);
      expect("label" in r).toBe(false);
    }
  });

  it("takes txHash from the body bytes as given, for a body of indefinite length with 8-byte integers and keys out of order", async () => {
    await Crypto.ready();
    const key = testKey();
    const given = handPayment("odd", key);
    const b = offline();
    const made = await b.fromCbor(given.tx, { knownUtxos: given.knownUtxos });
    expect(made.txHash).toBe(given.txHash);
    expect(made.fee).toBe(170_000n);
    // The prototype serialized again is another encoding, with another hash
    const again = b.serialize(made.prototype);
    expect(cbor.topItems(again)[0]).not.toBe(given.body);
    expect(Transaction.fromCbor(TxCBOR(again)).getId()).not.toBe(made.txHash);
  });

  it("gives the inline datum of an output and the data of a redeemer byte for byte, in each encoding", async () => {
    await Crypto.ready();
    const key = testKey();
    const encodings = [
      cbor.constr0(cbor.uint(1)),
      cbor.constr0Indef(cbor.uint(1), cbor.bytes("cafe")),
      cbor.constr0(cbor.uint64(1)),
      cbor.constr0(cbor.chunkedBytes("cafe")),
    ];
    for (const data of encodings) {
      const datumOutput = cbor.map(
        [cbor.uint(0), cbor.bytes(addressHex(key))],
        [cbor.uint(1), cbor.uint(3_000_000)],
        [cbor.uint(2), cbor.arr(cbor.uint(1), `d818${cbor.bytes(data)}`)],
      );
      const body = cbor.map(
        [
          cbor.uint(0),
          cbor.tag258(cbor.arr(cbor.arr(cbor.bytes(cbor.TX_IN), cbor.uint(0)))),
        ],
        [cbor.uint(1), cbor.arr(datumOutput)],
        [cbor.uint(2), cbor.uint(170_000)],
      );
      const redeemers = cbor.arr(
        cbor.arr(
          cbor.uint(0),
          cbor.uint(0),
          data,
          cbor.arr(cbor.uint(1000), cbor.uint(2000)),
        ),
      );
      const given = cbor.tx(body, cbor.map([cbor.uint(5), redeemers]));
      const made = await offline().fromCbor(given, {
        knownUtxos: [handUtxo(key.address)],
      });
      expect(made.outputs[0]!.datum).toEqual({
        type: "inline",
        data: { type: "CBOR", content: data },
      });
      expect(made.redeemers).toEqual([
        {
          tag: "SPEND",
          index: 0,
          exUnits: { mem: 1000n, steps: 2000n },
          data,
        },
      ]);
    }
  });

  it("reads upper-case hex as the same transaction, and gives tx in lower case", async () => {
    await Crypto.ready();
    const key = testKey();
    const given = handPayment("tagged", key);
    const b = offline();
    const lower = await b.fromCbor(given.tx, { knownUtxos: given.knownUtxos });
    const upper = await b.fromCbor(given.tx.toUpperCase(), {
      knownUtxos: given.knownUtxos,
    });
    expect(upper.tx).toBe(given.tx);
    expect(upper.txHash).toBe(lower.txHash);
    expect({ ...upper }).toEqual({ ...lower });
  });

  it("lists the keys in the order the body first needs them", async () => {
    await Crypto.ready();
    const payer = testKey();
    const spender = baseAddress(3);
    const collateralOwner = baseAddress(4);
    const b = offline();
    // The parts in the reverse of the body's order
    const built = await b.build(
      [
        vote({
          voter: { drep: { type: "KEY", value: keyHashHex(15) } },
          votes: [
            { action: { txHash: "a".repeat(64), index: 0 }, vote: "yes" },
          ],
        }),
        certificate.stakeDelegation({
          stake: keyHashToRewardAddress(keyHashHex(12), 0),
          pool: keyHashHex(17),
        }),
        withdrawal.pubKey({
          rewardAddress: keyHashToRewardAddress(keyHashHex(11), 0),
          amount: 0n,
        }),
        guard.pubKey({ keyHash: keyHashHex(10) }),
        collateral({ utxo: utxoAt(collateralOwner, ada(5)) }),
        spend.pubKey({ utxo: utxoAt(spender, ada(50)) }),
      ],
      {
        payer: { changeAddress: payer.address, utxos: [utxoAt(payer.address)] },
      },
    );
    const made = await fromBuild(built, b);
    const firstRoles = made.signers.keys.map((k) => k.roles[0]);
    expect(firstRoles.filter((r, i) => r !== firstRoles[i - 1])).toEqual([
      "input",
      "collateral",
      "guard",
      "withdrawal",
      "certificate",
      "vote",
    ]);
    expect(made.signers.keyHashes).toEqual(
      made.signers.keys.map((k) => k.keyHash),
    );
    const keyOf = (address: string) => deserializeAddress(address).pubKeyHash;
    expect(made.signers.keyHashes).toContain(keyOf(spender));
    expect(made.signers.keyHashes).toContain(keyOf(collateralOwner));
  });

  it("lists VALID_FROM_FUTURE for a lower bound after the clock and COLLATERAL_FORFEITED for collateral without a return, without part", async () => {
    await Crypto.ready();
    const key = testKey();
    const b = offline();
    const collateralInput = cbor.arr(
      cbor.arr(cbor.bytes(cbor.TX_IN), cbor.uint(1)),
    );
    const returned = cbor.map(
      [cbor.uint(0), cbor.bytes(addressHex(key))],
      [cbor.uint(1), cbor.uint(4_000_000)],
    );
    const knownUtxos = [
      handUtxo(key.address),
      handUtxo(key.address, 1, ada(5)),
    ];
    const slot = b.slotAt(Date.now() + 3_600_000);
    const cases: [[string, string][], string[]][] = [
      [[], []],
      [[[cbor.uint(8), cbor.uint(slot)]], ["VALID_FROM_FUTURE"]],
      [[[cbor.uint(8), cbor.uint(1_000)]], []],
      [[[cbor.uint(13), collateralInput]], ["COLLATERAL_FORFEITED"]],
      [
        [
          [cbor.uint(13), collateralInput],
          [cbor.uint(16), returned],
        ],
        [],
      ],
      [
        [
          [cbor.uint(8), cbor.uint(slot)],
          [cbor.uint(13), collateralInput],
        ],
        ["VALID_FROM_FUTURE", "COLLATERAL_FORFEITED"],
      ],
    ];
    for (const [extra, codes] of cases) {
      const given = handPayment("tagged", key, undefined, extra);
      const made = await b.fromCbor(given.tx, { knownUtxos });
      expect(made.warnings.map((w) => w.code)).toEqual(codes);
      for (const warning of made.warnings) {
        expect(Object.keys(warning).sort()).toEqual(["code", "message"]);
      }
    }
  });
});

describe("TxBuilder.fromCbor: collateral returned to someone else", () => {
  /** The collateral inputs `TX_IN#i` of each `i` given */
  const collateralOf = (...indices: number[]) =>
    cbor.tag258(
      cbor.arr(
        ...indices.map((i) => cbor.arr(cbor.bytes(cbor.TX_IN), cbor.uint(i))),
      ),
    );
  /** A collateral return of 495 ada to an address in hex, holding these extra value entries */
  const returnedTo = (addressHexText: string, value = cbor.uint(495_000_000)) =>
    cbor.map([cbor.uint(0), cbor.bytes(addressHexText)], [cbor.uint(1), value]);
  /** A bech32 address of its bytes in hex */
  const bech32Of = (hex: string) =>
    Address.fromBytes(HexBlob(hex)).toBech32() as string;
  const elsewhere = (lovelace: bigint, some: boolean, tokens = false) => ({
    code: "COLLATERAL_RETURN_ELSEWHERE",
    message: `the collateral return pays a payment credential that holds ${some ? "only some" : "none"} of the collateral inputs: if a script fails, the ${lovelace} lovelace${tokens ? " and the tokens" : ""} of the collateral inputs of other holders go to the return's holder or to the fee, however small the total collateral the body states; the validity flag is not signed, so whoever submits the transaction can mark it as failing`,
  });

  let user: TestKey;
  let maker: TestKey;
  let stake: TestKey;
  beforeAll(async () => {
    await Crypto.ready();
    user = testKey();
    maker = testKey();
    stake = testKey();
  });

  /** The warnings of a payment by the maker whose body holds these collateral entries */
  const warningsOf = async (
    entries: [string, string][],
    knownUtxos: Utxo[],
  ) => {
    const given = handPayment("tagged", maker, undefined, entries);
    const made = await offline().fromCbor(given.tx, {
      knownUtxos: [handUtxo(maker.address), ...knownUtxos],
    });
    return made;
  };

  it("lists none for a return to the one holder of the collateral inputs, at its enterprise address or at a base address of its key, and COLLATERAL_FORFEITED alone without a return", async () => {
    const knownUtxos = [
      handUtxo(user.address, 1, ada(500)),
      handUtxo(user.address, 2, ada(7)),
    ];
    const userBase = serializeAddressObj(
      pubKeyAddress(user.keyHash, stake.keyHash),
      0,
    );
    for (const to of [
      addressHex(user),
      Address.fromBech32(userBase).toBytes() as string,
    ]) {
      const made = await warningsOf(
        [
          [cbor.uint(13), collateralOf(1, 2)],
          [cbor.uint(16), returnedTo(to)],
        ],
        knownUtxos,
      );
      expect(made.warnings).toEqual([]);
    }
    const made = await warningsOf(
      [[cbor.uint(13), collateralOf(1, 2)]],
      knownUtxos,
    );
    expect(made.warnings.map((w) => w.code)).toEqual(["COLLATERAL_FORFEITED"]);
  });

  it("lists COLLATERAL_RETURN_ELSEWHERE with the lovelace of every collateral input whose holder the return does not pay: all of them for a return to another, those of the other holder for a return to one of two", async () => {
    // Two inputs of the user, returned to the maker: all of them
    const all = await warningsOf(
      [
        [cbor.uint(13), collateralOf(1, 2)],
        [cbor.uint(16), returnedTo(addressHex(maker))],
        [cbor.uint(17), cbor.uint(5_000_000)],
      ],
      [handUtxo(user.address, 1, ada(500)), handUtxo(user.address, 2, ada(7))],
    );
    expect(all.warnings).toEqual([elsewhere(ada(507), false)]);
    expect(all.collateral!.total).toBe(ada(5));
    // One input of the maker beside the user's, returned to the maker: the user's alone, however
    // large the return
    const mixed = await warningsOf(
      [
        [cbor.uint(13), collateralOf(1, 2)],
        [cbor.uint(16), returnedTo(addressHex(maker))],
      ],
      [handUtxo(user.address, 1, ada(500)), handUtxo(maker.address, 2, ada(7))],
    );
    expect(mixed.warnings).toEqual([elsewhere(ada(500), true)]);
    // The same returned to the user: the maker's input leaves the maker, which is the maker's
    // own business, and the warning names it all the same
    const toUser = await warningsOf(
      [
        [cbor.uint(13), collateralOf(1, 2)],
        [cbor.uint(16), returnedTo(addressHex(user))],
      ],
      [handUtxo(user.address, 1, ada(500)), handUtxo(maker.address, 2, ada(7))],
    );
    expect(toUser.warnings).toEqual([elsewhere(ada(7), true)]);
    // Several inputs of one holder beside the return's holder: their sum
    const several = await warningsOf(
      [
        [cbor.uint(13), collateralOf(1, 2, 3, 4)],
        [cbor.uint(16), returnedTo(addressHex(maker))],
      ],
      [
        handUtxo(maker.address, 1, ada(5)),
        handUtxo(user.address, 2, ada(100)),
        handUtxo(user.address, 3, ada(20)),
        handUtxo(user.address, 4, ada(3)),
      ],
    );
    expect(several.warnings).toEqual([elsewhere(ada(123), true)]);
  });

  it("tells holders by payment credential and its kind: a script holder paid at a base address of its script is paid, a key of the same hash is another holder", async () => {
    const hash = keyHashHex(41);
    const scriptHolder = bech32Of(`70${hash}`);
    const knownUtxos = [handUtxo(scriptHolder, 1, ada(9))];
    const paid = await warningsOf(
      [
        [cbor.uint(13), collateralOf(1)],
        [cbor.uint(16), returnedTo(`10${hash}${stake.keyHash}`)],
      ],
      knownUtxos,
    );
    expect(paid.warnings).toEqual([]);
    const other = await warningsOf(
      [
        [cbor.uint(13), collateralOf(1)],
        [cbor.uint(16), returnedTo(`60${hash}`)],
      ],
      knownUtxos,
    );
    expect(other.warnings).toEqual([elsewhere(ada(9), false)]);
  });

  it("counts lovelace only, says so when the inputs of other holders hold tokens, and the tokens of the return lower nothing", async () => {
    const unit = `${keyHashHex(42)}41`;
    const withToken: Utxo = {
      ...handUtxo(user.address, 1, ada(50)),
      value: { lovelace: ada(50), [unit]: 7n },
    };
    const tokens = await warningsOf(
      [
        [cbor.uint(13), collateralOf(1)],
        [
          cbor.uint(16),
          returnedTo(
            addressHex(maker),
            cbor.arr(
              cbor.uint(45_000_000),
              cbor.map([
                cbor.bytes(keyHashHex(42)),
                cbor.map([cbor.bytes("41"), cbor.uint(7)]),
              ]),
            ),
          ),
        ],
      ],
      [withToken],
    );
    expect(tokens.warnings).toEqual([elsewhere(ada(50), false, true)]);
    // Tokens in the return alone: lovelace only, and no word of tokens
    const plain = await warningsOf(
      [
        [cbor.uint(13), collateralOf(1)],
        [
          cbor.uint(16),
          returnedTo(
            addressHex(maker),
            cbor.arr(
              cbor.uint(45_000_000),
              cbor.map([
                cbor.bytes(keyHashHex(42)),
                cbor.map([cbor.bytes("41"), cbor.uint(7)]),
              ]),
            ),
          ),
        ],
      ],
      [handUtxo(user.address, 1, ada(50))],
    );
    expect(plain.warnings).toEqual([elsewhere(ada(50), false)]);
  });
});

describe("TxBuilder.fromCbor: the bytes", () => {
  it("gives the text itself as tx for a transaction without key witnesses", async () => {
    await Crypto.ready();
    const key = testKey();
    for (const form of ["tagged", "plain", "odd"] as const) {
      const given = handPayment(form, key);
      const made = await offline().fromCbor(given.tx, {
        knownUtxos: given.knownUtxos,
      });
      expect(made.tx).toBe(given.tx);
      expect(made.partialTx).toBe(given.tx);
    }
  });

  /**
   * A transaction whose witness set is of indefinite length and holds redeemers, datums, vkeys
   * and bootstrap witnesses in that order, with auxiliary data; every item in an unusual encoding
   */
  const unusual = (form: cbor.BodyForm, key: TestKey, signer: TestKey) => {
    const body = cbor.body(form, { to: addressHex(key) });
    const txHash = cbor.txHashOf(body);
    const redeemers = cbor.arr(
      cbor.arr(
        cbor.uint(0),
        cbor.uint(0),
        cbor.constr0Indef(cbor.uint64(1)),
        cbor.arr(cbor.uint64(1000), cbor.uint(2000)),
      ),
    );
    const datums = cbor.arrIndef(cbor.constr0Indef(cbor.uint64(1)));
    const aux = cbor.map([cbor.uint(1), "63616263"]);
    const witnessSet = (keys: string, bootstraps?: string) =>
      cbor.mapIndef(
        [cbor.uint(5), redeemers],
        [cbor.uint(4), datums],
        ...(keys ? [["1800", keys] as [string, string]] : []),
        ...(bootstraps ? [[cbor.uint(2), bootstraps] as [string, string]] : []),
      );
    return {
      body,
      txHash,
      redeemers,
      datums,
      aux,
      given: cbor.tx(
        body,
        witnessSet(
          cbor.arr(cbor.vkeyWitness(signer, txHash)),
          cbor.arrIndef(bootstrapWitness(signer, txHash)),
        ),
        { aux },
      ),
      unsigned: cbor.tx(body, witnessSet(""), { aux }),
    };
  };

  it("takes the vkey and bootstrap entries out of tx and keeps every other byte", async () => {
    await Crypto.ready();
    const key = testKey();
    const signer = testKey();
    for (const form of ["tagged", "plain", "odd"] as const) {
      const made_ = unusual(form, key, signer);
      const made = await offline().fromCbor(made_.given, {
        knownUtxos: [handUtxo(key.address)],
      });
      expect(made.tx).toBe(made_.unsigned);
      const items = cbor.topItems(made.tx);
      expect(items[0]).toBe(made_.body);
      expect(items[2]).toBe("f5");
      expect(items[3]).toBe(made_.aux);
      expect(cbor.mapPairs(items[1]!)).toEqual([
        [cbor.uint(5), made_.redeemers],
        [cbor.uint(4), made_.datums],
      ]);
      expect(items[1]!.startsWith("bf")).toBe(true);
      expect(made.txHash).toBe(made_.txHash);
    }
  });

  it("keeps the body, the datums and the redeemers byte for byte in partialTx and signedTx after a signature is added", async () => {
    await Crypto.ready();
    const key = testKey();
    const signer = testKey();
    for (const form of ["tagged", "plain", "odd"] as const) {
      const made_ = unusual(form, key, signer);
      const made = await offline().fromCbor(made_.given, {
        knownUtxos: [handUtxo(key.address)],
      });
      expect(made.missing.map((k) => k.keyHash)).toEqual([key.keyHash]);
      await made.sign({ signers: keysSigner("object", key).signer });
      for (const signed of [made.partialTx, made.signedTx!]) {
        const items = cbor.topItems(signed);
        expect(items[0]).toBe(made_.body);
        expect(items[2]).toBe("f5");
        expect(items[3]).toBe(made_.aux);
        const pairs = cbor.mapPairs(items[1]!);
        expect(pairs).toContainEqual([cbor.uint(5), made_.redeemers]);
        expect(pairs).toContainEqual([cbor.uint(4), made_.datums]);
        expect(allVerify(signed, made_.txHash)).toBe(true);
      }
      expect(keysOf(made.signedTx!).vkeys).toEqual([signer.vkey, key.vkey]);
    }
  });

  it("gives back the bytes given as signedTx for a transaction signed in the form this library writes", async () => {
    await Crypto.ready();
    const key = testKey();
    for (const form of ["tagged", "plain"] as const)
      for (const tagged of [true, false]) {
        const given = handPayment(form, key, (txHash) =>
          cbor.map([
            cbor.uint(0),
            list(tagged ? "tagged" : "plain", cbor.vkeyWitness(key, txHash)),
          ]),
        );
        const made = await offline().fromCbor(given.tx, {
          knownUtxos: given.knownUtxos,
        });
        expect(made.tx).toBe(given.unsigned);
        expect(made.signedTx).toBe(given.tx);
      }
  });

  it("writes the vkey entry and the bootstrap entry with the set tag each came with, and never a transaction longer than the one given", async () => {
    await Crypto.ready();
    const key = testKey();
    const byronKey = testKey();
    const forms: ListForm[] = ["tagged", "plain", "indefinite"];
    const b = offline("mainnet");
    for (const bodyForm of ["tagged", "plain", "odd"] as const)
      for (const vkeyForm of forms)
        for (const bootstrapForm of forms) {
          const body = cbor.body(bodyForm, {
            to: addressHex(key, 1),
            inputs: [0, 1],
          });
          const txHash = cbor.txHashOf(body);
          const given = cbor.tx(
            body,
            cbor.map(
              [cbor.uint(0), list(vkeyForm, cbor.vkeyWitness(key, txHash))],
              [
                cbor.uint(2),
                list(bootstrapForm, bootstrapWitness(byronKey, txHash)),
              ],
            ),
          );
          const made = await b.fromCbor(given, {
            knownUtxos: [handUtxo(addressOf(key, 1), 0), handUtxo(BYRON, 1)],
          });
          expect(made.missing).toEqual([]);
          const signed = made.signedTx!;
          const { vkeys, bootstraps } = readTransaction(signed).witnessSet;
          expect(vkeys!.tagged).toBe(vkeyForm === "tagged");
          expect(bootstraps!.tagged).toBe(bootstrapForm === "tagged");
          expect(signed.length).toBeLessThanOrEqual(given.length);
          if (vkeyForm !== "indefinite" && bootstrapForm !== "indefinite")
            expect(signed).toBe(given);
          expect(cbor.topItems(signed)[0]).toBe(body);
        }
  });

  it("writes the first witness as the body writes its input set when the transaction came with none", async () => {
    await Crypto.ready();
    const key = testKey();
    for (const [form, tagged] of [
      ["tagged", true],
      ["plain", false],
      ["odd", false],
    ] as const) {
      const given = handPayment(form, key);
      const made = await offline().fromCbor(given.tx, {
        knownUtxos: given.knownUtxos,
      });
      await made.sign({ signers: keysSigner("object", key).signer });
      expect(readTransaction(made.signedTx!).witnessSet.vkeys!.tagged).toBe(
        tagged,
      );
    }
  });
});

/** A provider that records every call and answers none */
const recordingProvider = () => {
  const calls: string[] = [];
  const provider = new Proxy(
    {},
    {
      get: (_, name) =>
        typeof name === "string" && name !== "then"
          ? (...args: unknown[]) => {
              calls.push(name);
              return Promise.reject(
                new Error(`not answered: ${args.length} arguments`),
              );
            }
          : undefined,
    },
  ) as TxBuilderOptions["provider"];
  return { provider, calls };
};

describe("TxBuilder.fromCbor: the witnesses it came with", () => {
  it("is INVALID_WITNESS (wrongBody) with the key hash for a vkey witness or a bootstrap witness of another body, before any request", async () => {
    await Crypto.ready();
    const key = testKey();
    const stranger = testKey();
    const other = cbor.txHashOf(
      cbor.body("plain", { to: addressHex(stranger) }),
    );
    for (const entry of [
      [cbor.uint(0), cbor.arr(cbor.vkeyWitness(stranger, other))],
      [cbor.uint(2), cbor.arr(bootstrapWitness(stranger, other))],
    ] as [string, string][]) {
      const given = handPayment("tagged", key, () => cbor.map(entry));
      const { provider, calls } = recordingProvider();
      const error = await caught(() =>
        new TxBuilder({ network: "preprod", params, provider }).fromCbor(
          given.tx,
        ),
      );
      expect(TxPlanError.is(error, "INVALID_WITNESS")).toBe(true);
      expect(error.details).toEqual({
        reason: "wrongBody",
        argument: 0,
        keyHash: stranger.keyHash,
      });
      expect(error.message).toContain("is not of its body");
      expect(calls).toEqual([]);
    }
  });

  it("holds a key once when the transaction holds its witness twice", async () => {
    await Crypto.ready();
    const key = testKey();
    const given = handPayment("tagged", key, (txHash) =>
      cbor.map([
        cbor.uint(0),
        cbor.arr(cbor.vkeyWitness(key, txHash), cbor.vkeyWitness(key, txHash)),
      ]),
    );
    const made = await offline().fromCbor(given.tx, {
      knownUtxos: given.knownUtxos,
    });
    expect(keysOf(made.partialTx).vkeys).toEqual([key.vkey]);
    expect(made.missing).toEqual([]);
    expect(made.signedTx!.length).toBeLessThan(given.tx.length);
  });

  it("is INVALID_WITNESS (wrongBody) for a key whose witness stands twice and once is of another body, in either order, vkey or bootstrap", async () => {
    await Crypto.ready();
    const key = testKey();
    const other = cbor.txHashOf(cbor.body("plain", { to: addressHex(key) }));
    const cases: [number, (txHash: string) => string][] = [
      [0, (txHash) => cbor.vkeyWitness(key, txHash)],
      [2, (txHash) => bootstrapWitness(key, txHash)],
    ];
    for (const [entry, witness] of cases)
      for (const order of ["good first", "bad first"]) {
        const given = handPayment("tagged", key, (txHash) => {
          const pair = [witness(txHash), witness(other)];
          return cbor.map([
            cbor.uint(entry),
            cbor.arr(...(order === "good first" ? pair : pair.reverse())),
          ]);
        });
        const error = await caught(() =>
          offline().fromCbor(given.tx, { knownUtxos: given.knownUtxos }),
        );
        expect(TxPlanError.is(error, "INVALID_WITNESS")).toBe(true);
        expect(error.details).toEqual({
          reason: "wrongBody",
          argument: 0,
          keyHash: key.keyHash,
        });
      }
  });

  it("holds a witness of a key the transaction does not need, writes their number as extraKeyWitnesses, and drops a later witness of another such key", async () => {
    await Crypto.ready();
    const key = testKey();
    const stranger = testKey();
    const later = testKey();
    const given = handPayment("tagged", key, (txHash) =>
      cbor.map([cbor.uint(0), cbor.arr(cbor.vkeyWitness(stranger, txHash))]),
    );
    const b = offline();
    const made = await b.fromCbor(given.tx, { knownUtxos: given.knownUtxos });
    expect(made.partialTx).toBe(given.tx);
    expect(made.missing.map((k) => k.keyHash)).toEqual([key.keyHash]);
    expect(throughText(made).extraKeyWitnesses).toBe(1);
    await made.addWitnesses(
      cbor.map([cbor.uint(0), cbor.arr(cbor.vkeyWitness(later, given.txHash))]),
    );
    await made.sign({
      signers: [
        keysSigner("object", later).signer,
        keysSigner("object", key).signer,
      ],
    });
    expect(keysOf(made.signedTx!).vkeys).toEqual([stranger.vkey, key.vkey]);
    const restored = await b.restore(throughText(made));
    expect(restored.signedTx).toBe(made.signedTx);
    expect(throughText(restored).extraKeyWitnesses).toBe(1);
  });

  it("holds bootstrap witnesses up to the Byron addresses spent from, and does not wait for them", async () => {
    await Crypto.ready();
    const first = testKey();
    const second = testKey();
    const to = testKey();
    const body = cbor.body("tagged", { to: addressHex(to, 1) });
    const txHash = cbor.txHashOf(body);
    const b = offline("mainnet");
    const knownUtxos = [handUtxo(BYRON)];
    const unsigned = await b.fromCbor(cbor.tx(body), { knownUtxos });
    expect(unsigned.signers.byronAddresses).toEqual([BYRON]);
    expect(unsigned.missing).toEqual([]);
    expect(unsigned.signedTx).toBe(cbor.tx(body));
    const made = await b.fromCbor(
      cbor.tx(
        body,
        cbor.map([
          cbor.uint(2),
          cbor.arr(
            bootstrapWitness(first, txHash),
            bootstrapWitness(second, txHash),
          ),
        ]),
      ),
      { knownUtxos },
    );
    expect(keysOf(made.signedTx!).bootstraps).toEqual([first.vkey]);
    // A bootstrap witness is not a witness of another key: none is counted, and a later
    // witness of a key the transaction does not need is dropped
    expect(throughText(made).extraKeyWitnesses).toBeUndefined();
    const stranger = testKey();
    await made.addWitnesses(
      cbor.map([cbor.uint(0), cbor.arr(cbor.vkeyWitness(stranger, txHash))]),
    );
    expect(keysOf(made.partialTx).vkeys).toEqual([]);
  });

  it("has nothing missing for a transaction that came with every signature it needs: signedTx is defined at once", async () => {
    const {
      built,
      payer,
      guardKey,
      builder: b,
    } = await (async () => {
      await Crypto.ready();
      const payerKey = testKey();
      const guardKey = testKey();
      const builder = offline();
      const built = await builder.build(
        [
          output({ address: recipient, value: { lovelace: ada(5) } }),
          guard.pubKey({ keyHash: guardKey.keyHash }),
        ],
        {
          payer: {
            changeAddress: payerKey.address,
            utxos: [utxoAt(payerKey.address)],
          },
        },
      );
      return { built, payer: payerKey, guardKey, builder };
    })();
    await built.sign({ signers: keysSigner("object", payer, guardKey).signer });
    const made = await fromBuild(built, b, built.signedTx!);
    expect(made.tx).toBe(built.tx);
    expect(made.missing).toEqual([]);
    expect(made.signedTx).toBe(built.signedTx);
  });

  it("lists the keys that have not signed with their roles, and asks a signer for exactly those and the keys native scripts name", async () => {
    await Crypto.ready();
    const payer = testKey();
    const guardKey = testKey();
    const scriptKey = testKey();
    const native: NativeScript = { type: "sig", keyHash: scriptKey.keyHash };
    const b = offline();
    const built = await b.build(
      [
        output({ address: recipient, value: { lovelace: ada(5) } }),
        guard.pubKey({ keyHash: guardKey.keyHash }),
        spend.native({
          utxo: utxoAt(b.scriptAddress(native), ada(2)),
          script: native,
        }),
      ],
      {
        payer: { changeAddress: payer.address, utxos: [utxoAt(payer.address)] },
      },
    );
    await built.sign({ signers: keysSigner("object", payer).signer });
    const made = await fromBuild(built, b, built.partialTx);
    expect(made.missing).toEqual([
      { keyHash: guardKey.keyHash, roles: ["guard"] },
    ]);
    const asked = hashSigner("object", () => []);
    await made.sign({ signers: asked.signer });
    expect(asked.requests).toHaveLength(1);
    expect(asked.requests[0]!.txHash).toBe(built.txHash);
    expect(asked.requests[0]!.keys).toEqual([
      { keyHash: guardKey.keyHash, roles: ["guard"] },
      { keyHash: scriptKey.keyHash, roles: ["nativeScript"] },
    ] satisfies AskedKey[]);
  });

  it("is MISSING_SIGNATURES from sign() without signers: it has no payer", async () => {
    await Crypto.ready();
    const key = testKey();
    const given = handPayment("tagged", key);
    const made = await offline().fromCbor(given.tx, {
      knownUtxos: given.knownUtxos,
    });
    for (const options of [undefined, {}, { signers: [] }]) {
      const error = await caught(() => made.sign(options));
      expect(TxPlanError.is(error, "MISSING_SIGNATURES")).toBe(true);
      expect(error.details.missing).toEqual([
        { keyHash: key.keyHash, roles: ["input"] },
      ]);
      expect(error.message).toContain(
        "an object made by finalize(), fromCbor() or restore()",
      );
    }
    expect(made.partialTx).toBe(given.tx);
  });

  it("has every form of signer sign the hash of the body bytes as given, for a body in an unusual encoding", async () => {
    await Crypto.ready();
    const wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words: Array(24).fill("solution") },
    });
    await wallet.init();
    const walletAddress = (await wallet.getChangeAddress())!;
    const walletKey = deserializeAddress(walletAddress).pubKeyHash;
    const secret = randomBytes(32);
    const ownKeyHash = Crypto.Ed25519PrivateKey.fromNormalBytes(secret)
      .toPublic()
      .hash()
      .hex() as string;
    const hashKey = testKey();
    const to = testKey();
    for (const walletSigner of [
      wallet,
      { signTx: (tx: string, partial?: boolean) => wallet.signTx(tx, partial) },
    ] as Signer[]) {
      const body = cbor.body("odd", { to: addressHex(to), inputs: [0, 1, 2] });
      const txHash = cbor.txHashOf(body);
      const made = await offline().fromCbor(cbor.tx(body), {
        knownUtxos: [
          handUtxo(addressOf({ keyHash: ownKeyHash }), 0),
          handUtxo(hashKey.address, 1),
          handUtxo(walletAddress, 2),
        ],
      });
      expect(made.txHash).toBe(txHash);
      const viaHashes = keysSigner("callback", hashKey);
      await made.sign({
        signers: [
          keySigner(secret.toString("hex")),
          viaHashes.signer,
          walletSigner,
        ],
      });
      expect(viaHashes.requests[0]!.txHash).toBe(txHash);
      expect(made.missing).toEqual([]);
      const signed = made.signedTx!;
      expect(cbor.topItems(signed)[0]).toBe(body);
      expect(
        readTransaction(signed)
          .witnessSet.vkeys!.witnesses.map((w) => w.keyHash)
          .sort(),
      ).toEqual([ownKeyHash, hashKey.keyHash, walletKey].sort());
      expect(allVerify(signed, txHash)).toBe(true);
    }
  });
});

describe("TxBuilder.fromCbor: as JSON, and as a built transaction elsewhere", () => {
  it.each(BUILDS)(
    "goes through JSON.stringify and restore with the same data, the same partialTx and the same missing, and both readers give the data back: %s",
    async (_, make) => {
      const { built, builder: b } = await make();
      const made = await fromBuild(built, b);
      const restored = await b.restore(throughText(made));
      expect({ ...restored }).toEqual({ ...made });
      expect(restored.partialTx).toBe(made.partialTx);
      expect(restored.missing).toEqual(made.missing);
      expect(throughText(restored)).toEqual(throughText(made));
      const encoded = JSON.parse(JSON.stringify(encodeBuilt({ ...made })));
      expect(decodeBuilt(encoded, "built")).toEqual({ ...made });
    },
  );

  it("goes through JSON with bytes in unusual encodings", async () => {
    await Crypto.ready();
    const key = testKey();
    const signer = testKey();
    for (const form of ["tagged", "plain", "odd"] as const) {
      const given = handPayment(form, key, (txHash) =>
        cbor.map([
          cbor.uint(0),
          cbor.arrIndef(cbor.vkeyWitness(signer, txHash)),
        ]),
      );
      const b = offline();
      const made = await b.fromCbor(given.tx, { knownUtxos: given.knownUtxos });
      const restored = await b.restore(throughText(made));
      expect({ ...restored }).toEqual({ ...made });
      expect(restored.partialTx).toBe(made.partialTx);
      expect(restored.missing).toEqual(made.missing);
      expect(throughText(restored)).toEqual(throughText(made));
      const encoded = JSON.parse(JSON.stringify(encodeBuilt({ ...made })));
      expect(decodeBuilt(encoded, "built")).toEqual({ ...made });
    }
  });

  it("writes the unsigned transaction as built.tx and the witnesses it came with as witnesses, in the form they came in; the object restored writes the same bytes, and so does one restored from its JSON", async () => {
    await Crypto.ready();
    const key = testKey();
    const signer = testKey();
    for (const form of ["tagged", "plain"] as const)
      for (const tagged of [true, false]) {
        const given = handPayment(form, key, (txHash) =>
          cbor.map([
            cbor.uint(0),
            list(tagged ? "tagged" : "plain", cbor.vkeyWitness(signer, txHash)),
          ]),
        );
        const b = offline();
        const made = await b.fromCbor(given.tx, {
          knownUtxos: given.knownUtxos,
        });
        const json = throughText(made);
        expect(json.built.tx).toBe(given.unsigned);
        expect(json.extraKeyWitnesses).toBe(1);
        const { witnessSet } = readWitnessArgument(json.witnesses);
        expect(witnessSet.vkeys!.tagged).toBe(tagged);
        expect(witnessSet.vkeys!.witnesses.map((w) => w.vkey)).toEqual([
          signer.vkey,
        ]);
        const restored = await b.restore(json);
        expect(restored.partialTx).toBe(given.tx);
        const again = await b.restore(throughText(restored));
        expect(again.partialTx).toBe(given.tx);
        await again.sign({ signers: keysSigner("object", key).signer });
        await made.sign({ signers: keysSigner("object", key).signer });
        expect(again.signedTx).toBe(made.signedTx);
      }
  });

  it("is taken as after: a build after it selects none of its inputs, names its outputs by out ref without a lookup, and selects none of them", async () => {
    await Crypto.ready();
    const key = testKey();
    // Two outputs at the address a later build has as its change address
    const paid = cbor.map(
      [cbor.uint(0), cbor.bytes(addressHex(key))],
      [cbor.uint(1), cbor.uint(40_000_000)],
    );
    const given = cbor.tx(
      cbor.map(
        [
          cbor.uint(0),
          cbor.tag258(cbor.arr(cbor.arr(cbor.bytes(cbor.TX_IN), cbor.uint(0)))),
        ],
        [cbor.uint(1), cbor.arr(paid, paid)],
        [cbor.uint(2), cbor.uint(170_000)],
      ),
    );
    const spentByIt = handUtxo(key.address, 0, ada(100));
    const { provider, calls } = recordingProvider();
    const b = offline("preprod", { provider });
    const made = await b.fromCbor(given, { knownUtxos: [spentByIt] });
    expect(made.outputs.map((o) => o.address)).toEqual([
      key.address,
      key.address,
    ]);
    const small = utxoAt(key.address, ada(2));
    // What the payer holds besides cannot pay 4 ada: neither the input the object spends nor
    // its outputs are there to select
    const short = await caught(() =>
      b.build([output({ address: recipient, value: { lovelace: ada(4) } })], {
        payer: { changeAddress: key.address, utxos: [spentByIt, small] },
        after: made,
      }),
    );
    expect(short.code).toBe("INSUFFICIENT_FUNDS");
    // One of its outputs named by out ref is taken without a lookup; the other is not selected
    const next = await b.build(
      [
        spend.pubKey({ utxo: { txHash: made.txHash, outputIndex: 1 } }),
        output({ address: recipient, value: { lovelace: ada(38) } }),
      ],
      {
        payer: { changeAddress: key.address, utxos: [spentByIt, small] },
        after: made,
      },
    );
    expect(calls).toEqual([]);
    expect(next.inputs.map((u) => `${u.txHash}#${u.outputIndex}`)).toContain(
      `${made.txHash}#1`,
    );
    for (const utxo of next.inputs)
      expect(`${utxo.txHash}#${utxo.outputIndex}`).not.toBe(`${made.txHash}#0`);
    expect(next.inputs.some((u) => u.txHash === cbor.TX_IN)).toBe(false);
  });

  it("types: fromCbor gives Promise<BuiltTx>, and its options take knownUtxos alone", async () => {
    type Equal<A, B> =
      (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
        ? true
        : false;
    const returns: Equal<
      ReturnType<TxBuilder["fromCbor"]>,
      Promise<BuiltTx>
    > = true;
    const options: Equal<
      Parameters<TxBuilder["fromCbor"]>[1],
      { knownUtxos?: readonly UtxoInput[] } | undefined
    > = true;
    const first: Equal<Parameters<TxBuilder["fromCbor"]>[0], string> = true;
    expect([returns, options, first]).toEqual([true, true, true]);
    const b = offline();
    const unused = async () => {
      // @ts-expect-error: no option but knownUtxos
      await b.fromCbor("", { after: [] });
      // @ts-expect-error: the transaction is text
      await b.fromCbor(new Uint8Array());
    };
    expect(typeof unused).toBe("function");
  });

  describe("awaitInclusion", () => {
    const foundInfo = (hash: string, extra: Record<string, unknown> = {}) => ({
      hash,
      slot: "1200",
      block: "b".repeat(64),
      blockHeight: 1200,
      ...extra,
    });
    const searching = (answer: (hash: string) => unknown) =>
      ({
        fetchTxInfo: async (hash: string) => answer(hash),
      }) as unknown as TxBuilderOptions["provider"];

    /** A hand-made payment whose witness set holds a redeemer, in the list or the map form */
    const withRedeemers = (key: TestKey, form: "list" | "map" | "none") => {
      const data = cbor.constr0();
      const units = cbor.arr(cbor.uint(1000), cbor.uint(2000));
      const redeemers =
        form === "list"
          ? cbor.arr(cbor.arr(cbor.uint(0), cbor.uint(0), data, units))
          : cbor.map([
              cbor.arr(cbor.uint(0), cbor.uint(0)),
              cbor.arr(data, units),
            ]);
      return handPayment("tagged", key, () =>
        form === "none" ? cbor.map() : cbor.map([cbor.uint(5), redeemers]),
      );
    };

    it("is SCRIPT_FAILED when the provider finds it with validContract: false", async () => {
      await Crypto.ready();
      const key = testKey();
      const given = withRedeemers(key, "list");
      const b = offline("preprod", {
        provider: searching((hash) =>
          foundInfo(hash, { validContract: false }),
        ),
      });
      const made = await b.fromCbor(given.tx, { knownUtxos: given.knownUtxos });
      const error = await caught(() => made.awaitInclusion());
      expect(TxPlanError.is(error, "SCRIPT_FAILED")).toBe(true);
    });

    it.each(["list", "map"] as const)(
      "is CANNOT_OBSERVE (noValidity) when a transaction that holds redeemers as a %s is found without validContract",
      async (form) => {
        await Crypto.ready();
        const key = testKey();
        const given = withRedeemers(key, form);
        const b = offline("preprod", {
          provider: searching((hash) => foundInfo(hash)),
        });
        const made = await b.fromCbor(given.tx, {
          knownUtxos: given.knownUtxos,
        });
        expect(made.redeemers).toHaveLength(1);
        const error = await caught(() => made.awaitInclusion());
        expect(TxPlanError.is(error, "CANNOT_OBSERVE")).toBe(true);
        expect(error.details.reason).toBe("noValidity");
        const valid = await offline("preprod", {
          provider: searching((hash) =>
            foundInfo(hash, { validContract: true }),
          ),
        }).fromCbor(given.tx, { knownUtxos: given.knownUtxos });
        expect((await valid.awaitInclusion()).txHash).toBe(given.txHash);
      },
    );

    it("needs no validity for a transaction without redeemers", async () => {
      await Crypto.ready();
      const key = testKey();
      const given = withRedeemers(key, "none");
      const b = offline("preprod", {
        provider: searching((hash) => foundInfo(hash)),
      });
      const made = await b.fromCbor(given.tx, { knownUtxos: given.knownUtxos });
      expect(await made.awaitInclusion()).toEqual({
        txHash: given.txHash,
        slot: 1200,
        block: "b".repeat(64),
        blockHeight: 1200,
      });
    });
  });
});
