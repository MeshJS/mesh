import {
  Action,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IEvaluator,
  mConStr0,
  Protocol,
} from "@meshsdk/core";
import {
  resolvePlutusScriptAddress,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  BuildOptions,
  BuiltTx,
  collateral,
  collateralReturn,
  OutputDatum,
  PartsInput,
  referenceInput,
  spend,
  TxBuilder,
  TxBuildError,
  TxBuildErrorCode,
  TxError,
  Utxo,
} from "../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress } from "../test-util";

const network = "preprod";
const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const wallet = baseAddress(1);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const unitInline: OutputDatum = {
  type: "inline",
  data: { type: "CBOR", content: "d87980" },
};
const token = `${"ab".repeat(28)}746f6b656e`;

const ada = (n: number) => BigInt(n) * 1_000_000n;
let nextHash = 0x700;
/** A UTxO of the wallet */
const utxo = (lovelace: bigint, tokens: Record<string, bigint> = {}): Utxo => ({
  txHash: (++nextHash).toString(16).padStart(64, "e"),
  outputIndex: 0,
  address: wallet,
  value: { lovelace, ...tokens },
});
/** `txHash#index` of a UTxO */
const keyOf = (u: Utxo) => `${u.txHash}#${u.outputIndex}`;
const keysOf = (utxos: readonly Utxo[]) => utxos.map(keyOf);
const lovelaceIn = (utxos: readonly Utxo[]) =>
  utxos.reduce((total, u) => total + u.value.lovelace, 0n);

const caught = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected an error");
};

const expectCode = async <C extends TxBuildErrorCode>(
  run: () => unknown,
  code: C,
): Promise<TxBuildError<C>> => {
  const error = await caught(run);
  expect(error).toBeInstanceOf(TxBuildError);
  expect((error as TxBuildError).code).toBe(code);
  expect(TxError.is(error, code)).toBe(true);
  return error as TxBuildError<C>;
};

/** Redeemer tags as `IEvaluator` reports them, by the ledger's tag number */
const TAGS: Action["tag"][] = [
  "SPEND",
  "MINT",
  "CERT",
  "REWARD",
  "VOTE",
  "PROPOSE",
];

/** Prices every redeemer at the units `budget` gives for the evaluation number */
const evaluatorOf = (
  budget: (evaluation: number) => { mem: number; steps: number } = () => ({
    mem: 1000,
    steps: 2000,
  }),
): IEvaluator => {
  let evaluations = 0;
  return {
    evaluateTx: async (tx) => {
      const units = budget(++evaluations);
      return (
        Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ??
        []
      ).map((r) => ({
        tag: TAGS[r.tag()]!,
        index: Number(r.index()),
        budget: units,
      }));
    },
  };
};

const scripted = (
  options: { evaluator?: IEvaluator; params?: Protocol } = {},
) =>
  new TxBuilder({
    network,
    params: options.params ?? params,
    costModels,
    evaluator: options.evaluator ?? evaluatorOf(),
  });

let nextLock = 0;
/** A spend of an always-succeeding script's output, which pays for its transaction */
const scriptSpend = (lovelace = ada(10)) =>
  spend.plutus({
    utxo: {
      txHash: (0xd0 + ++nextLock).toString(16).repeat(32),
      outputIndex: 0,
      address: scriptAddress,
      value: { lovelace },
      datum: unitInline,
    },
    script: plutusScript,
    redeemer: { data: mConStr0([]) },
  });

/** A build from the wallet's UTxOs */
const build = (
  parts: PartsInput,
  utxos: Utxo[],
  options: Omit<BuildOptions, "payer"> = {},
  builder = scripted(),
) =>
  builder.build(parts, {
    payer: { changeAddress: wallet, utxos },
    ...options,
  });

/** The collateral parts of a built transaction, by out ref, with their labels */
const collateralLabels = (built: BuiltTx) =>
  built.parts.flatMap((p) =>
    p.kind === "collateral"
      ? [[`${p.input.transaction_id}#${p.input.index}`, p.label] as const]
      : [],
  );

/** Checks that the collateral inputs hold exactly the total and the return, token by token */
const expectBalanced = (built: BuiltTx) => {
  const { inputs, total, return: returned } = built.collateral!;
  const held: Record<string, bigint> = {};
  for (const u of inputs)
    for (const [unit, n] of Object.entries(u.value))
      held[unit] = (held[unit] ?? 0n) + n;
  const out: Record<string, bigint> = { lovelace: total };
  for (const [unit, n] of Object.entries(returned?.value ?? {}))
    out[unit] = (out[unit] ?? 0n) + n;
  expect(out).toEqual(held);
  expect(new Set(keysOf(inputs)).size).toBe(inputs.length);
  expect(inputs.length).toBeLessThanOrEqual(params.maxCollateralInputs);
};

describe("TxBuilder: topping up given collateral", () => {
  it("builds the same transaction from given inputs that cover, whatever the option", async () => {
    const own = [utxo(ada(3)), utxo(ada(10))];
    const cases: { name: string; parts: PartsInput; inputs: number }[] = [
      {
        name: "with a return",
        parts: [scriptSpend(), collateral({ utxo: utxo(ada(5)), label: "c" })],
        inputs: 1,
      },
      {
        // Too little is left to return: all of it is forfeited, as before
        name: "forfeited whole",
        parts: [scriptSpend(), collateral({ utxo: utxo(400_000n) })],
        inputs: 1,
      },
      {
        name: "of a stated total",
        parts: [
          scriptSpend(),
          collateral({ utxo: utxo(ada(2)) }),
          collateral({ utxo: utxo(ada(2)) }),
          collateralReturn({ address: wallet, totalCollateral: ada(3) }),
        ],
        inputs: 2,
      },
    ];
    for (const { name, parts, inputs } of cases) {
      const left = await build(parts, own);
      const on = await build(parts, own, { topUpCollateral: true });
      const off = await build(parts, own, { topUpCollateral: false });
      expect([name, on.tx]).toEqual([name, left.tx]);
      expect([name, off.tx]).toEqual([name, left.tx]);
      expect(left.collateral!.inputs).toHaveLength(inputs);
      expect(keysOf(left.collateral!.inputs)).not.toEqual(
        expect.arrayContaining(keysOf(own)),
      );
    }
  });

  it("adds the smallest lovelace-only UTxO that leaves a return, after the given input", async () => {
    const dust = utxo(100_000n);
    const small = utxo(ada(1));
    const three = utxo(ada(3));
    const ten = utxo(ada(10));
    const tokens = utxo(ada(2), { [token]: 5n });
    const built = await build(
      [scriptSpend(), collateral({ utxo: dust, label: "mine" })],
      [ten, tokens, three, small],
    );
    const { inputs, total, return: returned } = built.collateral!;
    expect(keysOf(inputs)).toEqual([keyOf(dust), keyOf(three)]);
    expect(built.prototype.body.collateral).toEqual(
      inputs.map((u) => ({ transaction_id: u.txHash, index: u.outputIndex })),
    );
    expect(total).toBe(
      (built.fee * BigInt(params.collateralPercent) + 99n) / 100n,
    );
    expect(returned!.value).toEqual({ lovelace: 3_100_000n - total });
    expect(returned!.address).toBe(wallet);
    expect(built.prototype.body.total_collateral).toBe(total.toString());
    expectBalanced(built);
    // The given part keeps its label; the added input has none
    expect(collateralLabels(built)).toEqual([
      [keyOf(dust), "mine"],
      [keyOf(three), undefined],
    ]);
  });

  it("adds the smallest that covers when none leaves a return, and forfeits all of it", async () => {
    const dust = utxo(100_000n);
    const small = utxo(ada(1));
    const built = await build(
      [scriptSpend(), collateral({ utxo: dust })],
      [utxo(ada(2), { [token]: 1n }), small],
    );
    expect(keysOf(built.collateral!.inputs)).toEqual([
      keyOf(dust),
      keyOf(small),
    ]);
    expect(built.collateral!.total).toBe(1_100_000n);
    expect(built.collateral!.return).toBeUndefined();
    expect(built.warnings.map((w) => w.code)).toContain("COLLATERAL_FORFEITED");
    expectBalanced(built);
  });

  it("adds the largest ones, given and added within maxCollateralInputs", async () => {
    const dust = utxo(100_000n);
    const pool = Array.from({ length: 5 }, () => utxo(300_000n));
    const parts = [
      scriptSpend(),
      collateral({ utxo: dust }),
      collateralReturn({ address: wallet, totalCollateral: ada(1) }),
    ];
    // Three more are needed, and only two fit
    const error = await expectCode(
      () => build(parts, pool),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(error.details).toEqual({ required: ada(1), available: 700_000n });
    expect(error.message).toContain("no 2 more UTxOs added to them cover it");

    const four = { ...params, maxCollateralInputs: 4 };
    const built = await build(parts, pool, {}, scripted({ params: four }));
    const { inputs } = built.collateral!;
    expect(inputs).toHaveLength(4);
    expect(keyOf(inputs[0]!)).toBe(keyOf(dust));
    expect(built.collateral!.total).toBe(ada(1));
    expect(built.collateral!.return).toBeUndefined();
    expect(lovelaceIn(inputs)).toBe(ada(1));
  });

  it("adds nothing when the given inputs already fill maxCollateralInputs", async () => {
    const given = [utxo(50_000n), utxo(50_000n), utxo(50_000n)];
    const error = await expectCode(
      () =>
        build(
          [scriptSpend(), ...given.map((u) => collateral({ utxo: u }))],
          [utxo(ada(10))],
        ),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(error.details.available).toBe(150_000n);
    expect(error.message).toContain("a transaction puts up at most 3");
  });

  it("never adds a UTxO a part reads, one canSelect refuses, or a given one again", async () => {
    // Each of the three would be the one added, before the larger one that is
    const given = utxo(1_600_000n);
    const read = utxo(ada(3));
    const refused = utxo(ada(4));
    const kept = utxo(ada(10));
    const asked: string[] = [];
    const built = await build(
      [
        scriptSpend(),
        collateral({ utxo: given }),
        collateralReturn({ address: wallet, totalCollateral: ada(2) }),
        referenceInput({ utxo: read }),
      ],
      // The given UTxO is the payer's own, listed twice
      [given, read, refused, given, kept],
      {
        canSelect: (u) => {
          asked.push(keyOf(u));
          return keyOf(u) !== keyOf(refused);
        },
      },
    );
    expect(keysOf(built.collateral!.inputs)).toEqual([
      keyOf(given),
      keyOf(kept),
    ]);
    expectBalanced(built);
    expect(asked).toContain(keyOf(refused));
  });

  it("is INSUFFICIENT_COLLATERAL with topUpCollateral: false, naming the given part", async () => {
    const dust = utxo(100_000n);
    const error = await expectCode(
      () =>
        build(
          [scriptSpend(), collateral({ utxo: dust, label: "c" })],
          [utxo(ada(10))],
          { topUpCollateral: false },
        ),
      "INSUFFICIENT_COLLATERAL",
    );
    const { required, available } = error.details;
    expect(available).toBe(100_000n);
    expect(required).toBeGreaterThan(100_000n);
    expect(error).toMatchObject({ part: "collateral", label: "c" });
    expect(error.message).toBe(
      `collateral "c": the collateral inputs cannot cover ${required} lovelace and return the rest`,
    );
  });

  it("is INSUFFICIENT_COLLATERAL with the given inputs counted when nothing can be added", async () => {
    const dust = utxo(100_000n);
    for (const utxos of [[dust], [dust, utxo(ada(10), { [token]: 1n })]]) {
      const error = await expectCode(
        () =>
          build(
            [
              scriptSpend(),
              collateral({ utxo: dust, label: "c" }),
              collateralReturn({ address: wallet, totalCollateral: ada(20) }),
            ],
            utxos,
          ),
        "INSUFFICIENT_COLLATERAL",
      );
      expect(error.details.required).toBe(ada(20));
      expect(error).toMatchObject({ part: "collateral", label: "c" });
      expect(error.details.available).toBe(lovelaceIn(utxos));
    }
    const none = await expectCode(
      () => build([scriptSpend(), collateral({ utxo: dust })], [dust]),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(none.details.available).toBe(100_000n);
    expect(none.details.required).toBeGreaterThan(100_000n);
    expect(none.message).toContain(
      "and no key-locked UTxO is available to add to them",
    );
  });

  it("tops up to the total a collateral return part states", async () => {
    const given = utxo(ada(2));
    const five = utxo(ada(5));
    const built = await build(
      [
        scriptSpend(),
        collateral({ utxo: given }),
        collateralReturn({
          address: baseAddress(9),
          totalCollateral: ada(5),
          label: "ret",
        }),
      ],
      [utxo(ada(10)), five],
    );
    expect(keysOf(built.collateral!.inputs)).toEqual([
      keyOf(given),
      keyOf(five),
    ]);
    expect(built.collateral!.total).toBe(ada(5));
    expect(built.collateral!.return).toMatchObject({
      address: baseAddress(9),
      value: { lovelace: ada(2) },
    });
    expect(built.prototype.body.total_collateral).toBe(ada(5).toString());
    expect(built.parts.find((p) => p.kind === "collateralReturn")?.label).toBe(
      "ret",
    );
    expectBalanced(built);
  });

  it("keeps the given parts first, in their order and with their labels", async () => {
    const a = utxo(60_000n);
    const b = utxo(50_000n, { [token]: 2n });
    const three = utxo(ada(3));
    const built = await build(
      [
        scriptSpend(),
        collateral({ utxo: a, label: "a" }),
        collateral({ utxo: b, label: "b" }),
      ],
      [three],
    );
    expect(keysOf(built.collateral!.inputs)).toEqual([
      keyOf(a),
      keyOf(b),
      keyOf(three),
    ]);
    expect(collateralLabels(built)).toEqual([
      [keyOf(a), "a"],
      [keyOf(b), "b"],
      [keyOf(three), undefined],
    ]);
    // The given token is returned
    expect(built.collateral!.return!.value[token]).toBe(2n);
    expectBalanced(built);
  });

  it("applies the rule in the round whose units call for more collateral", async () => {
    // The first evaluation's fee is covered by the given input, the second's is not
    const growing = () =>
      evaluatorOf((n) =>
        n === 1
          ? { mem: 1000, steps: 2000 }
          : { mem: 4_000_000, steps: 2_000_000_000 },
      );
    const given = utxo(500_000n);
    const parts = [scriptSpend(), collateral({ utxo: given })];
    const once = await build(
      parts,
      [utxo(ada(3))],
      {
        topUpCollateral: false,
      },
      scripted({ evaluator: evaluatorOf() }),
    );
    expect(keysOf(once.collateral!.inputs)).toEqual([keyOf(given)]);

    const three = utxo(ada(3));
    const built = await build(
      parts,
      [three],
      {},
      scripted({ evaluator: growing() }),
    );
    expect(keysOf(built.collateral!.inputs)).toEqual([
      keyOf(given),
      keyOf(three),
    ]);
    expect(built.collateral!.total).toBe(
      (built.fee * BigInt(params.collateralPercent) + 99n) / 100n,
    );
    expect(built.collateral!.total).toBeGreaterThan(500_000n);
    expectBalanced(built);

    await expectCode(
      () =>
        build(
          parts,
          [utxo(ada(3))],
          { topUpCollateral: false },
          scripted({ evaluator: growing() }),
        ),
      "INSUFFICIENT_COLLATERAL",
    );
  });

  it("is INSUFFICIENT_COLLATERAL when the only UTxO that holds a stated total leaves too little to return", async () => {
    const parts = [
      scriptSpend(),
      collateralReturn({ address: wallet, totalCollateral: ada(3) }),
    ];
    // Chosen by the builder: 0.5 ADA cannot be returned, and a stated total is not forfeited
    const only = utxo(3_500_000n);
    const own = await expectCode(
      () => build(parts, [only]),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(own.details).toEqual({ required: ada(3), available: 3_500_000n });
    expect(own.message).toBe(
      "the only UTxO that can be put up as collateral does not cover 3000000 lovelace and return the rest",
    );
    const one = utxo(ada(1));
    const built = await build(parts, [only, one]);
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(only), keyOf(one)]);
    expect(built.collateral!.total).toBe(ada(3));
    expect(built.collateral!.return!.value).toEqual({ lovelace: 1_500_000n });
    expectBalanced(built);

    // Topped up: the given input and the one UTxO that can be added leave 0.5 ADA
    const given = utxo(100_000n);
    const toppedParts = [...parts, collateral({ utxo: given, label: "c" })];
    const added = utxo(3_400_000n);
    const topped = await expectCode(
      () => build(toppedParts, [added]),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(topped.details).toEqual({ required: ada(3), available: 3_500_000n });
    expect(topped.message).toBe(
      'collateral "c": the collateral inputs cannot cover 3000000 lovelace and return the rest, and the only UTxO that can be added to them does not make them cover it',
    );
    const toppedBuilt = await build(toppedParts, [added, one]);
    expect(keysOf(toppedBuilt.collateral!.inputs)).toEqual([
      keyOf(given),
      keyOf(added),
      keyOf(one),
    ]);
    expect(toppedBuilt.collateral!.return!.value).toEqual({
      lovelace: 1_500_000n,
    });
    expectBalanced(toppedBuilt);
  });

  it("names the UTxOs tried when the choice runs out of them before maxCollateralInputs", async () => {
    const parts = [
      scriptSpend(),
      collateralReturn({ address: wallet, totalCollateral: ada(20) }),
    ];
    const pool = [utxo(ada(2)), utxo(ada(3))];
    const own = await expectCode(
      () => build(parts, pool),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(own.details).toEqual({ required: ada(20), available: ada(5) });
    expect(own.message).toBe(
      "the 2 UTxOs that can be put up as collateral do not cover 20000000 lovelace and return the rest",
    );
    const given = utxo(100_000n);
    const topped = await expectCode(
      () => build([...parts, collateral({ utxo: given })], pool.slice(0, 1)),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(topped.details).toEqual({
      required: ada(20),
      available: 2_100_000n,
    });
    // One given input leaves room for two, and only one could be added
    expect(topped.message).toBe(
      "collateral: the collateral inputs cannot cover 20000000 lovelace and return the rest, and the only UTxO that can be added to them does not make them cover it",
    );
  });

  it("takes one UTxO holding tokens alone when the largest lovelace-only ones leave too little to return", async () => {
    const tokens = utxo(ada(50), { [token]: 5n });
    // Tops up: 0.1 + 1.5 + 1.45 ADA is 3.05 ADA, and 0.05 ADA cannot be returned
    const given = utxo(100_000n);
    const parts = [
      scriptSpend(),
      collateral({ utxo: given, label: "c" }),
      collateralReturn({ address: wallet, totalCollateral: ada(3) }),
    ];
    const topped = await build(parts, [
      utxo(1_500_000n),
      tokens,
      utxo(1_450_000n),
    ]);
    expect(keysOf(topped.collateral!.inputs)).toEqual([
      keyOf(given),
      keyOf(tokens),
    ]);
    expect(topped.collateral!.total).toBe(ada(3));
    expect(topped.collateral!.return!.value).toEqual({
      lovelace: 47_100_000n,
      [token]: 5n,
    });
    expect(collateralLabels(topped)[0]).toEqual([keyOf(given), "c"]);
    expectBalanced(topped);

    // Chosen by the builder: 1.1 + 1.0 + 0.95 ADA leaves 0.05 ADA
    const ownParts = [
      scriptSpend(),
      collateralReturn({ address: wallet, totalCollateral: ada(3) }),
    ];
    const own = await build(ownParts, [
      utxo(1_100_000n),
      tokens,
      utxo(ada(1)),
      utxo(950_000n),
    ]);
    expect(keysOf(own.collateral!.inputs)).toEqual([keyOf(tokens)]);
    expect(own.collateral!.total).toBe(ada(3));
    expect(own.collateral!.return!.value).toEqual({
      lovelace: ada(47),
      [token]: 5n,
    });
    expectBalanced(own);

    // A UTxO holding tokens that does not cover either: the shortfall of the pool
    const short = utxo(2_500_000n, { [token]: 5n });
    const toppedShort = await expectCode(
      () => build(parts, [utxo(1_500_000n), short, utxo(1_450_000n)]),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(toppedShort.details).toEqual({
      required: ada(3),
      available: 3_050_000n,
    });
    expect(toppedShort.message).toBe(
      'collateral "c": the collateral inputs cannot cover 3000000 lovelace and return the rest, and no 2 more UTxOs added to them cover it',
    );
    const ownShort = await expectCode(
      () =>
        build(ownParts, [
          utxo(1_100_000n),
          short,
          utxo(ada(1)),
          utxo(950_000n),
        ]),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(ownShort.details).toEqual({
      required: ada(3),
      available: 3_050_000n,
    });
    expect(ownShort.message).toBe(
      "no 3 UTxOs cover the 3000000 lovelace collateral",
    );
  });

  it("is INVALID_OPTION for a topUpCollateral that is not a boolean", async () => {
    for (const value of ["yes", 1, null, {}]) {
      const error = await expectCode(
        () =>
          build([scriptSpend()], [utxo(ada(10))], {
            topUpCollateral: value as never,
          }),
        "INVALID_OPTION",
      );
      expect(error.details).toEqual({
        option: "topUpCollateral",
        value,
        allowed: "a boolean",
      });
    }
  });
});
