import { Cardano, Serialization } from "@cardano-sdk/core";

import { IFetcher, UTxO } from "@meshsdk/common";

import { CredentialType } from "../address/cardano-address";

/**
 * Extract required signers from transaction inputs and collateral
 */
async function getRequiredSignersFromInputs(
  txBody: Serialization.TransactionBody,
  fetcher: IFetcher,
): Promise<Set<string>> {
  const requiredSigners: Set<string> = new Set();
  let inputs = txBody.inputs().values();

  // Include collateral inputs
  if (txBody.collateral()) {
    inputs = [...inputs, ...txBody.collateral()!.values()];
  }

  // Gather all input transaction ids
  const transactionIds: Set<string> = new Set();
  for (const input of inputs) {
    transactionIds.add(input.transactionId());
  }

  // Fetch all input utxos
  let utxos: UTxO[] = [];
  for (const txId of transactionIds) {
    const fetchedUtxos: UTxO[] = await fetcher.fetchUTxOs(txId);
    if (fetchedUtxos) {
      utxos.push(...fetchedUtxos);
    } else {
      throw new Error(
        `[TransactionSigners] Transaction not found for transaction id: ${txId}`,
      );
    }
  }

  // Filter utxos to only those that are inputs to this transaction
  utxos = utxos.filter((utxo) => {
    return inputs.some((input) => {
      return (
        input.transactionId() === utxo.input.txHash &&
        input.index() === BigInt(utxo.input.outputIndex)
      );
    });
  });

  // Gather required signers from input utxos
  for (const utxo of utxos) {
    const address = Cardano.Address.fromBech32(utxo.output.address);
    const addressProps = address.getProps();
    if (addressProps.paymentPart) {
      if (addressProps.paymentPart.type === CredentialType.KeyHash) {
        requiredSigners.add(addressProps.paymentPart.hash);
      }
    }
  }

  return requiredSigners;
}

/**
 * Extract required signers from transaction certificates
 */
function getRequiredSignersFromCertificates(
  txBody: Serialization.TransactionBody,
): Set<string> {
  const requiredSigners: Set<string> = new Set();
  const certs = txBody.certs();

  if (!certs) {
    return requiredSigners;
  }

  const certsIter = certs.values();
  for (const cert of certsIter) {
    if (cert.asStakeRegistration()) {
      const stakeReg = cert.asStakeRegistration();
      if (stakeReg!.stakeCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(stakeReg!.stakeCredential().hash);
      }
    } else if (cert.asStakeDeregistration()) {
      const stakeDereg = cert.asStakeDeregistration();
      if (stakeDereg!.stakeCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(stakeDereg!.stakeCredential().hash);
      }
    } else if (cert.asStakeDelegation()) {
      const stakeDeleg = cert.asStakeDelegation();
      if (stakeDeleg!.stakeCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(stakeDeleg!.stakeCredential().hash);
      }
    } else if (cert.asPoolRegistration()) {
      const poolReg = cert.asPoolRegistration();
      const poolOwners = poolReg!.poolParameters().poolOwners().values();
      for (const owner of poolOwners) {
        requiredSigners.add(owner.value());
      }
      const poolOperator = poolReg!.poolParameters().operator();
      requiredSigners.add(poolOperator);
    } else if (cert.asPoolRetirement()) {
      const poolRetire = cert.asPoolRetirement();
      requiredSigners.add(poolRetire!.poolKeyHash());
    } else if (cert.asGenesisKeyDelegation()) {
      // Deprecated certificate type
    } else if (cert.asMoveInstantaneousRewardsCert()) {
      // Deprecated certificate type
    } else if (cert.asRegistrationCert()) {
      const reg = cert.asRegistrationCert();
      if (reg!.stakeCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(reg!.stakeCredential().hash);
      }
    } else if (cert.asUnregistrationCert()) {
      const unreg = cert.asUnregistrationCert();
      if (unreg!.stakeCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(unreg!.stakeCredential().hash);
      }
    } else if (cert.asVoteDelegationCert()) {
      const voteDel = cert.asVoteDelegationCert();
      if (voteDel!.stakeCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(voteDel!.stakeCredential().hash);
      }
    } else if (cert.asStakeVoteDelegationCert()) {
      const stakeVoteDel = cert.asStakeVoteDelegationCert();
      if (stakeVoteDel!.stakeCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(stakeVoteDel!.stakeCredential().hash);
      }
    } else if (cert.asStakeRegistrationDelegationCert()) {
      const stakeRegDel = cert.asStakeRegistrationDelegationCert();
      if (stakeRegDel!.stakeCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(stakeRegDel!.stakeCredential().hash);
      }
    } else if (cert.asVoteRegistrationDelegationCert()) {
      const voteRegDel = cert.asVoteRegistrationDelegationCert();
      if (voteRegDel!.stakeCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(voteRegDel!.stakeCredential().hash);
      }
    } else if (cert.asStakeVoteRegistrationDelegationCert()) {
      const stakeVoteRegDel = cert.asStakeVoteRegistrationDelegationCert();
      if (stakeVoteRegDel!.stakeCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(stakeVoteRegDel!.stakeCredential().hash);
      }
    } else if (cert.asAuthCommitteeHotCert()) {
      const authCommHot = cert.asAuthCommitteeHotCert();
      if (authCommHot!.hotCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(authCommHot!.hotCredential().hash);
      }
      if (authCommHot!.coldCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(authCommHot!.coldCredential().hash);
      }
    } else if (cert.asResignCommitteeColdCert()) {
      const resignCommCold = cert.asResignCommitteeColdCert();
      if (resignCommCold!.coldCredential().type === CredentialType.KeyHash) {
        requiredSigners.add(resignCommCold!.coldCredential().hash);
      }
    } else if (cert.asRegisterDelegateRepresentativeCert()) {
      const drepReg = cert.asRegisterDelegateRepresentativeCert();
      if (drepReg!.credential().type === CredentialType.KeyHash) {
        requiredSigners.add(drepReg!.credential().hash);
      }
    } else if (cert.asUnregisterDelegateRepresentativeCert()) {
      const drepUnreg = cert.asUnregisterDelegateRepresentativeCert();
      if (drepUnreg!.credential().type === CredentialType.KeyHash) {
        requiredSigners.add(drepUnreg!.credential().hash);
      }
    } else if (cert.asUpdateDelegateRepresentativeCert()) {
      const drepUpdate = cert.asUpdateDelegateRepresentativeCert();
      if (drepUpdate!.credential().type === CredentialType.KeyHash) {
        requiredSigners.add(drepUpdate!.credential().hash);
      }
    } else {
      throw new Error(
        "[TransactionSigners] Error parsing required signers: Unknown certificate type",
      );
    }
  }

  return requiredSigners;
}

/**
 * Extract required signers from withdrawals
 */
function getRequiredSignersFromWithdrawals(
  txBody: Serialization.TransactionBody,
): Set<string> {
  const requiredSigners: Set<string> = new Set();
  const withdrawals = txBody.withdrawals();

  if (withdrawals) {
    for (const rewardAccount of withdrawals.keys()) {
      requiredSigners.add(Cardano.RewardAccount.toHash(rewardAccount));
    }
  }

  return requiredSigners;
}

/**
 * Extract required signers from explicit required signers field
 */
function getRequiredSignersFromRequiredSignersField(
  txBody: Serialization.TransactionBody,
): Set<string> {
  const requiredSigners: Set<string> = new Set();
  const reqSigners = txBody.requiredSigners();

  if (reqSigners) {
    const reqSignersIter = reqSigners.values();
    for (const reqSigner of reqSignersIter) {
      requiredSigners.add(reqSigner.value());
    }
  }

  return requiredSigners;
}

/**
 * Extract required signers from voting procedures
 */
function getRequiredSignersFromVotingProcedures(
  txBody: Serialization.TransactionBody,
): Set<string> {
  const requiredSigners: Set<string> = new Set();
  const votingProcedures = txBody.votingProcedures();

  if (votingProcedures) {
    const voters = votingProcedures.getVoters().values();
    for (const voter of voters) {
      if (voter.toDrepCred()) {
        const drepCred = voter.toDrepCred();
        if (drepCred!.type === CredentialType.KeyHash) {
          requiredSigners.add(drepCred!.hash);
        }
      } else if (voter.toConstitutionalCommitteeHotCred()) {
        const ccHotCred = voter.toConstitutionalCommitteeHotCred();
        if (ccHotCred!.type === CredentialType.KeyHash) {
          requiredSigners.add(ccHotCred!.hash);
        }
      } else if (voter.toStakingPoolKeyHash()) {
        const poolKeyHash = voter.toStakingPoolKeyHash();
        requiredSigners.add(poolKeyHash!);
      }
    }
  }

  return requiredSigners;
}

/**
 * Get all required signers for a transaction
 * @param transaction The transaction to analyze
 * @param fetcher Fetcher to resolve input UTxOs
 * @returns Set of required public key hashes
 */
export async function getTransactionRequiredSigners(
  transaction: Serialization.Transaction,
  fetcher: IFetcher,
): Promise<Set<string>> {
  const txBody = transaction.body();
  const allRequiredSigners: Set<string> = new Set();

  // Gather from all sources
  const inputSigners = await getRequiredSignersFromInputs(txBody, fetcher);
  const certSigners = getRequiredSignersFromCertificates(txBody);
  const withdrawalSigners = getRequiredSignersFromWithdrawals(txBody);
  const explicitSigners = getRequiredSignersFromRequiredSignersField(txBody);
  const votingSigners = getRequiredSignersFromVotingProcedures(txBody);

  // Merge all sets
  for (const signer of inputSigners) allRequiredSigners.add(signer);
  for (const signer of certSigners) allRequiredSigners.add(signer);
  for (const signer of withdrawalSigners) allRequiredSigners.add(signer);
  for (const signer of explicitSigners) allRequiredSigners.add(signer);
  for (const signer of votingSigners) allRequiredSigners.add(signer);

  return allRequiredSigners;
}
