import { bech32 } from "bech32";

import {
  Action,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IEvaluator,
  IFetcher,
  mConStr0,
  Protocol,
} from "@meshsdk/core";
import {
  Address,
  CborReader,
  resolvePlutusScriptAddress,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  BuildOptions,
  collateral,
  collateralReturn,
  output,
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
import { asCbor, asMesh } from "./utxo-util";

const network = "preprod";
const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const wallet = baseAddress(1);
const recipient = baseAddress(2);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);

const unitInline: OutputDatum = {
  type: "inline",
  data: { type: "CBOR", content: "d87980" },
};
const hexOf = (address: string) =>
  Address.fromString(address)!.toBytes().toString();
/** The same address on mainnet */
const onMainnet = (address: string) => {
  const bytes = bech32.fromWords(bech32.decode(address, 200).words);
  bytes[0] = bytes[0]! | 0x01;
  return bech32.encode("addr", bech32.toWords(bytes), 200);
};

const ada = (n: number) => BigInt(n) * 1_000_000n;
let nextHash = 0xb00;
/** A UTxO of the wallet; its hash holds letters, so case matters */
const utxo = (lovelace: bigint, address = wallet): Utxo => ({
  txHash: (++nextHash).toString(16).padStart(64, "d"),
  outputIndex: 0,
  address,
  value: { lovelace },
});
/** `txHash#index` of a UTxO */
const keyOf = (u: Utxo) => `${u.txHash}#${u.outputIndex}`;
const keysOf = (utxos: readonly Utxo[]) => utxos.map(keyOf);
/** The lovelace an amount of `getCollateral` asks for: the CBOR of an unsigned integer */
const lovelaceOf = (amount: string) => new CborReader(amount).readInt();

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

const scripted = () =>
  new TxBuilder({ network, params, costModels, evaluator: fakeEvaluator() });

let nextLock = 0;
/** A spend of an always-succeeding script's output, which pays for its transaction */
const scriptSpend = (lovelace = ada(10)) =>
  spend.plutus({
    utxo: {
      txHash: (0xc0 + ++nextLock).toString(16).repeat(32),
      outputIndex: 0,
      address: scriptAddress,
      value: { lovelace: lovelace },
      datum: unitInline,
    },
    script: plutusScript,
    redeemer: { data: mConStr0([]) },
  });

/** Too small to be collateral: less than any fee calls for */
const dust = utxo(100_000n);
/** What the wallet puts up when asked */
const reserve = utxo(ada(5));

/**
 * A CIP-30 api: its change address in hex, its UTxOs as CBOR, and the collateral methods given
 */
const cip30 = (
  utxos: Utxo[],
  methods: {
    getCollateral?: jest.Mock;
    experimental?: { getCollateral?: jest.Mock };
  } = {},
) => ({
  getNetworkId: jest.fn(async () => 0),
  getChangeAddress: jest.fn(async () => hexOf(wallet)),
  getUtxos: jest.fn(async () => utxos.map(asCbor)),
  signTx: jest.fn(async () => "a0"),
  ...methods,
});

/** A `getCollateral` answering with this */
const answering = (answer: unknown) =>
  jest.fn(async (_: { amount: string }) => answer as string[]);

describe("TxBuilder: the collateral fallback", () => {
  it("asks a CIP-30 payer once, for the collateral the transaction calls for, and puts up its answer", async () => {
    const getCollateral = answering([asCbor(reserve)]);
    const built = await scripted().build([scriptSpend()], {
      payer: cip30([dust], { getCollateral }),
    });

    expect(getCollateral).toHaveBeenCalledTimes(1);
    const [[{ amount }]] = getCollateral.mock.calls as [[{ amount: string }]];
    expect(amount).toMatch(/^[0-9a-f]+$/);
    const asked = lovelaceOf(amount);
    expect(asked).toBeGreaterThan(0n);
    expect(asked).toBeGreaterThanOrEqual(built.collateral!.total);
    // The answer alone: the payer's own UTxO, too small to cover, is not joined to it
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(reserve)]);
    expect(keysOf(built.selectedInputs)).not.toContain(keyOf(reserve));
    expect(keysOf(built.inputs)).not.toContain(keyOf(reserve));
    expect(built.prototype.body.collateral).toEqual([
      { transaction_id: reserve.txHash, index: 0 },
    ]);
  });

  it("adds nothing of the answer to what payment may select", async () => {
    // The payer can pay but holds no collateral: 80 UTxOs, any three of them short of it
    const small = Array.from({ length: 80 }, () => utxo(100_000n));
    const getCollateral = answering([asCbor(reserve)]);
    const built = await scripted().build(
      [
        scriptSpend(ada(2)),
        output({ address: recipient, value: { lovelace: ada(3) } }),
      ],
      { payer: cip30(small, { getCollateral }) },
    );
    expect(getCollateral).toHaveBeenCalledTimes(1);
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(reserve)]);
    // The built-in selection takes the largest first, so the answer would be taken if it could
    expect(built.selectedInputs.length).toBeGreaterThan(0);
    expect(
      keysOf(built.selectedInputs).every((r) => keysOf(small).includes(r)),
    ).toBe(true);
    expect(keysOf(built.inputs)).not.toContain(keyOf(reserve));
  });

  it("gives the UTxOs of the answer to the evaluation that follows the call", async () => {
    const calls: { before: boolean; utxos: string[] }[] = [];
    let asked = false;
    const getCollateral = jest.fn(async (_: { amount: string }) => {
      asked = true;
      return [asCbor(reserve)];
    });
    const recording: IEvaluator = {
      acceptsKnownUtxos: true,
      evaluateTx: async (tx, utxos = []) => {
        calls.push({
          before: !asked,
          utxos: utxos.map((u) => `${u.input.txHash}#${u.input.outputIndex}`),
        });
        return fakeEvaluator().evaluateTx(tx, utxos, []);
      },
    };
    const built = await new TxBuilder({
      network,
      params,
      costModels,
      evaluator: recording,
    }).build([scriptSpend()], { payer: cip30([dust], { getCollateral }) });
    expect(getCollateral).toHaveBeenCalledTimes(1);
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(reserve)]);
    const after = calls.filter((c) => !c.before);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]!.utxos).toContain(keyOf(reserve));
  });

  it("never puts up a UTxO of the answer that a transaction of after spends", async () => {
    const spentReserve = utxo(ada(5));
    // Spends spentReserve and leaves the payer no change
    const tx1 = await scripted().build([], {
      payer: { changeAddress: wallet, utxos: [spentReserve] },
      sendAllTo: recipient,
    });
    expect(keysOf(tx1.inputs)).toEqual([keyOf(spentReserve)]);

    const built = await scripted().build([scriptSpend()], {
      payer: cip30([dust], {
        getCollateral: answering([asCbor(spentReserve), asCbor(reserve)]),
      }),
      after: tx1,
    });
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(reserve)]);

    await expectCode(
      () =>
        scripted().build([scriptSpend()], {
          payer: cip30([dust], {
            getCollateral: answering([asCbor(spentReserve)]),
          }),
          after: tx1,
        }),
      "INSUFFICIENT_COLLATERAL",
    );
  });

  it("takes collateral from the answer alone, never joined with the payer's UTxOs", async () => {
    // Each is short of the collateral; the two together would cover it
    const own = utxo(200_000n);
    const given = utxo(200_000n);
    const getCollateral = answering([asCbor(given)]);
    const error = await expectCode(
      () =>
        scripted().build([scriptSpend()], {
          payer: cip30([own], { getCollateral }),
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(getCollateral).toHaveBeenCalledTimes(1);
    expect(error.details.available).toBe(200_000n);
    expect(error.details.required).toBeGreaterThan(200_000n);
    expect(error.details.required).toBeLessThan(400_000n);
  });

  it("judges a later round against the answer, without a second call", async () => {
    // The second evaluation needs more, so the collateral grows past what the wallet gave
    let evaluations = 0;
    const growing: IEvaluator = {
      evaluateTx: async (tx) => {
        const budget =
          ++evaluations === 1
            ? { mem: 1000, steps: 2000 }
            : { mem: 4_000_000, steps: 2_000_000_000 };
        return (
          Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ??
          []
        ).map((r) => ({
          tag: TAGS[r.tag()]!,
          index: Number(r.index()),
          budget,
        }));
      },
    };
    const getCollateral = answering([asCbor(utxo(400_000n))]);
    const error = await expectCode(
      () =>
        new TxBuilder({
          network,
          params,
          costModels,
          evaluator: growing,
        }).build([scriptSpend()], { payer: cip30([dust], { getCollateral }) }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(evaluations).toBe(2);
    expect(getCollateral).toHaveBeenCalledTimes(1);
    expect(error.details.required).toBeGreaterThan(400_000n);
  });

  it("asks for the total a collateral return part states", async () => {
    const getCollateral = answering([asCbor(reserve)]);
    const built = await scripted().build(
      [
        scriptSpend(),
        collateralReturn({ address: wallet, totalCollateral: ada(2) }),
      ],
      { payer: cip30([dust], { getCollateral }) },
    );
    expect(getCollateral).toHaveBeenCalledTimes(1);
    const [[{ amount }]] = getCollateral.mock.calls as [[{ amount: string }]];
    expect(amount).toBe("1a001e8480");
    expect(lovelaceOf(amount)).toBe(ada(2));
    expect(built.collateral!.total).toBe(ada(2));
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(reserve)]);
  });

  it("asks for the collateral of the fee option when one is given", async () => {
    const getCollateral = answering([asCbor(reserve)]);
    const fee = ada(1);
    await scripted().build([scriptSpend()], {
      payer: cip30([dust], { getCollateral }),
      fee,
    });
    const [[{ amount }]] = getCollateral.mock.calls as [[{ amount: string }]];
    expect(lovelaceOf(amount)).toBe(
      (fee * BigInt(params.collateralPercent) + 99n) / 100n,
    );
  });

  it("calls experimental.getCollateral only when the api has no getCollateral", async () => {
    const experimental = answering([asCbor(reserve)]);
    const built = await scripted().build([scriptSpend()], {
      payer: cip30([dust], { experimental: { getCollateral: experimental } }),
    });
    expect(experimental).toHaveBeenCalledTimes(1);
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(reserve)]);

    const top = answering([asCbor(reserve)]);
    const nested = answering([asCbor(reserve)]);
    await scripted().build([scriptSpend()], {
      payer: cip30([dust], {
        getCollateral: top,
        experimental: { getCollateral: nested },
      }),
    });
    expect(top).toHaveBeenCalledTimes(1);
    expect(nested).not.toHaveBeenCalled();
  });

  const refusals: {
    answer: string;
    method: () => jest.Mock;
    parts?: PartsInput;
    options?: BuildOptions;
  }[] = [
    { answer: "null", method: () => answering(null) },
    { answer: "undefined", method: () => answering(undefined) },
    { answer: "[]", method: () => answering([]) },
    {
      answer: "UTxOs worth less than required",
      method: () => answering([asCbor(dust)]),
    },
    {
      answer: "UTxOs the filter rejects",
      method: () => answering([asCbor(reserve)]),
      options: { canSelect: () => false },
    },
    {
      answer: "UTxOs a part reads",
      method: () => answering([asCbor(reserve)]),
      parts: [scriptSpend(), referenceInput({ utxo: reserve })],
    },
    {
      answer: "a script-locked UTxO",
      method: () => answering([asCbor(utxo(ada(5), scriptAddress))]),
    },
  ];

  it.each(refusals)(
    "is INSUFFICIENT_COLLATERAL for an answer of $answer, after one call",
    async ({ method, parts, options }) => {
      const getCollateral = method();
      const error = await expectCode(
        () =>
          scripted().build(parts ?? [scriptSpend()], {
            payer: cip30([dust], { getCollateral }),
            ...options,
          }),
        "INSUFFICIENT_COLLATERAL",
      );
      expect(getCollateral).toHaveBeenCalledTimes(1);
      expect(error.retryable).toBe(false);
      expect(error.cause).toBeUndefined();
    },
  );

  it("refuses with the asked amount when the answer holds nothing usable", async () => {
    const getCollateral = answering([]);
    const error = await expectCode(
      () =>
        scripted().build([scriptSpend()], {
          payer: cip30([dust], { getCollateral }),
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    const [[{ amount }]] = getCollateral.mock.calls as [[{ amount: string }]];
    expect(error.details).toEqual({
      required: lovelaceOf(amount),
      available: 0n,
    });
  });

  it("is INSUFFICIENT_COLLATERAL with the decoding error as cause for an answer it cannot decode", async () => {
    for (const answer of [["84a400"], { utxos: [] }]) {
      const getCollateral = answering(answer);
      const error = await expectCode(
        () =>
          scripted().build([scriptSpend()], {
            payer: cip30([dust], { getCollateral }),
          }),
        "INSUFFICIENT_COLLATERAL",
      );
      expect(error.cause).toBeInstanceOf(Error);
      expect(getCollateral).toHaveBeenCalledTimes(1);
    }
  });

  it("is INSUFFICIENT_COLLATERAL with the wallet's error as cause, never WALLET_FAILED", async () => {
    const rejection = { code: -2, info: "the user declined" };
    const getCollateral = jest.fn(async (): Promise<string[]> => {
      throw rejection;
    });
    const error = await expectCode(
      () =>
        scripted().build([scriptSpend()], {
          payer: cip30([dust], { getCollateral }),
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(error.cause).toBe(rejection);
    expect(getCollateral).toHaveBeenCalledTimes(1);

    // A synchronous throw is the same
    const throwing = jest.fn((): Promise<string[]> => {
      throw rejection;
    });
    const sync = await expectCode(
      () =>
        scripted().build([scriptSpend()], {
          payer: cip30([dust], { getCollateral: throwing }),
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(sync.cause).toBe(rejection);
  });

  it("is INSUFFICIENT_COLLATERAL for an answer that names one out ref with different contents, in either order; takes the same UTxO given again as one", async () => {
    const more = { ...reserve, value: { lovelace: ada(50) } };
    // Two texts of CBOR are not read to be compared: they name it in different bytes
    for (const [answer, how] of [
      [[asCbor(reserve), asCbor(more)], "in different bytes"],
      [[asMesh(more), asCbor(reserve)], "and differ"],
    ] as const) {
      const getCollateral = answering(answer);
      const error = await expectCode(
        () =>
          scripted().build([scriptSpend()], {
            payer: cip30([dust], { getCollateral }),
          }),
        "INSUFFICIENT_COLLATERAL",
      );
      expect(error.message).toContain(
        `two entries name the output ${keyOf(reserve)} ${how}`,
      );
    }
    const getCollateral = answering([
      asCbor(reserve),
      asMesh(reserve),
      asCbor(reserve),
    ]);
    const built = await scripted().build([scriptSpend()], {
      payer: cip30([dust], { getCollateral }),
    });
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(reserve)]);
  });

  it("is NETWORK_MISMATCH for a UTxO of another network in the answer", async () => {
    const getCollateral = answering([asCbor(utxo(ada(5), onMainnet(wallet)))]);
    const error = await expectCode(
      () =>
        scripted().build([scriptSpend()], {
          payer: cip30([dust], { getCollateral }),
        }),
      "NETWORK_MISMATCH",
    );
    expect(error.details.found.map((f) => f.role)).toEqual(["utxo"]);
    expect(getCollateral).toHaveBeenCalledTimes(1);
  });

  it("asks the filter about the UTxOs of the answer and puts up only those it lets", async () => {
    const other = utxo(ada(6));
    const getCollateral = answering([asCbor(reserve), asCbor(other)]);
    const asked: string[] = [];
    const built = await scripted().build([scriptSpend()], {
      payer: cip30([dust], { getCollateral }),
      canSelect: (u) => {
        asked.push(keyOf(u));
        return keyOf(u) !== keyOf(reserve);
      },
    });
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(other)]);
    expect(asked.filter((r) => r === keyOf(reserve))).toHaveLength(1);
  });

  it("does not call when the payer's UTxOs cover the collateral", async () => {
    const getCollateral = answering([asCbor(reserve)]);
    const own = utxo(ada(3));
    const built = await scripted().build([scriptSpend()], {
      payer: cip30([own], { getCollateral }),
    });
    expect(getCollateral).not.toHaveBeenCalled();
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(own)]);
  });

  it("does not call when no Plutus script runs", async () => {
    const getCollateral = answering([asCbor(reserve)]);
    const built = await scripted().build(
      output({ address: recipient, value: { lovelace: ada(2) } }),
      { payer: cip30([utxo(ada(10))], { getCollateral }) },
    );
    expect(getCollateral).not.toHaveBeenCalled();
    expect(built.collateral).toBeUndefined();
  });

  it("does not call a wallet that answers its change address in bech32", async () => {
    const getCollateral = answering([asCbor(reserve)]);
    const meshFormat = {
      getNetworkId: async () => 0,
      getChangeAddress: async () => wallet,
      getUtxos: async () => [asMesh(dust)],
      getCollateral,
    };
    await expectCode(
      () => scripted().build([scriptSpend()], { payer: meshFormat }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(getCollateral).not.toHaveBeenCalled();
  });

  it("does not call when collateral parts are given, fall short and are not topped up", async () => {
    const getCollateral = answering([asCbor(reserve)]);
    await expectCode(
      () =>
        scripted().build([scriptSpend(), collateral({ utxo: dust })], {
          payer: cip30([dust], { getCollateral }),
          topUpCollateral: false,
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(getCollateral).not.toHaveBeenCalled();
  });

  it("does not call when the given collateral inputs fill maxCollateralInputs and fall short", async () => {
    const getCollateral = answering([asCbor(reserve)]);
    const given = [utxo(50_000n), utxo(50_000n), utxo(50_000n)];
    const error = await expectCode(
      () =>
        scripted().build(
          [scriptSpend(), ...given.map((u) => collateral({ utxo: u }))],
          { payer: cip30(given, { getCollateral }) },
        ),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(error.message).toContain(
      "and no input can be added to them: a transaction puts up at most 3",
    );
    expect(error.details.available).toBe(150_000n);
    expect(getCollateral).not.toHaveBeenCalled();
  });

  it("asks when the payer's only UTxO holds a stated total but leaves too little to return", async () => {
    // 0.5 ADA cannot be an output, and a stated total is not forfeited
    const only = utxo(3_500_000n);
    const getCollateral = answering([asCbor(reserve)]);
    const built = await scripted().build(
      [
        scriptSpend(),
        collateralReturn({ address: wallet, totalCollateral: ada(3) }),
      ],
      { payer: cip30([only], { getCollateral }) },
    );
    expect(getCollateral).toHaveBeenCalledTimes(1);
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(reserve)]);
    expect(built.collateral!.total).toBe(ada(3));
    expect(built.collateral!.return!.value).toEqual({ lovelace: ada(2) });
  });

  it("tops up given collateral from the answer, asking once for the whole collateral", async () => {
    const own = utxo(100_000n);
    const getCollateral = answering([asCbor(reserve)]);
    const built = await scripted().build(
      [scriptSpend(), collateral({ utxo: own, label: "own" })],
      { payer: cip30([own], { getCollateral }) },
    );
    expect(getCollateral).toHaveBeenCalledTimes(1);
    const [[{ amount }]] = getCollateral.mock.calls as [[{ amount: string }]];
    // The whole collateral, not what the given input leaves missing
    expect(lovelaceOf(amount)).toBeGreaterThanOrEqual(built.collateral!.total);
    expect(keysOf(built.collateral!.inputs)).toEqual([
      keyOf(own),
      keyOf(reserve),
    ]);
    expect(built.collateral!.return!.value.lovelace).toBe(
      100_000n + reserve.value.lovelace - built.collateral!.total,
    );
    expect(
      built.parts.flatMap((p) => (p.kind === "collateral" ? [p.label] : [])),
    ).toEqual(["own", undefined]);
  });

  it("is INSUFFICIENT_COLLATERAL for an answer that names an output the payer's UTxOs hold with other contents: one payer's lists are one list", async () => {
    const token = { [`${"33".repeat(28)}41`]: 1n };
    // The payer lists X as dust, and the wallet would put it up as 5 ada
    const x = utxo(100_000n);
    // The payer spends Y with a token, and the wallet would put it up without, with no return
    const y = { ...utxo(ada(30)), value: { lovelace: ada(30), ...token } };
    const cases: [Utxo, Utxo, PartsInput, BuildOptions][] = [
      [x, { ...x, value: { lovelace: ada(5) } }, [scriptSpend()], {}],
      [
        y,
        { ...y, value: { lovelace: ada(30) } },
        [
          scriptSpend(ada(2)),
          output({ address: recipient, value: { lovelace: ada(20) } }),
        ],
        { collateralReturn: false },
      ],
    ];
    for (const [held, answered, parts, options] of cases)
      for (const form of [asCbor, asMesh]) {
        const getCollateral = answering([form(answered)]);
        const error = await expectCode(
          () =>
            scripted().build(parts, {
              ...options,
              payer: cip30([held], { getCollateral }),
            }),
          "INSUFFICIENT_COLLATERAL",
        );
        expect(getCollateral).toHaveBeenCalledTimes(1);
        expect(error.message).toBe(
          `the payer's UTxOs cannot cover the collateral, and the wallet's getCollateral names the output ${keyOf(held)} as the payer's UTxOs do, and they differ`,
        );
      }
    // The same UTxO in both is one
    const getCollateral = answering([asMesh(dust), asCbor(reserve)]);
    const built = await scripted().build([scriptSpend()], {
      payer: cip30([dust], { getCollateral }),
    });
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(reserve)]);
  });

  it("adds the given UTxO once when the answer holds it too", async () => {
    const own = utxo(100_000n);
    const getCollateral = answering([asCbor(own), asCbor(reserve)]);
    const built = await scripted().build(
      [scriptSpend(), collateral({ utxo: own })],
      { payer: cip30([own], { getCollateral }) },
    );
    expect(keysOf(built.collateral!.inputs)).toEqual([
      keyOf(own),
      keyOf(reserve),
    ]);
  });

  it("is INSUFFICIENT_COLLATERAL with the wallet's error as cause and the given inputs counted, when it fails while topping up", async () => {
    const own = utxo(100_000n);
    const rejection = { code: -2, info: "the user declined" };
    const getCollateral = jest.fn(async (): Promise<string[]> => {
      throw rejection;
    });
    const error = await expectCode(
      () =>
        scripted().build([scriptSpend(), collateral({ utxo: own })], {
          payer: cip30([own], { getCollateral }),
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(getCollateral).toHaveBeenCalledTimes(1);
    expect(error.cause).toBe(rejection);
    expect(error.details.available).toBe(100_000n);
    expect(error.details.required).toBeGreaterThan(100_000n);
    expect(error.message).toContain(
      "the given collateral inputs and the payer's UTxOs cannot cover the collateral",
    );

    // An answer that does not cover either: the given input and the answer are counted
    const short = utxo(100_000n);
    const both = await expectCode(
      () =>
        scripted().build([scriptSpend(), collateral({ utxo: own })], {
          payer: cip30([own], { getCollateral: answering([asCbor(short)]) }),
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(both.details.available).toBe(200_000n);
  });

  it("is INSUFFICIENT_COLLATERAL for a snapshot or an address payer that cannot cover", async () => {
    // Neither form is a wallet, so there is no method to call: the rule holds by construction
    await expectCode(
      () =>
        scripted().build([scriptSpend()], {
          payer: { changeAddress: hexOf(wallet), utxos: [asCbor(dust)] },
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    const fetchAddressUTxOs = jest.fn(async () => [asMesh(dust)]);
    await expectCode(
      () =>
        new TxBuilder({
          network,
          params,
          costModels,
          evaluator: fakeEvaluator(),
          provider: { fetchAddressUTxOs } as unknown as IFetcher,
        }).build([scriptSpend()], { payer: wallet }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(fetchAddressUTxOs).toHaveBeenCalledTimes(1);
  });

  it("puts up no UTxO of the answer that holds tokens, without a collateral return", async () => {
    const token = `${"ab".repeat(28)}746f6b656e`;
    const tokens: Utxo = {
      ...utxo(ada(2)),
      value: { lovelace: ada(2), [token]: 1n },
    };
    const plain = utxo(ada(8));
    const getCollateral = answering([asCbor(tokens), asCbor(plain)]);
    const built = await scripted().build([scriptSpend()], {
      payer: cip30([dust], { getCollateral }),
      collateralReturn: false,
    });
    expect(getCollateral).toHaveBeenCalledTimes(1);
    expect(keysOf(built.collateral!.inputs)).toEqual([keyOf(plain)]);
    expect(built.collateral!.total).toBe(ada(8));
    expect(built.collateral!.return).toBeUndefined();

    // An answer of UTxOs holding tokens alone gives nothing to put up
    const error = await expectCode(
      () =>
        scripted().build([scriptSpend()], {
          payer: cip30([dust], { getCollateral: answering([asCbor(tokens)]) }),
          collateralReturn: false,
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(error.message).toMatch(
      /^the payer's UTxOs cannot cover the collateral, and the wallet's getCollateral gave no UTxO that may be put up for \d+ lovelace without a collateral return; UTxOs holding native assets cannot be collateral without a collateral return: give collateral inputs without assets, or drop `collateralReturn: false`$/,
    );
    // The same answer refused by the filter: dropping the option would not help, and no advice
    const filtered = await expectCode(
      () =>
        scripted().build([scriptSpend()], {
          payer: cip30([dust], { getCollateral: answering([asCbor(tokens)]) }),
          collateralReturn: false,
          canSelect: (u) => keyOf(u) !== keyOf(tokens),
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(filtered.message).toMatch(
      /^the payer's UTxOs cannot cover the collateral, and the wallet's getCollateral gave no UTxO that may be put up for \d+ lovelace$/,
    );
    // An answer whose lovelace-only UTxO falls short, beside one holding tokens: the advice
    const short = await expectCode(
      () =>
        scripted().build([scriptSpend()], {
          payer: cip30([dust], {
            getCollateral: answering([asCbor(tokens), asCbor(utxo(150_000n))]),
          }),
          collateralReturn: false,
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(short.message).toMatch(
      /^the only UTxO that can be put up as collateral does not cover \d+ lovelace; UTxOs holding native assets cannot be collateral without a collateral return: give collateral inputs without assets, or drop `collateralReturn: false`$/,
    );
    // With a return the same answer is put up, its token returned
    const returned = await scripted().build([scriptSpend()], {
      payer: cip30([dust], { getCollateral: answering([asCbor(tokens)]) }),
    });
    expect(keysOf(returned.collateral!.inputs)).toEqual([keyOf(tokens)]);
    expect(returned.collateral!.return!.value[token]).toBe(1n);
  });
});
