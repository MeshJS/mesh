import {
  Action,
  customNetwork,
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
  resolveScriptHash,
  resolveScriptRef,
  serializeAddressObj,
} from "@meshsdk/core";
import {
  getTransactionOutputs,
  keyHashToRewardAddress,
  normalizePlutusScript,
  plutusDataVariantToCardano,
  resolvePlutusScriptAddress,
  toNativeScript,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  Assets,
  BuildEvent,
  BuiltTx,
  certificate,
  collateral,
  collateralReturn,
  guard,
  output,
  OutputDatum,
  OutputScript,
  referenceInput,
  spend,
  toUtxo,
  TxBuilder,
  TxBuildError,
  TxPart,
  Utxo,
  UtxoInput,
  validity,
  vote,
  withdrawal,
} from "../../src/tx-builder";
import { feeForSize } from "../../src/tx-builder/fee";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  keyHashHex,
  mockTokenUnit,
  vrfKeyHashHex,
} from "../test-util";
import { asMesh, ref } from "./utxo-util";

const network = "preprod";
const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const wallet = baseAddress(1);
const recipient = baseAddress(2);
const walletKey = deserializeAddress(wallet).pubKeyHash;
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const deposits = { drepDeposit: 500_000_000n, govActionDeposit: 1_000_000n };
const nativeScript: NativeScript = { type: "sig", keyHash: keyHashHex(9) };

const ada = (n: number) => BigInt(n) * 1_000_000n;
const lovelace = (n: bigint): Assets => ({ lovelace: n });
const unitInline: OutputDatum = {
  type: "inline",
  data: { type: "CBOR", content: "d87980" },
};
const plutusRef: OutputScript = {
  type: "plutus",
  version: "V3",
  code: alwaysSucceedCbor,
  hash: alwaysSucceedHash,
};
/** A native script as an output holds it for reference */
const nativeRefOf = (script: NativeScript): OutputScript => ({
  type: "native",
  cbor: toNativeScript(script).toCbor().toString(),
  hash: resolveNativeScriptHash(script),
});
let nextHash = 0;
const utxo = (
  value: Assets,
  extra: Partial<Utxo> = {},
  address = wallet,
): Utxo => ({
  txHash: (++nextHash).toString(16).padStart(64, "c"),
  outputIndex: 0,
  address,
  value,
  ...extra,
});
const payer = (...utxos: UtxoInput[]) => ({ changeAddress: wallet, utxos });
const keyOf = (address: string) => deserializeAddress(address).pubKeyHash;

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

const builder = (options: { params?: Protocol } = {}) =>
  new TxBuilder({
    network,
    params: options.params ?? params,
    costModels,
    evaluator: fakeEvaluator(),
    deposits,
  });

const caught = async (build: Promise<unknown>) => {
  try {
    await build;
  } catch (error) {
    expect(error).toBeInstanceOf(TxBuildError);
    return error as TxBuildError;
  }
  throw new Error("expected the build to fail");
};

/** An output locked by the always-succeeding script, its datum inline */
const locked = (n = 10) =>
  utxo(lovelace(ada(n)), { datum: unitInline }, scriptAddress);
const scriptSpend = (spent: UtxoInput = locked(), label?: string) =>
  spend.plutus({
    utxo: spent,
    script: plutusScript,
    redeemer: { data: mConStr0([]) },
    ...(label !== undefined && { label }),
  });

/** UTxOs in the builder's form, without the marks of built outputs, to compare with a provider's */
const plainUtxos = (utxos: readonly UtxoInput[]) => utxos.map((u) => toUtxo(u));

/** The minimum fee of the transaction once signed by `signers` keys */
const signedMinFee = (built: BuiltTx, signers: number) => {
  const witnessBytes =
    signers === 0 ? 0 : 101 * signers + (signers < 24 ? 1 : 2) + 1 + 1;
  // Reference scripts held by the inputs and reference inputs are priced too
  const refScripts = [...built.inputs, ...built.referenceInputs].reduce(
    (size, u) => size + BigInt((asMesh(u).output.scriptRef?.length ?? 0) / 2),
    0n,
  );
  return feeForSize(
    built.tx.length / 2 + witnessBytes,
    refScripts,
    built.exUnits,
    params,
  );
};
const expectFeeFor = (built: BuiltTx, signers: number) => {
  const min = signedMinFee(built, signers);
  expect(built.fee).toBeGreaterThanOrEqual(min - 88n);
  expect(built.fee).toBeLessThanOrEqual(min + 88n);
};

describe("BuiltTx: outputs and change", () => {
  it("lists every output as a UTxO of the transaction, in body order, with its part's label", async () => {
    const unit = mockTokenUnit(1);
    const built = await builder().build(
      [
        output({
          address: recipient,
          value: { lovelace: ada(5) },
          label: "pay",
        }),
        output({ address: recipient, value: { [unit]: 2n } }),
      ],
      { payer: payer(utxo({ ...lovelace(ada(100)), [unit]: 5n })) },
    );
    const { body } = built.prototype;
    expect(built.outputs).toHaveLength(body.outputs.length);
    expect(built.outputs.map(ref)).toEqual(
      body.outputs.map((_, outputIndex) => ({
        txHash: built.txHash,
        outputIndex,
      })),
    );
    expect(built.outputs.map((o) => o.label)).toEqual([
      "pay",
      undefined,
      undefined,
    ]);
    expect(built.outputs.map((o) => o.change)).toEqual([
      undefined,
      undefined,
      true,
    ]);
    expect("label" in built.outputs[2]!).toBe(false);
    // What a provider would report for the same outputs
    expect(plainUtxos(built.outputs)).toEqual(
      plainUtxos(getTransactionOutputs(built.tx)),
    );
    expect(built.outputs[1]!.value).toEqual({
      lovelace: BigInt(body.outputs[1]!.amount.coin),
      [unit]: 2n,
    });
    for (const o of built.outputs)
      expect(Object.values(o)).not.toContain(undefined);
  });

  it("does not list the collateral return", async () => {
    const built = await builder().build(
      [
        scriptSpend(),
        output({ address: recipient, value: { lovelace: ada(2) } }),
      ],
      { payer: payer(utxo(lovelace(ada(100)))) },
    );
    const { body } = built.prototype;
    expect(body.collateral_return).toBeDefined();
    expect(built.outputs).toHaveLength(body.outputs.length);
    expect(plainUtxos(built.outputs)).toEqual(
      plainUtxos(getTransactionOutputs(built.tx)),
    );
    // It is reported with the collateral, as the UTxO it becomes if a script fails: the output
    // after the body's own, holding what the body returns
    const returned = body.collateral_return!;
    expect(built.collateral!.return).toStrictEqual({
      txHash: built.txHash,
      outputIndex: body.outputs.length,
      address: returned.address,
      value: { lovelace: BigInt(returned.amount.coin) },
    });
  });

  it("describes datums and reference scripts, and reports them as a provider does", async () => {
    const data = mConStr0([]);
    const built = await builder().build(
      [
        output({
          address: scriptAddress,
          value: { lovelace: ada(5) },
          datum: { type: "inline", data },
          label: "inline",
        }),
        output({
          address: scriptAddress,
          value: { lovelace: ada(5) },
          datum: { type: "hash", data },
          label: "hash",
        }),
        output({
          address: recipient,
          value: { lovelace: ada(20) },
          scriptRef: plutusScript,
          label: "script",
        }),
        output({
          address: recipient,
          value: { lovelace: ada(5) },
          scriptRef: nativeScript,
          label: "native",
        }),
      ],
      { payer: payer(utxo(lovelace(ada(100)))) },
    );
    const [inline, hashed, script, native] = built.outputs;
    expect(inline!.datum).toEqual({
      type: "inline",
      data: { type: "CBOR", content: "d87980" },
    });
    expect(hashed!.datum).toEqual({
      type: "hash",
      hash: resolveDataHash("d87980", "CBOR"),
    });
    expect(inline!.script).toBeUndefined();
    expect(script!.datum).toBeUndefined();
    expect(script!.script).toEqual({
      type: "plutus",
      version: "V3",
      code: normalizePlutusScript(alwaysSucceedCbor, "DoubleCBOR"),
      hash: resolveScriptHash(alwaysSucceedCbor, "V3"),
    });
    expect(native!.script).toEqual({
      type: "native",
      cbor: toNativeScript(nativeScript).toCbor().toString(),
      hash: resolveNativeScriptHash(nativeScript),
    });
    // Written back, each is the script reference the body holds
    for (const [i, o] of [script!, native!].entries())
      expect(asMesh(o).output.scriptRef).toBe(
        built.prototype.body.outputs[i + 2]!.script_ref,
      );
    expect(asMesh(script!).output.scriptRef).toBe(
      resolveScriptRef(plutusScript),
    );
    expect(plainUtxos(built.outputs)).toEqual(
      plainUtxos(getTransactionOutputs(built.tx)),
    );

    // The output goes straight into a part, its inline datum recognised
    const unlock = scriptSpend(inline!);
    expect(unlock.witness).toMatchObject({ datum: { type: "inline" } });
  });

  it("lists an output at a Byron address with its base58 text", async () => {
    const byron = "Ae2tdPwUPEZ4YjgvykNpoFeYUxoyhNj2kg8KfKWN2FizsSpLUPv68MpTVDo";
    const shelley = serializeAddressObj(pubKeyAddress(keyHashHex(1)), 1);
    const built = await new TxBuilder({ network: "mainnet", params }).build(
      [output({ address: byron, value: { lovelace: ada(2) }, label: "old" })],
      {
        payer: {
          changeAddress: shelley,
          utxos: [utxo(lovelace(ada(10)), {}, shelley)],
        },
      },
    );
    expect(built.outputs[0]).toMatchObject({ label: "old", address: byron });
  });

  it("lists change as the outputs marked change, at the payer's change address", async () => {
    const built = await builder().build(
      [output({ address: recipient, value: { lovelace: ada(2) } })],
      { payer: payer(utxo(lovelace(ada(100)))) },
    );
    expect(built.change).toHaveLength(1);
    expect(built.change).toEqual(built.outputs.filter((o) => o.change));
    expect(built.change[0]!.address).toBe(wallet);

    // Nothing left over: no change
    const exact = await builder().build(
      [output({ address: recipient, value: { lovelace: ada(10) - 200_000n } })],
      { payer: payer(utxo(lovelace(ada(10)))), fee: 200_000n },
    );
    expect(exact.change).toEqual([]);
    expect(exact.outputs.some((o) => o.change)).toBe(false);

    // Tokens that do not fit one output come back in several
    const units = Array.from({ length: 30 }, (_, i) => mockTokenUnit(i + 1));
    const split = await builder({
      params: { ...params, maxValSize: 400 },
    }).build([output({ address: recipient, value: { lovelace: ada(2) } })], {
      payer: payer(
        utxo({
          ...lovelace(ada(100)),
          ...Object.fromEntries(units.map((unit) => [unit, 1n])),
        }),
      ),
    });
    expect(split.change.length).toBeGreaterThan(1);
    expect(split.change).toEqual(split.outputs.filter((o) => o.change));
    expect(split.change.map((o) => o.outputIndex)).toEqual(
      split.change.map((_, i) => i + 1),
    );
    for (const o of split.change) expect(o.address).toBe(wallet);
  });

  it("does not mark an output a part pays to the payer's own address", async () => {
    const built = await builder().build(
      [output({ address: wallet, value: { lovelace: ada(5) }, label: "self" })],
      { payer: payer(utxo(lovelace(ada(100)))) },
    );
    expect(built.outputs[0]).toMatchObject({ label: "self", address: wallet });
    expect("change" in built.outputs[0]!).toBe(false);
    expect(built.change.map((o) => o.outputIndex)).toEqual([1]);
  });

  it("keeps only the UTxO's own members of a built output given to a part or to the payer", async () => {
    const first = await builder().build(
      [
        output({
          address: wallet,
          value: { lovelace: ada(20) },
          label: "mine",
        }),
      ],
      { payer: payer(utxo(lovelace(ada(100)))) },
    );
    const second = await builder().build(
      [
        spend.pubKey({ utxo: first.outputs[0]! }),
        output({ address: recipient, value: { lovelace: ada(30) } }),
      ],
      { payer: payer(first.change[0]!) },
    );
    const carried = [
      ...second.inputs,
      ...second.selectedInputs,
      ...second.parts.flatMap((p) => ("utxo" in p && p.utxo ? [p.utxo] : [])),
    ];
    expect(carried.length).toBeGreaterThanOrEqual(4);
    for (const u of carried)
      expect(Object.keys(u).sort()).toEqual([
        "address",
        "outputIndex",
        "txHash",
        "value",
      ]);
  });
});

describe("BuiltTx: reference inputs", () => {
  it("lists the UTxOs read by reference inputs and reference scripts, in body order", async () => {
    const holder = utxo(lovelace(ada(20)), { script: plutusRef });
    const read = utxo(lovelace(ada(2)), { datum: unitInline });
    const built = await builder().build(
      [
        referenceInput({ utxo: read }),
        spend.plutus({
          utxo: locked(),
          script: { reference: holder },
          redeemer: { data: mConStr0([]) },
        }),
      ],
      // The payer holds the script output, so it needs no lookup; read, it is never selected
      { payer: payer(utxo(lovelace(ada(100))), holder) },
    );
    const refs = built.prototype.body.reference_inputs!;
    expect(refs).toHaveLength(2);
    expect(built.referenceInputs.map(ref)).toEqual(
      refs.map((i) => ({ txHash: i.transaction_id, outputIndex: i.index })),
    );
    expect(built.referenceInputs).toEqual(
      expect.arrayContaining([read, holder]),
    );
  });

  it("leaves out a reference script the transaction also spends, and is empty without any", async () => {
    const holder = utxo(lovelace(ada(20)), { script: plutusRef });
    const built = await builder().build(
      [
        spend.pubKey({ utxo: holder }),
        spend.plutus({
          utxo: locked(),
          script: { reference: holder },
          redeemer: { data: mConStr0([]) },
        }),
      ],
      { payer: payer(utxo(lovelace(ada(100)))) },
    );
    expect(built.prototype.body.reference_inputs ?? []).toEqual([]);
    expect(built.referenceInputs).toEqual([]);

    const plain = await builder().build(
      [output({ address: recipient, value: { lovelace: ada(2) } })],
      { payer: payer(utxo(lovelace(ada(100)))) },
    );
    expect(plain.referenceInputs).toEqual([]);
  });
});

describe("BuiltTx: signers", () => {
  const neededBy = (built: BuiltTx, keyHash: string) =>
    built.signers.keys.find((k) => k.keyHash === keyHash)?.neededBy;

  it("names each key with the part and role that need it", async () => {
    const spender = baseAddress(3);
    const collateralOwner = baseAddress(4);
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
        certificate.stakeRegistration({
          stake: keyHashToRewardAddress(keyHashHex(12), 0),
          label: "stake",
        }),
        certificate.drepRegistration({
          drep: { type: "KEY", value: keyHashHex(16) },
          label: "drep",
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
          voter: { pool: keyHashHex(15) },
          votes: [{ action, vote: "yes" }],
          label: "ballot",
        }),
      ],
      { payer: payer(utxo(lovelace(ada(1000)))) },
    );
    expect(neededBy(built, keyOf(spender))).toEqual([
      { part: "spend", label: "spent", role: "input" },
    ]);
    expect(neededBy(built, keyOf(collateralOwner))).toEqual([
      { part: "collateral", label: "backing", role: "collateral" },
    ]);
    expect(neededBy(built, keyHashHex(10))).toEqual([
      { part: "guard", label: "approver", role: "guard" },
    ]);
    expect(neededBy(built, keyHashHex(11))).toEqual([
      { part: "withdrawal", label: "rewards", role: "withdrawal" },
    ]);
    expect(neededBy(built, keyHashHex(12))).toEqual([
      { part: "certificate", label: "stake", role: "certificate" },
    ]);
    expect(neededBy(built, keyHashHex(16))).toEqual([
      { part: "certificate", label: "drep", role: "certificate" },
    ]);
    expect(neededBy(built, keyHashHex(13))).toEqual([
      { part: "certificate", label: "pool", role: "certificate" },
    ]);
    expect(neededBy(built, keyHashHex(14))).toEqual([
      { part: "certificate", label: "pool", role: "poolOwner" },
    ]);
    expect(neededBy(built, keyHashHex(15))).toEqual([
      { part: "vote", label: "ballot", role: "vote" },
    ]);
    for (const keyHash of [
      keyOf(spender),
      keyOf(collateralOwner),
      ...[10, 11, 12, 13, 14, 15, 16].map(keyHashHex),
    ])
      expect(built.signers.keyHashes).toContain(keyHash);
  });

  it("lists a key once with every part that needs it, selected inputs and chosen collateral included", async () => {
    const spender = baseAddress(3);
    const built = await builder().build(
      [
        spend.pubKey({ utxo: utxo(lovelace(ada(2)), {}, spender), label: "a" }),
        spend.pubKey({ utxo: utxo(lovelace(ada(2)), {}, spender), label: "b" }),
        scriptSpend(),
        output({ address: recipient, value: { lovelace: ada(30) } }),
      ],
      { payer: payer(utxo(lovelace(ada(50))), utxo(lovelace(ada(5)))) },
    );
    expect(built.signers.keyHashes).toEqual(
      built.signers.keys.map((k) => k.keyHash),
    );
    expect(new Set(built.signers.keyHashes).size).toBe(
      built.signers.keyHashes.length,
    );
    expect(neededBy(built, keyOf(spender))).toEqual([
      { part: "spend", label: "a", role: "input" },
      { part: "spend", label: "b", role: "input" },
    ]);
    expect(built.selectedInputs.length).toBeGreaterThan(0);
    expect(built.collateral!.inputs.length).toBeGreaterThan(0);
    expect(neededBy(built, walletKey)).toEqual([
      { part: "spend", role: "input" },
      { part: "collateral", role: "collateral" },
    ]);
  });

  it("gives each part its own entry, parts of one kind and label included", async () => {
    const spender = baseAddress(3);
    const owner = keyHashHex(14);
    const built = await builder().build(
      [
        spend.pubKey({ utxo: utxo(lovelace(ada(2)), {}, spender) }),
        spend.pubKey({ utxo: utxo(lovelace(ada(2)), {}, spender) }),
        spend.pubKey({
          utxo: utxo(lovelace(ada(2)), {}, spender),
          label: "same",
        }),
        spend.pubKey({
          utxo: utxo(lovelace(ada(2)), {}, spender),
          label: "same",
        }),
        guard.pubKey({ keyHash: keyHashHex(10) }),
        guard.pubKey({ keyHash: keyHashHex(10) }),
        certificate.poolRegistration({
          params: {
            operator: keyHashHex(13),
            vrfKeyHash: vrfKeyHashHex(1),
            pledge: "1000000",
            cost: "340000000",
            margin: [1, 100],
            relays: [],
            owners: [owner, owner],
            rewardAddress: keyHashToRewardAddress(owner, 0),
          },
        }),
        output({ address: recipient, value: { lovelace: ada(520) } }),
      ],
      // Two wallet UTxOs, both needed for the output and the pool deposit
      { payer: payer(utxo(lovelace(ada(600))), utxo(lovelace(ada(600)))) },
    );
    expect(neededBy(built, keyOf(spender))).toEqual([
      { part: "spend", role: "input" },
      { part: "spend", role: "input" },
      { part: "spend", label: "same", role: "input" },
      { part: "spend", label: "same", role: "input" },
    ]);
    expect(neededBy(built, keyHashHex(10))).toEqual([
      { part: "guard", role: "guard" },
      { part: "guard", role: "guard" },
    ]);
    expect(built.selectedInputs).toHaveLength(2);
    expect(neededBy(built, walletKey)).toEqual([
      { part: "spend", role: "input" },
      { part: "spend", role: "input" },
    ]);
    // One part listing a key twice in one role is one entry
    expect(neededBy(built, owner)).toEqual([
      { part: "certificate", role: "poolOwner" },
    ]);
  });

  it("lists the keys in the order the parts first need them", async () => {
    const built = await builder().build(
      [
        guard.pubKey({ keyHash: keyHashHex(21) }),
        spend.pubKey({ utxo: utxo(lovelace(ada(5)), {}, baseAddress(5)) }),
        guard.pubKey({ keyHash: keyHashHex(20) }),
      ],
      { payer: payer(utxo(lovelace(ada(50)))) },
    );
    const order = built.parts.flatMap((p) =>
      p.kind === "guard"
        ? [p.credential.value]
        : p.kind === "spend"
          ? [keyOf(p.utxo!.address)]
          : [],
    );
    expect(built.signers.keyHashes).toEqual(Array.from(new Set(order)));
  });

  describe("native scripts", () => {
    const [k1, k2] = [keyHashHex(31), keyHashHex(32)];
    const script = (a: string, b: string): NativeScript => ({
      type: "all",
      scripts: [
        { type: "sig", keyHash: a },
        { type: "sig", keyHash: b },
      ],
    });
    const lockedBy = (native: NativeScript, n = 10) =>
      utxo(lovelace(ada(n)), {}, builder().scriptAddress(native));

    it("lists the script, not the keys it names, and prices a witness for each key", async () => {
      const native = script(k1, k2);
      const built = await builder().build(
        [
          spend.native({ utxo: lockedBy(native), script: native }),
          output({ address: recipient, value: { lovelace: ada(15) } }),
        ],
        { payer: payer(utxo(lovelace(ada(50)))) },
      );
      expect(built.signers.keyHashes).not.toContain(k1);
      expect(built.signers.keyHashes).not.toContain(k2);
      expect(built.signers.keys.map((k) => k.keyHash)).toEqual([walletKey]);
      expect(built.signers.nativeScripts).toEqual(
        built.prototype.witness_set.native_scripts,
      );
      expect(built.signers.nativeScripts).toHaveLength(1);
      expectFeeFor(built, built.signers.keyHashes.length + 2);
    });

    it("reads a script held in a reference output", async () => {
      const native = script(k1, k2);
      const holder = utxo(lovelace(ada(20)), { script: nativeRefOf(native) });
      const built = await builder().build(
        [
          spend.native({
            utxo: lockedBy(native),
            script: { reference: holder },
          }),
          output({ address: recipient, value: { lovelace: ada(15) } }),
        ],
        { payer: payer(utxo(lovelace(ada(50))), holder) },
      );
      expect(built.prototype.witness_set.native_scripts).toBeUndefined();
      expect(built.signers.nativeScripts).toHaveLength(1);
      expect(built.signers.nativeScripts[0]).toMatchObject({
        type: "SCRIPT_ALL",
      });
      expect(built.signers.keyHashes).toEqual([walletKey]);
      expectFeeFor(built, built.signers.keyHashes.length + 2);
    });

    it("lists a key both a script and an input need for the input only, and prices it once", async () => {
      const native = script(walletKey, k2);
      const built = await builder().build(
        [
          spend.native({ utxo: lockedBy(native), script: native }),
          output({ address: recipient, value: { lovelace: ada(15) } }),
        ],
        { payer: payer(utxo(lovelace(ada(50)))) },
      );
      expect(built.selectedInputs).toHaveLength(1);
      expect(built.signers.keyHashes).toEqual([walletKey]);
      expect(built.signers.keys[0]!.neededBy).toEqual([
        { part: "spend", role: "input" },
      ]);
      expectFeeFor(built, built.signers.keyHashes.length + 1);
    });

    it("lists a script two parts run once", async () => {
      const native = script(k1, k2);
      const built = await builder().build(
        [
          spend.native({ utxo: lockedBy(native), script: native }),
          spend.native({ utxo: lockedBy(native), script: native }),
          output({ address: recipient, value: { lovelace: ada(25) } }),
        ],
        { payer: payer(utxo(lovelace(ada(50)))) },
      );
      expect(built.signers.nativeScripts).toHaveLength(1);
    });
  });

  it("lists the Byron addresses spent from, and nothing else", async () => {
    const byron = "Ae2tdPwUPEZ4YjgvykNpoFeYUxoyhNj2kg8KfKWN2FizsSpLUPv68MpTVDo";
    const shelley = serializeAddressObj(pubKeyAddress(keyHashHex(1)), 1);
    const mainnet = new TxBuilder({ network: "mainnet", params });
    const funds = utxo(lovelace(ada(50)), {}, shelley);
    const built = await mainnet.build(
      [
        spend.pubKey({ utxo: utxo(lovelace(ada(5)), {}, byron) }),
        output({ address: shelley, value: { lovelace: ada(10) } }),
      ],
      { payer: { changeAddress: shelley, utxos: [funds] } },
    );
    expect(built.signers.byronAddresses).toEqual([byron]);
    expect(built.signers.keyHashes).toEqual([keyHashHex(1)]);

    const plain = await mainnet.build(
      [output({ address: shelley, value: { lovelace: ada(10) } })],
      { payer: { changeAddress: shelley, utxos: [funds] } },
    );
    expect(plain.signers.byronAddresses).toEqual([]);
  });
});

describe("BuiltTx: redeemers, validity and network", () => {
  it("reports redeemer units as bigints and the redeemer data in CBOR", async () => {
    const events: BuildEvent[] = [];
    const built = await builder().build([scriptSpend(locked(), "unlock")], {
      payer: payer(utxo(lovelace(ada(50)))),
      trace: (e) => events.push(e),
    });
    const [redeemer] = built.redeemers;
    expect(redeemer).toMatchObject({
      tag: "SPEND",
      exUnits: { mem: 1000n, steps: 2000n },
      data: "d87980",
      label: "unlock",
    });
    const carried = built.prototype.witness_set.redeemers![0]!.data;
    expect(
      carried.type === "CBOR"
        ? carried.hex
        : plutusDataVariantToCardano(carried).toCbor().toString(),
    ).toBe(redeemer!.data);
    const evaluated = events.filter(
      (e): e is Extract<BuildEvent, { type: "evaluated" }> =>
        e.type === "evaluated",
    );
    expect(evaluated.length).toBeGreaterThan(0);
    expect(evaluated[evaluated.length - 1]!.redeemers).toEqual(built.redeemers);
  });

  it("reports the validity interval in slots and in POSIX milliseconds", async () => {
    const b = builder();
    const pay = output({ address: recipient, value: { lovelace: ada(2) } });
    const funds = payer(utxo(lovelace(ada(50))));
    const none = await b.build([pay], { payer: funds });
    expect(none.validity).toBeUndefined();
    expect("validity" in none).toBe(false);

    const upper = await b.build(
      [pay, validity({ invalidHereafter: 50_001_000 })],
      { payer: funds },
    );
    expect(upper.validity).toEqual({
      invalidHereafter: 50_001_000,
      until: b.timeAt(50_001_000),
    });

    const both = await b.build(
      [
        pay,
        validity({ invalidBefore: 50_000_000, invalidHereafter: 50_001_000 }),
      ],
      { payer: funds },
    );
    expect(both.validity).toEqual({
      invalidBefore: 50_000_000,
      invalidHereafter: 50_001_000,
      from: b.timeAt(50_000_000),
      until: b.timeAt(50_001_000),
    });

    // Times inside a slot: the result gives the times the body's slots start at
    const from = b.timeAt(50_000_000) + 400;
    const until = b.timeAt(50_001_000) + 400;
    const timed = await b.build([pay, validity({ from, until })], {
      payer: funds,
    });
    const body = timed.prototype.body;
    expect(timed.validity).toEqual({
      invalidBefore: Number(body.validity_start_interval),
      invalidHereafter: Number(body.ttl),
      from: b.timeAt(Number(body.validity_start_interval)),
      until: b.timeAt(Number(body.ttl)),
    });
    expect(timed.validity!.from).not.toBe(from);
    expect(timed.validity!.until).not.toBe(until);
  });

  it("names the builder's network", async () => {
    const pay = output({ address: recipient, value: { lovelace: ada(2) } });
    const funds = payer(utxo(lovelace(ada(50))));
    expect((await builder().build([pay], { payer: funds })).network).toEqual({
      name: "preprod",
      networkId: 0,
    });
    const devnet = customNetwork({
      name: "devnet",
      systemStart: "2026-01-01T00:00:00Z",
      slotLengthMs: 200,
      epochLength: 500,
    });
    const built = await new TxBuilder({ network: devnet, params }).build(
      [pay],
      { payer: funds },
    );
    expect(built.network).toEqual({ name: "devnet", networkId: 0 });
  });
});

describe("BuiltTx: warnings", () => {
  afterEach(() => jest.restoreAllMocks());
  const codes = (built: BuiltTx) => built.warnings.map((w) => w.code);

  describe.each([
    ["a payment", [] as TxPart[]],
    ["a Plutus spend", [scriptSpend()]],
  ])("FEE_ABOVE_MINIMUM for %s", (_, extra) => {
    it("is reported for a given fee above the minimum, and not at it", async () => {
      const parts = () => [
        ...extra,
        output({ address: recipient, value: { lovelace: ada(2) } }),
      ];
      const funds = payer(utxo(lovelace(ada(50))));
      const tooLow = await caught(
        builder().build(parts(), { payer: funds, fee: 100_000n }),
      );
      expect(tooLow.code).toBe("FEE_TOO_LOW");
      const minimum = (tooLow as TxBuildError<"FEE_TOO_LOW">).details.minFee;

      const at = await builder().build(parts(), {
        payer: funds,
        fee: minimum,
      });
      expect(codes(at)).not.toContain("FEE_ABOVE_MINIMUM");

      const above = await builder().build(parts(), {
        payer: funds,
        fee: minimum + 1n,
      });
      expect(above.fee).toBe(minimum + 1n);
      const warning = above.warnings.find(
        (w) => w.code === "FEE_ABOVE_MINIMUM",
      );
      expect(warning).toBeDefined();
      expect(warning!.message).toContain(String(minimum + 1n));
      expect(warning!.message).toContain(String(minimum));
      expect(warning!.part).toBeUndefined();

      const free = await builder().build(parts(), { payer: funds });
      expect(codes(free)).not.toContain("FEE_ABOVE_MINIMUM");
    });
  });

  it("reports COLLATERAL_FORFEITED when the transaction has collateral and no collateral return", async () => {
    const funds = payer(utxo(lovelace(ada(10))));
    // What is left of the collateral is too little to return
    const tight = await builder().build(
      [scriptSpend(locked(1)), collateral({ utxo: utxo(lovelace(ada(1))) })],
      { payer: funds },
    );
    expect(tight.prototype.body.collateral_return).toBeUndefined();
    const warning = tight.warnings.find(
      (w) => w.code === "COLLATERAL_FORFEITED",
    );
    expect(warning).toBeDefined();
    expect(warning!.part).toBeUndefined();

    // Collateral that equals the stated total
    const whole = await builder().build(
      [
        scriptSpend(),
        collateral({ utxo: utxo(lovelace(ada(20))) }),
        collateralReturn({ address: wallet, totalCollateral: ada(20) }),
      ],
      { payer: funds },
    );
    expect(whole.prototype.body.collateral_return).toBeUndefined();
    expect(codes(whole)).toContain("COLLATERAL_FORFEITED");

    const returned = await builder().build([scriptSpend()], {
      payer: payer(utxo(lovelace(ada(10))), utxo(lovelace(ada(5)))),
    });
    expect(returned.prototype.body.collateral_return).toBeDefined();
    expect(codes(returned)).toEqual([]);

    const noScripts = await builder().build(
      [output({ address: recipient, value: { lovelace: ada(2) } })],
      { payer: funds },
    );
    expect(noScripts.collateral).toBeUndefined();
    expect(noScripts.warnings).toEqual([]);
  });

  it("reports the three codes together, none of them stopping the build", async () => {
    const b = builder();
    const now = b.timeAt(50_000_000);
    jest.spyOn(Date, "now").mockReturnValue(now);
    const built = await b.build(
      [
        scriptSpend(),
        collateral({ utxo: utxo(lovelace(ada(2))) }),
        collateralReturn({ address: wallet, totalCollateral: ada(2) }),
        validity({ invalidBefore: 50_000_010 }),
      ],
      { payer: payer(utxo(lovelace(ada(50)))), fee: ada(1) },
    );
    expect(codes(built).sort()).toEqual([
      "COLLATERAL_FORFEITED",
      "FEE_ABOVE_MINIMUM",
      "VALID_FROM_FUTURE",
    ]);
  });
});

describe("BuiltTx: plain data", () => {
  it("survives structuredClone unchanged", async () => {
    const b = builder();
    const built = await b.build(
      [
        scriptSpend(locked(), "unlock"),
        referenceInput({ utxo: utxo(lovelace(ada(2))) }),
        output({
          address: recipient,
          value: { lovelace: ada(2) },
          label: "pay",
        }),
        collateral({ utxo: utxo(lovelace(ada(2))) }),
        collateralReturn({ address: wallet, totalCollateral: ada(2) }),
        validity({ invalidBefore: 50_000_000 }),
      ],
      { payer: payer(utxo(lovelace(ada(50)))), fee: ada(1) },
    );
    expect(built.change.length).toBeGreaterThan(0);
    expect(built.referenceInputs).toHaveLength(1);
    expect(built.warnings.length).toBeGreaterThan(0);
    expect(structuredClone(built)).toEqual(built);
    // structuredClone turns a class instance into a plain object, and jest's equality does not
    // tell the two apart: every object of the result has to be a plain object or an array. The
    // prototypes are compared by shape, as the test runs in a realm of its own and plain objects
    // made by structuredClone have the prototypes of another
    const isObjectPrototype = (proto: object | null) =>
      proto === null || Object.getPrototypeOf(proto) === null;
    const notPlain: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (typeof value === "function") notPlain.push(path);
      if (typeof value !== "object" || value === null) return;
      const proto = Object.getPrototypeOf(value);
      const plain = Array.isArray(value)
        ? proto.constructor.name === "Array" &&
          isObjectPrototype(Object.getPrototypeOf(proto))
        : isObjectPrototype(proto);
      if (!plain) notPlain.push(path);
      for (const [key, member] of Object.entries(value))
        walk(member, `${path}.${key}`);
    };
    walk(built, "built");
    expect(notPlain).toEqual([]);
  });
});
