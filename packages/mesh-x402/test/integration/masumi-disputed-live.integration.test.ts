/**
 * Live Cardano preprod integration test for `WithdrawDisputed`: lock -> SubmitResult ->
 * SetRefundRequested (-> Disputed) -> wait for `external_dispute_unlock_time` -> a real 1-of-1
 * admin quorum settles the dispute.
 *
 * Uses a CUSTOM deployment (not the canonical one) with `adminVkeys` set to this test wallet's
 * own payment key hash and `requiredAdmins: "1"`, since the canonical preprod deployment's real
 * admin keys aren't ours to sign with - `extra.deployment` already supports this, no new
 * capability needed. This exercises the full CIP-8 admin-signature path
 * (`signAdminIntent`/`computeDisputeWithdrawalDigest`/`verifyAdminSignature`) against a real,
 * independently-deployed instance of the same compiled validator.
 *
 * This test's minimum wait is fixed by the validator's own deadline-gap minimums (5+15+15
 * minutes from `payByTime` to `externalDisputeUnlockTime`) - roughly 35-40 minutes end to end.
 * Requires `TEST_BLOCKFROST_PROJECT_ID` and `TEST_WALLET_MNEMONIC` in `.env`. Not part of
 * `npm test`; run explicitly via `npm run test:integration`.
 */
import { BlockfrostProvider } from "@meshsdk/provider";
import { MeshWallet } from "@meshsdk/wallet";
import { UTxO } from "@meshsdk/common";
import { deserializeBech32Address, resolveTxHash } from "@meshsdk/core-cst";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { settlePayment } from "../../src/facilitator/settle";
import { InMemorySettlementStore } from "../../src/facilitator/store";
import { parseMasumiLockDatum, MasumiDatumView } from "../../src/masumi/datum";
import { buildSubmitResultTx } from "../../src/masumi/spend/seller";
import { buildSetRefundRequestedTx } from "../../src/masumi/spend/buyer";
import { buildWithdrawDisputedTx } from "../../src/masumi/spend/dispute";
import { computeDisputeWithdrawalDigest, signAdminIntent, verifyAdminSignature } from "../../src/masumi/cip8-admin";
import { MasumiDeployment } from "../../src/types/payment-requirements";
import { buildMasumiRequirements } from "../fixtures/masumiFixture";

const PROJECT_ID = process.env.TEST_BLOCKFROST_PROJECT_ID;
const MNEMONIC = process.env.TEST_WALLET_MNEMONIC;
const describeIfConfigured = PROJECT_ID && MNEMONIC ? describe : describe.skip;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args: unknown[]) => console.log("[disputed]", ...args); // eslint-disable-line no-console

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
      if (next) return next;
    } catch {
      // not indexed yet
    }
  }
  throw new Error(`Timed out waiting for escrow UTxO after tx ${txHash}`);
};

const requireDatum = (utxo: UTxO): MasumiDatumView => {
  if (!utxo.output.plutusData) throw new Error(`UTxO ${utxo.input.txHash}#${utxo.input.outputIndex} has no inline datum`);
  const view = parseMasumiLockDatum(utxo.output.plutusData);
  if (!view) throw new Error(`Failed to parse Masumi datum on ${utxo.input.txHash}#${utxo.input.outputIndex}`);
  return view;
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

describeIfConfigured("masumi vested_pay - live WithdrawDisputed on preprod (custom 1-of-1 admin deployment)", () => {
  jest.setTimeout(50 * 60 * 1000);

  it("lock -> SubmitResult -> SetRefundRequested -> WithdrawDisputed (1-of-1 admin quorum)", async () => {
    const provider = new BlockfrostProvider(PROJECT_ID!);
    const wallet = new MeshWallet({
      networkId: 0,
      fetcher: provider,
      submitter: provider,
      key: { type: "mnemonic", words: MNEMONIC!.split(" ") },
    });
    await wallet.init();

    const walletAddress = await wallet.getChangeAddress();
    const walletPubKeyHash = deserializeBech32Address(walletAddress).pubKeyHash;
    if (!walletPubKeyHash) throw new Error("Test wallet address has no payment key hash");

    const customDeployment: MasumiDeployment = {
      requiredAdmins: "1",
      adminVkeys: [walletPubKeyHash],
      cooldownPeriod: "420000",
    };

    // payByTime 5 minutes out, with the payment tx's own TTL (maxTimeoutSeconds) at 2 minutes -
    // masumiVerify requires the tx's TTL to land at/before payByTime, so maxTimeoutSeconds must
    // stay comfortably shorter than payByTimeOffsetMs (leaving margin for confirmation, which
    // can take 30-60s on preprod). The remaining ~35 minutes of wait after this is the
    // validator's own minimum deadline-gap requirement, unrelated to this margin.
    const requirement = await buildMasumiRequirements(wallet, {
      amount: "2000000",
      deployment: customDeployment,
      payByTimeOffsetMs: 5 * 60 * 1000,
      maxTimeoutSeconds: 120,
    });
    log(`custom escrow address: ${requirement.payTo}`);

    let currentSlot = Number((await provider.fetchLatestBlock()).slot);
    const protocol = await provider.fetchProtocolParameters();
    const lockStore = new InMemorySettlementStore();

    const built = await buildPaymentPayload(
      requirement,
      wallet,
      { url: "https://example.com/disputed-test" },
      { fetcher: provider, protocol, currentSlot },
    );
    const signedLock = await signPayment(wallet, built);

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
    let datum = requireDatum(escrowUtxo);
    await waitForWalletUtxo(wallet, settleResult.transaction);

    // --- SubmitResult ---
    currentSlot = Number((await provider.fetchLatestBlock()).slot);
    const submitTx = await buildSubmitResultTx(
      escrowUtxo,
      datum,
      Buffer.from("disputed-test-result").toString("hex"),
      wallet,
      customDeployment,
      { fetcher: provider, evaluator: provider, currentSlot },
    );
    const signedSubmit = await wallet.signTx(submitTx);
    escrowUtxo = await submitAndWaitForEscrowUtxo(signedSubmit, provider, requirement.payTo, escrowUtxo.input);
    datum = requireDatum(escrowUtxo);
    log(`SubmitResult ok, state=${datum.state}`);
    await waitForWalletUtxo(wallet, escrowUtxo.input.txHash);

    // --- SetRefundRequested -> Disputed ---
    currentSlot = Number((await provider.fetchLatestBlock()).slot);
    const refundReqTx = await buildSetRefundRequestedTx(escrowUtxo, datum, wallet, customDeployment, {
      fetcher: provider,
      evaluator: provider,
      currentSlot,
    });
    const signedRefundReq = await wallet.signTx(refundReqTx);
    escrowUtxo = await submitAndWaitForEscrowUtxo(signedRefundReq, provider, requirement.payTo, escrowUtxo.input);
    datum = requireDatum(escrowUtxo);
    log(`SetRefundRequested ok, state=${datum.state} (expect Disputed=3)`);
    expect(datum.state).toBe(3);

    // --- wait for external_dispute_unlock_time ---
    const waitMs = Number(datum.externalDisputeUnlockTime) - Date.now() + 20_000;
    if (waitMs > 0) {
      log(`waiting ${Math.ceil(waitMs / 1000)}s for external_dispute_unlock_time...`);
      await sleep(waitMs);
    }

    // --- collect a real 1-of-1 admin signature and independently verify it before use ---
    const buyerValue = [{ policyId: "", assets: [{ assetName: "", quantity: datum.collateralReturnLovelace }] }];
    const sellerValue = [
      { policyId: "", assets: [{ assetName: "", quantity: BigInt(requirement.amount) }] },
    ];
    const digest = await computeDisputeWithdrawalDigest(
      { txHash: escrowUtxo.input.txHash, outputIndex: escrowUtxo.input.outputIndex },
      buyerValue,
      sellerValue,
    );
    const adminSignature = await signAdminIntent(digest, wallet);
    const verified = await verifyAdminSignature(walletPubKeyHash, digest, adminSignature);
    expect(verified).toBe(true);
    log("admin signature independently verified off-chain");

    // --- WithdrawDisputed ---
    // Building can transiently fail with "Cannot convert undefined to a BigInt" from
    // cardano-sdk's input selector right after a long wait, apparently a momentary
    // Blockfrost/evaluate hiccup rather than a deterministic bug (a rebuild against the
    // exact same UTxOs moments later succeeds) - retry a few times before failing the test.
    currentSlot = Number((await provider.fetchLatestBlock()).slot);
    let disputedTx: string | undefined;
    let lastBuildError: unknown;
    for (let attempt = 0; attempt < 3 && !disputedTx; attempt++) {
      if (attempt > 0) {
        log(`buildWithdrawDisputedTx attempt ${attempt + 1} after: ${(lastBuildError as Error)?.message}`);
        await sleep(15_000);
        currentSlot = Number((await provider.fetchLatestBlock()).slot);
      }
      try {
        disputedTx = await buildWithdrawDisputedTx(
          escrowUtxo,
          datum,
          buyerValue,
          sellerValue,
          [adminSignature],
          wallet,
          customDeployment,
          { fetcher: provider, evaluator: provider, currentSlot },
        );
      } catch (e) {
        lastBuildError = e;
      }
    }
    if (!disputedTx) throw lastBuildError;
    const signedDisputed = await wallet.signTx(disputedTx);
    const disputedTxHash = resolveTxHash(signedDisputed);
    await provider.submitTx(signedDisputed);
    log(`WithdrawDisputed submitted: https://preprod.cardanoscan.io/transaction/${disputedTxHash}`);

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
    log("WithdrawDisputed confirmed - dispute settlement complete");
  });
});
