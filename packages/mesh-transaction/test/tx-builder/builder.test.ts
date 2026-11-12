import {
  Action,
  CachedFetcher,
  customNetwork,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IEvaluator,
  IFetcher,
  mConStr0,
  NativeScript,
  networkConfig,
  NetworkInput,
  Protocol,
  resolveScriptRef,
  ScriptEvaluationError,
  ScriptFailure,
  UTxO,
} from "@meshsdk/core";
import { CSLSerializer } from "@meshsdk/core-csl";
import {
  Address,
  keyHashToRewardAddress,
  OfflineEvaluatorScalus,
  resolvePlutusScriptAddress,
  scriptHashToRewardAddress,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  BuildEvent,
  BuildOptions,
  BuiltTx,
  certificate,
  collateral,
  collateralReturn,
  donation,
  mint,
  output,
  proposal,
  referenceInput,
  spend,
  TxBuilder,
  TxBuildError,
  TxPart,
  TxPartError,
  unresolved,
  validity,
  withdrawal,
} from "../../src/tx-builder";
import { minFee, refScriptFee } from "../../src/tx-builder/fee";
import { resolveParts } from "../../src/tx-builder/resolve";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  keyHashHex,
  mockTokenUnit,
  vrfKeyHashHex,
} from "../test-util";

/** The builder's network: the fixtures' addresses are testnet ones */
const network = "preprod";
const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
/** Cost models for builds that run Plutus scripts: the builder has none of its own */
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const wallet = baseAddress(1);
const recipient = baseAddress(2);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const anchor = { url: "https://example.com/a.json", dataHash: "ab".repeat(32) };

const lovelace = (n: bigint | number) => [
  { unit: "lovelace", quantity: String(n) },
];
let nextHash = 0;
const utxo = (
  amount: UTxO["output"]["amount"],
  extra: Partial<UTxO["output"]> = {},
  address = wallet,
): UTxO => ({
  input: {
    txHash: (++nextHash).toString(16).padStart(64, "0"),
    outputIndex: 0,
  },
  output: { address, amount, ...extra },
});

const ada = (n: number) => BigInt(n) * 1_000_000n;

/** Redeemer tags as `IEvaluator` reports them, by the ledger's tag number */
const TAGS: Action["tag"][] = [
  "SPEND",
  "MINT",
  "CERT",
  "REWARD",
  "VOTE",
  "PROPOSE",
];

/** Prices every redeemer of a transaction at fixed units, recording each call */
const fakeEvaluator = (budget = { mem: 1000, steps: 2000 }) => {
  const calls: string[] = [];
  const evaluator: IEvaluator = {
    evaluateTx: async (tx) => {
      calls.push(tx);
      const redeemers =
        Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ??
        [];
      return redeemers.map((r) => ({
        tag: TAGS[r.tag()]!,
        index: Number(r.index()),
        budget,
      }));
    },
  };
  return { evaluator, calls };
};

/** Serves the given UTxOs and reward balances, counting requests */
const fakeFetcher = (utxos: UTxO[], rewards: Record<string, string> = {}) => {
  const calls: Record<string, number> = {};
  const count = (name: string) => (calls[name] = (calls[name] ?? 0) + 1);
  const fetcher = {
    fetchUTxOs: async (hash: string) => {
      count("fetchUTxOs");
      return utxos.filter((u) => u.input.txHash === hash);
    },
    fetchAccountInfo: async (address: string) => {
      count("fetchAccountInfo");
      return {
        active: true,
        balance: "0",
        rewards: rewards[address] ?? "0",
        withdrawals: "0",
      };
    },
    fetchProtocolParameters: async () => {
      count("fetchProtocolParameters");
      return params;
    },
    fetchCostModels: async () => {
      count("fetchCostModels");
      return costModels;
    },
  } as unknown as IFetcher;
  return { fetcher, calls };
};

const expectBuildError = async (build: Promise<unknown>, code: string) => {
  try {
    await build;
  } catch (error) {
    expect(error).toBeInstanceOf(TxBuildError);
    expect((error as TxBuildError).code).toBe(code);
    return error as TxBuildError;
  }
  throw new Error(`expected a ${code} error`);
};

const sum = (values: (string | number | bigint)[]) =>
  values.reduce<bigint>((a, b) => a + BigInt(b), 0n);
const coinOf = (u: UTxO) =>
  BigInt(u.output.amount.find((a) => a.unit === "lovelace")?.quantity ?? 0);

/** Lovelace in = lovelace out, with the given deposits and refunds */
const expectBalanced = (
  built: BuiltTx,
  { deposits = 0n, refunds = 0n } = {},
) => {
  const { body } = built.prototype;
  const consumed =
    sum(built.inputs.map(coinOf)) +
    sum(Object.values(body.withdrawals ?? {})) +
    refunds;
  const produced =
    sum(body.outputs.map((o) => o.amount.coin)) +
    built.fee +
    BigInt(body.donation ?? 0) +
    deposits;
  expect(consumed).toBe(produced);
};

/** The minimum fee of the transaction once signed by `signers` keys */
const signedMinFee = (built: BuiltTx, signers: number) => {
  // A key witness adds its key, signature and their framing: 101 bytes, plus the set header
  const tx = Transaction.fromCbor(TxCBOR(built.tx));
  const unsignedSize = built.tx.length / 2;
  const witnessBytes =
    signers === 0 ? 0 : 101 * signers + (signers < 24 ? 1 : 2) + 1 + 1;
  void tx;
  return minFee(unsignedSize + witnessBytes, 0n, built.exUnits, params);
};

describe("TxBuilder: balancing", () => {
  it("pays an output, returns change and settles the fee at the minimum", async () => {
    const funds = [utxo(lovelace(ada(100)))];
    const built = await new TxBuilder({ network, params }).build(
      [output({ address: recipient, value: { lovelace: ada(5) } })],
      { payer: { changeAddress: wallet, utxos: funds } },
    );

    expect(built.selectedInputs).toEqual(funds);
    expect(built.change).toHaveLength(1);
    expect(built.change[0]!.address).toBe(wallet);
    expectBalanced(built);
    // Within a byte or two of the minimum for the signed transaction
    const min = signedMinFee(built, 1);
    expect(built.fee).toBeGreaterThanOrEqual(min - 88n);
    expect(built.fee).toBeLessThanOrEqual(min + 88n);
  });

  it("fills in the lovelace an output needs when it is left out", async () => {
    const unit = mockTokenUnit(1);
    const built = await new TxBuilder({ network, params }).build(
      [output({ address: recipient, value: { [unit]: 1n } })],
      {
        payer: {
          changeAddress: wallet,
          utxos: [utxo([...lovelace(ada(10)), { unit, quantity: "5" }])],
        },
      },
    );
    const paid = built.prototype.body.outputs[0]!;
    expect(BigInt(paid.amount.coin)).toBeGreaterThan(ada(1));
    expect(BigInt(paid.amount.coin)).toBeLessThan(ada(2));
    // The other 4 tokens come back
    expect(built.change[0]!.amount.multiasset).toEqual({
      [unit.slice(0, 56)]: { [unit.slice(56)]: "4" },
    });
    expectBalanced(built);
  });

  it("rejects an output holding less lovelace than it needs", async () => {
    const error = await expectBuildError(
      new TxBuilder({ network, params }).build(
        [output({ address: recipient, value: { lovelace: 100n } })],
        { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] } },
      ),
      "OUTPUT_BELOW_MIN_COIN",
    );
    const { coin, minCoin } = (error as TxBuildError<"OUTPUT_BELOW_MIN_COIN">)
      .details;
    expect(coin).toBe(100n);
    expect(minCoin).toBeGreaterThan(500_000n);
    expect(error.message).toContain(`less than the ${minCoin} it needs`);
  });

  it("rejects an output whose value is too large", async () => {
    const units = Array.from({ length: 30 }, (_, i) => mockTokenUnit(i + 1));
    const error = await expectBuildError(
      new TxBuilder({ network, params: { ...params, maxValSize: 400 } }).build(
        [
          output({
            address: recipient,
            value: Object.fromEntries(units.map((unit) => [unit, 1n])),
          }),
        ],
        { payer: { changeAddress: wallet, utxos: [] } },
      ),
      "VALUE_TOO_LARGE",
    );
    const { size, maxValSize } = (error as TxBuildError<"VALUE_TOO_LARGE">)
      .details;
    expect(maxValSize).toBe(400);
    expect(size).toBeGreaterThan(400);
  });

  it("rejects change holding a token that does not fit in an output on its own", async () => {
    const unit = mockTokenUnit(1);
    const error = await expectBuildError(
      new TxBuilder({ network, params: { ...params, maxValSize: 20 } }).build(
        [output({ address: recipient, value: { lovelace: ada(5) } })],
        {
          payer: {
            changeAddress: wallet,
            utxos: [utxo([...lovelace(ada(100)), { unit, quantity: "1" }])],
          },
        },
      ),
      "VALUE_TOO_LARGE",
    );
    expect(error.message).toContain(`token ${unit} does not fit`);
    const { size, maxValSize } = (error as TxBuildError<"VALUE_TOO_LARGE">)
      .details;
    expect(maxValSize).toBe(20);
    expect(size).toBeGreaterThan(20);
  });

  it("selects another input when the change would hold too little lovelace", async () => {
    const spent = utxo(lovelace(2_300_000n));
    const extra = utxo(lovelace(ada(5)));
    const built = await new TxBuilder({ network, params }).build(
      [
        spend.pubKey({ utxo: spent }),
        output({ address: recipient, value: { lovelace: ada(2) } }),
      ],
      { payer: { changeAddress: wallet, utxos: [extra] } },
    );
    expect(built.selectedInputs).toEqual([extra]);
    expect(BigInt(built.change[0]!.amount.coin)).toBeGreaterThan(ada(4));
    expectBalanced(built);
  });

  it("leaves out change when nothing is left over", async () => {
    // A fixed fee that takes exactly what the output leaves
    const built = await new TxBuilder({ network, params }).build(
      [output({ address: recipient, value: { lovelace: ada(3) } })],
      {
        payer: {
          changeAddress: wallet,
          utxos: [utxo(lovelace(ada(3) + 200_000n))],
        },
        fee: 200_000n,
      },
    );
    expect(built.change).toEqual([]);
    expect(built.fee).toBe(200_000n);
    expectBalanced(built);
  });

  it("selects inputs for tokens first, from their largest holders", async () => {
    const unit = mockTokenUnit(2);
    const small = utxo([...lovelace(ada(2)), { unit, quantity: "3" }]);
    const large = utxo([...lovelace(ada(2)), { unit, quantity: "8" }]);
    const plain = utxo(lovelace(ada(50)));
    const built = await new TxBuilder({ network, params }).build(
      [output({ address: recipient, value: { [unit]: 10n } })],
      { payer: { changeAddress: wallet, utxos: [small, plain, large] } },
    );
    expect(built.selectedInputs.slice(0, 2)).toEqual([large, small]);
    expectBalanced(built);
  });

  it("splits change whose tokens do not fit in one output", async () => {
    const units = Array.from({ length: 30 }, (_, i) => mockTokenUnit(i + 1));
    const small = { ...params, maxValSize: 400 };
    const built = await new TxBuilder({ network, params: small }).build(
      [output({ address: recipient, value: { lovelace: ada(2) } })],
      {
        payer: {
          changeAddress: wallet,
          utxos: [
            utxo([
              ...lovelace(ada(100)),
              ...units.map((unit) => ({ unit, quantity: "1" })),
            ]),
          ],
        },
      },
    );
    expect(built.change.length).toBeGreaterThan(1);
    const returned = built.change.flatMap((o) =>
      Object.entries(o.amount.multiasset ?? {}).flatMap(([policy, assets]) =>
        Object.keys(assets).map((name) => policy + name),
      ),
    );
    expect(returned.sort()).toEqual([...units].sort());
    expectBalanced(built);
  });

  it("reports what is missing when the UTxOs cannot pay", async () => {
    const lovelaceShort = await expectBuildError(
      new TxBuilder({ network, params }).build(
        [output({ address: recipient, value: { lovelace: ada(50) } })],
        { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] } },
      ),
      "INSUFFICIENT_FUNDS",
    );
    const short = (lovelaceShort as TxBuildError<"INSUFFICIENT_FUNDS">).details;
    expect(short).toMatchObject({
      unit: "lovelace",
      available: ada(10),
      reason: "payment",
      pool: {
        given: 1,
        selectable: 1,
        scriptLocked: 0,
        excludedByFilter: 0,
        readByParts: 0,
        spentByAfter: 0,
      },
    });
    expect(short.feeEstimate).toBeGreaterThan(0n);
    expect(short.changeMinimum).toBeGreaterThan(0n);
    expect(short.required).toBe(
      ada(50) + short.feeEstimate! + short.changeMinimum!,
    );
    expect(short.missing).toBe(short.required - short.available);
    expect(lovelaceShort.message).toContain(`${short.missing} lovelace`);

    const unit = mockTokenUnit(3);
    const tokenShort = await expectBuildError(
      new TxBuilder({ network, params }).build(
        [output({ address: recipient, value: { [unit]: 2n } })],
        {
          payer: {
            changeAddress: wallet,
            utxos: [utxo([...lovelace(ada(10)), { unit, quantity: "1" }])],
          },
        },
      ),
      "INSUFFICIENT_FUNDS",
    );
    expect(tokenShort.details).toMatchObject({
      unit,
      missing: 1n,
      required: 2n,
      available: 1n,
      reason: "payment",
    });
    expect(tokenShort.details).not.toHaveProperty("feeEstimate");
    expect(tokenShort.details).not.toHaveProperty("changeMinimum");
    expect(tokenShort.message).toContain(`1 of ${unit}`);
  });

  it("selects only key-locked UTxOs", async () => {
    const error = await expectBuildError(
      new TxBuilder({ network, params }).build(
        [output({ address: recipient, value: { lovelace: ada(2) } })],
        {
          payer: {
            changeAddress: wallet,
            utxos: [utxo(lovelace(ada(10)), {}, scriptAddress)],
          },
        },
      ),
      "INSUFFICIENT_FUNDS",
    );
    expect(error.details).toMatchObject({
      reason: "payment",
      pool: {
        given: 1,
        selectable: 0,
        scriptLocked: 1,
        excludedByFilter: 0,
        readByParts: 0,
        spentByAfter: 0,
      },
    });
  });

  it("uses a fixed fee as is, and rejects one below the minimum", async () => {
    const funds = [utxo(lovelace(ada(10)))];
    const parts = [output({ address: recipient, value: { lovelace: ada(2) } })];
    const built = await new TxBuilder({ network, params }).build(parts, {
      payer: { changeAddress: wallet, utxos: funds },
      fee: ada(1),
    });
    expect(built.fee).toBe(ada(1));
    expect(built.prototype.body.fee).toBe("1000000");
    expectBalanced(built);

    const error = await expectBuildError(
      new TxBuilder({ network, params }).build(parts, {
        payer: { changeAddress: wallet, utxos: funds },
        fee: 1000n,
      }),
      "FEE_TOO_LOW",
    );
    const { fee, minFee } = (error as TxBuildError<"FEE_TOO_LOW">).details;
    expect(fee).toBe(1000n);
    expect(minFee).toBeGreaterThan(100_000n);
    expect(minFee).toBeLessThan(ada(1));
  });

  it("prices extra key witnesses into the fee", async () => {
    const parts = [output({ address: recipient, value: { lovelace: ada(2) } })];
    const payer = { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] };
    const one = await new TxBuilder({ network, params }).build(parts, {
      payer,
    });
    const three = await new TxBuilder({ network, params }).build(parts, {
      payer,
      extraKeyWitnesses: 2,
    });
    expect(three.fee - one.fee).toBe(2n * 101n * 44n);
  });

  it("donates to the treasury out of the inputs", async () => {
    const built = await new TxBuilder({ network, params }).build(
      [donation({ amount: ada(7) })],
      { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] } },
    );
    expect(built.prototype.body.donation).toBe("7000000");
    expectBalanced(built);
  });
});

describe("TxBuilder: what INSUFFICIENT_FUNDS reports", () => {
  const pay = (n: number) =>
    output({ address: recipient, value: { lovelace: ada(n) } });
  const fundsShort = async (
    {
      parts,
      utxos = [],
      ...options
    }: { parts: TxPart[]; utxos?: UTxO[] } & BuildOptions,
    builder = new TxBuilder({ network, params }),
  ) =>
    (
      (await expectBuildError(
        builder.build(parts, {
          ...options,
          payer: { changeAddress: wallet, utxos },
        }),
        "INSUFFICIENT_FUNDS",
      )) as TxBuildError<"INSUFFICIENT_FUNDS">
    ).details;
  /** The same UTxO, holding more lovelace */
  const raised = (u: UTxO, by: bigint): UTxO => ({
    ...u,
    output: {
      ...u.output,
      amount: [
        ...lovelace(coinOf(u) + by),
        ...u.output.amount.filter((a) => a.unit !== "lovelace"),
      ],
    },
  });

  it.each([[[10]], [[10, 20]]])(
    "builds with `missing` more lovelace, and not with one less (UTxOs of %j ADA)",
    async (holdings) => {
      const utxos = holdings.map((n) => utxo(lovelace(ada(n))));
      const parts = [pay(50)];
      const short = await fundsShort({ parts, utxos });
      expect(short.pool.selectable).toBe(holdings.length);
      const last = utxos.length - 1;
      const topUp = (by: bigint) =>
        utxos.map((u, i) => (i === last ? raised(u, by) : u));

      const built = await new TxBuilder({ network, params }).build(parts, {
        payer: { changeAddress: wallet, utxos: topUp(short.missing) },
      });
      expect(built.selectedInputs).toHaveLength(holdings.length);
      expect(built.fee).toBe(short.feeEstimate);
      expect(sum(built.change.map((o) => o.amount.coin))).toBe(
        short.changeMinimum,
      );
      expectBalanced(built);

      const less = await fundsShort({
        parts,
        utxos: topUp(short.missing - 1n),
      });
      expect(less.unit).toBe("lovelace");
    },
  );

  it("counts the change for the tokens left over", async () => {
    const unit = mockTokenUnit(1);
    const funds = utxo([...lovelace(ada(10)), { unit, quantity: "5" }]);
    const short = await fundsShort({ parts: [pay(50)], utxos: [funds] });
    // A change output holding the tokens needs more than one holding lovelace alone
    const { changeMinimum: lovelaceOnly } = await fundsShort({
      parts: [pay(50)],
      utxos: [utxo(lovelace(ada(10)))],
    });
    expect(short.changeMinimum).toBeGreaterThan(lovelaceOnly!);

    const built = await new TxBuilder({ network, params }).build([pay(50)], {
      payer: { changeAddress: wallet, utxos: [raised(funds, short.missing)] },
    });
    expect(built.fee).toBe(short.feeEstimate);
    expect(built.change).toHaveLength(1);
    expect(BigInt(built.change[0]!.amount.coin)).toBe(short.changeMinimum);
    expect(built.change[0]!.amount.multiasset).toEqual({
      [unit.slice(0, 56)]: { [unit.slice(56)]: "5" },
    });
    expectBalanced(built);
    await fundsShort({
      parts: [pay(50)],
      utxos: [raised(funds, short.missing - 1n)],
    });
  });

  it("is still INSUFFICIENT_FUNDS when the change cannot be made", async () => {
    const unit = mockTokenUnit(1);
    // The token fits in no output, so the transaction to price cannot be made
    const short = await fundsShort(
      {
        parts: [pay(50)],
        utxos: [utxo([...lovelace(ada(10)), { unit, quantity: "1" }])],
      },
      new TxBuilder({ network, params: { ...params, maxValSize: 20 } }),
    );
    expect(short.unit).toBe("lovelace");
    expect(short.reason).toBe("payment");
    // The fee of the round that failed: the first one, at zero
    expect(short.feeEstimate).toBe(0n);
    expect(short).not.toHaveProperty("changeMinimum");
    expect(short.required).toBe(ada(50));
    expect(short.missing).toBe(ada(40));
  });

  it("says when only the change is short", async () => {
    const funds = utxo(lovelace(ada(50) + 200_000n));
    const short = await fundsShort({ parts: [pay(50)], utxos: [funds] });
    expect(short.reason).toBe("change");
    expect(short.available).toBeGreaterThanOrEqual(
      ada(50) + short.feeEstimate!,
    );
    expect(short.missing).toBe(short.required - short.available);

    const built = await new TxBuilder({ network, params }).build([pay(50)], {
      payer: { changeAddress: wallet, utxos: [raised(funds, short.missing)] },
    });
    expect(built.fee).toBe(short.feeEstimate);
    await fundsShort({
      parts: [pay(50)],
      utxos: [raised(funds, short.missing - 1n)],
    });
  });

  it("names the payer when no UTxOs are given at all", async () => {
    const builder = new TxBuilder({ network, params });
    const error = await expectBuildError(
      builder.build([pay(5)], { payer: { changeAddress: wallet, utxos: [] } }),
      "INSUFFICIENT_FUNDS",
    );
    expect(error.details).toMatchObject({
      unit: "lovelace",
      reason: "noUtxos",
      available: 0n,
      pool: { given: 0, selectable: 0 },
    });
    expect(error.message).toContain(wallet);
    expect(error.message).toContain(
      "a provider may answer a failed request with an empty list",
    );
  });

  it("counts each given UTxO once, by why it could not be selected", async () => {
    const oracle = utxo(lovelace(ada(5)));
    const spent = utxo(lovelace(ada(5)));
    const putUp = utxo(lovelace(ada(5)));
    const plain = utxo(lovelace(ada(5)));
    const locked = utxo(lovelace(ada(5)), {}, scriptAddress);
    const short = await fundsShort({
      parts: [
        referenceInput({ utxo: oracle }),
        spend.pubKey({ utxo: spent }),
        collateral({ utxo: putUp }),
        pay(500),
      ],
      utxos: [oracle, spent, putUp, plain, locked],
    });
    expect(short.pool).toEqual({
      given: 5,
      selectable: 1,
      scriptLocked: 1,
      excludedByFilter: 0,
      readByParts: 1,
      spentByAfter: 0,
    });
    // The spent UTxO counts as what the parts bring in
    expect(short.available).toBe(ada(10));
  });

  it("counts a fixed fee as it is, and no change the build does not need", async () => {
    const funds = utxo(lovelace(ada(3) + 100_000n));
    const short = await fundsShort({
      parts: [pay(3)],
      utxos: [funds],
      fee: 200_000n,
    });
    expect(short.feeEstimate).toBe(200_000n);
    expect(short).not.toHaveProperty("changeMinimum");
    expect(short.missing).toBe(100_000n);
    expect(short.required).toBe(ada(3) + 200_000n);

    const built = await new TxBuilder({ network, params }).build([pay(3)], {
      payer: { changeAddress: wallet, utxos: [raised(funds, short.missing)] },
      fee: 200_000n,
    });
    expect(built.change).toEqual([]);
    expectBalanced(built);
  });

  it("says when the fee is an upper bound taken before evaluation", async () => {
    const locked = utxo(
      lovelace(ada(10)),
      { plutusData: "d87980" },
      scriptAddress,
    );
    const units = { mem: 1000, steps: 2000 };
    const parts = (exUnits?: typeof units) => [
      spend.plutus({
        utxo: locked,
        script: plutusScript,
        redeemer: { data: mConStr0([]), ...(exUnits && { exUnits }) },
      }),
      output({ address: recipient, value: { lovelace: 11_200_000n } }),
    ];
    const builder = new TxBuilder({
      network,
      costModels,
      params,
      evaluator: fakeEvaluator(units).evaluator,
    });
    const funds = [utxo(lovelace(ada(3)))];
    const passing = await builder.build(parts(units), {
      payer: { changeAddress: wallet, utxos: funds },
    });

    const error = await expectBuildError(
      builder.build(parts(), {
        payer: { changeAddress: wallet, utxos: funds },
      }),
      "INSUFFICIENT_FUNDS",
    );
    const short = (error as TxBuildError<"INSUFFICIENT_FUNDS">).details;
    expect(short.feeEstimate).toBeGreaterThan(passing.fee);
    expect(error.message).toContain(
      "the fee is an upper bound, taken before the scripts were evaluated",
    );
  });

  it("asks for one lovelace when only the input a transaction must spend is missing", async () => {
    const stake = keyHashToRewardAddress(keyHashHex(5), 0);
    const short = await fundsShort({
      parts: [certificate.stakeDeregistration({ stake, refund: ada(2) })],
      utxos: [],
    });
    expect(short).toMatchObject({
      unit: "lovelace",
      missing: 1n,
      reason: "noUtxos",
    });
  });
});

describe("TxBuilder: deposits and refunds", () => {
  const stake = keyHashToRewardAddress(keyHashHex(5), 0);
  const build = (
    parts: TxPart[],
    builder = new TxBuilder({
      network,
      params,
      deposits: { drepDeposit: ada(500), govActionDeposit: ada(1000) },
    }),
    extra: { registeredPools?: string[] } = {},
  ) =>
    builder.build(parts, {
      payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(5000)))] },
      ...extra,
    });

  it("takes stake registration deposits from keyDeposit", async () => {
    const built = await build([
      certificate.stakeRegistration({ stake }),
      certificate.legacyStakeRegistration({
        stake: keyHashToRewardAddress(keyHashHex(6), 0),
      }),
    ]);
    expect(built.prototype.body.certs![0]).toMatchObject({
      value: { coin: "2000000" },
    });
    expectBalanced(built, { deposits: 2n * 2_000_000n });
  });

  it("returns refunds with the change", async () => {
    const built = await build([
      certificate.stakeDeregistration({ stake, refund: 3_000_000n }),
      certificate.legacyStakeDeregistration({
        stake: keyHashToRewardAddress(keyHashHex(6), 0),
      }),
    ]);
    expectBalanced(built, { refunds: 3_000_000n + 2_000_000n });
  });

  it("pays a refund-funded transaction from one input still", async () => {
    // The refund alone pays the fee, but a transaction spends at least one input
    const built = await build([
      certificate.stakeDeregistration({ stake, refund: ada(2) }),
    ]);
    expect(built.inputs).toHaveLength(1);
    expectBalanced(built, { refunds: ada(2) });
  });

  it("takes pool deposits for new pools only", async () => {
    const pool = certificate.poolRegistration({
      params: {
        operator: keyHashHex(7),
        vrfKeyHash: vrfKeyHashHex(1),
        pledge: "1000000",
        cost: "340000000",
        margin: [1, 100],
        relays: [],
        owners: [keyHashHex(8)],
        rewardAddress: stake,
      },
    });
    expectBalanced(await build([pool]), { deposits: ada(500) });
    expectBalanced(
      await build([pool], undefined, { registeredPools: [keyHashHex(7)] }),
    );
  });

  it("takes DRep and proposal deposits from the governance deposits", async () => {
    const built = await build([
      certificate.drepRegistration({
        drep: { type: "KEY", value: keyHashHex(9) },
      }),
      proposal.info({ rewardAccount: stake, anchor }),
    ]);
    expect(built.prototype.body.voting_proposals![0]!.deposit).toBe(
      String(ada(1000)),
    );
    expectBalanced(built, { deposits: ada(500) + ada(1000) });
  });

  it("asks for a governance deposit it does not know", async () => {
    const error = await expectBuildError(
      build(
        [proposal.info({ rewardAccount: stake, anchor })],
        new TxBuilder({ network, params }),
      ),
      "MISSING_PARAMETER",
    );
    expect(error.details).toEqual({ parameter: "deposits" });
    expect(error.message).toContain("govActionDeposit");
    expect(error).toMatchObject({ part: "proposal" });
  });

  it("asks for keyDeposit in the params option", async () => {
    const { keyDeposit: _, ...withoutKeyDeposit } = params;
    const error = await expectBuildError(
      build(
        [certificate.stakeRegistration({ stake })],
        new TxBuilder({ network, params: withoutKeyDeposit as Protocol }),
      ),
      "MISSING_PARAMETER",
    );
    expect(error.details).toEqual({ parameter: "params" });
    expect(error.message).toContain("keyDeposit");
    expect(error.message).toContain("builder's params option");
    expect(error).toMatchObject({ part: "certificate" });
  });

  it("withdraws a whole reward balance, looked up once", async () => {
    const { fetcher, calls } = fakeFetcher([], { [stake]: "4200000" });
    const built = await build(
      [withdrawal.pubKey({ rewardAddress: stake, amount: "all" })],
      new TxBuilder({ network, params, provider: fetcher }),
    );
    expect(built.prototype.body.withdrawals).toEqual({ [stake]: "4200000" });
    expect(calls.fetchAccountInfo).toBe(1);
    expectBalanced(built);
  });
});

describe("TxBuilder: resolution", () => {
  it("fetches each transaction's outputs once, and only those it does not know", async () => {
    const txHash = "ee".repeat(32);
    const outputs: UTxO[] = [0, 1].map((outputIndex) => ({
      input: { txHash, outputIndex },
      output: { address: wallet, amount: lovelace(ada(3)) },
    }));
    const known = utxo(lovelace(ada(4)));
    const { fetcher, calls } = fakeFetcher([...outputs, known]);
    const built = await new TxBuilder({
      network,
      params,
      provider: fetcher,
    }).build(
      [
        spend.pubKey({ utxo: { txHash, outputIndex: 0 } }),
        spend.pubKey({ utxo: { txHash, outputIndex: 1 } }),
        spend.pubKey({ utxo: known.input }),
        output({ address: recipient, value: { lovelace: ada(8) } }),
      ],
      { payer: { changeAddress: wallet, utxos: [known] } },
    );
    expect(calls).toEqual({ fetchUTxOs: 1 });
    expect(built.inputs).toHaveLength(3);
  });

  it("fetches the protocol parameters, and cost models only for Plutus scripts", async () => {
    const { fetcher, calls } = fakeFetcher([]);
    await new TxBuilder({ network, provider: fetcher }).build(
      [output({ address: recipient, value: { lovelace: ada(2) } })],
      { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] } },
    );
    expect(calls).toEqual({ fetchProtocolParameters: 1 });
  });

  it("needs a fetcher for outputs given by reference", async () => {
    await expectBuildError(
      new TxBuilder({ network, params }).build(
        [spend.pubKey({ utxo: { txHash: "ee".repeat(32), outputIndex: 0 } })],
        { payer: { changeAddress: wallet, utxos: [] } },
      ),
      "MISSING_FETCHER",
    );
  });

  it("reports an output that does not exist", async () => {
    const error = await expectBuildError(
      new TxBuilder({
        network,
        params,
        provider: fakeFetcher([]).fetcher,
      }).build(
        [spend.pubKey({ utxo: { txHash: "ee".repeat(32), outputIndex: 3 } })],
        { payer: { changeAddress: wallet, utxos: [] } },
      ),
      "UTXO_NOT_FOUND",
    );
    expect(error.message).toContain(`${"ee".repeat(32)}#3`);
    expect(error.details).toEqual({
      input: { txHash: "ee".repeat(32), outputIndex: 3 },
    });
    expect(error.cause).toBeUndefined();
  });

  it("works out the datum of a script output once it is fetched", async () => {
    const locked: UTxO = {
      input: { txHash: "ab".repeat(32), outputIndex: 0 },
      output: {
        address: scriptAddress,
        amount: lovelace(ada(10)),
        plutusData: "d87980",
      },
    };
    const built = await new TxBuilder({
      network,
      params,
      provider: fakeFetcher([locked]).fetcher,
      evaluator: fakeEvaluator().evaluator,
    }).build(
      [
        spend.plutus({
          utxo: locked.input,
          script: plutusScript,
          redeemer: { data: mConStr0([]) },
        }),
      ],
      { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] } },
    );
    const part = built.parts.find(
      (p) => p.kind === "spend" && p.witness.type === "plutus",
    );
    expect(part).toMatchObject({ witness: { datum: { type: "inline" } } });
  });
});

describe("TxBuilder: scripts", () => {
  const locked = (n: number): UTxO => ({
    input: { txHash: (0xf0 + n).toString(16).repeat(32), outputIndex: 0 },
    output: {
      address: scriptAddress,
      amount: lovelace(ada(10)),
      plutusData: "d87980",
    },
  });
  const scriptSpend = (n: number, exUnits?: { mem: number; steps: number }) =>
    spend.plutus({
      utxo: locked(n),
      script: plutusScript,
      redeemer: { data: mConStr0([n]), ...(exUnits && { exUnits }) },
      label: `spend ${n}`,
    });

  it("evaluates until the execution units settle, then prices them in", async () => {
    const { evaluator, calls } = fakeEvaluator({ mem: 5000, steps: 7000 });
    const built = await new TxBuilder({
      network,
      costModels,
      params,
      evaluator,
    }).build([scriptSpend(2), scriptSpend(1)], {
      payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
    });

    // Placeholders, then the evaluated units, which the second evaluation confirms
    expect(calls).toHaveLength(2);
    expect(
      built.redeemers.map((r) => [r.tag, r.index, r.label, r.exUnits]),
    ).toEqual([
      ["SPEND", 0, "spend 1", { mem: 5000, steps: 7000 }],
      ["SPEND", 1, "spend 2", { mem: 5000, steps: 7000 }],
    ]);
    expect(built.exUnits).toEqual({ mem: 10000n, steps: 14000n });
    expect(built.prototype.body.script_data_hash).toMatch(/^[0-9a-f]{64}$/);
    // Collateral is put up from the wallet, the rest of it returned
    expect(built.collateral!.total).toBe((built.fee * 150n + 99n) / 100n);
    expect(built.collateral!.return).toBeDefined();
    expect(built.prototype.body.total_collateral).toBe(
      built.collateral!.total.toString(),
    );
  });

  it("keeps given execution units, and checks them against evaluation", async () => {
    const { evaluator } = fakeEvaluator({ mem: 5000, steps: 7000 });
    const built = await new TxBuilder({
      network,
      costModels,
      params,
      evaluator,
    }).build([scriptSpend(1, { mem: 6000, steps: 8000 })], {
      payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
    });
    expect(built.redeemers[0]!.exUnits).toEqual({ mem: 6000, steps: 8000 });

    const error = await expectBuildError(
      new TxBuilder({ network, costModels, params, evaluator }).build(
        [scriptSpend(1, { mem: 4000, steps: 8000 })],
        { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] } },
      ),
      "EXUNITS_TOO_LOW",
    );
    expect(error.label).toBe("spend 1");
    expect(error.details).toEqual({
      needed: { mem: 5000, steps: 7000 },
      given: { mem: 4000, steps: 8000 },
    });
  });

  it("builds offline when every redeemer states its units", async () => {
    const built = await new TxBuilder({
      network,
      costModels,
      evaluator: null,
      params,
    }).build([scriptSpend(1, { mem: 6000, steps: 8000 })], {
      payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
    });
    expect(built.redeemers[0]!.exUnits).toEqual({ mem: 6000, steps: 8000 });
  });

  it("needs an evaluator for redeemers without units", async () => {
    await expectBuildError(
      new TxBuilder({ network, costModels, evaluator: null, params }).build(
        [scriptSpend(1)],
        { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] } },
      ),
      "MISSING_EVALUATOR",
    );
  });

  /** An evaluator rejecting as a script evaluator does, recording the transactions it got */
  const failingEvaluator = (failures: ScriptFailure[]) => {
    const calls: string[] = [];
    const rejection = new ScriptEvaluationError("scripts failed", failures);
    const evaluator: IEvaluator = {
      evaluateTx: async (tx) => {
        calls.push(tx);
        throw rejection;
      },
    };
    return { evaluator, calls, rejection };
  };
  const failure = (
    tag: ScriptFailure["tag"],
    index: number,
  ): ScriptFailure => ({
    tag,
    index,
    message: `${tag}[${index}] failed`,
    logs: ["trace"],
    budget: { mem: 10, steps: 20 },
  });
  const evaluationError = (error: TxBuildError) =>
    error as TxBuildError<"EVALUATION_FAILED">;

  it("reports evaluation failures with the redeemers' parts", async () => {
    const { evaluator, calls, rejection } = failingEvaluator([
      failure("SPEND", 0),
    ]);
    const error = evaluationError(
      await expectBuildError(
        new TxBuilder({ network, costModels, params, evaluator }).build(
          [scriptSpend(1)],
          {
            payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
          },
        ),
        "EVALUATION_FAILED",
      ),
    );
    expect(error).toMatchObject({ part: "spend", label: "spend 1" });
    expect(error.message).toBe(
      'spend "spend 1": script evaluation failed: scripts failed',
    );
    expect(error.cause).toBe(rejection);
    expect(error.details.tx).toBe(calls[0]);
    expect(error.details.failures).toEqual([
      { ...failure("SPEND", 0), part: "spend", label: "spend 1" },
    ]);
    expect(error.details).not.toHaveProperty("redeemers");
    expect(error.details).not.toHaveProperty("cause");
  });

  it("joins each script failure to its part, by tag and index", async () => {
    const two = failingEvaluator([failure("SPEND", 1), failure("SPEND", 0)]);
    const error = evaluationError(
      await expectBuildError(
        new TxBuilder({
          network,
          costModels,
          params,
          evaluator: two.evaluator,
        }).build([scriptSpend(1), scriptSpend(2)], {
          payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
        }),
        "EVALUATION_FAILED",
      ),
    );
    expect(error.part).toBeUndefined();
    expect(error.label).toBeUndefined();
    expect(error.message).toBe("script evaluation failed: scripts failed");
    expect(
      error.details.failures.map((f) => [f.tag, f.index, f.label]),
    ).toEqual([
      ["SPEND", 1, "spend 2"],
      ["SPEND", 0, "spend 1"],
    ]);

    // Every purpose: the parts of the test above
    const scriptStake = scriptHashToRewardAddress(alwaysSucceedHash, 0);
    const witness = { plutus: plutusScript, redeemer: { data: mConStr0([]) } };
    const every = failingEvaluator([
      failure("PROPOSE", 1),
      failure("REWARD", 0),
      failure("CERT", 1),
      failure("MINT", 0),
      failure("SPEND", 1),
    ]);
    const all = evaluationError(
      await expectBuildError(
        new TxBuilder({
          network,
          costModels,
          params,
          evaluator: every.evaluator,
          deposits: { govActionDeposit: ada(10) },
        }).build(
          [
            scriptSpend(3),
            mint.plutus({
              script: plutusScript,
              redeemer: { data: mConStr0([]) },
              assets: { "01": 1n },
              label: "mint",
            }),
            withdrawal.plutus({
              rewardAddress: scriptStake,
              amount: 0n,
              script: plutusScript,
              redeemer: { data: mConStr0([]) },
              label: "withdraw",
            }),
            certificate.stakeRegistration({
              stake: keyHashToRewardAddress(keyHashHex(1), 0),
            }),
            certificate.stakeDelegation({
              stake: scriptStake,
              pool: keyHashHex(2),
              witness,
              label: "delegate",
            }),
            proposal.info({ rewardAccount: scriptStake, anchor }),
            proposal.treasuryWithdrawals({
              rewardAccount: scriptStake,
              anchor,
              withdrawals: { [scriptStake]: 1n },
              guardrail: witness,
              label: "propose",
            }),
          ],
          {
            payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(100)))] },
          },
        ),
        "EVALUATION_FAILED",
      ),
    );
    expect(
      all.details.failures.map((f) => [f.tag, f.index, f.part, f.label]),
    ).toEqual([
      ["PROPOSE", 1, "proposal", "propose"],
      ["REWARD", 0, "withdrawal", "withdraw"],
      ["CERT", 1, "certificate", "delegate"],
      ["MINT", 0, "mint", "mint"],
      ["SPEND", 1, "spend", "spend 3"],
    ]);
  });

  it("makes up no failure the evaluator did not join to a redeemer", async () => {
    const build = (evaluator: IEvaluator) =>
      new TxBuilder({ network, costModels, params, evaluator })
        .build([scriptSpend(1)], {
          payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
        })
        .then(
          () => {
            throw new Error("expected EVALUATION_FAILED");
          },
          (error: unknown) => error as TxBuildError<"EVALUATION_FAILED">,
        );

    // A failure pointing at no redeemer stays on the cause only
    const stray = failingEvaluator([failure("SPEND", 7)]);
    const unjoined = await build(stray.evaluator);
    expect(unjoined.code).toBe("EVALUATION_FAILED");
    expect(unjoined.details.failures).toEqual([]);
    expect(unjoined.cause).toBe(stray.rejection);
    expect(unjoined.part).toBeUndefined();

    // A rejection that is not a script evaluation error
    for (const thrown of [new Error("down"), "down", { reason: "down" }]) {
      const error = await build({
        evaluateTx: async () => {
          throw thrown;
        },
      });
      expect(error.code).toBe("EVALUATION_FAILED");
      expect(error.details.failures).toEqual([]);
      expect(error.cause).toBe(thrown);
      expect(error.message).toContain("down");
    }

    // No units for a redeemer
    const calls: string[] = [];
    const silent = await build({
      evaluateTx: async (tx) => {
        calls.push(tx);
        return [];
      },
    });
    expect(silent).toMatchObject({
      code: "EVALUATION_FAILED",
      part: "spend",
      label: "spend 1",
    });
    expect(silent.details).toEqual({ tx: calls[0], failures: [] });
    expect(silent.cause).toBeUndefined();
  });

  it("reports scripts needing more than a transaction may use", async () => {
    const { evaluator } = fakeEvaluator({ mem: 9_000_000, steps: 1000 });
    const error = await expectBuildError(
      new TxBuilder({ network, costModels, params, evaluator }).build(
        [scriptSpend(1), scriptSpend(2)],
        { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(100)))] } },
      ),
      "EXUNITS_EXCEEDED",
    );
    expect(error.details).toEqual({ mem: 18_000_000n, steps: 2000n });
  });

  it("reports given units more than a transaction may use, before evaluating", async () => {
    const { evaluator, calls } = fakeEvaluator();
    const stated = { mem: 9_000_000, steps: 1000 };
    const error = await expectBuildError(
      new TxBuilder({ network, costModels, params, evaluator }).build(
        [scriptSpend(1, stated), scriptSpend(2, stated), scriptSpend(3)],
        { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(100)))] } },
      ),
      "EXUNITS_EXCEEDED",
    );
    expect(error.message).toContain("the given execution units are more");
    // The totals of the given units, not what is left of the limits
    expect(error.details).toEqual({ mem: 18_000_000n, steps: 2000n });
    expect(calls).toHaveLength(0);
  });

  it("points redeemers of every purpose at their items", async () => {
    const scriptStake = scriptHashToRewardAddress(alwaysSucceedHash, 0);
    const witness = { plutus: plutusScript, redeemer: { data: mConStr0([]) } };
    const { evaluator } = fakeEvaluator();
    const built = await new TxBuilder({
      network,
      costModels,
      params,
      evaluator,
      deposits: { govActionDeposit: ada(10) },
    }).build(
      [
        scriptSpend(3),
        mint.plutus({
          script: plutusScript,
          redeemer: { data: mConStr0([]) },
          assets: { "01": 1n },
          label: "mint",
        }),
        withdrawal.pubKey({
          rewardAddress: keyHashToRewardAddress("00".repeat(28), 0),
          amount: 0n,
        }),
        withdrawal.plutus({
          rewardAddress: scriptStake,
          amount: 0n,
          script: plutusScript,
          redeemer: { data: mConStr0([]) },
          label: "withdraw",
        }),
        certificate.stakeRegistration({
          stake: keyHashToRewardAddress(keyHashHex(1), 0),
        }),
        certificate.stakeDelegation({
          stake: scriptStake,
          pool: keyHashHex(2),
          witness,
          label: "delegate",
        }),
        proposal.info({ rewardAccount: scriptStake, anchor }),
        proposal.treasuryWithdrawals({
          rewardAccount: scriptStake,
          anchor,
          withdrawals: { [scriptStake]: 1n },
          guardrail: witness,
          label: "propose",
        }),
      ],
      { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(100)))] } },
    );
    // The wallet input sorts before the script input
    expect(built.redeemers.map((r) => [r.tag, r.index, r.label])).toEqual([
      ["SPEND", 1, "spend 3"],
      ["MINT", 0, "mint"],
      ["CERT", 1, "delegate"],
      ["REWARD", 0, "withdraw"],
      ["VOTING_PROPOSAL", 1, "propose"],
    ]);
  });

  it("uses given collateral and a given return address", async () => {
    const held = utxo(lovelace(ada(20)));
    const returnTo = baseAddress(9);
    const built = await new TxBuilder({
      network,
      costModels,
      params,
      evaluator: fakeEvaluator().evaluator,
    }).build(
      [
        scriptSpend(1),
        collateral({ utxo: held }),
        collateralReturn({ address: returnTo }),
      ],
      { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] } },
    );
    expect(built.collateral!.inputs).toEqual([held]);
    expect(built.prototype.body.collateral_return).toMatchObject({
      address: returnTo,
      amount: { coin: String(ada(20) - built.collateral!.total) },
    });
  });

  it("forfeits the whole collateral when what is left is too little to return", async () => {
    const tight = utxo(lovelace(ada(1)));
    const built = await new TxBuilder({
      network,
      costModels,
      params,
      evaluator: fakeEvaluator().evaluator,
    }).build([scriptSpend(1), collateral({ utxo: tight })], {
      payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
    });
    expect(built.collateral).toEqual({ inputs: [tight], total: ada(1) });
    expect(built.prototype.body.total_collateral).toBe(String(ada(1)));
    expect(built.prototype.body.collateral_return).toBeUndefined();
  });

  it("prefers a collateral UTxO that leaves a return worth making", async () => {
    const tight = utxo(lovelace(ada(1)));
    const roomy = utxo(lovelace(ada(3)));
    const built = await new TxBuilder({
      network,
      costModels,
      params,
      evaluator: fakeEvaluator().evaluator,
    }).build([scriptSpend(1)], {
      payer: {
        changeAddress: wallet,
        utxos: [utxo(lovelace(ada(10))), tight, roomy],
      },
    });
    expect(built.collateral!.inputs).toEqual([roomy]);
    expect(built.collateral!.return).toBeDefined();
  });

  it("reports missing collateral", async () => {
    const detailsOf = (error: TxBuildError) =>
      (error as TxBuildError<"INSUFFICIENT_COLLATERAL">).details;
    const none = await expectBuildError(
      new TxBuilder({
        network,
        costModels,
        params,
        evaluator: fakeEvaluator().evaluator,
      }).build([scriptSpend(1)], {
        payer: { changeAddress: wallet, utxos: [] },
      }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(detailsOf(none).available).toBe(0n);
    expect(typeof detailsOf(none).required).toBe("bigint");

    const small = await expectBuildError(
      new TxBuilder({
        network,
        costModels,
        params,
        evaluator: fakeEvaluator().evaluator,
      }).build(
        [scriptSpend(1), collateral({ utxo: utxo(lovelace(100_000n)) })],
        { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] } },
      ),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(detailsOf(small).available).toBe(100_000n);
    expect(detailsOf(small).required).toBeGreaterThan(100_000n);

    // A stated total below what the fee calls for
    const stated = await expectBuildError(
      new TxBuilder({
        network,
        costModels,
        params,
        evaluator: fakeEvaluator().evaluator,
      }).build(
        [
          scriptSpend(1),
          collateral({ utxo: utxo(lovelace(ada(5))) }),
          collateralReturn({ address: wallet, totalCollateral: 1n }),
        ],
        { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] } },
      ),
      "INSUFFICIENT_COLLATERAL",
    );
    const { required, available } = detailsOf(stated);
    expect(available).toBe(1n);
    expect(required).toBeGreaterThan(1n);
    expect(stated.message).toContain(
      `the ${required} lovelace the fee calls for`,
    );
  });
});

describe("TxBuilder: UTxOs left out of selection", () => {
  const locked = (lovelaceHeld = ada(10)): UTxO =>
    utxo(lovelace(lovelaceHeld), { plutusData: "d87980" }, scriptAddress);
  const scriptSpend = (
    from = locked(),
    script: Parameters<typeof spend.plutus>[0]["script"] = plutusScript,
  ) => spend.plutus({ utxo: from, script, redeemer: { data: mConStr0([]) } });
  const pay = (n: number) =>
    output({ address: recipient, value: { lovelace: ada(n) } });
  const inputsOf = (built: BuiltTx) =>
    built.prototype.body.inputs.map((i) => `${i.transaction_id}#${i.index}`);
  const keyOf = (u: UTxO) => `${u.input.txHash}#${u.input.outputIndex}`;
  const referencesOf = (built: BuiltTx) =>
    (built.prototype.body.reference_inputs ?? []).map(
      (i) => `${i.transaction_id}#${i.index}`,
    );
  const build = (parts: TxPart[], utxos: UTxO[]) =>
    new TxBuilder({
      network,
      costModels,
      params,
      evaluator: fakeEvaluator().evaluator,
    }).build(parts, { payer: { changeAddress: wallet, utxos } });

  it("does not spend a UTxO a reference input reads", async () => {
    const plain = utxo(lovelace(ada(40)));
    const oracle = utxo(lovelace(ada(50)));
    const built = await build(
      [pay(10), referenceInput({ utxo: oracle })],
      [plain, oracle],
    );

    expect(built.selectedInputs).toEqual([plain]);
    expect(inputsOf(built)).toEqual([keyOf(plain)]);
    expect(referencesOf(built)).toEqual([keyOf(oracle)]);
  });

  it("does not spend or put up a UTxO holding a reference script the parts read", async () => {
    const holder = utxo(lovelace(ada(50)), {
      scriptRef: resolveScriptRef(plutusScript),
    });
    const parts = () => [scriptSpend(locked(), { reference: holder }), pay(15)];
    await expectBuildError(build(parts(), [holder]), "INSUFFICIENT_FUNDS");

    const plain = utxo(lovelace(ada(20)));
    const built = await build(parts(), [holder, plain]);
    expect(referencesOf(built)).toEqual([keyOf(holder)]);
    expect(inputsOf(built)).not.toContain(keyOf(holder));
    expect(built.collateral!.inputs).not.toContainEqual(holder);
  });

  it("does not spend a UTxO holding a native reference script the parts read", async () => {
    const nativeScript: NativeScript = { type: "all", scripts: [] };
    const holder = utxo(lovelace(ada(50)), {
      scriptRef: resolveScriptRef(nativeScript),
    });
    const parts = [
      mint.native({ script: { reference: holder }, assets: { "01": 1n } }),
      pay(15),
    ];
    await expectBuildError(build(parts, [holder]), "INSUFFICIENT_FUNDS");

    const built = await build(parts, [holder, utxo(lovelace(ada(20)))]);
    expect(referencesOf(built)).toEqual([keyOf(holder)]);
    expect(inputsOf(built)).not.toContain(keyOf(holder));
  });

  it("does not put up a UTxO a reference input reads as collateral", async () => {
    const oracle = utxo(lovelace(ada(5)));
    const unit = mockTokenUnit(1);
    const withToken = utxo([...lovelace(ada(10)), { unit, quantity: "1" }]);
    const parts = () => [
      scriptSpend(),
      pay(5),
      referenceInput({ utxo: oracle }),
    ];

    const built = await build(parts(), [oracle, withToken]);
    expect(built.collateral!.inputs).toEqual([withToken]);
    expect(built.selectedInputs).toEqual([]);

    await expectBuildError(build(parts(), [oracle]), "INSUFFICIENT_COLLATERAL");
  });

  it("rejects a reference input the transaction also spends", async () => {
    const both = utxo(lovelace(ada(10)));
    await expectBuildError(
      build(
        [spend.pubKey({ utxo: both }), referenceInput({ utxo: both }), pay(2)],
        [],
      ),
      "DUPLICATE_PART",
    );
  });

  it("does not spend a UTxO a collateral part puts up", async () => {
    const plain = utxo(lovelace(ada(40)));
    const putUp = utxo(lovelace(ada(50)));
    const parts = () => [scriptSpend(), pay(30), collateral({ utxo: putUp })];

    const built = await build(parts(), [plain, putUp]);
    expect(built.collateral!.inputs).toEqual([putUp]);
    expect(built.selectedInputs).toEqual([plain]);
    expect(built.inputs).not.toContainEqual(putUp);

    await expectBuildError(build(parts(), [putUp]), "INSUFFICIENT_FUNDS");
  });

  it("spends a collateral UTxO that a spend part names too", async () => {
    const both = utxo(lovelace(ada(10)));
    const built = await build(
      [spend.pubKey({ utxo: both }), collateral({ utxo: both }), pay(5)],
      [],
    );
    expect(built.inputs).toContainEqual(both);
    expect(built.collateral!.inputs).toEqual([both]);
  });
});

describe("TxBuilder: a given fee with scripts", () => {
  const locked = (lovelaceHeld = ada(10)): UTxO =>
    utxo(lovelace(lovelaceHeld), { plutusData: "d87980" }, scriptAddress);
  const scriptSpend = (exUnits?: { mem: number; steps: number }) =>
    spend.plutus({
      utxo: locked(),
      script: plutusScript,
      redeemer: { data: mConStr0([]), ...(exUnits && { exUnits }) },
    });
  const pay = (n: number) =>
    output({ address: recipient, value: { lovelace: ada(n) } });

  it("judges the fee on the final transaction, not the provisional round", async () => {
    const { evaluator, calls } = fakeEvaluator();
    const built = await new TxBuilder({
      network,
      costModels,
      params,
      evaluator,
    }).build([scriptSpend(), pay(5)], {
      payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
      fee: 1_000_000n,
    });

    expect(built.fee).toBe(1_000_000n);
    expect(built.prototype.body.fee).toBe("1000000");
    // The difference to the minimum stays fee and is not in the change
    expectBalanced(built);
    // Every body the evaluator saw carries the given fee
    expect(calls.length).toBeGreaterThan(1);
    for (const tx of calls)
      expect(Transaction.fromCbor(TxCBOR(tx)).body().fee()).toBe(1_000_000n);
  });

  it("rejects a fee below the final transaction's minimum", async () => {
    const error = await expectBuildError(
      new TxBuilder({
        network,
        costModels,
        params,
        evaluator: fakeEvaluator().evaluator,
      }).build([scriptSpend(), pay(5)], {
        payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
        fee: 100_000n,
      }),
      "FEE_TOO_LOW",
    );
    const details = error.details as { fee: bigint; minFee: bigint };
    expect(details.fee).toBe(100_000n);
    expect(details.minFee).toBeGreaterThan(100_000n);
    expect(details.minFee).toBeLessThan(1_000_000n);
  });

  it("asks the payer for no more than the given fee in the provisional round", async () => {
    const built = await new TxBuilder({
      network,
      costModels,
      params,
      evaluator: fakeEvaluator().evaluator,
    }).build([scriptSpend(), pay(10)], {
      payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(2)))] },
      fee: 300_000n,
    });
    expect(built.fee).toBe(300_000n);
    expect(built.change.map((o) => o.amount.coin)).toEqual(["1700000"]);
    expectBalanced(built);
  });

  it("judges the fee in the first round when every redeemer states its units", async () => {
    const units = { mem: 1000, steps: 2000 };
    const parts = [scriptSpend(units), pay(5)];
    const options = {
      payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
      fee: 1000n,
    };
    await expectBuildError(
      new TxBuilder({ network, costModels, params, evaluator: null }).build(
        parts,
        options,
      ),
      "FEE_TOO_LOW",
    );
    const { evaluator, calls } = fakeEvaluator();
    await expectBuildError(
      new TxBuilder({ network, costModels, params, evaluator }).build(
        parts,
        options,
      ),
      "FEE_TOO_LOW",
    );
    expect(calls).toEqual([]);
  });
});

describe("TxBuilder: addresses in hex", () => {
  it("builds with an output address and a reward address given in hex", async () => {
    const stake = keyHashToRewardAddress(keyHashHex(5), 0);
    const hexOf = (address: string) =>
      Address.fromString(address)!.toBytes().toString();
    const built = await new TxBuilder({ network, params }).build(
      [
        output({ address: hexOf(recipient), value: { lovelace: ada(2) } }),
        withdrawal.pubKey({ rewardAddress: hexOf(stake), amount: 0n }),
      ],
      { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] } },
    );
    expect(built.prototype.body.outputs[0]!.address).toBe(recipient);
    expect(built.prototype.body.withdrawals).toEqual({ [stake]: "0" });
  });
});

/** `fakeFetcher` with jest mocks for methods, so its calls can be read by argument */
const mockedFetcher = (
  utxos: UTxO[],
  { rewards = {}, costModels: models = costModels } = {},
) => {
  const { fetcher } = fakeFetcher(utxos, rewards);
  const mocks = {
    fetchUTxOs: jest.fn(fetcher.fetchUTxOs),
    fetchAccountInfo: jest.fn(fetcher.fetchAccountInfo),
    fetchProtocolParameters: jest.fn(fetcher.fetchProtocolParameters),
    fetchCostModels: jest.fn(async (): Promise<number[][]> => models),
  };
  return { ...mocks, fetcher: mocks as unknown as IFetcher };
};

/** `fakeEvaluator` with jest mocks, the flag and `configure` only when asked for */
const mockedEvaluator = ({
  acceptsKnownUtxos = false,
  configurable = false,
} = {}) => {
  const evaluateTx = jest.fn(fakeEvaluator().evaluator.evaluateTx);
  const configure = jest.fn();
  const evaluator: IEvaluator = {
    evaluateTx,
    ...(acceptsKnownUtxos && { acceptsKnownUtxos }),
    ...(configurable && { configure }),
  };
  return { evaluator, evaluateTx, configure };
};

/** Out refs of the inputs, reference inputs and collateral of a transaction */
const outRefsOf = (tx: string) => {
  const body = Transaction.fromCbor(TxCBOR(tx)).body();
  return [
    ...body.inputs().values(),
    ...(body.referenceInputs()?.values() ?? []),
    ...(body.collateral()?.values() ?? []),
  ]
    .map((input) => `${input.transactionId()}#${input.index()}`)
    .sort();
};

const isFrozenAnywhere = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (Object.isFrozen(value) || Object.values(value).some(isFrozenAnywhere));

/** A custom network, with a clock of its own */
const devnet = customNetwork({
  name: "devnet",
  systemStart: "2026-01-01T00:00:00Z",
  slotLengthMs: 200,
  epochLength: 500,
});

// 2026-10-12, mid mainnet epoch 661 and mid preview/preprod day: clear of an epoch boundary
const NOW = 1791816751000;

describe("TxBuilder: reads", () => {
  afterEach(() => jest.restoreAllMocks());

  const scriptHash = "c1".repeat(32);
  const refHash = "c2".repeat(32);
  const otherHash = "c3".repeat(32);
  const locked: UTxO = {
    input: { txHash: scriptHash, outputIndex: 0 },
    output: {
      address: scriptAddress,
      amount: lovelace(ada(10)),
      plutusData: "d87980",
    },
  };
  const holdingScript: UTxO = {
    input: { txHash: refHash, outputIndex: 0 },
    output: {
      address: wallet,
      amount: lovelace(ada(20)),
      scriptRef: resolveScriptRef(plutusScript),
    },
  };
  const keyOutput: UTxO = {
    input: { txHash: otherHash, outputIndex: 0 },
    output: { address: wallet, amount: lovelace(ada(3)) },
  };
  const scriptSpend = () =>
    spend.plutus({
      utxo: locked.input,
      script: { reference: holdingScript.input },
      redeemer: { data: mConStr0([]) },
      label: "unlock",
    });
  const keySpend = () => spend.pubKey({ utxo: keyOutput.input });
  const request = (parts: TxPart[], changeAddress = wallet) =>
    [
      parts,
      { payer: { changeAddress, utxos: [utxo(lovelace(ada(10)))] } },
    ] as const;

  it("goes through the shared cache, each value fetched once across builds", async () => {
    const provider = mockedFetcher([locked, holdingScript, keyOutput]);
    const builder = new TxBuilder({
      network,
      provider: new CachedFetcher(provider.fetcher, { now: () => NOW }),
      evaluator: fakeEvaluator().evaluator,
    });
    await builder.build(...request([scriptSpend()]));
    await builder.build(...request([scriptSpend(), keySpend()]));

    expect(provider.fetchProtocolParameters).toHaveBeenCalledTimes(1);
    expect(provider.fetchCostModels).toHaveBeenCalledTimes(1);
    expect(provider.fetchUTxOs.mock.calls.map(([hash]) => hash).sort()).toEqual(
      [scriptHash, refHash, otherHash].sort(),
    );
  });

  it("shares the cache with every user of the same fetcher", async () => {
    // The clock of the cache the first builder makes
    jest.spyOn(Date, "now").mockReturnValue(NOW);
    const provider = mockedFetcher([locked, holdingScript]);
    const builders = [0, 1].map(
      () =>
        new TxBuilder({
          network,
          provider: provider.fetcher,
          evaluator: fakeEvaluator().evaluator,
        }),
    );
    for (const builder of builders)
      await builder.build(...request([scriptSpend()]));
    expect(provider.fetchUTxOs.mock.calls.map(([hash]) => hash).sort()).toEqual(
      [scriptHash, refHash].sort(),
    );
    expect(provider.fetchProtocolParameters).toHaveBeenCalledTimes(1);
    expect(provider.fetchCostModels).toHaveBeenCalledTimes(1);

    const other = mockedFetcher([keyOutput]);
    await CachedFetcher.wrap(other.fetcher).fetchUTxOs(otherHash);
    await new TxBuilder({ network, params, provider: other.fetcher }).build(
      ...request([keySpend()]),
    );
    expect(other.fetchUTxOs).toHaveBeenCalledTimes(1);
  });

  it("uses a CachedFetcher it is given as it is", async () => {
    const provider = mockedFetcher([]);
    // Keeps no parameters, as for a custom network
    const cache = new CachedFetcher(provider.fetcher, { network: "testnet" });
    const builder = new TxBuilder({ network, provider: cache });
    expect(builder.provider).toBe(cache);
    await builder.build(
      ...request([output({ address: recipient, value: {} })]),
    );
    await builder.build(
      ...request([output({ address: recipient, value: {} })]),
    );
    expect(provider.fetchProtocolParameters).toHaveBeenCalledTimes(2);
  });

  it("asks again after a failed or empty answer", async () => {
    const provider = mockedFetcher([keyOutput]);
    const builder = new TxBuilder({
      network,
      params,
      provider: provider.fetcher,
    });
    provider.fetchUTxOs.mockRejectedValueOnce(new Error("offline"));
    await expectBuildError(
      builder.build(...request([keySpend()])),
      "UTXO_NOT_FOUND",
    );
    provider.fetchUTxOs.mockResolvedValueOnce([]);
    await expectBuildError(
      builder.build(...request([keySpend()])),
      "UTXO_NOT_FOUND",
    );
    const built = await builder.build(...request([keySpend()]));
    expect(built.inputs).toContainEqual(keyOutput);
    expect(provider.fetchUTxOs).toHaveBeenCalledTimes(3);
  });

  it("asks again for parameters and cost models it failed to fetch", async () => {
    for (const method of [
      "fetchProtocolParameters",
      "fetchCostModels",
    ] as const) {
      const provider = mockedFetcher([locked, holdingScript]);
      const builder = new TxBuilder({
        network,
        provider: new CachedFetcher(provider.fetcher, { now: () => NOW }),
        evaluator: fakeEvaluator().evaluator,
      });
      provider[method].mockRejectedValueOnce(new Error("down"));
      await expectBuildError(
        builder.build(...request([scriptSpend()])),
        "MISSING_PARAMETER",
      );
      await builder.build(...request([scriptSpend()]));
      expect(provider[method]).toHaveBeenCalledTimes(2);
    }
  });

  it("reports a failed read with the provider's error as the cause", async () => {
    const down = new Error("503");
    const stake = keyHashToRewardAddress(keyHashHex(5), 0);

    const outputs = mockedFetcher([keyOutput]);
    outputs.fetchUTxOs.mockRejectedValueOnce(down);
    const notFound = await expectBuildError(
      new TxBuilder({ network, params, provider: outputs.fetcher }).build(
        ...request([keySpend()]),
      ),
      "UTXO_NOT_FOUND",
    );
    expect(notFound.details).toEqual({
      input: { txHash: otherHash, outputIndex: 0 },
    });
    expect(notFound.cause).toBe(down);

    for (const [method, parameter] of [
      ["fetchProtocolParameters", "params"],
      ["fetchCostModels", "costModels"],
    ] as const) {
      const provider = mockedFetcher([locked, holdingScript]);
      provider[method].mockRejectedValueOnce(down);
      const error = await expectBuildError(
        new TxBuilder({
          network,
          provider: new CachedFetcher(provider.fetcher, { now: () => NOW }),
          evaluator: fakeEvaluator().evaluator,
        }).build(...request([scriptSpend()])),
        "MISSING_PARAMETER",
      );
      expect(error.details).toEqual({ parameter });
      expect(error.cause).toBe(down);

      // The same from chain()
      const read = mockedFetcher([]);
      read[method].mockRejectedValueOnce(down);
      const fromChain = await expectBuildError(
        new TxBuilder({ network, provider: read.fetcher }).chain(),
        "MISSING_PARAMETER",
      );
      expect(fromChain.details).toEqual({ parameter });
      expect(fromChain.cause).toBe(down);
    }

    const rewards = mockedFetcher([]);
    rewards.fetchAccountInfo.mockRejectedValueOnce(down);
    const failed = await expectBuildError(
      new TxBuilder({ network, params, provider: rewards.fetcher }).build(
        ...request([
          withdrawal.pubKey({ rewardAddress: stake, amount: "all" }),
        ]),
      ),
      "PROVIDER_FAILED",
    );
    expect(failed.details).toEqual({ operation: "fetchAccountInfo" });
    expect(failed.cause).toBe(down);
    expect(failed.message).toContain("503");
  });

  it("leaves the cached outputs as they are, out of what it builds", async () => {
    const original = structuredClone([keyOutput, holdingScript]);
    const provider = mockedFetcher([keyOutput, holdingScript]);
    const built = await new TxBuilder({
      network,
      params,
      provider: provider.fetcher,
    }).build(
      ...request([keySpend(), referenceInput({ utxo: holdingScript.input })]),
    );

    const cache = CachedFetcher.wrap(provider.fetcher);
    const cached = [
      ...(await cache.fetchUTxOs(otherHash)),
      ...(await cache.fetchUTxOs(refHash)),
    ];
    expect(cached).toEqual(original);
    for (const utxo of cached) {
      expect(isFrozenAnywhere(utxo)).toBe(false);
      for (const input of built.inputs) {
        expect(input).not.toBe(utxo);
        expect(input.output).not.toBe(utxo.output);
      }
    }
    expect(built.inputs).toContainEqual(keyOutput);
  });

  it("withdraws a whole balance read within the cache's lifetime once", async () => {
    const stake = keyHashToRewardAddress(keyHashHex(5), 0);
    // The clock of the cache the builder makes
    jest.spyOn(Date, "now").mockReturnValue(NOW);
    const provider = mockedFetcher([], { rewards: { [stake]: "4200000" } });
    const builder = new TxBuilder({
      network,
      params,
      provider: provider.fetcher,
    });
    const withdraw = () =>
      builder.build(
        ...request([
          withdrawal.pubKey({ rewardAddress: stake, amount: "all" }),
        ]),
      );
    const [first, second] = [await withdraw(), await withdraw()];
    expect(provider.fetchAccountInfo).toHaveBeenCalledTimes(1);
    expect(first.prototype.body.withdrawals).toEqual({ [stake]: "4200000" });
    expect(second.prototype.body.withdrawals).toEqual({ [stake]: "4200000" });
  });

  it("neither clears the cache nor sets its network", async () => {
    for (const builderNetwork of [network, devnet] as NetworkInput[]) {
      const provider = mockedFetcher([locked, holdingScript]);
      const cache = CachedFetcher.wrap(provider.fetcher);
      const clear = jest.spyOn(cache, "clear");
      const clearVolatile = jest.spyOn(cache, "clearVolatile");
      const builder = new TxBuilder({
        network: builderNetwork,
        provider: provider.fetcher,
        evaluator: fakeEvaluator().evaluator,
      });
      expect(cache.network).toBeUndefined();
      await builder.build(...request([scriptSpend()]));
      await builder.chain();
      expect(cache.network).toBeUndefined();
      expect(clear).not.toHaveBeenCalled();
      expect(clearVolatile).not.toHaveBeenCalled();
    }
  });
});

describe("TxBuilder: evaluator", () => {
  const scriptHash = "d1".repeat(32);
  const refHash = "d2".repeat(32);
  const locked: UTxO = {
    input: { txHash: scriptHash, outputIndex: 0 },
    output: {
      address: scriptAddress,
      amount: lovelace(ada(10)),
      plutusData: "d87980",
    },
  };
  const holdingScript: UTxO = {
    input: { txHash: refHash, outputIndex: 0 },
    output: {
      address: wallet,
      amount: lovelace(ada(20)),
      scriptRef: resolveScriptRef(plutusScript),
    },
  };
  const scriptSpend = (exUnits?: { mem: number; steps: number }) =>
    spend.plutus({
      utxo: locked.input,
      script: { reference: holdingScript.input },
      redeemer: { data: mConStr0([]), ...(exUnits && { exUnits }) },
      label: "unlock",
    });
  const funds = utxo(lovelace(ada(10)));
  const request = (parts: TxPart[]) =>
    [parts, { payer: { changeAddress: wallet, utxos: [funds] } }] as const;
  const scalusEvaluateTx = () =>
    jest.spyOn(OfflineEvaluatorScalus.prototype, "evaluateTx");
  /** What a preprod builder tells its evaluator */
  const contextOf = (models: number[][]) => ({
    network: "preprod",
    slotConfig: networkConfig("preprod").slotConfig,
    costModels: models,
  });

  afterEach(() => jest.restoreAllMocks());

  it("calls the evaluator with outputs only, never transactions", async () => {
    const { evaluator, evaluateTx } = mockedEvaluator();
    await new TxBuilder({
      network,
      provider: mockedFetcher([locked, holdingScript]).fetcher,
      evaluator,
    }).build(...request([scriptSpend()]));
    expect(evaluateTx).toHaveBeenCalledTimes(2);
    for (const args of evaluateTx.mock.calls) {
      expect(args).toHaveLength(3);
      expect(args[2]).toEqual([]);
    }
  });

  it("gives every known UTxO only to an evaluator that accepts them", async () => {
    const local = mockedEvaluator({ acceptsKnownUtxos: true });
    await new TxBuilder({
      network,
      provider: mockedFetcher([locked, holdingScript]).fetcher,
      evaluator: local.evaluator,
    }).build(...request([scriptSpend()]));
    expect(local.evaluateTx.mock.calls.length).toBeGreaterThan(0);
    for (const [tx, utxos] of local.evaluateTx.mock.calls) {
      const refs = utxos!.map(
        (u) => `${u.input.txHash}#${u.input.outputIndex}`,
      );
      // Inputs, the looked-up script input among them, the reference input and the collateral
      expect(refs.sort()).toEqual(outRefsOf(tx));
      expect(refs).toEqual(
        expect.arrayContaining([
          `${scriptHash}#0`,
          `${refHash}#0`,
          `${funds.input.txHash}#0`,
        ]),
      );
    }

    const remote = mockedEvaluator();
    await new TxBuilder({
      network,
      provider: mockedFetcher([locked, holdingScript]).fetcher,
      evaluator: remote.evaluator,
    }).build(...request([scriptSpend()]));
    expect(remote.evaluateTx.mock.calls.length).toBeGreaterThan(0);
    for (const [, utxos] of remote.evaluateTx.mock.calls)
      expect(utxos).toEqual([]);
  });

  it("configures the evaluator with the network, its clock and the build's cost models before each evaluation", async () => {
    const fetched = [[1, 2], [3], [4, 5, 6]];
    const { evaluator, evaluateTx, configure } = mockedEvaluator({
      configurable: true,
    });
    await new TxBuilder({
      network,
      provider: mockedFetcher([locked, holdingScript], { costModels: fetched })
        .fetcher,
      evaluator,
    }).build(...request([scriptSpend()]));
    expect(configure).toHaveBeenCalledTimes(evaluateTx.mock.calls.length);
    configure.mock.calls.forEach(([context], i) => {
      expect(context).toStrictEqual(contextOf(fetched));
      expect(configure.mock.invocationCallOrder[i]).toBeLessThan(
        evaluateTx.mock.invocationCallOrder[i]!,
      );
    });

    const given = [[7], [8], [9]];
    const other = mockedEvaluator({ configurable: true });
    await new TxBuilder({
      network,
      provider: mockedFetcher([locked, holdingScript], { costModels: fetched })
        .fetcher,
      costModels: given,
      evaluator: other.evaluator,
    }).build(...request([scriptSpend()]));
    expect(other.configure.mock.calls.length).toBeGreaterThan(0);
    for (const [context] of other.configure.mock.calls)
      expect(context).toStrictEqual(contextOf(given));

    // An evaluator without configure is evaluated with all the same
    const plain = mockedEvaluator();
    await new TxBuilder({
      network,
      provider: mockedFetcher([locked, holdingScript]).fetcher,
      evaluator: plain.evaluator,
    }).build(...request([scriptSpend()]));
    expect(plain.evaluateTx).toHaveBeenCalled();

    // The builder's own evaluator is configured the same way
    const ownConfigure = jest.spyOn(
      OfflineEvaluatorScalus.prototype,
      "configure",
    );
    const ownEvaluateTx = scalusEvaluateTx().mockImplementation(
      fakeEvaluator().evaluator.evaluateTx,
    );
    const own = new TxBuilder({
      network,
      provider: mockedFetcher([locked, holdingScript], { costModels: fetched })
        .fetcher,
    });
    expect(own.evaluator).toBeInstanceOf(OfflineEvaluatorScalus);
    await own.build(...request([scriptSpend()]));
    expect(ownEvaluateTx.mock.calls.length).toBeGreaterThan(0);
    expect(ownConfigure).toHaveBeenCalledTimes(ownEvaluateTx.mock.calls.length);
    ownConfigure.mock.calls.forEach(([context], i) => {
      expect(context).toStrictEqual(contextOf(fetched));
      expect(ownConfigure.mock.invocationCallOrder[i]).toBeLessThan(
        ownEvaluateTx.mock.invocationCallOrder[i]!,
      );
    });
  });

  it("is a Scalus evaluator of its own unless given one, with a provider or without", () => {
    const { fetcher } = fakeFetcher([]);
    const builder = new TxBuilder({ network, provider: fetcher });
    expect(builder.evaluator).toBeInstanceOf(OfflineEvaluatorScalus);
    expect(builder.provider).toBe(fetcher);
    expect(
      new TxBuilder({ network, provider: fetcher, evaluator: undefined })
        .evaluator,
    ).toBeInstanceOf(OfflineEvaluatorScalus);
    expect(new TxBuilder({ network, provider: fetcher }).evaluator).not.toBe(
      builder.evaluator,
    );

    const { evaluator } = fakeEvaluator();
    expect(
      new TxBuilder({ network, provider: fetcher, evaluator }).evaluator,
    ).toBe(evaluator);
    const offline = new TxBuilder({ network, params });
    expect(offline.evaluator).toBeInstanceOf(OfflineEvaluatorScalus);
    expect(new TxBuilder({ network, params }).evaluator).not.toBe(
      offline.evaluator,
    );
    expect(
      new TxBuilder({ network, provider: fetcher, evaluator: null }).evaluator,
    ).toBeUndefined();
  });

  it("evaluates nothing after `evaluator: null`", async () => {
    const evaluateTx = scalusEvaluateTx();
    const builder = new TxBuilder({
      network,
      provider: mockedFetcher([locked, holdingScript]).fetcher,
      evaluator: null,
    });
    const built = await builder.build(
      ...request([scriptSpend({ mem: 6000, steps: 8000 })]),
    );
    expect(built.redeemers[0]!.exUnits).toEqual({ mem: 6000, steps: 8000 });
    await expectBuildError(
      builder.build(...request([scriptSpend()])),
      "MISSING_EVALUATOR",
    );
    expect(evaluateTx).not.toHaveBeenCalled();
  });

  it("does not run the default evaluator for a transaction without Plutus scripts", async () => {
    const evaluateTx = scalusEvaluateTx();
    const builder = new TxBuilder({
      network,
      provider: mockedFetcher([]).fetcher,
    });
    expect(builder.evaluator).toBeInstanceOf(OfflineEvaluatorScalus);
    await builder.build(
      ...request([output({ address: recipient, value: { lovelace: ada(2) } })]),
    );
    expect(evaluateTx).not.toHaveBeenCalled();
  });
});

describe("TxBuilder: serialization", () => {
  it("serializes with a given serializer", async () => {
    const parts = [output({ address: recipient, value: { lovelace: ada(2) } })];
    const options = {
      payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
    };
    const cst = await new TxBuilder({ network, params }).build(parts, options);
    const csl = await new TxBuilder({
      network,
      params,
      serializer: new CSLSerializer(),
    }).build(parts, options);
    expect(csl.prototype).toEqual(cst.prototype);
    expect(csl.txHash).toBe(cst.txHash);
  });

  it("rejects a serializer without serializeTxPrototype", async () => {
    const serializer = {
      ...new CSLSerializer(),
      serializeTxPrototype: undefined,
    };
    // With params the serializer is the only fault; without them it is still the one reported
    for (const options of [{ network, params }, { network }] as const)
      await expectBuildError(
        (async () =>
          new TxBuilder({ ...options, serializer: serializer as never }))(),
        "UNSUPPORTED_SERIALIZER",
      );
  });
});

describe("TxBuilder: validity in POSIX time", () => {
  // Slot S of preprod starts at T
  const S = 100000000;
  const T = 1755683200000;
  const { zeroTime, zeroSlot } = networkConfig("preprod").slotConfig;
  const pay = output({ address: recipient, value: { lovelace: ada(2) } });
  const payer = () => ({
    changeAddress: wallet,
    utxos: [utxo(lovelace(ada(100)))],
  });
  const devnet = (systemStart: number) =>
    customNetwork({ systemStart, slotLengthMs: 100, epochLength: 500 });
  const buildOn = (
    network: NetworkInput,
    part: TxPart,
    options: Omit<BuildOptions, "payer"> = {},
  ) =>
    new TxBuilder({ network, params }).build([pay, part], {
      payer: payer(),
      ...options,
    });
  const bodyOf = async (part: TxPart, on: NetworkInput = network) => {
    const { body } = (await buildOn(on, part)).prototype;
    return { from: body.validity_start_interval, until: body.ttl };
  };
  const expectPartError = async (build: Promise<unknown>, label?: string) => {
    try {
      await build;
    } catch (error) {
      expect(error).toBeInstanceOf(TxPartError);
      expect((error as TxPartError).code).toBe("INVALID_DATA");
      expect((error as TxPartError).part).toBe("validity");
      expect((error as TxPartError).label).toBe(label);
      return error as TxPartError;
    }
    throw new Error("expected an INVALID_DATA error");
  };

  afterEach(() => jest.restoreAllMocks());

  it.each([
    [{ from: T }, { from: String(S) }],
    [{ from: T + 1 }, { from: String(S + 1) }],
    [{ from: T + 999 }, { from: String(S + 1) }],
    [{ from: T - 1 }, { from: String(S) }],
    [{ until: T }, { until: String(S) }],
    [{ until: T + 999 }, { until: String(S) }],
    [{ until: T - 1 }, { until: String(S - 1) }],
  ])(
    "converts %j to the slots of the rounding rule on preprod",
    async (bounds, slots) => {
      expect(await bodyOf(validity(bounds))).toEqual({
        from: undefined,
        until: undefined,
        ...slots,
      });
    },
  );

  it("converts with a devnet's 100 ms slots", async () => {
    const start = 1_700_000_000_000;
    const on = devnet(start);
    const cases: [Parameters<typeof validity>[0], string, string][] = [
      [{ from: start + 1 }, "from", "1"],
      [{ from: start + 100 }, "from", "1"],
      [{ from: start + 101 }, "from", "2"],
      [{ until: start + 199 }, "until", "1"],
      [{ until: start + 200 }, "until", "2"],
    ];
    for (const [bounds, bound, slot] of cases)
      expect((await bodyOf(validity(bounds), on))[bound as "from"]).toBe(slot);
  });

  it("gives one part each builder's own slots", async () => {
    const t = T + 400;
    const part = validity({ from: t, until: t + 600000 });
    const given = { ...part };
    const builders = [
      new TxBuilder({ network, params }),
      new TxBuilder({ network: devnet(T - 50), params }),
    ];
    const pairs: unknown[] = [];
    for (const builder of builders) {
      const { body } = (await builder.build([pay, part], { payer: payer() }))
        .prototype;
      expect(body.validity_start_interval).toBe(
        String(builder.slotAt(t, "up")),
      );
      expect(body.ttl).toBe(String(builder.slotAt(t + 600000)));
      pairs.push([body.validity_start_interval, body.ttl]);
    }
    expect(pairs[0]).not.toEqual(pairs[1]);
    expect(part).toStrictEqual(given);
    expect(Object.isFrozen(part)).toBe(true);
  });

  it("converts a time bound next to a slot bound", async () => {
    expect(
      await bodyOf(validity({ invalidBefore: S, until: T + 600000 })),
    ).toEqual({ from: String(S), until: String(S + 600) });
  });

  it("holds the slots in the part it returns", async () => {
    const built = await buildOn(
      network,
      validity({ from: T + 1, until: T + 600000, label: "window" }),
    );
    const part = built.parts.find((p) => p.kind === "validity")!;
    expect(part).toStrictEqual({
      kind: "validity",
      invalidBefore: "100000001",
      invalidHereafter: "100000600",
      label: "window",
    });
    expect(Object.isFrozen(part)).toBe(true);
    expect(unresolved(part)).toEqual([]);
  });

  it("refuses an interval that holds no slot once converted", async () => {
    await expectPartError(
      buildOn(
        network,
        validity({ from: T + 1, until: T + 999, label: "window" }),
      ),
      "window",
    );
    const error = await expectPartError(
      buildOn(network, validity({ from: T, until: T + 500 })),
    );
    expect(error.message).toContain(`from ${T} (slot ${S})`);
    expect(error.message).toContain(`until ${T + 500} (slot ${S})`);
    await expectPartError(
      buildOn(network, validity({ invalidBefore: S + 5, until: T + 1000 })),
    );
    expect(await bodyOf(validity({ from: T, until: T + 1000 }))).toEqual({
      from: String(S),
      until: String(S + 1),
    });
  });

  it("refuses a time before the network's slot clock starts", async () => {
    for (const bounds of [
      { until: 1767225600 },
      { from: 0 },
      { from: zeroTime - 1 },
    ]) {
      const error = await expectPartError(buildOn(network, validity(bounds)));
      expect(error.message).toContain("milliseconds");
      expect(error.message).toContain(String(zeroTime));
    }
    expect(await bodyOf(validity({ from: zeroTime }))).toEqual({
      from: String(zeroSlot),
      until: undefined,
    });
  });

  it("refuses an interval before any request", async () => {
    const { fetcher, calls } = fakeFetcher([]);
    await expectPartError(
      new TxBuilder({ network, provider: fetcher }).build(
        [
          spend.pubKey({ utxo: { txHash: "ee".repeat(32), outputIndex: 0 } }),
          validity({ from: T + 1, until: T + 999, label: "window" }),
        ],
        { payer: payer() },
      ),
      "window",
    );
    expect(calls).toEqual({});
  });

  it("adds no bound of its own, and no warning, without a validity part", async () => {
    const built = await new TxBuilder({ network, params }).build([pay], {
      payer: payer(),
    });
    expect(built.prototype.body.ttl).toBeUndefined();
    expect(built.prototype.body.validity_start_interval).toBeUndefined();
    expect(built.warnings).toEqual([]);
  });

  it("warns of a lower bound whose slot starts after the local clock", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(T + 400);
    const events: BuildEvent[] = [];
    const built = await buildOn(
      network,
      validity({ from: T + 400, label: "window" }),
      { trace: (event) => events.push(event) },
    );
    expect(built.warnings).toEqual([
      {
        code: "VALID_FROM_FUTURE",
        message: expect.any(String),
        part: "validity",
        label: "window",
      },
    ]);
    // Slot S + 1 starts 600 ms after the clock
    expect(built.warnings[0]!.message).toContain("600");
    expect(events.map((e) => e.type)).not.toContain("warning");

    expect(
      (await buildOn(network, validity({ invalidBefore: S + 11 }))).warnings,
    ).toStrictEqual([
      {
        code: "VALID_FROM_FUTURE",
        message: expect.any(String),
        part: "validity",
      },
    ]);
    for (const bounds of [{ from: T - 5000 }, { until: T + 600000 }])
      expect((await buildOn(network, validity(bounds))).warnings).toEqual([]);

    now.mockReturnValue(T);
    expect((await buildOn(network, validity({ from: T }))).warnings).toEqual(
      [],
    );
  });

  it("changes no byte with the clock", async () => {
    const part = validity({ from: T + 400, label: "window" });
    const funds = payer();
    const now = jest.spyOn(Date, "now").mockReturnValue(T + 400);
    const builder = new TxBuilder({ network, params });
    const early = await builder.build([pay, part], { payer: funds });
    now.mockReturnValue(T + 400 + 3_600_000);
    const late = await builder.build([pay, part], { payer: funds });
    expect(late.tx).toBe(early.tx);
    expect(late.txHash).toBe(early.txHash);
    expect(early.warnings).toHaveLength(1);
    expect(late.warnings).toEqual([]);
  });

  it("warns on each network of a part valid from now", async () => {
    const t = T + 400;
    jest.spyOn(Date, "now").mockReturnValue(t);
    const part = validity({ from: t, until: t + 600000 });
    for (const [on, slot] of [
      [network, String(S + 1)],
      [devnet(T - 50), "5"],
    ] as const) {
      const built = await buildOn(on, part);
      expect(built.prototype.body.validity_start_interval).toBe(slot);
      expect(built.warnings.map((w) => w.code)).toEqual(["VALID_FROM_FUTURE"]);
    }
  });

  it("takes a bigint time in slotAt, refusing one that is not a safe integer", () => {
    const builder = new TxBuilder({ network, params });
    expect(builder.slotAt(BigInt(T))).toBe(builder.slotAt(T));
    expect(builder.slotAt(BigInt(T) + 1n, "up")).toBe(S + 1);
    expect(builder.slotAt(new Date(T))).toBe(S);
    expect(typeof builder.slotAt(2n ** 53n - 1n)).toBe("number");
    for (const time of [2n ** 53n + 1n, 2n ** 53n]) {
      let error: unknown;
      try {
        builder.slotAt(time);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(TxBuildError);
      const built = error as TxBuildError<"INVALID_OPTION">;
      expect(built.code).toBe("INVALID_OPTION");
      expect(built.details.option).toBe("time");
      expect(built.details.value).toBe(time);
      expect(built.cause).toBeInstanceOf(Error);
    }
  });

  it("refuses two validity parts, whatever their forms", async () => {
    await expectBuildError(
      new TxBuilder({ network, params }).build(
        [pay, validity({ from: T }), validity({ until: T + 600000 })],
        { payer: payer() },
      ),
      "DUPLICATE_PART",
    );
  });

  it("takes a converted slot above 1e11", async () => {
    expect(
      (await bodyOf(validity({ until: T + 100_000_000_000_000 }))).until,
    ).toBe("100100000000");
  });

  it("converts time bounds in resolveParts itself", async () => {
    const context = {
      network: networkConfig("preprod"),
      params,
      deposits: {},
      known: new Map<string, UTxO>(),
    };
    const part = validity({ from: T + 1, until: T + 600000, label: "window" });
    const [resolved] = await resolveParts([part], context);
    expect(resolved).toStrictEqual({
      kind: "validity",
      invalidBefore: String(S + 1),
      invalidHereafter: String(S + 600),
      label: "window",
    });
    expect(Object.isFrozen(resolved)).toBe(true);
    await expectPartError(
      resolveParts([validity({ from: T + 1, until: T + 999 })], context),
    );
  });
});

describe("fee", () => {
  it("prices reference scripts in tiers of 25 KiB, each 1.2 times the last", () => {
    expect(refScriptFee(0n, 15)).toBe(0n);
    expect(refScriptFee(1000n, 15)).toBe(15000n);
    expect(refScriptFee(25_600n, 15)).toBe(384_000n);
    // 25600 * 15 + 25600 * 18 + 100 * 21.6
    expect(refScriptFee(51_300n, 15)).toBe(384_000n + 460_800n + 2160n);
    expect(refScriptFee(25_601n, 15)).toBe(384_018n);
  });
});
