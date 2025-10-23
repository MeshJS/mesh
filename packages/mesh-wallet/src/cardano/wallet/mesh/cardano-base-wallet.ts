import { Cardano, Serialization, setInConwayEra } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";

import { DataSignature, IFetcher, ISubmitter, UTxO } from "@meshsdk/common";

import { BaseBip32 } from "../../../bip32/base-bip32";
import { ICardanoWallet } from "../../../interfaces/cardano-wallet";
import { BaseSigner } from "../../../signer/base-signer";
import { toTxUnspentOutput } from "../../../utils/conerter";
import { mergeValue } from "../../../utils/value";
import { CardanoAddress, CredentialType } from "../../address/cardano-address";
import { CardanoSigner } from "../../signer/cardano-signer";

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
  public signer: CardanoSigner;
  public address: CardanoAddress;
  public fetcher?: IFetcher;
  public submitter?: ISubmitter;

  constructor(
    networkId: number,
    signer: CardanoSigner,
    address: CardanoAddress,
    fetcher?: IFetcher,
    submitter?: ISubmitter,
  ) {
    setInConwayEra(true);
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

  /**
   * Create a BaseCardanoWallet instance from a Bip32 root in Bech32 format.
   * @param networkId The network ID
   * @param bech32 The Bech32 encoded Bip32 root
   * @param fetcher The fetcher instance
   * @param submitter The submitter instance
   * @returns {Promise<BaseCardanoWallet>} A promise that resolves to a BaseCardanoWallet instance
   */
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

  /**
   * Create a BaseCardanoWallet instance from a Bip32 root in hex format.
   * @param networkId The network ID
   * @param hex The hex encoded Bip32 root
   * @param fetcher The fetcher instance
   * @param submitter The submitter instance
   * @returns {Promise<BaseCardanoWallet>} A promise that resolves to a BaseCardanoWallet instance
   */
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

  /**
   * Create a BaseCardanoWallet instance from wallet sources.
   * @param networkId The network ID
   * @param walletSources The wallet sources, including payment, stake, and drep keys
   * it is possible to input script hashes for stake and drep keys, but will be ignored for signing,
   * and only used for address generation
   * @param fetcher The fetcher instance
   * @param submitter The submitter instance
   * @returns {Promise<BaseCardanoWallet>} A promise that resolves to a BaseCardanoWallet instance
   */
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
      throw new Error(
        "[CardanoWallet] Payment key must be a private key, and not a script",
      );
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

  /**
   * Create a BaseCardanoWallet instance from a mnemonic phrase.
   * @param networkId The network ID
   * @param mnemonic The mnemonic phrase
   * @param password The password for the mnemonic
   * @param fetcher The fetcher instance
   * @param submitter The submitter instance
   * @returns {Promise<BaseCardanoWallet>} A promise that resolves to a BaseCardanoWallet instance
   */
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

  /**
   * Submit a transaction to the network, using the submitter instance.
   * @param tx The transaction in CBOR hex format
   * @returns {Promise<string>} A promise that resolves to the transaction ID
   */
  async submitTx(tx: string): Promise<string> {
    if (!this.submitter) {
      throw new Error("[CardanoWallet] No submitter provided");
    }
    return await this.submitter.submitTx(tx);
  }

  /**
   * Get the network ID.
   * @returns {number} The network ID
   */
  getNetworkId(): number {
    return this.networkId;
  }

  /**
   * Get the UTxOs for the wallet.
   *
   * NOTE: This method is only an approximation to CIP-30 getUtxos, as this wallet is completely
   * stateless and does not track which UTxOs are specifically set as collateral. Which means that there
   * will be overlap between getUtxos() and getCollateral() results. This can result in the collateral being
   * spent between transactions.
   * @returns {Promise<string[]>} A promise that resolves to an array of UTxOs in CBOR hex format
   */
  async getUtxos(): Promise<string[]> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    const utxos = await this.fetchAccountUtxos();
    return utxos.map((utxo) => toTxUnspentOutput(utxo).toCbor());
  }

  /**
   * Get the collateral UTxOs for the wallet.
   *
   * NOTE: This method is only an approximation to CIP-30 getCollateral, as this wallet is completely
   * stateless and does not track which UTxOs are specifically set as collateral. Which means that there
   * will be overlap between getUtxos() and getCollateral() results.
   * @returns {Promise<string[]>} A promise that resolves to an array of UTxOs in CBOR hex format
   */
  async getCollateral(): Promise<string[]> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    const utxos = await this.fetchAccountUtxos();
    const cardanoUtxos = utxos.map((utxo) => toTxUnspentOutput(utxo));

    // find utxos that are pure ADA-only
    const pureAdaUtxos = cardanoUtxos.filter((utxo) => {
      return utxo.output().amount().multiasset() === undefined;
    });

    // sort utxos by their lovelace amount
    pureAdaUtxos.sort((a, b) => {
      return (
        Number(a.output().amount().coin()) - Number(b.output().amount().coin())
      );
    });

    // return the smallest utxo but not less than 5000000 lovelace
    for (const utxo of pureAdaUtxos) {
      if (Number(utxo.output().amount().coin()) >= 5000000) {
        return [utxo.toCbor()];
      }
    }
    return [];
  }

  /**
   * Get the balance of the wallet.
   *
   * NOTE: This method is only an approximation to CIP-30 getBalance, as this wallet is completely
   * stateless and does not track which UTxOs are specifically set as collateral. Which means the balance
   * returned includes all UTxOs, including those that may be used as collateral.
   * @returns {Promise<string>} A promise that resolves to the balance in CBOR hex format
   */
  async getBalance(): Promise<string> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    const utxos = await this.fetchAccountUtxos();
    const cardanoUtxos = utxos.map((utxo) => toTxUnspentOutput(utxo));
    let total = new Serialization.Value(0n);
    for (const utxo of cardanoUtxos) {
      total = mergeValue(total, utxo.output().amount());
    }
    return total.toCbor();
  }

  /**
   * Get the used addresses for the wallet.
   *
   * NOTE: This method completely deviates from CIP-30 getUsedAddresses, as this wallet is stateless
   * it is impossible to track which addresses have been used. This method simply returns the wallet's main address.
   *
   * It will be effective to be used as a single address wallet.
   *
   * @returns {Promise<string[]>} A promise that resolves to an array of used addresses in hex format
   */
  async getUsedAddresses(): Promise<string[]> {
    return this.address.stakePubkey
      ? [this.address.getBaseAddressHex()!]
      : [this.address.getEnterpriseAddressHex()];
  }

  /**
   * Get the unused addresses for the wallet.
   *
   * NOTE: This method completely deviates from CIP-30 getUnusedAddresses, as this wallet is stateless
   * it is impossible to track which addresses have been used. This method simply returns the wallet's main address.
   *
   * It will be effective to be used as a single address wallet.
   *
   * @returns {Promise<string[]>} A promise that resolves to an array of unused addresses in hex format
   */
  async getUnusedAddresses(): Promise<string[]> {
    return this.address.stakePubkey
      ? [this.address.getBaseAddressHex()!]
      : [this.address.getEnterpriseAddressHex()];
  }

  /**
   * Get the change address for the wallet.
   * NOTE: This method deviates from CIP-30 getChangeAddress, as this wallet is stateless
   * it does not track which addresses has been previously used as change address. This method simply
   * returns the wallet's main address.
   *
   * It will be effective to be used as a single address wallet.
   *
   * @returns {Promise<string>} A promise that resolves to the change address in hex format
   */
  async getChangeAddress(): Promise<string> {
    return this.address.stakePubkey
      ? this.address.getBaseAddressHex()!
      : this.address.getEnterpriseAddressHex();
  }

  /**
   * Get the reward address for the wallet.
   * @returns {Promise<string>} A promise that resolves to the reward address in hex format
   */
  async getRewardAddress(): Promise<string> {
    if (!this.address.stakePubkey) {
      throw new Error("[CardanoWallet] No stake address for this wallet");
    }
    return this.address.getRewardAddressHex()!;
  }

  /**
   * Sign a transaction with the wallet.
   *
   * NOTE: This method requires a fetcher to resolve input UTxOs for determining required signers.
   *
   * It is also only an approximation to CIP-30 signTx, as this wallet is stateless and does not repeatedly
   * derive keys, it is unable to sign for multiple derived key indexes.
   *
   * It will be effective to be used as a single address wallet.
   *
   * @param tx The transaction in CBOR hex format
   * @returns A promise that resolves to a witness set with the signatures in CBOR hex format
   */
  async signTx(tx: string): Promise<string> {
    if (!this.fetcher) {
      throw new Error(
        "[CardanoWallet] No fetcher provided, wallet sign tx does not behave correctly without a fetcher to resolve inputs. If you need to blindly sign a tx, use the CardanoSigner class directly.",
      );
    }
    const transaction = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(tx),
    );
    let requiredSigners = await this.getRequiredSignatures(
      transaction,
      this.fetcher,
    );

    let witnessSet = new Serialization.TransactionWitnessSet();
    let signatures: string[] = [];

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
          return Serialization.VkeyWitness.fromCbor(HexBlob(sig)).toCore();
        }),
        Serialization.VkeyWitness.fromCore,
      ),
    );
    return witnessSet.toCbor();
  }

  /**
   * Sign data with the wallet.
   * @param data data to be signed in hex format
   * @param address optional address to sign the data with, otherwise the base address will be used
   * @returns A promise that resolves to the data signature
   */
  signData(data: string, address?: string): Promise<DataSignature> {
    if (!this.signer) {
      throw new Error("[CardanoWallet] No signer provided");
    }
    if (address) {
      if (address === this.address.getBaseAddressBech32()) {
        return this.signer.paymentSignData(
          data,
          this.address.getBaseAddressHex()!,
        );
      } else if (address === this.address.getEnterpriseAddressBech32()) {
        return this.signer.paymentSignData(
          data,
          this.address.getEnterpriseAddressHex()!,
        );
      } else if (address === this.address.getRewardAddressBech32()) {
        if (!this.address.stakePubkey) {
          throw new Error("[CardanoWallet] No stake address for this wallet");
        }
        return this.signer.stakeSignData(
          data,
          this.address.getRewardAddressHex()!,
        );
      }
    }
    return this.signer.paymentSignData(data, this.address.getBaseAddressHex()!);
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
        utxos.push(...fetchedUtxos);
      } else {
        throw new Error(
          `[CardanoWallet] Transaction not found for transaction id: ${txId}`,
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
            "[CardanoWallet] Error parsing required signers: Unknown certificate type",
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

  public async fetchAccountUtxos(): Promise<UTxO[]> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    const addresses = [];
    if (this.address.getEnterpriseAddressBech32()) {
      addresses.push(this.address.getEnterpriseAddressBech32()!);
    }
    if (this.address.getBaseAddressBech32()) {
      addresses.push(this.address.getBaseAddressBech32()!);
    }

    const utxos = [];
    for (const addr of addresses) {
      const fetchedUtxos = await this.fetcher.fetchAddressUTxOs(addr);
      utxos.push(...fetchedUtxos);
    }
    return utxos;
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
