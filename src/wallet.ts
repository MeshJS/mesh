/**
 * https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030
 */

import SerializationLib from "./provider/serializationlib.js";

import { WalletApi, Asset } from "./types/index.js";
import { MIN_ADA_REQUIRED } from "./global.js";
import { HexToAscii, toHex, fromHex } from "./utils/converter.js";

export class Wallet {
  private _provider: WalletApi; // wallet provider on the browser, i.e. window.cardano.ccvault

  constructor() {
    this._init();
  }

  private async _init() {
    await SerializationLib.load();
  }

  /**
   * Enable and connect wallet
   *
   * @example
   * ```ts
   * let connected = await Mesh.enableWallet({ walletName: 'ccvault' });
   * ```
   *
   * @param walletName - Available wallets are `ccvault`, `gerowallet` and `nami`
   * @returns - True if wallet is connected
   */
  async enable({ walletName }: { walletName: string }): Promise<boolean> {
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
    }
    return false;
  }

  async isEnabled(): Promise<boolean> {
    return this._provider !== undefined;
  }

  /**
   * Returns the network id of the currently connected account. 0 is testnet and 1 is mainnet but other networks can possibly be returned by wallets. Those other network ID values are not governed by this document.
   * @returns 0 is testnet and 1 is mainnet
   */
  async getNetworkId(): Promise<number> {
    return await this._provider.getNetworkId();
  }

  /**
   * return a list of all UTXOs (unspent transaction outputs) controlled by the wallet
   * @returns list of all UTXOs
   */
  async getUtxos(): Promise<string[] | undefined> {
    return await this._provider.getUtxos();
  }

  async getBalance(): Promise<string> {
    return await this._provider.getBalance();
  }

  /**
   * Returns a list of all used (included in some on-chain transaction) addresses controlled by the wallet.
   * @returns list of bech32 addresses
   */
  async getUsedAddresses(): Promise<string[]> {
    const usedAddresses = await this._provider.getUsedAddresses();
    return usedAddresses.map((address) =>
      SerializationLib.Instance.Address.from_bytes(fromHex(address)).to_bech32()
    );
  }

  async getUnusedAddresses(): Promise<string[]> {
    const unusedAddresses = await this._provider.getUnusedAddresses();
    return unusedAddresses.map((address) =>
      SerializationLib.Instance.Address.from_bytes(fromHex(address)).to_bech32()
    );
  }

  async getChangeAddress(): Promise<string> {
    const changeAddress = await this._provider.getChangeAddress();
    return SerializationLib.Instance.Address.from_bytes(
      fromHex(changeAddress)
    ).to_bech32();
  }

  /**
   * Returns the reward addresses owned by the wallet. This can return multiple addresses e.g. CIP-0018.
   * @returns list of reward addresses
   */
  async getRewardAddresses(): Promise<string[]> {
    const unusedAddresses = await this._provider.getRewardAddresses();
    return unusedAddresses.map((address) =>
      SerializationLib.Instance.Address.from_bytes(fromHex(address)).to_bech32()
    );
  }

  /**
   * Requests that a user sign the unsigned portions of the supplied transaction. The wallet should ask the user for permission, and if given, try to sign the supplied body and return a signed transaction.
   * @param tx - Transaction in CBOR
   * @param partialSign - True if partial sign for multi-signature
   * @returns signature
   */
  async signTx({
    tx,
    partialSign = false,
  }: {
    tx: string;
    partialSign?: boolean;
  }): Promise<string> {
    return await this._provider.signTx(tx, partialSign);
  }

  /**
   * This endpoint utilizes the CIP-0008 signing spec for standardization/safety reasons. It allows the dApp to request the user to sign a payload conforming to said spec.
   * @param payload - Nonce string
   * @returns signature
   */
  async signData({ payload }: { payload: string }): Promise<string> {
    const rewardAddress = await this.getRewardAddresses();
    const coseSign1Hex = await this._provider.signData(
      rewardAddress[0],
      payload
    );
    return coseSign1Hex;
  }

  async submitTx({ tx }: { tx: string }): Promise<string> {
    return await await this._provider.submitTx(tx);
  }

  /**
   * These are helper functions
   */

  /**
   * Get a list wallets installed on this browse
   * @returns a list of available wallets
   */
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

  /**
   * Return the first used address
   * @returns first address in string
   */
  async getWalletAddress(): Promise<string> {
    return (await this.getUsedAddresses())[0];
  }

  /**
   * Return lovelace amount
   * @returns lovelance
   */
  async getLovelace(): Promise<number> {
    const utxos = await this.getUtxos();

    if (utxos !== undefined) {
      const parsedUtxos = utxos.map((utxo) =>
        SerializationLib.Instance.TransactionUnspentOutput.from_bytes(
          Buffer.from(utxo, "hex")
        )
      );

      let countedValue = SerializationLib.Instance.Value.new(
        SerializationLib.Instance.BigNum.from_str("0")
      );
      parsedUtxos.forEach((element) => {
        countedValue = countedValue.checked_add(element.output().amount());
      });

      const minAda = SerializationLib.Instance.min_ada_required(
        countedValue,
        false,
        SerializationLib.Instance.BigNum.from_str(MIN_ADA_REQUIRED.toString())
      );

      const availableAda = countedValue.coin().checked_sub(minAda);
      const lovelace = parseInt(availableAda.to_str());
      return lovelace;
    }

    return 0;
  }

  /**
   * Get a list of assets in connected wallet
   * @param policyId (optional) if provided will filter only assets in this policy
   * @returns assets - List of asset
   */
  async getAssets({ policyId }: { policyId?: string }): Promise<Asset[]> {
    const valueCBOR = await this.getBalance();
    const value = SerializationLib.Instance.Value.from_bytes(
      fromHex(valueCBOR)
    );

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

    // if `policyId` is provided, return assets in this policy ID
    if (policyId) {
      const filteredAssets = assets
        .filter(function (el) {
          return el.unit.includes(policyId);
        })
        .map((item) => {
          return item;
        });
      return filteredAssets;
    }

    return assets;
  }

  async submitTransaction({
    tx,
    witnesses,
    metadata = undefined,
  }: {
    tx: string;
    witnesses: string[];
    metadata?: {};
  }) {
    let transaction = SerializationLib.Instance.Transaction.from_bytes(
      Buffer.from(tx, "hex")
    );

    const txWitnesses = transaction.witness_set();
    const txVkeys = txWitnesses.vkeys();
    const txScripts = txWitnesses.native_scripts();

    const totalVkeys = SerializationLib.Instance.Vkeywitnesses.new();
    const totalScripts = SerializationLib.Instance.NativeScripts.new();

    for (let witness of witnesses) {
      const addWitnesses =
        SerializationLib.Instance.TransactionWitnessSet.from_bytes(
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

    const totalWitnesses =
      SerializationLib.Instance.TransactionWitnessSet.new();
    totalWitnesses.set_vkeys(totalVkeys);
    totalWitnesses.set_native_scripts(totalScripts);
    let aux;
    if (metadata) {
      aux = SerializationLib.Instance.AuxiliaryData.new();
      const generalMetadata =
        SerializationLib.Instance.GeneralTransactionMetadata.new();
      Object.entries(metadata).map(([MetadataLabel, Metadata]) => {
        generalMetadata.insert(
          SerializationLib.Instance.BigNum.from_str(MetadataLabel),
          SerializationLib.Instance.encode_json_str_to_metadatum(
            JSON.stringify(Metadata),
            0
          )
        );
      });

      aux.set_metadata(generalMetadata);
    } else {
      aux = transaction.auxiliary_data();
    }
    const signedTx = await SerializationLib.Instance.Transaction.new(
      transaction.body(),
      totalWitnesses,
      aux
    );

    const txHash = await this.submitTx({ tx: toHex(signedTx.to_bytes()) });
    return txHash;
  }

}
