/**
 * Live Cardano preprod integration test for the masumi `vested_pay` FULL contract lifecycle
 * (spend side): lock -> SubmitResult -> SetRefundRequested -> AuthorizeWithdrawal -> Withdraw
 * (the buyer-cooperative fast path, chosen over the plain ResultSubmitted->Withdraw path since
 * that one needs `unlock_time` to actually pass - ~22 minutes out per the requirements
 * fixture - whereas this path only needs the canonical deployment's ~7-minute
 * `buyer_cooldown_time` cooldown).
 *
 * Requires `TEST_BLOCKFROST_PROJECT_ID` and `TEST_WALLET_MNEMONIC` in `.env`. Not part of
 * `npm test`; run explicitly via `npm run test:integration`. Takes several minutes (real
 * on-chain confirmations plus one real ~7 minute cooldown wait).
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
import { buildSubmitResultTx, buildWithdrawTx } from "../../src/masumi/spend/seller";
import { buildAuthorizeWithdrawalTx, buildSetRefundRequestedTx } from "../../src/masumi/spend/buyer";
import { buildMasumiRequirements } from "../fixtures/masumiFixture";

const PROJECT_ID = process.env.TEST_BLOCKFROST_PROJECT_ID;
const MNEMONIC = process.env.TEST_WALLET_MNEMONIC;
const describeIfConfigured = PROJECT_ID && MNEMONIC ? describe : describe.skip;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args: unknown[]) => console.log("[lifecycle]", ...args); // eslint-disable-line no-console

/** Broadcasts a signed tx and polls until it's actually visible as spent/created on-chain. */
const submitAndWaitForEscrowUtxo = async (
  signedTxHex: string,
  provider: BlockfrostProvider,
  escrowAddress: string,
  previousUtxoRef?: { txHash: string; outputIndex: number },
): Promise<UTxO> => {
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
      if (next) {
        log(`escrow UTxO confirmed: ${next.input.txHash}#${next.input.outputIndex}`);
        return next;
      }
    } catch {
      // not indexed yet
    }
  }
  throw new Error(`Timed out waiting for escrow UTxO after tx ${txHash}`);
};

/**
 * Waits until `wallet.getUtxos()` reflects a specific just-confirmed tx as spendable change.
 * The escrow address and the wallet's own address are indexed independently by Blockfrost, so
 * confirming the escrow output alone doesn't guarantee the wallet's own collateral/fee UTxOs
 * have caught up yet - building the next spend too eagerly can select an already-spent input.
 */
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

describeIfConfigured("masumi vested_pay - live full lifecycle on preprod", () => {
  jest.setTimeout(30 * 60 * 1000);

  it("lock -> SubmitResult -> SetRefundRequested -> AuthorizeWithdrawal -> Withdraw", async () => {
    const provider = new BlockfrostProvider(PROJECT_ID!);
    const wallet = new MeshWallet({
      networkId: 0,
      fetcher: provider,
      submitter: provider,
      key: { type: "mnemonic", words: MNEMONIC!.split(" ") },
    });
    await wallet.init();

    const buyerUtxos = await wallet.getUtxos();
    expect(buyerUtxos.length).toBeGreaterThan(0);

    // --- Lock ---
    const requirement = await buildMasumiRequirements(wallet, { amount: "2000000" });
    log(`escrow address: ${requirement.payTo}`);

    let currentSlot = Number((await provider.fetchLatestBlock()).slot);
    let protocol = await provider.fetchProtocolParameters();
    const lockChain = { fetcher: provider, protocol, currentSlot };

    const built = await buildPaymentPayload(requirement, wallet, { url: "https://example.com/lifecycle" }, lockChain);
    const signedLock = await signPayment(wallet, built);

    // One store instance reused across the whole poll loop - settlePayment's idempotency
    // (never rebroadcast an already-submitted tx) depends on it persisting between calls.
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

    let escrowUtxos = await provider.fetchAddressUTxOs(requirement.payTo);
    let escrowUtxo = escrowUtxos.find((u) => u.input.txHash === settleResult.transaction)!;
    expect(escrowUtxo).toBeDefined();
    let datum = requireDatum(escrowUtxo);
    await waitForWalletUtxo(wallet, settleResult.transaction);

    // --- SubmitResult ---
    currentSlot = Number((await provider.fetchLatestBlock()).slot);
    const submitTx = await buildSubmitResultTx(
      escrowUtxo,
      datum,
      Buffer.from("integration-test-result").toString("hex"),
      wallet,
      MASUMI_DEFAULT_DEPLOYMENT,
      { fetcher: provider, evaluator: provider, currentSlot },
    );
    const signedSubmit = await wallet.signTx(submitTx);
    escrowUtxo = await submitAndWaitForEscrowUtxo(signedSubmit, provider, requirement.payTo, escrowUtxo.input);
    datum = requireDatum(escrowUtxo);
    expect(datum.resultHash).not.toBe("");
    log(`SubmitResult ok, state=${datum.state}`);
    await waitForWalletUtxo(wallet, escrowUtxo.input.txHash);

    // --- SetRefundRequested (buyer) -> Disputed (result already exists) ---
    currentSlot = Number((await provider.fetchLatestBlock()).slot);
    const refundReqTx = await buildSetRefundRequestedTx(escrowUtxo, datum, wallet, MASUMI_DEFAULT_DEPLOYMENT, {
      fetcher: provider,
      evaluator: provider,
      currentSlot,
    });
    const signedRefundReq = await wallet.signTx(refundReqTx);
    escrowUtxo = await submitAndWaitForEscrowUtxo(signedRefundReq, provider, requirement.payTo, escrowUtxo.input);
    datum = requireDatum(escrowUtxo);
    log(`SetRefundRequested ok, state=${datum.state}, buyerCooldownTime=${datum.buyerCooldownTime}`);
    await waitForWalletUtxo(wallet, escrowUtxo.input.txHash);

    // --- wait for buyer_cooldown_time (canonical deployment: ~7 minutes) ---
    const cooldownWaitMs = Number(datum.buyerCooldownTime) - Date.now() + 15_000; // +15s safety margin
    if (cooldownWaitMs > 0) {
      log(`waiting ${Math.ceil(cooldownWaitMs / 1000)}s for buyer_cooldown_time to pass...`);
      await sleep(cooldownWaitMs);
    }

    // --- AuthorizeWithdrawal (buyer) -> WithdrawAuthorized ---
    currentSlot = Number((await provider.fetchLatestBlock()).slot);
    const authWithdrawTx = await buildAuthorizeWithdrawalTx(escrowUtxo, datum, wallet, MASUMI_DEFAULT_DEPLOYMENT, {
      fetcher: provider,
      evaluator: provider,
      currentSlot,
    });
    const signedAuthWithdraw = await wallet.signTx(authWithdrawTx);
    escrowUtxo = await submitAndWaitForEscrowUtxo(signedAuthWithdraw, provider, requirement.payTo, escrowUtxo.input);
    datum = requireDatum(escrowUtxo);
    log(`AuthorizeWithdrawal ok, state=${datum.state}`);
    await waitForWalletUtxo(wallet, escrowUtxo.input.txHash);

    // --- Withdraw (seller) - immediate, no time bound from WithdrawAuthorized ---
    currentSlot = Number((await provider.fetchLatestBlock()).slot);
    const withdrawTx = await buildWithdrawTx(escrowUtxo, datum, wallet, MASUMI_DEFAULT_DEPLOYMENT, {
      fetcher: provider,
      evaluator: provider,
      currentSlot,
    });
    const signedWithdraw = await wallet.signTx(withdrawTx);
    const withdrawTxHash = resolveTxHash(signedWithdraw);
    await provider.submitTx(signedWithdraw);
    log(`Withdraw submitted: https://preprod.cardanoscan.io/transaction/${withdrawTxHash}`);

    // Confirm the escrow address no longer holds this UTxO (it was fully consumed, not continued).
    const deadline = Date.now() + 5 * 60 * 1000;
    let stillPresent = true;
    while (Date.now() < deadline) {
      await sleep(15_000);
      const remaining = await provider.fetchAddressUTxOs(requirement.payTo);
      stillPresent = remaining.some(
        (u) => u.input.txHash === escrowUtxo.input.txHash && u.input.outputIndex === escrowUtxo.input.outputIndex,
      );
      if (!stillPresent) break;
    }
    expect(stillPresent).toBe(false);
    log("Withdraw confirmed - full lifecycle complete");
  });
});
