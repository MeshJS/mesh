import { Serialization, setInConwayEra } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";

import { Asset, IFetcher, ISubmitter, UTxO } from "@meshsdk/common";

import { CardanoAddress } from "../../address/cardano-address";
import { CardanoSigner } from "../../signer/cardano-signer";
import { BaseCardanoWallet } from "./cardano-base-wallet";

export class MeshWallet extends BaseCardanoWallet {
  constructor(
    networkId: number,
    signer: CardanoSigner,
    address: CardanoAddress,
    fetcher?: IFetcher,
    submitter?: ISubmitter,
  ) {
    setInConwayEra(true);
    super(networkId, signer, address, fetcher, submitter);
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
    return this.address.stakePubkey
      ? [this.address.getBaseAddressBech32()!]
      : [this.address.getEnterpriseAddressBech32()];
  }

  async getUnusedAddressesBech32(): Promise<string[]> {
    return this.address.stakePubkey
      ? [this.address.getBaseAddressBech32()!]
      : [this.address.getEnterpriseAddressBech32()];
  }

  async getChangeAddressBech32(): Promise<string> {
    return this.address.stakePubkey
      ? this.address.getBaseAddressBech32()!
      : this.address.getEnterpriseAddressBech32();
  }

  async getRewardAddressBech32(): Promise<string> {
    if (!this.address.stakePubkey) {
      throw new Error("[CardanoWallet] No stake address for this wallet");
    }
    return this.address.getRewardAddressBech32()!;
  }

  async signTxReturnFullTx(tx: string): Promise<string> {
    const witnessCbor = await this.signTx(tx);
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
