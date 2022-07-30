import { Blockfrost } from './provider/blockfrost';
import { MIN_ADA_REQUIRED_WITH_ASSETS } from './global';
import {
  assetsToValue,
  toHex,
  fromHex,
  StringToAddress,
  toLovelace,
  getAddressKeyHashHex,
  plutusDataToHex,
  fromFloat,
  getAddressKeyHash,
} from './utils/converter';
import { csl } from './core';
import { Wallet } from './wallet';
import { MakeTxError } from './global';
import { Recipient, UTxO } from './types';
import type { TransactionUnspentOutput } from './core';

export class Transaction {
  private _blockfrost: Blockfrost;
  private wallet: Wallet;
  private protocolParameters;

  constructor({ wallet }: { wallet: Wallet }) {
    this.wallet = wallet;
    this._blockfrost = new Blockfrost();
  }

  private async _getTxBuilderConfig() {
    this.protocolParameters =
      await this._blockfrost.epochsLatestEpochProtocolParameters();

    const {
      numerator: price_mem_numerator,
      denominator: price_mem_denominator,
    } = fromFloat(this.protocolParameters.price_mem.toString());

    const {
      numerator: price_step_numerator,
      denominator: price_step_denominator,
    } = fromFloat(this.protocolParameters.price_step.toString());

    let txBuilderConfig = csl.TransactionBuilderConfigBuilder.new()
      .coins_per_utxo_byte(
        csl.BigNum.from_str(this.protocolParameters.coins_per_utxo_word)
      )
      .fee_algo(
        csl.LinearFee.new(
          csl.BigNum.from_str(this.protocolParameters.min_fee_a.toString()),
          csl.BigNum.from_str(this.protocolParameters.min_fee_b.toString())
        )
      )
      .key_deposit(csl.BigNum.from_str(this.protocolParameters.key_deposit))
      .pool_deposit(csl.BigNum.from_str(this.protocolParameters.pool_deposit))
      .max_tx_size(this.protocolParameters.max_tx_size)
      .max_value_size(parseInt(this.protocolParameters.max_val_size))
      .ex_unit_prices(
        csl.ExUnitPrices.new(
          csl.UnitInterval.new(
            csl.BigNum.from_str(price_mem_numerator),
            csl.BigNum.from_str(price_mem_denominator)
          ),
          csl.UnitInterval.new(
            csl.BigNum.from_str(price_step_numerator),
            csl.BigNum.from_str(price_step_denominator)
          )
        )
      )
      .build();

    return txBuilderConfig;
  }

  private async _buildTransaction({ txBuilder }: any) {
    const txBody = txBuilder.build();
    const witnesses = csl.TransactionWitnessSet.new();
    const transaction = csl.Transaction.new(txBody, witnesses);
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
    const auxData = csl.AuxiliaryData.new();
    const generalMetadata = csl.GeneralTransactionMetadata.new();
    generalMetadata.insert(
      csl.BigNum.from_str('100'),
      csl.encode_json_str_to_metadatum(JSON.stringify(metadata), 1)
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
    // const coreUtxos = csl.TransactionUnspentOutputs.new();
    // inputs.forEach((utxo) => {
    //   coreUtxos.add(
    //     csl.TransactionUnspentOutput.from_bytes(
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
    let txInputsBuilder = csl.TxInputsBuilder.new();

    const utxos = inputs.map((utxo) => {
      return csl.TransactionUnspentOutput.from_bytes(Buffer.from(utxo, 'hex'));
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

    const multiAsset = csl.MultiAsset.new();

    for (const policy in AssetsMap) {
      const ScriptHash = csl.ScriptHash.from_bytes(Buffer.from(policy, 'hex'));
      const Assets = csl.Assets.new();

      const _assets = AssetsMap[policy];

      for (const asset of _assets) {
        const AssetName = csl.AssetName.new(Buffer.from(asset.unit, 'hex'));
        const BigNum = csl.BigNum.from_str(asset.quantity.toString());
        Assets.insert(AssetName, BigNum);
      }

      multiAsset.insert(ScriptHash, Assets);
    }

    return multiAsset;
  }

  private _createTxOutput = ({ address, value, datum }) => {
    let output: any;
    if (datum) {
      output = csl.TransactionOutputBuilder.new()
        .with_address(address)
        .with_plutus_data(datum)
        .with_data_hash(csl.hash_plutus_data(datum))
        .next()
        .with_value(value)
        .build();
    } else {
      output = csl.TransactionOutputBuilder.new()
        .with_address(address)
        .next()
        .with_value(value)
        .build();
    }
    return output;
  };

  private async _addOutputs({
    txBuilder,
    outputs,
    ownerAddressBech32,
    datumAssetsList,
  }: any) {
    const txOutputs = csl.TransactionOutputs.new();

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

      let outputValue = csl.Value.new(
        csl.BigNum.from_str(amountLovelace.toString())
      );

      // if have native tokens
      if (Object.keys(output.assets)) {
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
      }

      // let datumHash: string | null = null;
      let datum: any = null;
      if (datumAssetsList) {
        datum = this.createDatum({
          ownerAddressBech32: ownerAddressBech32,
          assets: datumAssetsList,
        });
        // datumHash = plutusDataToHex(datum);
      }

      let thisOutput = this._createTxOutput({
        address: StringToAddress(output.address),
        value: outputValue,
        datum: datum,
      });

      txOutputs.add(
        // csl.TransactionOutput.new(StringToAddress(output.address), outputValue)
        thisOutput
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
    hasDatum = false,
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
    hasDatum?: boolean;
    blockfrostApiKey: string;
    network: number;
  }): Promise<string> {
    // start: init
    this._blockfrost = new Blockfrost();
    await this._blockfrost.init({ blockfrostApiKey, network });

    const txBuilder = csl.TransactionBuilder.new(
      await this._getTxBuilderConfig()
    );
    // end: init

    if (ttl) {
      txBuilder.set_ttl(ttl);
    }

    // add inputs
    const txInputsBuilder = await this._addInputUtxo({ inputs, outputs });

    // if datum
    let datumAssetsList: string[] | null = null;
    if (hasDatum) {
      datumAssetsList = [];
      for (let output of outputs) {
        datumAssetsList = [...Object.keys(output.assets)];
        datumAssetsList = datumAssetsList.filter(function (el) {
          return el != 'lovelace';
        });
      }
      console.log('datumAssetsList', datumAssetsList); // ["ds8dh9s8dhs.Pixel"]
    }

    // add outputs
    await this._addOutputs({
      txBuilder,
      outputs,
      ownerAddressBech32: await this.wallet.getWalletAddress(),
      datumAssetsList,
    });

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

  /**
   * for smart contract
   * this is for devt only, will need to refactor everything eventually
   */

  async finalizeTx({ txBuilder, changeAddress }) {
    console.log(txBuilder, changeAddress);
  }

  createDatum({
    ownerAddressBech32,
    assets,
  }: {
    ownerAddressBech32: string;
    assets: string[];
  }) {
    const fields = csl.PlutusList.new();

    for (const asset of assets) {
      const assetDetails = csl.PlutusList.new();
      const [policy, assetName] = asset.split('.');
      assetDetails.add(csl.PlutusData.new_bytes(fromHex(policy)));
      assetDetails.add(csl.PlutusData.new_bytes(fromHex(toHex(assetName))));
      fields.add(
        csl.PlutusData.new_constr_plutus_data(
          csl.ConstrPlutusData.new(csl.BigNum.from_str('0'), assetDetails)
        )
      );
    }

    const owner = getAddressKeyHashHex(ownerAddressBech32);
    if (owner) {
      fields.add(csl.PlutusData.new_bytes(fromHex(owner)));
    }

    const datum = csl.PlutusData.new_constr_plutus_data(
      csl.ConstrPlutusData.new(csl.BigNum.from_str('0'), fields)
    );

    return datum;
  }

  createTxUnspentOutput = (address, utxo) => {
    let amount = {};
    for (let i = 0; i < utxo.amount.length; i++) {
      let thisAsset = utxo.amount[i];
      amount[thisAsset.unit] = thisAsset.quantity;
    }

    try {
      return csl.TransactionUnspentOutput.new(
        csl.TransactionInput.new(
          csl.TransactionHash.from_bytes(fromHex(utxo.tx_hash)),
          utxo.output_index
        ),
        csl.TransactionOutput.new(address, assetsToValue(amount))
      );
    } catch (error) {
      console.error(
        `Unexpected error in createTxUnspentOutput. [Message: ${error}]`
      );
      throw error;
    }
  };

  async _addInputUtxoSC({ scriptAddress, asset }) {
    let utxosFromBF = await this._blockfrost.addressesAddressUtxosAsset({
      address: scriptAddress,
      asset: asset,
    });
    console.log('utxosFromBF', utxosFromBF);

    let utxos = utxosFromBF
      .filter((utxo: any) => {
        return utxo.data_hash !== null;
      })
      .map((utxoBF) => {
        let txoutput = this.createTxUnspentOutput(
          StringToAddress(scriptAddress),
          utxoBF
        );
        return txoutput;
      });

    let txInputsBuilder = csl.TxInputsBuilder.new();

    // utxos.forEach((utxo: any) => {
    //   txInputsBuilder.add_input(
    //     utxo.output().address(),
    //     utxo.input(),
    //     utxo.output().amount()
    //   );
    // });

    txInputsBuilder.add_input(
      utxos[0].output().address(),
      utxos[0].input(),
      utxos[0].output().amount()
    );

    return { txInputsBuilder, utxoselected: utxos[0] };
  }

  // this is for devt only, will need to refactor everything eventually
  async buildSC({
    ownerAddress,
    scriptAddress,
    assets,
    blockfrostApiKey,
    network,
  }: {
    ownerAddress: string;
    scriptAddress: string;
    assets: string[];
    blockfrostApiKey: string;
    network: number;
  }): Promise<string> {
    // start: init
    this._blockfrost = new Blockfrost();
    await this._blockfrost.init({ blockfrostApiKey, network });
    const txBuilder = csl.TransactionBuilder.new(
      await this._getTxBuilderConfig()
    );
    // end: init

    // prepare datum

    const datum = this.createDatum({
      ownerAddressBech32: ownerAddress,
      assets: assets,
    });
    const datumHash = plutusDataToHex(datum);
    console.log('datumHash', datumHash);

    // outputs
    let outputs = [
      {
        address: ownerAddress,
        assets: {},
        datum: datum,
      },
    ];
    let asset: string | null = null;
    assets.map((assetId) => {
      outputs[0].assets[assetId] = 1;
      asset = assetId;
    });
    outputs[0].assets['lovelace'] = 3000000;
    console.log(44, 'outputs', outputs);
    await this._addOutputs({ txBuilder, outputs });

    // inputs
    const [policy, assetName] = asset!.split('.');
    asset = `${policy}${toHex(assetName)}`;

    const { txInputsBuilder, utxoselected } = await this._addInputUtxoSC({
      scriptAddress,
      asset,
    });
    console.log(22);
    const scriptWitness = this.getPlutusWitness(
      csl.PlutusScript.new(fromHex('4e4d01000033222220051200120011')),
      datum,
      this.unlock,
      utxoselected
    );
    console.log(33);
    txInputsBuilder.add_plutus_script_input(
      scriptWitness,
      utxoselected.input(),
      utxoselected.output().amount()
    );
    console.log(44);
    txBuilder.set_inputs(txInputsBuilder);
    console.log(44);

    // here to finalizeTx
    txBuilder.calc_script_data_hash(
      csl.TxBuilderConstants.plutus_vasil_cost_models()
    );
    console.log(55);

    await this._addChange({ txBuilder, changeAddress: ownerAddress });
    console.log(66);
    const transactionHex = await this._buildTransaction({ txBuilder });
    console.log(77);
    return transactionHex;
  }

  unlock(index) {
    const data = csl.PlutusData.new_constr_plutus_data(
      csl.ConstrPlutusData.new(csl.BigNum.from_str('0'), csl.PlutusList.new())
    );

    const redeemer = csl.Redeemer.new(
      csl.RedeemerTag.new_spend(),
      csl.BigNum.from_str(index),
      data,
      csl.ExUnits.new(
        csl.BigNum.from_str('7000000'),
        csl.BigNum.from_str('3000000000')
      )
    );

    return redeemer;
  }

  setCollateral(txBuilder, utxos) {
    const inputBuilder = csl.TxInputsBuilder.new();

    utxos.forEach((utxo) => {
      inputBuilder.add_input(
        utxo.output().address(),
        utxo.input(),
        utxo.output().amount()
      );
    });

    txBuilder.set_collateral(inputBuilder);
  }

  getPlutusWitness(script, datum, redeemer, utxo) {
    return csl.PlutusWitness.new(
      script,
      datum,
      redeemer(utxo.input().index().toString())
    );
  }

  getRequiredSigners(utxos, scriptInput, collateral) {
    const inputs = [...utxos, ...collateral];

    const addresses = new Set<string>();
    inputs.forEach((utxo) => {
      addresses.add(utxo.output().address().to_bech32());
    });
    addresses.delete(scriptInput.output().address().to_bech32());

    const requiredSigners = csl.Ed25519KeyHashes.new();
    addresses.forEach((address) => {
      const keyHash = getAddressKeyHash(address);
      if (keyHash) {
        requiredSigners.add(keyHash);
      }
    });

    return requiredSigners;
  }

  async getCollateral() {
    let collatUtxos: TransactionUnspentOutput[] = [];
    let collateral = await this.wallet.getCollateral();
    for (const x of collateral) {
      const utxo = csl.TransactionUnspentOutput.from_bytes(
        Buffer.from(x, 'hex')
      );
      collatUtxos.push(utxo);
    }
    return collatUtxos;
  }

  async buildSCv2({
    ownerAddress,
    scriptAddress,
    blockfrostApiKey,
    network,
  }: {
    ownerAddress: string;
    scriptAddress: string;
    blockfrostApiKey: string;
    network: number;
  }): Promise<string> {
    // start: init
    this._blockfrost = new Blockfrost();
    await this._blockfrost.init({ blockfrostApiKey, network });
    const txBuilder = csl.TransactionBuilder.new(
      await this._getTxBuilderConfig()
    );
    // end: init

    const scriptAddressObj = StringToAddress(scriptAddress);
    const shelleyChangeAddress = StringToAddress(ownerAddress);

    let assetName = 'SOCIETY';
    let assetNameHex = toHex(assetName);
    let assetAmountToSend = 1;
    let assetPolicyIdHex =
      'f57f145fb8dd8373daff7cf55cea181669e99c4b73328531ebd4419a';
    let transactionIdLocked =
      '3c0fc4774e529432b2eaa654720231ad6c6d92ae2a4a7ab2544a93dcfa3c8561';
    let lovelaceLocked = 3_000_000;
    let plutusScriptCborHex = '4e4d01000033222220051200120011';
    let transactionIndxLocked = 0;
    let manualFee = 900000;

    let multiAsset = csl.MultiAsset.new();
    let assets = csl.Assets.new();
    assets.insert(
      csl.AssetName.new(Buffer.from(assetNameHex, 'hex')), // Asset Name
      csl.BigNum.from_str(assetAmountToSend.toString()) // How much to send
    );

    multiAsset.insert(
      csl.ScriptHash.from_bytes(Buffer.from(assetPolicyIdHex, 'hex')), // PolicyID
      assets
    );

    txBuilder.add_input(
      scriptAddressObj,
      csl.TransactionInput.new(
        csl.TransactionHash.from_bytes(Buffer.from(transactionIdLocked, 'hex')),
        transactionIndxLocked
      ),
      csl.Value.new_from_assets(multiAsset)
    ); // how much lovelace is at that UTXO

    txBuilder.set_fee(csl.BigNum.from_str(Number(manualFee).toString()))

    const scripts = csl.PlutusScripts.new();
    scripts.add(
      csl.PlutusScript.from_bytes(Buffer.from(plutusScriptCborHex, 'hex'))
    ); //from cbor of plutus script

    // Add outputs

    let txOutputBuilder = csl.TransactionOutputBuilder.new()
      .with_address(shelleyChangeAddress)
      .next()
      .with_coin_and_asset(
        csl.BigNum.from_str(lovelaceLocked.toString()),
        multiAsset
      )
      .build();

    txBuilder.add_output(txOutputBuilder);

    // add utxos from user
    const walletUtxos = await this.wallet.getUtxos();

    const utxos = walletUtxos.map((utxo) => {
      return csl.TransactionUnspentOutput.from_bytes(
        Buffer.from(utxo.cbor, 'hex')
      );
    });

    const transactionUnspentOutputs = csl.TransactionUnspentOutputs.new();
    utxos.forEach((utxo) => {
      transactionUnspentOutputs.add(utxo);
    });

    txBuilder.add_inputs_from(
      transactionUnspentOutputs,
      csl.CoinSelectionStrategyCIP2.LargestFirstMultiAsset
    );

    //txBuilder.add_change_if_needed(shelleyChangeAddress);

    // once the transaction is ready, we build it to get the tx body without witnesses
    const txBody = txBuilder.build();

    const collateral = await this.getCollateral();
    const inputs = csl.TransactionInputs.new();
    collateral.forEach((utxo) => {
      inputs.add(utxo.input());
    });

    // make datum
    const datum = this.createDatum({
      ownerAddressBech32: ownerAddress,
      assets: [
        `${assetPolicyIdHex}.${assetName}`,
      ],
    });
    const datumHash = plutusDataToHex(datum);
    console.log('datumHash', datumHash);

    let datums = csl.PlutusList.new();
    // datums.add(PlutusData.from_bytes(Buffer.from(this.state.datumStr, "utf8")))
    datums.add(datum);

    const redeemers = csl.Redeemers.new();

    const data = csl.PlutusData.new_constr_plutus_data(
      csl.ConstrPlutusData.new(csl.BigNum.from_str('0'), csl.PlutusList.new())
    );

    const redeemer = csl.Redeemer.new(
      csl.RedeemerTag.new_spend(),
      csl.BigNum.from_str('0'),
      data,
      csl.ExUnits.new(
        csl.BigNum.from_str('7000000'),
        csl.BigNum.from_str('3000000000')
      )
    );

    redeemers.add(redeemer);

    // Tx witness
    const transactionWitnessSet = csl.TransactionWitnessSet.new();

    transactionWitnessSet.set_plutus_scripts(scripts);
    transactionWitnessSet.set_plutus_data(datums);
    transactionWitnessSet.set_redeemers(redeemers);

    // Pre Vasil hard fork cost model
    // const cost_model_vals = [197209, 0, 1, 1, 396231, 621, 0, 1, 150000, 1000, 0, 1, 150000, 32, 2477736, 29175, 4, 29773, 100, 29773, 100, 29773, 100, 29773, 100, 29773, 100, 29773, 100, 100, 100, 29773, 100, 150000, 32, 150000, 32, 150000, 32, 150000, 1000, 0, 1, 150000, 32, 150000, 1000, 0, 8, 148000, 425507, 118, 0, 1, 1, 150000, 1000, 0, 8, 150000, 112536, 247, 1, 150000, 10000, 1, 136542, 1326, 1, 1000, 150000, 1000, 1, 150000, 32, 150000, 32, 150000, 32, 1, 1, 150000, 1, 150000, 4, 103599, 248, 1, 103599, 248, 1, 145276, 1366, 1, 179690, 497, 1, 150000, 32, 150000, 32, 150000, 32, 150000, 32, 150000, 32, 150000, 32, 148000, 425507, 118, 0, 1, 1, 61516, 11218, 0, 1, 150000, 32, 148000, 425507, 118, 0, 1, 1, 148000, 425507, 118, 0, 1, 1, 2477736, 29175, 4, 0, 82363, 4, 150000, 5000, 0, 1, 150000, 32, 197209, 0, 1, 1, 150000, 32, 150000, 32, 150000, 32, 150000, 32, 150000, 32, 150000, 32, 150000, 32, 3345831, 1, 1];

    /*
        Post Vasil hard fork cost model
        If you need to make this code work on the Mainnnet, before Vasil hard-fork
        Then you need to comment this section below and uncomment the cost model above
        Otherwise it will give errors when redeeming from Scripts
        Sending assets and ada to Script addresses is unaffected by this cost model
         */
    const cost_model_vals = [
      205665, 812, 1, 1, 1000, 571, 0, 1, 1000, 24177, 4, 1, 1000, 32, 117366,
      10475, 4, 23000, 100, 23000, 100, 23000, 100, 23000, 100, 23000, 100,
      23000, 100, 100, 100, 23000, 100, 19537, 32, 175354, 32, 46417, 4, 221973,
      511, 0, 1, 89141, 32, 497525, 14068, 4, 2, 196500, 453240, 220, 0, 1, 1,
      1000, 28662, 4, 2, 245000, 216773, 62, 1, 1060367, 12586, 1, 208512, 421,
      1, 187000, 1000, 52998, 1, 80436, 32, 43249, 32, 1000, 32, 80556, 1,
      57667, 4, 1000, 10, 197145, 156, 1, 197145, 156, 1, 204924, 473, 1,
      208896, 511, 1, 52467, 32, 64832, 32, 65493, 32, 22558, 32, 16563, 32,
      76511, 32, 196500, 453240, 220, 0, 1, 1, 69522, 11687, 0, 1, 60091, 32,
      196500, 453240, 220, 0, 1, 1, 196500, 453240, 220, 0, 1, 1, 806990, 30482,
      4, 1927926, 82523, 4, 265318, 0, 4, 0, 85931, 32, 205665, 812, 1, 1,
      41182, 32, 212342, 32, 31220, 32, 32696, 32, 43357, 32, 32247, 32, 38314,
      32, 9462713, 1021, 10,
    ];

    const costModel = csl.CostModel.new();
    cost_model_vals.forEach((x, i) => costModel.set(i, csl.Int.new_i32(x)));

    const costModels = csl.Costmdls.new();
    costModels.insert(csl.Language.new_plutus_v1(), costModel);

    const scriptDataHash = csl.hash_script_data(redeemers, costModels, datums);
    txBody.set_script_data_hash(scriptDataHash);

    txBody.set_collateral(inputs);

    const baseAddress = csl.BaseAddress.from_address(shelleyChangeAddress);
    const requiredSigners = csl.Ed25519KeyHashes.new();
    requiredSigners.add(baseAddress?.payment_cred().to_keyhash()!);

    txBody.set_required_signers(requiredSigners);

    const transaction = csl.Transaction.new(
      txBody,
      csl.TransactionWitnessSet.from_bytes(transactionWitnessSet.to_bytes())
    );

    const transactionBytes = transaction.to_bytes();
    const transactionHex = toHex(transactionBytes);
    return transactionHex;

    // let txVkeyWitnesses = await this.API.signTx(Buffer.from(tx.to_bytes(), "utf8").toString("hex"), true);
    // txVkeyWitnesses = csl.TransactionWitnessSet.from_bytes(Buffer.from(txVkeyWitnesses, "hex"));

    // transactionWitnessSet.set_vkeys(txVkeyWitnesses.vkeys());

    // const signedTx = csl.Transaction.new(
    //     tx.body(),
    //     transactionWitnessSet
    // );

    // const submittedTxHash = await this.API.submitTx(Buffer.from(signedTx.to_bytes(), "utf8").toString("hex"));
    // console.log(submittedTxHash)
    // this.setState({submittedTxHash});
  }



  async _getAssetUtxo({ scriptAddress, asset }) {
    let utxosFromBF = await this._blockfrost.addressesAddressUtxosAsset({
      address: scriptAddress,
      asset: asset,
    });
    console.log('utxosFromBF', utxosFromBF);

    let utxos = utxosFromBF
      .filter((utxo: any) => {
        // return utxo.data_hash !== null;
        return utxo.data_hash == "287bb96b1b2b86658cae7a5a2c10a8e6663f710a7e0aa9df7b439891be6ede8c"
      })
      .map((utxoBF) => {
        let txoutput = this.createTxUnspentOutput(
          StringToAddress(scriptAddress),
          utxoBF
        );
        console.log('txoutput', txoutput);
        return txoutput;
      });

    return utxos[0];
  }


  async buildSCv3({
    ownerAddress,
    scriptAddress,
    blockfrostApiKey,
    network,
  }: {
    ownerAddress: string;
    scriptAddress: string;
    blockfrostApiKey: string;
    network: number;
  }): Promise<string> {
    // start: init
    this._blockfrost = new Blockfrost();
    await this._blockfrost.init({ blockfrostApiKey, network });
    const txBuilder = csl.TransactionBuilder.new(
      await this._getTxBuilderConfig()
    );
    
    let assetName = 'SOCIETY';
    let assetNameHex = toHex(assetName);
    let assetPolicyIdHex =
      'f57f145fb8dd8373daff7cf55cea181669e99c4b73328531ebd4419a';
    // let transactionIdLocked =
    //   '3c0fc4774e529432b2eaa654720231ad6c6d92ae2a4a7ab2544a93dcfa3c8561';

    let assetUtxo = await this._getAssetUtxo({scriptAddress, asset: `${assetPolicyIdHex}${assetNameHex}`});
  
    const walletUtxos = await this.wallet.getUtxos();

    const utxos = walletUtxos.map((utxo) => {
      return csl.TransactionUnspentOutput.from_bytes(
        Buffer.from(utxo.cbor, 'hex')
      );
    });

    const transactionUnspentOutputs = csl.TransactionUnspentOutputs.new();
    utxos.forEach((utxo) => {
      transactionUnspentOutputs.add(utxo);
    });

   
    let inputs = [...utxos];

    if (assetUtxo) {
      inputs.push(assetUtxo);
    }

    ////
    let outputs = [
      {
        address: ownerAddress,
        assets: {
          [`${assetPolicyIdHex}.${assetName}`]: 1,
          lovelace: 3000000
        },
      },
    ];
    this._addOutputs({
      txBuilder,
      outputs,
      ownerAddressBech32:ownerAddress,
      })
    ////

    const plutusScripts = csl.PlutusScripts.new();
    plutusScripts.add(
      csl.PlutusScript.from_bytes(Buffer.from('4e4d01000033222220051200120011', 'hex'))
    );
    
    // make datum
    const datum = this.createDatum({
      ownerAddressBech32: ownerAddress,
      assets: [
        `${assetPolicyIdHex}.${assetName}`,
      ],
    });
    const datumHash = plutusDataToHex(datum);
    console.log('datumHash', datumHash);

    let datums = csl.PlutusList.new();
    datums.add(datum);
  
    if (plutusScripts) {
      const txInputsBuilder = csl.TxInputsBuilder.new();
      const plutusWitness = this.getPlutusWitness(plutusScripts.get(0), datums.get(0), this.unlock, assetUtxo);
  
      txInputsBuilder.add_plutus_script_input(
        plutusWitness,
        assetUtxo.input(),
        assetUtxo.output().amount()
      );
  
      const collateral = (await this.wallet.getCollateral())
        .map((utxo) =>
          csl.TransactionUnspentOutput.from_bytes(fromHex(utxo))
        )
        .slice(0, 1);
  
      this.setCollateral(txBuilder, collateral);
  
      const requiredSigners = this.getRequiredSigners(inputs, assetUtxo, collateral);
      txInputsBuilder.add_required_signers(requiredSigners);
      txBuilder.set_inputs(txInputsBuilder);
    }
  
    txBuilder.calc_script_data_hash(
      csl.TxBuilderConstants.plutus_vasil_cost_models()
    );
  
    try {
      const transactionUnspentOutputs = csl.TransactionUnspentOutputs.new();
      inputs.forEach((utxo) => { transactionUnspentOutputs.add(utxo); });
      
      txBuilder.add_inputs_from(
        transactionUnspentOutputs,
        csl.CoinSelectionStrategyCIP2.LargestFirstMultiAsset
      );
      
      txBuilder.add_change_if_needed(StringToAddress(ownerAddress));
    } catch (error) {
      throw new Error("INPUTS_EXHAUSTED");
    }
  
    const tx = txBuilder.build_tx();
  
    let txVkeyWitnessesHex = await this.wallet.signTx({ tx: toHex(tx.to_bytes()), partialSign: true });
    let txVkeyWitnesses = csl.TransactionWitnessSet.from_bytes(
      fromHex(txVkeyWitnessesHex)
    );
  
    const transactionWitnessSet =
      csl.TransactionWitnessSet.from_bytes(
        tx.witness_set().to_bytes()
      );
  
    transactionWitnessSet.set_vkeys(txVkeyWitnesses?.vkeys()!);
  
    const signedTx = csl.Transaction.new(
      tx.body(),
      transactionWitnessSet,
      tx.auxiliary_data()
    );
  
    const txHex = toHex(signedTx.to_bytes());


    const txHash = await this.wallet.submitTx({
      tx: txHex,
    });
    console.log('txHash', txHash);
  
    return txHash;
  }
}
