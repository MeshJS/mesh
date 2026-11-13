import type { ISubmitter, UTxO } from "@meshsdk/common";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import type { TxBuilderOptions } from "../../../src/tx-builder";
import { output, TxBuilder } from "../../../src/tx-builder";
import { baseAddress } from "../../test-util";

// Helpers of the intent tests that run on TxEmulator: a funded wallet, a builder with the fast
// defaults of the tests, and a provider wrapper that forwards to an emulator and changes one
// thing.

export const words = Array(24).fill("solution");
export const recipient = baseAddress(2);

/** The defaults of every lifecycle test: no margin, no depth, a fast pace */
export const FAST = {
  expiryMarginMs: 0,
  confirmations: 0,
  pollMs: 10,
  resendMs: 10,
} as const;

/**
 * A preprod wallet of the tests' seed, without a fetcher: its UTxOs are read through the
 * builder. Another account index gives another payer.
 */
export const walletOf = async (accountIndex = 0) => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
    accountIndex,
  });
  await wallet.init();
  return wallet;
};

/** A preprod emulator validating with Scalus */
export const emulatorOf = (slot?: number) =>
  TxEmulator.create({
    validator: "scalus",
    network: "preprod",
    ...(slot !== undefined && { slot }),
  });

/** A payment of some ada to the recipient */
export const pay = (lovelace = 5_000_000n, address = recipient) =>
  output({ address, value: { lovelace } });

type Method = (...args: any[]) => any;

/**
 * What a wrapped provider does with a call: the hook gets the call to the emulator it forwards
 * to and the arguments; `null` hides the method
 */
export type Hooks = Partial<
  Record<string, ((forward: Method, ...args: any[]) => any) | null>
>;

/** The control of a wrapped provider: where it forwards to, its hooks, its counted calls */
export type Control = {
  target: TxEmulator;
  hooks: Hooks;
  calls: Record<string, number>;
  /** How many calls of these methods were made */
  count(...methods: string[]): number;
};

/**
 * A provider that forwards every call to an emulator, counting them, unless a hook says
 * otherwise. `control.target` may be switched, e.g. to a fork.
 */
export const wrap = (
  target: TxEmulator,
  hooks: Hooks = {},
): TxEmulator & { control: Control } => {
  const control: Control = {
    target,
    hooks,
    calls: {},
    count: (...methods) =>
      methods.reduce((sum, m) => sum + (control.calls[m] ?? 0), 0),
  };
  return new Proxy({} as TxEmulator & { control: Control }, {
    get(_, name) {
      if (name === "control") return control;
      if (typeof name === "string" && control.hooks[name] === null)
        return undefined;
      const original = (
        control.target as unknown as Record<PropertyKey, unknown>
      )[name];
      if (typeof original !== "function") return original;
      return (...args: unknown[]) => {
        if (typeof name === "string")
          control.calls[name] = (control.calls[name] ?? 0) + 1;
        const forward = (...a: unknown[]) =>
          (original as Method).apply(control.target, a);
        const hook = typeof name === "string" ? control.hooks[name] : undefined;
        return hook ? hook(forward, ...args) : forward(...args);
      };
    },
    has(_, name) {
      if (name === "control") return true;
      if (typeof name === "string" && control.hooks[name] === null)
        return false;
      return name in control.target;
    },
  });
};

/** A builder over a provider, with the fast defaults unless others are given */
export const builderOf = (
  provider: TxBuilderOptions["provider"],
  options: Partial<TxBuilderOptions> = {},
) =>
  new TxBuilder({
    network: "preprod",
    provider,
    intentDefaults: FAST,
    ...options,
  });

/** An emulator, a wrapped provider over it, a builder and a funded wallet */
export const setup = async (
  options: {
    hooks?: Hooks;
    builder?: Partial<TxBuilderOptions>;
    funds?: bigint[];
    slot?: number;
  } = {},
) => {
  const emulator = await emulatorOf(options.slot);
  const provider = wrap(emulator, options.hooks);
  const builder = builderOf(provider, options.builder);
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  const funded: UTxO[] = (options.funds ?? [100_000_000n, 20_000_000n]).map(
    (lovelace) => emulator.fund(address, { lovelace }),
  );
  return { emulator, provider, builder, wallet, address, funded };
};

/** A submitter that counts its calls and answers as told: by default it forwards */
export const submitterOf = (
  answer: (tx: string) => Promise<string>,
): ISubmitter & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    submitTx: async (tx: string) => {
      calls.push(tx);
      return answer(tx);
    },
  };
};

/** The emulator's slot, moved on by `slots` */
export const advance = (emulator: TxEmulator, slots: number) =>
  emulator.advanceTo({ slot: emulator.slot + slots });

/** A value thrown and caught, for checks on errors */
export const caught = async (promise: Promise<unknown>): Promise<any> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
};
