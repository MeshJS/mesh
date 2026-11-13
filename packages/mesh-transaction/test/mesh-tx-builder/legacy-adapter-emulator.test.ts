import {
  CachedFetcher,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  EvaluationContext,
  IEvaluator,
  IFetcher,
  mConStr0,
  Protocol,
  UTxO,
} from "@meshsdk/common";
import { CSLSerializer } from "@meshsdk/core-csl";
import {
  CardanoSDKSerializer,
  resolvePlutusScriptAddress,
  resolveScriptRef,
  Serialization,
} from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  LargestFirstInputSelector,
  MeshTxBuilder,
  MeshTxBuilderOptions,
  utxoToTxIn,
} from "../../src";
import { IInputSelector } from "../../src/mesh-tx-builder/coin-selection/coin-selection-interface";
import { resetWarnings } from "../../src/mesh-tx-builder/warnings";
import { addWitnesses, signWitnesses } from "../../src/tx-builder";
import { alwaysSucceedCbor, alwaysSucceedHash } from "../test-util";

const words = Array(24).fill("solution");
const lovelace = (quantity: bigint | number) => [
  { unit: "lovelace", quantity: String(quantity) },
];
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const scriptRef = resolveScriptRef(plutusScript);
/** Units that cover the always-succeeding script */
const enoughUnits = { mem: 100_000, steps: 100_000_000 };

/** A UTxO at an address, made up: not on the emulator unless added */
const utxoAt = (
  txHash: string,
  address: string,
  amount: bigint,
  extra: Partial<UTxO["output"]> = {},
): UTxO => ({
  input: { txHash, outputIndex: 0 },
  output: { address, amount: lovelace(amount), ...extra },
});

const walletOf = async (networkId: 0 | 1 = 0) => {
  const wallet = new MeshWallet({
    networkId,
    key: { type: "mnemonic", words },
  });
  await wallet.init();
  return wallet;
};

/**
 * An emulator of preprod, a wallet with funds on it, a UTxO locked by the always-succeeding
 * script with an inline datum, and a wallet UTxO holding that script as a reference script
 */
const setup = async (
  validator: "scalus" | "cquisitor",
  options: { params?: Partial<Protocol>; costModels?: number[][] } = {},
) => {
  const emulator = await TxEmulator.create({
    validator,
    network: "preprod",
    slot: 100_000_000,
    ...options,
  });
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  const funds = emulator.fund(address, { lovelace: 1_000_000_000n });
  const locked = utxoAt("a".repeat(64), scriptAddress, 20_000_000n, {
    plutusData: "d87980",
  });
  const holder = utxoAt("b".repeat(64), address, 30_000_000n, { scriptRef });
  emulator.addUtxos([locked, holder]);
  return { emulator, wallet, address, funds, locked, holder };
};

type Setup = Awaited<ReturnType<typeof setup>>;

/** Spends the locked UTxO with the attached script */
const unlock = (
  builder: MeshTxBuilder,
  locked: UTxO,
  exUnits?: { mem: number; steps: number },
) =>
  builder
    .spendingPlutusScriptV3()
    .txIn(locked.input.txHash, locked.input.outputIndex)
    .txInInlineDatumPresent()
    .txInRedeemerValue(mConStr0([]), "Mesh", exUnits)
    .txInScript(alwaysSucceedCbor);

const parse = (txHex: string) =>
  Serialization.Transaction.fromCbor(Serialization.TxCBOR(txHex));

/** Signs with the wallet and submits; the ledger must accept it */
const accept = async ({ emulator, wallet }: Setup, txHex: string) => {
  // Witnesses added to the bytes as built
  const result = await emulator.submit(
    await addWitnesses(txHex, await signWitnesses(wallet, txHex)),
  );
  if (!result.accepted)
    throw new Error(`rejected: ${JSON.stringify(result.errors)}`);
  return result;
};

/** The emulator, as a fetcher stating the given network, or none */
const stating = (emulator: TxEmulator, network: string | undefined) =>
  new Proxy(emulator, {
    get: (target, prop) =>
      prop === "network" ? network : Reflect.get(target, prop, target),
  }) as unknown as IFetcher;

/** The emulator, as a fetcher whose `fetchUTxOs` throws `error` for one transaction */
const failingFor = (emulator: TxEmulator, txHash: string, error: unknown) =>
  new Proxy(emulator, {
    get: (target, prop) =>
      prop === "fetchUTxOs"
        ? async (hash: string, index?: number) => {
            if (hash === txHash) throw error;
            return target.fetchUTxOs(hash, index);
          }
        : Reflect.get(target, prop, target),
  }) as unknown as IFetcher;

/** An evaluator over the emulator that records how it is configured */
const recordingEvaluator = (emulator: TxEmulator) => {
  const configure = jest.fn<void, [EvaluationContext]>();
  const evaluator: IEvaluator = {
    evaluateTx: (tx, utxos, txs) => emulator.evaluateTx(tx, utxos, txs),
    acceptsKnownUtxos: true,
    configure,
  };
  return { evaluator, configure };
};

/** The units of the redeemers a transaction carries */
const unitsOf = (txHex: string) =>
  parse(txHex)
    .witnessSet()
    .redeemers()!
    .values()
    .map((r) => ({
      mem: Number(r.exUnits().mem()),
      steps: Number(r.exUnits().steps()),
    }));

const DEFAULT_COST_MODELS = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];

const protocolOf = (builder: MeshTxBuilder) =>
  (builder as unknown as { _protocolParams: Protocol })._protocolParams;

describe("MeshTxBuilder options", () => {
  it("refuses a serializer or a selector that is not Mesh's", () => {
    expect(
      () =>
        new MeshTxBuilder({
          serializer: {
            serializeTxBody() {},
          } as unknown as MeshTxBuilderOptions["serializer"],
        }),
    ).toThrow(
      expect.objectContaining({
        code: "INVALID_OPTION",
        details: expect.objectContaining({ option: "serializer" }),
      }),
    );
    const mine: IInputSelector = { select: async () => ({}) as never };
    expect(() => new MeshTxBuilder({ selector: mine })).toThrow(
      expect.objectContaining({
        code: "INVALID_OPTION",
        details: expect.objectContaining({ option: "selector" }),
      }),
    );
  });

  it("accepts Mesh's serializers, their subclasses and copies, and Mesh's selectors", () => {
    class MySerializer extends CardanoSDKSerializer {}
    for (const serializer of [
      new CardanoSDKSerializer(),
      new CSLSerializer(),
      new MySerializer(),
      Object.create(CardanoSDKSerializer.prototype),
    ])
      expect(new MeshTxBuilder({ serializer }).serializer).toBe(serializer);
    const other = new MeshTxBuilder();
    expect(other.selector).toBeInstanceOf(LargestFirstInputSelector);
    for (const selector of [new LargestFirstInputSelector(), other.selector])
      expect(new MeshTxBuilder({ selector }).selector).toBe(selector);
  });

  it("isHydra lays five zeros over params, and keeps the others", () => {
    const hydra = new MeshTxBuilder({
      isHydra: true,
      params: { maxTxSize: 12345, minFeeA: 99, collateralPercent: 0 },
    });
    expect(protocolOf(hydra)).toMatchObject({
      maxTxSize: 12345,
      minFeeA: 0,
      minFeeB: 0,
      priceMem: 0,
      priceStep: 0,
      coinsPerUtxoSize: 0,
      collateralPercent: 0,
      minFeeRefScriptCostPerByte:
        DEFAULT_PROTOCOL_PARAMETERS.minFeeRefScriptCostPerByte,
    });
    // A later call does not bring a fee back into a head
    hydra.protocolParams({ minFeeA: 44 });
    expect(protocolOf(hydra).minFeeA).toBe(0);
    expect(
      protocolOf(new MeshTxBuilder({ isHydra: true })).collateralPercent,
    ).toBe(DEFAULT_PROTOCOL_PARAMETERS.collateralPercent);
  });

  it("keeps the network's maxTxExMem in the built-in parameters", () => {
    expect(DEFAULT_PROTOCOL_PARAMETERS.maxTxExMem).toBe("16500000");
  });
});

describe.each(["scalus", "cquisitor"] as const)(
  "MeshTxBuilder on TxBuilder, on TxEmulator (%s)",
  (validator) => {
    beforeEach(() => resetWarnings());

    it("describes the built transaction in the body, and signs it with completeSigning", async () => {
      const context = await setup(validator);
      const { emulator, locked } = context;
      const payment =
        "f083e5878c6f980c53d30b9cc2baadd780307b08acec9e0792892e013bbe9241";
      const cli = new MeshWallet({
        networkId: 0,
        key: { type: "cli", payment },
      });
      await cli.init();
      const address = (await cli.getChangeAddress())!;
      const funds = emulator.fund(address, { lovelace: 100_000_000n });

      const builder = new MeshTxBuilder({ fetcher: emulator });
      const txHex = await unlock(builder, locked)
        .txOut(address, lovelace(50_000_000))
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .signingKey(payment)
        .complete();

      const tx = parse(txHex);
      const body = builder.meshTxBuilderBody;
      expect(builder.txHex).toBe(txHex);
      expect(
        body.inputs.map((i) => `${i.txIn.txHash}#${i.txIn.txIndex}`),
      ).toEqual(
        tx
          .body()
          .inputs()
          .values()
          .map((i) => `${i.transactionId()}#${i.index()}`),
      );
      // The selected wallet UTxO is among them, described in full
      expect(body.inputs).toContainEqual(
        expect.objectContaining({
          type: "PubKey",
          txIn: expect.objectContaining({
            txHash: funds.input.txHash,
            amount: funds.output.amount,
            address,
          }),
        }),
      );
      // The change follows the outputs given
      expect(body.outputs.map((o) => o.address)).toEqual(
        tx
          .body()
          .outputs()
          .map((o) => o.address().toBech32()),
      );
      expect(body.outputs.length).toBeGreaterThan(1);
      expect(body.fee).toBe(tx.body().fee().toString());
      const input = body.inputs.find((i) => i.type === "Script")!;
      expect(
        input.type === "Script" && input.scriptTxIn.redeemer!.exUnits,
      ).toEqual(unitsOf(txHex)[0]);
      expect(body.expectedNumberKeyWitnesses).toBe(1);

      const signed = builder.completeSigning();
      expect(builder.txHex).toBe(signed);
      expect(await emulator.submit(signed)).toMatchObject({ accepted: true });
    });

    it("submits through the submitter and clears the shared cache's volatile answers", async () => {
      const context = await setup(validator);
      const { emulator, wallet, address, funds } = context;
      // The clock stands still: an answer cannot expire on its own during the test
      const now = Date.now();
      const clock = jest.spyOn(Date, "now").mockReturnValue(now);
      try {
        const cache = CachedFetcher.wrap(emulator);
        const clearVolatile = jest.spyOn(cache, "clearVolatile");
        const fetchAddressUTxOs = jest.spyOn(emulator, "fetchAddressUTxOs");
        await cache.fetchAddressUTxOs(address);
        await cache.fetchAddressUTxOs(address);
        expect(fetchAddressUTxOs).toHaveBeenCalledTimes(1);

        const builder = new MeshTxBuilder({
          fetcher: emulator,
          submitter: emulator,
        });
        const txHex = await builder
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        expect(clearVolatile).not.toHaveBeenCalled();
        const txHash = await builder.submitTx(await wallet.signTx(txHex));
        expect(txHash).toBe(parse(txHex).getId().toString());
        expect(clearVolatile).toHaveBeenCalledTimes(1);

        await cache.fetchAddressUTxOs(address);
        expect(fetchAddressUTxOs).toHaveBeenCalledTimes(2);
      } finally {
        clock.mockRestore();
      }
    });

    it("refuses to build without a change address: MISSING_PAYER", async () => {
      const { emulator, address, funds } = await setup(validator);
      await expect(
        new MeshTxBuilder({ fetcher: emulator })
          .txOut(address, lovelace(5_000_000))
          .selectUtxosFrom([funds])
          .complete(),
      ).rejects.toMatchObject({ code: "MISSING_PAYER" });
    });

    describe("network", () => {
      it("takes the fetcher's network over a setNetwork() string, and configures the evaluator with it", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const { evaluator, configure } = recordingEvaluator(emulator);
        const fetcher = stating(emulator, "preview");
        const txHex = await unlock(
          new MeshTxBuilder({ fetcher, evaluator }).setNetwork("preprod"),
          locked,
        )
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();

        expect(configure).toHaveBeenCalled();
        for (const [context] of configure.mock.calls) {
          expect(context).toEqual({
            network: "preview",
            costModels: expect.any(Array),
          });
          expect(context).not.toHaveProperty("slotConfig");
        }
        await accept(context, txHex);

        // The constructor's option is a statement the provider contradicts
        await expect(
          unlock(
            new MeshTxBuilder({ fetcher, evaluator, network: "preprod" }),
            locked,
          )
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete(),
        ).rejects.toMatchObject({ code: "NETWORK_MISMATCH" });
      });

      it("takes the constructor's option over a later setNetwork(), and nothing from a body", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const fetcher = stating(emulator, undefined);
        const first = recordingEvaluator(emulator);
        await unlock(
          new MeshTxBuilder({
            fetcher,
            evaluator: first.evaluator,
            network: "preprod",
          }).setNetwork("preview"),
          locked,
        )
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        expect(first.configure.mock.calls[0]![0].network).toBe("preprod");

        // A body given to complete() states no network
        const second = recordingEvaluator(emulator);
        const builder = new MeshTxBuilder({
          fetcher,
          evaluator: second.evaluator,
        });
        await unlock(builder, locked)
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete({ network: "preprod" });
        expect(second.configure.mock.calls[0]![0].network).toBeUndefined();
      });

      it("takes a setNetwork() string only for the change address's network id", async () => {
        const mainnet = (await (await walletOf(1)).getChangeAddress())!;
        const { address } = await setup(validator);
        const declared = (to: string) =>
          new MeshTxBuilder({ evaluator: null })
            .txIn("c".repeat(64), 0, lovelace(10_000_000), to, 0)
            .txOut(to, lovelace(2_000_000))
            .changeAddress(to);
        // A preprod string with a mainnet address builds on mainnet; a mainnet string with a
        // test address is no statement either
        await expect(
          declared(mainnet).setNetwork("preprod").complete(),
        ).resolves.toMatch(/^[0-9a-f]+$/);
        await expect(
          declared(address).setNetwork("mainnet").complete(),
        ).resolves.toMatch(/^[0-9a-f]+$/);
      });

      it("is not known for a test address nobody named: no validity interval for the default evaluator", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const fetcher = stating(emulator, undefined);
        const build = (builder: MeshTxBuilder, invalidHereafter?: number) => {
          unlock(builder, locked)
            .changeAddress(address)
            .selectUtxosFrom([funds]);
          if (invalidHereafter !== undefined)
            builder.invalidHereafter(invalidHereafter);
          return builder.complete();
        };

        const txHex = await build(new MeshTxBuilder({ fetcher }));
        expect(unitsOf(txHex)[0]!.mem).toBeGreaterThan(0);

        const refused = await build(
          new MeshTxBuilder({ fetcher }),
          100_001_000,
        ).catch((error: unknown) => error);
        expect(refused).toMatchObject({ code: "EVALUATION_FAILED" });
        expect((refused as Error).cause).toBeDefined();

        // An evaluator that needs no clock is not affected
        const plain: IEvaluator = {
          evaluateTx: (tx, utxos, txs) => emulator.evaluateTx(tx, utxos, txs),
        };
        await expect(
          build(new MeshTxBuilder({ fetcher, evaluator: plain }), 100_001_000),
        ).resolves.toMatch(/^[0-9a-f]+$/);

        await accept(context, txHex);
      });
    });

    it("keeps the units of the call without an evaluator", async () => {
      const context = await setup(validator);
      const { emulator, address, funds, locked } = context;
      const txHex = await unlock(
        new MeshTxBuilder({ fetcher: emulator, evaluator: null }),
        locked,
        enoughUnits,
      )
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();
      expect(unitsOf(txHex)).toEqual([enoughUnits]);
      await accept(context, txHex);

      // Without a fetcher no evaluator is made either
      const offline = new MeshTxBuilder();
      const declaredTx = await offline
        .spendingPlutusScriptV3()
        .txIn(
          locked.input.txHash,
          0,
          locked.output.amount,
          locked.output.address,
          0,
        )
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
        .txInScript(alwaysSucceedCbor)
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();
      expect(unitsOf(declaredTx)).toEqual([enoughUnits]);
    });

    describe("protocol parameters", () => {
      it("reads them from the fetcher, with the consumer's fields over them in call order", async () => {
        const context = await setup(validator, { params: { minFeeA: 50 } });
        const { emulator, wallet, address, funds } = context;
        const builder = new MeshTxBuilder({
          fetcher: emulator,
          params: { minFeeB: 1 },
        })
          .protocolParams({ minFeeA: 60 })
          .protocolParams({ maxTxSize: 20000 });
        const txHex = await builder
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        const signed = await wallet.signTx(txHex);
        expect(parse(txHex).body().fee()).toBe(
          60n * BigInt(signed.length / 2) + 1n,
        );
        expect(protocolOf(builder)).toMatchObject({
          minFeeA: 60,
          minFeeB: 1,
          maxTxSize: 20000,
        });

        const hydra = await new MeshTxBuilder({
          fetcher: emulator,
          isHydra: true,
        })
          .protocolParams({ minFeeA: 44 })
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        expect(parse(hydra).body().fee()).toBe(0n);
      });

      it("builds up to the network's maxTxExMem, and refuses ex units beyond it", async () => {
        const context = await setup(validator, {
          params: { maxTxExMem: "16500000" },
        });
        const { emulator, address, funds, locked } = context;
        const spendWith = (mem: number, options: MeshTxBuilderOptions) =>
          unlock(new MeshTxBuilder({ evaluator: null, ...options }), locked, {
            mem,
            steps: 100_000_000,
          })
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();

        await expect(
          spendWith(16_200_000, { fetcher: emulator }),
        ).resolves.toMatch(/^[0-9a-f]+$/);
        await expect(
          spendWith(16_600_000, { fetcher: emulator }),
        ).rejects.toMatchObject({ code: "EXUNITS_EXCEEDED" });

        // The consumer's field over the fetched ones is used
        const base = await spendWith(16_200_000, { fetcher: emulator });
        const higher = await spendWith(16_200_000, {
          fetcher: emulator,
          params: { minFeeA: 50 },
        });
        expect(parse(higher).body().fee()).toBeGreaterThan(
          parse(base).body().fee(),
        );

        // Without a fetcher, on the built-in parameters
        const offline = (mem: number) =>
          new MeshTxBuilder({ evaluator: null })
            .spendingPlutusScriptV3()
            .txIn(
              locked.input.txHash,
              0,
              locked.output.amount,
              locked.output.address,
              0,
            )
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr0([]), "Mesh", {
              mem,
              steps: 100_000_000,
            })
            .txInScript(alwaysSucceedCbor)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        await expect(offline(16_200_000)).resolves.toMatch(/^[0-9a-f]+$/);
        const exceeded = await offline(16_600_000).catch((e: unknown) => e);
        expect(exceeded).toMatchObject({ code: "EXUNITS_EXCEEDED" });
        expect((exceeded as Error).message).toContain("16500000");
      });

      it("falls back to the built-in parameters with one warning, and the sync methods to those read", async () => {
        const context = await setup(validator, { params: { minFeeA: 50 } });
        const { emulator, address, funds } = context;
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        try {
          const payment = (builder: MeshTxBuilder) =>
            builder
              .txIn(
                funds.input.txHash,
                0,
                funds.output.amount,
                funds.output.address,
                0,
              )
              .txOut(address, lovelace(5_000_000))
              .changeAddress(address);
          // The sync methods build on the built-in parameters without a warning
          payment(new MeshTxBuilder()).completeSync();
          expect(warn).not.toHaveBeenCalled();
          for (let i = 0; i < 2; i++)
            await payment(new MeshTxBuilder()).complete();
          expect(warn).toHaveBeenCalledTimes(1);
          expect(String(warn.mock.calls[0]![0])).toMatch(/fetcher|params/);

          // What the builder read stays its parameters afterwards
          const reader = new MeshTxBuilder({ fetcher: emulator });
          await payment(reader).complete();
          expect(reader.calculateFeeForSerializedTx(100)).toBe(
            50n * 100n +
              BigInt((await emulator.fetchProtocolParameters()).minFeeB),
          );
          expect(warn).toHaveBeenCalledTimes(1);
        } finally {
          warn.mockRestore();
        }
      });

      it("falls back to the built-in parameters when the fetcher throws or answers nothing", async () => {
        for (const answer of [
          () => Promise.reject(new Error("unavailable")),
          () => Promise.resolve(undefined),
        ]) {
          resetWarnings();
          const context = await setup(validator, { params: { minFeeA: 50 } });
          const { emulator, address, funds } = context;
          const fetcher = new Proxy(emulator, {
            get: (target, prop) =>
              prop === "fetchProtocolParameters"
                ? answer
                : Reflect.get(target, prop, target),
          }) as unknown as IFetcher;
          const fee = async (options: MeshTxBuilderOptions) => {
            const builder = new MeshTxBuilder(options);
            const txHex = await builder
              .txOut(address, lovelace(5_000_000))
              .changeAddress(address)
              .selectUtxosFrom([funds])
              .complete();
            return { builder, fee: parse(txHex).body().fee() };
          };
          const builtin = (
            await fee({
              fetcher: emulator,
              params: DEFAULT_PROTOCOL_PARAMETERS,
            })
          ).fee;
          expect((await fee({ fetcher: emulator })).fee).not.toBe(builtin);
          const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
          try {
            for (let i = 0; i < 2; i++) {
              const built = await fee({ fetcher });
              expect(protocolOf(built.builder)).toEqual(
                DEFAULT_PROTOCOL_PARAMETERS,
              );
              expect(built.fee).toBe(builtin);
            }
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0]![0])).toMatch(/fetcher|params/);
          } finally {
            warn.mockRestore();
          }
        }
      });

      it("keeps the parameters an earlier complete() read when a later read fails", async () => {
        const context = await setup(validator, { params: { minFeeA: 50 } });
        const { emulator, address, funds } = context;
        let failing = false;
        const fetcher = new Proxy(emulator, {
          get: (target, prop) =>
            prop === "fetchProtocolParameters"
              ? (epoch: number) =>
                  failing
                    ? Promise.reject(new Error("unavailable"))
                    : target.fetchProtocolParameters(epoch)
              : Reflect.get(target, prop, target),
        }) as unknown as IFetcher;
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        try {
          const builder = new MeshTxBuilder({ fetcher });
          const payment = () =>
            builder
              .txOut(address, lovelace(5_000_000))
              .changeAddress(address)
              .selectUtxosFrom([funds])
              .complete();
          const first = await payment();
          expect(protocolOf(builder).minFeeA).toBe(50);

          // The next read fails, and is not served by the cache
          failing = true;
          CachedFetcher.wrap(fetcher).clear();
          builder.reset();
          expect(await payment()).toBe(first);
          expect(protocolOf(builder).minFeeA).toBe(50);
          expect(warn).not.toHaveBeenCalled();
        } finally {
          warn.mockRestore();
        }
      });
    });

    describe("cost models", () => {
      it("falls back to the built-in models when fetchCostModels throws or answers nothing", async () => {
        for (const answer of [
          () => Promise.reject(new Error("unavailable")),
          () => Promise.resolve([]),
        ]) {
          const context = await setup(validator, {
            costModels: DEFAULT_COST_MODELS,
          });
          const { emulator, address, funds, locked } = context;
          const fetcher = new Proxy(emulator, {
            get: (target, prop) =>
              prop === "fetchCostModels"
                ? answer
                : Reflect.get(target, prop, target),
          }) as unknown as IFetcher;
          const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
          try {
            const builder = new MeshTxBuilder({ fetcher });
            const txHex = await unlock(builder, locked)
              .changeAddress(address)
              .selectUtxosFrom([funds])
              .complete();
            expect(builder.meshTxBuilderBody.network).toEqual(
              DEFAULT_COST_MODELS,
            );
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
              expect.stringMatching(/cost models/i),
              expect.anything(),
            );
            await accept(context, txHex);
          } finally {
            warn.mockRestore();
          }
        }
      });

      it("fills a version the provider leaves empty from the built-in list, and reads none without Plutus", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const [, v2, v3] = await emulator.fetchCostModels();
        const fetchCostModels = jest.fn(async () => [[], v2!, v3!]);
        const fetcher = new Proxy(emulator, {
          get: (target, prop) =>
            prop === "fetchCostModels"
              ? fetchCostModels
              : Reflect.get(target, prop, target),
        }) as unknown as IFetcher;

        const payment = new MeshTxBuilder({ fetcher });
        await payment
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        expect(fetchCostModels).not.toHaveBeenCalled();
        expect(payment.meshTxBuilderBody.network).toBe("mainnet");

        const builder = new MeshTxBuilder({ fetcher });
        await unlock(builder, locked)
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        expect(fetchCostModels).toHaveBeenCalled();
        expect(builder.meshTxBuilderBody.network).toEqual([
          DEFAULT_V1_COST_MODEL_LIST,
          v2,
          v3,
        ]);
      });
    });

    it("isHydra: no fee, collateral put up, outputs at no minimum, and the reference-script fee kept", async () => {
      const head = {
        minFeeA: 0,
        minFeeB: 0,
        priceMem: 0,
        priceStep: 0,
        coinsPerUtxoSize: 0,
      };
      const context = await setup(validator, { params: head });
      const { emulator, address, funds, locked, holder } = context;
      const hydra = () =>
        new MeshTxBuilder({ fetcher: emulator, isHydra: true });

      const payment = await hydra()
        .txOut(address, lovelace(5_000_000))
        .txOut(address, [])
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();
      expect(parse(payment).body().fee()).toBe(0n);
      expect(parse(payment).body().outputs()[1]!.amount().coin()).toBe(0n);
      await accept(context, payment);

      const spend = await unlock(hydra(), locked)
        .changeAddress(address)
        .selectUtxosFrom(await emulator.fetchAddressUTxOs(address))
        .complete();
      const body = parse(spend).body();
      expect(body.collateral()?.size()).toBe(1);
      expect(body.totalCollateral()).toBe(0n);
      await accept(context, spend);

      // A UTxO holding a reference script is still priced for it
      const withRef = await hydra()
        .txIn(...utxoToTxIn(holder))
        .changeAddress(address)
        .complete();
      expect(parse(withRef).body().fee()).toBeGreaterThan(0n);
      await accept(context, withRef);
    });

    it("encodes with the builder's encoder whatever the serializer: CSL fields it lost are there", async () => {
      const context = await setup(validator);
      const { emulator, wallet, address, funds, locked } = context;
      const [rewardAddress] = await wallet.getRewardAddresses();
      emulator.setAccount({ rewardAddress: rewardAddress! });
      const serializer = new CSLSerializer();
      const collateral = emulator.fund(address, { lovelace: 10_000_000n });
      const build = (scriptInMetadata: boolean) => {
        const builder = new MeshTxBuilder({ fetcher: emulator, serializer });
        unlock(builder, locked)
          .txInCollateral(
            collateral.input.txHash,
            0,
            collateral.output.amount,
            address,
          )
          .setTotalCollateral("5000000")
          .setCollateralReturnAddress(scriptAddress)
          .proposal(
            { kind: "InfoAction", action: {} },
            {
              anchorUrl: "https://example.com/proposal.json",
              anchorDataHash: "0".repeat(64),
            },
            rewardAddress!,
            // The emulated preprod's governance action deposit
            "1000000000",
          )
          .metadataValue(1, 42)
          .setDonation("1000000")
          .changeAddress(address);
        if (scriptInMetadata)
          builder.metadataScript(alwaysSucceedCbor, "PlutusV3");
        return { builder, complete: () => builder.complete() };
      };
      const utxos = await emulator.fetchAddressUTxOs(address);
      const { builder, complete } = build(true);
      builder.selectUtxosFrom(utxos);
      const txHex = await complete();

      expect(builder.serializer).toBe(serializer);
      const tx = parse(txHex);
      expect(tx.body().proposalProcedures()?.size()).toBe(1);
      expect(tx.body().totalCollateral()).toBe(5_000_000n);
      expect(tx.body().collateralReturn()?.address().toBech32()).toBe(
        scriptAddress,
      );
      expect(tx.body().donation()).toBe(1_000_000n);
      expect(tx.witnessSet().plutusV3Scripts()?.size()).toBe(1);
      expect(tx.auxiliaryData()?.plutusV3Scripts()?.length).toBe(1);
      expect(tx.auxiliaryData()?.metadata()?.metadata()?.get(1n)).toBeDefined();
      if (validator === "scalus") {
        await accept(context, txHex);
        return;
      }
      // cquisitor encodes auxiliary data holding a Plutus script again before hashing it, and so
      // refuses every such transaction; the body states the hash of the bytes, as Scalus checks.
      // The rest it accepts.
      const plain = build(false);
      plain.builder.selectUtxosFrom(utxos);
      await accept(context, await plain.complete());
    });

    it("spends an output of a chained transaction the fetcher does not know yet", async () => {
      const context = await setup(validator);
      const { emulator, wallet, address } = context;
      const [parentFunds, childFunds] = [
        emulator.fund(address, { lovelace: 100_000_000n }),
        emulator.fund(address, { lovelace: 100_000_000n }),
      ];
      const parent = await wallet.signTx(
        await new MeshTxBuilder({ fetcher: emulator })
          .txOut(scriptAddress, lovelace(20_000_000))
          .txOutInlineDatumValue(mConStr0([]))
          .changeAddress(address)
          .selectUtxosFrom([parentFunds!])
          .complete(),
      );
      const parentHash = parse(parent).getId().toString();
      const child = await new MeshTxBuilder({ fetcher: emulator })
        .spendingPlutusScriptV3()
        .txIn(parentHash, 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]))
        .txInScript(alwaysSucceedCbor)
        .chainTx(parent)
        .changeAddress(address)
        .selectUtxosFrom([childFunds!])
        .complete();
      expect(unitsOf(child)[0]!.mem).toBeGreaterThan(0);
      expect(await emulator.submit(parent)).toMatchObject({ accepted: true });
      await accept(context, child);
    });

    it("evaluates with a UTxO given by inputForEvaluation that the fetcher does not know", async () => {
      const context = await setup(validator);
      const { emulator, address, funds } = context;
      const unknown = utxoAt("7".repeat(64), scriptAddress, 20_000_000n, {
        plutusData: "d87980",
      });
      const txHex = await unlock(
        new MeshTxBuilder({ fetcher: emulator }).inputForEvaluation(unknown),
        unknown,
      )
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();
      expect(unitsOf(txHex)).toEqual(
        (await emulator.evaluateTx(txHex, [unknown])).map((a) => a.budget),
      );
    });

    describe("translation of the body", () => {
      it("merges exact repeats, refuses contradictory ones, and drops a reference to a spent out ref", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const repeated = await new MeshTxBuilder({ fetcher: emulator })
          .txIn(...utxoToTxIn(funds))
          .txIn(...utxoToTxIn(funds))
          .readOnlyTxInReference(funds.input.txHash, 0)
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .complete();
        const body = parse(repeated).body();
        expect(body.inputs().size()).toBe(1);
        expect(body.referenceInputs()).toBeUndefined();
        await accept(context, repeated);

        const contradictory = unlock(
          new MeshTxBuilder({ fetcher: emulator }),
          locked,
        )
          .spendingPlutusScriptV3()
          .txIn(locked.input.txHash, 0)
          .txInInlineDatumPresent()
          .txInRedeemerValue(mConStr0([1]))
          .txInScript(alwaysSucceedCbor)
          .changeAddress(address)
          .selectUtxosFrom([funds]);
        await expect(contradictory.complete()).rejects.toMatchObject({
          code: "DUPLICATE_PART",
        });

        // The public method keeps the first of two inputs, whatever they hold
        const kept = new MeshTxBuilder()
          .txIn(funds.input.txHash, 0, lovelace(1), address, 0)
          .txIn(funds.input.txHash, 0, lovelace(2), address, 0)
          .txIn("c".repeat(64), 0);
        kept.removeDuplicateInputs();
        expect(kept.meshTxBuilderBody.inputs).toHaveLength(1);
        expect(kept.meshTxBuilderBody.inputs[0]!.txIn.amount).toEqual(
          lovelace(1),
        );
      });

      it("merges an exact repeat of a withdrawal", async () => {
        const { address } = await setup(validator);
        const wallet = await walletOf();
        const [rewardAddress] = await wallet.getRewardAddresses();
        const txHex = await new MeshTxBuilder({ evaluator: null })
          .txIn("c".repeat(64), 0, lovelace(10_000_000), address, 0)
          .withdrawal(rewardAddress!, "0")
          .withdrawal(rewardAddress!, "0")
          .changeAddress(address)
          .complete();
        expect(parse(txHex).body().withdrawals()?.size).toBe(1);
      });

      it("takes the pool deposit for a pool registration, and no lower bound for slot 0", async () => {
        const { address } = await setup(validator);
        const wallet = await walletOf();
        const [rewardAddress] = await wallet.getRewardAddresses();
        const txHex = await new MeshTxBuilder({ evaluator: null })
          .txIn("c".repeat(64), 0, lovelace(1_000_000_000), address, 0)
          .registerPoolCertificate({
            vrfKeyHash: "11".repeat(32),
            operator: "22".repeat(28),
            pledge: "0",
            cost: "340000000",
            margin: [1, 100],
            relays: [],
            owners: ["22".repeat(28)],
            rewardAddress: rewardAddress!,
          })
          .invalidBefore(0)
          .changeAddress(address)
          .complete();
        const body = parse(txHex).body();
        const out = body
          .outputs()
          .reduce((sum, o) => sum + o.amount().coin(), 0n);
        expect(1_000_000_000n - out - body.fee()).toBe(
          BigInt(DEFAULT_PROTOCOL_PARAMETERS.poolDeposit),
        );
        expect(body.validityStartInterval()).toBeUndefined();
      });

      it("spends a V3 script output without a datum, the inline-datum mark given", async () => {
        const context = await setup(validator);
        const { emulator, address, funds } = context;
        const bare = utxoAt("8".repeat(64), scriptAddress, 20_000_000n);
        emulator.addUtxos([bare]);
        const txHex = await unlock(
          new MeshTxBuilder({ fetcher: emulator }),
          bare,
        )
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        await accept(context, txHex);
      });

      it("takes a reference script's data over the hash and size the call declares", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked, holder } = context;
        const txHex = await new MeshTxBuilder({ fetcher: emulator })
          .spendingPlutusScriptV3()
          .txIn(locked.input.txHash, 0)
          .txInInlineDatumPresent()
          .txInRedeemerValue(mConStr0([]))
          .spendingTxInReference(holder.input.txHash, 0, "999", "ab".repeat(28))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        await accept(context, txHex);
      });

      it("takes the datum a declared Plutus input names, and checks its lock", async () => {
        const { address, funds, locked } = await setup(validator);
        const declared = (at: string) =>
          new MeshTxBuilder()
            .spendingPlutusScriptV3()
            .txIn(locked.input.txHash, 0, locked.output.amount, at, 0)
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
            .txInScript(alwaysSucceedCbor)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        await expect(declared(scriptAddress)).resolves.toMatch(/^[0-9a-f]+$/);
        await expect(declared(address)).rejects.toMatchObject({
          code: "WITNESS_MISMATCH",
        });
      });
    });

    describe("where output data comes from", () => {
      it("reads an input given with amount and address, and prices the reference script it holds", async () => {
        const context = await setup(validator);
        const { emulator, address, holder } = context;
        const fetchUTxOs = jest.spyOn(emulator, "fetchUTxOs");
        // The copy the call declares from holds no script
        const declared: UTxO = {
          input: holder.input,
          output: { address, amount: holder.output.amount },
        };
        const txHex = await new MeshTxBuilder({ fetcher: emulator })
          .txIn(...utxoToTxIn(declared))
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .complete();
        expect(
          fetchUTxOs.mock.calls.filter(
            ([hash]) => hash === holder.input.txHash,
          ),
        ).toHaveLength(1);
        // The ledger checks the reference-script fee
        await accept(context, txHex);
      });

      it("builds a declared key input the provider does not have, under the default evaluator too", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const notFound = JSON.stringify(
          JSON.stringify({ data: { status_code: 404 }, status: 404 }),
        );
        for (const fetcher of [
          emulator as IFetcher,
          failingFor(emulator, "c".repeat(64), notFound),
        ]) {
          const txHex = await unlock(new MeshTxBuilder({ fetcher }), locked)
            .txIn("c".repeat(64), 0, lovelace(5_000_000), address, 0)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
          expect(parse(txHex).body().inputs().size()).toBeGreaterThan(1);
        }
      });

      it("refuses declared data in front of the default evaluator for a script input and a possible reference script", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const declaredScriptInput = (evaluator?: null) =>
          unlock(
            new MeshTxBuilder({ fetcher: emulator, evaluator }),
            locked,
            enoughUnits,
          )
            .spendingPlutusScriptV3()
            .txIn("d".repeat(64), 0, lovelace(5_000_000), scriptAddress, 0)
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
            .txInScript(alwaysSucceedCbor)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        await expect(declaredScriptInput()).rejects.toMatchObject({
          code: "UTXO_NOT_FOUND",
        });
        await expect(declaredScriptInput(null)).resolves.toMatch(/^[0-9a-f]+$/);

        const sized = (scriptSize: number, evaluator?: null) =>
          unlock(
            new MeshTxBuilder({ fetcher: emulator, evaluator }),
            locked,
            enoughUnits,
          )
            .txIn("c".repeat(64), 0, lovelace(5_000_000), address, scriptSize)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        await expect(sized(100)).rejects.toMatchObject({
          code: "UTXO_NOT_FOUND",
        });
        // Without an evaluator the declared size is priced
        const fee = async (scriptSize: number) =>
          parse(await sized(scriptSize, null))
            .body()
            .fee();
        const pricePerByte = BigInt(
          (await emulator.fetchProtocolParameters()).minFeeRefScriptCostPerByte,
        );
        expect((await fee(100)) - (await fee(0))).toBe(100n * pricePerByte);

        // The body keeps the size declared for an input the provider does not have
        const payment = new MeshTxBuilder({
          fetcher: emulator,
          evaluator: null,
        })
          .txIn("c".repeat(64), 0, lovelace(100_000_000), address, 500)
          .txOut(address, lovelace(2_000_000))
          .changeAddress(address);
        await payment.complete();
        expect(payment.meshTxBuilderBody.inputs).toHaveLength(1);
        expect(payment.meshTxBuilderBody.inputs[0]!.txIn.scriptSize).toBe(500);
      });

      it("builds a declared collateral the fetcher fails on, unless the evaluator is handed it", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const serverError = JSON.stringify(
          JSON.stringify({ data: {}, status: 500 }),
        );
        const fetcher = failingFor(emulator, "e".repeat(64), serverError);
        const spend = (evaluator?: null) =>
          unlock(new MeshTxBuilder({ fetcher, evaluator }), locked, enoughUnits)
            .txInCollateral("e".repeat(64), 0, lovelace(10_000_000), address)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        await expect(spend(null)).resolves.toMatch(/^[0-9a-f]+$/);
        await expect(spend()).rejects.toMatchObject({
          code: "UTXO_NOT_FOUND",
          cause: serverError,
        });
      });

      it("prices declared reference sizes without a fetcher, and needs a fetcher for what cannot stand", async () => {
        const { address, locked } = await setup(validator);
        const build = (
          readSize: number,
          refSize: string | undefined,
          inputSize?: number,
        ) =>
          new MeshTxBuilder()
            .txIn("c".repeat(64), 0, lovelace(100_000_000), address, inputSize)
            .readOnlyTxInReference("f".repeat(64), 0, readSize)
            .spendingPlutusScriptV3()
            .txIn(
              locked.input.txHash,
              0,
              locked.output.amount,
              scriptAddress,
              0,
            )
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
            .spendingTxInReference(
              "9".repeat(64),
              0,
              refSize,
              alwaysSucceedHash,
            )
            .txInCollateral("e".repeat(64), 0, lovelace(100_000_000), address)
            .changeAddress(address)
            .complete();
        const fee = async (readSize: number, refSize: string) =>
          parse(await build(readSize, refSize, 0))
            .body()
            .fee();
        // 3000 declared bytes against 1, at the built-in price
        const price = BigInt(
          DEFAULT_PROTOCOL_PARAMETERS.minFeeRefScriptCostPerByte,
        );
        expect((await fee(1000, "2000")) - (await fee(0, "1"))).toBe(
          2999n * price,
        );
        await expect(build(0, "1")).rejects.toMatchObject({
          code: "MISSING_FETCHER",
        });

        // The body keeps the size declared for an input, which the fee counted
        const priced = (scriptSize: number) =>
          new MeshTxBuilder()
            .txIn("c".repeat(64), 0, lovelace(100_000_000), address, scriptSize)
            .txOut(address, lovelace(2_000_000))
            .changeAddress(address);
        const declared = priced(500);
        const declaredFee = parse(await declared.complete())
          .body()
          .fee();
        expect(declared.meshTxBuilderBody.inputs).toHaveLength(1);
        expect(declared.meshTxBuilderBody.inputs[0]!.txIn.scriptSize).toBe(500);
        expect(declared.meshTxBuilderBody.fee).toBe(declaredFee.toString());
        const unsized = parse(await priced(0).complete())
          .body()
          .fee();
        expect(declaredFee - unsized).toBe(500n * price);
        await expect(build(0, undefined, 0)).rejects.toMatchObject({
          code: "MISSING_FETCHER",
        });
      });

      it("keeps a declared reference script the fetcher does not have, and counts one size per out ref", async () => {
        const { emulator, address, funds } = await setup(validator);
        /** A mint by a reference script the emulator does not hold, and a read-only reference */
        const mintWith = (
          readSize: number,
          scriptSize: number,
          held?: UTxO,
          readHash?: string,
        ) => {
          const builder = new MeshTxBuilder({
            fetcher: emulator,
            evaluator: null,
          });
          if (held) builder.inputForEvaluation(held);
          return builder
            .readOnlyTxInReference(
              held?.input.txHash ?? readHash ?? "9".repeat(64),
              0,
              readSize,
            )
            .mintPlutusScriptV3()
            .mint("1", alwaysSucceedHash, "")
            .mintRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
            .mintTxInReference(
              "9".repeat(64),
              0,
              String(scriptSize),
              alwaysSucceedHash,
            )
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        };
        const fee = async (
          readSize: number,
          scriptSize: number,
          held?: UTxO,
          readHash?: string,
        ) =>
          parse(await mintWith(readSize, scriptSize, held, readHash))
            .body()
            .fee();
        const pricePerByte = BigInt(
          (await emulator.fetchProtocolParameters()).minFeeRefScriptCostPerByte,
        );

        // Built with the hash and size declared
        const txHex = await mintWith(1, 700);
        expect(
          parse(txHex)
            .body()
            .referenceInputs()
            ?.values()
            .map((i) => i.transactionId().toString()),
        ).toEqual(["9".repeat(64)]);
        // The declared size is priced
        expect((await fee(700, 700)) - (await fee(1, 1))).toBe(
          699n * pricePerByte,
        );
        // The larger of two sizes declared for one out ref
        expect(await fee(100, 700)).toBe(await fee(700, 700));
        expect(await fee(700, 100)).toBe(await fee(700, 700));
        // A size declared for an out ref whose UTxO is held is not added; for the same out ref
        // not held, it is
        const held = utxoAt("6".repeat(64), address, 2_000_000n);
        expect(
          (await fee(5000, 1, undefined, "6".repeat(64))) -
            (await fee(1, 1, undefined, "6".repeat(64))),
        ).toBe(4999n * pricePerByte);
        expect(await fee(5000, 1, held)).toBe(await fee(1, 1, held));
      });
    });
  },
);
