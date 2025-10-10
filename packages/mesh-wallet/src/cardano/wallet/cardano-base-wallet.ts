import { Ed25519PublicKey } from "@cardano-sdk/crypto";

import { BaseBip32 } from "../../bip32/base-bip32";
import { ICardanoWallet } from "../../interfaces/base-cardano-wallet";
import { BaseSigner } from "../../signer/base-signer";
import { CardanoAddress, CredentialType } from "../address/cardano-address";
import { CardanoSigner } from "../signer/cardano-signer";

export type CardanoWalletSource =
  | {
      type: "ed25519PrivateKeyHex";
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

  private constructor(
    networkId: number,
    signer: CardanoSigner,
    address: CardanoAddress,
  ) {
    this.networkId = networkId;
    this.signer = signer;
    this.address = address;
  }

  static fromBip32Root(networkId: number, bech32: string): BaseCardanoWallet {
    const bip32 = BaseBip32.fromBech32(bech32);
    const signer = CardanoSigner.fromBip32(bip32);
    const address = addressFromSigner(signer, networkId);
    return new BaseCardanoWallet(networkId, signer, address);
  }

  static fromBip32RootHex(networkId: number, hex: string): BaseCardanoWallet {
    const bip32 = BaseBip32.fromKeyHex(hex);
    const signer = CardanoSigner.fromBip32(bip32);
    const address = addressFromSigner(signer, networkId);
    return new BaseCardanoWallet(networkId, signer, address);
  }

  static fromWalletSources(
    networkId: number,
    walletSources: CardanoWalletSources,
  ): BaseCardanoWallet {
    const { paymentKey, stakeKey, drepKey } = walletSources;
    if (paymentKey.type !== "ed25519PrivateKeyHex") {
      throw new Error("Payment key must be a private key, and not a script");
    }
    const paymentSigner = BaseSigner.fromNormalKeyHex(paymentKey.keyHex);
    const stakeSigner = stakeKey
      ? stakeKey.type === "ed25519PrivateKeyHex"
        ? BaseSigner.fromNormalKeyHex(stakeKey.keyHex)
        : undefined
      : undefined;
    const drepSigner = drepKey
      ? drepKey.type === "ed25519PrivateKeyHex"
        ? BaseSigner.fromNormalKeyHex(drepKey.keyHex)
        : undefined
      : undefined;
    const signer = new CardanoSigner(paymentSigner, stakeSigner, drepSigner);
    const address = addressFromSigner(signer, networkId);
    return new BaseCardanoWallet(networkId, signer, address);
  }

  static fromMnemonic(
    networkId: number,
    mnemonic: string[],
    password?: string,
  ): BaseCardanoWallet {
    const bip32 = BaseBip32.fromMnemonic(mnemonic, password);
    const signer = CardanoSigner.fromBip32(bip32);
    const address = addressFromSigner(signer, networkId);
    return new BaseCardanoWallet(networkId, signer, address);
  }

  submitTx(tx: string): string {
    throw new Error("Method not implemented.");
  }
  getNetworkId(): number {
    return this.networkId;
  }
  getUtxos(): string[] {
    throw new Error("Method not implemented.");
  }
  getCollateral(): string[] {
    throw new Error("Method not implemented.");
  }
  getBalance(): string {
    throw new Error("Method not implemented.");
  }
  getUsedAddresses(): string[] {
    return this.address.stakePubkey
      ? [this.address.getBaseAddressHex()!]
      : [this.address.getEnterpriseAddressHex()];
  }
  getUnusedAddresses(): string[] {
    return this.address.stakePubkey
      ? [this.address.getBaseAddressHex()!]
      : [this.address.getEnterpriseAddressHex()];
  }
  getChangeAddress(): string {
    return this.address.stakePubkey
      ? this.address.getBaseAddressHex()!
      : this.address.getEnterpriseAddressHex();
  }
  getRewardAddress(): string {
    if (!this.address.stakePubkey) {
      throw new Error("No stake address for this wallet");
    }
    return this.address.getRewardAddressHex()!;
  }
  signTx(data: string): string {
    throw new Error("Method not implemented.");
  }
  signData(data: string): string {
    throw new Error("Method not implemented.");
  }
}

const addressFromSigner = (signer: CardanoSigner, networkId: number) => {
  return new CardanoAddress(
    networkId,
    {
      type: CredentialType.KeyHash,
      hash: Ed25519PublicKey.fromHex(signer.paymentSigner.getPublicKey())
        .hash()
        .hex(),
    },
    signer.stakeSigner && {
      type: CredentialType.KeyHash,
      hash: Ed25519PublicKey.fromHex(signer.stakeSigner.getPublicKey())
        .hash()
        .hex(),
    },
  );
};
