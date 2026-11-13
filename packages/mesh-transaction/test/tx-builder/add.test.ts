import {
  Action,
  CachedFetcher,
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
import { CSLSerializer } from "@meshsdk/core-csl";
import {
  keyHashToRewardAddress,
  OfflineEvaluatorScalus,
  resolvePlutusScriptAddress,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import type {
  PartEntry,
  PartsInput,
  Payer,
  PayerSnapshotInput,
} from "../../src/tx-builder";
import {
  BuiltTx,
  certificate,
  collateralReturn,
  guard,
  output,
  referenceInput,
  spend,
  TxBuilder,
  TxBuildError,
  TxPart,
  validity,
} from "../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress, keyHashHex } from "../test-util";

const network = "preprod";
const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const deposits = { drepDeposit: 500_000_000n, govActionDeposit: 1_000_000n };
const wallet = baseAddress(1);
const recipient = baseAddress(2);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const stake = keyHashToRewardAddress(keyHashHex(5), 0);

const ada = (n: number) => BigInt(n) * 1_000_000n;
const lovelace = (n: bigint) => [{ unit: "lovelace", quantity: String(n) }];
let nextHash = 0;
const utxo = (
  amount: UTxO["output"]["amount"],
  extra: Partial<UTxO["output"]> = {},
  address = wallet,
): UTxO => ({
  input: {
    txHash: (++nextHash).toString(16).padStart(64, "a"),
    outputIndex: 0,
  },
  output: { address, amount, ...extra },
});

const TAGS: Action["tag"][] = [
  "SPEND",
  "MINT",
  "CERT",
  "REWARD",
  "VOTE",
  "PROPOSE",
];

/** Prices every redeemer of a transaction at fixed units */
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

/** A provider that answers from a list of UTxOs and counts its calls; a new object each time */
const countingProvider = (utxos: UTxO[] = []) => {
  const calls: Record<string, number> = {};
  const count = (name: string) => (calls[name] = (calls[name] ?? 0) + 1);
  const provider = {
    fetchUTxOs: async (hash: string) => {
      count("fetchUTxOs");
      return utxos.filter((u) => u.input.txHash === hash);
    },
    fetchAddressUTxOs: async () => {
      count("fetchAddressUTxOs");
      return [];
    },
    fetchAccountInfo: async () => {
      count("fetchAccountInfo");
      return { active: true, balance: "0", rewards: "0", withdrawals: "0" };
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
  return { provider, calls };
};

/** A builder that reads nothing: explicit parameters and a local evaluator */
const builder = () =>
  new TxBuilder({
    network,
    params,
    costModels,
    evaluator: fakeEvaluator(),
    deposits,
  });

const funds = utxo(lovelace(ada(100)));
const o: { payer: PayerSnapshotInput } = {
  payer: { changeAddress: wallet, utxos: [funds] },
};

const pay = (label: string, n: number) =>
  output({ address: recipient, value: { lovelace: ada(n) }, label });
const A = pay("A", 2);
const B = pay("B", 3);
const C = pay("C", 4);

/** The labels of the outputs, in body order; the change as "change" */
const outputs = (built: BuiltTx) =>
  built.outputs.map((out) => (out.change ? "change" : out.label));

const rejected = async (build: Promise<unknown>) => {
  try {
    await build;
  } catch (error) {
    expect(error).toBeInstanceOf(TxBuildError);
    return error as TxBuildError;
  }
  throw new Error("expected the build to fail");
};

/** What is thrown at the call */
const thrown = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
};

/** Own members of a builder, by key */
const membersOf = (b: TxBuilder) => b as unknown as Record<string, unknown>;

/**
 * Every own member of the second builder is the very value of the first, but one: the list of
 * parts, which holds `added` in the second and nothing in the first
 */
const expectSameMembers = (b: TxBuilder, next: TxBuilder, added: TxPart[]) => {
  const before = membersOf(b);
  const after = membersOf(next);
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  const differing = Object.keys(before).filter(
    (key) => after[key] !== before[key],
  );
  expect(differing).toHaveLength(1);
  expect(before[differing[0]!]).toEqual([]);
  expect(after[differing[0]!]).toEqual(added);
};

describe("TxBuilder.add", () => {
  it("returns another builder and leaves the first unchanged", async () => {
    const b = builder();
    const b2 = b.add(A);
    expect(b2).toBeInstanceOf(TxBuilder);
    expect(b2).not.toBeInstanceOf(Promise);
    expect(b2).not.toBe(b);

    expect(outputs(await b.build(B, o))).toEqual(["B", "change"]);
    expect(outputs(await b2.build(B, o))).toEqual(["A", "B", "change"]);
    // A dropped result adds nothing
    b.add(C);
    expect(outputs(await b.build([], o))).toEqual(["change"]);
  });

  it("builds the added parts first, then the given ones", async () => {
    const A2 = pay("A2", 5);
    const B2 = pay("B2", 6);
    const built = await builder().add(A, A2).build([B, B2], o);
    expect(outputs(built)).toEqual(["A", "A2", "B", "B2", "change"]);
    expect(built.parts).toEqual(expect.arrayContaining([A, A2, B, B2]));
  });

  it("builds the added parts alone when no parts are given", async () => {
    const b = builder().add(A);
    const omitted = await b.build(undefined, o);
    const empty = await b.build([], o);
    expect(omitted.tx).toBe(empty.tx);
    expect(outputs(empty)).toEqual(["A", "change"]);

    // Without options there is no payer: refused for that, not for the parts
    const error = await rejected(b.build());
    expect(error.code).toBe("MISSING_PAYER");
  });

  it("gives the same transaction however the parts are split between add and build", async () => {
    const b = builder();
    const results = await Promise.all([
      b.add(A).add(B).build([], o),
      b.add(A, B).build([], o),
      b.add([A, [B]]).build([], o),
      b.add(A).build(B, o),
      b.add(A).build([B], o),
      b.build([A, B], o),
    ]);
    expect(outputs(results[0]!)).toEqual(["A", "B", "change"]);
    for (const built of results) {
      expect(built.tx).toBe(results[0]!.tx);
      expect(built.txHash).toBe(results[0]!.txHash);
    }
  });

  it("keeps branches of one builder apart", async () => {
    const base = builder().add(A);
    const withB = base.add(B);
    const withC = base.add(C);
    expect(outputs(await withB.build([], o))).toEqual(["A", "B", "change"]);
    expect(outputs(await withC.build([], o))).toEqual(["A", "C", "change"]);
    expect(outputs(await base.build([], o))).toEqual(["A", "change"]);
  });

  it("takes what build takes", async () => {
    const b = builder();
    const built = await b.add(A, [B, [C]], false, null, undefined).build([], o);
    expect(outputs(built)).toEqual(["A", "B", "C", "change"]);

    // Nothing to add: still a new builder, holding what the first holds
    const alone = await b.build([], o);
    for (const empty of [b.add(), b.add(false), b.add([]), b.add([null])]) {
      expect(empty).not.toBe(b);
      expect((await empty.build([], o)).tx).toBe(alone.tx);
    }
    const held = b.add(A);
    expect((await held.add().build([], o)).tx).toBe(
      (await held.build([], o)).tx,
    );
  });

  it("takes the parts as they are at the call", async () => {
    const list: TxPart[] = [A];
    const b2 = builder().add(list);
    list.push(B);
    expect(outputs(await b2.build([], o))).toEqual(["A", "change"]);
  });

  it("carries every member of the builder as it is", async () => {
    const { provider, calls } = countingProvider();
    const b = new TxBuilder({
      network,
      provider,
      serializer: new CSLSerializer(),
      params,
      costModels,
      deposits,
    });
    const next = b.add(A);
    expectSameMembers(b, next, [A]);
    expect(next.evaluator).toBeInstanceOf(OfflineEvaluatorScalus);
    expect(next.evaluator).toBe(b.evaluator);
    expect(next.provider).toBe(provider);
    expect(next.deposits).toBe(b.deposits);
    expect(CachedFetcher.wrap(next.provider!)).toBe(
      CachedFetcher.wrap(b.provider!),
    );
    // A chain of adds carries them too
    expectSameMembers(b, next.add(B).add(), [A, B]);
    expect(calls).toEqual({});
  });

  it("keeps a builder without evaluation without evaluation", async () => {
    const locked = utxo(
      lovelace(ada(10)),
      { plutusData: "d87980" },
      scriptAddress,
    );
    const { provider } = countingProvider([locked]);
    const b = new TxBuilder({ network, provider, evaluator: null });
    const unlock = spend.plutus({
      utxo: locked,
      script: plutusScript,
      redeemer: { data: mConStr0([]) },
    });
    const next = b.add(unlock);
    expectSameMembers(b, next, [unlock]);
    expect(next.evaluator).toBeUndefined();

    const direct = await rejected(b.build(unlock, o));
    expect(direct.code).toBe("MISSING_EVALUATOR");
    const added = await rejected(next.build([], o));
    expect(added.code).toBe("MISSING_EVALUATOR");
  });

  it("shares the provider's cache, and reads nothing itself", async () => {
    const read = utxo(lovelace(ada(5)));
    const { provider, calls } = countingProvider([read]);
    const b = new TxBuilder({
      network,
      provider,
      params,
      costModels,
      evaluator: fakeEvaluator(),
      deposits,
    });
    const b2 = b.add(referenceInput({ utxo: read.input }));
    const b3 = b2.add(A);
    expect(calls).toEqual({});

    expect((await b2.build([], o)).referenceInputs).toEqual([read]);
    expect((await b3.build([], o)).referenceInputs).toEqual([read]);
    expect(calls).toEqual({ fetchUTxOs: 1 });
  });

  it("is not changed by its builds", async () => {
    const b = builder().add(A);
    const first = await b.build([], o);
    const second = await b.build([], o);
    expect(second.tx).toBe(first.tx);

    const [withB, withC] = await Promise.all([b.build(B, o), b.build([C], o)]);
    expect(outputs(withB)).toEqual(["A", "B", "change"]);
    expect(outputs(withC)).toEqual(["A", "C", "change"]);
    expect((await b.build([], o)).tx).toBe(first.tx);
  });

  describe("parts a transaction holds once, added and given", () => {
    const window = (label?: string) =>
      validity({
        invalidBefore: 1000,
        invalidHereafter: 2000,
        ...(label !== undefined && { label }),
      });

    it("refuses a second validity", async () => {
      const b = builder();
      const error = await rejected(b.add(window()).build(window("given"), o));
      expect(error).toMatchObject({
        code: "DUPLICATE_PART",
        part: "validity",
        label: "given",
      });

      // add checks nothing: the pair is refused by the build, as within one list
      const both = b.add(window(), window("given"));
      const fromAdd = await rejected(both.build([], o));
      const fromList = await rejected(b.build([window(), window("given")], o));
      expect(fromAdd).toMatchObject({
        code: fromList.code,
        part: fromList.part,
        label: fromList.label,
        message: fromList.message,
      });
    });

    it("refuses an input spent on both sides", async () => {
      const input = utxo(lovelace(ada(5)));
      const error = await rejected(
        builder()
          .add(spend.pubKey({ utxo: input }))
          .build(spend.pubKey({ utxo: input, label: "again" }), {
            payer: { changeAddress: wallet, utxos: [funds, input] },
          }),
      );
      expect(error).toMatchObject({
        code: "DUPLICATE_PART",
        part: "spend",
        label: "again",
      });

      const fromList = await rejected(
        builder().build(
          [
            spend.pubKey({ utxo: input }),
            spend.pubKey({ utxo: input, label: "again" }),
          ],
          { payer: { changeAddress: wallet, utxos: [funds, input] } },
        ),
      );
      expect(error).toMatchObject({
        code: fromList.code,
        part: fromList.part,
        label: fromList.label,
        message: fromList.message,
      });
    });

    it("writes a reference input and a required signer given on both sides once", async () => {
      const read = utxo(lovelace(ada(5)));
      const signer = keyHashHex(7);
      const parts = [
        referenceInput({ utxo: read }),
        guard.pubKey({ keyHash: signer }),
      ];
      const built = await builder()
        .add(...parts)
        .build(parts, o);
      expect(built.referenceInputs).toEqual([read]);
      expect(built.prototype.body.reference_inputs).toEqual([
        { transaction_id: read.input.txHash, index: read.input.outputIndex },
      ]);
      expect(built.prototype.body.required_signers).toEqual([signer]);

      const fromList = await builder().build([...parts, ...parts], o);
      expect(built.tx).toBe(fromList.tx);
    });

    it("refuses a collateral return on both sides", async () => {
      const error = await rejected(
        builder()
          .add(collateralReturn({ address: baseAddress(8) }))
          .build(
            collateralReturn({ address: baseAddress(9), label: "given" }),
            o,
          ),
      );
      expect(error).toMatchObject({
        code: "DUPLICATE_PART",
        part: "collateralReturn",
        label: "given",
      });
    });
  });

  it("keeps the order of certificates across the two sides", async () => {
    const registration = certificate.stakeRegistration({ stake });
    const delegation = certificate.voteDelegation({
      stake,
      drep: "alwaysAbstain",
    });
    const built = await builder().add(registration).build(delegation, o);
    const certs = built.prototype.body.certs!;
    expect(certs).toHaveLength(2);
    expect(certs[0]).toMatchObject({ type: "STAKE_REGISTRATION" });
    expect(certs[1]).toMatchObject({ type: "VOTE_DELEGATION" });
    expect(built.tx).toBe(
      (await builder().build([registration, delegation], o)).tx,
    );
  });

  it("computes an added redeemer function in every build", async () => {
    const locked = utxo(
      lovelace(ada(10)),
      { plutusData: "d87980" },
      scriptAddress,
    );
    const b = builder().add(
      pay("first", 2),
      spend.plutus({
        utxo: locked,
        script: plutusScript,
        redeemer: {
          data: (tx) => tx.output("payout"),
          exUnits: { mem: 1000, steps: 2000 },
        },
      }),
    );
    const payer = {
      payer: { changeAddress: wallet, utxos: [funds, utxo(lovelace(ada(20)))] },
    };
    const one = await b.build([pay("payout", 3)], payer);
    const two = await b.build([pay("between", 3), pay("payout", 4)], payer);
    expect(one.redeemers.map((r) => r.data)).toEqual(["01"]);
    expect(two.redeemers.map((r) => r.data)).toEqual(["02"]);
  });

  it("refuses an entry that is not a part at the call, as build does", async () => {
    const b = builder();
    for (const entry of [{ payer: o.payer }, 5]) {
      const error = thrown(() => b.add(entry as unknown as TxPart));
      expect(error).toBeInstanceOf(TxBuildError);
      const fromBuild = await rejected(
        b.build([entry as unknown as TxPart], o),
      );
      expect(error).toMatchObject({
        code: "INVALID_OPTION",
        message: fromBuild.message,
        details: { option: "parts" },
      });
      expect(fromBuild.code).toBe("INVALID_OPTION");
    }
    expect(outputs(await b.build(A, o))).toEqual(["A", "change"]);
  });

  it("is typed to take parts only", () => {
    // Only compiled, never run: the compiler checks the lines below
    const typed = (b: TxBuilder, payer: Payer, parts: PartsInput) => {
      // @ts-expect-error add takes parts, not build options
      b.add({ payer });
      // @ts-expect-error the options are the second argument of build
      void b.build({ payer });
      void b.build();
      void b.add(parts);
      const forward = (...entries: PartEntry[]) => b.add(...entries);
      return forward(A, [B], false);
    };
    expect(typeof typed).toBe("function");
  });
});
