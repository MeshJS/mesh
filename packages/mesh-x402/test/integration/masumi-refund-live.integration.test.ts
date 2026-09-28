/**
 * Live Cardano preprod integration test for the masumi refund path: lock -> AuthorizeRefund
 * (seller cooperates, no result ever submitted) -> WithdrawRefund (unconditional on timing
 * once `state == RefundAuthorized`). Chosen over the plain FundsLocked->WithdrawRefund path
 * since that one needs `submit_result_time` to actually pass (~66 minutes out per the
 * requirements fixture), whereas this cooperative path is immediately testable.
 *
 * Requires `TEST_BLOCKFROST_PROJECT_ID` and `TEST_WALLET_MNEMONIC` in `.env`. Not part of
 * `npm test`; run explicitly via `npm run test:integration`.
 */
import { BlockfrostProvider } from "@meshsdk/provider";
import { MeshWallet } from "@meshsdk/wallet";
import { UTxO } from "@meshsdk/common";
import { resolveTxHash } from "@meshsdk/core-cst";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { settlePayment } from "../../src/facilitator/settle";
import { InMemorySettlementStore } from "../../src/facilitator/store";
import { MASUMI_DEFAULT_DEPLOYMENT } from "../../src/masumi/escrow-address";
import { parseMasumiLockDatum, MasumiDatumView } from "../../src/masumi/datum";
import { buildAuthorizeRefundTx } from "../../src/masumi/spend/seller";
import { buildWithdrawRefundTx } from "../../src/masumi/spend/buyer";
import { buildMasumiRequirements } from "../fixtures/masumiFixture";

const PROJECT_ID = process.env.TEST_BLOCKFROST_PROJECT_ID;
const MNEMONIC = process.env.TEST_WALLET_MNEMONIC;
const describeIfConfigured = PROJECT_ID && MNEMONIC ? describe : describe.skip;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args: unknown[]) => console.log("[refund]", ...args); // eslint-disable-line no-console

const submitAndWaitForEscrowUtxo = async (
  signedTxHex: string,
  provider: BlockfrostProvider,
  escrowAddress: string,
  previousUtxoRef?: { txHash: string; outputIndex: number },
): Promise<UTxO | undefined> => {
  const txHash = resolveTxHash(signedTxHex);
  await provider.submitTx(signedTxHex);
  log(`submitted ${txHash} - https://preprod.cardanoscan.io/transaction/${txHash}`);

  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(15_000);
    try {
      const utxos = await provider.fetchAddressUTxOs(escrowAddress);
      const next = utxos.find(
        (u) =>
          u.input.txHash === txHash &&
          (!previousUtxoRef ||
            !(u.input.txHash === previousUtxoRef.txHash && u.input.outputIndex === previousUtxoRef.outputIndex)),
      );
      if (next) return next;
      // For WithdrawRefund, the escrow UTxO is fully consumed (no continuation) - success means
      // the previous UTxO is simply gone, not that a new one with this txHash appears.
      if (previousUtxoRef) {
        const stillThere = utxos.some(
          (u) => u.input.txHash === previousUtxoRef.txHash && u.input.outputIndex === previousUtxoRef.outputIndex,
        );
        if (!stillThere) return undefined;
      }
    } catch {
      // not indexed yet
    }
  }
  throw new Error(`Timed out waiting for tx ${txHash} to settle`);
};

/** See masumi-lifecycle-live.integration.test.ts: the escrow and wallet addresses are indexed
 * independently by Blockfrost, so confirming the escrow output alone doesn't guarantee the
 * wallet's own collateral/fee UTxOs have caught up yet. */
const waitForWalletUtxo = async (wallet: MeshWallet, txHash: string): Promise<void> => {
  const deadline = Date.now() + 2 * 60 * 1000;
  while (Date.now() < deadline) {
    const utxos = await wallet.getUtxos();
    if (utxos.some((u) => u.input.txHash === txHash)) return;
    await sleep(10_000);
  }
  throw new Error(`Timed out waiting for wallet UTxOs to reflect tx ${txHash}`);
};

const requireDatum = (utxo: UTxO): MasumiDatumView => {
  if (!utxo.output.plutusData) throw new Error(`UTxO ${utxo.input.txHash}#${utxo.input.outputIndex} has no inline datum`);
  const view = parseMasumiLockDatum(utxo.output.plutusData);
  if (!view) throw new Error(`Failed to parse Masumi datum on ${utxo.input.txHash}#${utxo.input.outputIndex}`);
  return view;
};

describeIfConfigured("masumi vested_pay - live refund path on preprod", () => {
  jest.setTimeout(10 * 60 * 1000);

  it("lock -> AuthorizeRefund -> WithdrawRefund", async () => {
    const provider = new BlockfrostProvider(PROJECT_ID!);
    const wallet = new MeshWallet({
      networkId: 0,
      fetcher: provider,
      submitter: provider,
      key: { type: "mnemonic", words: MNEMONIC!.split(" ") },
    });
    await wallet.init();

    const requirement = await buildMasumiRequirements(wallet, { amount: "2000000" });
    log(`escrow address: ${requirement.payTo}`);

    let currentSlot = Number((await provider.fetchLatestBlock()).slot);
    const protocol = await provider.fetchProtocolParameters();

    const built = await buildPaymentPayload(
      requirement,
      wallet,
      { url: "https://example.com/refund-test" },
      { fetcher: provider, protocol, currentSlot },
    );
    const signedLock = await signPayment(wallet, built);

    const lockStore = new InMemorySettlementStore();
    let settleResult = await settlePayment(signedLock, requirement, provider, provider, lockStore, protocol, currentSlot);
    const lockDeadline = Date.now() + 5 * 60 * 1000;
    while (!settleResult.success && Date.now() < lockDeadline) {
      await sleep(15_000);
      currentSlot = Number((await provider.fetchLatestBlock()).slot);
      settleResult = await settlePayment(signedLock, requirement, provider, provider, lockStore, protocol, currentSlot);
    }
    expect(settleResult.success).toBe(true);
    log(`locked: https://preprod.cardanoscan.io/transaction/${settleResult.transaction}`);

    const escrowUtxos = await provider.fetchAddressUTxOs(requirement.payTo);
    let escrowUtxo = escrowUtxos.find((u) => u.input.txHash === settleResult.transaction)!;
    expect(escrowUtxo).toBeDefined();
    let datum = requireDatum(escrowUtxo);
    await waitForWalletUtxo(wallet, settleResult.transaction);

    // --- AuthorizeRefund (seller cooperates) ---
    currentSlot = Number((await provider.fetchLatestBlock()).slot);
    const authRefundTx = await buildAuthorizeRefundTx(escrowUtxo, datum, wallet, MASUMI_DEFAULT_DEPLOYMENT, {
      fetcher: provider,
      evaluator: provider,
      currentSlot,
    });
    const signedAuthRefund = await wallet.signTx(authRefundTx);
    const nextUtxo = await submitAndWaitForEscrowUtxo(signedAuthRefund, provider, requirement.payTo, escrowUtxo.input);
    expect(nextUtxo).toBeDefined();
    escrowUtxo = nextUtxo!;
    datum = requireDatum(escrowUtxo);
    log(`AuthorizeRefund ok, state=${datum.state}`);
    expect(datum.resultHash).toBe("");
    await waitForWalletUtxo(wallet, escrowUtxo.input.txHash);

    // --- WithdrawRefund (unconditional once RefundAuthorized) ---
    currentSlot = Number((await provider.fetchLatestBlock()).slot);
    const withdrawRefundTx = await buildWithdrawRefundTx(escrowUtxo, datum, wallet, MASUMI_DEFAULT_DEPLOYMENT, {
      fetcher: provider,
      evaluator: provider,
      currentSlot,
    });
    const signedWithdrawRefund = await wallet.signTx(withdrawRefundTx);
    const finalResult = await submitAndWaitForEscrowUtxo(
      signedWithdrawRefund,
      provider,
      requirement.payTo,
      escrowUtxo.input,
    );
    expect(finalResult).toBeUndefined(); // fully consumed, no continuation
    log("WithdrawRefund confirmed - refund path complete");
  });
});
