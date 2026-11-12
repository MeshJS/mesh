import { bech32 } from "bech32";

import {
  Action,
  CachedFetcher,
  DEFAULT_PROTOCOL_PARAMETERS,
  IEvaluator,
  IFetcher,
  mConStr0,
  NativeScript,
  Protocol,
  resolveScriptRef,
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
  withdrawal,
} from "../../src/tx-builder";
import { minFee, refScriptFee } from "../../src/tx-builder/fee";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  keyHashHex,
  mockTokenUnit,
  vrfKeyHashHex,
} from "../test-util";

const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
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
      return [] as number[][];
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
    const built = await new TxBuilder({ params }).build({
      parts: [output({ address: recipient, value: { lovelace: ada(5) } })],
      changeAddress: wallet,
      utxos: funds,
    });

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
    const built = await new TxBuilder({ params }).build({
      parts: [output({ address: recipient, value: { [unit]: 1n } })],
      changeAddress: wallet,
      utxos: [utxo([...lovelace(ada(10)), { unit, quantity: "5" }])],
    });
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
    await expectBuildError(
      new TxBuilder({ params }).build({
        parts: [output({ address: recipient, value: { lovelace: 100n } })],
        changeAddress: wallet,
        utxos: [utxo(lovelace(ada(10)))],
      }),
      "OUTPUT_BELOW_MIN_COIN",
    );
  });

  it("rejects an output whose value is too large", async () => {
    const units = Array.from({ length: 30 }, (_, i) => mockTokenUnit(i + 1));
    await expectBuildError(
      new TxBuilder({ params: { ...params, maxValSize: 400 } }).build({
        parts: [
          output({
            address: recipient,
            value: Object.fromEntries(units.map((unit) => [unit, 1n])),
          }),
        ],
        changeAddress: wallet,
        utxos: [],
      }),
      "VALUE_TOO_LARGE",
    );
  });

  it("selects another input when the change would hold too little lovelace", async () => {
    const spent = utxo(lovelace(2_300_000n));
    const extra = utxo(lovelace(ada(5)));
    const built = await new TxBuilder({ params }).build({
      parts: [
        spend.pubKey({ utxo: spent }),
        output({ address: recipient, value: { lovelace: ada(2) } }),
      ],
      changeAddress: wallet,
      utxos: [extra],
    });
    expect(built.selectedInputs).toEqual([extra]);
    expect(BigInt(built.change[0]!.amount.coin)).toBeGreaterThan(ada(4));
    expectBalanced(built);
  });

  it("leaves out change when nothing is left over", async () => {
    // A fixed fee that takes exactly what the output leaves
    const built = await new TxBuilder({ params }).build({
      parts: [output({ address: recipient, value: { lovelace: ada(3) } })],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(3) + 200_000n))],
      fee: 200_000n,
    });
    expect(built.change).toEqual([]);
    expect(built.fee).toBe(200_000n);
    expectBalanced(built);
  });

  it("selects inputs for tokens first, from their largest holders", async () => {
    const unit = mockTokenUnit(2);
    const small = utxo([...lovelace(ada(2)), { unit, quantity: "3" }]);
    const large = utxo([...lovelace(ada(2)), { unit, quantity: "8" }]);
    const plain = utxo(lovelace(ada(50)));
    const built = await new TxBuilder({ params }).build({
      parts: [output({ address: recipient, value: { [unit]: 10n } })],
      changeAddress: wallet,
      utxos: [small, plain, large],
    });
    expect(built.selectedInputs.slice(0, 2)).toEqual([large, small]);
    expectBalanced(built);
  });

  it("splits change whose tokens do not fit in one output", async () => {
    const units = Array.from({ length: 30 }, (_, i) => mockTokenUnit(i + 1));
    const small = { ...params, maxValSize: 400 };
    const built = await new TxBuilder({ params: small }).build({
      parts: [output({ address: recipient, value: { lovelace: ada(2) } })],
      changeAddress: wallet,
      utxos: [
        utxo([
          ...lovelace(ada(100)),
          ...units.map((unit) => ({ unit, quantity: "1" })),
        ]),
      ],
    });
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
      new TxBuilder({ params }).build({
        parts: [output({ address: recipient, value: { lovelace: ada(50) } })],
        changeAddress: wallet,
        utxos: [utxo(lovelace(ada(10)))],
      }),
      "INSUFFICIENT_FUNDS",
    );
    expect(lovelaceShort.details).toMatchObject({ unit: "lovelace" });

    const unit = mockTokenUnit(3);
    const tokenShort = await expectBuildError(
      new TxBuilder({ params }).build({
        parts: [output({ address: recipient, value: { [unit]: 2n } })],
        changeAddress: wallet,
        utxos: [utxo([...lovelace(ada(10)), { unit, quantity: "1" }])],
      }),
      "INSUFFICIENT_FUNDS",
    );
    expect(tokenShort.details).toEqual({ unit, missing: 1n });
  });

  it("selects only key-locked UTxOs", async () => {
    await expectBuildError(
      new TxBuilder({ params }).build({
        parts: [output({ address: recipient, value: { lovelace: ada(2) } })],
        changeAddress: wallet,
        utxos: [utxo(lovelace(ada(10)), {}, scriptAddress)],
      }),
      "INSUFFICIENT_FUNDS",
    );
  });

  it("uses a fixed fee as is, and rejects one below the minimum", async () => {
    const funds = [utxo(lovelace(ada(10)))];
    const parts = [output({ address: recipient, value: { lovelace: ada(2) } })];
    const built = await new TxBuilder({ params }).build({
      parts,
      changeAddress: wallet,
      utxos: funds,
      fee: ada(1),
    });
    expect(built.fee).toBe(ada(1));
    expect(built.prototype.body.fee).toBe("1000000");
    expectBalanced(built);

    await expectBuildError(
      new TxBuilder({ params }).build({
        parts,
        changeAddress: wallet,
        utxos: funds,
        fee: 1000n,
      }),
      "FEE_TOO_LOW",
    );
  });

  it("prices extra key witnesses into the fee", async () => {
    const request = {
      parts: [output({ address: recipient, value: { lovelace: ada(2) } })],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
    };
    const one = await new TxBuilder({ params }).build(request);
    const three = await new TxBuilder({ params }).build({
      ...request,
      extraKeyWitnesses: 2,
    });
    expect(three.fee - one.fee).toBe(2n * 101n * 44n);
  });

  it("donates to the treasury out of the inputs", async () => {
    const built = await new TxBuilder({ params }).build({
      parts: [donation({ amount: ada(7) })],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
    });
    expect(built.prototype.body.donation).toBe("7000000");
    expectBalanced(built);
  });
});

describe("TxBuilder: deposits and refunds", () => {
  const stake = keyHashToRewardAddress(keyHashHex(5), 0);
  const build = (
    parts: TxPart[],
    builder = new TxBuilder({
      params,
      deposits: { drepDeposit: ada(500), govActionDeposit: ada(1000) },
    }),
    extra: { registeredPools?: string[] } = {},
  ) =>
    builder.build({
      parts,
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(5000)))],
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
        new TxBuilder({ params }),
      ),
      "MISSING_PARAMETER",
    );
    expect(error.details).toEqual({ parameter: "govActionDeposit" });
  });

  it("withdraws a whole reward balance, looked up once", async () => {
    const { fetcher, calls } = fakeFetcher([], { [stake]: "4200000" });
    const built = await build(
      [withdrawal.pubKey({ rewardAddress: stake, amount: "all" })],
      new TxBuilder({ params, fetcher }),
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
    const built = await new TxBuilder({ params, fetcher }).build({
      parts: [
        spend.pubKey({ utxo: { txHash, outputIndex: 0 } }),
        spend.pubKey({ utxo: { txHash, outputIndex: 1 } }),
        spend.pubKey({ utxo: known.input }),
        output({ address: recipient, value: { lovelace: ada(8) } }),
      ],
      changeAddress: wallet,
      utxos: [known],
    });
    expect(calls).toEqual({ fetchUTxOs: 1 });
    expect(built.inputs).toHaveLength(3);
  });

  it("fetches the protocol parameters, and cost models only for Plutus scripts", async () => {
    const { fetcher, calls } = fakeFetcher([]);
    await new TxBuilder({ fetcher }).build({
      parts: [output({ address: recipient, value: { lovelace: ada(2) } })],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
    });
    expect(calls).toEqual({ fetchProtocolParameters: 1 });
  });

  it("needs a fetcher for outputs given by reference", async () => {
    await expectBuildError(
      new TxBuilder({ params }).build({
        parts: [
          spend.pubKey({ utxo: { txHash: "ee".repeat(32), outputIndex: 0 } }),
        ],
        changeAddress: wallet,
      }),
      "MISSING_FETCHER",
    );
  });

  it("reports an output that does not exist", async () => {
    const error = await expectBuildError(
      new TxBuilder({ params, fetcher: fakeFetcher([]).fetcher }).build({
        parts: [
          spend.pubKey({ utxo: { txHash: "ee".repeat(32), outputIndex: 3 } }),
        ],
        changeAddress: wallet,
      }),
      "UTXO_NOT_FOUND",
    );
    expect(error.message).toContain(`${"ee".repeat(32)}#3`);
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
      params,
      fetcher: fakeFetcher([locked]).fetcher,
      evaluator: fakeEvaluator().evaluator,
    }).build({
      parts: [
        spend.plutus({
          utxo: locked.input,
          script: plutusScript,
          redeemer: { data: mConStr0([]) },
        }),
      ],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
    });
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
    const built = await new TxBuilder({ params, evaluator }).build({
      parts: [scriptSpend(2), scriptSpend(1)],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
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
    const built = await new TxBuilder({ params, evaluator }).build({
      parts: [scriptSpend(1, { mem: 6000, steps: 8000 })],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
    });
    expect(built.redeemers[0]!.exUnits).toEqual({ mem: 6000, steps: 8000 });

    const error = await expectBuildError(
      new TxBuilder({ params, evaluator }).build({
        parts: [scriptSpend(1, { mem: 4000, steps: 8000 })],
        changeAddress: wallet,
        utxos: [utxo(lovelace(ada(10)))],
      }),
      "EXUNITS_TOO_LOW",
    );
    expect(error.label).toBe("spend 1");
  });

  it("builds offline when every redeemer states its units", async () => {
    const built = await new TxBuilder({ params }).build({
      parts: [scriptSpend(1, { mem: 6000, steps: 8000 })],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
    });
    expect(built.redeemers[0]!.exUnits).toEqual({ mem: 6000, steps: 8000 });
  });

  it("needs an evaluator for redeemers without units", async () => {
    await expectBuildError(
      new TxBuilder({ params }).build({
        parts: [scriptSpend(1)],
        changeAddress: wallet,
        utxos: [utxo(lovelace(ada(10)))],
      }),
      "MISSING_EVALUATOR",
    );
  });

  it("reports evaluation failures with the redeemers' parts", async () => {
    const evaluator: IEvaluator = {
      evaluateTx: async () => {
        throw new Error("script failed");
      },
    };
    const error = await expectBuildError(
      new TxBuilder({ params, evaluator }).build({
        parts: [scriptSpend(1)],
        changeAddress: wallet,
        utxos: [utxo(lovelace(ada(10)))],
      }),
      "EVALUATION_FAILED",
    );
    expect(error.message).toContain("script failed");
    expect(error.details).toMatchObject({
      redeemers: [{ tag: "SPEND", index: 0, part: "spend", label: "spend 1" }],
    });
  });

  it("reports scripts needing more than a transaction may use", async () => {
    const { evaluator } = fakeEvaluator({ mem: 9_000_000, steps: 1000 });
    await expectBuildError(
      new TxBuilder({ params, evaluator }).build({
        parts: [scriptSpend(1), scriptSpend(2)],
        changeAddress: wallet,
        utxos: [utxo(lovelace(ada(100)))],
      }),
      "EXUNITS_EXCEEDED",
    );
  });

  it("points redeemers of every purpose at their items", async () => {
    const scriptStake = scriptHashToRewardAddress(alwaysSucceedHash, 0);
    const witness = { plutus: plutusScript, redeemer: { data: mConStr0([]) } };
    const { evaluator } = fakeEvaluator();
    const built = await new TxBuilder({
      params,
      evaluator,
      deposits: { govActionDeposit: ada(10) },
    }).build({
      parts: [
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
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(100)))],
    });
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
      params,
      evaluator: fakeEvaluator().evaluator,
    }).build({
      parts: [
        scriptSpend(1),
        collateral({ utxo: held }),
        collateralReturn({ address: returnTo }),
      ],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
    });
    expect(built.collateral!.inputs).toEqual([held]);
    expect(built.prototype.body.collateral_return).toMatchObject({
      address: returnTo,
      amount: { coin: String(ada(20) - built.collateral!.total) },
    });
  });

  it("forfeits the whole collateral when what is left is too little to return", async () => {
    const tight = utxo(lovelace(ada(1)));
    const built = await new TxBuilder({
      params,
      evaluator: fakeEvaluator().evaluator,
    }).build({
      parts: [scriptSpend(1), collateral({ utxo: tight })],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
    });
    expect(built.collateral).toEqual({ inputs: [tight], total: ada(1) });
    expect(built.prototype.body.total_collateral).toBe(String(ada(1)));
    expect(built.prototype.body.collateral_return).toBeUndefined();
  });

  it("prefers a collateral UTxO that leaves a return worth making", async () => {
    const tight = utxo(lovelace(ada(1)));
    const roomy = utxo(lovelace(ada(3)));
    const built = await new TxBuilder({
      params,
      evaluator: fakeEvaluator().evaluator,
    }).build({
      parts: [scriptSpend(1)],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10))), tight, roomy],
    });
    expect(built.collateral!.inputs).toEqual([roomy]);
    expect(built.collateral!.return).toBeDefined();
  });

  it("reports missing collateral", async () => {
    await expectBuildError(
      new TxBuilder({ params, evaluator: fakeEvaluator().evaluator }).build({
        parts: [scriptSpend(1)],
        changeAddress: wallet,
        utxos: [],
      }),
      "INSUFFICIENT_COLLATERAL",
    );
    await expectBuildError(
      new TxBuilder({ params, evaluator: fakeEvaluator().evaluator }).build({
        parts: [scriptSpend(1), collateral({ utxo: utxo(lovelace(100_000n)) })],
        changeAddress: wallet,
        utxos: [utxo(lovelace(ada(10)))],
      }),
      "INSUFFICIENT_COLLATERAL",
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
    new TxBuilder({ params, evaluator: fakeEvaluator().evaluator }).build({
      parts,
      changeAddress: wallet,
      utxos,
    });

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
    const built = await new TxBuilder({ params, evaluator }).build({
      parts: [scriptSpend(), pay(5)],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
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
      new TxBuilder({ params, evaluator: fakeEvaluator().evaluator }).build({
        parts: [scriptSpend(), pay(5)],
        changeAddress: wallet,
        utxos: [utxo(lovelace(ada(10)))],
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
      params,
      evaluator: fakeEvaluator().evaluator,
    }).build({
      parts: [scriptSpend(), pay(10)],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(2)))],
      fee: 300_000n,
    });
    expect(built.fee).toBe(300_000n);
    expect(built.change.map((o) => o.amount.coin)).toEqual(["1700000"]);
    expectBalanced(built);
  });

  it("judges the fee in the first round when every redeemer states its units", async () => {
    const units = { mem: 1000, steps: 2000 };
    const request = {
      parts: [scriptSpend(units), pay(5)],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
      fee: 1000n,
    };
    await expectBuildError(
      new TxBuilder({ params, evaluator: null }).build(request),
      "FEE_TOO_LOW",
    );
    const { evaluator, calls } = fakeEvaluator();
    await expectBuildError(
      new TxBuilder({ params, evaluator }).build(request),
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
    const built = await new TxBuilder({ params }).build({
      parts: [
        output({ address: hexOf(recipient), value: { lovelace: ada(2) } }),
        withdrawal.pubKey({ rewardAddress: hexOf(stake), amount: 0n }),
      ],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
    });
    expect(built.prototype.body.outputs[0]!.address).toBe(recipient);
    expect(built.prototype.body.withdrawals).toEqual({ [stake]: "0" });
  });
});

/** `fakeFetcher` with jest mocks for methods, so its calls can be read by argument */
const mockedFetcher = (
  utxos: UTxO[],
  { rewards = {}, costModels = [] as number[][] } = {},
) => {
  const { fetcher } = fakeFetcher(utxos, rewards);
  const mocks = {
    fetchUTxOs: jest.fn(fetcher.fetchUTxOs),
    fetchAccountInfo: jest.fn(fetcher.fetchAccountInfo),
    fetchProtocolParameters: jest.fn(fetcher.fetchProtocolParameters),
    fetchCostModels: jest.fn(async (): Promise<number[][]> => costModels),
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
  const request = (parts: TxPart[], changeAddress = wallet) => ({
    parts,
    changeAddress,
    utxos: [utxo(lovelace(ada(10)))],
  });

  it("goes through the shared cache, each value fetched once across builds", async () => {
    const provider = mockedFetcher([locked, holdingScript, keyOutput]);
    const builder = new TxBuilder({
      fetcher: new CachedFetcher(provider.fetcher, { now: () => NOW }),
      evaluator: fakeEvaluator().evaluator,
    });
    await builder.build(request([scriptSpend()]));
    await builder.build(request([scriptSpend(), keySpend()]));

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
          fetcher: provider.fetcher,
          evaluator: fakeEvaluator().evaluator,
        }),
    );
    for (const builder of builders)
      await builder.build(request([scriptSpend()]));
    expect(provider.fetchUTxOs.mock.calls.map(([hash]) => hash).sort()).toEqual(
      [scriptHash, refHash].sort(),
    );
    expect(provider.fetchProtocolParameters).toHaveBeenCalledTimes(1);
    expect(provider.fetchCostModels).toHaveBeenCalledTimes(1);

    const other = mockedFetcher([keyOutput]);
    await CachedFetcher.wrap(other.fetcher).fetchUTxOs(otherHash);
    await new TxBuilder({ params, fetcher: other.fetcher }).build(
      request([keySpend()]),
    );
    expect(other.fetchUTxOs).toHaveBeenCalledTimes(1);
  });

  it("uses a CachedFetcher it is given as it is", async () => {
    const provider = mockedFetcher([]);
    // Keeps no parameters, as for a custom network
    const cache = new CachedFetcher(provider.fetcher, { network: "testnet" });
    const builder = new TxBuilder({ fetcher: cache });
    expect(builder.fetcher).toBe(cache);
    await builder.build(request([output({ address: recipient, value: {} })]));
    await builder.build(request([output({ address: recipient, value: {} })]));
    expect(provider.fetchProtocolParameters).toHaveBeenCalledTimes(2);
  });

  it("asks again after a failed or empty answer", async () => {
    const provider = mockedFetcher([keyOutput]);
    const builder = new TxBuilder({ params, fetcher: provider.fetcher });
    provider.fetchUTxOs.mockRejectedValueOnce(new Error("offline"));
    await expectBuildError(
      builder.build(request([keySpend()])),
      "UTXO_NOT_FOUND",
    );
    provider.fetchUTxOs.mockResolvedValueOnce([]);
    await expectBuildError(
      builder.build(request([keySpend()])),
      "UTXO_NOT_FOUND",
    );
    const built = await builder.build(request([keySpend()]));
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
        fetcher: new CachedFetcher(provider.fetcher, { now: () => NOW }),
        evaluator: fakeEvaluator().evaluator,
      });
      provider[method].mockRejectedValueOnce(new Error("down"));
      await expectBuildError(
        builder.build(request([scriptSpend()])),
        "MISSING_PARAMETER",
      );
      await builder.build(request([scriptSpend()]));
      expect(provider[method]).toHaveBeenCalledTimes(2);
    }
  });

  it("leaves the cached outputs as they are, out of what it builds", async () => {
    const original = structuredClone([keyOutput, holdingScript]);
    const provider = mockedFetcher([keyOutput, holdingScript]);
    const built = await new TxBuilder({
      params,
      fetcher: provider.fetcher,
    }).build(
      request([keySpend(), referenceInput({ utxo: holdingScript.input })]),
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
    const builder = new TxBuilder({ params, fetcher: provider.fetcher });
    const withdraw = () =>
      builder.build(
        request([withdrawal.pubKey({ rewardAddress: stake, amount: "all" })]),
      );
    const [first, second] = [await withdraw(), await withdraw()];
    expect(provider.fetchAccountInfo).toHaveBeenCalledTimes(1);
    expect(first.prototype.body.withdrawals).toEqual({ [stake]: "4200000" });
    expect(second.prototype.body.withdrawals).toEqual({ [stake]: "4200000" });
  });

  it("neither clears the cache nor sets its network", async () => {
    // A mainnet change address
    const bytes = bech32.fromWords(bech32.decode(wallet, 200).words);
    bytes[0] = 0x01;
    const mainnet = bech32.encode("addr", bech32.toWords(bytes), 200);
    const provider = mockedFetcher([locked, holdingScript]);
    const cache = CachedFetcher.wrap(provider.fetcher);
    const clear = jest.spyOn(cache, "clear");
    const clearVolatile = jest.spyOn(cache, "clearVolatile");
    await new TxBuilder({
      fetcher: provider.fetcher,
      evaluator: fakeEvaluator().evaluator,
    }).build(request([scriptSpend()], mainnet));
    expect(cache.network).toBeUndefined();
    expect(clear).not.toHaveBeenCalled();
    expect(clearVolatile).not.toHaveBeenCalled();
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
  const request = (parts: TxPart[]) => ({
    parts,
    changeAddress: wallet,
    utxos: [funds],
  });
  const scalusEvaluateTx = () =>
    jest.spyOn(OfflineEvaluatorScalus.prototype, "evaluateTx");

  afterEach(() => jest.restoreAllMocks());

  it("calls the evaluator with outputs only, never transactions", async () => {
    const { evaluator, evaluateTx } = mockedEvaluator();
    await new TxBuilder({
      fetcher: mockedFetcher([locked, holdingScript]).fetcher,
      evaluator,
    }).build(request([scriptSpend()]));
    expect(evaluateTx).toHaveBeenCalledTimes(2);
    for (const args of evaluateTx.mock.calls) {
      expect(args).toHaveLength(3);
      expect(args[2]).toEqual([]);
    }
  });

  it("gives every known UTxO only to an evaluator that accepts them", async () => {
    const local = mockedEvaluator({ acceptsKnownUtxos: true });
    await new TxBuilder({
      fetcher: mockedFetcher([locked, holdingScript]).fetcher,
      evaluator: local.evaluator,
    }).build(request([scriptSpend()]));
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
      fetcher: mockedFetcher([locked, holdingScript]).fetcher,
      evaluator: remote.evaluator,
    }).build(request([scriptSpend()]));
    expect(remote.evaluateTx.mock.calls.length).toBeGreaterThan(0);
    for (const [, utxos] of remote.evaluateTx.mock.calls)
      expect(utxos).toEqual([]);
  });

  it("configures the evaluator with the build's cost models before each evaluation", async () => {
    const fetched = [[1, 2], [3], [4, 5, 6]];
    const { evaluator, evaluateTx, configure } = mockedEvaluator({
      configurable: true,
    });
    await new TxBuilder({
      fetcher: mockedFetcher([locked, holdingScript], { costModels: fetched })
        .fetcher,
      evaluator,
    }).build(request([scriptSpend()]));
    expect(configure).toHaveBeenCalledTimes(evaluateTx.mock.calls.length);
    configure.mock.calls.forEach(([context], i) => {
      expect(context).toStrictEqual({ costModels: fetched });
      expect(configure.mock.invocationCallOrder[i]).toBeLessThan(
        evaluateTx.mock.invocationCallOrder[i]!,
      );
    });

    const given = [[7], [8], [9]];
    const other = mockedEvaluator({ configurable: true });
    await new TxBuilder({
      fetcher: mockedFetcher([locked, holdingScript], { costModels: fetched })
        .fetcher,
      costModels: given,
      evaluator: other.evaluator,
    }).build(request([scriptSpend()]));
    expect(other.configure.mock.calls.length).toBeGreaterThan(0);
    for (const [context] of other.configure.mock.calls)
      expect(context).toStrictEqual({ costModels: given });

    // An evaluator without configure is evaluated with all the same
    const plain = mockedEvaluator();
    await new TxBuilder({
      fetcher: mockedFetcher([locked, holdingScript]).fetcher,
      evaluator: plain.evaluator,
    }).build(request([scriptSpend()]));
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
      fetcher: mockedFetcher([locked, holdingScript], { costModels: fetched })
        .fetcher,
    });
    expect(own.evaluator).toBeInstanceOf(OfflineEvaluatorScalus);
    await own.build(request([scriptSpend()]));
    expect(ownEvaluateTx.mock.calls.length).toBeGreaterThan(0);
    expect(ownConfigure).toHaveBeenCalledTimes(ownEvaluateTx.mock.calls.length);
    ownConfigure.mock.calls.forEach(([context], i) => {
      expect(context).toStrictEqual({ costModels: fetched });
      expect(ownConfigure.mock.invocationCallOrder[i]).toBeLessThan(
        ownEvaluateTx.mock.invocationCallOrder[i]!,
      );
    });
  });

  it("is a Scalus evaluator of its own, given a fetcher and no evaluator", () => {
    const { fetcher } = fakeFetcher([]);
    const builder = new TxBuilder({ fetcher });
    expect(builder.evaluator).toBeInstanceOf(OfflineEvaluatorScalus);
    expect(builder.fetcher).toBe(fetcher);
    expect(
      new TxBuilder({ fetcher, evaluator: undefined }).evaluator,
    ).toBeInstanceOf(OfflineEvaluatorScalus);
    expect(new TxBuilder({ fetcher }).evaluator).not.toBe(builder.evaluator);

    const { evaluator } = fakeEvaluator();
    expect(new TxBuilder({ fetcher, evaluator }).evaluator).toBe(evaluator);
    expect(new TxBuilder({ params }).evaluator).toBeUndefined();
    expect(
      new TxBuilder({ fetcher, evaluator: null }).evaluator,
    ).toBeUndefined();
  });

  it("evaluates nothing after `evaluator: null`", async () => {
    const evaluateTx = scalusEvaluateTx();
    const builder = new TxBuilder({
      fetcher: mockedFetcher([locked, holdingScript]).fetcher,
      evaluator: null,
    });
    const built = await builder.build(
      request([scriptSpend({ mem: 6000, steps: 8000 })]),
    );
    expect(built.redeemers[0]!.exUnits).toEqual({ mem: 6000, steps: 8000 });
    await expectBuildError(
      builder.build(request([scriptSpend()])),
      "MISSING_EVALUATOR",
    );
    expect(evaluateTx).not.toHaveBeenCalled();
  });

  it("does not run the default evaluator for a transaction without Plutus scripts", async () => {
    const evaluateTx = scalusEvaluateTx();
    const builder = new TxBuilder({ fetcher: mockedFetcher([]).fetcher });
    expect(builder.evaluator).toBeInstanceOf(OfflineEvaluatorScalus);
    await builder.build(
      request([output({ address: recipient, value: { lovelace: ada(2) } })]),
    );
    expect(evaluateTx).not.toHaveBeenCalled();
  });
});

describe("TxBuilder: serialization", () => {
  it("serializes with a given serializer", async () => {
    const request = {
      parts: [output({ address: recipient, value: { lovelace: ada(2) } })],
      changeAddress: wallet,
      utxos: [utxo(lovelace(ada(10)))],
    };
    const cst = await new TxBuilder({ params }).build(request);
    const csl = await new TxBuilder({
      params,
      serializer: new CSLSerializer(),
    }).build(request);
    expect(csl.prototype).toEqual(cst.prototype);
    expect(csl.txHash).toBe(cst.txHash);
  });

  it("rejects a serializer without serializeTxPrototype", () => {
    const serializer = {
      ...new CSLSerializer(),
      serializeTxPrototype: undefined,
    };
    expect(() => new TxBuilder({ serializer: serializer as never })).toThrow(
      TxBuildError,
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
