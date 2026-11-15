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
  pubKeyAddress,
  resolveScriptRef,
  serializeAddressObj,
  UTxO,
} from "@meshsdk/core";
import {
  resolvePlutusScriptAddress,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  BuildEvent,
  BuildOptions,
  BuiltOutput,
  BuiltTxData,
  collateral,
  output,
  OutputDatum,
  outputOf,
  OutputScript,
  OutRef,
  PartsInput,
  referenceInput,
  spend,
  toUtxo,
  TxBuilder,
  TxBuildError,
  TxError,
  TxPartError,
  Utxo,
  UtxoInput,
  utxosAfter,
} from "../../src/tx-builder";
import { feeForSize } from "../../src/tx-builder/fee";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  keyHashHex,
} from "../test-util";
import { asMesh, ref } from "./utxo-util";

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const wallet = baseAddress(1);
const recipient = baseAddress(2);
const ada = (n: number) => BigInt(n) * 1_000_000n;
const funds: Utxo = {
  txHash: "c".repeat(64),
  outputIndex: 0,
  address: wallet,
  value: { lovelace: ada(100) },
};

const pay = (n: number, label?: string) =>
  output({
    address: recipient,
    value: { lovelace: ada(n) },
    ...(label !== undefined && { label }),
  });

const build = (parts: ReturnType<typeof pay>[]): Promise<BuiltTxData> =>
  new TxBuilder({ network: "preprod", params }).build(parts, {
    payer: { changeAddress: wallet, utxos: [funds] },
  });

describe("outputOf", () => {
  it("returns the output made from the part with the label", async () => {
    const built = await build([pay(2, "first"), pay(3, "second")]);
    const second = outputOf(built, "second");
    expect(second).toBe(built.outputs.find((o) => o.label === "second"));
    expect(ref(second)).toEqual({ txHash: built.txHash, outputIndex: 1 });
    expect(second.value).toEqual({ lovelace: ada(3) });
  });

  it("returns the first in body order when several outputs carry the label", async () => {
    const built = await build([pay(2), pay(3, "twice"), pay(4, "twice")]);
    expect(outputOf(built, "twice").outputIndex).toBe(1);
  });

  it("throws UNKNOWN_LABEL listing the labels the transaction has", async () => {
    const built = await build([pay(2, "a"), pay(3), pay(4, "b"), pay(5, "a")]);
    let error: unknown;
    try {
      outputOf(built, "c");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TxBuildError);
    expect(error).not.toBeInstanceOf(RangeError);
    expect(TxError.is(error, "UNKNOWN_LABEL")).toBe(true);
    if (!TxError.is(error, "UNKNOWN_LABEL")) return;
    expect(error.details).toEqual({ label: "c", labels: ["a", "b"] });
    expect(error.retryable).toBe(false);
    expect(error.part).toBeUndefined();
    expect(error.message).toContain('"c"');
    expect(error.message).toContain('"a", "b"');

    const unlabelled = await build([pay(2)]);
    expect(() => outputOf(unlabelled, "a")).toThrow(
      "none of its outputs has a label",
    );
  });
});

const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const other = baseAddress(3);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const plutusRef: OutputScript = {
  type: "plutus",
  version: "V3",
  code: alwaysSucceedCbor,
  hash: alwaysSucceedHash,
};
const unitInline: OutputDatum = {
  type: "inline",
  data: { type: "CBOR", content: "d87980" },
};

let nextHash = 0;
const utxoAt = (
  address: string,
  coin: bigint,
  extra: Partial<Utxo> = {},
): Utxo => ({
  txHash: (++nextHash).toString(16).padStart(64, "d"),
  outputIndex: 0,
  address,
  value: { lovelace: coin },
  ...extra,
});
/** A UTxO of the payer */
const owned = (n: number) => utxoAt(wallet, ada(n));
/** An output locked by the always-succeeding script, its datum inline */
const locked = (n = 10) => utxoAt(scriptAddress, ada(n), { datum: unitInline });
const snapshot = (...utxos: UtxoInput[]) => ({ changeAddress: wallet, utxos });
/** The out ref of a UTxO given in the Mesh form or returned in the builder's */
const refOf = (utxo: Readonly<UTxO> | Readonly<Utxo>) => {
  const { txHash, outputIndex } = "input" in utxo ? utxo.input : utxo;
  return `${txHash}#${outputIndex}`;
};
const refsOf = (utxos: readonly (Readonly<UTxO> | Readonly<Utxo>)[]) =>
  utxos.map(refOf);

const TAGS: Action["tag"][] = [
  "SPEND",
  "MINT",
  "CERT",
  "REWARD",
  "VOTE",
  "PROPOSE",
];

/** Prices every redeemer at fixed units, and records the UTxOs each evaluation is handed */
const recordingEvaluator = (acceptsKnownUtxos?: boolean) => {
  const handed: UTxO[][] = [];
  const evaluator: IEvaluator = {
    ...(acceptsKnownUtxos !== undefined && { acceptsKnownUtxos }),
    evaluateTx: async (tx, utxos) => {
      handed.push([...(utxos ?? [])]);
      return (
        Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ??
        []
      ).map((r) => ({
        tag: TAGS[r.tag()]!,
        index: Number(r.index()),
        budget: { mem: 1000, steps: 2000 },
      }));
    },
  };
  return { evaluator, handed };
};

/** A builder that reads nothing: explicit parameters, no provider */
const offline = (evaluator: IEvaluator = recordingEvaluator(true).evaluator) =>
  new TxBuilder({ network: "preprod", params, costModels, evaluator });

/** A provider whose lookups fail, and whose every call is recorded */
const failingProvider = () => {
  const calls: string[] = [];
  const fail = (name: string) => async () => {
    calls.push(name);
    throw new Error(`${name} is not available`);
  };
  const provider = {
    fetchUTxOs: fail("fetchUTxOs"),
    fetchAddressUTxOs: fail("fetchAddressUTxOs"),
    fetchAccountInfo: fail("fetchAccountInfo"),
    fetchProtocolParameters: fail("fetchProtocolParameters"),
    fetchCostModels: fail("fetchCostModels"),
  } as unknown as IFetcher;
  return { provider, calls };
};
const online = (provider: IFetcher) =>
  new TxBuilder({
    network: "preprod",
    provider,
    params,
    costModels,
    evaluator: recordingEvaluator(true).evaluator,
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

const buildWith = (
  parts: PartsInput,
  options: BuildOptions,
  builder = offline(),
): Promise<BuiltTxData> => builder.build(parts, options);

describe("TxBuilder: after", () => {
  it("does not select the inputs of after, and selects its change", async () => {
    const funds = owned(100);
    const tx1 = await buildWith(pay(10), { payer: snapshot(funds) });
    expect(refsOf(tx1.inputs)).toEqual([refOf(funds)]);
    const change = tx1.change[0]!;

    // The snapshot still lists what tx1 spent, and not its change
    const tx2 = await buildWith(pay(5), {
      payer: snapshot(funds),
      after: tx1,
    });
    expect(refsOf(tx2.inputs)).toEqual([refOf(change)]);
    expect(refsOf(tx2.selectedInputs)).toEqual([refOf(change)]);

    // Listed by the snapshot too, the change is a candidate once
    let candidates: string[] = [];
    const tx3 = await buildWith(pay(5), {
      payer: snapshot(funds, change),
      after: tx1,
      coinSelection: (_, given) => {
        candidates = refsOf(given);
        return given;
      },
    });
    expect(candidates).toEqual([refOf(change)]);
    expect(refsOf(tx3.inputs)).toEqual([refOf(change)]);
  });

  it("never selects an output paid to another, and spends it by out ref without a lookup", async () => {
    const funds = owned(100);
    const tx1 = await buildWith(
      output({ address: other, value: { lovelace: ada(60) } }),
      { payer: snapshot(funds) },
    );
    const paid = tx1.outputs[0]!;
    expect(paid.change).toBeUndefined();

    // tx1's change holds less than 40 ADA: the 60 ADA output is not selected
    const short = await caught(
      buildWith(pay(45), { payer: snapshot(funds), after: tx1 }),
    );
    expect(short.code).toBe("INSUFFICIENT_FUNDS");

    const byOutRef = spend.pubKey({
      utxo: { txHash: tx1.txHash, outputIndex: 0 },
    });
    const { provider, calls } = failingProvider();
    const fetched = await buildWith(
      [byOutRef, pay(45)],
      { payer: snapshot(funds), after: tx1 },
      online(provider),
    );
    expect(calls).toEqual([]);
    expect(refsOf(fetched.inputs)).toContain(refOf(paid));
    expect(fetched.inputs).toContainEqual(paid);

    const offlineBuilt = await buildWith([byOutRef, pay(45)], {
      payer: snapshot(funds),
      after: tx1,
    });
    expect(offlineBuilt.txHash).toBe(fetched.txHash);
  });

  it("builds the same transaction as a snapshot folded with utxosAfter", async () => {
    const funds = [owned(100), owned(30)];
    const tx1 = await buildWith(pay(10), { payer: snapshot(...funds) });
    const chained = await buildWith(pay(95), {
      payer: snapshot(...funds),
      after: tx1,
    });
    const folded = await buildWith(pay(95), {
      payer: snapshot(...utxosAfter(funds, tx1)),
    });
    expect(chained.selectedInputs.length).toBe(2);
    expect(chained.txHash).toBe(folded.txHash);
  });

  it("selects what a chain of transactions left, in whatever order they are given, each once", async () => {
    const funds = owned(100);
    const tx1 = await buildWith(pay(10), { payer: snapshot(funds) });
    const tx2 = await buildWith(pay(10), {
      payer: snapshot(funds),
      after: tx1,
    });
    // tx2 spends tx1's change
    expect(refsOf(tx2.inputs)).toEqual(refsOf(tx1.change));

    const third = await buildWith(pay(5), {
      payer: snapshot(funds),
      after: [tx1, tx2],
    });
    expect(refsOf(third.inputs)).toEqual(refsOf(tx2.change));
    const reversed = await buildWith(pay(5), {
      payer: snapshot(funds),
      after: [tx2, tx1],
    });
    expect(refsOf(reversed.inputs)).toEqual(refsOf(third.inputs));

    const once = await buildWith(pay(5), {
      payer: snapshot(funds),
      after: tx1,
    });
    const twice = await buildWith(pay(5), {
      payer: snapshot(funds),
      after: [tx1, tx1],
    });
    expect(twice.txHash).toBe(once.txHash);
  });

  it("does not select the change of a transaction built for another payer, which a part can spend", async () => {
    const tx1 = await buildWith(pay(10), { payer: snapshot(owned(100)) });
    const otherPayer = { changeAddress: other, utxos: [] };
    const short = await caught(
      buildWith(pay(5), { payer: otherPayer, after: tx1 }),
    );
    expect(short.code).toBe("INSUFFICIENT_FUNDS");

    const change = tx1.change[0]!;
    const built = await buildWith(
      [spend.pubKey({ utxo: ref(change) }), pay(5)],
      { payer: otherPayer, after: tx1 },
    );
    expect(refsOf(built.inputs)).toEqual([refOf(change)]);
    expect(built.change.map((o) => o.address)).toEqual([other]);
  });

  it("keeps out the change canSelect refuses, and sweeps the change of after with sendAllTo", async () => {
    const funds = [owned(100), owned(30)];
    const tx1 = await buildWith(pay(80), { payer: snapshot(...funds) });
    expect(refsOf(tx1.inputs)).toEqual([refOf(funds[0]!)]);
    const change = tx1.change[0]!;

    const refused = await caught(
      buildWith(pay(32), {
        payer: snapshot(...funds),
        after: tx1,
        canSelect: (utxo) => utxo.txHash !== tx1.txHash,
      }),
    );
    expect(refused.code).toBe("INSUFFICIENT_FUNDS");
    expect(
      (refused as TxBuildError<"INSUFFICIENT_FUNDS">).details.pool,
    ).toMatchObject({ excludedByFilter: 1, spentByAfter: 1, selectable: 1 });

    // To the payer's own change address: what is swept is change
    const home = await buildWith([], {
      payer: snapshot(...funds),
      after: tx1,
      sendAllTo: wallet,
    });
    expect(refsOf(home.inputs).sort()).toEqual(
      [refOf(funds[1]!), refOf(change)].sort(),
    );
    expect(home.outputs.length).toBeGreaterThan(0);
    expect(home.outputs.every((o) => o.change)).toBe(true);

    // To another address: not change, and not selected by a build after the sweep
    const away = await buildWith([], {
      payer: snapshot(...funds),
      after: tx1,
      sendAllTo: other,
    });
    expect(refsOf(away.inputs).sort()).toEqual(refsOf(home.inputs).sort());
    expect(away.outputs.some((o) => o.change)).toBe(false);
    expect(away.change).toEqual([]);
    const afterSweep = await caught(
      buildWith(pay(5), { payer: snapshot(...funds), after: [tx1, away] }),
    );
    expect(afterSweep.code).toBe("INSUFFICIENT_FUNDS");
  });

  it("takes collateral from the change of after", async () => {
    const funds = owned(100);
    const tx1 = await buildWith(pay(10), { payer: snapshot(funds) });
    const built = await buildWith(
      spend.plutus({
        utxo: locked(),
        script: plutusScript,
        redeemer: { data: mConStr0([]) },
      }),
      { payer: snapshot(funds), after: tx1 },
    );
    expect(refsOf(built.collateral!.inputs)).toEqual(refsOf(tx1.change));
  });

  it("never puts up as collateral a UTxO after spends, though it would be the first choice", async () => {
    // The smallest UTxO that covers the collateral is the one tx1 spends
    const small = owned(3);
    const large = owned(100);
    const tx1 = await buildWith([spend.pubKey({ utxo: small }), pay(60)], {
      payer: snapshot(small, large),
    });
    expect(refsOf(tx1.inputs).sort()).toEqual(
      [refOf(small), refOf(large)].sort(),
    );
    const change = tx1.change[0]!;
    expect(change.value.lovelace).toBeGreaterThan(ada(3));

    const unlock = spend.plutus({
      utxo: locked(),
      script: plutusScript,
      redeemer: { data: mConStr0([]) },
    });
    // Without after the small UTxO is the one put up
    const alone = await buildWith(unlock, { payer: snapshot(small, large) });
    expect(refsOf(alone.collateral!.inputs)).toEqual([refOf(small)]);

    const built = await buildWith(unlock, {
      payer: snapshot(small, large),
      after: tx1,
    });
    expect(refsOf(built.collateral!.inputs)).toEqual([refOf(change)]);
  });

  it("counts the payer event's selectable UTxOs on what after leaves", async () => {
    const first = owned(100);
    const second = owned(30);
    // tx1 spends both UTxOs of the payer and leaves one change output
    const tx1 = await buildWith(
      [spend.pubKey({ utxo: first }), spend.pubKey({ utxo: second }), pay(10)],
      { payer: snapshot(first, second) },
    );
    expect(tx1.change.length).toBe(1);
    const events: BuildEvent[] = [];
    const built = await buildWith(pay(5), {
      payer: snapshot(first, second),
      after: tx1,
      trace: (event) => events.push(event),
    });
    expect(refsOf(built.inputs)).toEqual(refsOf(tx1.change));
    expect(events.find((e) => e.type === "payer")).toEqual({
      type: "payer",
      changeAddress: wallet,
      utxos: 2,
      selectable: 1,
    });
  });

  it("counts the UTxOs after spends in INSUFFICIENT_FUNDS", async () => {
    const funds = owned(100);
    // Everything goes to another address: no change is left to the payer
    const tx1 = await buildWith([], {
      payer: snapshot(funds),
      sendAllTo: other,
    });
    expect(tx1.change).toEqual([]);
    const events: BuildEvent[] = [];
    const error = await caught(
      buildWith(pay(5), {
        payer: snapshot(funds),
        after: tx1,
        trace: (event) => events.push(event),
      }),
    );
    expect(events.find((e) => e.type === "payer")).toMatchObject({
      utxos: 1,
      selectable: 0,
    });
    expect(error.code).toBe("INSUFFICIENT_FUNDS");
    const { details } = error as TxBuildError<"INSUFFICIENT_FUNDS">;
    expect(details.pool).toEqual({
      given: 1,
      selectable: 0,
      scriptLocked: 0,
      excludedByFilter: 0,
      readByParts: 0,
      spentByAfter: 1,
    });
    expect(details.reason).toBe("noUtxos");
    expect(error.message).toContain("after");
  });

  it("refuses a part that names an output after spends, before any lookup", async () => {
    const spentUtxo = owned(100);
    const extra = owned(50);
    const tx1 = await buildWith(pay(10), { payer: snapshot(spentUtxo) });
    expect(refsOf(tx1.inputs)).toEqual([refOf(spentUtxo)]);

    const cases: [string, (utxo: Utxo | OutRef) => PartsInput][] = [
      ["spend", (utxo) => spend.pubKey({ utxo, label: "again" })],
      ["referenceInput", (utxo) => referenceInput({ utxo, label: "again" })],
      [
        "collateral",
        (utxo) => [
          collateral({ utxo, label: "again" }),
          spend.plutus({
            utxo: locked(),
            script: plutusScript,
            redeemer: { data: mConStr0([]) },
          }),
        ],
      ],
    ];
    for (const [kind, partFor] of cases) {
      for (const given of [spentUtxo, ref(spentUtxo)]) {
        const { provider, calls } = failingProvider();
        const error = await caught(
          buildWith(
            [partFor(given), pay(5)],
            { payer: snapshot(spentUtxo, extra), after: tx1 },
            online(provider),
          ),
        );
        expect(error.code).toBe("UTXO_NOT_FOUND");
        expect(error.details).toEqual({ input: ref(spentUtxo) });
        expect(error.part).toBe(kind);
        expect(error.label).toBe("again");
        expect(error.message).toContain(tx1.txHash);
        expect(calls).toEqual([]);
      }
      // Without after the same build passes
      const built = await buildWith([partFor(spentUtxo), pay(5)], {
        payer: snapshot(spentUtxo, extra),
      });
      expect(built.txHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("does not refuse a part spending the collateral of after", async () => {
    const funds = owned(100);
    const backing = owned(20);
    const tx1 = await buildWith(
      [
        spend.plutus({
          utxo: locked(),
          script: plutusScript,
          redeemer: { data: mConStr0([]) },
        }),
        collateral({ utxo: backing }),
      ],
      { payer: snapshot(funds, backing) },
    );
    expect(refsOf(tx1.collateral!.inputs)).toEqual([refOf(backing)]);
    const built = await buildWith([spend.pubKey({ utxo: backing }), pay(5)], {
      payer: snapshot(funds, backing),
      after: tx1,
    });
    expect(refsOf(built.inputs)).toContain(refOf(backing));
  });

  it("keeps the collateral inputs of after selectable", async () => {
    const big = owned(100);
    const small = owned(10);
    const tx1 = await buildWith(
      [
        spend.plutus({
          utxo: locked(),
          script: plutusScript,
          redeemer: { data: mConStr0([]) },
        }),
        collateral({ utxo: small }),
        pay(50),
      ],
      { payer: snapshot(big, small) },
    );
    expect(refsOf(tx1.inputs)).toContain(refOf(big));
    expect(refsOf(tx1.collateral!.inputs)).toEqual([refOf(small)]);
    const change = tx1.change[0]!;
    const changeCoin = change.value.lovelace;

    const built = await buildWith(
      output({
        address: recipient,
        value: { lovelace: changeCoin + ada(2) },
      }),
      { payer: snapshot(big, small), after: tx1 },
    );
    expect(refsOf(built.inputs).sort()).toEqual(
      [refOf(change), refOf(small)].sort(),
    );
  });

  it("leaves no label or change mark on the UTxOs it stores", async () => {
    const funds = owned(100);
    const tx1 = await buildWith(
      [output({ address: wallet, value: { lovelace: ada(5) }, label: "mine" })],
      { payer: snapshot(funds) },
    );
    const mine = outputOf(tx1, "mine");
    const built = await buildWith([spend.pubKey({ utxo: mine }), pay(20)], {
      payer: snapshot(funds),
      after: tx1,
    });
    // The labelled output is spent by the part, the change of tx1 is selected
    expect(refsOf(built.inputs).sort()).toEqual(
      [refOf(mine), refOf(tx1.change[0]!)].sort(),
    );
    const stored: Utxo[] = [
      ...built.inputs,
      ...built.selectedInputs,
      ...built.parts.flatMap((p) => ("utxo" in p && p.utxo ? [p.utxo] : [])),
    ];
    expect(stored.length).toBeGreaterThan(3);
    for (const utxo of stored)
      expect(Object.keys(utxo).sort()).toEqual([
        "address",
        "outputIndex",
        "txHash",
        "value",
      ]);
  });

  it("refuses an after or knownUtxos of another shape before anything is read", async () => {
    const tx1 = await buildWith(pay(10), { payer: snapshot(owned(100)) });
    const { outputs, ...withoutOutputs } = tx1;
    expect(outputs.length).toBeGreaterThan(0);
    // What is not a built transaction is named by its JavaScript type alone: it may hold a key
    const cases: [string, unknown, unknown][] = [
      ["after", [{}], "object"],
      ["after", tx1.txHash, "string"],
      ["after", withoutOutputs, "object"],
      ["after", [tx1, 7], "number"],
      ["knownUtxos", [{}], {}],
      // What is not a list is named by its JavaScript type alone: it may hold a key
      ["knownUtxos", tx1.outputs[0], "object"],
    ];
    for (const [option, value, entry] of cases) {
      const { provider, calls } = failingProvider();
      const error = await caught(
        online(provider).build(pay(5), {
          // An address payer: its UTxOs would be read first
          payer: wallet,
          [option]: value,
        } as BuildOptions),
      );
      expect(error.code).toBe("INVALID_OPTION");
      expect(error.details).toMatchObject({ option, value: entry });
      expect(calls).toEqual([]);
    }
  });

  it("changes nothing when given an empty list", async () => {
    const funds = [owned(100), owned(30)];
    const plain = await buildWith(pay(10), { payer: snapshot(...funds) });
    const empty = await buildWith(pay(10), {
      payer: snapshot(...funds),
      after: [],
    });
    expect(empty.txHash).toBe(plain.txHash);
  });

  it("looks up an out ref of an after transaction past its outputs", async () => {
    const funds = owned(100);
    const tx1 = await buildWith(pay(10), { payer: snapshot(funds) });
    const parts = [
      spend.pubKey({
        utxo: { txHash: tx1.txHash, outputIndex: tx1.outputs.length },
      }),
      pay(5),
    ];
    const missing = await caught(
      buildWith(parts, { payer: snapshot(funds), after: tx1 }),
    );
    expect(missing.code).toBe("MISSING_FETCHER");

    const { provider, calls } = failingProvider();
    await expect(
      buildWith(
        parts,
        { payer: snapshot(funds), after: tx1 },
        online(provider),
      ),
    ).rejects.toThrow();
    expect(calls).toContain("fetchUTxOs");
  });

  it("checks an output of after against the part that names it", async () => {
    const funds = owned(100);
    const tx1 = await buildWith(
      output({ address: scriptAddress, value: { lovelace: ada(10) } }),
      { payer: snapshot(funds) },
    );
    let error: unknown;
    try {
      await buildWith(
        [
          spend.pubKey({
            utxo: { txHash: tx1.txHash, outputIndex: 0 },
            label: "key",
          }),
          pay(5),
        ],
        { payer: snapshot(funds), after: tx1 },
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TxPartError);
    expect((error as TxPartError).part).toBe("spend");
    expect((error as TxPartError).label).toBe("key");
  });

  it("prices a reference script held by an output of after into the fee", async () => {
    const funds = owned(100);
    const tx1 = await buildWith(
      output({
        address: other,
        value: { lovelace: ada(20) },
        scriptRef: plutusScript,
        label: "script",
      }),
      { payer: snapshot(funds) },
    );
    const holder = outputOf(tx1, "script");
    const scriptSize = BigInt(asMesh(holder).output.scriptRef!.length / 2);
    const built = await buildWith(
      spend.plutus({
        utxo: locked(),
        script: { reference: ref(holder) },
        redeemer: { data: mConStr0([]) },
      }),
      { payer: snapshot(funds), after: tx1 },
    );
    expect(built.referenceInputs).toEqual([toUtxo(holder)]);
    // One key witness: the payer's input or collateral, both at one key
    const witnessBytes = 101n + 1n + 1n + 1n;
    const priced = feeForSize(
      built.tx.length / 2 + Number(witnessBytes),
      scriptSize,
      built.exUnits,
      params,
    );
    const unpriced = feeForSize(
      built.tx.length / 2 + Number(witnessBytes),
      0n,
      built.exUnits,
      params,
    );
    expect(priced - unpriced).toBeGreaterThan(88n);
    expect(built.fee).toBeGreaterThanOrEqual(priced - 88n);
    expect(built.fee).toBeLessThanOrEqual(priced + 88n);
  });

  it("checks the network of the outputs of after", async () => {
    const tx1 = await buildWith(pay(10), { payer: snapshot(owned(100)) });
    const mainnet = serializeAddressObj(pubKeyAddress(keyHashHex(1)), 1);
    const moved: BuiltTxData = {
      ...tx1,
      outputs: tx1.outputs.map((o, i) =>
        i === 0 ? { ...o, address: mainnet } : o,
      ),
    };
    const error = await caught(
      buildWith(pay(5), { payer: snapshot(owned(100)), after: moved }),
    );
    expect(error.code).toBe("NETWORK_MISMATCH");
    const { details } = error as TxBuildError<"NETWORK_MISMATCH">;
    expect(details.found.map((f) => [f.role, f.address])).toEqual([
      ["utxo", mainnet],
    ]);
  });
});

describe("TxBuilder: knownUtxos", () => {
  it("resolves a part from it with no provider", async () => {
    const known = utxoAt(other, ada(20));
    const parts = [spend.pubKey({ utxo: ref(known) }), pay(5)];
    const built = await buildWith(parts, {
      payer: snapshot(owned(100)),
      knownUtxos: [known],
    });
    expect(built.inputs).toContainEqual(known);

    const missing = await caught(
      buildWith(parts, { payer: snapshot(owned(100)) }),
    );
    expect(missing.code).toBe("MISSING_FETCHER");
  });

  it("makes nothing selectable and takes nothing out of selection", async () => {
    const rich = owned(1000);
    const error = await caught(
      buildWith(pay(5), { payer: snapshot(), knownUtxos: [rich] }),
    );
    expect(error.code).toBe("INSUFFICIENT_FUNDS");

    const funds = owned(100);
    const built = await buildWith(pay(5), {
      payer: snapshot(funds),
      knownUtxos: [funds],
    });
    expect(refsOf(built.selectedInputs)).toEqual([refOf(funds)]);
  });

  it("hands the evaluator the known UTxOs and the outputs of after, with or without acceptsKnownUtxos", async () => {
    const funds = owned(100);
    const backing = owned(20);
    const tx1 = await buildWith(pay(10), { payer: snapshot(funds) });
    const change = tx1.change[0]!;
    const script = locked();
    const parts = [
      spend.plutus({
        utxo: ref(script),
        script: plutusScript,
        redeemer: { data: mConStr0([]) },
      }),
      collateral({ utxo: backing }),
      // More than the script output holds: tx1's change is selected
      pay(30),
    ];
    const options = {
      payer: snapshot(funds, backing),
      after: tx1,
      knownUtxos: [script],
    };

    const local = recordingEvaluator(true);
    const built = await buildWith(parts, options, offline(local.evaluator));
    expect(refsOf(built.inputs).sort()).toEqual(
      [refOf(script), refOf(change)].sort(),
    );
    expect(refsOf(local.handed.at(-1)!).sort()).toEqual(
      [refOf(script), refOf(change), refOf(backing)].sort(),
    );

    // An evaluator that resolves inputs from its chain gets only what was given as data
    const remote = recordingEvaluator();
    await buildWith(parts, options, offline(remote.evaluator));
    expect(remote.handed.length).toBeGreaterThan(0);
    for (const handed of remote.handed)
      expect(refsOf(handed).sort()).toEqual(
        [refOf(script), refOf(change)].sort(),
      );
    expect(remote.handed.at(-1)).toContainEqual(asMesh(change));
  });

  it("hands an evaluator without acceptsKnownUtxos no change folded in by utxosAfter, and that change once it is given as knownUtxos", async () => {
    const funds = owned(100);
    const backing = owned(20);
    const tx1 = await buildWith(pay(10), { payer: snapshot(funds) });
    const change = tx1.change[0]!;
    const script = locked();
    const parts = [
      spend.plutus({
        utxo: ref(script),
        script: plutusScript,
        redeemer: { data: mConStr0([]) },
      }),
      collateral({ utxo: backing }),
      // More than the script output holds: tx1's change is selected
      pay(30),
    ];
    const payer = snapshot(...utxosAfter([funds, backing], tx1));

    const folded = recordingEvaluator();
    const built = await buildWith(
      parts,
      { payer, knownUtxos: [script] },
      offline(folded.evaluator),
    );
    expect(refsOf(built.selectedInputs)).toEqual([refOf(change)]);
    expect(folded.handed.length).toBeGreaterThan(0);
    for (const handed of folded.handed)
      expect(refsOf(handed)).toEqual([refOf(script)]);

    const given = recordingEvaluator();
    await buildWith(
      parts,
      { payer, knownUtxos: [script, change] },
      offline(given.evaluator),
    );
    expect(refsOf(given.handed.at(-1)!).sort()).toEqual(
      [refOf(script), refOf(change)].sort(),
    );
  });

  it("prices a reference script held by a known UTxO into the fee", async () => {
    const holder = utxoAt(other, ada(20), { script: plutusRef });
    const scriptSize = BigInt(resolveScriptRef(plutusScript).length / 2);
    const built = await buildWith(
      spend.plutus({
        utxo: locked(),
        script: { reference: ref(holder) },
        redeemer: { data: mConStr0([]) },
      }),
      { payer: snapshot(owned(100)), knownUtxos: [holder] },
    );
    expect(built.referenceInputs).toEqual([holder]);
    // One key witness: the payer's collateral
    const witnessBytes = 101n + 1n + 1n + 1n;
    const priced = feeForSize(
      built.tx.length / 2 + Number(witnessBytes),
      scriptSize,
      built.exUnits,
      params,
    );
    const unpriced = feeForSize(
      built.tx.length / 2 + Number(witnessBytes),
      0n,
      built.exUnits,
      params,
    );
    expect(priced - unpriced).toBeGreaterThan(88n);
    expect(built.fee).toBeGreaterThanOrEqual(priced - 88n);
    expect(built.fee).toBeLessThanOrEqual(priced + 88n);
  });

  it("matches an out ref whatever the case of its transaction hash", async () => {
    const lower = utxoAt(other, ada(20));
    const upper: Utxo = { ...lower, txHash: lower.txHash.toUpperCase() };
    expect(upper.txHash).not.toBe(lower.txHash);
    const given = structuredClone(upper);
    const built = await buildWith(
      [spend.pubKey({ utxo: ref(lower) }), pay(5)],
      { payer: snapshot(owned(100)), knownUtxos: [given] },
    );
    expect(built.inputs).not.toContain(undefined);
    expect(built.inputs).toContainEqual(lower);
    expect(given).toEqual(upper);
  });

  it("checks a known UTxO against the part that names it", async () => {
    const script = locked();
    let error: unknown;
    try {
      await buildWith(
        [spend.pubKey({ utxo: ref(script), label: "key" }), pay(5)],
        { payer: snapshot(owned(100)), knownUtxos: [script] },
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TxPartError);
    expect((error as TxPartError).part).toBe("spend");
    expect((error as TxPartError).label).toBe("key");
  });

  it("checks the network of the known UTxOs", async () => {
    const mainnet = serializeAddressObj(pubKeyAddress(keyHashHex(1)), 1);
    const error = await caught(
      buildWith(pay(5), {
        payer: snapshot(owned(100)),
        knownUtxos: [utxoAt(mainnet, ada(20))],
      }),
    );
    expect(error.code).toBe("NETWORK_MISMATCH");
    const { details } = error as TxBuildError<"NETWORK_MISMATCH">;
    expect(details.found.map((f) => [f.role, f.address])).toEqual([
      ["utxo", mainnet],
    ]);
  });
});

describe("TxBuilder: reference scripts given in full", () => {
  it("needs no lookup for a reference script held by a UTxO given to the part", async () => {
    const holder = utxoAt(other, ada(20), { script: plutusRef });
    const built = await buildWith(
      spend.plutus({
        utxo: locked(),
        script: { reference: holder },
        redeemer: { data: mConStr0([]) },
      }),
      { payer: snapshot(owned(100)) },
    );
    expect(built.referenceInputs).toEqual([holder]);
  });
});

describe("utxosAfter", () => {
  /** A transaction that pays the payer's own address, another one, and change */
  const chainOf = async () => {
    const funds = [owned(100), owned(30)];
    const tx1 = await buildWith(
      [
        output({ address: wallet, value: { lovelace: ada(4) }, label: "own" }),
        output({ address: other, value: { lovelace: ada(3) } }),
      ],
      { payer: snapshot(...funds) },
    );
    return { funds, tx1 };
  };

  it("removes the inputs and adds the change, not an output paid to another", async () => {
    const { funds, tx1 } = await chainOf();
    expect(refsOf(tx1.inputs)).toEqual([refOf(funds[0]!)]);
    expect(refsOf(utxosAfter(funds, tx1))).toEqual([
      refOf(funds[1]!),
      ...refsOf(tx1.change),
    ]);
    expect(refsOf(utxosAfter(funds, tx1, () => true))).toEqual([
      refOf(funds[1]!),
      ...refsOf(tx1.outputs),
    ]);
    expect(
      refsOf(utxosAfter(funds, tx1, (o: BuiltOutput) => o.label === "own")),
    ).toEqual([refOf(funds[1]!), refOf(outputOf(tx1, "own"))]);
  });

  it("changes neither argument, returns a new array, and adds plain UTxOs once", async () => {
    const { funds, tx1 } = await chainOf();
    const fundsBefore = structuredClone(funds);
    const txBefore = structuredClone(tx1);
    const first = utxosAfter(funds, tx1);
    expect(funds).toEqual(fundsBefore);
    expect(tx1).toEqual(txBefore);
    expect(first).not.toBe(funds);
    expect(utxosAfter(funds, tx1)).not.toBe(first);

    const none = utxosAfter(funds, []);
    expect(none).toEqual(funds);
    expect(none).not.toBe(funds);

    // An output already listed is not added again
    const listed = utxosAfter(first, tx1);
    expect(refsOf(listed)).toEqual(refsOf(first));

    for (const utxo of first)
      expect(Object.keys(utxo).sort()).toEqual([
        "address",
        "outputIndex",
        "txHash",
        "value",
      ]);
    const change = tx1.change[0]!;
    expect(first.at(-1)).toEqual(toUtxo(change));
  });

  it("leaves the collateral of a transaction among the UTxOs", async () => {
    const funds = owned(100);
    const backing = owned(10);
    const tx1 = await buildWith(
      [
        spend.plutus({
          utxo: locked(),
          script: plutusScript,
          redeemer: { data: mConStr0([]) },
        }),
        collateral({ utxo: backing }),
        pay(50),
      ],
      { payer: snapshot(funds, backing) },
    );
    expect(refsOf(tx1.collateral!.inputs)).toEqual([refOf(backing)]);
    expect(refsOf(tx1.inputs)).toContain(refOf(funds));
    expect(refsOf(utxosAfter([funds, backing], tx1))).toEqual([
      refOf(backing),
      ...refsOf(tx1.change),
    ]);
  });

  it("gives the same set for a chain whichever order its transactions come in", async () => {
    const funds = [owned(100)];
    const tx1 = await buildWith(pay(10), { payer: snapshot(...funds) });
    const tx2 = await buildWith(pay(10), {
      payer: snapshot(...utxosAfter(funds, tx1)),
    });
    expect(refsOf(tx2.inputs)).toEqual(refsOf(tx1.change));
    const inOrder = utxosAfter(funds, [tx1, tx2]);
    const reversed = utxosAfter(funds, [tx2, tx1]);
    expect(refsOf(inOrder)).toEqual(refsOf(tx2.change));
    expect(refsOf(reversed).sort()).toEqual(refsOf(inOrder).sort());
  });
});
