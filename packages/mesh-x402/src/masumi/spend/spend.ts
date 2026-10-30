/** Internal scaffolding shared by every spend builder (deliberately not re-exported). */
import { UTxO } from "@meshsdk/common";
import { MeshTxBuilder } from "@meshsdk/transaction";
import { MeshWallet } from "@meshsdk/wallet";

import { MasumiDeployment } from "../../types/payment-requirements";
import { resolveMasumiEscrowScript } from "../escrow-address";
import { selectCollateralUtxo } from "./collateral";
import { SpendContext } from "./context";
import { slotToUnixMs } from "./timing";

/** Validity window (slots) for terminal actions, which have no `must_end_before` of their own. */
export const WITHDRAW_WINDOW_SLOTS = 3600;

/** Network id, UTxOs and a collateral input of the wallet that pays for and signs the spend. */
export const loadSpender = async (wallet: MeshWallet) => {
  const [networkId, utxos] = await Promise.all([
    wallet.getNetworkId(),
    wallet.getUtxos(),
  ]);
  return {
    networkId: networkId as 0 | 1,
    utxos,
    collateral: selectCollateralUtxo(utxos),
  };
};

type Spender = Awaited<ReturnType<typeof loadSpender>>;

/** Starts a builder that spends `escrowUtxo` (inline datum, V3 script) with `redeemer`. */
export const startEscrowSpend = (
  escrowUtxo: UTxO,
  redeemer: Parameters<MeshTxBuilder["txInRedeemerValue"]>[0],
  deployment: MasumiDeployment,
  ctx: SpendContext,
): MeshTxBuilder => {
  const { input, output } = escrowUtxo;
  return new MeshTxBuilder({
    fetcher: ctx.fetcher,
    evaluator: ctx.evaluator,
    verbose: false,
  })
    .spendingPlutusScriptV3()
    .txIn(input.txHash, input.outputIndex, output.amount, output.address)
    .txInInlineDatumPresent()
    .txInRedeemerValue(redeemer, "Mesh")
    .txInScript(resolveMasumiEscrowScript(deployment).code);
};

/** Adds collateral, the optional required signer and the validity range, then balances and builds. */
export const finishSpend = (
  chain: MeshTxBuilder,
  spender: Pick<Spender, "utxos" | "collateral">,
  opts: {
    changeAddress: string;
    signerHash?: string;
    invalidBefore: number;
    invalidHereafter: number;
  },
): Promise<string> => {
  const { input, output } = spender.collateral;
  chain = chain.txInCollateral(
    input.txHash,
    input.outputIndex,
    output.amount,
    output.address,
  );
  if (opts.signerHash) chain = chain.requiredSignerHash(opts.signerHash);
  return chain
    .invalidBefore(opts.invalidBefore)
    .invalidHereafter(opts.invalidHereafter)
    .changeAddress(opts.changeAddress)
    .selectUtxosFrom(spender.utxos)
    .complete();
};

/**
 * The validator computes `cooldown_time` as `tx_latest_time + cooldown_period`, where
 * `tx_latest_time` is THIS transaction's own validity-range upper bound (converted to POSIX ms
 * by the ledger) - not wall-clock "now". `cooldownPeriod` is already POSIX ms.
 */
export const freshCooldownTime = (
  deployment: MasumiDeployment,
  invalidHereafter: number,
  currentSlot: number,
): bigint =>
  BigInt(
    slotToUnixMs(invalidHereafter, currentSlot) +
      Number(deployment.cooldownPeriod),
  );
