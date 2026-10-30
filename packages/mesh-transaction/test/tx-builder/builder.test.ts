import {
  Action,
  DEFAULT_PROTOCOL_PARAMETERS,
  IEvaluator,
  IFetcher,
  mConStr0,
  Protocol,
  UTxO,
} from "@meshsdk/core";
import { CSLSerializer } from "@meshsdk/core-csl";
import {
  keyHashToRewardAddress,
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
