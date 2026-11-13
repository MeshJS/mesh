import { bech32 } from "bech32";

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
  resolveNativeScriptHash,
  resolveScriptHash,
  resolveScriptRef,
  ScriptEvaluationError,
  ScriptFailure,
  TransactionOutputPrototype,
  TransactionPrototype,
  UTxO,
} from "@meshsdk/core";
import { CSLSerializer } from "@meshsdk/core-csl";
import {
  Address,
  blake2b,
  keyHashToRewardAddress,
  OfflineEvaluatorScalus,
  resolvePlutusScriptAddress,
  scriptHashToRewardAddress,
  toNativeScript,
  Transaction,
  transactionOutputPrototypeToCardano,
  transactionPrototypeToHex,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  assembleTxPrototype,
  Assets,
  BuildEvent,
  BuildOptions,
  BuiltRedeemer,
  BuiltTx,
  certificate,
  collateral,
  collateralReturn,
  donation,
  guard,
  message,
  metadata,
  minCoin,
  minFee,
  mint,
  output,
  OutputDatum,
  outputOf,
  OutputScript,
  proposal,
  RedeemerContext,
  referenceInput,
  spend,
  toUtxo,
  TxBuilder,
  TxBuilderOptions,
  TxBuildError,
  TxError,
  TxPart,
  TxPartError,
  unresolved,
  Utxo,
  UtxoInput,
  utxosAfter,
  validity,
  withdrawal,
} from "../../src/tx-builder";
import { exUnitsFee, feeForSize, refScriptFee } from "../../src/tx-builder/fee";
import { resolveParts } from "../../src/tx-builder/resolve";
import {
  alwaysFailCbor,
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  keyHashHex,
  mockTokenUnit,
  vrfKeyHashHex,
} from "../test-util";
import { asCbor, asMesh, ref } from "./utxo-util";

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

const lovelace = (n: bigint | number): Assets => ({ lovelace: BigInt(n) });
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
  txHash: (++nextHash).toString(16).padStart(64, "0"),
  outputIndex: 0,
  address,
  value,
  ...extra,
});

const ada = (n: number) => BigInt(n) * 1_000_000n;
/** `txHash#index` of a UTxO given in the Mesh form or returned in the builder's */
const utxoKeyOf = (u: UtxoInput) => {
  const { txHash, outputIndex } = toUtxo(u);
  return `${txHash}#${outputIndex}`;
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
const fakeFetcher = (utxos: Utxo[], rewards: Record<string, string> = {}) => {
  // Answered in the Mesh form, as providers do: the same objects at every call
  const served = utxos.map(asMesh);
  const calls: Record<string, number> = {};
  const count = (name: string) => (calls[name] = (calls[name] ?? 0) + 1);
  const fetcher = {
    fetchUTxOs: async (hash: string) => {
      count("fetchUTxOs");
      return served.filter((u) => u.input.txHash === hash);
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
const coinOf = (u: UtxoInput) => toUtxo(u).value.lovelace;
/** The tokens a UTxO holds, quantity by unit */
const tokensOf = (u: UtxoInput) =>
  Object.fromEntries(
    Object.entries(toUtxo(u).value).flatMap(([unit, quantity]) =>
      unit === "lovelace" ? [] : [[unit, String(quantity)]],
    ),
  );

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
  return feeForSize(unsignedSize + witnessBytes, 0n, built.exUnits, params);
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
          utxos: [utxo({ ...lovelace(ada(10)), [unit]: 5n })],
        },
      },
    );
    const paid = built.prototype.body.outputs[0]!;
    expect(BigInt(paid.amount.coin)).toBeGreaterThan(ada(1));
    expect(BigInt(paid.amount.coin)).toBeLessThan(ada(2));
    // The other 4 tokens come back
    expect(tokensOf(built.change[0]!)).toEqual({ [unit]: "4" });
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
            utxos: [utxo({ ...lovelace(ada(100)), [unit]: 1n })],
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
    expect(coinOf(built.change[0]!)).toBeGreaterThan(ada(4));
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
    const small = utxo({ ...lovelace(ada(2)), [unit]: 3n });
    const large = utxo({ ...lovelace(ada(2)), [unit]: 8n });
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
            utxo({
              ...lovelace(ada(100)),
              ...Object.fromEntries(units.map((unit) => [unit, 1n])),
            }),
          ],
        },
      },
    );
    expect(built.change.length).toBeGreaterThan(1);
    const returned = built.change.flatMap((o) => Object.keys(tokensOf(o)));
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
            utxos: [utxo({ ...lovelace(ada(10)), [unit]: 1n })],
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
    }: { parts: TxPart[]; utxos?: Utxo[] } & BuildOptions,
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
  const raised = (u: Utxo, by: bigint): Utxo => ({
    ...u,
    value: { ...u.value, lovelace: u.value.lovelace + by },
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
      expect(sum(built.change.map(coinOf))).toBe(short.changeMinimum);
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
    const funds = utxo({ ...lovelace(ada(10)), [unit]: 5n });
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
    expect(coinOf(built.change[0]!)).toBe(short.changeMinimum);
    expect(tokensOf(built.change[0]!)).toEqual({ [unit]: "5" });
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
        utxos: [utxo({ ...lovelace(ada(10)), [unit]: 1n })],
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
      { datum: unitInline },
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
    const error = await expectBuildError(
      new TxBuilder({ network, params }).build(
        [certificate.stakeDeregistration({ stake, refund: ada(2) })],
        { payer: { changeAddress: wallet, utxos: [] } },
      ),
      "INSUFFICIENT_FUNDS",
    );
    expect(error.message).toMatch(
      /^1 lovelace are missing: the transaction must spend at least one input, and no UTxO of the payer can be selected; /,
    );
    expect(error.message).toContain("no UTxOs are given for the payer");
  });

  it("says that an input is missing when refunds pay for everything and the filter takes the only UTxO", async () => {
    const stake = keyHashToRewardAddress(keyHashHex(5), 0);
    const only = utxo(lovelace(ada(10)));
    const error = (await expectBuildError(
      new TxBuilder({ network, params }).build(
        [
          certificate.stakeDeregistration({ stake, refund: ada(10) }),
          output({ address: recipient, value: { lovelace: ada(5) } }),
        ],
        {
          payer: { changeAddress: wallet, utxos: [only] },
          canSelect: () => false,
        },
      ),
      "INSUFFICIENT_FUNDS",
    )) as TxBuildError<"INSUFFICIENT_FUNDS">;
    // The details stay those of the one-input rule
    expect(error.details).toMatchObject({
      unit: "lovelace",
      missing: 1n,
      reason: "payment",
      pool: { given: 1, excludedByFilter: 1, selectable: 0 },
    });
    const { required, available } = error.details;
    expect(available).toBe(ada(10));
    expect(required).toBeLessThanOrEqual(available);
    expect(error.message).toBe(
      `1 lovelace are missing: the transaction must spend at least one input, and no UTxO of the payer can be selected; the ${available} available cover the ${required} it takes, the fee of ${error.details.feeEstimate} and change of at least ${error.details.changeMinimum} included`,
    );
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
    const outputs: Utxo[] = [0, 1].map((outputIndex) => ({
      txHash,
      outputIndex,
      address: wallet,
      value: lovelace(ada(3)),
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
        spend.pubKey({ utxo: ref(known) }),
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

  describe("names the part whose out ref cannot be looked up", () => {
    const ghost = { txHash: "ee".repeat(32), outputIndex: 7 };
    const other = { txHash: "ef".repeat(32), outputIndex: 0 };
    const payer = { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] };
    const pay = output({ address: recipient, value: { lovelace: ada(2) } });

    it("for an output that does not exist", async () => {
      const builder = new TxBuilder({
        network,
        params,
        provider: fakeFetcher([]).fetcher,
      });
      const spent = await expectBuildError(
        builder.build([spend.pubKey({ utxo: ghost, label: "mine" }), pay], {
          payer,
        }),
        "UTXO_NOT_FOUND",
      );
      expect(TxError.is(spent, "UTXO_NOT_FOUND")).toBe(true);
      expect(spent).toMatchObject({ part: "spend", label: "mine" });
      expect(spent.details).toEqual({ input: ghost });
      expect(spent.message.startsWith('spend "mine": ')).toBe(true);

      const read = await expectBuildError(
        builder.build([referenceInput({ utxo: ghost, label: "ref" }), pay], {
          payer,
        }),
        "UTXO_NOT_FOUND",
      );
      expect(read).toMatchObject({ part: "referenceInput", label: "ref" });
      expect(read.message.startsWith('referenceInput "ref": ')).toBe(true);

      // Two parts naming one out ref: the first
      const both = await expectBuildError(
        builder.build(
          [
            referenceInput({ utxo: ghost, label: "first" }),
            referenceInput({ utxo: ghost, label: "second" }),
            pay,
          ],
          { payer },
        ),
        "UTXO_NOT_FOUND",
      );
      expect(both).toMatchObject({ part: "referenceInput", label: "first" });
    });

    it("for a lookup the provider rejects", async () => {
      const down = new Error("503");
      const fetcher = {
        ...fakeFetcher([]).fetcher,
        fetchUTxOs: async () => {
          throw down;
        },
      } as IFetcher;
      const error = await expectBuildError(
        new TxBuilder({ network, params, provider: fetcher }).build(
          [spend.pubKey({ utxo: ghost, label: "mine" }), pay],
          { payer },
        ),
        "UTXO_NOT_FOUND",
      );
      expect(error).toMatchObject({ part: "spend", label: "mine" });
      expect(error.details).toEqual({ input: ghost });
      expect(error.cause).toBe(down);
      expect(error.message).toContain("503");
    });

    it("for a lookup without a provider, when one part names them", async () => {
      const builder = new TxBuilder({ network, params });
      const one = await expectBuildError(
        builder.build([spend.pubKey({ utxo: ghost, label: "mine" }), pay], {
          payer,
        }),
        "MISSING_FETCHER",
      );
      expect(one).toMatchObject({ part: "spend", label: "mine" });
      expect(one.message.startsWith('spend "mine": ')).toBe(true);

      const two = await expectBuildError(
        builder.build(
          [
            spend.pubKey({ utxo: ghost, label: "mine" }),
            referenceInput({ utxo: other, label: "ref" }),
            pay,
          ],
          { payer },
        ),
        "MISSING_FETCHER",
      );
      expect(two.part).toBeUndefined();
      expect(two.label).toBeUndefined();

      // Two parts naming one missing out ref: neither alone is meant
      const shared = await expectBuildError(
        builder.build(
          [
            referenceInput({ utxo: ghost, label: "ref" }),
            spend.plutus({
              utxo: utxo(
                lovelace(ada(10)),
                { datum: unitInline },
                scriptAddress,
              ),
              script: { reference: ghost },
              redeemer: { data: mConStr0([]) },
              label: "unlock",
            }),
            pay,
          ],
          { payer },
        ),
        "MISSING_FETCHER",
      );
      expect(shared.part).toBeUndefined();
      expect(shared.label).toBeUndefined();
      expect(shared.message.startsWith("outputs ")).toBe(true);
    });

    it("refuses a second part of what a transaction holds once before any read", async () => {
      const { fetcher, calls } = fakeFetcher([]);
      const builder = new TxBuilder({ network, provider: fetcher });
      const reads: string[] = [];
      const reading = {
        getChangeAddress: async () => {
          reads.push("getChangeAddress");
          return wallet;
        },
        getUtxos: async () => {
          reads.push("getUtxos");
          return [];
        },
      };
      const twice = (parts: TxPart[]) =>
        expectBuildError(
          builder.build([spend.pubKey({ utxo: ghost }), pay, ...parts], {
            payer: reading,
          }),
          "DUPLICATE_PART",
        );

      const validities = await twice([
        validity({ until: Date.now() + 600_000 }),
        validity({ until: Date.now() + 900_000, label: "later" }),
      ]);
      expect(validities).toMatchObject({ part: "validity", label: "later" });
      expect(validities.details).toEqual({ item: "validity" });
      const spends = await twice([
        spend.pubKey({ utxo: ghost, label: "again" }),
      ]);
      expect(spends).toMatchObject({ part: "spend", label: "again" });
      expect(spends.details).toEqual({
        item: `${ghost.txHash}#${ghost.outputIndex}`,
      });
      const read = await twice([
        referenceInput({ utxo: ghost, label: "read" }),
      ]);
      expect(read).toMatchObject({ part: "referenceInput", label: "read" });
      // Neither the payer, the out ref nor the parameters were read
      expect(reads).toEqual([]);
      expect(calls).toEqual({});
    });
  });

  it("works out the datum of a script output once it is fetched", async () => {
    const locked: Utxo = {
      txHash: "ab".repeat(32),
      outputIndex: 0,
      address: scriptAddress,
      value: lovelace(ada(10)),
      datum: unitInline,
    };
    const built = await new TxBuilder({
      network,
      params,
      provider: fakeFetcher([locked]).fetcher,
      evaluator: fakeEvaluator().evaluator,
    }).build(
      [
        spend.plutus({
          utxo: ref(locked),
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
  const locked = (n: number): Utxo => ({
    txHash: (0xf0 + n).toString(16).repeat(32),
    outputIndex: 0,
    address: scriptAddress,
    value: lovelace(ada(10)),
    datum: unitInline,
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
      ["SPEND", 0, "spend 1", { mem: 5000n, steps: 7000n }],
      ["SPEND", 1, "spend 2", { mem: 5000n, steps: 7000n }],
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
    expect(built.redeemers[0]!.exUnits).toEqual({ mem: 6000n, steps: 8000n });

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
    expect(built.redeemers[0]!.exUnits).toEqual({ mem: 6000n, steps: 8000n });
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

  it.each([
    ["nothing", undefined, "not a list"],
    ["an entry without a budget", [{ tag: "SPEND", index: 0 }], "budget"],
    [
      "a budget that is not a number",
      [{ tag: "SPEND", index: 0, budget: { mem: "x", steps: 1 } }],
      "invalid budget",
    ],
    [
      "an index that is not a number",
      [{ tag: "SPEND", index: "0", budget: { mem: 1, steps: 1 } }],
      "invalid index",
    ],
    ["an entry that is null", [null], "not an object"],
    [
      "a negative index",
      [{ tag: "SPEND", index: -1, budget: { mem: 1, steps: 1 } }],
      "invalid index",
    ],
    [
      "a negative budget",
      [{ tag: "SPEND", index: 0, budget: { mem: -1, steps: 1 } }],
      "invalid budget",
    ],
    [
      "a budget that is not whole",
      [{ tag: "SPEND", index: 0, budget: { mem: 1.5, steps: 1 } }],
      "invalid budget",
    ],
    [
      "a budget with an exponent",
      [{ tag: "SPEND", index: 0, budget: { mem: 1, steps: "1e3" } }],
      "invalid budget",
    ],
  ])(
    "refuses an evaluator answer of %s as EVALUATION_FAILED",
    async (_, answer, reason) => {
      const calls: string[] = [];
      const evaluator = {
        evaluateTx: async (tx: string) => {
          calls.push(tx);
          return answer;
        },
      } as unknown as IEvaluator;
      const error = await new TxBuilder({
        network,
        costModels,
        params,
        evaluator,
      })
        .build([scriptSpend(1)], {
          payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
        })
        .then(
          () => {
            throw new Error("expected EVALUATION_FAILED");
          },
          (error: unknown) => error,
        );
      expect(TxError.is(error, "EVALUATION_FAILED")).toBe(true);
      const failed = error as TxBuildError<"EVALUATION_FAILED">;
      expect(failed.details).toEqual({ tx: calls[0], failures: [] });
      expect(failed.details.tx).toMatch(/^[0-9a-f]+$/);
      expect(failed.part).toBeUndefined();
      expect(failed.label).toBeUndefined();
      expect(failed.message).toContain(reason);
      expect(failed.cause).toBeInstanceOf(TypeError);
    },
  );

  it("takes budgets given as digits or bigints", async () => {
    for (const budget of [
      { mem: "1000", steps: "2000" },
      { mem: 1000n, steps: 2000n },
    ]) {
      const evaluator = {
        evaluateTx: async () => [{ tag: "SPEND", index: 0, budget }],
      } as unknown as IEvaluator;
      const built = await new TxBuilder({
        network,
        costModels,
        params,
        evaluator,
      }).build([scriptSpend(1)], {
        payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
      });
      expect(built.exUnits).toEqual({ mem: 1000n, steps: 2000n });
    }
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

  it("rejects a second collateral return, whether collateral is put up or not", async () => {
    const builder = new TxBuilder({
      network,
      costModels,
      params,
      evaluator: fakeEvaluator().evaluator,
    });
    const payer = { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] };
    const pay = output({ address: recipient, value: { lovelace: ada(2) } });
    const returns = [
      collateralReturn({ address: baseAddress(8) }),
      collateralReturn({ address: baseAddress(9), label: "second" }),
    ];
    const expectSecondRefused = (error: TxBuildError) => {
      expect(error.message).toBe(
        'collateralReturn "second": a transaction holds a single collateral return',
      );
      expect(error).toMatchObject({
        part: "collateralReturn",
        label: "second",
        details: { item: "collateralReturn" },
      });
    };

    // Collateral is put up: the first return must not win silently
    expectSecondRefused(
      await expectBuildError(
        builder.build(
          [
            scriptSpend(1),
            collateral({ utxo: utxo(lovelace(ada(20))) }),
            returns[0]!,
            pay,
            returns[1]!,
          ],
          { payer },
        ),
        "DUPLICATE_PART",
      ),
    );
    // No collateral part and no script: both returns would be left out
    expectSecondRefused(
      await expectBuildError(
        builder.build([returns[0]!, pay, returns[1]!], { payer }),
        "DUPLICATE_PART",
      ),
    );
    // Sending everything to one address balances too
    expectSecondRefused(
      await expectBuildError(
        builder.build(returns, { payer, sendAllTo: recipient }),
        "DUPLICATE_PART",
      ),
    );
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
    expect(built.collateral).toEqual({
      inputs: [tight],
      total: ada(1),
    });
    expect(built.prototype.body.total_collateral).toBe(String(ada(1)));
    expect(built.prototype.body.collateral_return).toBeUndefined();
  });

  it("lowers the fee to the minimum once a later round forfeits the collateral return", async () => {
    const tight = utxo(lovelace(ada(1)));
    const fees: bigint[] = [];
    const built = await new TxBuilder({
      network,
      costModels,
      params,
      evaluator: fakeEvaluator().evaluator,
    }).build([scriptSpend(1), collateral({ utxo: tight })], {
      payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
      trace: (event) => {
        if (event.type === "round") fees.push(event.fee);
      },
    });
    expect(built.prototype.body.collateral_return).toBeUndefined();
    // The round at the fee of nothing still returned collateral and priced the larger body;
    // the last round priced the transaction at the fee it carries
    expect(fees.some((fee) => fee > built.fee)).toBe(true);
    expect(fees.at(-1)).toBe(built.fee);
    expect(built.fee).toBe(
      minFee(built.prototype, {
        params,
        vkeyWitnesses: built.signers.keyHashes.length,
        inputs: [...built.inputs, ...built.referenceInputs],
      }),
    );
    expectBalanced(built);
  });

  it("keeps the settled fee when the transaction priced at its minimum needs more", async () => {
    const pay = output({ address: recipient, value: { lovelace: ada(2) } });
    const builder = new TxBuilder({ network, params });
    const buildWith = async (coin: bigint) => {
      const fees: bigint[] = [];
      const built = await builder.build([pay], {
        payer: { changeAddress: wallet, utxos: [utxo(lovelace(coin))] },
        trace: (event) => {
          if (event.type === "round") fees.push(event.fee);
        },
      });
      return { built, fees };
    };
    const minFeeOf = (built: BuiltTx) =>
      minFee(built.prototype, {
        params,
        vkeyWitnesses: built.signers.keyHashes.length,
        inputs: [...built.inputs, ...built.referenceInputs],
      });
    // A change of 2^32 lovelace or more takes 4 bytes more to write than one below it
    const wide = 2n ** 32n;
    const { built: probe } = await buildWith(ada(2) + 2n * wide);
    const high = probe.fee;
    // Lower fees price a wide change; at the fee of the probe the change is just below 2^32, so
    // the transaction shrinks. Priced at its own minimum the change grows past 2^32 again, and
    // that minimum no longer covers it: the settled fee stays
    const { built, fees } = await buildWith(ada(2) + wide + high - 1n);
    expect(built.fee).toBe(high);
    expect(built.prototype.body.outputs.at(-1)!.amount.coin).toBe(
      String(wide - 1n),
    );
    const low = minFeeOf(built);
    expect(low).toBeLessThan(high);
    expectBalanced(built);
    // Each priced round is traced, the one at the lower fee too, though it is not kept
    expect(fees.slice(-2)).toEqual([high, low]);
    // At the lower fee the wider change leaves the transaction below its minimum
    await expectBuildError(
      builder.build([pay], {
        payer: {
          changeAddress: wallet,
          utxos: [utxo(lovelace(ada(2) + wide + high - 1n))],
        },
        fee: low,
      }),
      "FEE_TOO_LOW",
    );
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

  it("names the collateral part at fault", async () => {
    const build = (parts: TxPart[]) =>
      expectBuildError(
        new TxBuilder({
          network,
          costModels,
          params,
          evaluator: fakeEvaluator().evaluator,
        }).build([scriptSpend(1), ...parts], {
          payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
        }),
        "INSUFFICIENT_COLLATERAL",
      );

    // A stated total below what the fee calls for: the return states it
    const below = await build([
      collateral({ utxo: utxo(lovelace(ada(5))) }),
      collateralReturn({ address: wallet, totalCollateral: 1n, label: "ret" }),
    ]);
    expect(below).toMatchObject({ part: "collateralReturn", label: "ret" });
    expect(below.message.startsWith('collateralReturn "ret": ')).toBe(true);

    // Inputs that cannot cover the total, stated or not: the one collateral part
    const above = await build([
      collateral({ utxo: utxo(lovelace(ada(5))), label: "coll" }),
      collateralReturn({
        address: wallet,
        totalCollateral: ada(50),
        label: "ret",
      }),
    ]);
    expect(above).toMatchObject({ part: "collateral", label: "coll" });
    const short = await build([
      collateral({ utxo: utxo(lovelace(100_000n)), label: "coll" }),
    ]);
    expect(short).toMatchObject({ part: "collateral", label: "coll" });
    expect(short.message.startsWith('collateral "coll": ')).toBe(true);
    const shortStated = await build([
      collateral({ utxo: utxo(lovelace(100_000n)), label: "coll" }),
      collateralReturn({ address: wallet, totalCollateral: ada(1) }),
    ]);
    expect(shortStated).toMatchObject({ part: "collateral", label: "coll" });

    // Two collateral parts: neither alone is at fault
    const two = await build([
      collateral({ utxo: utxo(lovelace(50_000n)), label: "a" }),
      collateral({ utxo: utxo(lovelace(50_000n)), label: "b" }),
    ]);
    expect(two.part).toBeUndefined();
    expect(two.label).toBeUndefined();

    // Collateral chosen by the builder falls short of a stated total: neither the return,
    // which states the total, nor any other part is at fault
    const pooled = await build([
      collateralReturn({
        address: wallet,
        totalCollateral: ada(50),
        label: "ret",
      }),
    ]);
    expect(pooled.part).toBeUndefined();
    expect(pooled.label).toBeUndefined();
    expect(pooled).toMatchObject({ details: { required: ada(50) } });

    // Collateral chosen by the builder: no part
    const chosen = await expectBuildError(
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
    expect(chosen.part).toBeUndefined();
  });
});

describe("TxBuilder: UTxOs left out of selection", () => {
  const locked = (lovelaceHeld = ada(10)): Utxo =>
    utxo(lovelace(lovelaceHeld), { datum: unitInline }, scriptAddress);
  const scriptSpend = (
    from = locked(),
    script: Parameters<typeof spend.plutus>[0]["script"] = plutusScript,
  ) => spend.plutus({ utxo: from, script, redeemer: { data: mConStr0([]) } });
  const pay = (n: number) =>
    output({ address: recipient, value: { lovelace: ada(n) } });
  const inputsOf = (built: BuiltTx) =>
    built.prototype.body.inputs.map((i) => `${i.transaction_id}#${i.index}`);
  const keyOf = utxoKeyOf;
  const referencesOf = (built: BuiltTx) =>
    (built.prototype.body.reference_inputs ?? []).map(
      (i) => `${i.transaction_id}#${i.index}`,
    );
  const build = (parts: TxPart[], utxos: Utxo[]) =>
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
    const holder = utxo(lovelace(ada(50)), { script: plutusRef });
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
      script: nativeRefOf(nativeScript),
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
    const withToken = utxo({ ...lovelace(ada(10)), [unit]: 1n });
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
  const locked = (lovelaceHeld = ada(10)): Utxo =>
    utxo(lovelace(lovelaceHeld), { datum: unitInline }, scriptAddress);
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
    expect(built.change.map(coinOf)).toEqual([1_700_000n]);
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
  utxos: Utxo[],
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
  const locked: Utxo = {
    txHash: scriptHash,
    outputIndex: 0,
    address: scriptAddress,
    value: lovelace(ada(10)),
    datum: unitInline,
  };
  const holdingScript: Utxo = {
    txHash: refHash,
    outputIndex: 0,
    address: wallet,
    value: lovelace(ada(20)),
    script: plutusRef,
  };
  const keyOutput: Utxo = {
    txHash: otherHash,
    outputIndex: 0,
    address: wallet,
    value: lovelace(ada(3)),
  };
  const scriptSpend = () =>
    spend.plutus({
      utxo: ref(locked),
      script: { reference: ref(holdingScript) },
      redeemer: { data: mConStr0([]) },
      label: "unlock",
    });
  const keySpend = () => spend.pubKey({ utxo: ref(keyOutput) });
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
    const original = structuredClone([keyOutput, holdingScript].map(asMesh));
    const provider = mockedFetcher([keyOutput, holdingScript]);
    const built = await new TxBuilder({
      network,
      params,
      provider: provider.fetcher,
    }).build(
      ...request([keySpend(), referenceInput({ utxo: ref(holdingScript) })]),
    );

    const cache = CachedFetcher.wrap(provider.fetcher);
    const cached = [
      ...(await cache.fetchUTxOs(otherHash)),
      ...(await cache.fetchUTxOs(refHash)),
    ];
    expect(cached).toEqual(original);
    for (const utxo of cached) expect(isFrozenAnywhere(utxo)).toBe(false);
    expect(built.inputs).toContainEqual(keyOutput);
  });

  it("shares nothing with the UTxOs it is given in its own form", async () => {
    const unit = `${"ab".repeat(28)}01`;
    const spent = utxo(
      { ...lovelace(ada(5)), [unit]: 3n },
      { datum: unitInline },
    );
    const paying = utxo(lovelace(ada(10)));
    const given = structuredClone([spent, paying]);
    const built = await new TxBuilder({ network, params }).build(
      [
        spend.pubKey({ utxo: spent }),
        output({ address: recipient, value: { lovelace: ada(8) } }),
      ],
      { payer: { changeAddress: wallet, utxos: [paying] } },
    );
    expect(built.inputs).toHaveLength(2);
    expect(built.inputs).toContainEqual(spent);
    expect(built.inputs).toContainEqual(paying);
    for (const input of built.inputs)
      for (const source of [spent, paying]) {
        expect(input).not.toBe(source);
        expect(input.value).not.toBe(source.value);
        if (input.datum) expect(input.datum).not.toBe(source.datum);
      }
    // What it returns is frozen, and what it was given is left as it was
    for (const source of [spent, paying])
      expect(isFrozenAnywhere(source)).toBe(false);
    expect([spent, paying]).toEqual(given);
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
  const locked: Utxo = {
    txHash: scriptHash,
    outputIndex: 0,
    address: scriptAddress,
    value: lovelace(ada(10)),
    datum: unitInline,
  };
  const holdingScript: Utxo = {
    txHash: refHash,
    outputIndex: 0,
    address: wallet,
    value: lovelace(ada(20)),
    script: plutusRef,
  };
  const scriptSpend = (exUnits?: { mem: number; steps: number }) =>
    spend.plutus({
      utxo: ref(locked),
      script: { reference: ref(holdingScript) },
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
          `${funds.txHash}#0`,
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
    expect(built.redeemers[0]!.exUnits).toEqual({ mem: 6000n, steps: 8000n });
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

  describe("a serializer that fails or answers with no transaction", () => {
    const parts = [output({ address: recipient, value: { lovelace: ada(2) } })];
    const options = {
      payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(10)))] },
    };
    const withSerializer = (serializeTxPrototype: () => unknown) =>
      new TxBuilder({
        network,
        params,
        serializer: { serializeTxPrototype } as never,
      });
    const boom = new Error("boom");
    const throwing = () => {
      throw boom;
    };
    const unsupported = (error: unknown) => {
      expect(TxError.is(error, "UNSUPPORTED_SERIALIZER")).toBe(true);
      return error as TxBuildError<"UNSUPPORTED_SERIALIZER">;
    };
    const rejection = (promise: Promise<unknown>) =>
      promise.then(
        () => {
          throw new Error("expected UNSUPPORTED_SERIALIZER");
        },
        (error: unknown) => error,
      );

    it("is UNSUPPORTED_SERIALIZER from build, with the serializer's error as cause", async () => {
      const error = unsupported(
        await rejection(withSerializer(throwing).build(parts, options)),
      );
      expect(error.cause).toBe(boom);
      expect((error.cause as Error).message).toBe("boom");
      expect(error.message).toContain("boom");
    });

    it.each([
      ["text that is not hex", "zz"],
      ["a value that is not text", 5],
      ["hex that is not a transaction", "00"],
    ])("is UNSUPPORTED_SERIALIZER from build for %s", async (_, answer) => {
      const error = unsupported(
        await rejection(withSerializer(() => answer).build(parts, options)),
      );
      expect(error.details).toBeUndefined();
    });

    describe("hex that is not a transaction, where the build decodes it first", () => {
      const notATransaction = { serializeTxPrototype: () => "00" } as never;
      const unlock = (exUnits?: { mem: number; steps: number }) =>
        spend.plutus({
          utxo: utxo(lovelace(ada(10)), { datum: unitInline }, scriptAddress),
          script: plutusScript,
          redeemer: { data: mConStr0([]), ...(exUnits && { exUnits }) },
        });
      const decodeError = (error: TxBuildError<"UNSUPPORTED_SERIALIZER">) => {
        expect(error.message).toContain("not a transaction");
        expect(error.cause).toBeInstanceOf(Error);
        expect(TxError.is(error.cause)).toBe(false);
      };

      it("for a transaction with metadata", async () => {
        decodeError(
          unsupported(
            await rejection(
              new TxBuilder({
                network,
                params,
                serializer: notATransaction,
              }).build(
                [...parts, metadata({ metadataLabel: 674n, value: "hi" })],
                options,
              ),
            ),
          ),
        );
      });

      it("for a Plutus transaction with its units stated", async () => {
        decodeError(
          unsupported(
            await rejection(
              new TxBuilder({
                network,
                costModels,
                params,
                evaluator: null,
                serializer: notATransaction,
              }).build([unlock({ mem: 1000, steps: 2000 })], options),
            ),
          ),
        );
      });

      it("for a Plutus transaction, before the evaluator gets it", async () => {
        const { evaluator, calls } = fakeEvaluator();
        decodeError(
          unsupported(
            await rejection(
              new TxBuilder({
                network,
                costModels,
                params,
                evaluator,
                serializer: notATransaction,
              }).build([unlock()], options),
            ),
          ),
        );
        expect(calls).toHaveLength(0);
      });
    });

    it("is UNSUPPORTED_SERIALIZER from finalize, never INVALID_OPTION tx", async () => {
      const built = await new TxBuilder({ network, params }).build(
        parts,
        options,
      );
      const thrown = unsupported(
        await rejection(
          withSerializer(throwing).finalize(built.prototype, {
            inputs: built.inputs,
          }),
        ),
      );
      expect(thrown.cause).toBe(boom);
      const notATransaction = unsupported(
        await rejection(
          withSerializer(() => "a0").finalize(built.prototype, {
            inputs: built.inputs,
          }),
        ),
      );
      expect(notATransaction.cause).toBeInstanceOf(Error);
      expect(TxError.is(notATransaction.cause)).toBe(false);
    });

    it("leaves the built-in encoder and a working serializer as they were", async () => {
      const cst = await new TxBuilder({ network, params }).build(
        parts,
        options,
      );
      const csl = await new TxBuilder({
        network,
        params,
        serializer: new CSLSerializer(),
      }).build(parts, options);
      expect(csl.txHash).toBe(cst.txHash);
      const final = await new TxBuilder({
        network,
        params,
        serializer: new CSLSerializer(),
      }).finalize(cst.prototype, { inputs: cst.inputs });
      expect(final.txHash).toBe(cst.txHash);
    });
  });
});

describe("TxBuilder: a fee that does not settle", () => {
  // A serializer that writes one byte more for every fee it has not seen before: each fee
  // makes the transaction larger, so the next round always asks for more
  const growing = () => {
    const seen = new Map<string, number>();
    return {
      serializeTxPrototype: (prototype: TransactionPrototype) => {
        const { fee } = prototype.body;
        if (!seen.has(fee)) seen.set(fee, seen.size);
        return (
          transactionPrototypeToHex(prototype) + "00".repeat(seen.get(fee)!)
        );
      },
    };
  };
  const parts = [output({ address: recipient, value: { lovelace: ada(2) } })];
  const options = {
    payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(100)))] },
  };

  it("is FEE_NOT_CONVERGED from build, without details", async () => {
    const error = await expectBuildError(
      new TxBuilder({
        network,
        params,
        serializer: growing() as never,
      }).build(parts, options),
      "FEE_NOT_CONVERGED",
    );
    expect(TxError.is(error, "FEE_NOT_CONVERGED")).toBe(true);
    expect(error.details).toBeUndefined();
  });

  it("is FEE_NOT_CONVERGED from finalize, without details", async () => {
    const built = await new TxBuilder({ network, params }).build(
      parts,
      options,
    );
    const edited = structuredClone(built.prototype);
    // Below the minimum, so that finalize raises it
    edited.body.fee = "0";
    const change = built.change[0]!;
    const error = await expectBuildError(
      new TxBuilder({
        network,
        params,
        serializer: growing() as never,
      }).finalize(edited, {
        inputs: built.inputs,
        changeAddress: change.address,
      }),
      "FEE_NOT_CONVERGED",
    );
    expect(error.details).toBeUndefined();
  });
});

describe("TxBuilder: malformed values given or read", () => {
  const pay = output({ address: recipient, value: { lovelace: ada(2) } });
  /** A UTxO in the Mesh form, as a provider or a wallet gives it */
  const funds = () => asMesh(utxo(lovelace(ada(10))));
  /** A UTxO whose amount holds `entry` after its lovelace */
  const withAsset = (entry: unknown): UTxO => {
    const good = funds();
    return {
      ...good,
      output: {
        ...good.output,
        amount: [...good.output.amount, entry] as UTxO["output"]["amount"],
      },
    };
  };
  const badAmounts: [string, unknown][] = [
    ["a quantity that is not a number", { unit: "lovelace", quantity: "abc" }],
    ["a quantity in hex", { unit: "lovelace", quantity: "0x10" }],
    ["a negative quantity", { unit: "lovelace", quantity: "-5" }],
    ["a quantity with an exponent", { unit: "lovelace", quantity: "1e3" }],
    ["a quantity that is a number", { unit: "lovelace", quantity: 5 }],
    ["a unit that is not hex", { unit: "zz", quantity: "1" }],
    ["a null entry", null],
  ];
  const rejection = (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error("expected an error");
      },
      (error: unknown) => error as TxError,
    );

  describe("UTxO amounts", () => {
    it.each(badAmounts)(
      "refuses a snapshot UTxO with %s as INVALID_OPTION payer",
      async (_, entry) => {
        const error = await rejection(
          new TxBuilder({ network, params }).build([pay], {
            payer: { changeAddress: wallet, utxos: [withAsset(entry)] },
          }),
        );
        expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
        const invalid = error as TxBuildError<"INVALID_OPTION">;
        expect(invalid.details.option).toBe("payer");
        expect(invalid.cause).toBeInstanceOf(Error);
      },
    );

    it.each(badAmounts)(
      "refuses a wallet UTxO with %s as WALLET_FAILED",
      async (_, entry) => {
        const error = await rejection(
          new TxBuilder({ network, params }).build([pay], {
            payer: {
              getChangeAddress: async () => wallet,
              getUtxos: async () => [withAsset(entry)],
            },
          }),
        );
        expect(TxError.is(error, "WALLET_FAILED")).toBe(true);
        expect((error as TxBuildError<"WALLET_FAILED">).details).toEqual({});
        expect(error.cause).toBeInstanceOf(Error);
      },
    );

    it("refuses a provider's UTxO of the payer as PROVIDER_FAILED", async () => {
      const fetcher = {
        ...fakeFetcher([]).fetcher,
        fetchAddressUTxOs: async () => [
          withAsset({ unit: "lovelace", quantity: "abc" }),
        ],
      } as IFetcher;
      const error = await rejection(
        new TxBuilder({ network, params, provider: fetcher }).build([pay], {
          payer: wallet,
        }),
      );
      expect(TxError.is(error, "PROVIDER_FAILED")).toBe(true);
      expect((error as TxBuildError<"PROVIDER_FAILED">).details).toEqual({
        operation: "fetchAddressUTxOs",
      });
    });

    it("takes amounts in the forms a provider gives", async () => {
      const token = mockTokenUnit(1);
      const held: UTxO = {
        ...funds(),
        output: {
          address: wallet,
          amount: [
            { unit: "lovelace", quantity: String(ada(10)) },
            { unit: token, quantity: "5" },
            { unit: token.toUpperCase().slice(0, 56), quantity: "0" },
          ],
        },
      };
      const built = await new TxBuilder({ network, params }).build([pay], {
        payer: { changeAddress: wallet, utxos: [held] },
      });
      expect(built.inputs).toHaveLength(1);
    });

    it("takes the empty unit as lovelace, as the rest of the repository does", async () => {
      const blank = (u: UTxO): UTxO => ({
        ...u,
        output: {
          ...u.output,
          amount: u.output.amount.map((a) =>
            a.unit === "lovelace" ? { ...a, unit: "" } : a,
          ),
        },
      });
      const builder = new TxBuilder({ network, params });
      const held = funds();
      const plain = await builder.build([pay], {
        payer: { changeAddress: wallet, utxos: [held] },
      });
      const fromSnapshot = await builder.build([pay], {
        payer: { changeAddress: wallet, utxos: [blank(held)] },
      });
      expect(fromSnapshot.txHash).toBe(plain.txHash);

      const fromPart = await builder.build(
        [spend.pubKey({ utxo: blank(held) }), pay],
        { payer: { changeAddress: wallet, utxos: [] } },
      );
      const plainPart = await builder.build(
        [spend.pubKey({ utxo: held }), pay],
        { payer: { changeAddress: wallet, utxos: [] } },
      );
      expect(fromPart.txHash).toBe(plainPart.txHash);
    });
  });

  describe("provider answers", () => {
    const ghost = { txHash: "ee".repeat(32), outputIndex: 0 };
    const answering = (members: Partial<Record<keyof IFetcher, unknown>>) =>
      ({ ...fakeFetcher([]).fetcher, ...members }) as IFetcher;

    it.each([
      ["an object", {}],
      ["a list holding null", [null]],
      [
        "a UTxO with a bad quantity",
        [{ ...withAsset({ unit: "lovelace", quantity: "x" }), input: ghost }],
      ],
    ])(
      "refuses fetchUTxOs answering %s as UTXO_NOT_FOUND",
      async (_, answer) => {
        const error = await rejection(
          new TxBuilder({
            network,
            params,
            provider: answering({ fetchUTxOs: async () => answer }),
          }).build([spend.pubKey({ utxo: ghost, label: "mine" }), pay], {
            payer: { changeAddress: wallet, utxos: [funds()] },
          }),
        );
        expect(TxError.is(error, "UTXO_NOT_FOUND")).toBe(true);
        expect((error as TxBuildError<"UTXO_NOT_FOUND">).details).toEqual({
          input: ghost,
        });
        expect(error).toMatchObject({ part: "spend", label: "mine" });
        expect(error.cause).toBeInstanceOf(Error);
      },
    );

    it("copies what fetchUTxOs answers, as a payer's UTxO", async () => {
      const held: UTxO = {
        input: { txHash: "EE".repeat(32), outputIndex: 0 },
        output: {
          address: Address.fromBech32(wallet).toBytes(),
          amount: [{ unit: "lovelace", quantity: String(ada(5)) }],
        },
      };
      const built = await new TxBuilder({
        network,
        params,
        provider: answering({ fetchUTxOs: async () => [held] }),
      }).build([spend.pubKey({ utxo: ghost }), pay], {
        payer: { changeAddress: wallet, utxos: [funds()] },
      });
      expect(built.inputs).toContainEqual({
        ...ghost,
        address: wallet,
        value: { lovelace: ada(5) },
      });
    });

    it.each([
      ["nothing", undefined],
      ["rewards that are not a number", { rewards: "abc" }],
      ["negative rewards", { rewards: "-1" }],
    ])(
      "refuses fetchAccountInfo answering %s as PROVIDER_FAILED",
      async (_, answer) => {
        const stake = keyHashToRewardAddress(keyHashHex(5), 0);
        const error = await rejection(
          new TxBuilder({
            network,
            params,
            provider: answering({ fetchAccountInfo: async () => answer }),
          }).build(
            [withdrawal.pubKey({ rewardAddress: stake, amount: "all" }), pay],
            { payer: { changeAddress: wallet, utxos: [funds()] } },
          ),
        );
        expect(TxError.is(error, "PROVIDER_FAILED")).toBe(true);
        expect((error as TxBuildError<"PROVIDER_FAILED">).details).toEqual({
          operation: "fetchAccountInfo",
        });
        expect(error.cause).toBeInstanceOf(Error);
      },
    );

    it.each([
      ["a field that is not a number", { ...params, minFeeA: "x" }],
      ["a field missing", { ...params, minFeeB: undefined }],
      ["a price that is not a number", { ...params, priceMem: "abc" }],
    ])(
      "refuses protocol parameters with %s as MISSING_PARAMETER, from build and chain",
      async (_, answer) => {
        const builder = new TxBuilder({
          network,
          provider: answering({ fetchProtocolParameters: async () => answer }),
        });
        for (const call of [
          () =>
            builder.build([pay], {
              payer: { changeAddress: wallet, utxos: [funds()] },
            }),
          () => builder.chain(),
        ]) {
          const error = await rejection(call());
          expect(TxError.is(error, "MISSING_PARAMETER")).toBe(true);
          expect((error as TxBuildError<"MISSING_PARAMETER">).details).toEqual({
            parameter: "params",
          });
          expect(error.cause).toBeInstanceOf(Error);
        }
      },
    );
  });

  describe("the params option", () => {
    it.each([
      ["a price that is not a number", { ...params, priceMem: "abc" }],
      ["minFeeA missing", { ...params, minFeeA: undefined }],
      ["a fraction where a whole number stands", { ...params, maxTxSize: 1.5 }],
      ["a negative number", { ...params, coinsPerUtxoSize: -1 }],
      ["a value that is not an object", 5],
    ])("refuses %s as INVALID_OPTION at construction", (_, given) => {
      let error: unknown;
      try {
        new TxBuilder({ network, params: given as unknown as Protocol });
      } catch (thrown) {
        error = thrown;
      }
      expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
      const invalid = error as TxBuildError<"INVALID_OPTION">;
      expect(invalid.details).toEqual({
        option: "params",
        value: given,
        allowed: "a whole Protocol",
      });
      expect(invalid.cause).toBeInstanceOf(Error);
    });

    it("takes whole numbers as digits, and leaves the deposits optional", async () => {
      const given = {
        ...params,
        minFeeA: "44",
        maxTxExMem: "14000000",
        priceStep: "0.0000721",
        keyDeposit: undefined,
        poolDeposit: undefined,
      } as unknown as Protocol;
      const built = await new TxBuilder({ network, params: given }).build(
        [pay],
        { payer: { changeAddress: wallet, utxos: [funds()] } },
      );
      const plain = await new TxBuilder({ network, params }).build([pay], {
        payer: { changeAddress: wallet, utxos: [funds()] },
      });
      expect(built.fee).toBe(plain.fee);
    });
  });

  describe("arguments of the pure functions", () => {
    const invalid = (call: () => unknown, option: string) => {
      let error: unknown;
      try {
        call();
      } catch (thrown) {
        error = thrown;
      }
      expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
      expect((error as TxBuildError<"INVALID_OPTION">).details.option).toBe(
        option,
      );
    };

    it("refuses arguments of minFee and minCoin of another shape", async () => {
      const built = await new TxBuilder({ network, params }).build([pay], {
        payer: { changeAddress: wallet, utxos: [funds()] },
      });
      const context = { params, vkeyWitnesses: 1 };
      invalid(() => minFee(null as never, context), "prototype");
      invalid(() => minFee({} as never, context), "prototype");
      invalid(() => minFee(built.prototype, null as never), "context");
      invalid(
        () => minFee(built.prototype, { ...context, params: {} as never }),
        "params",
      );
      invalid(
        () => minFee(built.prototype, { ...context, vkeyWitnesses: -1 }),
        "vkeyWitnesses",
      );
      invalid(
        () => minFee(built.prototype, { ...context, inputs: 5 as never }),
        "inputs",
      );
      invalid(() => minCoin(null as never, params), "output");
      invalid(
        () => minCoin(spend.pubKey({ utxo: funds() }) as never, params),
        "output",
      );
      invalid(() => minCoin(pay, {} as never), "params");
      invalid(() => minCoin(pay, { coinsPerUtxoSize: "x" } as never), "params");
      expect(minFee(built.prototype, context)).toBeGreaterThan(0n);
      expect(minCoin(pay, params)).toBeGreaterThan(0n);
    });

    it("refuses arguments of outputOf and utxosAfter of another shape", async () => {
      const built = await new TxBuilder({ network, params }).build(
        [
          output({
            address: recipient,
            value: { lovelace: ada(2) },
            label: "pay",
          }),
        ],
        { payer: { changeAddress: wallet, utxos: [funds()] } },
      );
      invalid(() => outputOf(null as never, "pay"), "built");
      invalid(() => outputOf({} as never, "pay"), "built");
      invalid(() => outputOf(built, 5 as never), "label");
      invalid(() => utxosAfter(null as never, built), "utxos");
      invalid(() => utxosAfter([null] as never, built), "utxos");
      invalid(() => utxosAfter([], 5 as never), "built");
      invalid(() => utxosAfter([], [built, null] as never), "built");
      invalid(() => utxosAfter([], built, 5 as never), "owns");
      expect(outputOf(built, "pay").label).toBe("pay");
      expect(utxosAfter([], built)).toHaveLength(1);
    });

    it("refuses an entry of minFee's inputs and of utxosAfter's utxos that is not a UTxO", async () => {
      const built = await new TxBuilder({ network, params }).build([pay], {
        payer: { changeAddress: wallet, utxos: [funds()] },
      });
      const held = funds();
      const notUtxos: [string, unknown][] = [
        [
          "a Mesh UTxO at a reward address",
          {
            ...held,
            output: {
              ...held.output,
              address: keyHashToRewardAddress(keyHashHex(1), 0),
            },
          },
        ],
        [
          "a Mesh UTxO with a scriptHash and no scriptRef",
          { ...held, output: { ...held.output, scriptHash: "ab".repeat(28) } },
        ],
        [
          "a Mesh UTxO whose dataHash is not that of its plutusData",
          {
            ...held,
            output: {
              ...held.output,
              plutusData: "d87980",
              dataHash: "00".repeat(32),
            },
          },
        ],
        [
          "an amount with no digits",
          {
            ...held,
            output: {
              ...held.output,
              amount: [{ unit: "lovelace", quantity: "ten" }],
            },
          },
        ],
        [
          "a Utxo without lovelace",
          { ...toUtxo(held), value: { [`${"ab".repeat(28)}01`]: 1n } },
        ],
        ["text that is not CBOR", "zz"],
      ];
      const context = { params, vkeyWitnesses: 1 };
      const refused = (call: () => unknown, option: string, entry: unknown) => {
        let error: unknown;
        try {
          call();
        } catch (thrown) {
          error = thrown;
        }
        expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
        const failed = error as TxBuildError<"INVALID_OPTION">;
        expect(failed.details).toEqual({
          option,
          value: entry,
          allowed: "a UTxO",
        });
        expect(failed.details.value).toBe(entry);
        expect(failed.cause).toBeInstanceOf(Error);
        expect(TxError.is(failed.cause)).toBe(false);
        expect(failed.message).toContain(
          `invalid ${option}: entry 1 is not a UTxO: `,
        );
      };
      for (const [, entry] of notUtxos) {
        refused(
          () =>
            minFee(built.prototype, {
              ...context,
              inputs: [held, entry] as never,
            }),
          "inputs",
          entry,
        );
        refused(
          () => utxosAfter([held, entry] as never, built),
          "utxos",
          entry,
        );
      }
      // The same UTxOs without the entry are taken
      expect(
        minFee(built.prototype, { ...context, inputs: [held] }),
      ).toBeGreaterThan(0n);
      expect(utxosAfter([held], built)).toHaveLength(2);
    });
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
      known: new Map<string, Utxo>(),
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

describe("TxBuilder: redeemer functions", () => {
  const locked = (n: number): Utxo => ({
    txHash: (0xf0 + n).toString(16).repeat(32),
    outputIndex: 0,
    address: scriptAddress,
    value: lovelace(ada(10)),
    datum: unitInline,
  });
  const unlock = (
    n: number,
    data: (tx: RedeemerContext) => unknown,
    label = `unlock ${n}`,
  ) =>
    spend.plutus({
      utxo: locked(n),
      script: plutusScript,
      redeemer: { data: data as (tx: RedeemerContext) => number },
      label,
    });
  const builder = (evaluator = fakeEvaluator().evaluator) =>
    new TxBuilder({ network, costModels, params, evaluator });
  const payer = (...utxos: Utxo[]) => ({ changeAddress: wallet, utxos });
  /** The redeemer data of a transaction, in the order of its witness set */
  const redeemerData = (tx: string) =>
    (
      Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ?? []
    ).map((r) => r.data().toCbor().toString());
  /** Whether a value holds a function anywhere */
  const holdsFunction = (value: unknown): boolean =>
    typeof value === "function" ||
    (value !== null &&
      typeof value === "object" &&
      Object.values(value).some(holdsFunction));

  it("indexes an input among the inputs balancing adds", async () => {
    // The payer's UTxO sorts before the script output
    const funds = utxo(lovelace(ada(50)));
    const built = await builder().build(
      [
        unlock(1, (tx) => tx.self),
        output({ address: recipient, value: { lovelace: ada(30) } }),
      ],
      { payer: payer(funds) },
    );

    expect(built.inputs.map((u) => u.txHash)).toEqual([
      funds.txHash,
      locked(1).txHash,
    ]);
    expect(built.redeemers.map((r) => [r.tag, r.index, r.data])).toEqual([
      ["SPEND", 1, "01"],
    ]);
    expect(redeemerData(built.tx)).toEqual(["01"]);
  });

  it("hands the evaluator the computed data", async () => {
    const { evaluator, calls } = fakeEvaluator();
    const built = await builder(evaluator).build(
      [unlock(1, (tx) => [tx.self, tx.inputs.length])],
      { payer: payer(utxo(lovelace(ada(50)))) },
    );

    expect(calls.length).toBeGreaterThan(0);
    for (const tx of calls)
      expect(redeemerData(tx)).toEqual(built.redeemers.map((r) => r.data));
  });

  it("reports the data in the result, which stays plain data", async () => {
    const events: BuildEvent[] = [];
    const built = await builder().build(
      [
        unlock(1, (tx) => tx.self),
        mint.plutus({
          script: plutusScript,
          redeemer: { data: (tx) => tx.self + 7 },
          assets: { "01": 1n },
          label: "mint",
        }),
        // A value: its part stays the one given
        spend.plutus({
          utxo: locked(2),
          script: plutusScript,
          redeemer: { data: 3 },
          label: "value",
        }),
      ],
      {
        payer: payer(utxo(lovelace(ada(50)))),
        trace: (event) => events.push(event),
      },
    );

    expect(holdsFunction(built)).toBe(false);
    expect(structuredClone(built.parts)).toEqual(built.parts);
    expect(structuredClone(built)).toEqual(built);
    for (const r of built.redeemers) expect(built.parts).toContain(r.part);
    expect(
      built.redeemers.map((r) => [r.label, r.data, redeemerOf(r)]),
    ).toEqual([
      ["unlock 1", "00", { type: "CBOR", hex: "00" }],
      ["value", "03", { type: "CBOR", hex: "03" }],
      ["mint", "07", { type: "CBOR", hex: "07" }],
    ]);
    const evaluated = events.flatMap((e) =>
      e.type === "evaluated" ? [e.redeemers] : [],
    );
    expect(evaluated.length).toBeGreaterThan(0);
    expect(holdsFunction(evaluated)).toBe(false);
    for (const redeemers of evaluated)
      expect(redeemers.map((r) => r.data)).toEqual(["00", "03", "07"]);
  });

  const redeemerOf = (r: BuiltRedeemer) =>
    (r.part!.witness as { redeemer: { data: unknown } }).redeemer.data;

  it("leaves the given parts alone: a second build calls the function again", async () => {
    const data = jest.fn((tx: RedeemerContext) => tx.self);
    const parts = [unlock(1, data)];
    const funds = utxo(lovelace(ada(50)));
    const first = await builder().build(parts, { payer: payer(funds) });
    const calls = data.mock.calls.length;
    const second = await builder().build(parts, { payer: payer(funds) });

    expect(calls).toBeGreaterThan(0);
    expect(data.mock.calls.length).toBe(2 * calls);
    expect(second.tx).toBe(first.tx);
    expect(() => structuredClone(parts[0])).toThrow();
    expect(
      (parts[0]!.witness as { redeemer: { data: unknown } }).redeemer.data,
    ).toEqual({ type: "deferred", build: data });
  });

  it("agrees with the result on inputs, reference inputs and outputs", async () => {
    const holder = utxo(lovelace(ada(20)), { script: plutusRef });
    const read = utxo(lovelace(ada(2)));
    const funds = utxo(lovelace(ada(50)));
    let seen: RedeemerContext | undefined;
    const built = await builder().build(
      [
        spend.plutus({
          utxo: locked(1),
          script: { reference: holder },
          redeemer: {
            data: (tx) => {
              seen = tx;
              return [tx.output("pay"), tx.input(locked(1))];
            },
          },
        }),
        referenceInput({ utxo: read }),
        output({
          address: recipient,
          value: { lovelace: ada(3) },
          label: "other",
        }),
        output({
          address: recipient,
          value: { lovelace: ada(4) },
          label: "pay",
        }),
        output({
          address: recipient,
          value: { lovelace: ada(5) },
          label: "pay",
        }),
      ],
      { payer: payer(funds, holder) },
    );
    const tx = seen!;

    expect(tx.output("pay")).toBe(outputOf(built, "pay").outputIndex);
    expect(tx.output("pay")).toBe(1);
    expect(tx.output("other")).toBe(outputOf(built, "other").outputIndex);
    for (const [i, u] of built.inputs.entries()) expect(tx.input(u)).toBe(i);
    expect(built.referenceInputs).toHaveLength(2);
    for (const [i, u] of built.referenceInputs.entries())
      expect(tx.referenceInput(u)).toBe(i);
    // Asked for by the CBOR a CIP-30 wallet gives, an input is found as in the other forms
    for (const [i, u] of built.inputs.entries())
      expect(tx.input(asCbor(u))).toBe(i);
    for (const [i, u] of built.referenceInputs.entries())
      expect(tx.referenceInput(asCbor(u))).toBe(i);
    expect(tx.input(asCbor(locked(1)))).toBe(tx.input(locked(1)));
    expect(built.redeemers[0]!.data).toBe(
      `9f01${tx.input(locked(1)).toString(16).padStart(2, "0")}ff`,
    );
  });

  it("refuses a payer UTxO that balancing did not select", async () => {
    const spare = utxo(lovelace(ada(50)));
    const error = await expectBuildError(
      builder().build([unlock(1, (tx) => tx.input(spare))], {
        payer: payer(spare),
      }),
      "INVALID_REDEEMER",
    );
    expect(error.details).toEqual({
      reason: "notAnInput",
      ref: `${spare.txHash}#0`,
    });
    expect(error.label).toBe("unlock 1");
  });

  it("rejects with what the function throws", async () => {
    const thrown = new Error("cannot");
    const error = await expectBuildError(
      builder().build(
        [
          unlock(1, () => {
            throw thrown;
          }),
        ],
        { payer: payer(utxo(lovelace(ada(50)))) },
      ),
      "INVALID_REDEEMER",
    );
    expect(error.details).toEqual({ reason: "threw" });
    expect(error.cause).toBe(thrown);
    expect(error.part).toBe("spend");
    expect(error.label).toBe("unlock 1");
  });

  it("settles a redeemer that lists every input, over rounds that add inputs", async () => {
    const funds = Array.from({ length: 40 }, () => utxo(lovelace(1_500_000n)));
    const rounds: number[] = [];
    const built = await builder().build(
      [
        unlock(1, (tx) => tx.inputs.map((i) => i.txHash)),
        output({ address: recipient, value: { lovelace: ada(40) } }),
      ],
      {
        payer: payer(...funds),
        trace: (event) => {
          if (event.type === "round") rounds.push(event.selected);
        },
      },
    );

    expect(built.selectedInputs.length).toBeGreaterThan(20);
    expect(new Set(rounds).size).toBeGreaterThan(1);
    const listed = built.inputs.map((u) => u.txHash);
    expect(built.redeemers[0]!.data).toBe(
      `9f${listed.map((h) => `5820${h}`).join("")}ff`,
    );
    expect(redeemerData(built.tx)).toEqual([built.redeemers[0]!.data]);
    expect(built.fee).toBeGreaterThanOrEqual(signedMinFee(built, 1));
    expectBalanced(built);
  });
});

describe("TxBuilder: script withdrawal without a reward address", () => {
  const script = withdrawal.plutus({
    amount: 0n,
    script: plutusScript,
    redeemer: { data: mConStr0([]) },
    label: "own",
  });
  const funds = () => [utxo(lovelace(ada(50)))];
  const onMainnet = (address: string) => {
    const bytes = bech32.fromWords(bech32.decode(address, 200).words);
    bytes[0] = bytes[0]! | 0x01;
    return bech32.encode("addr", bech32.toWords(bytes), 200);
  };

  it("derives the address on the builder's network", async () => {
    for (const [name, prefix, changeAddress] of [
      ["preprod", "stake_test1", wallet],
      ["mainnet", "stake1", onMainnet(wallet)],
    ] as const) {
      const builder = new TxBuilder({
        network: name,
        costModels,
        params,
        evaluator: fakeEvaluator().evaluator,
      });
      const derived = builder.rewardAddress(plutusScript);
      const keyAccount = keyHashToRewardAddress(
        "00".repeat(28),
        name === "mainnet" ? 1 : 0,
      );
      const built = await builder.build(
        [withdrawal.pubKey({ rewardAddress: keyAccount, amount: 0n }), script],
        {
          payer: {
            changeAddress,
            utxos: funds().map((u) => ({ ...u, address: changeAddress })),
          },
        },
      );

      expect(derived.startsWith(prefix)).toBe(true);
      expect(derived).toBe(
        scriptHashToRewardAddress(
          alwaysSucceedHash,
          name === "mainnet" ? 1 : 0,
        ),
      );
      // Script accounts still sort before key accounts
      expect(Object.keys(built.prototype.body.withdrawals!)).toEqual([
        derived,
        keyAccount,
      ]);
      expect(built.parts).toContainEqual(
        expect.objectContaining({ label: "own", rewardAddress: derived }),
      );
      expect(built.redeemers.map((r) => [r.tag, r.index, r.label])).toEqual([
        ["REWARD", 0, "own"],
      ]);
      expect(script.rewardAddress).toBeUndefined();
    }
  });

  it("looks the balance up once, at the derived address", async () => {
    const derived = scriptHashToRewardAddress(alwaysSucceedHash, 0);
    const { fetcher, calls } = fakeFetcher([], { [derived]: "4200000" });
    const built = await new TxBuilder({
      network,
      params,
      costModels,
      provider: fetcher,
      evaluator: fakeEvaluator().evaluator,
    }).build(
      [
        withdrawal.plutus({
          amount: "all",
          script: plutusScript,
          redeemer: { data: mConStr0([]) },
        }),
      ],
      { payer: { changeAddress: wallet, utxos: funds() } },
    );

    expect(calls.fetchAccountInfo).toBe(1);
    expect(built.prototype.body.withdrawals).toEqual({ [derived]: "4200000" });
    expectBalanced(built);
  });

  it("checks a stated script hash against the reference output it names", async () => {
    const holder = utxo(lovelace(ada(20)), { script: plutusRef });
    const part = withdrawal.plutus({
      amount: 0n,
      script: {
        reference: ref(holder),
        scriptHash: "ab".repeat(28),
        version: "V3",
      },
      redeemer: { data: mConStr0([]) },
    });
    await expect(
      new TxBuilder({
        network,
        params,
        costModels,
        evaluator: fakeEvaluator().evaluator,
      }).build([part], {
        payer: { changeAddress: wallet, utxos: [...funds(), holder] },
      }),
    ).rejects.toMatchObject({
      name: "TxPartError",
      code: "INVALID_SCRIPT",
      message: expect.stringContaining(
        `script hash ${"ab".repeat(28)} does not match`,
      ),
    });
  });

  it("refuses a given address of another network", async () => {
    const error = await expectBuildError(
      new TxBuilder({
        network,
        params,
        costModels,
        evaluator: fakeEvaluator().evaluator,
      }).build(
        [
          withdrawal.plutus({
            rewardAddress: scriptHashToRewardAddress(alwaysSucceedHash, 1),
            amount: 0n,
            script: plutusScript,
            redeemer: { data: mConStr0([]) },
          }),
        ],
        { payer: { changeAddress: wallet, utxos: funds() } },
      ),
      "NETWORK_MISMATCH",
    );
    expect(error.part).toBe("withdrawal");
  });

  it("refuses the same account twice, derived or given", async () => {
    await expectBuildError(
      new TxBuilder({
        network,
        params,
        costModels,
        evaluator: fakeEvaluator().evaluator,
      }).build(
        [
          script,
          withdrawal.plutus({
            rewardAddress: scriptHashToRewardAddress(alwaysSucceedHash, 0),
            amount: 0n,
            script: plutusScript,
            redeemer: { data: mConStr0([]) },
          }),
        ],
        { payer: { changeAddress: wallet, utxos: funds() } },
      ),
      "DUPLICATE_PART",
    );
  });

  it("takes two derived accounts of different scripts, and refuses one script withdrawn twice", async () => {
    const builder = new TxBuilder({
      network,
      params,
      costModels,
      evaluator: fakeEvaluator().evaluator,
    });
    const failing = withdrawal.plutus({
      amount: 0n,
      script: { code: alwaysFailCbor, version: "V3" },
      redeemer: { data: mConStr0([]) },
    });
    // Neither address is known before the build derives it
    const built = await builder.build([script, failing], {
      payer: { changeAddress: wallet, utxos: funds() },
    });
    expect(Object.keys(built.prototype.body.withdrawals ?? {}).sort()).toEqual(
      [
        builder.rewardAddress(plutusScript),
        builder.rewardAddress({ code: alwaysFailCbor, version: "V3" }),
      ].sort(),
    );

    const again = withdrawal.plutus({
      amount: 0n,
      script: plutusScript,
      redeemer: { data: mConStr0([]) },
      label: "again",
    });
    const error = await expectBuildError(
      builder.build([script, again], {
        payer: { changeAddress: wallet, utxos: funds() },
      }),
      "DUPLICATE_PART",
    );
    expect(error).toMatchObject({ part: "withdrawal", label: "again" });
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

describe("TxBuilder: guards", () => {
  it("refuses a guard with the hash of a script known only after the lookup", async () => {
    const holder: Utxo = {
      txHash: "c1".repeat(32),
      outputIndex: 0,
      address: wallet,
      value: lovelace(ada(20)),
      script: plutusRef,
    };
    const lockedUtxo: Utxo = {
      txHash: "c2".repeat(32),
      outputIndex: 0,
      address: scriptAddress,
      value: lovelace(ada(10)),
      datum: unitInline,
    };
    const { fetcher } = fakeFetcher([holder, lockedUtxo]);
    const { evaluator, calls } = fakeEvaluator();
    const error = await expectBuildError(
      new TxBuilder({ network, params, provider: fetcher, evaluator }).build(
        [
          // By out ref alone: neither part knows the script's hash before the lookup
          spend.plutus({
            utxo: ref(lockedUtxo),
            script: { reference: ref(holder) },
            redeemer: { data: mConStr0([]) },
          }),
          guard.pubKey({ keyHash: alwaysSucceedHash, label: "approver" }),
        ],
        { payer: { changeAddress: wallet, utxos: [utxo(lovelace(ada(50)))] } },
      ),
      "INVALID_GUARD",
    );
    expect(error.details).toEqual({
      reason: "scriptHash",
      hash: alwaysSucceedHash,
    });
    expect(error.label).toBe("approver");
    // Refused at the first assembly, before any script is evaluated
    expect(calls).toHaveLength(0);
  });

  it("needs the signature of a guard's key, and prices its witness", async () => {
    const builder = new TxBuilder({ network, params });
    const funds = [utxo(lovelace(ada(100)))];
    const pay = output({ address: recipient, value: { lovelace: ada(5) } });
    const build = (parts: TxPart[]) =>
      builder.build(parts, { payer: { changeAddress: wallet, utxos: funds } });
    const guarded = await build([
      pay,
      guard.pubKey({ keyHash: keyHashHex(9), label: "approver" }),
    ]);
    const plain = await build([pay]);

    expect([...guarded.signers.keyHashes].sort()).toEqual([
      keyHashHex(1),
      keyHashHex(9),
    ]);
    expect(
      guarded.signers.keys.find((k) => k.keyHash === keyHashHex(9)),
    ).toEqual({
      keyHash: keyHashHex(9),
      neededBy: [{ part: "guard", label: "approver", role: "guard" }],
    });
    expect(
      minFee(guarded.prototype, {
        params,
        vkeyWitnesses: guarded.signers.keyHashes.length,
        inputs: guarded.inputs,
      }),
    ).toBeLessThanOrEqual(guarded.fee);
    // One more key witness of 101 bytes, and 28 bytes more of body
    expect(guarded.fee - plain.fee).toBeGreaterThanOrEqual(
      BigInt(params.minFeeA) * 101n,
    );
  });
});

describe("minCoin", () => {
  const datum = mConStr0([42]);
  const outputs = {
    "lovelace only": { address: recipient, value: {} },
    "with tokens": {
      address: recipient,
      value: { [mockTokenUnit(1)]: 5n, [mockTokenUnit(2)]: 1n },
    },
    "with an inline datum": {
      address: scriptAddress,
      value: {},
      datum: { type: "inline" as const, data: datum },
    },
    "with a reference script": {
      address: recipient,
      value: {},
      scriptRef: plutusScript,
    },
  };

  it.each(Object.entries(outputs))(
    "is (160 + size) * coinsPerUtxoSize of the output holding it: %s",
    (_, given) => {
      const part = output(given);
      const coin = minCoin(part, params);
      const size =
        transactionOutputPrototypeToCardano({
          ...part.output,
          amount: { ...part.output.amount, coin: coin.toString() },
        } as TransactionOutputPrototype)
          .toCbor()
          .toString().length / 2;
      expect(coin).toBe(BigInt((160 + size) * params.coinsPerUtxoSize));
    },
  );

  it("does not count the part's own lovelace", () => {
    const without = output({ address: recipient, value: {} });
    const withLovelace = output({
      address: recipient,
      value: { lovelace: ada(50) },
    });
    expect(minCoin(withLovelace, params)).toBe(minCoin(without, params));
  });

  it("is what a build puts into an output given without lovelace", async () => {
    const builder = new TxBuilder({ network, params });
    const payer = { changeAddress: wallet, utxos: [utxo(lovelace(ada(100)))] };
    const value = { [mockTokenUnit(1)]: 5n };
    const funds = [utxo({ ...lovelace(ada(100)), [mockTokenUnit(1)]: 5n })];
    const part = output({ address: recipient, value, label: "to" });
    const coin = minCoin(part, params);
    const built = await builder.build(part, {
      payer: { ...payer, utxos: funds },
    });
    expect(coinOf(outputOf(built, "to"))).toBe(coin);

    const exactly = output({
      address: recipient,
      value: { ...value, lovelace: coin },
    });
    await builder.build(exactly, { payer: { ...payer, utxos: funds } });
    await expectBuildError(
      builder.build(
        output({
          address: recipient,
          value: { ...value, lovelace: coin - 1n },
        }),
        { payer: { ...payer, utxos: funds } },
      ),
      "OUTPUT_BELOW_MIN_COIN",
    );
  });

  it("reads coinsPerUtxoSize only, and leaves the part as it was", () => {
    const part = output(outputs["with tokens"]);
    const copy = structuredClone(part);
    expect(minCoin(part, { coinsPerUtxoSize: params.coinsPerUtxoSize })).toBe(
      minCoin(part, params),
    );
    expect(part).toEqual(copy);
  });
});

describe("minFee", () => {
  const funds = () => [utxo(lovelace(ada(100)))];
  const payment = () =>
    new TxBuilder({ network, params }).build(
      output({ address: recipient, value: { lovelace: ada(5) } }),
      { payer: { changeAddress: wallet, utxos: funds() } },
    );
  const placeholder = (i: number) => ({
    vkey: i.toString(16).padStart(64, "0"),
    signature: i.toString(16).padStart(128, "0"),
  });

  it("is not above the fee of a build, for the keys it priced", async () => {
    const built = await payment();
    const fee = minFee(built.prototype, {
      params,
      vkeyWitnesses: built.signers.keyHashes.length,
      inputs: [...built.inputs, ...built.referenceInputs],
    });
    expect(fee).toBeLessThanOrEqual(built.fee);
    expect(fee).toBeGreaterThanOrEqual(built.fee - 88n);
  });

  it("grows by one key witness's bytes for one more key, counting no witness twice", async () => {
    const { prototype } = await payment();
    const one = minFee(prototype, { params, vkeyWitnesses: 1 });
    const two = minFee(prototype, { params, vkeyWitnesses: 2 });
    // Key and signature, their byte-string headers, and the witness's array header
    expect(two - one).toBe(BigInt(params.minFeeA) * 101n);

    // Witnesses the prototype carries are replaced, not added to
    const signed = structuredClone(prototype);
    signed.witness_set.vkeys = [placeholder(1), placeholder(2)];
    expect(minFee(signed, { params, vkeyWitnesses: 1 })).toBe(one);
    expect(signed.witness_set.vkeys).toHaveLength(2);
  });

  it("sizes the bootstrap witnesses a prototype carries as given", async () => {
    const { prototype } = await payment();
    const withBootstrap = structuredClone(prototype);
    withBootstrap.witness_set.bootstraps = [
      {
        vkey: "33".repeat(32),
        signature: "44".repeat(64),
        chain_code: Array(32).fill(0),
        attributes: [0xa0],
      },
    ];
    const context = { params, vkeyWitnesses: 1 };
    // The witness: an array header, three byte strings of 32, 64 and 32 bytes with two-byte
    // headers, and its one-byte attributes with a one-byte header; in the witness set, key 2,
    // the three-byte set tag and the header of its array
    const witnessBytes = 1n + 34n + 66n + 34n + 2n;
    expect(minFee(withBootstrap, context) - minFee(prototype, context)).toBe(
      BigInt(params.minFeeA) * (witnessBytes + 1n + 3n + 1n),
    );
  });

  it("prices the reference scripts of the UTxOs the body spends or reads, and no others", async () => {
    const holder = utxo(lovelace(ada(20)), { script: plutusRef });
    const elsewhere = utxo(lovelace(ada(20)), { script: plutusRef });
    const built = await new TxBuilder({ network, params }).build(
      [
        referenceInput({ utxo: holder }),
        output({ address: recipient, value: { lovelace: ada(5) } }),
      ],
      { payer: { changeAddress: wallet, utxos: funds() } },
    );
    const context = { params, vkeyWitnesses: 1 };
    const bare = minFee(built.prototype, context);
    const size = BigInt(resolveScriptRef(plutusScript).length / 2);
    expect(
      minFee(built.prototype, { ...context, inputs: [holder] }) - bare,
    ).toBe(refScriptFee(size, params.minFeeRefScriptCostPerByte));
    expect(minFee(built.prototype, { ...context, inputs: [elsewhere] })).toBe(
      bare,
    );
  });

  it("prices the execution units of the redeemers", async () => {
    const built = await new TxBuilder({
      network,
      params,
      costModels,
      evaluator: null,
    }).build(
      spend.plutus({
        utxo: {
          txHash: "c3".repeat(32),
          outputIndex: 0,
          address: scriptAddress,
          value: lovelace(ada(10)),
          datum: unitInline,
        },
        script: plutusScript,
        redeemer: { data: mConStr0([]), exUnits: { mem: 5000, steps: 7000 } },
      }),
      { payer: { changeAddress: wallet, utxos: funds() } },
    );
    const before = structuredClone(built.prototype);
    const context = { params, vkeyWitnesses: 1 };
    // Units of the same encoded width, so only their price differs
    const more = structuredClone(built.prototype);
    more.witness_set.redeemers![0]!.ex_units = { mem: "6000", steps: "9000" };
    expect(minFee(more, context) - minFee(built.prototype, context)).toBe(
      exUnitsFee(6000n, 9000n, params) - exUnitsFee(5000n, 7000n, params),
    );
    expect(built.prototype).toEqual(before);
  });
});

describe("TxBuilder: finalize", () => {
  const nativeScript: NativeScript = {
    type: "all",
    scripts: [{ type: "sig", keyHash: keyHashHex(7) }],
  };
  const builder = (options: Partial<TxBuilderOptions> = {}) =>
    new TxBuilder({
      network,
      params,
      costModels,
      evaluator: fakeEvaluator().evaluator,
      ...options,
    });
  const payer = (...extra: Utxo[]) => ({
    changeAddress: wallet,
    utxos: [utxo(lovelace(ada(100))), ...extra],
  });
  /** Every UTxO the body names: inputs, reference inputs and collateral */
  const named = (built: BuiltTx) => [
    ...built.inputs,
    ...built.referenceInputs,
    ...(built.collateral?.inputs ?? []),
  ];
  const locked = (n: number, address = scriptAddress): Utxo => ({
    txHash: (0xd0 + n).toString(16).repeat(32),
    outputIndex: 0,
    address,
    value: lovelace(ada(10)),
    datum: unitInline,
  });
  const payment = (b = builder()) =>
    b.build(output({ address: recipient, value: { lovelace: ada(5) } }), {
      payer: payer(),
    });
  /** A Plutus spend with collateral, its script read from a reference output */
  const plutusSpend = async (b = builder()) => {
    const holder = utxo(lovelace(ada(20)), { script: plutusRef });
    const built = await b.build(
      [
        spend.plutus({
          utxo: locked(1),
          script: { reference: holder },
          redeemer: { data: mConStr0([1]) },
          label: "unlock",
        }),
      ],
      { payer: payer(holder) },
    );
    return { built, holder };
  };
  /** The prototype with its fee lowered, so that finalize must raise it */
  const underpaid = (built: BuiltTx, by = 10_000n) => {
    const edited = structuredClone(built.prototype);
    edited.body.fee = (built.fee - by).toString();
    return edited;
  };

  it("refuses a fee below the minimum without a change address", async () => {
    const built = await payment();
    const error = await expectBuildError(
      builder().finalize(underpaid(built), { inputs: built.inputs }),
      "FEE_TOO_LOW",
    );
    const details = error.details as { fee: bigint; minFee: bigint };
    expect(details.fee).toBe(built.fee - 10_000n);
    expect(typeof details.minFee).toBe("bigint");
    expect(details.minFee).toBeGreaterThan(details.fee);
  });

  it("gives back a built transaction untouched: a payment, a native script spend, a Plutus spend", async () => {
    const native = await builder().build(
      [
        spend.native({
          utxo: locked(2, builder().scriptAddress(nativeScript)),
          script: nativeScript,
        }),
      ],
      { payer: payer() },
    );
    const { built: plutus } = await plutusSpend();
    expect(plutus.collateral).toBeDefined();
    expect(plutus.referenceInputs).toHaveLength(1);
    for (const built of [await payment(), native, plutus]) {
      const final = await builder().finalize(built.prototype, {
        inputs: named(built),
      });
      expect(final.tx).toBe(built.tx);
      expect(final.txHash).toBe(built.txHash);
      expect(final.fee).toBe(built.fee);
    }
  });

  it("prices a raised fee for the keys a native script names", async () => {
    const native = await builder().build(
      [
        spend.native({
          utxo: locked(2, builder().scriptAddress(nativeScript)),
          script: nativeScript,
        }),
      ],
      { payer: payer() },
    );
    const final = await builder().finalize(underpaid(native), {
      inputs: named(native),
      changeAddress: wallet,
    });
    // The locked UTxO pays for itself: the one key is the one the script names, which no
    // signer role lists
    expect(final.inputs).toHaveLength(1);
    expect(final.signers.keyHashes).toEqual([]);
    expect(final.fee).toBe(
      minFee(final.prototype, {
        params,
        vkeyWitnesses: 1,
        inputs: named(native),
      }),
    );
    expect(final.fee).toBe(native.fee);
  });

  it("prices a raised fee for a bootstrap witness of a Byron input", async () => {
    const byron = "Ae2tdPwUPEZ4YjgvykNpoFeYUxoyhNj2kg8KfKWN2FizsSpLUPv68MpTVDo";
    const atByron = utxo(lovelace(ada(100)), {}, byron);
    const prototype = assembleTxPrototype(
      [
        spend.pubKey({ utxo: atByron }),
        output({ address: recipient, value: { lovelace: ada(5) } }),
        output({ address: wallet, value: { lovelace: ada(95) } }),
      ],
      { fee: 0n },
    ).prototype;
    const final = await builder().finalize(prototype, {
      inputs: [atByron],
      changeAddress: wallet,
    });
    expect(final.signers.byronAddresses).toEqual([byron]);
    expect(final.signers.keyHashes).toEqual([]);
    // The same transaction signed: one bootstrap witness, the address's attributes an empty map
    const signed = structuredClone(final.prototype);
    signed.witness_set.bootstraps = [
      {
        vkey: "33".repeat(32),
        signature: "44".repeat(64),
        chain_code: Array(32).fill(0),
        attributes: [0xa0],
      },
    ];
    expect(final.fee).toBe(minFee(signed, { params, vkeyWitnesses: 0 }));
    expect(final.fee).toBeGreaterThan(
      minFee(final.prototype, { params, vkeyWitnesses: 0 }),
    );
  });

  it("takes the change address in hex or bech32, and refuses one that is no address, or inputs that are no UTxOs", async () => {
    const built = await payment();
    const edited = underpaid(built);
    const fromBech32 = await builder().finalize(edited, {
      inputs: built.inputs,
      changeAddress: wallet,
    });
    const fromHex = await builder().finalize(edited, {
      inputs: built.inputs,
      changeAddress: Address.fromBech32(wallet).toBytes(),
    });
    expect(fromHex.tx).toBe(fromBech32.tx);
    expect(fromHex.change).toEqual(fromBech32.change);

    const error = await expectBuildError(
      builder().finalize(edited, {
        inputs: built.inputs,
        changeAddress: "not an address",
      }),
      "INVALID_OPTION",
    );
    expect((error.details as { option: string }).option).toBe("changeAddress");

    // Nor are inputs that are not a list of UTxOs taken
    for (const inputs of [undefined, [42]]) {
      const bad = await expectBuildError(
        builder().finalize(edited, {
          inputs: inputs as unknown as UTxO[],
          changeAddress: wallet,
        }),
        "INVALID_OPTION",
      );
      expect((bad.details as { option: string }).option).toBe("inputs");
    }
  });

  describe("the output that pays the increase", () => {
    const funded = utxo(lovelace(ada(100)));
    const least = minCoin(output({ address: wallet, value: {} }), params);
    /** A transaction assembled by hand with fee 0, its outputs at the wallet as given */
    const assembled = (...walletCoins: bigint[]) =>
      assembleTxPrototype(
        [
          spend.pubKey({ utxo: funded }),
          output({ address: recipient, value: { lovelace: ada(5) } }),
          ...walletCoins.map((lovelace) =>
            output({ address: wallet, value: { lovelace } }),
          ),
        ],
        { fee: 0n },
      ).prototype;
    const finalize = (prototype: TransactionPrototype) =>
      builder().finalize(prototype, {
        inputs: [funded],
        changeAddress: wallet,
      });
    const coins = (built: BuiltTx) =>
      built.prototype.body.outputs.map((o) => BigInt(o.amount.coin));

    it("refuses when the only output there holds just its minimum", async () => {
      const error = await expectBuildError(
        finalize(assembled(least)),
        "FEE_TOO_LOW",
      );
      // The prototype's fee, and the minimum reached
      const details = error.details as { fee: bigint; minFee: bigint };
      expect(details.fee).toBe(0n);
      expect(typeof details.minFee).toBe("bigint");
      expect(details.minFee).toBeGreaterThan(0n);
    });

    it("refuses when no output is at the change address", async () => {
      const error = await expectBuildError(
        builder().finalize(assembled(ada(50)), {
          inputs: [funded],
          changeAddress: baseAddress(3),
        }),
        "FEE_TOO_LOW",
      );
      const details = error.details as { fee: bigint; minFee: bigint };
      expect(details.fee).toBe(0n);
      expect(details.minFee).toBeGreaterThan(0n);
    });

    it("takes the whole increase from the last output there that can pay", async () => {
      const final = await finalize(assembled(ada(40), ada(50)));
      expect(coins(final)).toEqual([ada(5), ada(40), ada(50) - final.fee]);
    });

    it("passes over a last output that holds just its minimum", async () => {
      const final = await finalize(assembled(ada(40), least));
      expect(coins(final)).toEqual([ada(5), ada(40) - final.fee, least]);
    });
  });

  it("leaves the prototype it is given as it was", async () => {
    const built = await payment();
    const edited = underpaid(built);
    edited.witness_set.vkeys = [
      { vkey: "11".repeat(32), signature: "22".repeat(64) },
    ];
    const before = structuredClone(edited);
    await builder().finalize(edited, {
      inputs: built.inputs,
      changeAddress: wallet,
    });
    expect(edited).toEqual(before);
  });

  it("recomputes the auxiliary data hash, and removes it with the auxiliary data", async () => {
    const built = await builder().build(
      [
        output({ address: recipient, value: { lovelace: ada(5) } }),
        message({ text: "first" }),
      ],
      { payer: payer() },
    );
    const edited = structuredClone(built.prototype);
    edited.auxiliary_data!.metadata!["674"] = {
      type: "MAP",
      value: [
        [
          { type: "STRING", value: "msg" },
          { type: "LIST", value: [{ type: "STRING", value: "second" }] },
        ],
      ],
    };
    const final = await builder().finalize(edited, {
      inputs: built.inputs,
      changeAddress: wallet,
    });
    const auxiliaryData = Transaction.fromCbor(
      TxCBOR(final.tx),
    ).auxiliaryData();
    expect(final.prototype.body.auxiliary_data_hash).toBe(
      blake2b.hash(auxiliaryData!.toCbor(), 32).toString(),
    );
    expect(final.prototype.body.auxiliary_data_hash).not.toBe(
      built.prototype.body.auxiliary_data_hash,
    );

    const stripped = structuredClone(built.prototype);
    delete stripped.auxiliary_data;
    const bare = await builder().finalize(stripped, { inputs: built.inputs });
    expect(bare.prototype.body.auxiliary_data_hash).toBeUndefined();
    expect(
      Transaction.fromCbor(TxCBOR(bare.tx)).auxiliaryData(),
    ).toBeUndefined();
  });

  it("needs cost models only for a transaction that runs a Plutus script", async () => {
    const withoutModels = () => builder({ costModels: undefined });
    const { built } = await plutusSpend();
    const error = await expectBuildError(
      withoutModels().finalize(built.prototype, { inputs: named(built) }),
      "MISSING_PARAMETER",
    );
    expect(error.details).toEqual({ parameter: "costModels" });

    const paid = await payment();
    await withoutModels().finalize(paid.prototype, { inputs: named(paid) });
    // Nor asked of a provider
    const { fetcher, calls } = fakeFetcher([]);
    await builder({ costModels: undefined, provider: fetcher }).finalize(
      paid.prototype,
      { inputs: named(paid) },
    );
    expect(calls.fetchCostModels).toBeUndefined();
    // A datum in the witness set runs no script
    const withDatum = await builder().build(
      output({
        address: scriptAddress,
        value: { lovelace: ada(5) },
        datum: { type: "hash", data: mConStr0([7]), embed: true },
      }),
      { payer: payer() },
    );
    expect(withDatum.prototype.witness_set.plutus_data).toBeDefined();
    const final = await withoutModels().finalize(withDatum.prototype, {
      inputs: named(withDatum),
    });
    expect(final.tx).toBe(withDatum.tx);
  });

  it("reports the transaction it completes as data, without parts", async () => {
    const { built, holder } = await plutusSpend();
    const edited = underpaid(built, 0n);
    // A raise needs collateral to cover it: put up more of it by hand
    edited.body.total_collateral = (
      BigInt(edited.body.total_collateral!) + ada(1)
    ).toString();
    edited.body.collateral_return!.amount.coin = (
      BigInt(edited.body.collateral_return!.amount.coin) - ada(1)
    ).toString();
    edited.body.ttl = "99999999";
    const final = await builder().finalize(edited, {
      inputs: named(built),
      changeAddress: wallet,
    });

    expect(final.fee).toBeGreaterThan(built.fee);
    // Worked out from the body, as the build worked them out from its parts
    expect(final.signers).toEqual(built.signers);
    expect(final.signers.keys[0]!.neededBy).toEqual([
      { part: "collateral", role: "collateral" },
    ]);
    expect(final.inputs.map(ref)).toEqual(
      final.prototype.body.inputs.map((i) => ({
        txHash: i.transaction_id,
        outputIndex: i.index,
      })),
    );
    expect(final.referenceInputs.map(ref)).toEqual([ref(holder)]);
    for (const [i, o] of final.outputs.entries())
      expect(ref(o)).toEqual({ txHash: final.txHash, outputIndex: i });
    expect(final.change.length).toBeGreaterThan(0);
    for (const o of final.change) {
      expect(o.address).toBe(wallet);
      expect(o.change).toBe(true);
      expect(final.outputs).toContainEqual(o);
    }
    expect(final.parts).toEqual([]);
    expect(final.selectedInputs).toEqual([]);
    expect(final.warnings).toEqual([]);
    expect(final.validity).toMatchObject({ invalidHereafter: 99999999 });
    expect(final.network).toEqual(built.network);
    expect(final.redeemers).toEqual([
      {
        tag: "SPEND",
        index: 0,
        exUnits: built.redeemers[0]!.exUnits,
        data: built.redeemers[0]!.data,
      },
    ]);
    expect(built.redeemers[0]!.part).toBeDefined();
    expect(final.exUnits).toEqual(built.exUnits);
    // The return as the UTxO it becomes if the script fails: the output after the body's own
    const returned = edited.body.collateral_return!;
    expect(final.collateral).toEqual({
      inputs: built.collateral!.inputs,
      total: BigInt(edited.body.total_collateral!),
      return: {
        txHash: final.txHash,
        outputIndex: final.prototype.body.outputs.length,
        address: returned.address,
        value: { lovelace: BigInt(returned.amount.coin) },
      },
    });
    // The inputs gone, the change added
    const after = utxosAfter(named(built), final);
    expect(after).toContainEqual(
      expect.objectContaining(ref(final.change[0]!)),
    );
    for (const spent of final.inputs)
      expect(after.map(ref)).not.toContainEqual(ref(spent));

    const unmarked = await builder().finalize(built.prototype, {
      inputs: named(built),
    });
    expect(unmarked.change).toEqual([]);
    expect(unmarked.outputs.some((o) => o.change)).toBe(false);
  });

  it("counts collateral without a stated total as its inputs less its return", async () => {
    const { built } = await plutusSpend();
    const untotalled = structuredClone(built.prototype);
    delete untotalled.body.total_collateral;
    const held = built.collateral!.inputs.reduce(
      (total, u) => total + u.value.lovelace,
      0n,
    );
    const returned = BigInt(untotalled.body.collateral_return!.amount.coin);
    expect(held - returned).toBeGreaterThan(0n);

    // Kept fee: the total is read from the inputs and the return
    const kept = await builder().finalize(untotalled, { inputs: named(built) });
    expect(kept.fee).toBe(built.fee);
    expect(kept.prototype.body.total_collateral).toBeUndefined();
    expect(kept.collateral!.total).toBe(held - returned);

    // Raised fee: the collateral is checked against the same amount, here less 1 ada
    const short = structuredClone(untotalled);
    short.body.fee = (built.fee - 10_000n).toString();
    short.body.collateral_return!.amount.coin = (returned + ada(1)).toString();
    const error = await expectBuildError(
      builder().finalize(short, {
        inputs: named(built),
        changeAddress: wallet,
      }),
      "INSUFFICIENT_COLLATERAL",
    );
    const details = error.details as { required: bigint; available: bigint };
    expect(details.available).toBe(held - returned - ada(1));
    expect(details.required).toBeGreaterThan(details.available);
  });

  it("looks up no UTxO: one left out of inputs is UTXO_NOT_FOUND", async () => {
    const { built, holder } = await plutusSpend();
    // The provider answers in the Mesh form, as providers do
    const { fetcher } = fakeFetcher(named(built));
    const lookups = jest.spyOn(fetcher, "fetchUTxOs");
    const b = builder({ provider: fetcher });
    const collateralInput = built.collateral!.inputs[0]!;
    const without = (...left: UtxoInput[]) =>
      named(built).filter(
        (u) => !left.some((l) => utxoKeyOf(l) === utxoKeyOf(u)),
      );
    // The collateral input is a spent one's twin here only if they are one UTxO: keep them apart
    expect(utxoKeyOf(collateralInput)).not.toBe(utxoKeyOf(built.inputs[0]!));

    for (const [left, reported] of [
      [[holder], holder],
      [[collateralInput], collateralInput],
      [[collateralInput, built.inputs[0]!], built.inputs[0]!],
    ] as [UtxoInput[], UtxoInput][]) {
      const error = await expectBuildError(
        b.finalize(built.prototype, { inputs: without(...left) }),
        "UTXO_NOT_FOUND",
      );
      expect(error.details).toStrictEqual({
        input: ref(toUtxo(reported)),
      });
    }
    expect(lookups).not.toHaveBeenCalled();

    // A UTxO the body does not name changes nothing
    const extra = await b.finalize(built.prototype, {
      inputs: [...named(built), utxo(lovelace(ada(3)))],
    });
    expect(extra.tx).toBe(built.tx);
  });

  it("drops the key witnesses a prototype carries, and prices only the signers", async () => {
    const built = await payment();
    const edited = underpaid(built);
    const plain = await builder().finalize(edited, {
      inputs: built.inputs,
      changeAddress: wallet,
    });
    const signed = structuredClone(edited);
    signed.witness_set.vkeys = [1, 2, 3].map((i) => ({
      vkey: i.toString(16).padStart(64, "0"),
      signature: i.toString(16).padStart(128, "0"),
    }));
    signed.witness_set.bootstraps = [
      {
        vkey: "33".repeat(32),
        signature: "44".repeat(64),
        chain_code: Array(32).fill(0),
        attributes: [0xa0],
      },
    ];
    const final = await builder().finalize(signed, {
      inputs: built.inputs,
      changeAddress: wallet,
    });
    const witnessSet = Transaction.fromCbor(TxCBOR(final.tx)).witnessSet();
    expect(witnessSet.vkeys()).toBeUndefined();
    expect(witnessSet.bootstraps()).toBeUndefined();
    expect(final.fee).toBe(plain.fee);
    expect(final.tx).toBe(plain.tx);
  });

  it("runs no script: the redeemers keep the units the prototype states", async () => {
    const { built } = await plutusSpend();
    const evaluateTx = jest.fn(async () => {
      throw new Error("not to be called");
    });
    const final = await builder({ evaluator: { evaluateTx } }).finalize(
      built.prototype,
      { inputs: named(built) },
    );
    expect(evaluateTx).not.toHaveBeenCalled();
    expect(final.redeemers.map((r) => r.exUnits)).toEqual(
      built.redeemers.map((r) => r.exUnits),
    );
  });

  it("hashes the cost models of the scripts the transaction runs only", async () => {
    // A key UTxO that holds an unrelated Plutus V2 script, spent beside a V3 spend
    const keyWithScript = utxo(lovelace(ada(20)), {
      script: {
        type: "plutus",
        version: "V2",
        code: alwaysSucceedCbor,
        hash: resolveScriptHash(alwaysSucceedCbor, "V2"),
      },
    });
    const built = await builder().build(
      [
        spend.plutus({
          utxo: locked(3),
          script: plutusScript,
          redeemer: { data: mConStr0([3]) },
        }),
        spend.pubKey({ utxo: keyWithScript }),
      ],
      { payer: payer() },
    );
    const final = await builder().finalize(built.prototype, {
      inputs: named(built),
    });
    expect(final.prototype.body.script_data_hash).toBe(
      built.prototype.body.script_data_hash,
    );
    expect(final.txHash).toBe(built.txHash);
  });

  it("leaves the legacy stake certificates working, with no warning about them", async () => {
    const built = await builder({
      deposits: { drepDeposit: ada(500), govActionDeposit: ada(1000) },
    }).build(
      [
        certificate.legacyStakeRegistration({
          stake: keyHashToRewardAddress(keyHashHex(6), 0),
        }),
        certificate.legacyStakeDeregistration({
          stake: keyHashToRewardAddress(keyHashHex(5), 0),
        }),
      ],
      { payer: payer() },
    );
    expect(built.prototype.body.certs).toHaveLength(2);
    expect(built.warnings).toEqual([]);
  });
});
