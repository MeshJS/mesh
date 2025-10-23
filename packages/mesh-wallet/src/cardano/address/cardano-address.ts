import { Cardano, setInConwayEra } from "@cardano-sdk/core";
import { Hash28ByteBase16 } from "@cardano-sdk/crypto";

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
    setInConwayEra(true);
    this.networkId = networkId;
    this.paymentPubkey = paymentPubkey;
    this.stakePubkey = stakePubkey;
  }

  getEnterpriseAddressBech32(): string {
    const enterpriseAddress = Cardano.EnterpriseAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      {
        hash: Hash28ByteBase16(this.paymentPubkey.hash),
        type: this.paymentPubkey.type,
      },
    );
    return enterpriseAddress.toAddress().toBech32();
  }

  getEnterpriseAddressHex(): string {
    const enterpriseAddress = Cardano.EnterpriseAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      {
        hash: Hash28ByteBase16(this.paymentPubkey.hash),
        type: this.paymentPubkey.type,
      },
    );
    return enterpriseAddress.toAddress().toBytes();
  }

  getBaseAddressBech32(): string | undefined {
    if (!this.stakePubkey) return undefined;
    const baseAddress = Cardano.BaseAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      {
        hash: Hash28ByteBase16(this.paymentPubkey.hash),
        type: this.paymentPubkey.type,
      },
      {
        hash: Hash28ByteBase16(this.stakePubkey.hash),
        type: this.stakePubkey.type,
      },
    );
    return baseAddress.toAddress().toBech32();
  }

  getBaseAddressHex(): string | undefined {
    if (!this.stakePubkey) return undefined;
    const baseAddress = Cardano.BaseAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      {
        hash: Hash28ByteBase16(this.paymentPubkey.hash),
        type: this.paymentPubkey.type,
      },
      {
        hash: Hash28ByteBase16(this.stakePubkey.hash),
        type: this.stakePubkey.type,
      },
    );
    return baseAddress.toAddress().toBytes();
  }

  getRewardAddressBech32(): string | undefined {
    if (!this.stakePubkey) return undefined;
    const rewardAddress = Cardano.RewardAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      {
        hash: Hash28ByteBase16(this.stakePubkey.hash),
        type: this.stakePubkey.type,
      },
    );
    return rewardAddress.toAddress().toBech32();
  }

  getRewardAddressHex(): string | undefined {
    if (!this.stakePubkey) return undefined;
    const rewardAddress = Cardano.RewardAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      {
        hash: Hash28ByteBase16(this.stakePubkey.hash),
        type: this.stakePubkey.type,
      },
    );
    return rewardAddress.toAddress().toBytes();
  }
}
