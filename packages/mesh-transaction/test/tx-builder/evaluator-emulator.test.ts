import {
  IEvaluator,
  mConStr0,
  resolveScriptRef,
  ScriptEvaluationError,
  UTxO,
} from "@meshsdk/core";
import { OfflineEvaluator } from "@meshsdk/core-csl";
import {
  OfflineEvaluatorScalus,
  resolvePlutusScriptAddress,
} from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  BuiltTx,
  spend,
  TxBuilder,
  TxBuildError,
  TxPart,
  validity,
} from "../../src/tx-builder";
import { alwaysFailCbor, alwaysSucceedCbor } from "../test-util";

/** The emulator's ledger is a preview one */
const network = "preview";
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const failingScript = { code: alwaysFailCbor, version: "V3" as const };
const lovelace = (quantity: string) => [{ unit: "lovelace", quantity }];
const fundsHash = "0".repeat(64);
const collateralHash = "1".repeat(64);
const lockedHash = "2".repeat(64);
const refScriptHash = "3".repeat(64);
const failingHash = "4".repeat(64);

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

/*
 * Script spends built with the builder's default evaluator and with each evaluator Mesh ships,
 * signed and submitted to the emulator, whose ledger rules check the execution units.
 */
describe("TxBuilder's evaluators on the emulator", () => {
  let provider: ScalusEmulator;
  let wallet: MeshWallet;
  let address: string;
  let walletUtxos: UTxO[];

  const submit = async (built: BuiltTx) =>
    provider.submitTx(await wallet.signTx(built.tx));
  const unlock = (exUnits?: { mem: number; steps: number }) =>
    spend.plutus({
      utxo: { txHash: lockedHash, outputIndex: 0 },
      script: { reference: { txHash: refScriptHash, outputIndex: 0 } },
      redeemer: { data: mConStr0([]), ...(exUnits && { exUnits }) },
      label: "unlock",
    });
  const unlockFailing = (exUnits?: { mem: number; steps: number }) =>
    spend.plutus({
      utxo: { txHash: failingHash, outputIndex: 0 },
      script: failingScript,
      redeemer: { data: mConStr0([]), ...(exUnits && { exUnits }) },
      label: "fails",
    });
  const build = (builder: TxBuilder, parts: TxPart[]) =>
    builder.build(parts, {
      payer: { changeAddress: address, utxos: walletUtxos },
    });

  beforeEach(async () => {
    wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words: Array(24).fill("solution") },
    });
    await wallet.init();
    address = (await wallet.getChangeAddress())!;
    provider = await ScalusEmulator.create([
      {
        input: { txHash: fundsHash, outputIndex: 0 },
        output: { address, amount: lovelace("10000000000") },
      },
      {
        input: { txHash: collateralHash, outputIndex: 0 },
        output: { address, amount: lovelace("5000000") },
      },
      {
        input: { txHash: lockedHash, outputIndex: 0 },
        output: {
          address: resolvePlutusScriptAddress(plutusScript, 0),
          amount: lovelace("20000000"),
          plutusData: "d87980",
        },
      },
      {
        input: { txHash: refScriptHash, outputIndex: 0 },
        output: {
          address,
          amount: lovelace("20000000"),
          scriptRef: resolveScriptRef(plutusScript),
        },
      },
      {
        input: { txHash: failingHash, outputIndex: 0 },
        output: {
          address: resolvePlutusScriptAddress(failingScript, 0),
          amount: lovelace("20000000"),
          plutusData: "d87980",
        },
      },
    ]);
    // The wallet's UTxOs to pay from, without the reference script output
    walletUtxos = (await provider.fetchAddressUTxOs(address)).filter(
      (utxo) => !utxo.output.scriptRef,
    );
  });

  it.each<[string, (provider: ScalusEmulator) => IEvaluator, boolean]>([
    ["OfflineEvaluator", (p) => new OfflineEvaluator(p, "preview"), false],
    [
      "OfflineEvaluatorScalus",
      (p) => new OfflineEvaluatorScalus(p, "preview"),
      true,
    ],
    ["ScalusEmulator", (p) => p, false],
  ])(
    "builds a script spend the ledger accepts with %s",
    async (_, make, local) => {
      const evaluator = make(provider);
      const evaluateTx = jest.spyOn(evaluator, "evaluateTx");
      const built = await build(
        new TxBuilder({ network, provider, evaluator }),
        [unlock()],
      );
      expect(built.redeemers[0]!.exUnits.mem).toBeGreaterThan(0);
      expect(evaluateTx).toHaveBeenCalled();
      // One that does not take the builder's UTxOs resolves the inputs from the emulator
      for (const [, utxos, txs] of evaluateTx.mock.calls) {
        expect(txs).toEqual([]);
        if (local) expect(utxos!.length).toBeGreaterThan(0);
        else expect(utxos).toEqual([]);
      }
      expect(await submit(built)).toBe(built.txHash);
    },
  );

  it("evaluates with the UTxOs it holds, the provider asked only for the outputs parts name", async () => {
    const fetchUTxOs = jest.spyOn(provider, "fetchUTxOs");
    const builder = new TxBuilder({ network, provider });
    expect(builder.evaluator).toBeInstanceOf(OfflineEvaluatorScalus);
    const built = await build(builder, [unlock()]);

    expect(built.collateral!.inputs.length).toBeGreaterThan(0);
    // Once each for the script input and the reference script; never for the wallet's UTxOs
    expect(fetchUTxOs.mock.calls.map(([hash]) => hash).sort()).toEqual(
      [lockedHash, refScriptHash].sort(),
    );
    expect(await submit(built)).toBe(built.txHash);
  });

  it("reports a failing script, and takes stated units without evaluation after `evaluator: null`", async () => {
    const error = (await expectBuildError(
      build(new TxBuilder({ network, provider }), [unlockFailing()]),
      "EVALUATION_FAILED",
    )) as TxBuildError<"EVALUATION_FAILED">;
    // The one failed script names the part; the evaluator's error is the cause
    expect(error).toMatchObject({ part: "spend", label: "fails" });
    const { cause } = error;
    expect(ScriptEvaluationError.is(cause)).toBe(true);
    expect(error.message).toBe(
      `spend "fails": script evaluation failed: ${(cause as Error).message}`,
    );
    expect((cause as Error).message).toContain("failed");
    expect(error.details.failures).toHaveLength(1);
    expect(error.details.failures[0]).toMatchObject({
      tag: "SPEND",
      part: "spend",
      label: "fails",
    });

    const stated = { mem: 100_000, steps: 100_000_000 };
    const built = await build(
      new TxBuilder({ network, provider, evaluator: null }),
      [unlockFailing(stated)],
    );
    expect(built.redeemers[0]!.exUnits).toEqual(stated);
  });

  it("evaluates a transaction with a validity interval on the builder's network clock", async () => {
    const parts = [
      unlock(),
      validity({
        // An hour after the emulator's slot
        invalidHereafter: provider.emulator.getSlot() + 3600,
      }),
    ];
    const builder = new TxBuilder({ network, provider });
    expect(builder.evaluator).toBeInstanceOf(OfflineEvaluatorScalus);
    const built = await build(builder, parts);
    expect(built.redeemers[0]!.exUnits.mem).toBeGreaterThan(0);
    expect(await submit(built)).toBe(built.txHash);
  });

  it("checks units stated on a redeemer with the default evaluator", async () => {
    const tooLow = { mem: 7, steps: 7 };
    const error = await expectBuildError(
      build(new TxBuilder({ network, provider }), [unlock(tooLow)]),
      "EXUNITS_TOO_LOW",
    );
    const { needed, given } = (error as TxBuildError<"EXUNITS_TOO_LOW">)
      .details;
    expect(given).toEqual({ mem: 7, steps: 7 });
    expect(needed.mem).toBeGreaterThan(7);

    const enough = {
      mem: Number(needed.mem) + 1000,
      steps: Number(needed.steps) + 1000,
    };
    const built = await build(new TxBuilder({ network, provider }), [
      unlock(enough),
    ]);
    expect(built.redeemers[0]!.exUnits).toEqual(enough);

    const unchecked = await build(
      new TxBuilder({ network, provider, evaluator: null }),
      [unlock(tooLow)],
    );
    expect(unchecked.redeemers[0]!.exUnits).toEqual(tooLow);
    expect(await submit(built)).toBe(built.txHash);
  });
});
