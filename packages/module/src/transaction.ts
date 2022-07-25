import { Blockfrost } from './provider/blockfrost';
import { MIN_ADA_REQUIRED_WITH_ASSETS } from './global';
import { toHex, StringToAddress, toLovelace } from './utils/converter';
import SerializationLib from './core';
import { Wallet } from './wallet';
import { MakeTxError } from './global';
import { Recipient, UTxO } from './types';

export class Transaction {
  private _blockfrost: Blockfrost;
  private wallet: Wallet;

  constructor({ wallet }: { wallet: Wallet }) {
    this.wallet = wallet;
    this._blockfrost = new Blockfrost();
  }

  private async _getTxBuilderConfig() {
    const protocolParameters =
      await this._blockfrost.epochsLatestEpochProtocolParameters();

    let txBuilderConfig = SerializationLib.TransactionBuilderConfigBuilder.new()
      .coins_per_utxo_word(
        SerializationLib.BigNum.from_str(protocolParameters.coins_per_utxo_word)
      )
      .fee_algo(
        SerializationLib.LinearFee.new(
          SerializationLib.BigNum.from_str(
            protocolParameters.min_fee_a.toString()
          ),
          SerializationLib.BigNum.from_str(
            protocolParameters.min_fee_b.toString()
          )
        )
      )
      .key_deposit(
        SerializationLib.BigNum.from_str(protocolParameters.key_deposit)
      )
      .pool_deposit(
        SerializationLib.BigNum.from_str(protocolParameters.pool_deposit)
      )
      .max_tx_size(protocolParameters.max_tx_size)
      .max_value_size(parseInt(protocolParameters.max_val_size))
      .build();

    return txBuilderConfig;
  }

  private async _buildTransaction({ txBuilder }: { txBuilder: any }) {
    const txBody = txBuilder.build();
    const witnesses = SerializationLib.TransactionWitnessSet.new();
    const transaction = SerializationLib.Transaction.new(txBody, witnesses);
    const transactionBytes = transaction.to_bytes();
    const transactionHex = toHex(transactionBytes);
    return transactionHex;
  }

  private async _addChange({
    txBuilder,
    changeAddress,
  }: {
    txBuilder: any;
    changeAddress: undefined | string;
  }) {
    if (changeAddress == undefined) {
      changeAddress = await this.wallet.getWalletAddress();
    }
    txBuilder.add_change_if_needed(StringToAddress(changeAddress));
  }

  private async _addMetadata({ txBuilder, metadata }) {
    const auxData = SerializationLib.AuxiliaryData.new();
    const generalMetadata = SerializationLib.GeneralTransactionMetadata.new();
    generalMetadata.insert(
      SerializationLib.BigNum.from_str('100'),
      SerializationLib.encode_json_str_to_metadatum(JSON.stringify(metadata), 1)
    );
    auxData.set_metadata(generalMetadata);
    txBuilder.set_auxiliary_data(auxData);
  }

  // helper function to sort the 2nd item in array
  private _sortDescendingArray(array: any[][]) {
    array.sort(function (i, j) {
      return (j[1] as number) - (i[1] as number);
    });
  }

  private _selectUtxosForLovelace({
    utxosContainLovelaceArray,
    remainingLovelace,
  }: {
    utxosContainLovelaceArray: (string | number)[][];
    remainingLovelace: number;
  }) {
    let chosenUtxoCborStringList: string[] = [];

    this._sortDescendingArray(utxosContainLovelaceArray);

    for (let u of utxosContainLovelaceArray) {
      let cbor = u[0] as string;
      let amountLovelace = u[1] as number;
      chosenUtxoCborStringList.push(cbor);
      remainingLovelace -= amountLovelace;
      if (remainingLovelace < 0) {
        break;
      }
    }

    return { chosenUtxoCborStringList, remainingLovelace };
  }

  /**
   * todos:
   * get enough lovelace for fees, instead of hardcoded
   * get enough lovelace for attached assets, instead of hardcoded
   * improve: lets try to find the largest lovelace/asset utxo just enough to fulfill tx, instead of picking the largest
   */

  private async selectUtxoInputs({ outputs }: { outputs: Recipient[] }) {
    const _debug = false;
    let chosenUtxoCborStringList: string[] = []; // to return and to stop repeated utxo selected
    let remainingLovelace = 0; // to track lovelace
    let remainingAssets: { [assetId: string]: number } = {}; // to track assets
    let utxoDictByCborKeys: { [cbor: string]: UTxO } = {}; // for quick look up

    /**
     * 1. prepare
     */
    const utxos = await this.wallet.getUtxos();

    for (const output of outputs) {
      for (let assetId in output.assets) {
        if (assetId === 'lovelace') {
          remainingLovelace += output.assets[assetId];
        } else {
          if (!(assetId in remainingAssets)) {
            remainingAssets[assetId] = 0;
          }
          remainingAssets[assetId] += output.assets[assetId];
          remainingLovelace += toLovelace(2); // todo: attached ADA for assets is hardcoded
        }
      }
    }

    for (const utxo of utxos) {
      utxoDictByCborKeys[utxo.cbor] = utxo;
    }

    remainingLovelace += toLovelace(1); // todo: hardcoded for fees

    if (_debug) {
      console.log('utxos', utxos);
      console.log('assets requirements', remainingLovelace, remainingAssets);
    }

    /**
     * 2. add assets UTXOs
     */

    // 2a. for each assets in remainingAssets, lets look for their utxos
    for (const assetId in remainingAssets) {
      if (remainingAssets[assetId] > 0) {
        let utxosContainAsset = utxos
          .filter(function (utxo) {
            return (
              !chosenUtxoCborStringList.includes(utxo.cbor) &&
              assetId in utxo.assets
            );
          })
          .map((utxo) => {
            return [utxo.cbor, utxo.assets[assetId], utxo];
          });

        this._sortDescendingArray(utxosContainAsset);

        for (let u of utxosContainAsset) {
          let cbor = u[0] as string;
          let quantity = u[1] as number;
          let utxo = u[2] as UTxO;

          remainingAssets[assetId] -= quantity;
          chosenUtxoCborStringList.push(cbor);
          remainingLovelace -= utxo.assets.lovelace;
          if (remainingAssets[assetId] <= 0) {
            break;
          }
        }
      }
    }

    if (_debug) {
      console.log('-------');
      console.log(
        'after assets selection',
        utxos.filter(function (utxo) {
          return chosenUtxoCborStringList.includes(utxo.cbor);
        })
      );
      console.log('assets remaining', remainingLovelace, remainingAssets);
    }

    // 2b. if not enough to fulfill remainingAssets, throw error
    for (const assetId in remainingAssets) {
      if (remainingAssets[assetId] > 0) {
        throw MakeTxError.NotEnoughAssetsInput;
      }
    }

    /**
     * 3. add lovelace UTXOs
     */
    if (remainingLovelace > 0) {
      // 3a. lets try to find utxos that has only lovelace
      let utxosContainLovelace = utxos
        .filter(function (utxo) {
          return (
            !chosenUtxoCborStringList.includes(utxo.cbor) &&
            Object.keys(utxo.assets).length === 1
          );
        })
        .map((utxo) => {
          return [utxo.cbor, utxo.assets.lovelace];
        });

      let selectedLovelaceUtxos = this._selectUtxosForLovelace({
        utxosContainLovelaceArray: utxosContainLovelace,
        remainingLovelace,
      });

      if (_debug) {
        console.log('-------');
        console.log(
          'after lovelace selection step 1',
          utxos.filter(function (utxo) {
            return selectedLovelaceUtxos.chosenUtxoCborStringList.includes(
              utxo.cbor
            );
          })
        );
        console.log(
          'assets remaining',
          selectedLovelaceUtxos.remainingLovelace
        );
      }

      // 3b. if cant find any or cant find enough lovelace, lets include utxos that also has assets
      if (selectedLovelaceUtxos.remainingLovelace > 0) {
        let utxosContainLovelace = utxos
          .filter(function (utxo) {
            return !chosenUtxoCborStringList.includes(utxo.cbor);
          })
          .map((utxo) => {
            return [utxo.cbor, utxo.assets.lovelace];
          });

        selectedLovelaceUtxos = this._selectUtxosForLovelace({
          utxosContainLovelaceArray: utxosContainLovelace,
          remainingLovelace,
        });

        if (_debug) {
          console.log('-------');
          console.log(
            'after lovelace selection step 2',
            utxos.filter(function (utxo) {
              return selectedLovelaceUtxos.chosenUtxoCborStringList.includes(
                utxo.cbor
              );
            })
          );
          console.log(
            'assets remaining',
            selectedLovelaceUtxos.remainingLovelace
          );
        }
      }

      // 3c. if still not enough lovelace to fulfill tx, throw error
      if (selectedLovelaceUtxos.remainingLovelace > 0) {
        throw MakeTxError.NotEnoughLovelaceInput;
      }

      // 3d. if all is well with lovelace
      chosenUtxoCborStringList.push.apply(
        chosenUtxoCborStringList,
        selectedLovelaceUtxos.chosenUtxoCborStringList
      );
      remainingLovelace = selectedLovelaceUtxos.remainingLovelace;
    }

    if (_debug) {
      console.log('-------');
      console.log(
        'final utxos selection',
        utxos.filter(function (utxo) {
          return chosenUtxoCborStringList.includes(utxo.cbor);
        })
      );
      console.log('assets remaining', remainingLovelace, remainingAssets);
    }

    return chosenUtxoCborStringList;
  }

  private async _addInputUtxo({
    // txBuilder,
    inputs,
    outputs,
  }: {
    // txBuilder: any;
    inputs: string[];
    outputs: Recipient[];
  }) {
    /**
     * Version 1, use serial lib built in coin selection
     */
    // // if no `inputs` provided, select all from wallet
    // if (inputs.length === 0) {
    //   inputs = (await this.wallet.getUtxos()) as string[];
    //   if (inputs === undefined) {
    //     throw 'No utxos';
    //   }
    // }
    // const coreUtxos = SerializationLib.TransactionUnspentOutputs.new();
    // inputs.forEach((utxo) => {
    //   coreUtxos.add(
    //     SerializationLib.TransactionUnspentOutput.from_bytes(
    //       Buffer.from(utxo, 'hex')
    //     )
    //   );
    // });
    // txBuilder.add_inputs_from(coreUtxos, 2); // this is bugged, the selected UTXO is bad, thus fail tx
    // end Version 1

    /**
     * Version 2, input all utxos in wallet or from the provided `inputs`
     * this works for the tx builder demo. but selecting every UTXOs in inputs is bad, thus need v3
     */
    // if (inputs.length === 0) {
    //   inputs = (await this.wallet.getUtxos()) as string[];
    //   if (inputs === undefined) {
    //     throw 'No utxos';
    //   }
    // }

    // console.log('_addInputUtxo inputs', inputs.length, inputs);
    // end Version 2

    /**
     * Version 3, lets build on own coin selection. use this if `inputs` is not provided
     */
    if (inputs.length === 0) {
      inputs = await this.selectUtxoInputs({ outputs });
    }
    // end Version 3

    /**
     * from the inputs, create TxInputsBuilder
     */
    let txInputsBuilder = SerializationLib.TxInputsBuilder.new();

    const utxos = inputs.map((utxo) => {
      return SerializationLib.TransactionUnspentOutput.from_bytes(
        Buffer.from(utxo, 'hex')
      );
    });

    utxos.forEach((utxo) => {
      txInputsBuilder.add_input(
        utxo.output().address(),
        utxo.input(),
        utxo.output().amount()
      );
    });

    return txInputsBuilder;
  }

  private _addPlutus({}) {}

  private _makeMultiAsset(assets: any) {
    const AssetsMap: any = {};
    for (const asset of assets) {
      const { unit, quantity } = asset;
      const [policy, assetName] = unit.split('.');

      if (!Array.isArray(AssetsMap[policy])) {
        AssetsMap[policy] = [];
      }
      AssetsMap[policy].push({
        unit: Buffer.from(assetName, 'ascii').toString('hex'),
        quantity,
      });
    }

    const multiAsset = SerializationLib.MultiAsset.new();

    for (const policy in AssetsMap) {
      const ScriptHash = SerializationLib.ScriptHash.from_bytes(
        Buffer.from(policy, 'hex')
      );
      const Assets = SerializationLib.Assets.new();

      const _assets = AssetsMap[policy];

      for (const asset of _assets) {
        const AssetName = SerializationLib.AssetName.new(
          Buffer.from(asset.unit, 'hex')
        );
        const BigNum = SerializationLib.BigNum.from_str(
          asset.quantity.toString()
        );
        Assets.insert(AssetName, BigNum);
      }

      multiAsset.insert(ScriptHash, Assets);
    }

    return multiAsset;
  }

  private async _addOutputs({ txBuilder, outputs }: any) {
    const txOutputs = SerializationLib.TransactionOutputs.new();

    outputs.map((output: any) => {
      if (output.address === undefined || output.address.length === 0) {
        throw MakeTxError.NoRecipientsAddress;
      }

      // add lovelace
      let amountLovelace =
        output.assets.lovelace &&
        output.assets.lovelace > MIN_ADA_REQUIRED_WITH_ASSETS
          ? output.assets.lovelace
          : MIN_ADA_REQUIRED_WITH_ASSETS; // TODO, cannot hardcode 2ADA. if too many assets, 2 ADA is not enough
      let outputValue = SerializationLib.Value.new(
        SerializationLib.BigNum.from_str(amountLovelace.toString())
      );

      let assets: {}[] = [];
      Object.keys(output.assets).map(async (assetId) => {
        if (assetId !== 'lovelace') {
          assets.push({
            unit: assetId,
            quantity: output.assets[assetId],
          });
        }
      });

      const multiAsset = this._makeMultiAsset(assets);
      outputValue.set_multiasset(multiAsset);

      txOutputs.add(
        SerializationLib.TransactionOutput.new(
          StringToAddress(output.address),
          outputValue
        )
      );
    });

    for (let i = 0; i < txOutputs.len(); i++) {
      txBuilder.add_output(txOutputs.get(i));
    }
  }

  async build({
    inputs = [],
    outputs,
    ttl,
    changeAddress,
    message,
    metadata,
    plutusScripts,
    blockfrostApiKey,
    network,
  }: {
    inputs?: string[]; // list of cbor strings, if provided, will use these utxos
    outputs: Recipient[];
    ttl?: number;
    changeAddress?: string;
    message?: string;
    metadata?: any;
    plutusScripts?: any;
    blockfrostApiKey: string;
    network: number;
  }): Promise<string> {
    // start: init
    this._blockfrost = new Blockfrost();
    await this._blockfrost.init({ blockfrostApiKey, network });

    const txBuilder = SerializationLib.TransactionBuilder.new(
      await this._getTxBuilderConfig()
    );
    // end: init

    if (ttl) {
      txBuilder.set_ttl(ttl);
    }

    // add inputs
    const txInputsBuilder = await this._addInputUtxo({ inputs, outputs });

    // add outputs
    await this._addOutputs({ txBuilder, outputs });

    // TODO: how to add message?
    if (message) {
    }

    // add metadata
    if (metadata) {
      await this._addMetadata({ txBuilder, metadata });
    }

    // add plutus
    if (plutusScripts) {
      await this._addPlutus({});
    }

    txBuilder.set_inputs(txInputsBuilder);

    // add change
    await this._addChange({ txBuilder, changeAddress });

    const transactionHex = await this._buildTransaction({ txBuilder });
    return transactionHex;
  }
}
