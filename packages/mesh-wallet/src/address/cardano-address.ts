import { Cardano } from "@cardano-sdk/core";

export enum CredentialType {
  KeyHash = 0,
  ScriptHash = 1,
}

export type Credential = {
  type: CredentialType;
  hash: string;
};

export class CardanoAddress {
  public networkId: number;
  public paymentPubkey: Credential;
  public stakePubkey?: Credential;

  constructor(
    networkId: number,
    paymentPubkey: Credential,
    stakePubkey?: Credential,
  ) {
    this.networkId = networkId;
    this.paymentPubkey = paymentPubkey;
    this.stakePubkey = stakePubkey;
  }

  getEnterpriseAddressBech32(): string {
    const enterpriseAddress = Cardano.EnterpriseAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      this.paymentPubkey,
    );
    return enterpriseAddress.toAddress().toBech32();
  }

  getEnterpriseAddressHex(): string {
    const enterpriseAddress = Cardano.EnterpriseAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      this.paymentPubkey,
    );
    return enterpriseAddress.toAddress().toBytes();
  }

  getBaseAddressBech32(): string | undefined {
    if (!this.stakePubkey) return undefined;
    const baseAddress = Cardano.BaseAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      this.paymentPubkey,
      this.stakePubkey,
    );
    return baseAddress.toAddress().toBech32();
  }

  getBaseAddressHex(): string | undefined {
    if (!this.stakePubkey) return undefined;
    const baseAddress = Cardano.BaseAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      this.paymentPubkey,
      this.stakePubkey,
    );
    return baseAddress.toAddress().toBytes();
  }

  getRewardAddressBech32(): string | undefined {
    if (!this.stakePubkey) return undefined;
    const rewardAddress = Cardano.RewardAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      this.stakePubkey,
    );
    return rewardAddress.toAddress().toBech32();
  }

  getRewardAddressHex(): string | undefined {
    if (!this.stakePubkey) return undefined;
    const rewardAddress = Cardano.RewardAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      this.stakePubkey,
    );
    return rewardAddress.toAddress().toBytes();
  }
}
