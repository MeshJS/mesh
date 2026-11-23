import { ProviderError } from "@meshsdk/common";
import { CborWriter } from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";

import type { TxBuilderOptions } from "../../../src/tx-builder";
import type { Validator } from "./plan-emulator-util";
import { output } from "../../../src/tx-builder";
import { baseAddress } from "../../test-util";
import { builderOf, Hooks, walletOf, wrap } from "./plan-emulator-util";

// Helpers of the tests that run plans on TxEmulator: an emulator of either validator behind a
// wrapped provider, a builder with the fast defaults, and a funded wallet.

export { VALIDATORS } from "./plan-emulator-util";
export type { Validator } from "./plan-emulator-util";

export const ADA = 1_000_000n;
export const alice = baseAddress(3);
export const bob = baseAddress(4);
export const carol = baseAddress(5);
export const dave = baseAddress(6);

/** A payment of some ada to an address */
export const payTo = (address: string, lovelace: bigint, label?: string) =>
  output({
    address,
    value: { lovelace },
    ...(label !== undefined && { label }),
  });

/**
 * An emulator of preprod with this validator, a provider that forwards to it, a builder over
 * that provider with the fast defaults and the emulator as its evaluator, and a wallet funded
 * with these UTxOs (one of 1000 ada by default)
 */
export const stepSetup = async (
  validator: Validator,
  options: {
    hooks?: Hooks;
    builder?: Partial<TxBuilderOptions>;
    funds?: bigint[];
  } = {},
) => {
  const emulator = await TxEmulator.create({
    validator,
    network: "preprod",
    slot: 100_000_000,
  });
  const provider = wrap(emulator, options.hooks);
  const builder = builderOf(provider, {
    evaluator: emulator,
    ...options.builder,
  });
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  const funded = (options.funds ?? [1000n * ADA]).map((lovelace) =>
    emulator.fund(address, { lovelace }),
  );
  return { emulator, provider, builder, wallet, address, funded };
};

/** The lovelace of each UTxO an address holds on the emulator */
export const paidTo = (emulator: TxEmulator, address: string) =>
  emulator
    .utxos({ address })
    .map((utxo) =>
      BigInt(utxo.output.amount.find((a) => a.unit === "lovelace")!.quantity),
    );

/** A refusal of the ledger, as a provider throws it */
export const refusal = () =>
  new ProviderError("the ledger refused the transaction", {
    kind: "rejected",
    status: 400,
    retryable: false,
  });

/** A witness set of vkey witnesses, each a public key and a signature */
export const witnessSetOf = (
  ...pairs: { vkey: string; signature: string }[]
) => {
  const writer = new CborWriter().writeStartMap(1).writeInt(0);
  writer.writeStartArray(pairs.length);
  for (const { vkey, signature } of pairs)
    writer
      .writeStartArray(2)
      .writeByteString(Buffer.from(vkey, "hex"))
      .writeByteString(Buffer.from(signature, "hex"));
  return writer.encodeAsHex();
};
