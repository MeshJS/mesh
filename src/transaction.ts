import { Blockfrost } from "./provider/blockfrost.js";
import { MIN_ADA_REQUIRED, ADA_BUFFER_REQUIRED } from "./global.js";
import {
  toHex,
  StringToBigNum,
  StringToAddress,
  utxoFromJson,
  assetsToValue,
} from "./utils/converter.js";
import SerializationLib from "./provider/serializationlib.js";
import { Wallet } from "./wallet.js";
import { MakeTxError } from "./global.js";

export class Transaction {
  private _blockfrost: Blockfrost;
  private wallet: Wallet;

  constructor({ wallet }: { wallet: Wallet }) {
    this.wallet = wallet;
  }

  private async _getTxBuilderConfig() {
    const protocolParameters =
      await this._blockfrost.epochsLatestEpochProtocolParameters();

    let txBuilderConfig =
      SerializationLib.Instance.TransactionBuilderConfigBuilder.new()
        .coins_per_utxo_word(
          SerializationLib.Instance.BigNum.from_str(
            protocolParameters.coins_per_utxo_word
          )
        )
        .fee_algo(
          SerializationLib.Instance.LinearFee.new(
            SerializationLib.Instance.BigNum.from_str(
              protocolParameters.min_fee_a.toString()
            ),
            SerializationLib.Instance.BigNum.from_str(
              protocolParameters.min_fee_b.toString()
            )
          )
        )
        .key_deposit(
          SerializationLib.Instance.BigNum.from_str(
            protocolParameters.key_deposit
          )
        )
        .pool_deposit(
          SerializationLib.Instance.BigNum.from_str(
            protocolParameters.pool_deposit
          )
        )
        .max_tx_size(protocolParameters.max_tx_size)
        .max_value_size(parseInt(protocolParameters.max_val_size))
        // .prefer_pure_change(true)
        .build();

    return txBuilderConfig;
  }

  // TODO: can we filter UTXOs to only those that needed by inputs
  private async _addInputUtxo({ txBuilder }) {
    const utxos = await this.wallet.getUtxos();

    if (utxos === undefined) {
      throw "No utxos";
    }

    const coreUtxos = SerializationLib.Instance.TransactionUnspentOutputs.new();
    utxos.forEach((utxo) => {
      coreUtxos.add(
        SerializationLib.Instance.TransactionUnspentOutput.from_bytes(
          Buffer.from(utxo, "hex")
        )
      );
    });
    txBuilder.add_inputs_from(coreUtxos, 0);
  }

  private async _addPaymentAda({
    txBuilder,
    address,
    lovelace,
  }: {
    txBuilder: any;
    address: any;
    lovelace: number;
  }) {
    txBuilder.add_output(
      SerializationLib.Instance.TransactionOutput.new(
        address,
        SerializationLib.Instance.Value.new(StringToBigNum(lovelace.toString()))
      )
    );
  }

  // async _addPaymentAssets({ txBuilder }) {}
  // async _complete({ txBuilder }) {}

  async new({
    outputs,
    blockfrostApiKey,
    network,
  }: {
    outputs: {
      address: string;
      assets: {
        [assetId: string]: number;
      };
    }[];
    blockfrostApiKey: string;
    network: number;
  }): Promise<string> {
    // start: init
    this._blockfrost = new Blockfrost();
    await this._blockfrost.init({ blockfrostApiKey, network });

    const paymentAddress = await this.wallet.getWalletAddress();

    const txBuilder = SerializationLib.Instance.TransactionBuilder.new(
      await this._getTxBuilderConfig()
    );
    // end: init

    // add utxo
    await this._addInputUtxo({ txBuilder });

    // add outputs
    await Promise.all(
      outputs.map(async (output, i) => {
        await Promise.all(
          Object.keys(output.assets).map(async (assetId, j) => {
            if (assetId === "lovelace") {
              if (output.assets[assetId] < MIN_ADA_REQUIRED) {
                throw MakeTxError.LovelaceTooLittle;
              }
              await this._addPaymentAda({
                txBuilder,
                address: StringToAddress(output.address),
                lovelace: output.assets[assetId],
              });
            }
          })
        );
      })
    );

    // add change
    txBuilder.add_change_if_needed(StringToAddress(paymentAddress));

    const txBody = txBuilder.build();

    const witnesses = SerializationLib.Instance.TransactionWitnessSet.new();

    const transaction = SerializationLib.Instance.Transaction.new(
      txBody,
      witnesses,
      undefined // transaction metadata
    );

    const transactionBytes = transaction.to_bytes();
    const transactionHex = toHex(transactionBytes);
    return transactionHex;
  }

  /**
   * @param address
   * @param lovelace
   * @returns
   */
  // async makeTransaction({
  //   paymentAddress,
  //   recipientAddress,
  //   lovelace = 1000000,
  // }: {
  //   paymentAddress: string;
  //   recipientAddress: string;
  //   lovelace: number;
  // }): Promise<string> {
  //   if (lovelace < MIN_ADA_REQUIRED) {
  //     throw "Lovelace must be greater than 1000000";
  //   }

  //   const txBuilder = SerializationLib.Instance.TransactionBuilder.new(
  //     await this._getTxBuilderConfig()
  //   );

  //   await this._addInputUtxo({ txBuilder });

  //   await this._addPaymentAda({
  //     txBuilder,
  //     address: StringToAddress(recipientAddress),
  //     lovelace: lovelace,
  //   });

  //   txBuilder.add_change_if_needed(StringToAddress(paymentAddress));

  //   const txBody = txBuilder.build();

  //   const witnesses = SerializationLib.Instance.TransactionWitnessSet.new();

  //   const transaction = SerializationLib.Instance.Transaction.new(
  //     txBody,
  //     witnesses,
  //     undefined // transaction metadata
  //   );

  //   const transactionBytes = transaction.to_bytes();
  //   const transactionHex = toHex(transactionBytes);
  //   return transactionHex;
  // }

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
  async makeTransactionWIP({
    inputs,
    outputs,
    blockfrostApiKey,
    network,
  }: {
    inputs: {
      address: string | string[];
      assets: {
        [assetId: string]: number;
      };
    }[];
    outputs: {
      address: string;
      assets: {
        [assetId: string]: number;
      };
    }[];
    blockfrostApiKey: string;
    network: number;
  }): Promise<string> {
    console.log("makeTransaction", { inputs, outputs });

    // start: set input address to address[]
    inputs.map((input, i) => {
      if (!Array.isArray(input.address)) {
        input.address = [input.address];
      }
    });
    // end: set input address to address[]

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
          throw MakeTxError.InputNotEqualOutput;
        }
        totalAssets[assetId] -= thisOutput.assets[assetId];
        if (totalAssets[assetId] == 0) {
          delete totalAssets[assetId];
        }
      }
    }
    if (Object.keys(totalAssets).length > 0) {
      throw MakeTxError.InputNotEqualOutput;
    }
    // end: check if inputs and outputs are equal

    // start: init blockfrost
    this._blockfrost = new Blockfrost();
    await this._blockfrost.init({ blockfrostApiKey, network });
    // end: init blockfrost

    let selectedUtxos = [];
    let ownerAddresses = await this.wallet.getUsedAddresses();

    // start: check if UTXOs has those inputs and select UTXOs
    for (let i = 0; i < inputs.length; i++) {
      // for each payer, these are the assets we need to find
      let thisInput = inputs[i];
      let assetsToFind = { ...thisInput.assets };

      // lets add some ADA buffer
      if (!("lovelace" in assetsToFind)) {
        assetsToFind.lovelace = 0;
      }
      assetsToFind.lovelace += ADA_BUFFER_REQUIRED;

      // select UTXOs from all inputs addresses
      thisInput.address = thisInput.address as Array<string>;
      await Promise.all(
        thisInput.address
          .filter(function (address) {
            return address.length === 108;
          })
          .map(async (address, j) => {
            // get UTXOs
            let utxos = await this._blockfrost.addressesAddressUtxos({
              address: address,
            });

            // convert quantity to int
            // convert from amount in list to dict
            utxos.map((utxo, j) => {
              let newAmount = {};

              // @ts-ignore
              utxo.amount.map((asset, i) => {
                asset.quantity = parseInt(asset.quantity);
                newAmount[asset.unit] = asset.quantity;
              });

              // @ts-ignore
              utxo.amount = newAmount;
            });

            for (let j = 0; j < utxos.length; j++) {
              let addThisUtxo = false;
              let thisUtxo = utxos[j];
              // @ts-ignore
              let thisUtxoAmount = thisUtxo.amount;
              // for (let k = 0; k < thisUtxoAmount.length; k++) {
              // let thisAsset = thisUtxoAmount[k];
              // let assetId = thisAsset.unit;
              for (let assetId in thisUtxoAmount) {
                let thisAsset = thisUtxoAmount[assetId];

                if (
                  assetId === "lovelace" &&
                  thisAsset.quantity < ADA_BUFFER_REQUIRED
                ) {
                  continue;
                }

                if (assetId in assetsToFind) {
                  if (assetsToFind[assetId] > 0) {
                    assetsToFind[assetId] -= thisAsset.quantity;
                    addThisUtxo = true;
                  }
                }
              }
              if (addThisUtxo) {
                // @ts-ignore
                thisUtxo.address = address;
                // @ts-ignore
                thisUtxo.isOwner = ownerAddresses.includes(address);
                selectedUtxos.push(thisUtxo);
              }
            }
          })
      );

      Object.keys(assetsToFind).map((assetId, j) => {
        if (assetsToFind[assetId] > 0) {
          throw MakeTxError.NotEnoughAssetsInput;
        }
      });
    }
    // end: check if UTXOs has those inputs and select UTXOs

    console.log("selectedUtxos", selectedUtxos);

    // start: make the tx

    const txBuilder = SerializationLib.Instance.TransactionBuilder.new(
      await this._getTxBuilderConfig()
    );

    // inputs add UTXOs
    await Promise.all(
      selectedUtxos.map(async (utxo, i) => {
        console.log(222, utxo);
        // @ts-ignore
        let transactionUnspentOutput = await utxoFromJson(utxo, utxo.address);
        console.log(111, transactionUnspentOutput);
        txBuilder.add_inputs_from(transactionUnspentOutput);
      })
    );

    // outputs add ADA
    outputs.map((output, i) => {
      Object.keys(output.assets).map((assetId, j) => {
        if (assetId === "lovelace") {
          this._addPaymentAda({
            txBuilder,
            address: output.address,
            lovelace: output.assets[assetId],
          });
        }
      });
    });

    // TODO: those utxos of each inputs, if has excess, need to create outputs for these

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
        filterValue = SerializationLib.Instance.Value.from_bytes(
          Buffer.from(amount, "hex")
        );
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
