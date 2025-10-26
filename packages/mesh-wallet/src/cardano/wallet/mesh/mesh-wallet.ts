import { Cardano, Serialization } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";

import { Asset, IFetcher, ISubmitter, UTxO } from "@meshsdk/common";

import { InMemoryBip32 } from "../../../bip32/in-memory-bip32";
import { AddressManager } from "../../address/single-address-manager";
import {
  BaseCardanoWallet,
  BaseCardanoWalletConfig,
} from "./cardano-base-wallet";

/**
 * MeshWallet provides additional convenience methods on top of BaseCardanoWallet,
 * such as returning results in Mesh-compatible formats and Bech32 addresses.
 */
export class MeshWallet extends BaseCardanoWallet {
  static async create(config: BaseCardanoWalletConfig): Promise<MeshWallet> {
    const addressManager = await AddressManager.create({
      secretManager: config.secretManager,
      networkId: config.networkId,
      customStakeCredentialSource: config.customStakeCredentialSource,
      customDrepCredentialSource: config.customDrepCredentialSource,
    });

    return new MeshWallet(
      config.networkId,
      addressManager,
      config.walletAddressType,
      config.fetcher,
      config.submitter,
    );
  }

  static async fromMnemonic(
    config: Omit<BaseCardanoWalletConfig, "secretManager"> & {
      mnemonic: string[];
      password?: string;
    },
  ): Promise<MeshWallet> {
    const bip32 = await InMemoryBip32.fromMnemonic(
      config.mnemonic,
      config.password,
    );
    return MeshWallet.create({
      secretManager: bip32,
      networkId: config.networkId,
      customStakeCredentialSource: config.customStakeCredentialSource,
      customDrepCredentialSource: config.customDrepCredentialSource,
      walletAddressType: config.walletAddressType,
      fetcher: config.fetcher,
      submitter: config.submitter,
    });
  }

  static async fromBip32Root(
    config: Omit<BaseCardanoWalletConfig, "secretManager"> & {
      bech32: string;
    },
  ): Promise<MeshWallet> {
    const bip32 = InMemoryBip32.fromBech32(config.bech32);
    return MeshWallet.create({
      secretManager: bip32,
      networkId: config.networkId,
      customStakeCredentialSource: config.customStakeCredentialSource,
      customDrepCredentialSource: config.customDrepCredentialSource,
      walletAddressType: config.walletAddressType,
      fetcher: config.fetcher,
      submitter: config.submitter,
    });
  }

  static async fromBip32RootHex(
    config: Omit<BaseCardanoWalletConfig, "secretManager"> & {
      hex: string;
    },
  ): Promise<MeshWallet> {
    const bip32 = InMemoryBip32.fromKeyHex(config.hex);
    return MeshWallet.create({
      secretManager: bip32,
      networkId: config.networkId,
      customStakeCredentialSource: config.customStakeCredentialSource,
      customDrepCredentialSource: config.customDrepCredentialSource,
      walletAddressType: config.walletAddressType,
      fetcher: config.fetcher,
      submitter: config.submitter,
    });
  }

  async getUtxosMesh(): Promise<UTxO[]> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    return await this.fetchAccountUtxos();
  }

  async getCollateralMesh(): Promise<UTxO[]> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    const utxos = await this.fetchAccountUtxos();
    const getUtxoLovelaceValue = (utxo: UTxO) => {
      const value = utxo.output.amount;
      let lovelace = 0;
      for (const asset of value) {
        if (asset.unit === "lovelace" || asset.unit === "") {
          lovelace = parseInt(asset.quantity);
        }
      }
      return lovelace;
    };
    // sort utxos by lovelace value ascending
    const sortedUtxos = utxos.sort(
      (a, b) => getUtxoLovelaceValue(a) - getUtxoLovelaceValue(b),
    );

    // return the smallest utxo with at least 5 ADA
    for (const utxo of sortedUtxos) {
      if (getUtxoLovelaceValue(utxo) >= 5_000_000) {
        return [utxo];
      }
    }
    return [];
  }

  async getBalanceMesh(): Promise<Asset[]> {
    if (!this.fetcher) {
      throw new Error("[CardanoWallet] No fetcher provided");
    }
    const utxos = await this.fetchAccountUtxos();
    return utxos.map((utxo) => utxo.output.amount).flat();
  }

  async getUsedAddressesBech32(): Promise<string[]> {
    const addresses = await this.getUsedAddresses();
    return addresses.map((addr) => {
      const cardanoAddr = Cardano.Address.fromBytes(HexBlob(addr));
      return cardanoAddr.toBech32();
    });
  }

  async getUnusedAddressesBech32(): Promise<string[]> {
    const addresses = await this.getUnusedAddresses();
    return addresses.map((addr) => {
      const cardanoAddr = Cardano.Address.fromBytes(HexBlob(addr));
      return cardanoAddr.toBech32();
    });
  }

  async getChangeAddressBech32(): Promise<string> {
    const address = await this.getChangeAddress();
    const cardanoAddr = Cardano.Address.fromBytes(HexBlob(address));
    return cardanoAddr.toBech32();
  }

  async getRewardAddressBech32(): Promise<string> {
    const address = await this.getRewardAddress();
    const cardanoAddr = Cardano.Address.fromBytes(HexBlob(address));
    return cardanoAddr.toBech32();
  }

  async signTxReturnFullTx(
    tx: string,
    partialSign: boolean = false,
  ): Promise<string> {
    const witnessCbor = await this.signTx(tx, partialSign);
    const addedWitnesses = Serialization.TransactionWitnessSet.fromCbor(
      HexBlob(witnessCbor),
    );
    const transaction = Serialization.Transaction.fromCbor(
      Serialization.TxCBOR(tx),
    );
    let witnessSet = transaction.witnessSet();
    let witnessSetVkeys = witnessSet.vkeys();
    let witnessSetVkeysValues: Serialization.VkeyWitness[] = witnessSetVkeys
      ? [
          ...witnessSetVkeys.values(),
          ...(addedWitnesses.vkeys()?.values() ?? []),
        ]
      : [...(addedWitnesses.vkeys()?.values() ?? [])];

    witnessSet.setVkeys(
      Serialization.CborSet.fromCore(
        witnessSetVkeysValues.map((vkw) => vkw.toCore()),
        Serialization.VkeyWitness.fromCore,
      ),
    );
    const signedTx = new Serialization.Transaction(
      transaction.body(),
      witnessSet,
      transaction.auxiliaryData(),
    );
    return signedTx.toCbor();
  }
}
