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

export type CardanoWalletConstructor = {
  networkId: number;
  key:
    | {
        type: "bip32Root";
        bech32: string;
      }
    | {
        type: "bip32RootHex";
        hex: string;
      }
    | {
        type: "keySources";
        walletSources: CardanoWalletSources;
      }
    | {
        type: "mnemonic";
        mnemonic: string[];
        password?: string;
      };
};

export class BaseCardanoWallet implements ICardanoWallet {
  public networkId: number;
  private signer: CardanoSigner;
  private address: CardanoAddress;

  constructor(constructorParams: CardanoWalletConstructor) {
    this.networkId = constructorParams.networkId;
    if (constructorParams.key.type === "bip32Root") {
      const bip32 = new BaseBip32({
        type: "bech32",
        bech32: constructorParams.key.bech32,
      });
      this.signer = CardanoSigner.fromBip32(bip32);
      this.address = addressFromSigner(this.signer, this.networkId);
    } else if (constructorParams.key.type === "bip32RootHex") {
      const bip32 = new BaseBip32({
        type: "keyHex",
        keyHex: constructorParams.key.hex,
      });
      this.signer = CardanoSigner.fromBip32(bip32);
      this.address = addressFromSigner(this.signer, this.networkId);
    } else if (constructorParams.key.type === "keySources") {
      const { paymentKey, stakeKey, drepKey } =
        constructorParams.key.walletSources;

      if (paymentKey.type !== "ed25519PrivateKeyHex") {
        throw new Error("Payment key must be a private key, and not a script");
      }

      const paymentSigner = new BaseSigner({
        type: "normalKeyHex",
        ed25519PrivateKeyHex: paymentKey.keyHex,
      });
      const stakeSigner = stakeKey
        ? stakeKey.type === "ed25519PrivateKeyHex"
          ? new BaseSigner({
              type: "normalKeyHex",
              ed25519PrivateKeyHex: stakeKey.keyHex,
            })
          : undefined
        : undefined;
      const drepSigner = drepKey
        ? drepKey.type === "ed25519PrivateKeyHex"
          ? new BaseSigner({
              type: "normalKeyHex",
              ed25519PrivateKeyHex: drepKey.keyHex,
            })
          : undefined
        : undefined;
      this.signer = new CardanoSigner(paymentSigner, stakeSigner, drepSigner);
      this.address = addressFromSigner(this.signer, this.networkId);
    } else if (constructorParams.key.type === "mnemonic") {
      const bip32 = new BaseBip32({
        type: "mnemonic",
        mnemonic: constructorParams.key.mnemonic,
        password: constructorParams.key.password,
      });

      this.signer = CardanoSigner.fromBip32(bip32);
      this.address = addressFromSigner(this.signer, this.networkId);
    } else {
      throw new Error("Invalid wallet constructor parameters");
    }
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
