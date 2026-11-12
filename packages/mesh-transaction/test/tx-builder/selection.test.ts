import { bech32 } from "bech32";

import {
  Action,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IEvaluator,
  mConStr0,
  Protocol,
  UTxO,
} from "@meshsdk/core";
import {
  Address,
  keyHashToRewardAddress,
  resolvePlutusScriptAddress,
  toTxUnspentOutput,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  BuildOptions,
  BuiltTx,
  output,
  PartsInput,
  referenceInput,
  SelectInputs,
  spend,
  TxBuilder,
  TxBuildError,
  TxBuildErrorCode,
  TxError,
  withdrawal,
} from "../../src/tx-builder";
import { valueSize } from "../../src/tx-builder/fee";
import {
  alwaysSucceedCbor,
  baseAddress,
  keyHashHex,
  mockTokenUnit,
} from "../test-util";

const network = "preprod";
const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const wallet = baseAddress(1);
const recipient = baseAddress(2);
const vault = baseAddress(3);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const protectedUnit = mockTokenUnit(1);
const paidUnit = mockTokenUnit(2);

const hexOf = (address: string) =>
  Address.fromString(address)!.toBytes().toString();
/** The same address on mainnet */
const onMainnet = (address: string) => {
  const bytes = bech32.fromWords(bech32.decode(address, 200).words);
  bytes[0] = bytes[0]! | 0x01;
  return bech32.encode("addr", bech32.toWords(bytes), 200);
};

const ada = (n: number) => BigInt(n) * 1_000_000n;
let nextHash = 0xa00;
/** A UTxO of the wallet; its hash holds letters, so case matters */
const utxo = (
  lovelace: bigint,
  tokens: Record<string, bigint> = {},
  address = wallet,
): UTxO => ({
  input: {
    txHash: (++nextHash).toString(16).padStart(64, "c"),
    outputIndex: 0,
  },
  output: {
    address,
    amount: [
      { unit: "lovelace", quantity: String(lovelace) },
      ...Object.entries(tokens).map(([unit, n]) => ({
        unit,
        quantity: String(n),
      })),
    ],
  },
});
const ref = (u: UTxO) => `${u.input.txHash}#${u.input.outputIndex}`;
const refs = (utxos: readonly UTxO[]) => utxos.map(ref);
const quantityOf = (u: UTxO, unit: string) =>
  BigInt(u.output.amount.find((a) => a.unit === unit)?.quantity ?? 0);

const pay = (lovelace: bigint, tokens: Record<string, bigint> = {}) =>
  output({ address: recipient, value: { lovelace, ...tokens } });

const offline = (
  extra: Partial<ConstructorParameters<typeof TxBuilder>[0]> = {},
) => new TxBuilder({ network, params, ...extra });

const snapshot = (utxos: UTxO[]) => ({ changeAddress: wallet, utxos });

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
const fakeEvaluator = (): IEvaluator => ({
  evaluateTx: async (tx) =>
    (
      Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ?? []
    ).map((r) => ({
      tag: TAGS[r.tag()]!,
      index: Number(r.index()),
      budget: { mem: 1000, steps: 2000 },
    })),
});

const scripted = () => offline({ costModels, evaluator: fakeEvaluator() });

let nextLock = 0;
/** A spend of an always-succeeding script's output, which pays for its transaction */
const scriptSpend = (lovelace = ada(10)) =>
  spend.plutus({
    utxo: {
      input: {
        txHash: (0xe0 + ++nextLock).toString(16).repeat(32),
        outputIndex: 0,
      },
      output: {
        address: scriptAddress,
        amount: [{ unit: "lovelace", quantity: String(lovelace) }],
        plutusData: "d87980",
      },
    },
    script: plutusScript,
    redeemer: { data: mConStr0([]) },
  });

/** A `coinSelection` recording each call, answering with `answer` */
const recording = (
  answer: (...args: Parameters<SelectInputs>) => readonly UTxO[] = (
    _,
    candidates,
  ) => candidates.slice(0, 1),
) => {
  const calls: Parameters<SelectInputs>[] = [];
  const coinSelection: SelectInputs = (need, candidates, context) => {
    calls.push([need, candidates, context]);
    return answer(need, candidates, context);
  };
  return { coinSelection, calls };
};

const outputsAt = (built: BuiltTx, address: string) =>
  built.prototype.body.outputs.filter((o) => o.address === address);
const tokensOf = (outputs: BuiltTx["prototype"]["body"]["outputs"]) => {
  const tokens = new Map<string, bigint>();
  for (const o of outputs)
    for (const [policy, assets] of Object.entries(o.amount.multiasset ?? {}))
      for (const [name, n] of Object.entries(assets))
        tokens.set(
          policy + name,
          (tokens.get(policy + name) ?? 0n) + BigInt(n),
        );
  return tokens;
};
const lovelaceIn = (outputs: BuiltTx["prototype"]["body"]["outputs"]) =>
  outputs.reduce((total, o) => total + BigInt(o.amount.coin), 0n);
const sumOf = (utxos: readonly UTxO[], unit = "lovelace") =>
  utxos.reduce((total, u) => total + quantityOf(u, unit), 0n);

describe("TxBuilder: canSelect", () => {
  it("keeps UTxOs holding a protected token out of the inputs, though they hold the most", async () => {
    const guarded = utxo(ada(100), { [protectedUnit]: 1n, [paidUnit]: 50n });
    const other = utxo(ada(10), { [paidUnit]: 20n });
    const payer = snapshot([utxo(ada(5)), guarded, other]);
    const parts = pay(ada(2), { [paidUnit]: 10n });
    // The largest holder of the token paid is the guarded UTxO
    const unfiltered = await offline().build(parts, { payer });
    expect(refs(unfiltered.selectedInputs)).toContain(ref(guarded));

    const built = await offline().build(parts, {
      payer,
      canSelect: (u) => !u.output.amount.some((a) => a.unit === protectedUnit),
    });
    expect(refs(built.inputs)).not.toContain(ref(guarded));
    expect(refs(built.selectedInputs)).toContain(ref(other));
  });

  it("is asked about UTxO objects when the payer gives CBOR", async () => {
    const guarded = utxo(ada(100), { [protectedUnit]: 1n });
    const other = utxo(ada(10));
    const cborOf = (u: UTxO) => toTxUnspentOutput(u).toCbor().toString();
    const asked: UTxO[] = [];
    const built = await offline().build(pay(ada(2)), {
      payer: { changeAddress: wallet, utxos: [guarded, other].map(cborOf) },
      canSelect: (u) => {
        asked.push(u);
        return !u.output.amount.some((a) => a.unit === protectedUnit);
      },
    });
    expect(asked.map((u) => u.input.txHash)).toEqual(
      [guarded, other].map((u) => u.input.txHash),
    );
    expect(asked.map((u) => u.output.amount)).toEqual(
      [guarded, other].map((u) => u.output.amount),
    );
    expect(refs(built.inputs)).toEqual([ref(other)]);
  });

  it("narrows collateral too, asking once about each UTxO it could let be selected", async () => {
    const small = utxo(ada(5));
    const large = utxo(ada(8));
    const locked = utxo(ada(50), {}, scriptAddress);
    const payer = snapshot([small, large, locked]);
    // Without a filter the smallest UTxO that covers is put up
    const plain = await scripted().build([scriptSpend(), pay(ada(2))], {
      payer,
    });
    expect(refs(plain.collateral!.inputs)).toEqual([ref(small)]);

    const asked: string[] = [];
    const built = await scripted().build([scriptSpend(), pay(ada(2))], {
      payer,
      canSelect: (u) => {
        asked.push(ref(u));
        return ref(u) !== ref(small);
      },
    });
    expect(refs(built.collateral!.inputs)).toEqual([ref(large)]);
    // The script-locked UTxO is not asked about, and no UTxO twice over the evaluation rounds
    expect(asked).toEqual([ref(small), ref(large)]);

    await expectCode(
      () =>
        scripted().build([scriptSpend(), pay(ada(2))], {
          payer,
          canSelect: () => false,
        }),
      "INSUFFICIENT_COLLATERAL",
    );
  });

  it("is INSUFFICIENT_FUNDS when it rejects what a payment needs, counting what it rejected", async () => {
    // A UTxO a part spends is counted as given only, though the filter rejects it
    const spent = utxo(ada(12));
    const payer = snapshot([
      utxo(ada(30)),
      utxo(ada(40)),
      utxo(ada(5)),
      utxo(ada(100), {}, scriptAddress),
      spent,
    ]);
    const error = await expectCode(
      () =>
        offline().build([pay(ada(20)), spend.pubKey({ utxo: spent })], {
          payer,
          canSelect: (u) => quantityOf(u, "lovelace") < ada(10),
        }),
      "INSUFFICIENT_FUNDS",
    );
    expect(error.details.pool).toMatchObject({
      given: 5,
      selectable: 1,
      scriptLocked: 1,
      excludedByFilter: 2,
    });
  });
});

describe("TxBuilder: coinSelection", () => {
  it("selects in place of the built-in choice, from the candidates it is given", async () => {
    const big = utxo(ada(100));
    const tokens = utxo(ada(5), { [paidUnit]: 10n });
    const middle = utxo(ada(30));
    const locked = utxo(ada(500), {}, scriptAddress);
    const spent = utxo(ada(2));
    const read = utxo(ada(200));
    const refused = utxo(ada(300));
    const payer = snapshot([big, tokens, middle, locked, spent, read, refused]);
    const parts = [
      pay(ada(20), { [paidUnit]: 5n }),
      spend.pubKey({ utxo: spent }),
      referenceInput({ utxo: read }),
    ];
    const canSelect = (u: UTxO) => ref(u) !== ref(refused);

    // The built-in choice takes the token holder and then the largest plain UTxO
    const builtIn = await offline().build(parts, { payer, canSelect });
    expect(refs(builtIn.selectedInputs)).toEqual(refs([tokens, big]));

    // One candidate named twice is taken once
    const { coinSelection, calls } = recording((_, candidates) => [
      candidates[1]!,
      candidates[2]!,
      candidates[2]!,
    ]);
    const built = await offline().build(parts, {
      payer,
      canSelect,
      coinSelection,
    });
    expect(refs(built.selectedInputs)).toEqual(refs([tokens, middle]));
    expect(calls).toHaveLength(1);
    const [need, candidates, context] = calls[0]!;
    // The output less the spent UTxO, before any fee
    expect(need.lovelace).toBe(ada(18));
    expect(Array.from(need.assets)).toEqual([[paidUnit, 5n]]);
    expect(refs(candidates)).toEqual(refs([big, tokens, middle]));
    expect(context).toEqual({ round: 0, selected: [], fee: 0n, params });
  });

  it("matches the out refs it returns whatever the case of their hash", async () => {
    const [a, b] = [utxo(ada(5)), utxo(ada(10))];
    const built = await offline().build(pay(ada(2)), {
      payer: snapshot([a, b]),
      coinSelection: (_, candidates) => [
        {
          ...candidates[1]!,
          input: {
            ...candidates[1]!.input,
            txHash: candidates[1]!.input.txHash.toUpperCase(),
          },
        },
      ],
    });
    expect(built.selectedInputs).toEqual([b]);
    expect(built.selectedInputs[0]!.input.txHash).toBe(b.input.txHash);
  });

  it("is called again while something is missing, with what it picked as selected", async () => {
    const [a, b, c] = [utxo(ada(5)), utxo(ada(10)), utxo(ada(20))];
    const { coinSelection, calls } = recording();
    const built = await offline().build(pay(ada(12)), {
      payer: snapshot([a, b, c]),
      coinSelection,
    });
    expect(refs(built.selectedInputs)).toEqual(refs([a, b]));
    expect(calls).toHaveLength(2);
    const [, candidates, context] = calls[1]!;
    expect(refs(context.selected)).toEqual(refs([a]));
    expect(refs(candidates)).toEqual(refs([b, c]));
    expect(calls.map(([, , ctx]) => ctx.round)).toEqual([0, 1]);
  });

  it("is INVALID_SELECTION for a UTxO that is not a candidate", async () => {
    const [a, b] = [utxo(ada(5)), utxo(ada(10))];
    const locked = utxo(ada(50), {}, scriptAddress);
    const refused = utxo(ada(40));
    const payer = snapshot([a, b, locked, refused]);
    const canSelect = (u: UTxO) => ref(u) !== ref(refused);
    const foreign = utxo(ada(1000));
    let first = true;
    const cases: [string, SelectInputs, UTxO][] = [
      ["foreign", () => [foreign], foreign],
      ["script-locked", () => [locked], locked],
      ["rejected by canSelect", () => [refused], refused],
      [
        "already selected",
        () => {
          const answer = first ? [a] : [b, a];
          first = false;
          return answer;
        },
        a,
      ],
    ];
    for (const [, coinSelection, named] of cases) {
      const error = await expectCode(
        () =>
          offline().build(pay(ada(12)), { payer, canSelect, coinSelection }),
        "INVALID_SELECTION",
      );
      expect(error.details.utxo).toEqual(named.input);
      expect(error.retryable).toBe(false);
    }
  });

  it("is INVALID_OPTION when it answers with something that is not a list of UTxOs", async () => {
    const error = await expectCode(
      () =>
        offline().build(pay(ada(2)), {
          payer: snapshot([utxo(ada(50))]),
          coinSelection: (() => undefined) as unknown as SelectInputs,
        }),
      "INVALID_OPTION",
    );
    expect(error.details.option).toBe("coinSelection");
    const entry = await expectCode(
      () =>
        offline().build(pay(ada(2)), {
          payer: snapshot([utxo(ada(50))]),
          coinSelection: (() => [{}]) as unknown as SelectInputs,
        }),
      "INVALID_OPTION",
    );
    expect(entry.details.value).toEqual({});
  });

  it("lets what canSelect or coinSelection throws out of build as it is", async () => {
    const payer = snapshot([utxo(ada(50))]);
    const thrown = new Error("refused by the application");
    for (const options of [
      {
        canSelect: () => {
          throw thrown;
        },
      },
      {
        coinSelection: () => {
          throw thrown;
        },
      },
    ] as BuildOptions[])
      expect(
        await caught(() => offline().build(pay(ada(2)), { payer, ...options })),
      ).toBe(thrown);
  });

  it("is INSUFFICIENT_FUNDS when it answers a need with nothing", async () => {
    const error = await expectCode(
      () =>
        offline().build(pay(ada(2)), {
          payer: snapshot([utxo(ada(50))]),
          coinSelection: () => [],
        }),
      "INSUFFICIENT_FUNDS",
    );
    expect(error.message).toMatch(/coinSelection selected nothing/);
    // What it was asked for, against what the transaction holds: not the UTxOs it left
    expect(error.details).toMatchObject({
      unit: "lovelace",
      missing: ada(2),
      required: ada(2),
      available: 0n,
      reason: "payment",
    });

    // A second call answered with nothing: the first pick is what the transaction holds
    const small = utxo(ada(1));
    let calls = 0;
    const later = await expectCode(
      () =>
        offline().build(pay(ada(2)), {
          payer: snapshot([small, utxo(ada(50))]),
          coinSelection: () => (calls++ === 0 ? [small] : []),
        }),
      "INSUFFICIENT_FUNDS",
    );
    expect(later.details).toMatchObject({
      missing: ada(1),
      required: ada(2),
      available: ada(1),
      reason: "payment",
    });
  });

  it("leaves change and collateral to the builder", async () => {
    const small = utxo(ada(5));
    const large = utxo(ada(40));
    const { coinSelection, calls } = recording(() => [large]);
    const built = await scripted().build([scriptSpend(), pay(ada(30))], {
      payer: snapshot([small, large]),
      coinSelection,
    });
    expect(refs(built.selectedInputs)).toEqual([ref(large)]);
    expect(refs(built.collateral!.inputs)).toEqual([ref(small)]);
    expect(built.collateral!.return!.address).toBe(wallet);
    expect(built.change.map((o) => o.output.address)).toEqual([wallet]);
    // Once per pass, for the payment only: collateral is never asked for
    expect(calls.length).toBeGreaterThan(0);
    for (const [need, , context] of calls) {
      expect(context.selected).toEqual([]);
      expect(need.lovelace).toBeLessThanOrEqual(ada(20) + context.fee);
    }
  });

  it("is asked for one lovelace when nothing is missing and the transaction has no input", async () => {
    const stake = keyHashToRewardAddress(keyHashHex(5), 0);
    const [a, b] = [utxo(ada(5)), utxo(ada(7))];
    const { coinSelection, calls } = recording((_, candidates) => [
      candidates[1]!,
    ]);
    const built = await offline().build(
      [
        withdrawal.pubKey({ rewardAddress: stake, amount: ada(10) }),
        pay(ada(2)),
      ],
      { payer: snapshot([a, b]), coinSelection },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]![0].lovelace).toBe(1n);
    expect(calls[0]![0].assets.size).toBe(0);
    expect(refs(built.inputs)).toEqual([ref(b)]);
  });

  it("is not called with no candidate left: INSUFFICIENT_FUNDS", async () => {
    const [a, b] = [utxo(ada(1)), utxo(ada(2))];
    const { coinSelection, calls } = recording();
    await expectCode(
      () =>
        offline().build(
          [pay(ada(5)), spend.pubKey({ utxo: a }), spend.pubKey({ utxo: b })],
          { payer: snapshot([a, b]), coinSelection },
        ),
      "INSUFFICIENT_FUNDS",
    );
    expect(calls).toEqual([]);
  });
});

describe("TxBuilder: sendAllTo", () => {
  const funds = () => [
    utxo(ada(10)),
    utxo(ada(20), { [paidUnit]: 7n }),
    utxo(ada(3), { [protectedUnit]: 1n }),
  ];

  it("sends every selectable UTxO, less the fee, to the address, nothing to the payer", async () => {
    const utxos = funds();
    const built = await offline().build([], {
      payer: snapshot(utxos),
      sendAllTo: vault,
    });
    expect(refs(built.selectedInputs)).toEqual(refs(utxos));
    const swept = outputsAt(built, vault);
    expect(swept.length).toBe(built.prototype.body.outputs.length);
    expect(outputsAt(built, wallet)).toEqual([]);
    expect(lovelaceIn(swept)).toBe(sumOf(utxos) - built.fee);
    expect(tokensOf(swept)).toEqual(
      new Map([
        [paidUnit, 7n],
        [protectedUnit, 1n],
      ]),
    );
  });

  it("pays the parts' outputs first, and returns collateral to the payer", async () => {
    const utxos = funds();
    const built = await scripted().build([pay(ada(4)), scriptSpend()], {
      payer: snapshot(utxos),
      sendAllTo: vault,
    });
    const { outputs } = built.prototype.body;
    expect(outputs[0]!.address).toBe(recipient);
    expect(outputs.slice(1).every((o) => o.address === vault)).toBe(true);
    expect(lovelaceIn(outputs.slice(1))).toBe(
      sumOf(utxos) + ada(10) - ada(4) - built.fee,
    );
    // Collateral comes from what is swept; its return goes to the payer
    expect(refs(utxos)).toEqual(
      expect.arrayContaining(refs(built.collateral!.inputs)),
    );
    expect(built.collateral!.return!.address).toBe(wallet);
  });

  it("splits tokens that exceed maxValSize over several outputs", async () => {
    const units = Array.from({ length: 30 }, (_, i) => mockTokenUnit(i + 1));
    const small = { ...params, maxValSize: 400 };
    const utxos = [0, 1, 2].map((k) =>
      utxo(
        ada(50),
        Object.fromEntries(
          units.filter((_, i) => i % 3 === k).map((unit) => [unit, 5n]),
        ),
      ),
    );
    const built = await new TxBuilder({ network, params: small }).build([], {
      payer: snapshot(utxos),
      sendAllTo: vault,
    });
    const swept = outputsAt(built, vault);
    expect(swept.length).toBeGreaterThan(1);
    for (const o of swept) expect(valueSize(o.amount)).toBeLessThanOrEqual(400);
    expect(tokensOf(swept)).toEqual(new Map(units.map((u) => [u, 5n])));
  });

  it("sweeps only what canSelect lets it, never a script-locked UTxO", async () => {
    const [kept, guarded] = [
      utxo(ada(10)),
      utxo(ada(5), { [protectedUnit]: 1n }),
    ];
    const locked = utxo(ada(50), {}, scriptAddress);
    const built = await offline().build([], {
      payer: snapshot([kept, guarded, locked]),
      sendAllTo: vault,
      canSelect: (u) => quantityOf(u, protectedUnit) === 0n,
    });
    expect(refs(built.inputs)).toEqual([ref(kept)]);
  });

  it("takes the address in hex, and checks its network", async () => {
    const payer = snapshot(funds());
    const bech32 = await offline().build([], { payer, sendAllTo: vault });
    const hex = await offline().build([], { payer, sendAllTo: hexOf(vault) });
    expect(hex.tx).toBe(bech32.tx);
    const error = await expectCode(
      () => offline().build([], { payer, sendAllTo: onMainnet(vault) }),
      "NETWORK_MISMATCH",
    );
    expect(error.details.found.map((f) => f.role)).toEqual(["output"]);
  });

  it("is INSUFFICIENT_FUNDS with nothing to spend", async () => {
    const cases: BuildOptions[] = [
      { payer: snapshot([]) },
      { payer: snapshot([utxo(ada(50), {}, scriptAddress)]) },
      { payer: snapshot(funds()), canSelect: () => false },
    ];
    for (const options of cases)
      await expectCode(
        () => offline().build([], { ...options, sendAllTo: vault }),
        "INSUFFICIENT_FUNDS",
      );
  });

  it("is INSUFFICIENT_FUNDS when what is left is less than the swept output needs", async () => {
    const options: BuildOptions[] = [
      { payer: snapshot([utxo(1_500_000n)]) },
      { payer: snapshot([utxo(1_500_000n)]), coinSelection: () => [] },
    ];
    for (const option of options) {
      const error = await expectCode(
        () => offline().build(pay(ada(1)), { ...option, sendAllTo: vault }),
        "INSUFFICIENT_FUNDS",
      );
      expect(error.details.unit).toBe("lovelace");
      expect(error.details.missing).toBeGreaterThan(0n);
      expect(error.details.available).toBe(1_500_000n);
    }
  });

  it("sweeps a UTxO the payer lists twice once", async () => {
    const [a, b] = [utxo(ada(10)), utxo(ada(20))];
    const asked: string[] = [];
    const built = await offline().build([], {
      payer: snapshot([a, a, b]),
      sendAllTo: vault,
      canSelect: (u) => {
        asked.push(ref(u));
        return true;
      },
    });
    expect(refs(built.selectedInputs)).toEqual(refs([a, b]));
    expect(asked).toEqual(refs([a, b]));
    expect(lovelaceIn(outputsAt(built, vault))).toBe(ada(30) - built.fee);

    // The built-in selection takes it once too, going on to the next UTxO
    const paid = await offline().build(pay(ada(21)), {
      payer: snapshot([a, b, b]),
    });
    expect(refs(paid.selectedInputs)).toEqual(refs([b, a]));
  });

  it("lists the swept outputs as change only when they go to the payer's change address", async () => {
    const payer = snapshot(funds());
    for (const sendAllTo of [wallet, hexOf(wallet)]) {
      const built = await offline().build([], { payer, sendAllTo });
      expect(built.change.length).toBeGreaterThan(0);
      expect(built.change).toEqual(built.outputs);
      for (const o of built.change) {
        expect(o.change).toBe(true);
        expect(o.output.address).toBe(wallet);
      }
    }
    const elsewhere = await offline().build([], { payer, sendAllTo: vault });
    expect(elsewhere.change).toEqual([]);
    expect(outputsAt(elsewhere, vault).length).toBeGreaterThan(0);
  });

  it("builds the same with coinSelection, which is not called", async () => {
    const payer = snapshot(funds());
    const parts: PartsInput = [pay(ada(4))];
    const without = await offline().build(parts, { payer, sendAllTo: vault });
    const { coinSelection, calls } = recording();
    const withIt = await offline().build(parts, {
      payer,
      sendAllTo: vault,
      coinSelection,
    });
    expect(withIt.tx).toBe(without.tx);
    expect(calls).toEqual([]);
  });
});
