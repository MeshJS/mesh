import { setInConwayEra } from "@cardano-sdk/core";

import { ISecretManager } from "../../interfaces/secret-manager";
import { ISigner } from "../../interfaces/signer";
import {
  DEFAULT_DREP_KEY_DERIVATION_PATH,
  DEFAULT_PAYMENT_KEY_DERIVATION_PATH,
  DEFAULT_STAKE_KEY_DERIVATION_PATH,
} from "../../utils/constants";
import {
  AddressType,
  CardanoAddress,
  Credential,
  CredentialType,
} from "./cardano-address";

export type CredentialSource =
  | {
      type: "signer";
      signer: ISigner;
    }
  | {
      type: "scriptHash";
      scriptHash: string;
    };

export interface AddressManagerConfig {
  secretManager: ISecretManager;
  networkId: number;
  customStakeCredentialSource?: CredentialSource;
  customDrepCredentialSource?: CredentialSource;
}

export class AddressManager {
  private readonly paymentCredential: Credential;
  private readonly stakeCredential: Credential;
  private readonly drepCredential: Credential;

  private readonly paymentSigner: ISigner;
  private readonly stakeSigner?: ISigner;
  private readonly drepSigner?: ISigner;

  readonly secretManager: ISecretManager;
  private readonly networkId: number;

  static async create(config: AddressManagerConfig): Promise<AddressManager> {
    const secretManager = config.secretManager;

    const paymentSigner = await secretManager.getSigner([
      ...DEFAULT_PAYMENT_KEY_DERIVATION_PATH,
      0,
    ]);
    const paymentCredential: Credential = {
      type: CredentialType.KeyHash,
      hash: await paymentSigner.getPublicKeyHash(),
    };

    let stakeSigner: ISigner | undefined = undefined;
    let stakeCredential: Credential;

    if (config.customStakeCredentialSource) {
      if (config.customStakeCredentialSource.type === "scriptHash") {
        stakeCredential = {
          type: CredentialType.ScriptHash,
          hash: config.customStakeCredentialSource.scriptHash,
        };
      } else {
        stakeSigner = config.customStakeCredentialSource.signer;
        stakeCredential = {
          type: CredentialType.KeyHash,
          hash: await stakeSigner.getPublicKeyHash(),
        };
      }
    } else {
      stakeSigner = await secretManager.getSigner([
        ...DEFAULT_STAKE_KEY_DERIVATION_PATH,
        0,
      ]);
      stakeCredential = {
        type: CredentialType.KeyHash,
        hash: await stakeSigner.getPublicKeyHash(),
      };
    }

    let drepSigner: ISigner | undefined = undefined;
    let drepCredential: Credential;

    if (config.customDrepCredentialSource) {
      if (config.customDrepCredentialSource.type === "scriptHash") {
        drepCredential = {
          type: CredentialType.ScriptHash,
          hash: config.customDrepCredentialSource.scriptHash,
        };
      } else {
        drepSigner = config.customDrepCredentialSource.signer;
        drepCredential = {
          type: CredentialType.KeyHash,
          hash: await drepSigner.getPublicKeyHash(),
        };
      }
    } else {
      drepSigner = await secretManager.getSigner([
        ...DEFAULT_DREP_KEY_DERIVATION_PATH,
        0,
      ]);
      drepCredential = {
        type: CredentialType.KeyHash,
        hash: await drepSigner.getPublicKeyHash(),
      };
    }

    const networkId = config.networkId;
    return new AddressManager(
      paymentCredential,
      stakeCredential,
      drepCredential,
      paymentSigner,
      secretManager,
      networkId,
      stakeSigner,
      drepSigner,
    );
  }

  private constructor(
    paymentCredential: Credential,
    stakeCredential: Credential,
    drepCredential: Credential,
    paymentSigner: ISigner,
    secretManager: ISecretManager,
    networkId: number,
    stakeSigner?: ISigner,
    drepSigner?: ISigner,
  ) {
    setInConwayEra(true);
    this.paymentCredential = paymentCredential;
    this.stakeCredential = stakeCredential;
    this.drepCredential = drepCredential;
    this.paymentSigner = paymentSigner;
    this.stakeSigner = stakeSigner;
    this.drepSigner = drepSigner;
    this.networkId = networkId;
    this.secretManager = secretManager;
  }

  async getNextAddress(addressType: AddressType): Promise<CardanoAddress> {
    return new CardanoAddress(
      addressType,
      this.networkId,
      this.paymentCredential,
      this.stakeCredential,
    );
  }

  async getChangeAddress(addressType: AddressType): Promise<CardanoAddress> {
    return new CardanoAddress(
      addressType,
      this.networkId,
      this.paymentCredential,
      this.stakeCredential,
    );
  }

  async getRewardAccount(): Promise<CardanoAddress> {
    return new CardanoAddress(
      AddressType.Reward,
      this.networkId,
      this.paymentCredential,
      this.stakeCredential,
    );
  }

  //TODO: Implement getDrepId
  //async getDrepId(): Promise<string> {
  //}

  async getCredentialsSigners(
    pubkeyHashes: Set<string>,
  ): Promise<Map<string, ISigner>> {
    const signersMap = new Map<string, ISigner>();

    if (
      this.paymentCredential.type === CredentialType.KeyHash &&
      pubkeyHashes.has(this.paymentCredential.hash)
    ) {
      signersMap.set(this.paymentCredential.hash, this.paymentSigner);
    }

    if (
      this.stakeCredential.type === CredentialType.KeyHash &&
      pubkeyHashes.has(this.stakeCredential.hash) &&
      this.stakeSigner
    ) {
      signersMap.set(this.stakeCredential.hash, this.stakeSigner);
    }

    if (
      this.drepCredential.type === CredentialType.KeyHash &&
      pubkeyHashes.has(this.drepCredential.hash) &&
      this.drepSigner
    ) {
      signersMap.set(this.drepCredential.hash, this.drepSigner);
    }

    return signersMap;
  }
}
