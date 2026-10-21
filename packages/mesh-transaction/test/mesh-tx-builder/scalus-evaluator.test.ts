import {
  CachedFetcher,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IEvaluator,
  IFetcher,
  mConStr0,
  Network,
  SLOT_CONFIG_NETWORK,
  UTxO,
} from "@meshsdk/common";
import {
  OfflineEvaluatorScalus,
  resolvePlutusScriptAddress,
  Serialization,
} from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import {
  MeshTxBuilder,
  MeshTxBuilderOptions,
  MeshTxBuilderV2,
} from "@meshsdk/transaction";
import { MeshWallet } from "@meshsdk/wallet";

import { alwaysSucceedCbor } from "../test-util";

const lovelace = (quantity: string) => [{ unit: "lovelace", quantity }];
const scriptTxHash = "2".repeat(64);
const unitDatum = Serialization.PlutusData.fromCore({
  constructor: 0n,
  fields: { items: [] },
}).toCbor();
const DEFAULT_COST_MODELS = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
/** Units declared on the redeemer, far below what the script needs */
const declaredUnits = { mem: 7, steps: 7 };

type SpendOptions = {
  /** Options over `evaluator: "scalus"` and the emulator as fetcher */
  builder?: MeshTxBuilderOptions;
  /** Builds with MeshTxBuilderV2 instead */
  v2?: boolean;
  /** Wraps the emulator before the builder gets it as fetcher */
  fetcher?: (emulator: ScalusEmulator) => IFetcher;
  networkId?: 0 | 1;
  /** Sets the transaction's upper validity bound */
  invalidHereafter?: number;
  /** The V3 script to spend, as double CBOR; always succeeds by default */
  script?: string;
  /** More UTxOs for the emulator to hold, given the wallet's address */
  chainUtxos?: (address: string) => UTxO[];
  /** Adds to the transaction before it is completed */
  configure?: (builder: MeshTxBuilder, address: string) => void;
};

/**
 * A V3 script that succeeds once it has serialised its script context, so its cost grows with
 * the context: `(lam ctx [(lam x (con unit ())) [(builtin serialiseData) ctx]])`.
 */
const serialisesContextCbor = "4b4a010100232498dd980081";

/**
 * Spends a V3 script (always succeeds unless given) with `declaredUnits`, through a builder whose fetcher is
 * an emulator and whose evaluator is `"scalus"`, selecting from the wallet's UTxOs. Returns the
 * units the transaction carries.
 */
async function spendScript(options: SpendOptions = {}) {
  const wallet = new MeshWallet({
    networkId: options.networkId ?? 0,
    key: { type: "mnemonic", words: Array(24).fill("solution") },
  });
  await wallet.init();
  const address = (await wallet.getChangeAddress())!;
  const script = options.script ?? alwaysSucceedCbor;
  const emulator = await ScalusEmulator.create([
    {
      input: { txHash: "0".repeat(64), outputIndex: 0 },
      output: { address, amount: lovelace("10000000000") },
    },
    {
      input: { txHash: "1".repeat(64), outputIndex: 0 },
      output: { address, amount: lovelace("5000000") },
    },
    {
      input: { txHash: scriptTxHash, outputIndex: 0 },
      output: {
        address: resolvePlutusScriptAddress({ code: script, version: "V3" }, 0),
        amount: lovelace("20000000"),
        plutusData: unitDatum,
      },
    },
    ...(options.chainUtxos?.(address) ?? []),
  ]);
  const walletUtxos: UTxO[] = (
    await emulator.fetchAddressUTxOs(address)
  ).filter(
    // Only the UTxOs below are for selection; others are spent explicitly
    (utxo) => ["0", "1"].some((c) => utxo.input.txHash === c.repeat(64)),
  );
  const collateral = walletUtxos.find(
    (utxo) => utxo.input.txHash === "1".repeat(64),
  )!;
  const fetchUTxOs = jest.spyOn(emulator, "fetchUTxOs");

  const builderOptions: MeshTxBuilderOptions = {
    fetcher: options.fetcher?.(emulator) ?? emulator,
    params: await emulator.fetchProtocolParameters(),
    evaluator: "scalus",
    ...options.builder,
  };
  // MeshTxBuilderV2 is a MeshTxBuilder with typed script methods; the untyped ones used here
  // are still there at run time
  const builder = options.v2
    ? (new MeshTxBuilderV2(builderOptions) as unknown as MeshTxBuilder)
    : new MeshTxBuilder(builderOptions);
  builder
    .spendingPlutusScriptV3()
    .txIn(scriptTxHash, 0)
    .txInInlineDatumPresent()
    .txInRedeemerValue(mConStr0([]), "Mesh", { ...declaredUnits })
    .txInScript(script)
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .changeAddress(address)
    // Coin selection runs, and evaluates, on clones of the builder, so this also covers clone()
    .selectUtxosFrom(walletUtxos.filter((utxo) => utxo !== collateral));
  if (options.invalidHereafter !== undefined)
    builder.invalidHereafter(options.invalidHereafter);
  options.configure?.(builder, address);
  const txHex = await builder.complete();

  const redeemers = Serialization.Transaction.fromCbor(
    Serialization.TxCBOR(txHex),
  )
    .witnessSet()
    .redeemers()!
    .values();
  expect(redeemers).toHaveLength(1);
  const exUnits = redeemers[0]!.exUnits();
  const units = { mem: Number(exUnits.mem()), steps: Number(exUnits.steps()) };
  const submit = async () => emulator.submitTx(await wallet.signTx(txHex));
  return { builder, emulator, units, submit, fetchUTxOs };
}

const slotConfigOf = (builder: MeshTxBuilder) =>
  (builder.evaluator as OfflineEvaluatorScalus).slotConfig.zeroTime;

describe('MeshTxBuilder with evaluator: "scalus"', () => {
  it("evaluates with Scalus", async () => {
    const { builder, units, submit } = await spendScript();

    expect(builder.evaluator).toBeInstanceOf(OfflineEvaluatorScalus);
    expect(units.mem).toBeGreaterThan(declaredUnits.mem);
    expect(units.steps).toBeGreaterThan(declaredUnits.steps);
    // The ledger accepts the units: they cover what the script really uses
    expect(await submit()).toHaveLength(64);
  });

  it("evaluates with Scalus in MeshTxBuilderV2", async () => {
    const { builder, units, submit } = await spendScript({ v2: true });

    expect(builder).toBeInstanceOf(MeshTxBuilderV2);
    expect(builder.evaluator).toBeInstanceOf(OfflineEvaluatorScalus);
    expect(units.mem).toBeGreaterThan(declaredUnits.mem);
    expect(units.steps).toBeGreaterThan(declaredUnits.steps);
    expect(await submit()).toHaveLength(64);
  });

  it("is opt-in: without an evaluator, the declared units stay, also across clones", async () => {
    const { builder, units, fetchUTxOs } = await spendScript({
      builder: { evaluator: undefined },
      // Nothing is fetched for evaluation, so a fetcher failing on the collateral cannot matter
      fetcher: (emulator) =>
        new Proxy(emulator, {
          get: (target, prop, receiver) =>
            prop === "fetchUTxOs"
              ? async (hash: string, index?: number) => {
                  if (hash === "1".repeat(64)) throw "{}";
                  return target.fetchUTxOs(hash, index);
                }
              : Reflect.get(target, prop, receiver),
        }),
    });

    expect(builder.evaluator).toBeUndefined();
    // A clone made for a coin-selection round that got an evaluator would have replaced these
    // with evaluated units
    expect(units).toEqual(declaredUnits);
    // Only what the builder needs to complete the transaction
    expect(fetchUTxOs.mock.calls.map(([hash]) => hash)).toEqual([scriptTxHash]);
  });

  it("uses the evaluator it is given, with only the UTxOs given for evaluation", async () => {
    // A remote evaluator may reject additional UTxOs that also exist on chain
    const evaluateTx = jest.fn(async () => []);
    const mine = { evaluateTx } as IEvaluator;
    const given: UTxO = {
      input: { txHash: "5".repeat(64), outputIndex: 0 },
      output: { address: "addr_test1", amount: lovelace("1") },
    };
    const { builder, fetchUTxOs } = await spendScript({
      builder: { evaluator: mine },
      configure: (builder) => builder.inputForEvaluation(given),
    });
    expect(builder.evaluator).toBe(mine);
    // Nor does the builder fetch chain data for it: the collateral is not fetched
    expect(fetchUTxOs.mock.calls.map(([hash]) => hash)).toEqual([scriptTxHash]);
    expect(evaluateTx).toHaveBeenCalled();
    for (const [, additionalUtxos] of evaluateTx.mock.calls as unknown[][])
      expect(additionalUtxos).toEqual([given]);
  });

  it("needs a fetcher to resolve inputs with", () => {
    expect(() => new MeshTxBuilder({ evaluator: "scalus" })).toThrow(
      /`fetcher`/,
    );
    expect(() => new MeshTxBuilderV2({ evaluator: "scalus" })).toThrow(
      /`fetcher`/,
    );
  });

  it("evaluates with the UTxOs the builder holds, fetching only the rest", async () => {
    const { fetchUTxOs } = await spendScript({
      // More than the script input holds, so a wallet UTxO must be selected
      configure: (builder, address) =>
        builder.txOut(address, lovelace("30000000")),
    });
    // The selected wallet input comes from the builder. The script input, given by reference
    // alone, and the collateral, given by address and value only, are fetched: once each.
    expect(fetchUTxOs.mock.calls.map(([hash]) => hash).sort()).toEqual(
      ["1".repeat(64), scriptTxHash].sort(),
    );
  });

  it("evaluates with the cost models the builder fetched", async () => {
    // Differ from the defaults the evaluator starts with, in a model the script does not use
    const [v1, ...rest] = DEFAULT_COST_MODELS;
    const fetched = [[v1![0]! + 1, ...v1!.slice(1)], ...rest];
    const { builder } = await spendScript({
      fetcher: (emulator) =>
        new Proxy(emulator, {
          get: (target, prop, receiver) =>
            prop === "fetchCostModels"
              ? async () => fetched
              : Reflect.get(target, prop, receiver),
        }),
    });
    expect((builder.evaluator as OfflineEvaluatorScalus).costModels).toEqual(
      fetched,
    );
  });

  it("keeps the default cost model of a version the provider sent none for", async () => {
    const [, v2, v3] = DEFAULT_COST_MODELS;
    const { builder } = await spendScript({
      fetcher: (emulator) =>
        new Proxy(emulator, {
          get: (target, prop, receiver) =>
            prop === "fetchCostModels"
              ? async () => [[], v2, v3]
              : Reflect.get(target, prop, receiver),
        }),
    });
    expect((builder.evaluator as OfflineEvaluatorScalus).costModels).toEqual(
      DEFAULT_COST_MODELS,
    );
  });

  describe("key inputs given by address and value", () => {
    const keyTxHash = "3".repeat(64);
    /** Large enough to cost the context-serialising script visibly more */
    const bigDatum = Serialization.PlutusData.fromCore(
      new Uint8Array(60).fill(7),
    ).toCbor();
    const spendKeyInput =
      (scriptSize: number) => (builder: MeshTxBuilder, address: string) =>
        builder.txIn(keyTxHash, 0, lovelace("3000000"), address, scriptSize);

    it("are evaluated with their chain UTxO, datum included", async () => {
      // The script's cost depends on its context, which holds this input's inline datum. Units
      // computed without the datum would fall short, and the ledger would reject them.
      const { units, submit } = await spendScript({
        script: serialisesContextCbor,
        chainUtxos: (address) => [
          {
            input: { txHash: keyTxHash, outputIndex: 0 },
            output: {
              address,
              amount: lovelace("3000000"),
              plutusData: bigDatum,
            },
          },
        ],
        configure: spendKeyInput(0),
      });
      expect(units).not.toEqual(declaredUnits);
      expect(await submit()).toHaveLength(64);
    });

    it("are evaluated as declared when the chain does not have them yet", async () => {
      // e.g. a wallet UTxO an indexer has not seen
      const { builder, units, fetchUTxOs } = await spendScript({
        configure: spendKeyInput(0),
      });
      expect(units).not.toEqual(declaredUnits);
      // Coin selection evaluates on clones, once per round. The chain is asked once per
      // complete(), not per round: a further round must not ask again.
      await (builder as unknown as { clone(): MeshTxBuilder })
        .clone()
        .evaluateRedeemers();
      expect(
        fetchUTxOs.mock.calls.filter(([hash]) => hash === keyTxHash),
      ).toHaveLength(1);
    });

    /** The emulator, but failing to fetch the key input's transaction with `error` */
    const failingFor = (error: unknown) => (emulator: ScalusEmulator) =>
      new Proxy(emulator, {
        get: (target, prop, receiver) =>
          prop === "fetchUTxOs"
            ? async (hash: string, index?: number) => {
                if (hash === keyTxHash) throw error;
                return target.fetchUTxOs(hash, index);
              }
            : Reflect.get(target, prop, receiver),
      });

    it("are evaluated as declared when the fetcher reports them not found", async () => {
      // What Blockfrost throws for a 404: parseHttpError's JSON, encoded twice
      const notFound = JSON.stringify(
        JSON.stringify({ data: { status_code: 404 }, status: 404 }),
      );
      const { units } = await spendScript({
        fetcher: failingFor(notFound),
        configure: spendKeyInput(0),
      });
      expect(units).not.toEqual(declaredUnits);
    });

    it("are evaluated as declared when an OfflineFetcher does not have them", async () => {
      const { units } = await spendScript({
        fetcher: failingFor(
          new Error(`No UTxOs found for transaction hash: ${keyTxHash}`),
        ),
        configure: spendKeyInput(0),
      });
      expect(units).not.toEqual(declaredUnits);
    });

    it.each([
      [
        "a server error",
        JSON.stringify(JSON.stringify({ data: {}, status: 500 })),
      ],
      // parseHttpError's answer to any throw that is not an HTTP error
      ["an error that says nothing", "{}"],
    ])(
      "fail to evaluate when fetching them fails with %s",
      async (_, error) => {
        // Declared data could miss a datum the chain UTxO holds
        await expect(
          spendScript({
            fetcher: failingFor(error),
            configure: spendKeyInput(0),
          }),
        ).rejects.toBe(error);
      },
    );

    it("keep their chain data when another output of their transaction is missing", async () => {
      // keyTxHash#1 is on chain with a datum, keyTxHash#0 is not
      const evaluateTx = jest.spyOn(
        OfflineEvaluatorScalus.prototype,
        "evaluateTx",
      );
      try {
        const { builder } = await spendScript({
          chainUtxos: (address) => [
            {
              input: { txHash: keyTxHash, outputIndex: 1 },
              output: {
                address,
                amount: lovelace("3000000"),
                plutusData: bigDatum,
              },
            },
          ],
          configure: (builder, address) => {
            spendKeyInput(0)(builder, address);
            builder.txIn(keyTxHash, 1, lovelace("3000000"), address, 0);
          },
        });
        // One more round, as coin selection would run
        await (builder as unknown as { clone(): MeshTxBuilder })
          .clone()
          .evaluateRedeemers();
        expect(evaluateTx.mock.calls.length).toBeGreaterThan(1);
        for (const [, additionalUtxos] of evaluateTx.mock.calls) {
          const output1 = additionalUtxos!.find(
            (utxo) =>
              utxo.input.txHash === keyTxHash && utxo.input.outputIndex === 1,
          );
          expect(output1?.output.plutusData).toBe(bigDatum);
        }
      } finally {
        evaluateTx.mockRestore();
      }
    });

    it("are not evaluated as declared if they spend a Plutus script", async () => {
      // Its datum is in the chain UTxO, which the evaluator then fetches itself
      await expect(
        spendScript({
          configure: (builder, address) =>
            builder
              .spendingPlutusScriptV3()
              .txIn("4".repeat(64), 0, lovelace("2000000"), address, 0)
              .txInInlineDatumPresent()
              .txInRedeemerValue(mConStr0([]))
              .txInScript(alwaysSucceedCbor),
        }),
      ).rejects.toThrow(/UTxO not found/);
    });

    it("are not evaluated as declared if they may hold a reference script", async () => {
      await expect(
        spendScript({ configure: spendKeyInput(100) }),
      ).rejects.toThrow(/UTxO not found/);
    });
  });

  describe("network", () => {
    it("is taken from the `network` option", async () => {
      const { builder } = await spendScript({
        builder: { network: "preprod" },
        invalidHereafter: 100_000_000,
      });
      expect(slotConfigOf(builder)).toBe(SLOT_CONFIG_NETWORK.preprod.zeroTime);
    });

    it("is taken from setNetwork", async () => {
      // As mesh-contract does: setNetwork("preprod"), then a validity interval
      const { builder } = await spendScript({
        configure: (builder) => builder.setNetwork("preprod"),
        invalidHereafter: 100_000_000,
      });
      expect(slotConfigOf(builder)).toBe(SLOT_CONFIG_NETWORK.preprod.zeroTime);
    });

    it("is mainnet for a mainnet change address", async () => {
      const { builder } = await spendScript({
        networkId: 1,
        invalidHereafter: 200_000_000,
      });
      expect(slotConfigOf(builder)).toBe(SLOT_CONFIG_NETWORK.mainnet.zeroTime);
    });

    it("must be known for a transaction valid from slot 0", async () => {
      await expect(
        spendScript({ configure: (builder) => builder.invalidBefore(0) }),
      ).rejects.toThrow(/network it is for is unknown/);
    });

    it("must be known for a transaction with a validity interval", async () => {
      // A testnet address fits preprod and preview alike, whose slots map to different times
      await expect(
        spendScript({ invalidHereafter: 100_000_000 }),
      ).rejects.toThrow(/`network`.*another evaluator/s);
    });

    it.each(["testnet", "mainnnet"])(
      "must have known slot times for a transaction with a validity interval: %s",
      async (network) => {
        // "testnet" is a custom network, its slot config all zeros; the other is misspelt
        await expect(
          spendScript({
            builder: { network: network as Network },
            invalidHereafter: 100_000_000,
          }),
        ).rejects.toThrow(new RegExp(`"${network}".*another evaluator`, "s"));
      },
    );

    it("is not inferred from a guess another builder left in the shared cache", async () => {
      const fetcher = {} as IFetcher;
      // What MeshTxBuilder does for a mainnet change address
      CachedFetcher.wrap(fetcher).network = "mainnet";
      await expect(
        spendScript({
          fetcher: (emulator) => Object.assign(fetcher, emulator),
          invalidHereafter: 100_000_000,
        }),
      ).rejects.toThrow(/network it is for is unknown/);
    });

    it("need not be known for a transaction without one", async () => {
      const { units } = await spendScript();
      expect(units).not.toEqual(declaredUnits);
    });
  });
});
