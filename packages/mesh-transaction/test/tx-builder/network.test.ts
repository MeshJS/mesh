import { bech32 } from "bech32";

import {
  CachedFetcher,
  customNetwork,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  EvaluationContext,
  IEvaluator,
  IFetcher,
  ISubmitter,
  mConStr0,
  NativeScript,
  networkConfig,
  Protocol,
  resolveNativeScriptHash,
  resolveScriptRef,
  SLOT_CONFIG_NETWORK,
  slotAt,
  timeAt,
  UTxO,
} from "@meshsdk/core";
import {
  keyHashToRewardAddress,
  OfflineEvaluatorScalus,
  resolvePlutusScriptAddress,
  scriptHashToBech32,
  scriptHashToRewardAddress,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";

import {
  assembleTxPrototype,
  certificate,
  ChainSnapshot,
  collateral,
  collateralReturn,
  networkId,
  NetworkMismatchDetails,
  output,
  proposal,
  Provider,
  referenceInput,
  spend,
  TxBuilder,
  TxBuildError,
  TxBuildErrorCode,
  TxError,
  TxPart,
  TxPartError,
  withdrawal,
} from "../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  keyHashHex,
  vrfKeyHashHex,
} from "../test-util";

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
const anchor = { url: "https://example.com/a.json", dataHash: "ab".repeat(32) };
const stake = keyHashToRewardAddress(keyHashHex(5), 0);
const mainnetStake = keyHashToRewardAddress(keyHashHex(5), 1);
/** A mainnet Byron address */
const byron = "Ae2tdPwUPEZ4YjgvykNpoFeYUxoyhNj2kg8KfKWN2FizsSpLUPv68MpTVDo";

/** The same base address on mainnet */
const onMainnet = (address: string) => {
  const bytes = bech32.fromWords(bech32.decode(address, 200).words);
  bytes[0] = bytes[0]! | 0x01;
  return bech32.encode("addr", bech32.toWords(bytes), 200);
};

const devnet = customNetwork({
  name: "devnet",
  systemStart: "2026-01-01T00:00:00Z",
  slotLengthMs: 200,
  epochLength: 500,
});

const ada = (n: number) => BigInt(n) * 1_000_000n;
const lovelace = (n: bigint) => [{ unit: "lovelace", quantity: String(n) }];
let nextHash = 0;
const utxo = (address = wallet, coin = ada(100), extra = {}): UTxO => ({
  input: {
    txHash: (0xa000 + ++nextHash).toString(16).padStart(64, "0"),
    outputIndex: 0,
  },
  output: { address, amount: lovelace(coin), ...extra },
});
const locked = () => utxo(scriptAddress, ada(10), { plutusData: "d87980" });
const pay = (address = recipient, label?: string) =>
  output({ address, value: { lovelace: ada(5) }, ...(label && { label }) });

/** A provider whose every call is recorded; methods can be replaced */
const fakeProvider = (
  utxos: UTxO[] = [],
  overrides: Partial<Record<keyof IFetcher, unknown>> & {
    network?: unknown;
  } = {},
) => {
  const calls: string[] = [];
  const record =
    <T>(name: string, answer: (...args: never[]) => T) =>
    async (...args: never[]) => {
      calls.push(name);
      return answer(...args);
    };
  const provider = {
    fetchUTxOs: record("fetchUTxOs", (hash: string) =>
      utxos.filter((u) => u.input.txHash === hash),
    ),
    fetchAccountInfo: record("fetchAccountInfo", () => ({
      active: true,
      balance: "0",
      rewards: "0",
      withdrawals: "0",
    })),
    fetchProtocolParameters: record("fetchProtocolParameters", () => params),
    fetchCostModels: record("fetchCostModels", () => costModels),
  } as Record<string, unknown>;
  for (const [name, answer] of Object.entries(overrides))
    provider[name] =
      typeof answer === "function"
        ? record(name, answer as () => unknown)
        : answer;
  return { provider: provider as unknown as IFetcher, calls };
};

const caught = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected an error");
};
const caughtSync = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected an error");
};
const expectCode = <C extends TxBuildErrorCode>(
  error: unknown,
  code: C,
): TxBuildError<C> => {
  expect(error).toBeInstanceOf(TxBuildError);
  expect(TxError.is(error, code)).toBe(true);
  return error as TxBuildError<C>;
};

const offline = (options: object = {}) =>
  new TxBuilder({
    network: "preprod",
    params,
    costModels,
    evaluator: null,
    ...options,
  });
const buildWith = (
  builder: TxBuilder,
  parts: TxPart[],
  payer: { changeAddress?: string; utxos?: UTxO[] } = {},
) =>
  builder.build(parts, {
    payer: { changeAddress: wallet, utxos: [utxo()], ...payer },
  });

describe("TxBuilder: construction", () => {
  it("needs a provider or params", () => {
    for (const options of [
      { network: "preprod" as const },
      { network: "preprod" as const, costModels },
    ]) {
      const error = expectCode(
        caughtSync(() => new TxBuilder(options)),
        "MISSING_PARAMETER",
      );
      expect(error.details).toEqual({ parameter: "params" });
      expect(error.message).toContain("provider");
      expect(error.message).toContain("params");
    }
  });

  it("constructs from params alone, or from a provider it calls nothing on", () => {
    expect(new TxBuilder({ network: "preprod", params }).params).toBe(params);
    const { provider, calls } = fakeProvider();
    const builder = new TxBuilder({ network: "preprod", provider });
    expect(builder.provider).toBe(provider);
    expect(calls).toEqual([]);
  });

  it("keeps a submitter, and calls it neither to build nor for chain()", async () => {
    const submitTx = jest.fn(async () => "hash");
    const submitter: ISubmitter = { submitTx };
    const { provider } = fakeProvider();
    const builder = new TxBuilder({ network: "preprod", provider, submitter });
    expect(builder.submitter).toBe(submitter);
    await buildWith(builder, [pay()]);
    await builder.chain();
    expect(submitTx).not.toHaveBeenCalled();
  });

  it("takes a provider of any shape that reads, and no fetcher option", async () => {
    // Both fit without a cast
    const fromEmulator = (emulator: ScalusEmulator): Provider => emulator;
    const fromFetcher = (fetcher: IFetcher): Provider => fetcher;
    void [fromEmulator, fromFetcher];

    const { provider, calls } = fakeProvider();
    const error = caughtSync(
      () =>
        // @ts-expect-error the builder has no fetcher option
        new TxBuilder({ network: "preprod", fetcher: provider }),
    );
    expect(expectCode(error, "MISSING_PARAMETER").details).toEqual({
      parameter: "params",
    });
    expect(calls).toEqual([]);
  });

  it("refuses a provider that states another public network", () => {
    const { provider } = fakeProvider([], { network: "mainnet" });
    const error = expectCode(
      caughtSync(() => new TxBuilder({ network: "preprod", provider })),
      "NETWORK_MISMATCH",
    );
    expect(error.details).toEqual({
      expected: { name: "preprod", networkId: 0 },
      found: [{ role: "provider", network: "mainnet" }],
    });
    expect(error.message).toContain("preprod");
    expect(error.message).toContain("mainnet");
  });

  it.each([["preprod"], [undefined], ["testnet"], ["Mainnet"], [1]])(
    "takes a provider stating %p under a preprod builder",
    (stated) => {
      const { provider } = fakeProvider([], { network: stated });
      expect(new TxBuilder({ network: "preprod", provider }).provider).toBe(
        provider,
      );
    },
  );

  it("reads the stated network from the provider, not from its shared cache", () => {
    // The shared cache's network is writable, and other code fills it with a guess
    const silent = fakeProvider().provider;
    CachedFetcher.wrap(silent).network = "mainnet";
    expect(
      new TxBuilder({ network: "preprod", provider: silent }).provider,
    ).toBe(silent);

    const stating = fakeProvider([], { network: "mainnet" }).provider;
    CachedFetcher.wrap(stating).network = "preprod";
    expectCode(
      caughtSync(
        () => new TxBuilder({ network: "preprod", provider: stating }),
      ),
      "NETWORK_MISMATCH",
    );
  });

  it("compares the provider's network by name, whatever the builder's network", () => {
    const preprod = fakeProvider([], { network: "preprod" }).provider;
    const error = expectCode(
      caughtSync(() => new TxBuilder({ network: devnet, provider: preprod })),
      "NETWORK_MISMATCH",
    );
    expect(error.details).toEqual({
      expected: { name: "devnet", networkId: 0 },
      found: [{ role: "provider", network: "preprod" }],
    });

    const asObject = networkConfig("preprod");
    expect(
      new TxBuilder({ network: asObject, provider: preprod }).network,
    ).toBe(asObject);
    const preview = fakeProvider([], { network: "preview" }).provider;
    expectCode(
      caughtSync(() => new TxBuilder({ network: asObject, provider: preview })),
      "NETWORK_MISMATCH",
    );
  });

  it("refuses a missing or unacceptable network with INVALID_OPTION", () => {
    const refused = (
      value: unknown,
      run = () => new TxBuilder({ network: value as never, params }),
    ) => {
      const error = expectCode(caughtSync(run), "INVALID_OPTION");
      expect(error.details.option).toBe("network");
      expect(error.details.value).toBe(value);
      expect(error.details.allowed).toContain("customNetwork");
      return error;
    };
    expect(
      refused(undefined, () => new TxBuilder({ params } as never)).cause,
    ).toBeUndefined();
    // @ts-expect-error the options are required
    refused(undefined, () => new TxBuilder());
    for (const name of ["testnet", "Mainnet"])
      expect(refused(name).cause).toBeInstanceOf(Error);
    for (const value of [
      0,
      {},
      { ...networkConfig("preprod"), networkId: 2 },
      { name: "zeros", networkId: 0, slotConfig: SLOT_CONFIG_NETWORK.testnet },
    ])
      expect(refused(value).cause).toBeUndefined();

    // A config named "testnet" with a real clock is a custom network like any other
    const named = { ...devnet, name: "testnet" };
    expect(new TxBuilder({ network: named, params }).network).toBe(named);
  });

  it("resolves its network once", () => {
    expect(new TxBuilder({ network: "preprod", params }).network).toEqual(
      networkConfig("preprod"),
    );
    expect(new TxBuilder({ network: devnet, params }).network).toBe(devnet);
  });

  it("does not write the shared cache's network", async () => {
    for (const network of ["preprod" as const, devnet]) {
      const { provider } = fakeProvider();
      const builder = new TxBuilder({ network, provider });
      await buildWith(builder, [pay()]);
      await builder.chain();
      expect(CachedFetcher.wrap(provider).network).toBeUndefined();
    }

    // A cache that keeps no parameters, as given: two builds read them twice
    const { provider, calls } = fakeProvider();
    const cache = new CachedFetcher(provider, { network: "testnet" });
    const builder = new TxBuilder({ network: devnet, provider: cache });
    await buildWith(builder, [pay()]);
    await buildWith(builder, [pay()]);
    expect(cache.network).toBe("testnet");
    expect(calls.filter((c) => c === "fetchProtocolParameters")).toHaveLength(
      2,
    );
  });

  it("exposes its configuration", () => {
    const { provider } = fakeProvider();
    const submitter: ISubmitter = { submitTx: async () => "hash" };
    const evaluator: IEvaluator = { evaluateTx: async () => [] };
    const builder = new TxBuilder({
      network: "preprod",
      provider,
      submitter,
      evaluator,
      deposits: { drepDeposit: 1n },
    });
    expect(builder.provider).toBe(provider);
    expect(builder.submitter).toBe(submitter);
    expect(builder.evaluator).toBe(evaluator);
    expect(builder.deposits).toEqual({ drepDeposit: 1n });

    const own = [
      new TxBuilder({ network: "preprod", provider }),
      new TxBuilder({ network: "preprod", provider }),
      new TxBuilder({ network: "preprod", params }),
      new TxBuilder({ network: "preprod", params }),
    ].map((b) => b.evaluator);
    for (const e of own) expect(e).toBeInstanceOf(OfflineEvaluatorScalus);
    expect(new Set(own).size).toBe(own.length);
    expect(
      new TxBuilder({ network: "preprod", params, evaluator: null }).evaluator,
    ).toBeUndefined();
  });
});

describe("TxBuilder: parameters and cost models", () => {
  const scriptSpend = (exUnits?: { mem: number; steps: number }) =>
    spend.plutus({
      utxo: locked(),
      script: plutusScript,
      redeemer: { data: mConStr0([]), ...(exUnits && { exUnits }) },
      label: "unlock",
    });
  const units = { mem: 100_000, steps: 100_000_000 };

  it("reads no parameters it is given", async () => {
    const { provider, calls } = fakeProvider();
    await buildWith(
      new TxBuilder({ network: "preprod", provider, params, evaluator: null }),
      [scriptSpend(units)],
    );
    expect(calls).toEqual(["fetchCostModels"]);

    const read = fakeProvider();
    await buildWith(
      new TxBuilder({
        network: "preprod",
        provider: read.provider,
        costModels,
        evaluator: null,
      }),
      [scriptSpend(units)],
    );
    expect(read.calls).toEqual(["fetchProtocolParameters"]);
  });

  it("needs cost models for a Plutus script, and only then", async () => {
    const builder = new TxBuilder({
      network: "preprod",
      params,
      evaluator: null,
    });
    const error = expectCode(
      await caught(() => buildWith(builder, [scriptSpend(units)])),
      "MISSING_PARAMETER",
    );
    expect(error.details).toEqual({ parameter: "costModels" });
    expect(error.message).toContain("costModels");
    await buildWith(builder, [pay()]);
  });

  it("needs the model of every Plutus version that runs", async () => {
    const error = expectCode(
      await caught(() =>
        buildWith(offline({ costModels: costModels.slice(0, 2) }), [
          scriptSpend(units),
        ]),
      ),
      "MISSING_PARAMETER",
    );
    expect(error.details).toEqual({ parameter: "costModels" });
    expect(error.message).toContain("V3");
  });

  it("takes cost models a provider has none of as missing", async () => {
    for (const answer of [[], undefined]) {
      const { provider } = fakeProvider([], {
        fetchCostModels: () => answer,
      });
      const error = expectCode(
        await caught(() =>
          buildWith(
            new TxBuilder({ network: "preprod", provider, evaluator: null }),
            [scriptSpend(units)],
          ),
        ),
        "MISSING_PARAMETER",
      );
      expect(error.details).toEqual({ parameter: "costModels" });
    }
  });

  it("takes parameters a provider answers with nothing as missing", async () => {
    for (const answer of [undefined, null]) {
      const { provider } = fakeProvider([], {
        fetchProtocolParameters: () => answer,
      });
      const builder = new TxBuilder({ network: "preprod", provider });
      for (const run of [
        () => buildWith(builder, [pay()]),
        () => builder.chain(),
      ]) {
        const error = expectCode(await caught(run), "MISSING_PARAMETER");
        expect(error.details).toEqual({ parameter: "params" });
        expect(error.cause).toBeUndefined();
      }
    }
  });

  it("hashes a datum without cost models when no script runs", async () => {
    const parts = [
      output({
        address: recipient,
        value: { lovelace: ada(5) },
        datum: { type: "hash", data: mConStr0([42]), embed: true },
      }),
    ];
    const built = await buildWith(
      new TxBuilder({ network: "preprod", params }),
      parts,
    );
    expect(built.prototype.body.script_data_hash).toMatch(/^[0-9a-f]{64}$/);

    const { provider, calls } = fakeProvider();
    await buildWith(new TxBuilder({ network: "preprod", provider }), parts);
    expect(calls).not.toContain("fetchCostModels");
  });

  it("keeps what it reads out of its params and costModels", async () => {
    const { provider } = fakeProvider();
    const builder = new TxBuilder({
      network: "preprod",
      provider,
      evaluator: null,
    });
    await buildWith(builder, [scriptSpend(units)]);
    await builder.chain();
    expect(builder.params).toBeUndefined();
    expect(builder.costModels).toBeUndefined();
  });
});

describe("TxBuilder: network checks", () => {
  const mismatch = async (
    parts: TxPart[],
    request: { changeAddress?: string; utxos?: UTxO[] } = {},
    builder = offline(),
  ) => {
    const error = expectCode(
      await caught(() => buildWith(builder, parts, request)),
      "NETWORK_MISMATCH",
    );
    expect(error.details.expected).toEqual({ name: "preprod", networkId: 0 });
    return error;
  };
  const found = (
    role: NetworkMismatchDetails["found"][number]["role"],
    address: string,
    part?: TxPart["kind"],
    label?: string,
  ) => ({
    role,
    address,
    networkId: 1,
    ...(part && { part }),
    ...(label && { label }),
  });

  it("refuses an output of another network, naming the part", async () => {
    const address = onMainnet(recipient);
    const error = await mismatch([pay(address, "to mainnet")]);
    expect(error.details.found).toEqual([
      found("output", address, "output", "to mainnet"),
    ]);
    expect(error.part).toBe("output");
    expect(error.label).toBe("to mainnet");
    expect(error.message).toContain(address);
  });

  it("checks every address a part names", async () => {
    const mainnetWallet = onMainnet(wallet);
    const cases: [TxPart, ReturnType<typeof found>][] = [
      [
        collateralReturn({ address: mainnetWallet, label: "back" }),
        found("collateralReturn", mainnetWallet, "collateralReturn", "back"),
      ],
      [
        withdrawal.pubKey({ rewardAddress: mainnetStake, amount: 0n }),
        found("withdrawal", mainnetStake, "withdrawal"),
      ],
      [
        proposal.info({ rewardAccount: mainnetStake, anchor, deposit: 1n }),
        found("rewardAccount", mainnetStake, "proposal"),
      ],
      [
        proposal.treasuryWithdrawals({
          rewardAccount: stake,
          anchor,
          deposit: 1n,
          withdrawals: { [mainnetStake]: 5n },
        }),
        found("rewardAccount", mainnetStake, "proposal"),
      ],
      [
        certificate.poolRegistration({
          params: {
            operator: keyHashHex(7),
            vrfKeyHash: vrfKeyHashHex(1),
            pledge: "1000000",
            cost: "340000000",
            margin: [1, 100],
            relays: [],
            owners: [keyHashHex(8)],
            rewardAddress: mainnetStake,
          },
        }),
        found("rewardAccount", mainnetStake, "certificate"),
      ],
    ];
    for (const [part, entry] of cases)
      expect((await mismatch([part])).details.found).toEqual([entry]);
  });

  it("checks the UTxOs parts hold in full", async () => {
    const mainnetWallet = onMainnet(wallet);
    const held = () => utxo(mainnetWallet, ada(20));
    const holder = utxo(mainnetWallet, ada(20), {
      scriptRef: resolveScriptRef(plutusScript),
    });
    const cases: [TxPart, TxPart["kind"], UTxO][] = [];
    const spent = held();
    cases.push([spend.pubKey({ utxo: spent }), "spend", spent]);
    const read = held();
    cases.push([referenceInput({ utxo: read }), "referenceInput", read]);
    const putUp = held();
    cases.push([collateral({ utxo: putUp }), "collateral", putUp]);
    cases.push([
      spend.plutus({
        utxo: locked(),
        script: { reference: holder },
        redeemer: { data: mConStr0([]), exUnits: { mem: 1, steps: 1 } },
      }),
      "spend",
      holder,
    ]);
    for (const [part, kind, held] of cases)
      expect((await mismatch([part])).details.found).toEqual([
        found("utxo", held.output.address, kind),
      ]);
  });

  it("checks a UTxO the provider gives for an out ref, once looked up", async () => {
    const fetched = utxo(onMainnet(wallet), ada(20));
    const { provider } = fakeProvider([fetched]);
    const error = await mismatch(
      [spend.pubKey({ utxo: fetched.input, label: "from chain" })],
      {},
      new TxBuilder({ network: "preprod", provider }),
    );
    expect(error.details.found).toEqual([
      found("utxo", fetched.output.address, "spend", "from chain"),
    ]);
    expect(error.label).toBe("from chain");
  });

  it("checks the request's UTxOs and change address", async () => {
    const funds = utxo(onMainnet(wallet));
    const error = await mismatch([pay()], { utxos: [funds] });
    expect(error.details.found).toEqual([found("utxo", funds.output.address)]);
    expect(error.part).toBeUndefined();

    const payer = await mismatch([pay()], { changeAddress: onMainnet(wallet) });
    expect(payer.details.found).toEqual([found("payer", onMainnet(wallet))]);
    expect(payer.part).toBeUndefined();
    expect(payer.label).toBeUndefined();
  });

  it("reports every mismatch in one error, then naming no part", async () => {
    const error = await mismatch(
      [pay(onMainnet(recipient), "a"), collateralReturn({ address: byron })],
      {},
    );
    expect(error.details.found).toEqual([
      found("output", onMainnet(recipient), "output", "a"),
      found("collateralReturn", byron, "collateralReturn"),
    ]);
    expect(error.part).toBeUndefined();
    expect(error.label).toBeUndefined();
  });

  it("refuses a payer of another network before finding it has no funds", async () => {
    const error = await mismatch([pay()], {
      changeAddress: onMainnet(wallet),
      utxos: [],
    });
    expect(error.details.found).toEqual([found("payer", onMainnet(wallet))]);
  });

  it("checks what it is given before any request", async () => {
    const { provider, calls } = fakeProvider([utxo()]);
    await mismatch(
      [
        spend.pubKey({ utxo: { txHash: "ee".repeat(32), outputIndex: 0 } }),
        pay(onMainnet(recipient)),
      ],
      {},
      new TxBuilder({ network: "preprod", provider }),
    );
    expect(calls).toEqual([]);
  });

  it("refuses a change address that is not an address before the network check", async () => {
    const error = expectCode(
      await caught(() =>
        buildWith(offline(), [pay(onMainnet(recipient))], {
          changeAddress: "not an address",
        }),
      ),
      "INVALID_OPTION",
    );
    expect(error.details).toMatchObject({
      option: "payer",
      value: "not an address",
    });
  });

  it("compares only network ids", async () => {
    const mainnetWallet = onMainnet(wallet);
    await buildWith(
      offline({ network: "mainnet" }),
      [pay(onMainnet(recipient))],
      { changeAddress: mainnetWallet, utxos: [utxo(mainnetWallet)] },
    );
    for (const network of ["preprod" as const, "preview" as const])
      await buildWith(offline({ network }), [pay()]);
  });

  it("finds a Byron address of the other network", async () => {
    const error = await mismatch([pay(byron)]);
    expect(error.details.found).toEqual([found("output", byron, "output")]);
  });

  it("does not check the networkId part, nor a reward address given as a credential", async () => {
    await buildWith(offline(), [
      networkId({ network: "mainnet" }),
      certificate.stakeDelegation({ stake: mainnetStake, pool: keyHashHex(2) }),
    ]);
  });
});

describe("TxBuilder: chain()", () => {
  it("gives the provider's parameters and cost models, and the network", async () => {
    const { provider } = fakeProvider();
    expect(
      await new TxBuilder({ network: "preprod", provider }).chain(),
    ).toEqual({ network: networkConfig("preprod"), params, costModels });
  });

  it("gives the options without calling the provider", async () => {
    const { provider, calls } = fakeProvider();
    const given = [[1], [2], [3]];
    const snapshot = await new TxBuilder({
      network: devnet,
      provider,
      params,
      costModels: given,
    }).chain();
    expect(snapshot).toEqual({ network: devnet, params, costModels: given });
    expect(calls).toEqual([]);
  });

  it("makes a builder without a provider from its JSON", async () => {
    const { provider } = fakeProvider();
    const snapshot = await new TxBuilder({
      network: "preprod",
      provider,
    }).chain();
    const copy: ChainSnapshot = JSON.parse(JSON.stringify(snapshot));
    const builder = new TxBuilder({ ...copy });
    expect(builder.provider).toBeUndefined();
    expect(await builder.chain()).toEqual(snapshot);
  });

  it("needs a source of cost models", async () => {
    const error = expectCode(
      await caught(() => new TxBuilder({ network: "preprod", params }).chain()),
      "MISSING_PARAMETER",
    );
    expect(error.details).toEqual({ parameter: "costModels" });

    for (const answer of [undefined, null]) {
      const { provider } = fakeProvider([], { fetchCostModels: () => answer });
      const none = expectCode(
        await caught(() =>
          new TxBuilder({ network: "preprod", provider }).chain(),
        ),
        "MISSING_PARAMETER",
      );
      expect(none.details).toEqual({ parameter: "costModels" });
    }

    const { provider } = fakeProvider([], { fetchCostModels: () => [] });
    expect(
      (await new TxBuilder({ network: "preprod", provider }).chain())
        .costModels,
    ).toEqual([]);
  });

  it("gives a new object each time", async () => {
    const builder = new TxBuilder({ network: "preprod", params, costModels });
    const parts = [pay()];
    const request = { utxos: [utxo()] };
    const before = await buildWith(builder, parts, request);
    const first = await builder.chain();
    const second = await builder.chain();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    (first.params as { minFeeA: number }).minFeeA = 1_000_000;
    first.costModels[0]![0] = -1;
    expect(second.params.minFeeA).toBe(params.minFeeA);
    expect(second.costModels[0]![0]).toBe(DEFAULT_V1_COST_MODEL_LIST[0]);
    expect(costModels[0]![0]).toBe(DEFAULT_V1_COST_MODEL_LIST[0]);
    expect((await buildWith(builder, parts, request)).fee).toBe(before.fee);
  });
});

describe("TxBuilder: addresses and slots on its network", () => {
  const single = alwaysSucceedCbor.slice(4);
  const flat = single.slice(4);
  const native: NativeScript = { type: "sig", keyHash: keyHashHex(3) };
  const preprod = new TxBuilder({ network: "preprod", params });
  const mainnet = new TxBuilder({ network: "mainnet", params });

  it("gives a script's address", () => {
    expect(preprod.scriptAddress(plutusScript)).toBe(
      resolvePlutusScriptAddress(plutusScript, 0),
    );
    expect(mainnet.scriptAddress(plutusScript)).toBe(
      resolvePlutusScriptAddress(plutusScript, 1),
    );
    for (const code of [flat, single])
      expect(preprod.scriptAddress({ code, version: "V3" })).toBe(
        scriptAddress,
      );
    expect(preprod.scriptAddress(native)).toBe(
      scriptHashToBech32(resolveNativeScriptHash(native), undefined, 0),
    );
  });

  it("gives a script's base address with a stake credential", () => {
    const keyBase = scriptHashToBech32(alwaysSucceedHash, keyHashHex(5), 0);
    expect(preprod.scriptAddress(plutusScript, stake)).toBe(keyBase);
    expect(
      preprod.scriptAddress(plutusScript, {
        type: "KEY",
        value: keyHashHex(5),
      }),
    ).toBe(keyBase);
    expect(
      preprod.scriptAddress(plutusScript, {
        type: "SCRIPT",
        value: alwaysSucceedHash,
      }),
    ).toBe(scriptHashToBech32(alwaysSucceedHash, alwaysSucceedHash, 0, true));
    // A reward address of another network carries only its credential
    expect(preprod.scriptAddress(plutusScript, mainnetStake)).toBe(keyBase);
  });

  it("gives reward addresses", () => {
    expect(preprod.rewardAddress(plutusScript)).toBe(
      scriptHashToRewardAddress(alwaysSucceedHash, 0),
    );
    expect(mainnet.rewardAddress({ type: "KEY", value: keyHashHex(5) })).toBe(
      keyHashToRewardAddress(keyHashHex(5), 1),
    );
    expect(
      preprod.rewardAddress({ type: "SCRIPT", value: alwaysSucceedHash }),
    ).toBe(scriptHashToRewardAddress(alwaysSucceedHash, 0));
    expect(preprod.rewardAddress(native)).toBe(
      scriptHashToRewardAddress(resolveNativeScriptHash(native), 0),
    );
    expect(preprod.rewardAddress(mainnetStake)).toBe(stake);
  });

  it("converts between times and slots on its clock", () => {
    const custom = new TxBuilder({ network: devnet, params });
    const time = devnet.slotConfig.zeroTime + 1050;
    expect(custom.slotAt(time)).toBe(slotAt(devnet, time));
    expect(custom.slotAt(time)).toBe(5);
    expect(custom.slotAt(new Date(time), "up")).toBe(6);
    expect(custom.slotAt(time, "up")).toBe(slotAt(devnet, time, "up"));
    expect(custom.timeAt(6)).toBe(timeAt(devnet, 6));
    expect(custom.timeAt(6n)).toBe(devnet.slotConfig.zeroTime + 1200);

    const now = Date.UTC(2026, 10, 12);
    expect(preprod.slotAt(now)).toBe(slotAt("preprod", now));
    expect(preprod.timeAt(100_000_000)).toBe(timeAt("preprod", 100_000_000));
  });

  it("reads nothing for them", () => {
    const calls: string[] = [];
    const provider = Object.fromEntries(
      [
        "fetchUTxOs",
        "fetchAccountInfo",
        "fetchProtocolParameters",
        "fetchCostModels",
      ].map((name) => [
        name,
        () => {
          calls.push(name);
          throw new Error("no reads");
        },
      ]),
    ) as unknown as IFetcher;
    const builder = new TxBuilder({ network: "preprod", provider });
    const results = [
      builder.scriptAddress(plutusScript),
      builder.rewardAddress(plutusScript),
      builder.slotAt(Date.UTC(2026, 10, 12)),
      builder.timeAt(1),
    ];
    for (const result of results)
      expect(["string", "number"]).toContain(typeof result);
    expect(calls).toEqual([]);
  });

  it("refuses bad arguments with INVALID_OPTION", () => {
    const notAScript = { code: "zz", version: "V3" as const };
    const cases: [() => unknown, string, unknown][] = [
      [() => preprod.scriptAddress(notAScript), "script", notAScript],
      [
        () => preprod.scriptAddress(plutusScript, "not an address"),
        "stake",
        "not an address",
      ],
      [
        () => preprod.rewardAddress("not an address"),
        "credential",
        "not an address",
      ],
      // A key hash is a credential only as { type: "KEY", value }
      [
        () => preprod.scriptAddress(plutusScript, keyHashHex(5)),
        "stake",
        keyHashHex(5),
      ],
      [() => preprod.rewardAddress(keyHashHex(5)), "credential", keyHashHex(5)],
      [() => preprod.slotAt(Number.NaN), "time", Number.NaN],
      [
        () => preprod.slotAt(Number.POSITIVE_INFINITY),
        "time",
        Number.POSITIVE_INFINITY,
      ],
      [() => preprod.slotAt(0, "sideways" as never), "round", "sideways"],
      [() => preprod.timeAt(Number.NaN), "slot", Number.NaN],
    ];
    const invalidDate = new Date(Number.NaN);
    cases.push([() => preprod.slotAt(invalidDate), "time", invalidDate]);
    for (const [run, option, value] of cases) {
      const error = expectCode(caughtSync(run), "INVALID_OPTION");
      expect(error).not.toBeInstanceOf(TxPartError);
      expect(error.details.option).toBe(option);
      expect(error.details.value).toBe(value);
      expect(error.part).toBeUndefined();
      expect(error.message).not.toMatch(/\b(output|withdrawal)\b/);
      if (option === "script") expect(error.cause).toBeInstanceOf(TxPartError);
    }
  });
});

describe("TxBuilder: its evaluator's configuration", () => {
  const scriptSpend = (exUnits?: { mem: number; steps: number }) =>
    spend.plutus({
      utxo: locked(),
      script: plutusScript,
      redeemer: { data: mConStr0([]), ...(exUnits && { exUnits }) },
      label: "unlock",
    });
  /** Prices every redeemer at fixed units, recording what it is told */
  const recording = (withConfigure = true) => {
    const contexts: EvaluationContext[] = [];
    const order: string[] = [];
    const evaluator: IEvaluator = {
      evaluateTx: async (tx) => {
        order.push("evaluateTx");
        const redeemers =
          Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ??
          [];
        return redeemers.map((r) => ({
          tag: "SPEND" as const,
          index: Number(r.index()),
          budget: { mem: 1000, steps: 2000 },
        }));
      },
      ...(withConfigure && {
        configure: (context: EvaluationContext) => {
          order.push("configure");
          contexts.push(context);
        },
      }),
    };
    return { evaluator, contexts, order };
  };

  it("tells the evaluator the network, its clock and the build's cost models", async () => {
    for (const [network, name, slotConfig] of [
      ["preprod", "preprod", networkConfig("preprod").slotConfig],
      [
        networkConfig("preprod"),
        "preprod",
        networkConfig("preprod").slotConfig,
      ],
      [devnet, "testnet", devnet.slotConfig],
    ] as const) {
      const { evaluator, contexts, order } = recording();
      await buildWith(
        new TxBuilder({ network, params, costModels, evaluator }),
        [scriptSpend()],
      );
      expect(contexts.length).toBeGreaterThan(0);
      for (const context of contexts)
        expect(context).toStrictEqual({
          network: name,
          slotConfig,
          costModels,
        });
      expect(order).toEqual(
        contexts.flatMap(() => ["configure", "evaluateTx"]),
      );
    }
    const plain = recording(false);
    await buildWith(
      new TxBuilder({
        network: "preprod",
        params,
        costModels,
        evaluator: plain.evaluator,
      }),
      [scriptSpend()],
    );
    expect(plain.order.length).toBeGreaterThan(0);
  });

  it("refuses a missing cost model before anything is evaluated", async () => {
    const short = recording();
    expect(
      expectCode(
        await caught(() =>
          buildWith(
            new TxBuilder({
              network: "preprod",
              params,
              costModels: costModels.slice(0, 2),
              evaluator: short.evaluator,
            }),
            [scriptSpend()],
          ),
        ),
        "MISSING_PARAMETER",
      ).details,
    ).toEqual({ parameter: "costModels" });
    expect(short.order).toEqual([]);

    const none = recording();
    const { provider } = fakeProvider([], { fetchCostModels: () => [] });
    expect(
      expectCode(
        await caught(() =>
          buildWith(
            new TxBuilder({
              network: "preprod",
              provider,
              evaluator: none.evaluator,
            }),
            [scriptSpend()],
          ),
        ),
        "MISSING_PARAMETER",
      ).details,
    ).toEqual({ parameter: "costModels" });
    expect(none.order).toEqual([]);
  });

  it("evaluates without a provider by default", async () => {
    const builder = new TxBuilder({ network: "preprod", params, costModels });
    const built = await buildWith(builder, [scriptSpend()]);
    expect(built.redeemers[0]!.exUnits.mem).toBeGreaterThan(0n);
    expect(built.redeemers[0]!.exUnits.steps).toBeGreaterThan(0n);

    const tooLow = { mem: 7, steps: 7 };
    expectCode(
      await caught(() => buildWith(builder, [scriptSpend(tooLow)])),
      "EXUNITS_TOO_LOW",
    );

    const none = offline();
    expectCode(
      await caught(() => buildWith(none, [scriptSpend()])),
      "MISSING_EVALUATOR",
    );
    const unchecked = await buildWith(none, [scriptSpend(tooLow)]);
    expect(unchecked.redeemers[0]!.exUnits).toEqual({ mem: 7n, steps: 7n });
  });
});

describe("assembleTxPrototype: cost models", () => {
  const parts = () => [
    spend.plutus({
      utxo: locked(),
      script: plutusScript,
      redeemer: { data: mConStr0([]), exUnits: { mem: 1000, steps: 2000 } },
    }),
    output({ address: wallet, value: { lovelace: ada(5) } }),
  ];

  it("needs the cost model of every Plutus version that runs", () => {
    const error = expectCode(
      caughtSync(() => assembleTxPrototype(parts(), { fee: 200_000n })),
      "MISSING_PARAMETER",
    );
    expect(error.details).toEqual({ parameter: "costModels" });
    // Its only source is options.costModels: the message points there and nowhere else
    expect(error.message).toContain("V3");
    expect(error.message).toContain("costModels");
    expect(error.message).not.toMatch(/builder|provider/);
    const { prototype } = assembleTxPrototype(parts(), {
      fee: 200_000n,
      costModels,
    });
    expect(prototype.body.script_data_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes the cost models it is given, and nothing in their place", () => {
    const same = parts();
    const hashWith = (models: number[][]) =>
      assembleTxPrototype(same, { fee: 200_000n, costModels: models }).prototype
        .body.script_data_hash;
    const other = [
      costModels[0]!,
      costModels[1]!,
      costModels[2]!.map((p) => p + 1),
    ];
    expect(hashWith(costModels)).not.toBe(hashWith(other));
  });
});
