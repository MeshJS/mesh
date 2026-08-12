import { Serialization } from "@cardano-sdk/core";

import type { TransactionBodyPrototype } from "@meshsdk/common";

import {
  AssetId,
  AssetName,
  CborSet,
  Ed25519KeyHashHex,
  Hash32ByteBase16,
  PolicyId,
  RewardAccount,
  Slot,
  TokenMap,
  TransactionBody,
  TransactionInput,
} from "../types";
import { certificatePrototypeToCardano } from "./certificates";
import { votingProceduresPrototypeToCardano, votingProposalPrototypeToCardano } from "./governance";
import { transactionInputPrototypeToCardano, transactionOutputPrototypeToCardano } from "./inputs-outputs";
import { networkIdToNumber } from "./primitives";

/**
 * Converts the ledger-level fields of a `TransactionBodyPrototype` (inputs/outputs/certs/
 * withdrawals/mint/votes/proposals — everything except the witness set and auxiliary data,
 * handled by `witness-set.ts`/`auxiliary-data.ts`) into a CST `TransactionBody`.
 *
 * Does not (re)compute `script_data_hash` or `auxiliary_data_hash` the way the existing
 * `MeshTxBuilder` serializer does — a `TransactionPrototype` is the already-fully-decided final
 * transaction, so if those hashes are present they're set verbatim; there is nothing left to
 * derive them from at this layer.
 *
 * Not converted: `update` (genesis-key-signed protocol parameter update proposals) — a pre-Conway
 * mechanism effectively superseded by governance actions and not expected in real usage; left
 * unimplemented rather than guessed at.
 */
export const transactionBodyPrototypeToCardano = (body: TransactionBodyPrototype): TransactionBody => {
  const networkId = networkIdToNumber(body.network_id);

  const inputs = CborSet.fromCore(
    body.inputs.map((i) => transactionInputPrototypeToCardano(i).toCore()),
    TransactionInput.fromCore,
  );
  const outputs = body.outputs.map(transactionOutputPrototypeToCardano);

  const result = new TransactionBody(inputs, outputs, BigInt(body.fee));

  if (body.certs?.length) {
    result.setCerts(
      CborSet.fromCore(
        body.certs.map((c) => certificatePrototypeToCardano(c, networkId).toCore()),
        Serialization.Certificate.fromCore,
      ),
    );
  }

  if (body.collateral?.length) {
    result.setCollateral(
      CborSet.fromCore(
        body.collateral.map((i) => transactionInputPrototypeToCardano(i).toCore()),
        TransactionInput.fromCore,
      ),
    );
  }

  if (body.collateral_return) {
    result.setCollateralReturn(transactionOutputPrototypeToCardano(body.collateral_return));
  }

  if (body.current_treasury_value != null) {
    result.setCurrentTreasuryValue(BigInt(body.current_treasury_value));
  }

  if (body.donation != null) {
    result.setDonation(BigInt(body.donation));
  }

  if (body.mint) {
    const mint: TokenMap = new Map();
    for (const [policyId, tokens] of Object.entries(body.mint)) {
      for (const [assetNameHex, quantity] of Object.entries(tokens)) {
        mint.set(AssetId.fromParts(PolicyId(policyId), AssetName(assetNameHex)), BigInt(quantity));
      }
    }
    result.setMint(mint);
  }

  if (body.network_id) {
    result.setNetworkId(networkId);
  }

  if (body.reference_inputs?.length) {
    result.setReferenceInputs(
      CborSet.fromCore(
        body.reference_inputs.map((i) => transactionInputPrototypeToCardano(i).toCore()),
        TransactionInput.fromCore,
      ),
    );
  }

  if (body.required_signers?.length) {
    result.setRequiredSigners(
      CborSet.fromCore(
        body.required_signers.map((s) => Ed25519KeyHashHex(s)),
        Serialization.Hash.fromCore,
      ),
    );
  }

  if (body.script_data_hash) {
    result.setScriptDataHash(Hash32ByteBase16(body.script_data_hash));
  }

  if (body.total_collateral != null) {
    result.setTotalCollateral(BigInt(body.total_collateral));
  }

  if (body.ttl != null) {
    result.setTtl(Slot(Number(body.ttl)));
  }

  if (body.validity_start_interval != null) {
    result.setValidityStartInterval(Slot(Number(body.validity_start_interval)));
  }

  if (body.voting_procedures?.length) {
    result.setVotingProcedures(votingProceduresPrototypeToCardano(body.voting_procedures));
  }

  if (body.voting_proposals?.length) {
    result.setProposalProcedures(
      CborSet.fromCore(
        body.voting_proposals.map((p) => votingProposalPrototypeToCardano(p).toCore()),
        Serialization.ProposalProcedure.fromCore,
      ),
    );
  }

  if (body.withdrawals) {
    const withdrawals = new Map<RewardAccount, bigint>();
    for (const [address, amount] of Object.entries(body.withdrawals)) {
      withdrawals.set(RewardAccount(address), BigInt(amount));
    }
    result.setWithdrawals(withdrawals);
  }

  if (body.auxiliary_data_hash) {
    result.setAuxiliaryDataHash(Hash32ByteBase16(body.auxiliary_data_hash));
  }

  return result;
};
