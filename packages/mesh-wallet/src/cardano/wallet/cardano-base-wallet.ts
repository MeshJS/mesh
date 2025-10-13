import { Cardano, Serialization } from "@cardano-sdk/core";

import { IFetcher, ISubmitter, UTxO } from "@meshsdk/common";

import { BaseBip32 } from "../../bip32/base-bip32";
import { ICardanoWallet } from "../../interfaces/cardano-wallet";
import { BaseSigner } from "../../signer/base-signer";
import { CardanoAddress, CredentialType } from "../address/cardano-address";
import { CardanoSigner } from "../signer/cardano-signer";

export type CardanoWalletSource =
  | {
      type: "ed25519PrivateKeyHex";
      keyHex: string;
    }
  | {
      type: "ed25519ExtendedPrivateKeyHex";
      keyHex: string;
    }
  | {
      type: "scriptHash";
      scriptHashHex: string;
    };

export type CardanoWalletSources = {
  paymentKey: CardanoWalletSource;
  stakeKey?: CardanoWalletSource;
  drepKey?: CardanoWalletSource;
};

export class BaseCardanoWallet implements ICardanoWallet {
  public networkId: number;
  private signer: CardanoSigner;
  private address: CardanoAddress;
  private fetcher?: IFetcher;
  private submitter?: ISubmitter;

  constructor(
    networkId: number,
    signer: CardanoSigner,
    address: CardanoAddress,
    fetcher?: IFetcher,
    submitter?: ISubmitter,
  ) {
    this.networkId = networkId;
    this.signer = signer;
    this.address = address;
    this.fetcher = fetcher;
    this.submitter = submitter;
  }

  private static async createWallet(
    networkId: number,
    signer: CardanoSigner,
    fetcher?: IFetcher,
    submitter?: ISubmitter,
  ): Promise<BaseCardanoWallet> {
    const address = await addressFromSigner(signer, networkId);
    return new BaseCardanoWallet(
      networkId,
      signer,
      address,
      fetcher,
      submitter,
    );
  }

  static async fromBip32Root(
    networkId: number,
    bech32: string,
    fetcher?: IFetcher,
    submitter?: ISubmitter,
  ): Promise<BaseCardanoWallet> {
    const bip32 = BaseBip32.fromBech32(bech32);
    const signer = await CardanoSigner.fromBip32(bip32);
    return this.createWallet(networkId, signer, fetcher, submitter);
  }

  static async fromBip32RootHex(
    networkId: number,
    hex: string,
    fetcher?: IFetcher,
    submitter?: ISubmitter,
  ): Promise<BaseCardanoWallet> {
    const bip32 = BaseBip32.fromKeyHex(hex);
    const signer = await CardanoSigner.fromBip32(bip32);
    return this.createWallet(networkId, signer, fetcher, submitter);
  }

  static async fromWalletSources(
    networkId: number,
    walletSources: CardanoWalletSources,
    fetcher?: IFetcher,
    submitter?: ISubmitter,
  ): Promise<BaseCardanoWallet> {
    const { paymentKey, stakeKey, drepKey } = walletSources;
    let paymentSigner: BaseSigner;

    if (paymentKey.type === "ed25519PrivateKeyHex") {
      paymentSigner = BaseSigner.fromNormalKeyHex(paymentKey.keyHex);
    } else if (paymentKey.type === "ed25519ExtendedPrivateKeyHex") {
      paymentSigner = BaseSigner.fromExtendedKeyHex(paymentKey.keyHex);
    } else {
      throw new Error("Payment key must be a private key, and not a script");
    }

    let stakeSigner: BaseSigner | undefined = undefined;
    if (stakeKey && stakeKey.type === "ed25519PrivateKeyHex") {
      stakeSigner = BaseSigner.fromNormalKeyHex(stakeKey.keyHex);
    } else if (stakeKey && stakeKey.type === "ed25519ExtendedPrivateKeyHex") {
      stakeSigner = BaseSigner.fromExtendedKeyHex(stakeKey.keyHex);
    }

    let drepSigner: BaseSigner | undefined = undefined;
    if (drepKey && drepKey.type === "ed25519PrivateKeyHex") {
      drepSigner = BaseSigner.fromNormalKeyHex(drepKey.keyHex);
    } else if (drepKey && drepKey.type === "ed25519ExtendedPrivateKeyHex") {
      drepSigner = BaseSigner.fromExtendedKeyHex(drepKey.keyHex);
    }

    const signer = new CardanoSigner(paymentSigner, stakeSigner, drepSigner);
    return await this.createWallet(networkId, signer, fetcher, submitter);
  }

  static async fromMnemonic(
    networkId: number,
    mnemonic: string[],
    password?: string,
    fetcher?: IFetcher,
    submitter?: ISubmitter,
  ): Promise<BaseCardanoWallet> {
    const bip32 = await BaseBip32.fromMnemonic(mnemonic, password);
    const signer = await CardanoSigner.fromBip32(bip32);
    return this.createWallet(networkId, signer, fetcher, submitter);
  }

  async submitTx(tx: string): Promise<string> {
    if (!this.submitter) {
      throw new Error("No submitter provided");
    }
    return await this.submitter.submitTx(tx);
  }
  getNetworkId(): number {
    return this.networkId;
  }
  getUtxos(): Promise<string[]> {
    throw new Error("Method not implemented.");
  }
  getCollateral(): Promise<string[]> {
    throw new Error("Method not implemented.");
  }
  getBalance(): Promise<string> {
    throw new Error("Method not implemented.");
  }
  getUsedAddresses(): Promise<string[]> {
    return this.address.stakePubkey
      ? Promise.resolve([this.address.getBaseAddressHex()!])
      : Promise.resolve([this.address.getEnterpriseAddressHex()]);
  }
  getUnusedAddresses(): Promise<string[]> {
    return this.address.stakePubkey
      ? Promise.resolve([this.address.getBaseAddressHex()!])
      : Promise.resolve([this.address.getEnterpriseAddressHex()]);
  }
  getChangeAddress(): Promise<string> {
    return this.address.stakePubkey
      ? Promise.resolve(this.address.getBaseAddressHex()!)
      : Promise.resolve(this.address.getEnterpriseAddressHex());
  }
  getRewardAddress(): Promise<string> {
    if (!this.address.stakePubkey) {
      throw new Error("No stake address for this wallet");
    }
    return Promise.resolve(this.address.getRewardAddressHex()!);
  }
  async signTx(tx: string): Promise<string> {
    if (!this.fetcher) {
      throw new Error(
        "No fetcher provided, wallet sign tx does not behave correctly without a fetcher to resolve inputs. If you need to blindly sign a tx, use the CardanoSigner class directly.",
      );
    }
    const transaction = Serialization.Transaction.fromCbor(tx);
    let requiredSigners = await this.getRequiredSignatures(
      transaction,
      this.fetcher,
    );

    let witnessSet = new Serialization.TransactionWitnessSet();
    let signatures = [];

    if (
      requiredSigners.has(await this.signer.paymentSigner.getPublicKeyHash())
    ) {
      signatures.push(await this.signer.paymentSignTx(tx));
    }

    if (
      this.signer.stakeSigner &&
      requiredSigners.has(await this.signer.stakeSigner.getPublicKeyHash())
    ) {
      signatures.push(await this.signer.stakeSignTx(tx));
    }

    if (
      this.signer.drepSigner &&
      requiredSigners.has(await this.signer.drepSigner.getPublicKeyHash())
    ) {
      signatures.push(await this.signer.drepSignTx(tx));
    }

    witnessSet.setVkeys(
      Serialization.CborSet.fromCore(
        signatures.map((sig) => {
          return Serialization.VkeyWitness.fromCbor(sig).toCore();
        }),
        Serialization.VkeyWitness.fromCore,
      ),
    );
    return witnessSet.toCbor();
  }

  signData(data: string): Promise<string> {
    throw new Error("Method not implemented.");
  }

  private async getRequiredSignatures(
    cardanoTx: Serialization.Transaction,
    fetcher: IFetcher,
  ): Promise<Set<string>> {
    const txBody = cardanoTx.body();
    let requiredSigners: Set<string> = new Set();
    let inputs = txBody.inputs().values();
    if (txBody.collateral()) {
      inputs = [...inputs, ...txBody.collateral()!.values()];
    }

    // Gather all input transaction ids
    let transactionIds: Set<string> = new Set();
    for (const input of inputs) {
      transactionIds.add(input.transactionId());
    }

    // Fetch all input utxos
    let utxos: UTxO[] = [];
    for (const txId of transactionIds) {
      const fetchedUtxos: UTxO[] = await fetcher.fetchUTxOs(txId);
      if (fetchedUtxos) {
        for (const utxo of fetchedUtxos) {
          utxos.push(utxo);
        }
      } else {
        throw new Error(`Transaction not found for transaction id: ${txId}`);
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

    // Gather required signers from certificates
    const certs = txBody.certs();
    if (certs) {
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
          const genKeyDel = cert.asGenesisKeyDelegation();
          requiredSigners.add(genKeyDel!.genesisDelegateHash());
        } else if (cert.asMoveInstantaneousRewardsCert()) {
          // MIR certificates typically don't require additional signatures
          // as they're usually signed by genesis keys, but we'll handle it for completeness
          // MIR certificates don't typically add to required signers for regular wallets
          // This is usually handled by treasury/reserves and signed by genesis keys
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
          if (
            stakeVoteRegDel!.stakeCredential().type === CredentialType.KeyHash
          ) {
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
          if (
            resignCommCold!.coldCredential().type === CredentialType.KeyHash
          ) {
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
            "Error parsing required signers: Unknown certificate type",
          );
        }
      }
    }

    // Gather required signers from withdrawals
    const withdrawals = txBody.withdrawals();
    if (withdrawals) {
      for (const rewardAccount of withdrawals.keys()) {
        requiredSigners.add(Cardano.RewardAccount.toHash(rewardAccount));
      }
    }

    // Gather required signers from explicit required signers in the transaction body
    const reqSigners = txBody.requiredSigners();
    if (reqSigners) {
      const reqSignersIter = reqSigners.values();
      for (const reqSigner of reqSignersIter) {
        requiredSigners.add(reqSigner.value());
      }
    }

    // Gather required signers from voting procedures
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

    // Gather required signers from proposal procedures
    const proposalProcedures = txBody.proposalProcedures();
    if (proposalProcedures) {
      const proposals = proposalProcedures.values();
      for (const proposal of proposals) {
        const rewardAccount = proposal.rewardAccount();
        requiredSigners.add(Cardano.RewardAccount.toHash(rewardAccount));
      }
    }
    return requiredSigners;
  }
}

const addressFromSigner = async (signer: CardanoSigner, networkId: number) => {
  return new CardanoAddress(
    networkId,
    {
      type: CredentialType.KeyHash,
      hash: await signer.paymentSigner.getPublicKeyHash(),
    },
    signer.stakeSigner && {
      type: CredentialType.KeyHash,
      hash: await signer.stakeSigner.getPublicKeyHash(),
    },
  );
};
