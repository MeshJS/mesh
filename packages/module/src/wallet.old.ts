/**
 * https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030
 */

import { csl } from './core';

import { WalletApi, Asset, UTxO } from './types';
// import { MIN_ADA_REQUIRED } from './global';
import { HexToAscii, toHex, fromHex, valueToAssets } from './utils/converter';
import { linkToSrc, convertMetadataPropToString } from './utils/metadata';
import { Blockfrost } from './providers/blockfrost';
// import { Value } from '@emurgo/cardano-serialization-lib-browser';

export class Wallet {
  private _provider!: WalletApi; // wallet provider on the browser, i.e. window.cardano.ccvault
  private _blockfrost: Blockfrost;

  constructor({ blockfrost }: { blockfrost: Blockfrost }) {
    this._init();
    this._blockfrost = blockfrost;
  }

  private async _init() {
    //await csl.load();
  }

  private _showDepreciating(){
    console.log("Depreciating.")
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
    this._showDepreciating();
    
    if (walletName === 'ccvault') {
      const instance = await window.cardano?.ccvault?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
    } else if (walletName === 'gerowallet') {
      const instance = await window.cardano?.gerowallet?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
    } else if (walletName === 'nami' || walletName === null) {
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
  // async getUtxos(options?: { returnAssets?: boolean }): Promise<any> {
  //   let utxos = await this._provider.getUtxos();

  //   if (options?.returnAssets && options.returnAssets) {
  //     if (utxos === undefined) {
  //       throw 'No utxos';
  //     }

  //     let utxosAssets: {}[] = [];

  //     // TODO, lets get UTXOs like this as default https://docs.blockfrost.io/#tag/Cardano-Addresses/paths/~1addresses~1{address}~1utxos/get
  //     utxos.map((u) => {
  //       let thisUtxo: {
  //         cbor: string; // TODO name `cbor` ok?
  //         assets: { [assetId: string]: number };
  //         paymentAddr: string;
  //         txHash: string; // TODO to get?
  //         outputIndex: number; // TODO to get?
  //         dataHash?;
  //       } = {
  //         cbor: u,
  //         assets: {},
  //         paymentAddr: '',
  //         txHash: '',
  //         outputIndex: 0,
  //       };

  //       const utxo = csl.TransactionUnspentOutput.from_bytes(
  //         Buffer.from(u, 'hex')
  //       );

  //       thisUtxo.paymentAddr = utxo.output().address().to_bech32();

  //       valueToAssets(utxo.output().amount()).forEach((nnn) => {
  //         const unit = nnn.unit;
  //         const _policy = unit.slice(0, 56);
  //         const _name = HexToAscii(unit.slice(56));
  //         const assetId =
  //           _policy == 'lovelace' ? 'lovelace' : `${_policy}.${_name}`;
  //         thisUtxo.assets[assetId] = parseInt(nnn.quantity);
  //       });

  //       utxosAssets.push(thisUtxo);
  //     });

  //     return utxosAssets;
  //   }

  //   return utxos;
  // }

  async getUtxos(): Promise<UTxO[]> {
    let utxos = await this._provider.getUtxos();

    if (utxos === undefined) {
      throw 'No utxos';
    }

    let utxosAssets: UTxO[] = [];

    // TODO, lets get UTXOs like this as default https://docs.blockfrost.io/#tag/Cardano-Addresses/paths/~1addresses~1{address}~1utxos/get
    utxos.map((u) => {
      let thisUtxo: UTxO = {
        cbor: u,
        assets: {},
        address: '',
        txHash: '',
        outputIndex: 0,
      };

      const utxo = csl.TransactionUnspentOutput.from_bytes(
        Buffer.from(u, 'hex')
      );

      thisUtxo.address = utxo.output().address().to_bech32();
      // thisUtxo.txHash = utxo.output().data_hash()
      //   ? toHex(utxo.output().data_hash()!.to_bytes())
      //   : '';

      valueToAssets(utxo.output().amount()).forEach((nnn) => {
        const unit = nnn.unit;
        const _policy = unit.slice(0, 56);
        const _name = HexToAscii(unit.slice(56));
        const assetId =
          _policy == 'lovelace' ? 'lovelace' : `${_policy}.${_name}`;
        thisUtxo.assets[assetId] = parseInt(nnn.quantity);
      });

      utxosAssets.push(thisUtxo);
    });

    return utxosAssets;
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
      csl.Address.from_bytes(fromHex(address)).to_bech32()
    );
  }

  async getUnusedAddresses(): Promise<string[]> {
    const unusedAddresses = await this._provider.getUnusedAddresses();
    return unusedAddresses.map((address) =>
      csl.Address.from_bytes(fromHex(address)).to_bech32()
    );
  }

  async getChangeAddress(): Promise<string> {
    const changeAddress = await this._provider.getChangeAddress();
    return csl.Address.from_bytes(
      fromHex(changeAddress)
    ).to_bech32();
  }

  async getCollateral() {
    return await this._provider.getCollateral();
  }

  /**
   * Returns the reward addresses owned by the wallet. This can return multiple addresses e.g. CIP-0018.
   * @returns list of reward addresses
   */
  async getRewardAddresses(): Promise<string[]> {
    const unusedAddresses = await this._provider.getRewardAddresses();
    return unusedAddresses.map((address) =>
      csl.Address.from_bytes(fromHex(address)).to_bech32()
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
    return await this._provider.submitTx(tx);
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
      availableWallets.push('ccvault');
    }
    if (window.cardano.gerowallet) {
      availableWallets.push('gerowallet');
    }
    if (window.cardano.nami) {
      availableWallets.push('nami');
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
   * TODO: why get `underflow` error?
   * @returns lovelance
   */
  async getLovelace(): Promise<number> {
    let lovelace = 0;

    const utxos = await this.getUtxos();

    if (utxos !== undefined) {
      // // v1
      // const parsedUtxos = utxos.map((utxo) =>
      //   csl.TransactionUnspentOutput.from_bytes(fromHex(utxo.cbor))
      // );

      // let countedValue = csl.Value.new(
      //   csl.BigNum.from_str('0')
      // );
      // parsedUtxos.forEach(
      //   (element: {
      //     output: () => {
      //       (): any;
      //       new (): any;
      //       amount: { (): Value; new (): any };
      //     };
      //   }) => {
      //     countedValue = countedValue.checked_add(element.output().amount());
      //   }
      // );

      // const minAda = csl.min_ada_required(
      //   countedValue,
      //   false,
      //   csl.BigNum.from_str(MIN_ADA_REQUIRED.toString())
      // );

      // const availableAda = countedValue.coin().checked_sub(minAda);
      // const lovelace = parseInt(availableAda.to_str());
      // return lovelace;

      // // v2
      const inputs = utxos.map((utxo) => {
        return csl.TransactionUnspentOutput.from_bytes(
          Buffer.from(utxo.cbor, 'hex')
        );
      });

      inputs.forEach((nn) => {
        valueToAssets(nn.output().amount()).forEach((nnn) => {
          if (nnn.unit === 'lovelace') {
            lovelace += parseInt(nnn.quantity, 10);
          }
        });
      });
    }

    return lovelace;
  }

  /**
   * Get a list of assets in connected wallet
   * Note: includeOnchain requires `Mesh.blockfrost.init`
   * @param policyId (optional) if provided will filter only assets in this policy
   * @param includeOnchain (optional) if provided will get on-chain metadata
   * @param limit (optional) if provided will limit the number of (random) assets returned
   * @returns assets - List of asset
   */
  async getAssets(options?: {
    policyId?: string;
    includeOnchain?: boolean;
    limit?: number;
  }): Promise<Asset[]> {
    const valueCBOR = await this.getBalance();
    const value = csl.Value.from_bytes(fromHex(valueCBOR));

    let assets: Asset[] = [];
    if (value.multiasset()) {
      const multiAssets = value.multiasset()?.keys();
      if (multiAssets) {
        for (let j = 0; j < multiAssets.len(); j++) {
          const policy = multiAssets.get(j);
          const policyAssets = value.multiasset()?.get(policy);
          let assetNames = policyAssets?.keys();
          if (policyAssets && assetNames) {
            for (let k = 0; k < assetNames.len(); k++) {
              const policyAsset = assetNames.get(k);
              const quantity = policyAssets.get(policyAsset)!;
              const asset =
                toHex(policy.to_bytes()) + toHex(policyAsset.name());
              const _policy = asset.slice(0, 56);
              const _name = asset.slice(56);
              assets.push({
                unit: asset,
                quantity: parseInt(quantity.to_str()),
                policy: _policy,
                name: HexToAscii(_name),
              });
            }
          }
        }
      }
    }

    // if `policyId` is provided, return assets in this policy ID
    if (options?.policyId && options.policyId && options?.policyId.length > 0) {
      const filteredAssets = assets
        .filter(function (el) {
          return el.unit.includes(options.policyId!);
        })
        .map((item) => {
          return item;
        });
      assets = [...filteredAssets];
    }

    // if `limit` provided, pick the first `limit` number of assets
    if (options?.limit && options.limit > 0) {
      assets = assets.slice(0, options.limit);
    }

    // if blockfrost is loaded and `includeOnchain`, pull on-chain info
    if (this._blockfrost.isLoaded() && options?.includeOnchain) {
      await Promise.all(
        assets.map(async (asset) => {
          asset.onchain = await this._blockfrost.assetSpecificAsset({
            asset: asset.unit,
          });

          asset.image =
            (asset.onchain.onchain_metadata &&
              asset.onchain.onchain_metadata.image &&
              linkToSrc(
                convertMetadataPropToString(
                  asset.onchain.onchain_metadata.image
                )
              )) ||
            '';
        })
      );
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
    let transaction = csl.Transaction.from_bytes(
      Buffer.from(tx, 'hex')
    );

    const txWitnesses = transaction.witness_set();
    const txVkeys = txWitnesses.vkeys();
    const txScripts = txWitnesses.native_scripts();

    const totalVkeys = csl.Vkeywitnesses.new();
    const totalScripts = csl.NativeScripts.new();

    for (let witness of witnesses) {
      const addWitnesses = csl.TransactionWitnessSet.from_bytes(
        Buffer.from(witness, 'hex')
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

    const totalWitnesses = csl.TransactionWitnessSet.new();
    totalWitnesses.set_vkeys(totalVkeys);
    totalWitnesses.set_native_scripts(totalScripts);
    let aux;
    if (metadata) {
      aux = csl.AuxiliaryData.new();
      const generalMetadata = csl.GeneralTransactionMetadata.new();
      Object.entries(metadata).map(([MetadataLabel, Metadata]) => {
        generalMetadata.insert(
          csl.BigNum.from_str(MetadataLabel),
          csl.encode_json_str_to_metadatum(
            JSON.stringify(Metadata),
            0
          )
        );
      });

      aux.set_metadata(generalMetadata);
    } else {
      aux = transaction.auxiliary_data();
    }

    try {
      const signedTx = await csl.Transaction.new(
        transaction.body(),
        totalWitnesses,
        aux
      );

      const txHash = await this.submitTx({ tx: toHex(signedTx.to_bytes()) });
      return txHash;
    } catch (error) {
      throw error;
    }
  }
}
