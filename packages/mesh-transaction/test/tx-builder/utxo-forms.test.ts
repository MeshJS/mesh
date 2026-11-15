import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IEvaluator,
  IFetcher,
  mConStr0,
  Protocol,
  resolveScriptRef,
  UTxO,
} from "@meshsdk/core";
import {
  resolvePlutusScriptAddress,
  toTxUnspentOutput,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  BuiltTxData,
  collateral,
  minFee,
  output,
  requiredSigners,
  spend,
  toMeshUtxo,
  toUtxo,
  TxBuilder,
  TxBuildError,
  TxBuildErrorCode,
  Utxo,
  UtxoInput,
  utxosAfter,
} from "../../src/tx-builder";
import { refScriptFee } from "../../src/tx-builder/fee";
import { alwaysSucceedCbor, baseAddress, mockTokenUnit } from "../test-util";

// The three forms the builder takes a UTxO in give one transaction and the same results, and
// what it reports as an out ref stays exactly an out ref.

const network = "preprod";
const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const wallet = baseAddress(1);
const recipient = baseAddress(2);
const other = baseAddress(3);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const token = mockTokenUnit(1);
const ada = (n: number) => BigInt(n) * 1_000_000n;

const meshUtxo = (
  txHash: string,
  address: string,
  amount: UTxO["output"]["amount"],
  extra: Partial<UTxO["output"]> = {},
): UTxO => ({
  input: { txHash, outputIndex: 0 },
  output: { address, amount, ...extra },
});
const lovelace = (n: bigint) => [{ unit: "lovelace", quantity: String(n) }];

/** The payer's UTxOs: one with a token, one plain */
const funds = meshUtxo("11".repeat(32), wallet, [
  { unit: token, quantity: "5" },
  ...lovelace(ada(100)),
]);
const extra = meshUtxo("12".repeat(32), wallet, lovelace(ada(20)));
/** Given as `knownUtxos` and spent by out ref */
const known = meshUtxo("13".repeat(32), wallet, lovelace(ada(7)));
/** Locked by the script, its datum inline */
const locked = meshUtxo("14".repeat(32), scriptAddress, lovelace(ada(10)), {
  plutusData: "d87980",
});
/** Holds the script as its reference script */
const holder = meshUtxo("15".repeat(32), other, lovelace(ada(20)), {
  scriptRef: resolveScriptRef(plutusScript),
});
const putUp = meshUtxo("16".repeat(32), wallet, lovelace(ada(5)));
const fixtures = [funds, extra, known, locked, holder, putUp];

const cborOf = (utxo: UTxO) => toTxUnspentOutput(utxo).toCbor().toString();
const key = (utxo: UtxoInput) => {
  const { txHash, outputIndex } = toUtxo(utxo);
  return `${txHash}#${outputIndex}`;
};

type Form = (utxo: UTxO) => UtxoInput;
const asOwn: Form = (utxo) => toUtxo(utxo);
const asMesh: Form = (utxo) => utxo;
const asCbor: Form = cborOf;
/** Each fixture in one of the three forms, the same one every time */
const mixed: Form = (utxo) =>
  [asOwn, asMesh, asCbor][fixtures.indexOf(utxo) % 3]!(utxo);
const FORMS: [string, Form][] = [
  ["Utxo", asOwn],
  ["Mesh UTxO", asMesh],
  ["CBOR", asCbor],
  ["mixed", mixed],
];

/** Prices every redeemer at fixed units, and records the UTxOs it is handed */
const recordingEvaluator = () => {
  const handed: UTxO[][] = [];
  const evaluator: IEvaluator = {
    acceptsKnownUtxos: true,
    evaluateTx: async (tx, utxos) => {
      handed.push([...(utxos ?? [])]);
      return (
        Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ??
        []
      ).map((r) => ({
        tag: "SPEND" as const,
        index: Number(r.index()),
        budget: { mem: 1000, steps: 2000 },
      }));
    },
  };
  return { evaluator, handed };
};

const offline = (evaluator: IEvaluator = recordingEvaluator().evaluator) =>
  new TxBuilder({ network, params, costModels, evaluator });

/** One payment, every UTxO of it given in the form `f` */
const scenario = (f: Form, builder = offline()) =>
  builder.build(
    [
      spend.plutus({
        utxo: f(locked),
        script: { reference: f(holder) },
        redeemer: { data: mConStr0([]) },
      }),
      spend.pubKey({ utxo: { txHash: known.input.txHash, outputIndex: 0 } }),
      collateral({ utxo: f(putUp) }),
      output({ address: recipient, value: { lovelace: ada(30) } }),
    ],
    {
      payer: { changeAddress: wallet, utxos: [f(funds), f(extra)] },
      knownUtxos: [f(known)],
    },
  );

/** The UTxOs a built transaction spends, reads and puts up, in the form `f` */
const namedIn = (built: BuiltTxData, f: Form) => {
  const byKey = new Map(fixtures.map((u) => [key(u), u]));
  return [
    ...built.inputs,
    ...built.referenceInputs,
    ...(built.collateral?.inputs ?? []),
  ].map((u) => f(byKey.get(key(u))!));
};

const caught = async <C extends TxBuildErrorCode>(
  run: () => unknown,
  code: C,
): Promise<TxBuildError<C>> => {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(TxBuildError);
    expect((error as TxBuildError).code).toBe(code);
    return error as TxBuildError<C>;
  }
  throw new Error(`expected ${code}`);
};

const OUT_REF_KEYS = ["outputIndex", "txHash"];

describe("UTxOs in any form", () => {
  it("build one transaction from a Utxo, a Mesh UTxO, its CBOR, or a mix of them", async () => {
    const [reference, ...rest] = await Promise.all(
      FORMS.map(([, f]) => scenario(f)),
    );
    expect(reference!.inputs).toHaveLength(3);
    expect(reference!.referenceInputs.map(key)).toEqual([key(holder)]);
    expect(reference!.collateral!.inputs.map(key)).toEqual([key(putUp)]);
    for (const built of rest) {
      expect(built.tx).toBe(reference!.tx);
      expect(built.txHash).toBe(reference!.txHash);
      expect(built.inputs).toStrictEqual(reference!.inputs);
      expect(built.referenceInputs).toStrictEqual(reference!.referenceInputs);
      expect(built.outputs).toStrictEqual(reference!.outputs);
      expect(built.change).toStrictEqual(reference!.change);
      expect(built.collateral).toStrictEqual(reference!.collateral);
    }
    // Every UTxO it returns is a Utxo in normal form, and equal to its own reading
    for (const utxo of [
      ...reference!.inputs,
      ...reference!.referenceInputs,
      ...reference!.collateral!.inputs,
    ])
      expect(toUtxo(utxo)).toStrictEqual(utxo);
  });

  it("give the same results to finalize, requiredSigners, minFee and utxosAfter", async () => {
    const built = await scenario(asOwn);
    const results = await Promise.all(
      FORMS.map(async ([, f]) => {
        const named = namedIn(built, f);
        const final = await offline().finalize(built.prototype, {
          inputs: named,
          changeAddress: wallet,
        });
        return {
          final,
          signers: requiredSigners(built.tx, named),
          fee: minFee(built.prototype, {
            params,
            vkeyWitnesses: 1,
            inputs: named,
          }),
          after: utxosAfter([f(funds), f(extra)], built),
        };
      }),
    );
    const [first, ...rest] = results;
    expect(first!.final.txHash).toBe(built.txHash);
    expect(first!.signers).toEqual(built.signers);
    // The reference script is priced: without the UTxOs the fee is lower
    expect(first!.fee).toBeGreaterThan(
      minFee(built.prototype, { params, vkeyWitnesses: 1 }),
    );
    expect(first!.after.map(key)).toEqual([
      ...[funds, extra]
        .filter((u) => !built.inputs.some((i) => key(i) === key(u)))
        .map(key),
      ...built.change.map(key),
    ]);
    for (const result of rest) {
      expect(result.final.tx).toBe(first!.final.tx);
      expect(result.final.inputs).toStrictEqual(first!.final.inputs);
      expect(result.final.collateral).toStrictEqual(first!.final.collateral);
      expect(result.signers).toEqual(first!.signers);
      expect(result.fee).toBe(first!.fee);
      expect(result.after).toStrictEqual(first!.after);
    }
  });

  it("hand an evaluator the Mesh UTxOs of what the transaction names, whatever form they came in", async () => {
    const handedBy = await Promise.all(
      FORMS.map(async ([, f]) => {
        const { evaluator, handed } = recordingEvaluator();
        const built = await scenario(f, offline(evaluator));
        return { built, handed };
      }),
    );
    for (const { built, handed } of handedBy) {
      expect(handed.length).toBeGreaterThan(0);
      const { body } = built.prototype;
      const named = [
        ...body.inputs,
        ...(body.reference_inputs ?? []),
        ...(body.collateral ?? []),
      ].map((i) => `${i.transaction_id}#${i.index}`);
      const last = handed.at(-1)!;
      expect(last.map(key).sort()).toEqual([...named].sort());
      // Mesh UTxOs, written from the builder's copies
      const ours = [
        ...built.inputs,
        ...built.referenceInputs,
        ...built.collateral!.inputs,
      ];
      for (const utxo of last) {
        expect(Object.keys(utxo).sort()).toEqual(["input", "output"]);
        expect(utxo).toEqual(
          toMeshUtxo(ours.find((u) => key(u) === key(utxo))!),
        );
      }
      expect(last).toEqual(handedBy[0]!.handed.at(-1));
    }
  });
});

describe("a UTxO with a reference script this library cannot read", () => {
  // A bare byte string, not the CBOR of [language, script]
  const scriptRef = "4e4d01000033222220051200120011";
  const odd = meshUtxo("21".repeat(32), wallet, lovelace(ada(10)), {
    scriptRef,
  });
  const twin = meshUtxo("21".repeat(32), wallet, lovelace(ada(10)));
  const pay = output({ address: recipient, value: { lovelace: ada(3) } });
  const buildSpending = (utxo: UTxO) =>
    new TxBuilder({ network, params }).build([spend.pubKey({ utxo }), pay], {
      payer: { changeAddress: wallet, utxos: [extra] },
    });

  it("is taken as a payer's UTxO, carried as it is", async () => {
    const snapshot = await new TxBuilder({ network, params }).readPayer({
      changeAddress: wallet,
      utxos: [odd, cborOf(extra)],
    });
    expect(snapshot.utxos[0]!.script).toEqual({ type: "unknown", scriptRef });
    expect(toMeshUtxo(snapshot.utxos[0]!).output.scriptRef).toBe(scriptRef);
    const built = await new TxBuilder({ network, params }).build(
      output({ address: recipient, value: { lovelace: ada(25) } }),
      { payer: snapshot },
    );
    expect(built.inputs.map(key)).toEqual(
      expect.arrayContaining([key(odd), key(extra)]),
    );
  });

  it("is priced by its size when spent", async () => {
    const [withScript, without] = await Promise.all([
      buildSpending(odd),
      buildSpending(twin),
    ]);
    const priced = refScriptFee(
      BigInt(scriptRef.length / 2),
      params.minFeeRefScriptCostPerByte,
    );
    expect(priced).toBeGreaterThan(0n);
    // The same body but for the fee and the change it takes
    const difference = withScript.fee - without.fee;
    expect(difference).toBeGreaterThanOrEqual(priced);
    expect(difference).toBeLessThan(priced + 100n);
    expect(
      minFee(withScript.prototype, {
        params,
        vkeyWitnesses: 1,
        inputs: [odd],
      }) - minFee(withScript.prototype, { params, vkeyWitnesses: 1 }),
    ).toBe(priced);
  });

  it("leaves requiredSigners and finalize working", async () => {
    const built = await buildSpending(odd);
    expect(requiredSigners(built.tx, built.inputs)).toEqual(built.signers);
    expect(requiredSigners(built.tx, [odd, extra])).toEqual(built.signers);
    const final = await new TxBuilder({ network, params }).finalize(
      built.prototype,
      { inputs: [odd, extra] },
    );
    expect(final.txHash).toBe(built.txHash);
    expect(final.inputs.find((u) => key(u) === key(odd))!.script).toEqual({
      type: "unknown",
      scriptRef,
    });
  });
});

describe("out refs reported", () => {
  /** A UTxO in full, with every member a Utxo can have */
  const full = (txHash: string): Utxo =>
    toUtxo(
      meshUtxo(txHash, wallet, lovelace(ada(9)), {
        plutusData: "d87980",
        scriptRef: resolveScriptRef(plutusScript),
      }),
    );

  it("hold exactly txHash and outputIndex in UTXO_NOT_FOUND", async () => {
    const built = await scenario(asOwn);
    const left = namedIn(built, asOwn).slice(1);
    for (const error of [
      await caught(
        () => offline().finalize(built.prototype, { inputs: left }),
        "UTXO_NOT_FOUND",
      ),
      await caught(() => requiredSigners(built.tx, left), "UTXO_NOT_FOUND"),
    ])
      expect(Object.keys(error.details.input).sort()).toEqual(OUT_REF_KEYS);

    // Looked up and not found
    const provider = {
      fetchUTxOs: async () => [],
    } as unknown as IFetcher;
    const lookedUp = await caught(
      () =>
        new TxBuilder({ network, params, provider }).build(
          [spend.pubKey({ utxo: { txHash: "31".repeat(32), outputIndex: 0 } })],
          { payer: { changeAddress: wallet, utxos: [extra] } },
        ),
      "UTXO_NOT_FOUND",
    );
    expect(Object.keys(lookedUp.details.input).sort()).toEqual(OUT_REF_KEYS);

    // Spent by a transaction given in after, named by a part in full
    const spentByAfter = await caught(
      () =>
        offline().build(spend.pubKey({ utxo: built.inputs[0]! }), {
          payer: { changeAddress: wallet, utxos: [funds] },
          after: built,
        }),
      "UTXO_NOT_FOUND",
    );
    expect(spentByAfter.details.input).toStrictEqual({
      txHash: built.inputs[0]!.txHash,
      outputIndex: built.inputs[0]!.outputIndex,
    });
  });

  it("hold exactly txHash and outputIndex in INVALID_SELECTION, though coinSelection answers a UTxO in full", async () => {
    const foreign = full("32".repeat(32));
    const error = await caught(
      () =>
        offline().build(
          output({ address: recipient, value: { lovelace: ada(2) } }),
          {
            payer: { changeAddress: wallet, utxos: [extra] },
            coinSelection: () => [foreign],
          },
        ),
      "INVALID_SELECTION",
    );
    expect(error.details.utxo).toStrictEqual({
      txHash: foreign.txHash,
      outputIndex: foreign.outputIndex,
    });
  });
});
