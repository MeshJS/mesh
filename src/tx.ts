// import {
//   BigNum,
//   Value,
//   Address,
//   TransactionUnspentOutput,
//   TransactionOutput,
//   TransactionBuilder,
//   TransactionBuilderConfigBuilder,
//   LinearFee,
//   TransactionUnspentOutputs,
//   Transaction,
//   TransactionWitnessSet,
// } from "@emurgo/cardano-serialization-lib-browser";

import { Blockfrost } from "./provider/blockfrost.js";
import { Core } from "./core.js";
import { MIN_ADA_REQUIRED, ADA_BUFFER_REQUIRED } from "./global.js";
import {
  toHex,
  StringToBigNum,
  StringToAddress,
  utxoFromJson,
} from "./utils/converter.js";

export class Tx {
  private _blockfrost: Blockfrost;
  private _core: Core;
  private _cardano; // Serialization Lib

  constructor({
    blockfrost,
    core,
    cardano,
  }: {
    blockfrost: Blockfrost;
    core: Core;
    cardano: any;
  }) {
    this._blockfrost = blockfrost;
    this._core = core;
    this._cardano = cardano;
  }

  async _getTxBuilderConfig() {
    const protocolParameters =
      await this._blockfrost.epochsLatestEpochProtocolParameters();

    let txBuilderConfig = this._cardano.TransactionBuilderConfigBuilder.new()
      .coins_per_utxo_word(
        this._cardano.BigNum.from_str(protocolParameters.coins_per_utxo_word)
      )
      .fee_algo(
        this._cardano.LinearFee.new(
          this._cardano.BigNum.from_str(protocolParameters.min_fee_a.toString()),
          this._cardano.BigNum.from_str(protocolParameters.min_fee_b.toString())
        )
      )
      .key_deposit(this._cardano.BigNum.from_str(protocolParameters.key_deposit))
      .pool_deposit(this._cardano.BigNum.from_str(protocolParameters.pool_deposit))
      .max_tx_size(protocolParameters.max_tx_size)
      .max_value_size(parseInt(protocolParameters.max_val_size))
      // .prefer_pure_change(true)
      .build();

    return txBuilderConfig;
  }

  // TODO: can we filter UTXOs to only those that needed by inputs
  async _addInputUtxo({ txBuilder }) {
    const utxos = await this._core.getUtxos();

    if (utxos === undefined) {
      throw "No utxos";
    }

    const coreUtxos = this._cardano.TransactionUnspentOutputs.new();
    utxos.forEach((utxo) => {
      coreUtxos.add(
        this._cardano.TransactionUnspentOutput.from_bytes(Buffer.from(utxo, "hex"))
      );
    });
    txBuilder.add_inputs_from(coreUtxos, 0);
  }

  async _addPaymentAda({
    txBuilder,
    address,
    lovelace,
  }: {
    txBuilder: any;
    address: any;
    lovelace: number;
  }) {
    txBuilder.add_output(
      this._cardano.TransactionOutput.new(
        address,
        this._cardano.Value.new(StringToBigNum(lovelace.toString()))
      )
    );
  }

  // async _addPaymentAssets({ txBuilder }) {}
  // async _complete({ txBuilder }) {}

  /**
   * baby steps, lets send ADA, from one wallet, to one wallet
   * @param address
   * @param lovelace
   * @returns
   */
  async makeSimpleTransaction({
    paymentAddress,
    recipientAddress,
    lovelace = 1000000,
  }: {
    paymentAddress: string;
    recipientAddress: string;
    lovelace: number;
  }): Promise<string> {
    if (lovelace < MIN_ADA_REQUIRED) {
      throw "Lovelace must be greater than 1000000";
    }

    const txBuilder = this._cardano.TransactionBuilder.new(await this._getTxBuilderConfig());

    await this._addInputUtxo({ txBuilder });

    await this._addPaymentAda({
      txBuilder,
      address: StringToAddress(recipientAddress),
      lovelace: lovelace,
    });

    txBuilder.add_change_if_needed(StringToAddress(paymentAddress));

    const txBody = txBuilder.build();

    const witnesses = this._cardano.TransactionWitnessSet.new();

    const transaction = this._cardano.Transaction.new(
      txBody,
      witnesses,
      undefined // transaction metadata
    );

    const transactionBytes = transaction.to_bytes();
    const transactionHex = toHex(transactionBytes);
    return transactionHex;
  }

  /**
   * Create a transaction based on the inputs and outputs provided.
   * @param inputs
   * @param outputs
   * @returns Transaction in CBOR string
   *
   * @example
   * To send ADA from one wallet to another
   * ```ts
   * const tx = await Mesh.makeTransaction({
   *   inputs: [
   *     {
   *       address: "addr_test1qqwk2r75gu5e56zawmdp2pk8x74l5wbandqaw7d0t5ag9us9kqxxhxdp82mrwmfud2rffkk87ufxh25qu08xj5z6qlgsxv2vgg",
   *       assets: {
   *         lovelace: 1500000,
   *       },
   *     },
   *   ],
   *   outputs: [
   *     {
   *       address: "addr_test1aawk2r75gu5e56zawmdp2pk8x74l5wbandqaw7d0t5ag9us9kqxxhxdp82mrwmfud2rffkk87ufxh25qu08xj5z6qlgshs7c8s",
   *       assets: {
   *         lovelace: 1500000,
   *       },
   *     },
   *   ],
   * });
   * ```
   *
   * To send ADA and assets from one wallet to multiple wallets
   * ```ts
   * const tx = await Mesh.makeTransaction({
   *   inputs: [
   *     {
   *       address: "addr_test1qqwk2r75gu5e56zawmdp2pk8x74l5wbandqaw7d0t5ag9us9kqxxhxdp82mrwmfud2rffkk87ufxh25qu08xj5z6qlgsxv2vgg",
   *       assets: {
   *         lovelace: 3000000,
   *         PixelHead001: 1,
   *         PixelHead005: 1,
   *       },
   *     },
   *   ],
   *   outputs: [
   *     {
   *       address: "addr_test1aawk2r75gu5e56zawmdp2pk8x74l5wbandqaw7d0t5ag9us9kqxxhxdp82mrwmfud2rffkk87ufxh25qu08xj5z6qlgshs7c8sy",
   *       assets: {
   *         lovelace: 1000000,
   *         PixelHead001: 1,
   *       },
   *     },
   *     {
   *       address: "addr_test1chsd7chds7zawmdp2pk8x74l5wbandqaw7d0t5ag9us9kqxxhxdp82mrwmfud2rffkk87ufxh25qu08xj5z6qlgshs7c8s1t6va",
   *       assets: {
   *         lovelace: 2000000,
   *         PixelHead005: 1,
   *       },
   *     },
   *   ],
   * });
   * ```
   *
   * Multi-signature transaction. To send ADA and assets from multiple wallet to multiple wallets
   * ```ts
   * const tx = await Mesh.makeTransaction({
   *   inputs: [
   *     {
   *       address: "addr_test1qqwk2r75gu5e56zawmdp2pk8x74l5wbandqaw7d0t5ag9us9kqxxhxdp82mrwmfud2rffkk87ufxh25qu08xj5z6qlgsxv2vgg",
   *       assets: {
   *         lovelace: 2000000,
   *         PixelHead001: 1,
   *         Pixos: 10,
   *       },
   *     },
   *     {
   *       address: "addr_test1d7hf8dfd56zawmdp2pk8x74l5wbandqaw7d0t5ag9us9kqxxhxdp82mrwmfud2rffkk87ufxh25qu08xj5z6qlgsx2rf263fsf",
   *       assets: {
   *         lovelace: 4000000,
   *         PixelHead005: 1,
   *       },
   *     },
   *   ],
   *   outputs: [
   *     {
   *       address: "addr_test1aawk2r75gu5e56zawmdp2pk8x74l5wbandqaw7d0t5ag9us9kqxxhxdp82mrwmfud2rffkk87ufxh25qu08xj5z6qlgshs7c8s3",
   *       assets: {
   *         lovelace: 3000000,
   *         PixelHead001: 1,
   *         Pixos: 5,
   *       },
   *     },
   *     {
   *       address: "addr_test1chsd7chds7zawmdp2pk8x74l5wbandqaw7d0t5ag9us9kqxxhxdp82mrwmfud2rffkk87ufxh25qu08xj5z6qlgshs7c8s1t6v3",
   *       assets: {
   *         lovelace: 3000000,
   *         PixelHead005: 1,
   *         Pixos: 5,
   *       },
   *     },
   *   ],
   * });
   * ```
   */
  async makeTransaction({
    inputs,
    outputs,
  }: {
    inputs: [
      {
        address: string;
        assets: {
          [assetId: string]: number;
        };
      }
    ];
    outputs: [
      {
        address: string;
        assets: {
          [assetId: string]: number;
        };
      }
    ];
  }): Promise<string> {
    console.log("makeTransaction", { inputs, outputs });

    // start: check if inputs and outputs are equal
    let totalAssets = {};
    for (let i = 0; i < inputs.length; i++) {
      let thisInput = inputs[i];
      for (let assetId in thisInput.assets) {
        if (!(assetId in totalAssets)) {
          totalAssets[assetId] = 0;
        }
        totalAssets[assetId] += thisInput.assets[assetId];
      }
    }
    for (let i = 0; i < outputs.length; i++) {
      let thisOutput = outputs[i];
      for (let assetId in thisOutput.assets) {
        if (!(assetId in totalAssets)) {
          throw "Input not equal to output";
        }
        totalAssets[assetId] -= thisOutput.assets[assetId];
        if (totalAssets[assetId] == 0) {
          delete totalAssets[assetId];
        }
      }
    }
    if (Object.keys(totalAssets).length > 0) {
      throw "Input not equal to output";
    }
    // end: check if inputs and outputs are equal

    // let walletAddress = await this._core.getWalletAddress();

    // start: check if UTXOs has those inputs
    for (let i = 0; i < inputs.length; i++) {
      // for each payer, these are the assets we need to find
      let thisInput = inputs[i];
      let assetsToFind = { ...thisInput.assets };

      // lets add some ADA buffer
      if (!("lovelace" in assetsToFind)) {
        assetsToFind.lovelace = 0;
      }
      assetsToFind.lovelace += ADA_BUFFER_REQUIRED;

      console.log("assetsToFind", assetsToFind);
      let selectedUtxos = [];

      let utxo = await this._blockfrost.addressesAddressUtxos({
        address: thisInput.address,
      });
      console.log("utxo", thisInput.address, utxo);

      for (let j = 0; j < utxo.length; j++) {
        let addThisUtxo = false;
        let thisUtxo = utxo[j];
        // @ts-ignore
        let thisUtxoAmount = thisUtxo.amount;
        for (let k = 0; k < thisUtxoAmount.length; k++) {
          let thisAsset = thisUtxoAmount[k];
          let assetId = thisAsset.unit;
          if (assetId in assetsToFind) {
            if (assetsToFind[assetId] > 0) {
              let quantity = parseInt(thisAsset.quantity);
              assetsToFind[assetId] -= quantity;
              addThisUtxo = true;
            }
          }
        }
        if (addThisUtxo) {
          selectedUtxos.push(thisUtxo);
        }
      }

      console.log("selectedUtxos", selectedUtxos);
      console.log("assetsToFind after", assetsToFind);
    }

    // make the tx

    // todos: those utxos of each inputs, if has excess, need to create outputs for these

    // const thisWalletInputsAssets = inputs.filter(function (input) {
    //   return input.address === walletAddress;
    // });

    // const thisWalletOutputsAssets = outputs.filter(function (input) {
    //   return input.address === walletAddress;
    // });

    // console.log("thisWalletInputsAssets", thisWalletInputsAssets);
    // console.log("thisWalletOutputsAssets", thisWalletOutputsAssets);

    // const txBuilder = TransactionBuilder.new(await this._getTxBuilderConfig());

    // // if this wallet has inputs
    // if (thisWalletInputsAssets.length > 0) {
    //   await this._addInputUtxo({ txBuilder });
    // }

    // for (let i = 0; i < outputs.length; i++) {
    //   let thisOutput = outputs[i];
    //   if ("lovelace" in thisOutput.assets) {
    //     await this._addPaymentAda({
    //       txBuilder,
    //       address: StringToAddress(thisOutput.address),
    //       lovelace: thisOutput.assets.lovelace,
    //     });
    //   }
    // }

    // TODO how to do change? if my wallet UTXO has 100 ADA, and only need to send 5, make output 95 ADA?

    return "";
  }

  async getUtxos(address, amount = undefined) {
    let result = [];
    let page = 1;
    while (true) {
      let pageResult = await this._blockfrost.addressesAddressUtxos({
        address,
        page,
      });
      // if (pageResult.error) {
      //   if (result.status_code === 400) throw APIError.InvalidRequest;
      //   else if (result.status_code === 500) throw APIError.InternalError;
      //   else {
      //     pageResult = [];
      //   }
      // }
      result = result.concat(pageResult);
      if (pageResult.length <= 0) break;
      page++;
    }

    // TODO: exclude collateral input from overall utxo set
    // if (currentAccount.collateral) {
    //   result = result.filter(
    //     (utxo) =>
    //       !(
    //         utxo.tx_hash === currentAccount.collateral.txHash &&
    //         utxo.output_index === currentAccount.collateral.txId
    //       )
    //   );
    // }

    let converted = await Promise.all(
      result.map(
        async (utxo) => await utxoFromJson(utxo, StringToAddress(address))
      )
    );
    // filter utxos
    if (amount) {
      let filterValue;
      try {
        filterValue = this._cardano.Value.from_bytes(Buffer.from(amount, "hex"));
      } catch (e) {
        throw "InvalidRequest";
      }

      converted = converted.filter(
        (unspent) =>
          !unspent.output().amount().compare(filterValue) ||
          unspent.output().amount().compare(filterValue) !== -1
      );
    }
    if (amount && converted.length <= 0) {
      return null;
    }
    return converted;
  }
}
