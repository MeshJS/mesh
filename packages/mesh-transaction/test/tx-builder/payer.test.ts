import { bech32 } from "bech32";

import {
  Cip30WalletApi,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IEvaluator,
  IFetcher,
  ISubmitter,
  Protocol,
  resolveScriptRef,
  UTxO,
} from "@meshsdk/core";
import {
  Address,
  deserializeTxUnspentOutput,
  fromTxUnspentOutput,
  resolvePlutusScriptAddress,
  toTxUnspentOutput,
  TransactionInput,
  TransactionOutput,
  TransactionUnspentOutput,
} from "@meshsdk/core-cst";

import {
  BuildOptions,
  canSubmit,
  output,
  PartEntry,
  Payer,
  PayerSnapshot,
  RequiredKeys,
  spend,
  TxBuilder,
  TxBuilderOptions,
  TxBuildError,
  TxBuildErrorCode,
  TxError,
  TxPart,
} from "../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress, rewardAddress } from "../test-util";

const network = "preprod";
const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const wallet = baseAddress(1);
const recipient = baseAddress(2);

const hexOf = (address: string) =>
  Address.fromString(address)!.toBytes().toString();
const cborOf = (utxo: UTxO) => toTxUnspentOutput(utxo).toCbor().toString();
const onMainnet = (address: string) => {
  const bytes = bech32.fromWords(bech32.decode(address, 200).words);
  bytes[0] = bytes[0]! | 0x01;
  return bech32.encode("addr", bech32.toWords(bytes), 200);
};
/** A mainnet Byron address */
const byron =
  "DdzFFzCqrhswh7xiYG8RE1TtcvWamhbExTXfsCYaF9PrGWHRLCwCsBH5JkeApUagvo4FZE3DJD3rn5hw8vaMBib2StKMJ77rJHt51jPt";

const ada = (n: number) => BigInt(n) * 1_000_000n;
let nextHash = 0x500;
const utxo = (lovelace: bigint, extra: Partial<UTxO["output"]> = {}): UTxO => ({
  input: {
    txHash: (++nextHash).toString(16).padStart(64, "0"),
    outputIndex: 0,
  },
  output: {
    address: wallet,
    amount: [{ unit: "lovelace", quantity: String(lovelace) }],
    ...extra,
  },
});
const pay = (n = 2, address = recipient) =>
  output({ address, value: { lovelace: ada(n) } });

/** The wallet's funds, the same objects in every test */
const funds = [utxo(ada(10)), utxo(ada(20))];

/** Serves UTxOs at their addresses and by hash, recording every call */
const fakeProvider = (utxos: UTxO[] = funds) => {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = (method: string, args: unknown[]) =>
    calls.push({ method, args });
  const provider = {
    fetchAddressUTxOs: async (...args: [string]) => {
      record("fetchAddressUTxOs", args);
      return utxos.filter((u) => u.output.address === args[0]);
    },
    fetchUTxOs: async (...args: [string]) => {
      record("fetchUTxOs", args);
      return utxos.filter((u) => u.input.txHash === args[0]);
    },
    fetchProtocolParameters: async (...args: unknown[]) => {
      record("fetchProtocolParameters", args);
      return params;
    },
    fetchAccountInfo: async (...args: unknown[]) => {
      record("fetchAccountInfo", args);
      return { active: true, balance: "0", rewards: "0", withdrawals: "0" };
    },
  } as unknown as IFetcher;
  const count = (method: string) =>
    calls.filter((c) => c.method === method).length;
  return { provider, calls, count, utxos };
};

/** A wallet in the Mesh format, counting its calls */
const meshFormat = (
  answers: {
    address?: string;
    utxos?: unknown;
    networkId?: number;
  } = {},
) => {
  const calls: string[] = [];
  const wallet_ = {
    getChangeAddress: jest.fn(async () => {
      calls.push("getChangeAddress");
      return answers.address ?? wallet;
    }),
    getUtxos: jest.fn(async () => {
      calls.push("getUtxos");
      return (answers.utxos ?? funds) as UTxO[];
    }),
    getNetworkId: jest.fn(async () => {
      calls.push("getNetworkId");
      return answers.networkId ?? 0;
    }),
  };
  return { wallet: wallet_, calls };
};

/** The same wallet as a CIP-30 api: hex address, CBOR UTxOs; or `getUtxos` answering this */
const cip30 = (...answer: [unknown?]) => ({
  getNetworkId: jest.fn(async () => 0),
  getChangeAddress: jest.fn(async () => hexOf(wallet)),
  getUtxos: jest.fn(
    async () =>
      (answer.length > 0 ? answer[0] : funds.map(cborOf)) as
        string[] | null | undefined,
  ),
  signTx: jest.fn(async () => "a0"),
});

/** Rejects with the given value */
const rejecting = (error: unknown) =>
  jest.fn(async (): Promise<never> => {
    throw error;
  });

const offline = (options: Partial<TxBuilderOptions> = {}) =>
  new TxBuilder({ network, params, ...options });

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

/** A promise and the function settling it */
const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("TxBuilder: parts input", () => {
  const payer = { changeAddress: wallet, utxos: funds };

  it("builds one part given without a list as the part in a list", async () => {
    const one = await offline().build(pay(), { payer });
    const listed = await offline().build([pay()], { payer });
    expect(one.tx).toBe(listed.tx);
  });

  it("flattens nested lists in order and drops false, null and undefined", async () => {
    const [a, b, c] = [2, 3, 4].map((n) => pay(n, baseAddress(n)));
    const nested = await offline().build(
      [a, [b, [c]], false, null, undefined],
      { payer },
    );
    const flat = await offline().build([a, b, c], { payer });
    expect(nested.tx).toBe(flat.tx);
    expect(
      nested.prototype.body.outputs.slice(0, 3).map((o) => o.address),
    ).toEqual([baseAddress(2), baseAddress(3), baseAddress(4)]);
  });

  it("is typed: parts, no wallet, no selectInputs, PartEntry and RequiredKeys exported", () => {
    const entries: PartEntry[] = [pay(), [pay(), false], null, undefined];
    const keys: RequiredKeys = ["ab".repeat(28)];
    const typeOnly = (builder: TxBuilder) => {
      // @ts-expect-error a list entry that is not a part
      void builder.build([pay(), { kind: "nothing" }], { payer });
      // @ts-expect-error there is no selectInputs option
      void builder.build(pay(), { payer, selectInputs: () => [] });
      // @ts-expect-error the builder takes no wallet
      void new TxBuilder({ network, params, wallet: payer });
      // @ts-expect-error a build takes no wallet: the payer is
      void builder.build(pay(), { wallet: payer });
    };
    // @ts-expect-error the request type is gone
    type Gone = import("../../src/tx-builder").BuildTxRequest;
    expect(entries).toHaveLength(4);
    expect(keys).toHaveLength(1);
    expect(typeof typeOnly).toBe("function");
    expect(null as unknown as Gone).toBeNull();
  });
});

describe("TxBuilder: payer forms", () => {
  it("is MISSING_PAYER without a payer, before any request, naming the forms", async () => {
    const { provider, calls } = fakeProvider();
    const builder = new TxBuilder({ network, params, provider });
    // With no payer, a bad value of any other option or of the parts is not judged yet
    const cases: [PartEntry[] | TxPart, BuildOptions | undefined][] = [
      [pay(), undefined],
      [pay(), {}],
      [pay(), { payer: undefined }],
      [pay(), { payer: null as never }],
      [pay(), { sendAllTo: "not an address" }],
      [pay(), { fee: 1000 as unknown as bigint }],
      [pay(), { extraKeyWitnesses: -1 }],
      [pay(), { registeredPools: "pool" as unknown as string[] }],
      [[pay(), 5 as unknown as TxPart], {}],
    ];
    for (const [parts, options] of cases) {
      const error = await expectCode(
        () => builder.build(parts, options),
        "MISSING_PAYER",
      );
      expect(error.message).toMatch(/wallet/);
      expect(error.message).toMatch(/address/);
      expect(error.message).toMatch(/snapshot/);
      expect(error.retryable).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it("builds from a snapshot without a provider or any request, the same bytes each time", async () => {
    const payer = { changeAddress: wallet, utxos: funds };
    const first = await offline().build(pay(), { payer });
    const second = await offline().build(pay(), { payer });
    expect(second.tx).toBe(first.tx);
    expect(second.txHash).toBe(first.txHash);
    expect(first.change[0]!.output.address).toBe(wallet);
  });

  it("takes a snapshot with a hex address and CBOR UTxOs, mixed with objects", async () => {
    const objects = await offline().build(pay(), {
      payer: { changeAddress: wallet, utxos: funds },
    });
    const cbor = await offline().build(pay(), {
      payer: { changeAddress: hexOf(wallet), utxos: funds.map(cborOf) },
    });
    const mixed = await offline().build(pay(), {
      payer: { changeAddress: wallet, utxos: [cborOf(funds[0]!), funds[1]!] },
    });
    expect(cbor.tx).toBe(objects.tx);
    expect(mixed.tx).toBe(objects.tx);
  });

  it("reads a Mesh-format wallet once per build, its three reads started together", async () => {
    const { open, opened } = gate();
    const started: string[] = [];
    const gated = <T>(name: string, value: T) =>
      jest.fn(async () => {
        started.push(name);
        await opened;
        return value;
      });
    const payer = {
      getChangeAddress: gated("getChangeAddress", wallet),
      getUtxos: gated("getUtxos", funds),
      getNetworkId: gated("getNetworkId", 0),
    };
    const building = offline().build(pay(), { payer });
    await tick();
    expect(started.sort()).toEqual([
      "getChangeAddress",
      "getNetworkId",
      "getUtxos",
    ]);
    open();
    const built = await building;
    for (const read of Object.values(payer))
      expect(read).toHaveBeenCalledTimes(1);
    const snapshot = await offline().build(pay(), {
      payer: { changeAddress: wallet, utxos: funds },
    });
    expect(built.tx).toBe(snapshot.tx);
  });

  it("reads a CIP-30 api, converting its hex address and CBOR UTxOs", async () => {
    const api = cip30();
    const fromApi = await offline().build(pay(), { payer: api });
    const fromMesh = await offline().build(pay(), {
      payer: meshFormat().wallet,
    });
    expect(fromApi.tx).toBe(fromMesh.tx);
    expect(api.getUtxos).toHaveBeenCalledWith();
    expect(api.signTx).not.toHaveBeenCalled();
    for (const none of [null, undefined]) {
      const error = await expectCode(
        () => offline().build(pay(), { payer: cip30(none) }),
        "INSUFFICIENT_FUNDS",
      );
      expect(error.details.reason).toBe("noUtxos");
      expect(error.message).toContain(wallet);
    }
  });

  it("reads an address payer's UTxOs through the provider, bech32 or hex alike", async () => {
    const built: string[] = [];
    for (const payer of [wallet, hexOf(wallet)]) {
      const { provider, calls } = fakeProvider();
      const result = await new TxBuilder({ network, params, provider }).build(
        pay(),
        { payer },
      );
      expect(calls.filter((c) => c.method === "fetchAddressUTxOs")).toEqual([
        { method: "fetchAddressUTxOs", args: [wallet] },
      ]);
      expect(result.change.map((o) => o.output.address)).toEqual([wallet]);
      built.push(result.tx);
    }
    expect(built[1]).toBe(built[0]);
  });

  it("reads the payer's UTxOs past the short-lived cache, each build", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    try {
      const fake = fakeProvider([...funds]);
      // Without params, which are read through the cache
      const builder = new TxBuilder({ network, provider: fake.provider });
      const first = await builder.build(pay(25), { payer: wallet });
      const gained = utxo(ada(100));
      fake.utxos.push(gained);
      const second = await builder.build(pay(25), { payer: wallet });
      expect(fake.count("fetchAddressUTxOs")).toBe(2);
      expect(fake.count("fetchProtocolParameters")).toBe(1);
      expect(first.inputs).not.toContainEqual(gained);
      expect(second.inputs).toContainEqual(gained);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it("reads a wallet without getUtxos at its change address, through the provider, uncached", async () => {
    const fake = fakeProvider();
    const builder = new TxBuilder({ network, params, provider: fake.provider });
    const payer = {
      getChangeAddress: async () => wallet,
      getNetworkId: async () => 0,
    };
    const built = await builder.build(pay(), { payer });
    await builder.build(pay(), { payer });
    expect(fake.calls.filter((c) => c.method === "fetchAddressUTxOs")).toEqual([
      { method: "fetchAddressUTxOs", args: [wallet] },
      { method: "fetchAddressUTxOs", args: [wallet] },
    ]);
    expect(built.selectedInputs.length).toBeGreaterThan(0);
  });

  it("reads through the provider a wallet that needs a fetcher, by code or by message", async () => {
    const coded = Object.assign(new Error("no fetcher"), {
      code: "FETCHER_REQUIRED",
    });
    const released = new Error(
      "[MeshWallet] Fetcher is required to fetch UTxOs. Please provide a fetcher.",
    );
    for (const error of [coded, released]) {
      const fake = fakeProvider();
      const payer = { ...meshFormat().wallet, getUtxos: rejecting(error) };
      await new TxBuilder({ network, params, provider: fake.provider }).build(
        pay(),
        { payer },
      );
      expect(fake.count("fetchAddressUTxOs")).toBe(1);
    }
  });

  it("does not mask any other error of getUtxos", async () => {
    const fake = fakeProvider();
    const error = await expectCode(
      () =>
        new TxBuilder({ network, params, provider: fake.provider }).build(
          pay(),
          {
            payer: {
              ...meshFormat().wallet,
              getUtxos: rejecting(new Error("Fetcher went away")),
            },
          },
        ),
      "WALLET_FAILED",
    );
    expect((error.cause as Error).message).toBe("Fetcher went away");
    expect(fake.count("fetchAddressUTxOs")).toBe(0);
  });

  it("is WALLET_FAILED with the CIP-30 code and the wallet's error as cause", async () => {
    const apiError = { code: -3, info: "account changed" };
    for (const read of ["getChangeAddress", "getUtxos", "getNetworkId"]) {
      const payer = { ...cip30(), [read]: rejecting(apiError) };
      const error = await expectCode(
        () => offline().build(pay(), { payer }),
        "WALLET_FAILED",
      );
      expect(error.details.walletCode).toBe(-3);
      expect(error.cause).toBe(apiError);
      expect(error.retryable).toBe(false);
    }
    const plain = new Error("broken");
    const error = await expectCode(
      () =>
        offline().build(pay(), {
          payer: { ...cip30(), getNetworkId: rejecting(plain) },
        }),
      "WALLET_FAILED",
    );
    expect(error.details.walletCode).toBeUndefined();
    expect(error.cause).toBe(plain);
  });

  it("is MISSING_FETCHER when the payer's UTxOs need a provider and there is none", async () => {
    await expectCode(
      () => offline().build(pay(), { payer: wallet }),
      "MISSING_FETCHER",
    );
    const payer = { getChangeAddress: jest.fn(async () => wallet) };
    await expectCode(
      () => offline().build(pay(), { payer }),
      "MISSING_FETCHER",
    );
  });

  it("is PROVIDER_FAILED when the provider cannot read the payer's UTxOs", async () => {
    const offlineError = new Error("offline");
    const { provider } = fakeProvider();
    provider.fetchAddressUTxOs = rejecting(offlineError);
    const error = await expectCode(
      () =>
        new TxBuilder({ network, params, provider }).build(pay(), {
          payer: wallet,
        }),
      "PROVIDER_FAILED",
    );
    expect(error.details).toEqual({ operation: "fetchAddressUTxOs" });
    expect(error.cause).toBe(offlineError);
    expect(error.retryable).toBe(false);
  });

  it("checks the payer's network before anything is selected", async () => {
    const roleOf = async (payer: Payer, provider?: IFetcher) => {
      const error = await expectCode(
        () => offline(provider ? { provider } : {}).build(pay(1000), { payer }),
        "NETWORK_MISMATCH",
      );
      return error.details.found.map((f) => f.role);
    };
    expect(
      await roleOf({
        ...meshFormat({ networkId: 1 }).wallet,
        getUtxos: async () => [],
      }),
    ).toEqual(["wallet"]);
    const mainnet = onMainnet(wallet);
    // A given address is checked before any request
    const addressRead = fakeProvider();
    expect(await roleOf(mainnet, addressRead.provider)).toEqual(["payer"]);
    expect(addressRead.calls).toEqual([]);
    const foreign = { ...utxo(ada(1)) };
    foreign.output = { ...foreign.output, address: mainnet };
    expect(await roleOf({ changeAddress: wallet, utxos: [foreign] })).toEqual([
      "utxo",
    ]);

    // What a wallet or a provider answers is checked too
    expect(
      await roleOf(meshFormat({ address: mainnet, utxos: [] }).wallet),
    ).toEqual(["payer"]);
    expect(await roleOf(meshFormat({ utxos: [foreign] }).wallet)).toEqual([
      "utxo",
    ]);
    const servingForeign = fakeProvider();
    servingForeign.provider.fetchAddressUTxOs = async () => [foreign];
    expect(await roleOf(wallet, servingForeign.provider)).toEqual(["utxo"]);

    // A wallet read through the provider is checked before the provider is asked, so a provider
    // that refuses an address of another network does not hide the mismatch
    const fetcherRequired = Object.assign(new Error("no fetcher"), {
      code: "FETCHER_REQUIRED",
    });
    for (const [payer, roles] of [
      [
        {
          getChangeAddress: async () => mainnet,
          getNetworkId: async () => 1,
        },
        ["wallet", "payer"],
      ],
      [{ getChangeAddress: async () => mainnet }, ["payer"]],
      [
        {
          ...meshFormat({ address: mainnet, networkId: 1 }).wallet,
          getUtxos: rejecting(fetcherRequired),
        },
        ["wallet", "payer"],
      ],
    ] as [Payer, string[]][]) {
      const refusing = fakeProvider();
      const refuse = rejecting(new Error("400: address of another network"));
      refusing.provider.fetchAddressUTxOs = refuse;
      expect(await roleOf(payer, refusing.provider)).toEqual(roles);
      expect(refuse).not.toHaveBeenCalled();
      expect(refusing.calls).toEqual([]);
    }
    // Only mainnet and the test networks are told apart
    await offline().build(pay(), {
      payer: meshFormat({ networkId: 7 }).wallet,
    });
  });

  it("decodes CBOR UTxOs as core-cst does, keeping datums and reference scripts", async () => {
    const script = resolveScriptRef({ code: alwaysSucceedCbor, version: "V3" });
    const inline = utxo(ada(3), {
      plutusData: "d87980",
    });
    const hashed = utxo(ada(3), { dataHash: "ab".repeat(32) });
    const withScript = utxo(ada(30), { scriptRef: script });
    const snapshot = await offline().readPayer({
      changeAddress: wallet,
      utxos: [inline, hashed, withScript].map(cborOf),
    });
    expect(snapshot.utxos).toEqual(
      [inline, hashed, withScript].map((u) =>
        fromTxUnspentOutput(deserializeTxUnspentOutput(cborOf(u))),
      ),
    );
    expect(snapshot.utxos[0]!.output.plutusData).toBe("d87980");
    expect(snapshot.utxos[0]!.output.dataHash).toBeDefined();
    expect(snapshot.utxos[2]!.output.scriptRef).toBe(script);

    // Byron addresses in base58, on a mainnet builder
    const mainnet = new TxBuilder({ network: "mainnet", params });
    const atByron = new TransactionUnspentOutput(
      TransactionInput.fromCore({ txId: "cd".repeat(32), index: 0 } as never),
      TransactionOutput.fromCore({
        address: byron,
        value: { coins: ada(2) },
      } as never),
    );
    const byronSnapshot = await mainnet.readPayer({
      changeAddress: hexOf(byron),
      utxos: [atByron.toCbor().toString()],
    });
    expect(byronSnapshot.changeAddress).toBe(byron);
    expect(byronSnapshot.utxos[0]!.output.address).toBe(byron);
  });

  it("matches a payer UTxO written with an upper-case hash to a part naming it in lower case", async () => {
    const own = utxo(ada(10));
    own.input.txHash = "ab".repeat(32);
    const upper = {
      ...own,
      input: { ...own.input, txHash: own.input.txHash.toUpperCase() },
    };
    const built = await offline().build(
      [spend.pubKey({ utxo: own.input }), pay()],
      { payer: { changeAddress: wallet, utxos: [upper] } },
    );
    expect(built.inputs).toEqual([own]);
    expect(built.selectedInputs).toEqual([]);
  });

  it("reads every form with readPayer into bech32 and UTxO objects", async () => {
    const fake = fakeProvider();
    const builder = new TxBuilder({ network, params, provider: fake.provider });
    const expected: PayerSnapshot = { changeAddress: wallet, utxos: funds };
    expect(await builder.readPayer(cip30())).toEqual(expected);
    expect(await builder.readPayer(meshFormat().wallet)).toEqual(expected);
    expect(await builder.readPayer(hexOf(wallet))).toEqual(expected);
    // A snapshot: no provider needed, and none asked when there is one
    const given = { changeAddress: hexOf(wallet), utxos: funds.map(cborOf) };
    expect(await offline().readPayer(given)).toEqual(expected);
    const callsBefore = fake.calls.length;
    expect(await builder.readPayer(given)).toEqual(expected);
    expect(fake.calls.length).toBe(callsBefore);
    await expectCode(
      () => builder.readPayer(undefined as never),
      "MISSING_PAYER",
    );
    // A build on one read builds what a build reading the payer builds
    const api = cip30();
    const onRead = await builder.build(pay(), {
      payer: await builder.readPayer(api),
    });
    const reading = await builder.build(pay(), { payer: api });
    expect(onRead.tx).toBe(reading.tx);
  });

  it("resolves a part naming a snapshot payer's UTxO by out ref, with no lookup", async () => {
    const fake = fakeProvider();
    const built = await new TxBuilder({
      network,
      params,
      provider: fake.provider,
    }).build([spend.pubKey({ utxo: funds[1]!.input }), pay()], {
      payer: { changeAddress: wallet, utxos: funds },
    });
    expect(built.inputs).toContainEqual(funds[1]);
    expect(fake.count("fetchUTxOs")).toBe(0);
  });
});

describe("TxBuilder: the payer read and the other reads", () => {
  const other = utxo(ada(5));
  other.input.txHash = "ee".repeat(32);

  it("starts the wallet's reads and the lookups together", async () => {
    const { open, opened } = gate();
    const started: string[] = [];
    const gated = <T>(name: string, value: () => T) =>
      jest.fn(async () => {
        started.push(name);
        await opened;
        return value();
      });
    const fake = fakeProvider([...funds, other]);
    const provider = {
      ...fake.provider,
      fetchUTxOs: gated("fetchUTxOs", () => [other]),
    } as unknown as IFetcher;
    const payer = {
      getChangeAddress: gated("getChangeAddress", () => wallet),
      getUtxos: gated("getUtxos", () => funds),
      getNetworkId: gated("getNetworkId", () => 0),
    };
    const building = new TxBuilder({ network, params, provider }).build(
      [spend.pubKey({ utxo: other.input }), pay()],
      { payer },
    );
    await tick();
    expect(started.sort()).toEqual([
      "fetchUTxOs",
      "getChangeAddress",
      "getNetworkId",
      "getUtxos",
    ]);
    open();
    expect((await building).inputs).toContainEqual(other);
  });

  it("looks up a wallet payer's UTxO a part names by out ref", async () => {
    const fake = fakeProvider();
    const part = spend.pubKey({ utxo: funds[0]!.input });
    await new TxBuilder({ network, params, provider: fake.provider }).build(
      [part, pay()],
      { payer: meshFormat().wallet },
    );
    expect(fake.count("fetchUTxOs")).toBe(1);
    await expectCode(
      () => offline().build([part, pay()], { payer: meshFormat().wallet }),
      "MISSING_FETCHER",
    );
  });

  it("keeps the copy a part gives in full over the payer's", async () => {
    const script = { code: alwaysSucceedCbor, version: "V3" as const };
    const locked: UTxO = {
      input: { txHash: "dd".repeat(32), outputIndex: 0 },
      output: {
        address: resolvePlutusScriptAddress(script, 0),
        amount: [{ unit: "lovelace", quantity: String(ada(5)) }],
        plutusData: "d87980",
      },
    };
    // The wallet lists the same out ref with another datum
    const listed: UTxO = {
      ...locked,
      output: { ...locked.output, plutusData: "d87a80" },
    };
    const seen: UTxO[][] = [];
    const evaluator: IEvaluator = {
      acceptsKnownUtxos: true,
      evaluateTx: async (_tx, utxos) => {
        seen.push(utxos ?? []);
        return [{ tag: "SPEND", index: 0, budget: { mem: 1000, steps: 2000 } }];
      },
    };
    const built = await offline({ evaluator, costModels }).build(
      [spend.plutus({ utxo: locked, script, redeemer: { data: 0 } })],
      { payer: meshFormat({ utxos: [...funds, listed] }).wallet },
    );
    expect(built.inputs).toContainEqual(locked);
    expect(seen.length).toBeGreaterThan(0);
    for (const utxos of seen) {
      expect(utxos).toContainEqual(locked);
      expect(utxos).not.toContainEqual(listed);
    }
  });
});

describe("TxBuilder: bad values", () => {
  /** Every call a wallet or a provider gets */
  const watched = () => {
    const fake = fakeProvider();
    const builder = new TxBuilder({ network, params, provider: fake.provider });
    const { wallet: walletPayer, calls } = meshFormat();
    return { builder, fake, walletPayer, calls };
  };
  const invalid = async (
    option: string,
    run: (builder: TxBuilder, walletPayer: Payer) => unknown,
  ) => {
    const { builder, fake, walletPayer, calls } = watched();
    const error = await expectCode(
      () => run(builder, walletPayer),
      "INVALID_OPTION",
    );
    expect(error.details.option).toBe(option);
    expect(error.retryable).toBe(false);
    expect(fake.calls).toEqual([]);
    expect(calls).toEqual([]);
    return error;
  };
  const badPayers: [string, unknown][] = [
    ["a number", 5],
    ["an object of no known form", { address: wallet }],
    ["an address that does not parse", "not an address"],
    ["a reward address", rewardAddress(1)],
    [
      "a snapshot whose address does not parse",
      { changeAddress: "nope", utxos: [] },
    ],
    [
      "a snapshot whose address is a reward address",
      { changeAddress: rewardAddress(1), utxos: [] },
    ],
    [
      "a snapshot holding a string that is not a UTxO",
      { changeAddress: wallet, utxos: ["84a400"] },
    ],
    ["a snapshot holding {}", { changeAddress: wallet, utxos: [{}] }],
  ];

  it.each(badPayers)("refuses as payer %s", async (_, payer) => {
    await invalid("payer", (builder) =>
      builder.build(pay(), { payer: payer as Payer }),
    );
    await invalid("payer", (builder) => builder.readPayer(payer as Payer));
  });

  it("names the conversion's error as cause", async () => {
    const error = await invalid("payer", (builder) =>
      builder.build(pay(), {
        payer: { changeAddress: wallet, utxos: ["zz"] },
      }),
    );
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.details.value).toBe("zz");
    const sendAllTo = await invalid("sendAllTo", (builder, walletPayer) =>
      builder.build([], { payer: walletPayer, sendAllTo: "zz" }),
    );
    expect(sendAllTo.cause).toBeInstanceOf(Error);
    expect(sendAllTo.details.value).toBe("zz");
  });

  it.each([
    ["fee", { fee: 1000 }],
    ["fee", { fee: -1n }],
    ["registeredPools", { registeredPools: "pool" }],
    ["extraKeyWitnesses", { extraKeyWitnesses: 1.5 }],
    ["extraKeyWitnesses", { extraKeyWitnesses: -1 }],
    ["sendAllTo", { sendAllTo: "not an address" }],
    ["sendAllTo", { sendAllTo: rewardAddress(1) }],
    ["sendAllTo", { sendAllTo: 5 }],
    ["canSelect", { canSelect: true }],
    ["trace", { trace: "log" }],
    ["signal", { signal: {} }],
    ["signal", { signal: { aborted: false } }],
    ["signal", { signal: { addEventListener: () => {} } }],
    ["coinSelection", { coinSelection: [] }],
    [
      "coinSelection",
      { coinSelection: { name: "custom", selectInputs: () => [] } },
    ],
  ])("refuses an option %s of the wrong type: %p", async (option, options) => {
    await invalid(option, (builder, walletPayer) =>
      builder.build(pay(), {
        payer: walletPayer,
        ...(options as BuildOptions),
      }),
    );
  });

  it.each([{}, 5, 0, "", true])("refuses a parts entry %p", async (entry) => {
    await invalid("parts", (builder, walletPayer) =>
      builder.build([pay(), entry as unknown as TxPart], {
        payer: walletPayer,
      }),
    );
  });

  it("refuses a parts list that holds itself", async () => {
    const list: PartEntry[] = [pay()];
    list.push([list]);
    const error = await invalid("parts", (builder, walletPayer) =>
      builder.build(list, { payer: walletPayer }),
    );
    expect(error.message).toMatch(/holds itself/);
  });

  it("refuses a wallet answer it cannot decode as WALLET_FAILED, without a code", async () => {
    for (const payer of [
      meshFormat({ address: "not an address" }).wallet,
      cip30(["84a400"]),
      meshFormat({ utxos: { utxos: funds } }).wallet,
    ]) {
      const error = await expectCode(
        () => offline().build(pay(), { payer }),
        "WALLET_FAILED",
      );
      expect(error.details.walletCode).toBeUndefined();
      expect(error.cause).toBeInstanceOf(Error);
    }
  });
});

describe("canSubmit", () => {
  it("tells a wallet that can submit, and narrows it", () => {
    const api: Cip30WalletApi = cip30();
    expect(canSubmit(api)).toBe(false);
    const submitting: Cip30WalletApi = {
      ...api,
      submitTx: async () => "ab".repeat(32),
    };
    expect(canSubmit(submitting)).toBe(true);
    const takes = (submitter: ISubmitter) => submitter;
    if (canSubmit(submitting)) takes(submitting);
    // @ts-expect-error a wallet not narrowed is no submitter
    takes(submitting);
  });
});
