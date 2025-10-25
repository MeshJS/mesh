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

export enum AddressType {
  Enterprise = 0,
  Base = 1,
  Reward = 2,
}

export class CardanoAddress {
  public addressType: AddressType;
  public networkId: number;
  public paymentCredential: Credential;
  public stakeCredential?: Credential;

  constructor(
    addressType: AddressType,
    networkId: number,
    paymentCredential: Credential,
    stakeCredential?: Credential,
  ) {
    setInConwayEra(true);
    if (addressType === AddressType.Base && !stakeCredential) {
      throw new Error("No stake credential");
    }
    this.addressType = addressType;
    this.networkId = networkId;
    this.paymentCredential = paymentCredential;
    this.stakeCredential = stakeCredential;
  }

  public getAddressBech32(): string {
    if (this.addressType === AddressType.Enterprise) {
      return this.getEnterpriseAddressBech32();
    } else if (this.addressType === AddressType.Base) {
      return this.getBaseAddressBech32();
    } else if (this.addressType === AddressType.Reward) {
      return this.getRewardAddressBech32();
    }
    throw new Error(`Invalid address type: ${this.addressType}`);
  }

  public getAddressHex(): string {
    if (this.addressType === AddressType.Enterprise) {
      return this.getEnterpriseAddressHex();
    } else if (this.addressType === AddressType.Base) {
      return this.getBaseAddressHex();
    } else if (this.addressType === AddressType.Reward) {
      return this.getRewardAddressHex();
    }
    throw new Error(`Invalid address type: ${this.addressType}`);
  }

  private getEnterpriseAddressBech32(): string {
    const enterpriseAddress = Cardano.EnterpriseAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      {
        hash: Hash28ByteBase16(this.paymentCredential.hash),
        type: mapCredentialTypeToCredential(this.paymentCredential.type),
      },
    );
    return enterpriseAddress.toAddress().toBech32();
  }

  private getEnterpriseAddressHex(): string {
    const enterpriseAddress = Cardano.EnterpriseAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      {
        hash: Hash28ByteBase16(this.paymentCredential.hash),
        type: mapCredentialTypeToCredential(this.paymentCredential.type),
      },
    );
    return enterpriseAddress.toAddress().toBytes();
  }

  private getBaseAddressBech32(): string {
    if (!this.stakeCredential) throw new Error("No stake credential");
    const baseAddress = Cardano.BaseAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      {
        hash: Hash28ByteBase16(this.paymentCredential.hash),
        type: mapCredentialTypeToCredential(this.paymentCredential.type),
      },
      {
        hash: Hash28ByteBase16(this.stakeCredential.hash),
        type: mapCredentialTypeToCredential(this.stakeCredential.type),
      },
    );
    return baseAddress.toAddress().toBech32();
  }

  private getBaseAddressHex(): string {
    if (!this.stakeCredential) throw new Error("No stake credential");
    const baseAddress = Cardano.BaseAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      {
        hash: Hash28ByteBase16(this.paymentCredential.hash),
        type: mapCredentialTypeToCredential(this.paymentCredential.type),
      },
      {
        hash: Hash28ByteBase16(this.stakeCredential.hash),
        type: this.stakeCredential.type,
      },
    );
    return baseAddress.toAddress().toBytes();
  }

  private getRewardAddressBech32(): string {
    if (!this.stakeCredential) throw new Error("No stake credential");
    const rewardAddress = Cardano.RewardAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      {
        hash: Hash28ByteBase16(this.paymentCredential.hash),
        type: this.paymentCredential.type,
      },
    );
    return rewardAddress.toAddress().toBech32();
  }

  private getRewardAddressHex(): string {
    if (!this.stakeCredential) throw new Error("No stake credential");
    const rewardAddress = Cardano.RewardAddress.fromCredentials(
      this.networkId === 1
        ? Cardano.NetworkId.Mainnet
        : Cardano.NetworkId.Testnet,
      {
        hash: Hash28ByteBase16(this.paymentCredential.hash),
        type: mapCredentialTypeToCredential(this.paymentCredential.type),
      },
    );
    return rewardAddress.toAddress().toBytes();
  }
}

const mapCredentialTypeToCredential = (
  credentialType: CredentialType,
): Cardano.CredentialType => {
  switch (credentialType) {
    case CredentialType.KeyHash:
      return Cardano.CredentialType.KeyHash;
    case CredentialType.ScriptHash:
      return Cardano.CredentialType.ScriptHash;
  }
};
