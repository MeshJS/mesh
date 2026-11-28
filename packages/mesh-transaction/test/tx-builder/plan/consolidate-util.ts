import type { TxEmulator } from "@meshsdk/tx-emulator";

import type { TxBuilderOptions, TxPlan, Utxo } from "../../../src/tx-builder";
import type { Validator } from "./plan-emulator-util";
import { output } from "../../../src/tx-builder";
import {
  builderOf,
  emulatorOf,
  FAST,
  recipient,
  walletOf,
  wrap,
} from "./plan-emulator-util";

// Helpers of the tests of consolidation steps in a plan: a fragmented wallet on the emulator,
// payments, and what the plan's consolidation steps made.

/** A token unit the tests' UTxOs hold */
export const wanted = `${"d4".repeat(28)}cafe`;

/** An out ref as text */
export const keyOf = (ref: { txHash: string; outputIndex: number }) =>
  `${ref.txHash}#${ref.outputIndex}`;

/**
 * An emulator of this validator holding the wallet's UTxOs with these values, a provider over it
 * and a builder with the fast defaults; with `maxTxSize` the builder takes the emulator's
 * parameters with a smaller limit, so that fewer UTxOs fragment the wallet; with `plutus` it
 * evaluates scripts on the emulator; with `confirmations` a step is final that many blocks after
 * its own
 */
export const fragmented = async (
  validator: Validator,
  values: readonly Record<string, bigint>[],
  options: {
    maxTxSize?: number;
    plutus?: boolean;
    confirmations?: number;
  } = {},
) => {
  const emulator = await emulatorOf(validator, 100_000_000);
  const provider = wrap(emulator);
  const params = await emulator.fetchProtocolParameters();
  const builderFor = (more: Partial<TxBuilderOptions> = {}) =>
    builderOf(provider, {
      ...(options.maxTxSize !== undefined && {
        params: { ...params, maxTxSize: options.maxTxSize },
      }),
      ...(options.plutus && { evaluator: emulator }),
      ...(options.confirmations !== undefined && {
        planDefaults: { ...FAST, confirmations: options.confirmations },
      }),
      ...more,
    });
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  for (const value of values) emulator.fund(address, value);
  return {
    emulator,
    provider,
    builder: builderFor(),
    builderFor,
    wallet,
    address,
  };
};

/** `count` UTxOs of `lovelace` each */
export const coins = (count: number, lovelace: bigint) =>
  Array.from({ length: count }, () => ({ lovelace }));

/** `count` UTxOs of 2 ada and one `wanted` each */
export const withWanted = (count: number) =>
  Array.from({ length: count }, () => ({
    lovelace: 2_000_000n,
    [wanted]: 1n,
  }));

export const pay = (value: Record<string, bigint>, address = recipient) =>
  output({ address, value });

export const consolidationsOf = (plan: TxPlan) =>
  plan.steps.filter((step) => step.kind === "consolidation");

/** The outputs of the plan's consolidation steps that are not change */
export const parkedOf = (plan: TxPlan) =>
  consolidationsOf(plan).flatMap((step) =>
    step.outputs.filter((each) => each.change !== true),
  );

/** How much of a unit an address holds on the emulator */
export const unitAt = (emulator: TxEmulator, address: string, unit: string) =>
  emulator
    .utxos({ address })
    .flatMap((u) => u.output.amount)
    .filter((a) => a.unit === unit)
    .reduce((sum, a) => sum + BigInt(a.quantity), 0n);

export const sumOf = (utxos: readonly Utxo[], unit: string) =>
  utxos.reduce((sum, utxo) => sum + (utxo.value[unit] ?? 0n), 0n);
