import * as lib from "@emurgo/cardano-serialization-lib-browser";
import {
  BigNum,
  Value,
  Address,
  min_ada_required,
  TransactionUnspentOutput,
  Transaction,
  Vkeywitnesses,
  NativeScripts,
  TransactionWitnessSet,
  AuxiliaryData,
  GeneralTransactionMetadata,
  encode_json_str_to_metadatum,
} from "@emurgo/cardano-serialization-lib-browser";

import { HexToAscii, toHex, fromHex, fromLovelace } from "../utils/converter";
import { WalletApi } from "../types";
import { Asset } from "../types";
import { MIN_ADA_REQUIRED } from "../global";

export class Core {
  private _provider: WalletApi; // wallet provider on the browser, i.e. window.cardano.ccvault
  private _cardano; // Serialization Lib

  constructor() {}

  async init() {
    this._cardano = lib;
  }

  getCardano() {
    return this._cardano;
  }

  _checkWallet() {
    if (this._provider == null) {
      throw "Wallet not connected.";
    }
  }

  fromCborToHex({ cbor }: { cbor: string }) {
    return Value.from_bytes(fromHex(cbor));
  }

  getWalletProvider() {
    return this._provider;
  }

  async enableWallet({ walletName }: { walletName: string }): Promise<boolean> {
    if (walletName === "ccvault") {
      const instance = await window.cardano?.ccvault?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
    } else if (walletName === "gerowallet") {
      const instance = await window.cardano?.gerowallet?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
    } else if (walletName === "nami" || walletName === null) {
      const instance = await window.cardano?.nami?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
      // this is old nami (`window.cardano`)
      // this._provider = window.cardano;
      // if (this._provider) {
      //   return true;
      // }
    }
    return false;
  }

  async getUsedAddresses(): Promise<string[]> {
    this._checkWallet();
    const usedAddresses = await this._provider.getUsedAddresses();
    return usedAddresses.map((address) =>
      Address.from_bytes(fromHex(address)).to_bech32()
    );
  }

  async getWalletAddress(): Promise<string> {
    const usedAddresses = await this.getUsedAddresses();
    return usedAddresses[0];
  }

  async getRewardAddresses(): Promise<string[]> {
    return await this._provider.getRewardAddresses();
  }

  async getUtxos(): Promise<string[] | undefined> {
    this._checkWallet();
    return await this._provider.getUtxos();
  }

  async getAvailableWallets(): Promise<string[]> {
    let availableWallets: string[] = [];
    if (window.cardano === undefined) {
      return availableWallets;
    }
    if (window.cardano.ccvault) {
      availableWallets.push("ccvault");
    }
    if (window.cardano.gerowallet) {
      availableWallets.push("gerowallet");
    }
    if (window.cardano.nami) {
      availableWallets.push("nami");
    }
    return availableWallets;
  }

  async getNetworkId(): Promise<number> {
    return await this._provider.getNetworkId();
  }

  async getAssets(): Promise<Asset[]> {
    const valueCBOR = await this._provider.getBalance();
    const value = this._cardano.Value.from_bytes(fromHex(valueCBOR));

    const assets: Asset[] = [];
    if (value.multiasset()) {
      const multiAssets = value.multiasset().keys();
      for (let j = 0; j < multiAssets.len(); j++) {
        const policy = multiAssets.get(j);
        const policyAssets = value.multiasset().get(policy);
        const assetNames = policyAssets.keys();
        for (let k = 0; k < assetNames.len(); k++) {
          const policyAsset = assetNames.get(k);
          const quantity = policyAssets.get(policyAsset);
          const asset = toHex(policy.to_bytes()) + toHex(policyAsset.name());
          const _policy = asset.slice(0, 56);
          const _name = asset.slice(56);
          assets.push({
            unit: asset,
            quantity: quantity.to_str(),
            policy: _policy,
            name: HexToAscii(_name),
          });
        }
      }
    }

    return assets;
  }

  /**
   * TODO: somehow the amount dont tally my wallet
   * TODO: need check this function and clean up
   * @param inAda
   * @returns
   */
  async getLovelace(): Promise<number> {
    const utxos = await this._provider.getUtxos();

    if (utxos !== undefined) {
      const parsedUtxos = utxos.map((utxo) =>
        TransactionUnspentOutput.from_bytes(Buffer.from(utxo, "hex"))
      );

      let countedValue = Value.new(BigNum.from_str("0"));
      parsedUtxos.forEach((element) => {
        countedValue = countedValue.checked_add(element.output().amount());
      });

      const minAda = min_ada_required(
        countedValue,
        false,
        BigNum.from_str(MIN_ADA_REQUIRED.toString())
      );

      const availableAda = countedValue.coin().checked_sub(minAda);
      const lovelace = parseInt(availableAda.to_str());
      return lovelace;
    }

    return 0;
  }

  async signData({ payload }: { payload: string }): Promise<string> {
    const rewardAddress = await this.getRewardAddresses();
    const coseSign1Hex = await this._provider.signData(
      rewardAddress[0],
      payload
    );
    return coseSign1Hex;
  }

  async signTx({
    tx,
    partialSign = false,
  }: {
    tx: string;
    partialSign?: boolean;
  }): Promise<string> {
    return await this._provider.signTx(tx, partialSign);
  }

  // async submitTx({ tx }: { tx: string }): Promise<string> {
  //   return await this._provider.submitTx(tx);
  // }

  async submitTx({
    tx,
    witnesses,
    metadata = undefined,
  }: {
    tx: string;
    witnesses: string[];
    metadata?: {};
  }) {
    let networkId = await this.getNetworkId();
    let transaction = Transaction.from_bytes(
      Buffer.from(tx, "hex")
    );

    const txWitnesses = transaction.witness_set();
    const txVkeys = txWitnesses.vkeys();
    const txScripts = txWitnesses.native_scripts();

    const totalVkeys = Vkeywitnesses.new();
    const totalScripts = NativeScripts.new();

    for (let witness of witnesses) {
      const addWitnesses = TransactionWitnessSet.from_bytes(
        Buffer.from(witness, "hex")
      );
      const addVkeys = addWitnesses.vkeys();
      if (addVkeys) {
        for (let i = 0; i < addVkeys.len(); i++) {
          totalVkeys.add(addVkeys.get(i));
        }
      }
    }

    if (txVkeys) {
      for (let i = 0; i < txVkeys.len(); i++) {
        totalVkeys.add(txVkeys.get(i));
      }
    }
    if (txScripts) {
      for (let i = 0; i < txScripts.len(); i++) {
        totalScripts.add(txScripts.get(i));
      }
    }

    const totalWitnesses = TransactionWitnessSet.new();
    totalWitnesses.set_vkeys(totalVkeys);
    totalWitnesses.set_native_scripts(totalScripts);
    let aux;
    if (metadata) {
      aux = AuxiliaryData.new();
      const generalMetadata = GeneralTransactionMetadata.new();
      Object.entries(metadata).map(([MetadataLabel, Metadata]) => {
        generalMetadata.insert(
          BigNum.from_str(MetadataLabel),
          encode_json_str_to_metadatum(JSON.stringify(Metadata), 0)
        );
      });

      aux.set_metadata(generalMetadata);
    } else {
      aux = transaction.auxiliary_data();
    }
    const signedTx = await Transaction.new(
      transaction.body(),
      totalWitnesses,
      aux
    );

    // const txhash = await this._blockfrostRequest({
    //   endpoint: `/tx/submit`,
    //   headers: {
    //     "Content-Type": "application/cbor",
    //   },
    //   body: Buffer.from(signedTx.to_bytes(), "hex"),
    //   networkId: networkId,
    //   method: "POST",
    // });

    const txHash = await this._provider.submitTx(toHex(signedTx.to_bytes()));

    return txHash;
  }
}
