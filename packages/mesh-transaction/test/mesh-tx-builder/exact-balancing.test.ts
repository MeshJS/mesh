import {
  applyCborEncoding,
  Asset,
  IEvaluator,
  mConStr0,
  Protocol,
  UTxO,
} from "@meshsdk/core";
import { resolvePlutusScriptAddress, Serialization } from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import {
  LargestFirstInputSelector,
  MeshTxBuilder,
  MeshTxBuilderOptions,
} from "@meshsdk/transaction";
import { MeshWallet } from "@meshsdk/wallet";

import { alwaysSucceedCbor } from "../test-util";

/**
 * A PlutusV3 spending validator whose cost depends on the transaction fee:
 *
 *   \ctx -> if fee ctx < 100 ADA then loop 1000 else ()
 *
 * Coin selection prices the redeemers on a skeleton whose fee is a 1 000 ADA placeholder,
 * so it sees the cheap branch, while the final transaction - with its real fee of well
 * under 100 ADA - takes the expensive one. Hand-written UPLC (the fee is field 3 of the
 * TxInfo), encoded to flat with the Plutus `uplc` tool:
 *
 *   (program 1.1.0 (lam ctx [
 *     (lam fee (force [ [ [ (force (builtin ifThenElse))
 *         [ [ (builtin lessThanInteger) fee ] (con integer 100000000) ] ]
 *       (delay [ (lam loop [ [ loop loop ] (con integer 1000) ])
 *         (lam self (lam n (force [ [ [ (force (builtin ifThenElse))
 *             [ [ (builtin equalsInteger) n ] (con integer 0) ] ]
 *           (delay (con unit ())) ]
 *           (delay [ [ self self ] [ [ (builtin subtractInteger) n ] (con integer 1) ] ]) ]))) ]) ]
 *       (delay (con unit ())) ]))
 *     [ (builtin unIData) [ (force (builtin headList))
 *       [ (force (builtin tailList)) [ (force (builtin tailList)) [ (force (builtin tailList))
 *         [ (force (force (builtin sndPair))) [ (builtin unConstrData)
 *           [ (force (builtin headList))
 *             [ (force (force (builtin sndPair))) [ (builtin unConstrData) ctx ] ] ] ] ] ] ] ] ] ] ]))
 */
const feeDependentCbor = applyCborEncoding(
  "584d0101002325333573466e20005208084af5f13233001001483403c894ccd5cd19b87001480005261330020023370200290010a4c6eb4d5d09aba2357446ae88d55cf1baa357426aae78dd500081",
);

const lovelace = (quantity: string) => [{ unit: "lovelace", quantity }];

const scriptAddress = resolvePlutusScriptAddress(
  { code: feeDependentCbor, version: "V3" },
  0,
);
const scriptTxHash = "2".repeat(64);
const unitDatum = Serialization.PlutusData.fromCore({
  constructor: 0n,
  fields: { items: [] },
}).toCbor();

const scriptUtxo: UTxO = {
  input: { txHash: scriptTxHash, outputIndex: 0 },
  output: {
    address: scriptAddress,
    amount: lovelace("20000000"),
    plutusData: unitDatum,
  },
};

/**
 * The same validator with the threshold at 0.25 ADA, between the fee of a transaction
 * that takes the cheap branch and one that takes the expensive branch:
 *
 *   \ctx -> if fee ctx < 0.25 ADA then loop 1000 else ()
 *
 * A higher fee makes it cheaper, so a fee that follows the minimum would flip forever.
 * Its UPLC is the one above with `(con integer 250000)` as the threshold.
 */
const thresholdCbor = applyCborEncoding(
  "584c0101002325333573466e2000520a0c21e13233001001483403c894ccd5cd19b87001480005261330020023370200290010a4c6eb4d5d09aba2357446ae88d55cf1baa357426aae78dd500081",
);
const thresholdUtxo: UTxO = {
  input: { txHash: "5".repeat(64), outputIndex: 0 },
  output: {
    address: resolvePlutusScriptAddress(
      { code: thresholdCbor, version: "V3" },
      0,
    ),
    amount: lovelace("20000000"),
    plutusData: unitDatum,
  },
};

/** A UTxO locked by a script whose cost does not depend on the fee */
const alwaysSucceedUtxo: UTxO = {
  input: { txHash: "4".repeat(64), outputIndex: 0 },
  output: {
    address: resolvePlutusScriptAddress(
      { code: alwaysSucceedCbor, version: "V3" },
      0,
    ),
    amount: lovelace("20000000"),
    plutusData: unitDatum,
  },
};

async function setup(walletAmount: Asset[] = lovelace("10000000000")) {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words: Array(24).fill("solution") },
  });
  await wallet.init();
  const address = (await wallet.getChangeAddress())!;
  const emulator = await ScalusEmulator.create([
    {
      input: { txHash: "0".repeat(64), outputIndex: 0 },
      output: { address, amount: walletAmount },
    },
    {
      input: { txHash: "1".repeat(64), outputIndex: 0 },
      output: { address, amount: lovelace("5000000") },
    },
    {
      input: { txHash: "6".repeat(64), outputIndex: 0 },
      output: { address, amount: lovelace("300000") },
    },
    scriptUtxo,
    alwaysSucceedUtxo,
    thresholdUtxo,
  ]);
  const params = await emulator.fetchProtocolParameters();
  const walletUtxos = await emulator.fetchAddressUTxOs(address);
  const collateral = walletUtxos.find(
    (utxo) => utxo.input.txHash === "1".repeat(64),
  )!;
  // Too small to cover 150% of a script transaction's fee
  const smallCollateral = walletUtxos.find(
    (utxo) => utxo.input.txHash === "6".repeat(64),
  )!;
  const utxos = walletUtxos.filter(
    (utxo) => utxo !== collateral && utxo !== smallCollateral,
  );
  return {
    wallet,
    address,
    emulator,
    params,
    utxos,
    collateral,
    smallCollateral,
  };
}

/** Minimum fee of a signed transaction without reference scripts, computed from scratch */
const minFee = (signedTxHex: string, params: Protocol) => {
  const tx = Serialization.Transaction.fromCbor(
    Serialization.TxCBOR(signedTxHex),
  );
  let mem = 0n;
  let steps = 0n;
  for (const redeemer of tx.witnessSet().redeemers()?.values() ?? []) {
    mem += redeemer.exUnits().mem();
    steps += redeemer.exUnits().steps();
  }
  const sizeFee =
    BigInt(params.minFeeA) * BigInt(signedTxHex.length / 2) +
    BigInt(params.minFeeB);
  const exUnitsFee = Math.ceil(
    params.priceMem * Number(mem) + params.priceStep * Number(steps),
  );
  return sizeFee + BigInt(exUnitsFee);
};

const declaredUnits = (txHex: string) =>
  Serialization.Transaction.fromCbor(Serialization.TxCBOR(txHex))
    .witnessSet()
    .redeemers()!
    .values()
    .map((redeemer) => ({
      mem: Number(redeemer.exUnits().mem()),
      steps: Number(redeemer.exUnits().steps()),
    }));

type Setup = Awaited<ReturnType<typeof setup>>;

/** Spends the script UTxO back to the wallet */
const spendScriptUtxo = (
  { address, emulator, params, utxos, collateral }: Setup,
  {
    evaluator = emulator,
    selector,
    fee,
    script = { utxo: scriptUtxo, cbor: feeDependentCbor },
    payment,
    selectFrom = utxos,
    totalCollateral,
    collateralUtxo = collateral,
  }: {
    evaluator?: IEvaluator;
    selector?: MeshTxBuilderOptions["selector"];
    fee?: string;
    script?: { utxo: UTxO; cbor: string };
    payment?: Asset[];
    selectFrom?: UTxO[];
    totalCollateral?: string;
    collateralUtxo?: UTxO;
  } = {},
) => {
  const txBuilder = new MeshTxBuilder({
    fetcher: emulator,
    evaluator,
    params,
    selector,
  });
  if (fee) txBuilder.setFee(fee);
  if (payment) txBuilder.txOut(address, payment);
  if (totalCollateral) txBuilder.setTotalCollateral(totalCollateral);
  return txBuilder
    .spendingPlutusScriptV3()
    .txIn(script.utxo.input.txHash, script.utxo.input.outputIndex)
    .txInInlineDatumPresent()
    .txInRedeemerValue(mConStr0([]))
    .txInScript(script.cbor)
    .txInCollateral(
      collateralUtxo.input.txHash,
      collateralUtxo.input.outputIndex,
      collateralUtxo.output.amount,
      collateralUtxo.output.address,
    )
    .changeAddress(address)
    .selectUtxosFrom(selectFrom)
    .complete();
};

/** Counts the evaluations and lets a test rewrite their results */
const countingEvaluator = (
  evaluator: IEvaluator,
  rewrite: (
    actions: Awaited<ReturnType<IEvaluator["evaluateTx"]>>,
    call: number,
  ) => Awaited<ReturnType<IEvaluator["evaluateTx"]>> = (actions) => actions,
) => {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    evaluateTx: async (
      ...args: Parameters<IEvaluator["evaluateTx"]>
    ): ReturnType<IEvaluator["evaluateTx"]> =>
      rewrite(await evaluator.evaluateTx(...args), ++calls),
  };
};

/** Adds `mem` memory units to every redeemer of the evaluations `when` selects */
const inflateMem =
  (mem: number, when: (call: number) => boolean) =>
  (actions: Awaited<ReturnType<IEvaluator["evaluateTx"]>>, call: number) =>
    when(call)
      ? actions.map((action) => ({
          ...action,
          budget: { ...action.budget, mem: action.budget.mem + mem },
        }))
      : actions;

const selectors: [string, MeshTxBuilderOptions["selector"]][] = [
  ["CardanoSdkInputSelector", undefined],
  ["LargestFirstInputSelector", new LargestFirstInputSelector()],
];

describe("MeshTxBuilder exact balancing", () => {
  it.each(selectors)(
    "declares the units and fee of the final transaction for a fee-dependent script (%s)",
    async (_name, selector) => {
      const context = await setup();
      const { wallet, emulator, params, utxos } = context;
      const txHex = await spendScriptUtxo(context, { selector });

      // The units the final transaction really needs, from an independent evaluation
      const evaluated = (await emulator.evaluateTx(txHex)).map(
        (action) => action.budget,
      );
      expect(declaredUnits(txHex)).toEqual(evaluated);

      const signedTx = await wallet.signTx(txHex);
      const body = Serialization.Transaction.fromCbor(
        Serialization.TxCBOR(signedTx),
      ).body();
      expect(body.fee()).toBe(minFee(signedTx, params));

      // The change took the fee difference: inputs = outputs + fee
      const known = new Map(
        [...utxos, scriptUtxo].map((utxo) => [
          `${utxo.input.txHash}#${utxo.input.outputIndex}`,
          BigInt(
            utxo.output.amount.find((asset) => asset.unit === "lovelace")!
              .quantity,
          ),
        ]),
      );
      const inputsTotal = body
        .inputs()
        .values()
        .reduce(
          (sum, input) =>
            sum + known.get(`${input.transactionId()}#${input.index()}`)!,
          0n,
        );
      const outputsTotal = body
        .outputs()
        .reduce((sum, output) => sum + output.amount().coin(), 0n);
      expect(outputsTotal + body.fee()).toBe(inputsTotal);

      expect(await emulator.submitTx(signedTx)).toHaveLength(64);
    },
  );

  it("keeps a manual fee and still declares the units of the final transaction", async () => {
    const context = await setup();
    const { wallet, emulator } = context;
    const txHex = await spendScriptUtxo(context, { fee: "1000000" });

    const tx = Serialization.Transaction.fromCbor(Serialization.TxCBOR(txHex));
    expect(tx.body().fee()).toBe(1000000n);
    expect(declaredUnits(txHex)).toEqual(
      (await emulator.evaluateTx(txHex)).map((action) => action.budget),
    );
    expect(await emulator.submitTx(await wallet.signTx(txHex))).toHaveLength(
      64,
    );
  });

  it("costs one evaluation of the final transaction when selection already priced it", async () => {
    const context = await setup();
    const { address, emulator, params, utxos, collateral } = context;
    const evaluator = countingEvaluator(emulator);
    await new MeshTxBuilder({ fetcher: emulator, evaluator, params })
      .spendingPlutusScriptV3()
      .txIn(alwaysSucceedUtxo.input.txHash, 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue(mConStr0([]))
      .txInScript(alwaysSucceedCbor)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .changeAddress(address)
      .selectUtxosFrom(utxos)
      .complete();
    // One for the selection skeleton, one to check the final transaction
    expect(evaluator.calls).toBe(2);
  });

  it("throws instead of returning a transaction when the units never settle", async () => {
    const context = await setup();
    // Every evaluation reports other units than the one before it
    const evaluator = countingEvaluator(context.emulator, (actions, call) =>
      actions.map((action) => ({
        ...action,
        budget: { ...action.budget, mem: action.budget.mem + call },
      })),
    );
    await expect(spendScriptUtxo(context, { evaluator })).rejects.toThrow(
      "did not settle after 20 evaluations",
    );
  });

  // The cardano-sdk selector puts the excess lovelace in the first split change output,
  // largest-first in the last one. The final transaction reports 1 000 000 more memory
  // units than the selection saw, so its fee rises by about 0.06 ADA, more than a split
  // output that holds just its minimum can give.
  it.each([
    ["CardanoSdkInputSelector", undefined, 1],
    ["LargestFirstInputSelector", new LargestFirstInputSelector(), 2],
  ] as [string, MeshTxBuilderOptions["selector"], number][])(
    "puts the fee difference into the change output that has the lovelace when change is split (%s)",
    async (_name, selector, selectionEvaluations) => {
      // So many tokens that the change exceeds the max value size, and the selector splits it
      const tokens = Array.from({ length: 170 }, (_, i) => ({
        unit: i.toString(16).padStart(56, "a") + "01",
        quantity: "1",
      }));
      const context = await setup([...lovelace("100000000"), ...tokens]);
      const { wallet, emulator, params } = context;
      const evaluator = countingEvaluator(
        emulator,
        inflateMem(1_000_000, (call) => call > selectionEvaluations),
      );
      const txHex = await spendScriptUtxo(context, {
        evaluator,
        selector,
        payment: lovelace("30000000"),
      });

      const tx = Serialization.Transaction.fromCbor(
        Serialization.TxCBOR(txHex),
      );
      expect(tx.body().outputs().length).toBeGreaterThan(2);
      expect(declaredUnits(txHex)).toEqual(
        (await emulator.evaluateTx(txHex)).map(({ budget }) => ({
          ...budget,
          mem: budget.mem + 1_000_000,
        })),
      );
      const signedTx = await wallet.signTx(txHex);
      expect(tx.body().fee()).toBe(minFee(signedTx, params));
      expect(await emulator.submitTx(signedTx)).toHaveLength(64);
    },
  );

  it.each(selectors)(
    "does not lower the fee when a higher fee makes the script cheaper (%s)",
    async (_name, selector) => {
      const context = await setup();
      const { wallet, emulator, params } = context;
      const txHex = await spendScriptUtxo(context, {
        selector,
        script: { utxo: thresholdUtxo, cbor: thresholdCbor },
      });

      // The fee stays above the threshold, so the script takes the cheap branch it declares.
      // Largest-first prices its last skeleton below the threshold, so without the final
      // evaluation it would declare the expensive branch.
      const signedTx = await wallet.signTx(txHex);
      const fee = Serialization.Transaction.fromCbor(
        Serialization.TxCBOR(signedTx),
      )
        .body()
        .fee();
      expect(fee).toBeGreaterThanOrEqual(250_000n);
      expect(fee).toBeGreaterThan(minFee(signedTx, params));
      expect(declaredUnits(txHex)).toEqual(
        (await emulator.evaluateTx(txHex)).map((action) => action.budget),
      );
      expect(await emulator.submitTx(signedTx)).toHaveLength(64);
    },
  );

  it("refunds the selection's fee estimate to the change when the final transaction costs less", async () => {
    const context = await setup();
    const { wallet, emulator, params } = context;
    // The selection skeleton, and only it, reports 5 000 000 more memory units
    const evaluator = countingEvaluator(
      emulator,
      inflateMem(5_000_000, (call) => call === 1),
    );
    const txHex = await spendScriptUtxo(context, { evaluator });

    const signedTx = await wallet.signTx(txHex);
    expect(
      Serialization.Transaction.fromCbor(Serialization.TxCBOR(signedTx))
        .body()
        .fee(),
    ).toBe(minFee(signedTx, params));
    expect(declaredUnits(txHex)).toEqual(
      (await emulator.evaluateTx(txHex)).map((action) => action.budget),
    );
    expect(await emulator.submitTx(signedTx)).toHaveLength(64);
  });

  it("throws when the change output cannot pay the higher fee", async () => {
    const context = await setup();
    // Only the script input pays, and the change is about 1.1 ADA. The final transaction
    // reports 10 000 000 more memory units, about 0.58 ADA more fee.
    const evaluator = countingEvaluator(
      context.emulator,
      inflateMem(10_000_000, (call) => call > 1),
    );
    await expect(
      spendScriptUtxo(context, {
        evaluator,
        payment: lovelace("18700000"),
        selectFrom: [],
      }),
    ).rejects.toThrow(/in the change output, below its minimum of/);
  });

  it("throws when the total collateral does not cover the settled fee", async () => {
    const context = await setup();
    await expect(
      spendScriptUtxo(context, { totalCollateral: "100000" }),
    ).rejects.toThrow("Collateral of 100000 lovelace does not cover 150%");
  });

  it("throws when the collateral inputs do not cover the settled fee", async () => {
    const context = await setup();
    await expect(
      spendScriptUtxo(context, { collateralUtxo: context.smallCollateral }),
    ).rejects.toThrow("Collateral of 300000 lovelace does not cover 150%");
  });
});
