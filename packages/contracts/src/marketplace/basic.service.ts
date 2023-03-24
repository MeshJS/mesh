import {
  IFetcher, IInitiator, ISigner, ISubmitter,
  parseAssetUnit, resolveDataHash, resolveEpochNo,
  resolvePaymentKeyHash, resolvePlutusScriptAddress, Transaction,
} from "@meshsdk/core";
import type { Network, PlutusScript, UTxO } from '@meshsdk/core';
import { buildPlutusScript, OwnerAddress } from "./contract";

export class BasicMarketplace {
  private _fetcher: IFetcher;
  private _initiator: IInitiator;
  private _network: Network;
  private _owner: string;
  private _percentage: number;
  private _script: PlutusScript;
  private _signer: ISigner;
  private _submitter: ISubmitter;

  constructor(options = {} as CreateMarketplaceOptions) {
    this._fetcher = options.fetcher;
    this._initiator = options.initiator;
    this._network = options.network;
    this._owner = options.owner;
    this._percentage = options.percentage;
    this._script = buildPlutusScript(options.owner, options.percentage);
    this._signer = options.signer;
    this._submitter = options.submitter;
  }

  async delistAsset(address: string, asset: string, price: number) {
    const { policyId, assetName } = parseAssetUnit(asset);
    const tx = await this.buildTx();

    const datum = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(address),
        price, policyId, assetName,
      ],
    };

    const redeemer = {
      data: {
        alternative: 1,
        fields: []
      }
    };

    const assetUTxO = await this.findUTxO(
      resolvePlutusScriptAddress(this._script, this._network === 'mainnet' ? 1 : 0),
      asset, resolveDataHash(datum),
    );

    tx
      .redeemValue({
        value: assetUTxO,
        script: this._script,
        datum, redeemer,
      })
      .sendValue(address, assetUTxO)
      .setRequiredSigners([address]);

    const unsignedTx = await tx.build();
    const signedTx = await this._signer.signTx(unsignedTx, true);
    return this._submitter.submitTx(signedTx);
  }

  async listAsset(address: string, asset: string, price: number) {
    const { policyId, assetName } = parseAssetUnit(asset);
    const tx = await this.buildTx();

    const datum = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(address),
        price, policyId, assetName,
      ],
    };

    tx.sendAssets(
      {
        address: resolvePlutusScriptAddress(this._script, this._network === 'mainnet' ? 1 : 0),
        datum: { value: datum },
      },
      [
        {
          unit: asset,
          quantity: '1',
        },
      ]
    );

    const unsignedTx = await tx.build();
    const signedTx = await this._signer.signTx(unsignedTx, false);
    return this._submitter.submitTx(signedTx);
  }

  async purchaseAsset(address: string, asset: string, price: number) {
    const { policyId, assetName } = parseAssetUnit(asset);
    const tx = await this.buildTx();

    const datum = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(address),
        price, policyId, assetName,
      ],
    };

    const redeemer = {
      data: {
        alternative: 0,
        fields: []
      }
    };

    const assetUTxO = await this.findUTxO(
      resolvePlutusScriptAddress(this._script, this._network === 'mainnet' ? 1 : 0),
      asset, resolveDataHash(datum),
    );

    const buyerAddress = await this._initiator.getUsedAddress();

    const { marketFees } = this.splitAmount(price);

    tx
      .redeemValue({
        value: assetUTxO,
        script: this._script,
        datum, redeemer,
      })
      .sendValue(buyerAddress.to_bech32(), assetUTxO)
      .sendLovelace(address, price.toString())
      .sendLovelace(this._owner, marketFees.toString())

    const unsignedTx = await tx.build();
    const signedTx = await this._signer.signTx(unsignedTx, true);
    return this._submitter.submitTx(signedTx);
  }

  async relistAsset(address: string, asset: string, oldPrice: number, newPrice: number) {
    const { policyId, assetName } = parseAssetUnit(asset);
    const tx = await this.buildTx();

    const datum = {
      alternative: 0,
      fields: [
        resolvePaymentKeyHash(address),
        oldPrice, policyId, assetName,
      ],
    };

    const redeemer = {
      data: {
        alternative: 1,
        fields: []
      }
    };

    const assetUTxO = await this.findUTxO(
      resolvePlutusScriptAddress(this._script, this._network === 'mainnet' ? 1 : 0),
      asset, resolveDataHash(datum),
    );

    tx
      .redeemValue({
        value: assetUTxO,
        script: this._script,
        datum, redeemer,
      })
      .sendAssets(
        {
          address: resolvePlutusScriptAddress(this._script, this._network === 'mainnet' ? 1 : 0),
          datum: {
            value: {
              alternative: 0,
              fields: [
                resolvePaymentKeyHash(address),
                newPrice, policyId, assetName,
              ],
            }
          },
        },
        [
          {
            unit: asset,
            quantity: '1',
          },
        ]
      )
      .setRequiredSigners([address]);

    const unsignedTx = await tx.build();
    const signedTx = await this._signer.signTx(unsignedTx, true);
    return this._submitter.submitTx(signedTx);
  }

  private async buildTx() {
    const epoch = resolveEpochNo(this._network);
    const parameters = await this._fetcher.fetchProtocolParameters(epoch);

    return new Transaction({
      initiator: this._initiator,
      parameters,
    });
  }

  private async findUTxO(address: string, assetId: string, dataHash: string) {
    const utxos = await this._fetcher.fetchAddressUTxOs(
      address,
      assetId,
    );

    if (utxos.length === 0) {
      throw new Error(`No listing found for asset with Id: ${assetId}`);
    }

    const utxo: UTxO | undefined = utxos.find(
      (utxo) => utxo.output.dataHash === dataHash
    );

    if (utxo === undefined) {
      throw new Error(`No listing found for asset with Hash: ${dataHash}`);
    }

    return utxo;
  }

  private splitAmount(price: number) {
    const minFees = 1_000_000;
    const marketFees = Math.max((this._percentage / 1_000_000) * price, minFees);
    const netPrice = price - marketFees;
    
    return { marketFees, netPrice };
  };
}

type CreateMarketplaceOptions = {
  percentage: number;
  initiator: IInitiator;
  submitter: ISubmitter;
  owner: OwnerAddress;
  fetcher: IFetcher;
  network: Network;
  signer: ISigner;
}
