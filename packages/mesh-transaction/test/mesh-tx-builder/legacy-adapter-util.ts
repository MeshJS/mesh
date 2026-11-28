import {
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
import {
  resolvePlutusScriptAddress,
  resolveScriptRef,
  Serialization,
} from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import { MeshTxBuilder } from "../../src";
import { addWitnesses, signWitnesses } from "../../src/tx-builder";
import { alwaysSucceedCbor } from "../test-util";

export const words = Array(24).fill("solution");
export const lovelace = (quantity: bigint | number) => [
  { unit: "lovelace", quantity: String(quantity) },
];
export const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
export const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
export const scriptRef = resolveScriptRef(plutusScript);
/** Units that cover the always-succeeding script */
export const enoughUnits = { mem: 100_000, steps: 100_000_000 };

/** A UTxO at an address, made up: not on the emulator unless added */
export const utxoAt = (
  txHash: string,
  address: string,
  amount: bigint,
  extra: Partial<UTxO["output"]> = {},
): UTxO => ({
  input: { txHash, outputIndex: 0 },
  output: { address, amount: lovelace(amount), ...extra },
});

export const walletOf = async (networkId: 0 | 1 = 0) => {
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
export const setup = async (
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

export type Setup = Awaited<ReturnType<typeof setup>>;

/** Spends the locked UTxO with the attached script */
export const unlock = (
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

export const parse = (txHex: string) =>
  Serialization.Transaction.fromCbor(Serialization.TxCBOR(txHex));

/** Signs with the wallet and submits; the ledger must accept it */
export const accept = async ({ emulator, wallet }: Setup, txHex: string) => {
  // Witnesses added to the bytes as built
  const result = await emulator.submit(
    await addWitnesses(txHex, await signWitnesses(wallet, txHex)),
  );
  if (!result.accepted)
    throw new Error(`rejected: ${JSON.stringify(result.errors)}`);
  return result;
};

/** The emulator, as a fetcher stating the given network, or none */
export const stating = (emulator: TxEmulator, network: string | undefined) =>
  new Proxy(emulator, {
    get: (target, prop) =>
      prop === "network" ? network : Reflect.get(target, prop, target),
  }) as unknown as IFetcher;

/** The emulator, as a fetcher whose `fetchUTxOs` throws `error` for one transaction */
export const failingFor = (
  emulator: TxEmulator,
  txHash: string,
  error: unknown,
) =>
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
export const recordingEvaluator = (emulator: TxEmulator) => {
  const configure = jest.fn<void, [EvaluationContext]>();
  const evaluator: IEvaluator = {
    evaluateTx: (tx, utxos, txs) => emulator.evaluateTx(tx, utxos, txs),
    acceptsKnownUtxos: true,
    configure,
  };
  return { evaluator, configure };
};

/** The units of the redeemers a transaction carries */
export const unitsOf = (txHex: string) =>
  parse(txHex)
    .witnessSet()
    .redeemers()!
    .values()
    .map((r) => ({
      mem: Number(r.exUnits().mem()),
      steps: Number(r.exUnits().steps()),
    }));

export const DEFAULT_COST_MODELS = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];

export const protocolOf = (builder: MeshTxBuilder) =>
  (builder as unknown as { _protocolParams: Protocol })._protocolParams;
