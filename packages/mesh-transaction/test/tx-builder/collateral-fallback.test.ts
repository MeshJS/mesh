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
  UTxO,
} from "@meshsdk/core";
import {
  Address,
  CborReader,
  resolvePlutusScriptAddress,
  toTxUnspentOutput,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  BuildOptions,
  collateral,
  collateralReturn,
  output,
  PartsInput,
  referenceInput,
  spend,
  TxBuilder,
  TxBuildError,
  TxBuildErrorCode,
  TxError,
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
const recipient = baseAddress(2);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);

const hexOf = (address: string) =>
  Address.fromString(address)!.toBytes().toString();
const cborOf = (utxo: UTxO) => toTxUnspentOutput(utxo).toCbor().toString();
/** The same address on mainnet */
const onMainnet = (address: string) => {
  const bytes = bech32.fromWords(bech32.decode(address, 200).words);
  bytes[0] = bytes[0]! | 0x01;
  return bech32.encode("addr", bech32.toWords(bytes), 200);
};

const ada = (n: number) => BigInt(n) * 1_000_000n;
let nextHash = 0xb00;
/** A UTxO of the wallet; its hash holds letters, so case matters */
const utxo = (lovelace: bigint, address = wallet): UTxO => ({
  input: {
    txHash: (++nextHash).toString(16).padStart(64, "d"),
    outputIndex: 0,
  },
  output: {
    address,
    amount: [{ unit: "lovelace", quantity: String(lovelace) }],
  },
});
const ref = (u: UTxO) => `${u.input.txHash}#${u.input.outputIndex}`;
const refs = (utxos: readonly UTxO[]) => utxos.map(ref);
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
      input: {
        txHash: (0xc0 + ++nextLock).toString(16).repeat(32),
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

/** Too small to be collateral: less than any fee calls for */
const dust = utxo(100_000n);
/** What the wallet puts up when asked */
const reserve = utxo(ada(5));

/**
 * A CIP-30 api: its change address in hex, its UTxOs as CBOR, and the collateral methods given
 */
const cip30 = (
  utxos: UTxO[],
  methods: {
    getCollateral?: jest.Mock;
    experimental?: { getCollateral?: jest.Mock };
  } = {},
) => ({
  getNetworkId: jest.fn(async () => 0),
  getChangeAddress: jest.fn(async () => hexOf(wallet)),
  getUtxos: jest.fn(async () => utxos.map(cborOf)),
  signTx: jest.fn(async () => "a0"),
  ...methods,
});

/** A `getCollateral` answering with this */
const answering = (answer: unknown) =>
  jest.fn(async (_: { amount: string }) => answer as string[]);

describe("TxBuilder: the collateral fallback", () => {
  it("asks a CIP-30 payer once, for the collateral the transaction calls for, and puts up its answer", async () => {
    const getCollateral = answering([cborOf(reserve)]);
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
    expect(refs(built.collateral!.inputs)).toEqual([ref(reserve)]);
    expect(refs(built.selectedInputs)).not.toContain(ref(reserve));
    expect(refs(built.inputs)).not.toContain(ref(reserve));
    expect(built.prototype.body.collateral).toEqual([
      { transaction_id: reserve.input.txHash, index: 0 },
    ]);
  });

  it("adds nothing of the answer to what payment may select", async () => {
    // The payer can pay but holds no collateral: 80 UTxOs, any three of them short of it
    const small = Array.from({ length: 80 }, () => utxo(100_000n));
    const getCollateral = answering([cborOf(reserve)]);
    const built = await scripted().build(
      [
        scriptSpend(ada(2)),
        output({ address: recipient, value: { lovelace: ada(3) } }),
      ],
      { payer: cip30(small, { getCollateral }) },
    );
    expect(getCollateral).toHaveBeenCalledTimes(1);
    expect(refs(built.collateral!.inputs)).toEqual([ref(reserve)]);
    // The built-in selection takes the largest first, so the answer would be taken if it could
    expect(built.selectedInputs.length).toBeGreaterThan(0);
    expect(
      refs(built.selectedInputs).every((r) => refs(small).includes(r)),
    ).toBe(true);
    expect(refs(built.inputs)).not.toContain(ref(reserve));
  });

  it("gives the UTxOs of the answer to the evaluation that follows the call", async () => {
    const calls: { before: boolean; utxos: string[] }[] = [];
    let asked = false;
    const getCollateral = jest.fn(async (_: { amount: string }) => {
      asked = true;
      return [cborOf(reserve)];
    });
    const recording: IEvaluator = {
      acceptsKnownUtxos: true,
      evaluateTx: async (tx, utxos = []) => {
        calls.push({ before: !asked, utxos: refs(utxos) });
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
    expect(refs(built.collateral!.inputs)).toEqual([ref(reserve)]);
    const after = calls.filter((c) => !c.before);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]!.utxos).toContain(ref(reserve));
  });

  it("never puts up a UTxO of the answer that a transaction of after spends", async () => {
    const spentReserve = utxo(ada(5));
    // Spends spentReserve and leaves the payer no change
    const tx1 = await scripted().build([], {
      payer: { changeAddress: wallet, utxos: [spentReserve] },
      sendAllTo: recipient,
    });
    expect(refs(tx1.inputs)).toEqual([ref(spentReserve)]);

    const built = await scripted().build([scriptSpend()], {
      payer: cip30([dust], {
        getCollateral: answering([cborOf(spentReserve), cborOf(reserve)]),
      }),
      after: tx1,
    });
    expect(refs(built.collateral!.inputs)).toEqual([ref(reserve)]);

    await expectCode(
      () =>
        scripted().build([scriptSpend()], {
          payer: cip30([dust], {
            getCollateral: answering([cborOf(spentReserve)]),
          }),
          after: tx1,
        }),
      "INSUFFICIENT_COLLATERAL",
    );
  });

  it("plans collateral from the answer alone, never joined with the payer's UTxOs", async () => {
    // Each is short of the collateral; the two together would cover it
    const own = utxo(200_000n);
    const given = utxo(200_000n);
    const getCollateral = answering([cborOf(given)]);
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
    const getCollateral = answering([cborOf(utxo(400_000n))]);
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
    const getCollateral = answering([cborOf(reserve)]);
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
    expect(refs(built.collateral!.inputs)).toEqual([ref(reserve)]);
  });

  it("asks for the collateral of the fee option when one is given", async () => {
    const getCollateral = answering([cborOf(reserve)]);
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
    const experimental = answering([cborOf(reserve)]);
    const built = await scripted().build([scriptSpend()], {
      payer: cip30([dust], { experimental: { getCollateral: experimental } }),
    });
    expect(experimental).toHaveBeenCalledTimes(1);
    expect(refs(built.collateral!.inputs)).toEqual([ref(reserve)]);

    const top = answering([cborOf(reserve)]);
    const nested = answering([cborOf(reserve)]);
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
      method: () => answering([cborOf(dust)]),
    },
    {
      answer: "UTxOs the filter rejects",
      method: () => answering([cborOf(reserve)]),
      options: { canSelect: () => false },
    },
    {
      answer: "UTxOs a part reads",
      method: () => answering([cborOf(reserve)]),
      parts: [scriptSpend(), referenceInput({ utxo: reserve })],
    },
    {
      answer: "a script-locked UTxO",
      method: () => answering([cborOf(utxo(ada(5), scriptAddress))]),
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

  it("is NETWORK_MISMATCH for a UTxO of another network in the answer", async () => {
    const getCollateral = answering([cborOf(utxo(ada(5), onMainnet(wallet)))]);
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
    const getCollateral = answering([cborOf(reserve), cborOf(other)]);
    const asked: string[] = [];
    const built = await scripted().build([scriptSpend()], {
      payer: cip30([dust], { getCollateral }),
      canSelect: (u) => {
        asked.push(ref(u));
        return ref(u) !== ref(reserve);
      },
    });
    expect(refs(built.collateral!.inputs)).toEqual([ref(other)]);
    expect(asked.filter((r) => r === ref(reserve))).toHaveLength(1);
  });

  it("does not call when the payer's UTxOs cover the collateral", async () => {
    const getCollateral = answering([cborOf(reserve)]);
    const own = utxo(ada(3));
    const built = await scripted().build([scriptSpend()], {
      payer: cip30([own], { getCollateral }),
    });
    expect(getCollateral).not.toHaveBeenCalled();
    expect(refs(built.collateral!.inputs)).toEqual([ref(own)]);
  });

  it("does not call when no Plutus script runs", async () => {
    const getCollateral = answering([cborOf(reserve)]);
    const built = await scripted().build(
      output({ address: recipient, value: { lovelace: ada(2) } }),
      { payer: cip30([utxo(ada(10))], { getCollateral }) },
    );
    expect(getCollateral).not.toHaveBeenCalled();
    expect(built.collateral).toBeUndefined();
  });

  it("does not call a wallet that answers its change address in bech32", async () => {
    const getCollateral = answering([cborOf(reserve)]);
    const meshFormat = {
      getNetworkId: async () => 0,
      getChangeAddress: async () => wallet,
      getUtxos: async () => [dust],
      getCollateral,
    };
    await expectCode(
      () => scripted().build([scriptSpend()], { payer: meshFormat }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(getCollateral).not.toHaveBeenCalled();
  });

  it("does not call when collateral parts are given and fall short", async () => {
    const getCollateral = answering([cborOf(reserve)]);
    await expectCode(
      () =>
        scripted().build([scriptSpend(), collateral({ utxo: dust })], {
          payer: cip30([dust], { getCollateral }),
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    expect(getCollateral).not.toHaveBeenCalled();
  });

  it("is INSUFFICIENT_COLLATERAL for a snapshot or an address payer that cannot cover", async () => {
    // Neither form is a wallet, so there is no method to call: the rule holds by construction
    await expectCode(
      () =>
        scripted().build([scriptSpend()], {
          payer: { changeAddress: hexOf(wallet), utxos: [cborOf(dust)] },
        }),
      "INSUFFICIENT_COLLATERAL",
    );
    const fetchAddressUTxOs = jest.fn(async () => [dust]);
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
});
