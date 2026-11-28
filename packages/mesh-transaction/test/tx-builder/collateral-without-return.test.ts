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
  BuiltTxData,
  collateral,
  CollateralPart,
  collateralReturn,
  OutputDatum,
  PartsInput,
  spend,
  TxBuilder,
  TxBuildError,
  TxBuildErrorCode,
  TxError,
  Utxo,
} from "../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
} from "../test-util";

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
const noReturn = { collateralReturn: false } as const;

const ada = (n: number) => BigInt(n) * 1_000_000n;
let nextHash = 0x900;
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
/** The collateral the ledger asks of a fee */
const minimumFor = (fee: bigint) =>
  (fee * BigInt(params.collateralPercent) + 99n) / 100n;

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

/** Prices every redeemer at fixed units */
const evaluator: IEvaluator = {
  evaluateTx: async (tx) =>
    (
      Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ?? []
    ).map((r) => ({
      tag: TAGS[r.tag()]!,
      index: Number(r.index()),
      budget: { mem: 1000, steps: 2000 },
    })),
};

const scripted = (options: { params?: Protocol } = {}) =>
  new TxBuilder({
    network,
    params: options.params ?? params,
    costModels,
    evaluator,
  });

let nextLock = 0;
/** A spend of an always-succeeding script's output, which pays for its transaction */
const scriptSpend = (lovelace = ada(10)) =>
  spend.plutus({
    utxo: {
      txHash: (0x60 + ++nextLock).toString(16).repeat(32),
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

/** The collateral fields of the serialized body */
const bodyCollateral = (built: BuiltTxData) => {
  const body = Transaction.fromCbor(TxCBOR(built.tx)).body();
  return {
    inputs: (body.collateral()?.values() ?? []).map(
      (i) => `${i.transactionId()}#${i.index()}`,
    ),
    return: body.collateralReturn(),
    total: body.totalCollateral(),
  };
};

/**
 * Checks a collateral without a return: lovelace-only inputs, all of their lovelace at stake and
 * at least what the fee calls for, and the transaction states neither a return nor a total
 */
const expectAtStake = (
  built: BuiltTxData,
  limit = params.maxCollateralInputs,
) => {
  const { inputs, total } = built.collateral!;
  expect(built.collateral!.return).toBeUndefined();
  expect(Object.keys(built.collateral!)).toEqual(["inputs", "total"]);
  for (const u of inputs) expect(Object.keys(u.value)).toEqual(["lovelace"]);
  expect(total).toBe(lovelaceIn(inputs));
  expect(total).toBeGreaterThanOrEqual(minimumFor(built.fee));
  expect(new Set(keysOf(inputs)).size).toBe(inputs.length);
  expect(inputs.length).toBeLessThanOrEqual(limit);
  expect(bodyCollateral(built)).toEqual({
    inputs: keysOf(inputs),
    return: undefined,
    total: undefined,
  });
  expect(built.prototype.body.collateral_return).toBeUndefined();
  expect(built.prototype.body.total_collateral).toBeUndefined();
  expect(built.parts.some((p) => p.kind === "collateralReturn")).toBe(false);
  const forfeited = built.warnings.filter(
    (w) => w.code === "COLLATERAL_FORFEITED",
  );
  expect(forfeited).toEqual([
    {
      code: "COLLATERAL_FORFEITED",
      message:
        "the transaction has no collateral return: all of its collateral is forfeited if a script fails",
    },
  ]);
};

describe("TxBuilder: collateral without a return", () => {
  it("puts up the collateral it chooses with neither a return nor a total", async () => {
    const pool = [utxo(ada(10)), utxo(ada(3))];
    const built = await build([scriptSpend()], pool, noReturn);
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(pool[1]!)]);
    expect(built.collateral!.total).toBe(ada(3));
    expectAtStake(built);

    // With a return, the same UTxO states the total the fee calls for and returns the rest
    const returned = await build([scriptSpend()], pool);
    expect(keysOf(returned.collateral!.inputs)).toEqual([keyOf(pool[1]!)]);
    const body = bodyCollateral(returned);
    expect(body.total).toBe(returned.collateral!.total);
    expect(body.return?.amount().coin()).toBe(
      ada(3) - returned.collateral!.total,
    );
    expect(returned.warnings).toEqual([]);
  });

  it("builds the same transaction with collateralReturn: true as with the option left out", async () => {
    const own = [utxo(ada(3)), utxo(ada(10))];
    const shapes: { name: string; parts: PartsInput }[] = [
      { name: "chosen", parts: [scriptSpend()] },
      {
        name: "given",
        parts: [scriptSpend(), collateral({ utxo: utxo(ada(5)), label: "c" })],
      },
      {
        name: "forfeited whole",
        parts: [scriptSpend(), collateral({ utxo: utxo(400_000n) })],
      },
      {
        name: "of a stated total",
        parts: [
          scriptSpend(),
          collateral({ utxo: utxo(ada(2), { [token]: 1n }) }),
          collateralReturn({ address: wallet, totalCollateral: ada(1) }),
        ],
      },
    ];
    for (const { name, parts } of shapes) {
      const left = await build(parts, own);
      const on = await build(parts, own, { collateralReturn: true });
      expect([name, on.tx]).toEqual([name, left.tx]);
      expect([name, on.collateral]).toEqual([name, left.collateral]);
    }
  });

  it("puts up the smallest lovelace-only UTxO that covers, where a return would take a larger one", async () => {
    const large = utxo(ada(100));
    const five = utxo(ada(5));
    const small = utxo(400_000n);
    const pool = [large, five, small];
    const built = await build([scriptSpend()], pool, noReturn);
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(small)]);
    expect(built.collateral!.total).toBe(400_000n);
    expectAtStake(built);

    // With a return the smallest would leave too little to return: a larger one is put up, and
    // only what the fee calls for is at stake
    const returned = await build([scriptSpend()], pool);
    expect(keysOf(returned.collateral!.inputs)).toEqual([keyOf(five)]);
    expect(returned.collateral!.total).toBe(minimumFor(returned.fee));
  });

  it("puts up several smaller UTxOs when together they put less at stake than one", async () => {
    // A fee of 2 ADA calls for 3 ADA of collateral
    const fee = ada(2);
    const large = utxo(ada(100));
    const pair = [utxo(1_600_000n), utxo(1_500_000n)];
    const built = await build(
      [scriptSpend(ada(20))],
      [large, ...pair, utxo(200_000n)],
      { ...noReturn, fee },
    );
    expect(keysOf(built.collateral!.inputs)).toEqual(keysOf(pair));
    expect(built.collateral!.total).toBe(3_100_000n);
    expectAtStake(built);

    // The cheapest pair, 2.5 + 0.5 ADA, the larger first
    const big = utxo(2_500_000n);
    const half = utxo(500_000n);
    const swapped = await build(
      [scriptSpend(ada(20))],
      [large, utxo(ada(1)), big, utxo(600_000n), half],
      { ...noReturn, fee },
    );
    expect(keysOf(swapped.collateral!.inputs)).toEqual([
      keyOf(big),
      keyOf(half),
    ]);
    expect(swapped.collateral!.total).toBe(ada(3));
    expectAtStake(swapped);

    // One UTxO is kept when the smaller ones would put as much at stake
    const three = utxo(ada(3));
    const single = await build(
      [scriptSpend(ada(20))],
      [utxo(1_500_000n), three, utxo(1_500_000n)],
      { ...noReturn, fee },
    );
    expect(keysOf(single.collateral!.inputs)).toEqual([keyOf(three)]);
  });

  it("never puts up a UTxO holding tokens, also when it alone would cover", async () => {
    const fee = ada(2);
    const tokens = utxo(ada(50), { [token]: 5n });
    const pool = [tokens, utxo(ada(1)), utxo(900_000n), utxo(800_000n)];
    // With a return the UTxO holding tokens is put up, its tokens returned
    const returned = await build([scriptSpend(ada(20))], pool, { fee });
    expect(keysOf(returned.collateral!.inputs)).toEqual([keyOf(tokens)]);

    const error = await expectCode(
      () => build([scriptSpend(ada(20))], pool, { ...noReturn, fee }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(error.details).toEqual({ required: ada(3), available: 2_700_000n });
    expect(error.message).toBe(
      "no 3 UTxOs cover the 3000000 lovelace collateral; UTxOs holding native assets cannot be collateral without a collateral return: give collateral inputs without assets, or drop `collateralReturn: false`",
    );

    // Only UTxOs holding tokens: nothing can be put up
    const none = await expectCode(
      () =>
        build(
          [scriptSpend()],
          [tokens, utxo(ada(3), { [token]: 1n })],
          noReturn,
        ),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(none.details.available).toBe(0n);
    expect(none.message).toBe(
      "no key-locked UTxO without native assets is available to put up as collateral; UTxOs holding native assets cannot be collateral without a collateral return: give collateral inputs without assets, or drop `collateralReturn: false`",
    );

    // A smaller UTxO holding tokens is passed over for a larger lovelace-only one
    const ten = utxo(ada(10));
    const chosen = await build(
      [scriptSpend()],
      [utxo(ada(2), { [token]: 1n }), ten],
      noReturn,
    );
    expect(keysOf(chosen.collateral!.inputs)).toEqual([keyOf(ten)]);
    expectAtStake(chosen);
  });

  it("puts up a UTxO holding a reference script only when no other covers", async () => {
    const holder: Utxo = {
      ...utxo(ada(2)),
      script: {
        type: "plutus",
        version: "V3",
        code: alwaysSucceedCbor,
        hash: alwaysSucceedHash,
      },
    };
    const ten = utxo(ada(10));
    const passed = await build([scriptSpend()], [holder, ten], noReturn);
    expect(keysOf(passed.collateral!.inputs)).toEqual([keyOf(ten)]);
    const taken = await build(
      [scriptSpend()],
      [holder, utxo(100_000n)],
      noReturn,
    );
    expect(keysOf(taken.collateral!.inputs)).toEqual([keyOf(holder)]);
    expect(taken.collateral!.total).toBe(ada(2));
    expect(taken.collateral!.return).toBeUndefined();
  });

  it("is INVALID_COLLATERAL for a given input holding tokens, naming its part", async () => {
    const held = utxo(ada(5), { [token]: 1n });
    const error = await expectCode(
      () =>
        build(
          [
            scriptSpend(),
            collateral({ utxo: utxo(ada(1)) }),
            collateral({ utxo: held, label: "mine" }),
          ],
          [utxo(ada(10))],
          noReturn,
        ),
      "INVALID_COLLATERAL",
    );
    expect(error.part).toBe("collateral");
    expect(error.label).toBe("mine");
    expect(error.message).toBe(
      `collateral "mine": the collateral input ${keyOf(held)} holds native assets, which can only be put up with a collateral return: give collateral inputs without assets, or drop \`collateralReturn: false\``,
    );

    // With a return the same input is put up, its token returned
    const returned = await build(
      [scriptSpend(), collateral({ utxo: held, label: "mine" })],
      [utxo(ada(10))],
    );
    expect(returned.collateral!.return!.value[token]).toBe(1n);
  });

  it("puts up a given lovelace-only input as it is, all of it at stake", async () => {
    const given = utxo(ada(5));
    const built = await build(
      [scriptSpend(), collateral({ utxo: given, label: "mine" })],
      [utxo(ada(1)), utxo(ada(10))],
      noReturn,
    );
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(given)]);
    expect(built.collateral!.total).toBe(ada(5));
    expect(
      built.parts.flatMap((p) => (p.kind === "collateral" ? [p.label] : [])),
    ).toEqual(["mine"]);
    expectAtStake(built);

    // Not topped up, a given input short of the collateral is refused
    const short = utxo(100_000n);
    const error = await expectCode(
      () =>
        build(
          [scriptSpend(), collateral({ utxo: short, label: "short" })],
          [utxo(ada(10))],
          { ...noReturn, topUpCollateral: false },
        ),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(error.details.available).toBe(100_000n);
    expect(error.message).toMatch(
      /^collateral "short": the collateral inputs cannot cover \d+ lovelace$/,
    );
  });

  it("tops up given collateral with lovelace-only UTxOs alone", async () => {
    const given = utxo(100_000n);
    const tokens = utxo(ada(2), { [token]: 5n });
    const one = utxo(ada(1));
    const built = await build(
      [scriptSpend(), collateral({ utxo: given, label: "mine" })],
      [utxo(ada(10)), tokens, utxo(ada(3)), one],
      noReturn,
    );
    expect(keysOf(built.collateral!.inputs)).toEqual([
      keyOf(given),
      keyOf(one),
    ]);
    expect(built.collateral!.total).toBe(1_100_000n);
    expectAtStake(built);

    // Only UTxOs holding tokens could be added
    const error = await expectCode(
      () =>
        build(
          [scriptSpend(), collateral({ utxo: given, label: "mine" })],
          [tokens, utxo(ada(9), { [token]: 1n })],
          noReturn,
        ),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(error.details.available).toBe(100_000n);
    expect(error.message).toMatch(
      /^collateral "mine": the collateral inputs cannot cover \d+ lovelace, and no key-locked UTxO without native assets is available to add to them; UTxOs holding native assets cannot be collateral without a collateral return: give collateral inputs without assets, or drop `collateralReturn: false`$/,
    );
  });

  it("is INVALID_OPTION for a collateralReturn part with collateralReturn: false, before any lookup", async () => {
    // The spend names an output by out ref, and the builder has no provider to look it up
    const unresolved = spend.plutus({
      utxo: { txHash: "5".repeat(64), outputIndex: 0 },
      script: plutusScript,
      redeemer: { data: mConStr0([]) },
    });
    const parts = [
      unresolved,
      collateralReturn({ address: wallet, label: "back" }),
    ];
    const error = await expectCode(
      () => build(parts, [utxo(ada(10))], noReturn),
      "INVALID_OPTION",
    );
    expect(error.details).toEqual({
      option: "collateralReturn",
      value: false,
      allowed: "true or left out, with a collateralReturn part",
    });
    expect(error.part).toBe("collateralReturn");
    expect(error.label).toBe("back");
    expect(error.message).toBe(
      'collateralReturn "back": invalid collateralReturn: false leaves the collateral without a return, and a collateralReturn part asks for one; drop the part or the option',
    );
    // Without the option the build gets as far as the lookup
    await expectCode(() => build(parts, [utxo(ada(10))]), "MISSING_FETCHER");
  });

  it("prices the smaller transaction, with collateral for its own fee", async () => {
    const pool = [utxo(ada(10)), utxo(ada(3))];
    const parts = [scriptSpend()];
    const without = await build(parts, pool, noReturn);
    const withReturn = await build(parts, pool);
    expect(without.tx.length).toBeLessThan(withReturn.tx.length);
    expect(without.fee).toBeLessThan(withReturn.fee);
    expect(without.collateral!.total).toBeGreaterThanOrEqual(
      minimumFor(without.fee),
    );
    // The fee is the transaction's minimum: one lovelace less is refused
    const lower = await expectCode(
      () => build(parts, pool, { ...noReturn, fee: without.fee - 1n }),
      "FEE_TOO_LOW",
    );
    expect(lower.details.minFee).toBe(without.fee);
    const same = await build(parts, pool, {
      ...noReturn,
      fee: without.fee,
    });
    expect(same.tx).toBe(without.tx);
  });

  it("is INVALID_OPTION for a collateralReturn that is not a boolean", async () => {
    // A text or an object is named by its type
    for (const [value, held] of [
      ["no", "string"],
      [0, 0],
      [null, null],
      [{}, "object"],
    ]) {
      const error = await expectCode(
        () =>
          build([scriptSpend()], [utxo(ada(10))], {
            collateralReturn: value as never,
          }),
        "INVALID_OPTION",
      );
      expect(error.details).toEqual({
        option: "collateralReturn",
        value: held,
        allowed: "a boolean",
      });
    }
  });

  describe("the inputs it chooses", () => {
    /** The fee of one more collateral input with its key witness: 140 bytes at `minFeeA` */
    const perInput = 140n * BigInt(params.minFeeA);
    /** The collateral a build without a return puts up, for a fee given */
    const chosen = async (
      pool: Utxo[],
      fee: bigint,
      options: {
        params?: Protocol;
        parts?: CollateralPart[];
      } = {},
    ) => {
      const built = await build(
        [scriptSpend(ada(20)), ...(options.parts ?? [])],
        pool,
        { ...noReturn, fee },
        scripted({ params: options.params }),
      );
      expectAtStake(built, options.params?.maxCollateralInputs);
      return built.collateral!;
    };
    /** UTxOs of these lovelace quantities, in the order given */
    const pool = (...lovelace: bigint[]) => lovelace.map((l) => utxo(l));
    // 3 ADA, 0.5 ADA and 2.5 ADA of collateral, one lovelace over for the last two
    const three = ada(2);
    const half = 333_334n;
    const twoAndHalf = 1_666_667n;

    it("prices one more input at 6160 lovelace on the default parameters", () => {
      expect(perInput).toBe(6160n);
      expect(minimumFor(three)).toBe(ada(3));
      expect(minimumFor(half)).toBe(500_001n);
      expect(minimumFor(twoAndHalf)).toBe(2_500_001n);
    });

    it("finds the three that put the least at stake where a pair puts more", async () => {
      // Need 3 ADA: 3 × 1.01 = 3.03 ADA, not 2.9 + 1.01 = 3.91 ADA
      const small = pool(1_010_000n, 1_010_000n, 1_010_000n);
      const all = [...small, utxo(2_900_000n), utxo(2_950_000n)];
      const { inputs, total } = await chosen(all, three);
      expect(keysOf(inputs)).toEqual(keysOf(small));
      expect(total).toBe(3_030_000n);
    });

    it("takes several inputs only when they spare more than their fee", async () => {
      // Need 3 ADA: 1.5 + 1.5 ADA spare one lovelace and cost 6160 more in fee
      const single = utxo(3_000_001n);
      const one = await chosen(
        [...pool(1_500_000n, 1_500_000n), single],
        three,
      );
      expect(keysOf(one.inputs)).toEqual([keyOf(single)]);

      // Need 0.5 ADA: 3 × 0.2 ADA rather than 100 ADA
      const small = pool(200_000n, 200_000n, 200_000n);
      const several = await chosen([...small, utxo(ada(100))], half);
      expect(keysOf(several.inputs)).toEqual(keysOf(small));
      expect(several.total).toBe(600_000n);
    });

    it("puts up two of 0.3 ADA for 0.5 ADA beside 5 ADA", async () => {
      const pair = pool(300_000n, 300_000n);
      const { inputs, total } = await chosen([utxo(ada(5)), ...pair], half);
      expect(keysOf(inputs)).toEqual(keysOf(pair));
      expect(total).toBe(600_000n);
    });

    it("puts up three of four 1 ADA UTxOs for 2.5 ADA, those with the smaller out refs", async () => {
      const ones = pool(ada(1), ada(1), ada(1), ada(1));
      const { inputs, total } = await chosen([...ones].reverse(), twoAndHalf);
      expect(keysOf(inputs)).toEqual(keysOf(ones.slice(0, 3)));
      expect(total).toBe(ada(3));
    });

    it("puts up the UTxO that covers exactly, alone", async () => {
      const exact = utxo(ada(3));
      const { inputs } = await chosen(
        [utxo(3_000_001n), utxo(ada(2)), exact, utxo(ada(1))],
        three,
      );
      expect(keysOf(inputs)).toEqual([keyOf(exact)]);
    });

    it("puts up one UTxO where the network allows one", async () => {
      const five = utxo(ada(5));
      const { inputs } = await chosen(
        [...pool(300_000n, 300_000n), five],
        half,
        { params: { ...params, maxCollateralInputs: 1 } },
      );
      expect(keysOf(inputs)).toEqual([keyOf(five)]);
    });

    it("tops up a given 0.1 ADA input with the cheapest UTxOs that make it cover", async () => {
      // 0.400001 ADA missing: 0.25 + 0.2 ADA rather than 1 ADA
      const given = utxo(100_000n);
      const quarter = utxo(250_000n);
      const fifths = pool(200_000n, 200_000n);
      const { inputs, total } = await chosen(
        [utxo(ada(1)), fifths[1]!, quarter, fifths[0]!],
        half,
        { parts: [collateral({ utxo: given })] },
      );
      expect(keysOf(inputs)).toEqual([
        keyOf(given),
        keyOf(quarter),
        keyOf(fifths[0]!),
      ]);
      expect(total).toBe(550_000n);
    });

    it("searches pairs and triples among the 64 largest UTxOs below what is missing", async () => {
      // Promised: a cover of at most three inputs, among the 64 largest below 0.5 ADA, cheaper
      // than the UTxO that covers alone. Not promised: the cheapest cover of all, here two of
      // the smaller 0.26 ADA (0.52 ADA), which the search does not look at
      const smaller = pool(...Array.from({ length: 6 }, () => 260_000n));
      const larger = pool(...Array.from({ length: 64 }, () => 450_000n));
      const { inputs, total } = await chosen(
        [...smaller, utxo(ada(10)), ...larger],
        half,
      );
      expect(keysOf(inputs)).toEqual(keysOf(larger.slice(0, 2)));
      expect(total).toBe(900_000n);
    });

    it("breaks a tie by fewer inputs, then by the smaller out ref", async () => {
      // Equal cost: one UTxO of 3 ADA + 6160 lovelace, or 1.5 + 1.5 ADA and one more input
      const single = utxo(ada(3) + perInput);
      const pair = pool(1_500_000n, 1_500_000n);
      const tie = await chosen([...pair, single], three);
      expect(keysOf(tie.inputs)).toEqual([keyOf(single)]);
      // One lovelace more and the pair is cheaper
      const dearer = await chosen(
        [...pair, utxo(ada(3) + perInput + 1n)],
        three,
      );
      expect(keysOf(dearer.inputs)).toEqual(keysOf(pair));

      // Two equal UTxOs: the smaller out ref, in whatever order the payer gives them
      const twins = pool(ada(3), ada(3));
      const first = await chosen([...twins].reverse(), three);
      expect(keysOf(first.inputs)).toEqual([keyOf(twins[0]!)]);
      const again = await chosen(twins, three);
      expect(again.inputs).toEqual(first.inputs);
    });

    it("never puts up more inputs than maxCollateralInputs", async () => {
      // 3.6 ADA: four 1 ADA UTxOs cover it only together
      const fee = 2_400_000n;
      const ones = pool(ada(1), ada(1), ada(1), ada(1), ada(1));
      const error = await expectCode(
        () => build([scriptSpend(ada(20))], ones, { ...noReturn, fee }),
        "INSUFFICIENT_COLLATERAL",
      );
      expect(error.details).toEqual({
        required: 3_600_000n,
        available: ada(3),
      });
      expect(error.message).toBe(
        "no 3 UTxOs cover the 3600000 lovelace collateral",
      );

      // Where five are allowed, the largest ones up to five
      const five = { ...params, maxCollateralInputs: 5 };
      const sixes = pool(ada(1), ada(1), ada(1), ada(1), ada(1), ada(1));
      const fourAndHalf = await chosen(sixes, ada(3), { params: five });
      expect(fourAndHalf.inputs).toHaveLength(5);
      expect(fourAndHalf.total).toBe(ada(5));
      const beyond = await expectCode(
        () =>
          build(
            [scriptSpend(ada(20))],
            sixes,
            { ...noReturn, fee: 3_700_000n },
            scripted({ params: five }),
          ),
        "INSUFFICIENT_COLLATERAL",
      );
      expect(beyond.details).toEqual({
        required: 5_550_000n,
        available: ada(5),
      });
    });

    it("adds no more inputs to given ones than maxCollateralInputs leaves room for", async () => {
      // Two given 1 ADA inputs leave room for one: 5 ADA, not 0.3 + 0.3 ADA
      const given = [
        collateral({ utxo: utxo(ada(1)) }),
        collateral({ utxo: utxo(ada(1)) }),
      ];
      const five = utxo(ada(5));
      const { inputs } = await chosen(
        [...pool(300_000n, 300_000n), five],
        twoAndHalf,
        { parts: given },
      );
      expect(inputs).toHaveLength(3);
      expect(keyOf(inputs[2]!)).toBe(keyOf(five));

      // 3.6 ADA: the two given and one more do not cover it, two more would
      const error = await expectCode(
        () =>
          build([scriptSpend(ada(20)), ...given], pool(ada(1), ada(1)), {
            ...noReturn,
            fee: 2_400_000n,
          }),
        "INSUFFICIENT_COLLATERAL",
      );
      expect(error.details).toEqual({
        required: 3_600_000n,
        available: ada(3),
      });
    });

    it("gives the advice about tokens only when UTxOs holding tokens were left out", async () => {
      // Lovelace-only UTxOs that fall short: dropping the option would not help
      const short = await expectCode(
        () =>
          build([scriptSpend(ada(20))], pool(ada(1), 500_000n), {
            ...noReturn,
            fee: three,
          }),
        "INSUFFICIENT_COLLATERAL",
      );
      expect(short.message).toBe(
        "the 2 UTxOs that can be put up as collateral do not cover 3000000 lovelace",
      );
      const none = await expectCode(
        () => build([scriptSpend()], [], noReturn),
        "INSUFFICIENT_COLLATERAL",
      );
      expect(none.message).toBe(
        "no key-locked UTxO is available to put up as collateral",
      );

      // A UTxO holding tokens left out: the advice
      const held = await expectCode(
        () => build([scriptSpend()], [utxo(ada(9), { [token]: 1n })], noReturn),
        "INSUFFICIENT_COLLATERAL",
      );
      expect(held.message).toBe(
        "no key-locked UTxO without native assets is available to put up as collateral; UTxOs holding native assets cannot be collateral without a collateral return: give collateral inputs without assets, or drop `collateralReturn: false`",
      );
    });
  });
});
