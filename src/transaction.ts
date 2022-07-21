import { Blockfrost } from "./provider/blockfrost.js";
import { MIN_ADA_REQUIRED } from "./global.js";
import {
  toHex,
  StringToBigNum,
  StringToAddress,
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
        .prefer_pure_change(true)
        .build();

    return txBuilderConfig;
  }

  private async _buildTransaction({ txBuilder }) {
    const txBody = txBuilder.build();
    console.log(12, "txBody", txBody);
    const witnesses = SerializationLib.Instance.TransactionWitnessSet.new();
    console.log(34, "witnesses", witnesses);
    const transaction = SerializationLib.Instance.Transaction.new(
      txBody,
      witnesses
    );
    console.log(56, "transaction", transaction);
    const transactionBytes = transaction.to_bytes();
    console.log(7, "transactionBytes", transactionBytes);
    const transactionHex = toHex(transactionBytes);
    console.log(8, "transactionHex", transactionHex);
    return transactionHex;
  }

  private async _addChange({ txBuilder }) {
    console.log(99, "add change");
    const paymentAddress = await this.wallet.getWalletAddress();
    console.log(99, "paymentAddress", paymentAddress);
    console.log(
      88,
      "StringToAddress(paymentAddress)",
      StringToAddress(paymentAddress)
    );

    txBuilder.add_change_if_needed(StringToAddress(paymentAddress));
    console.log(98, "txBuilder", txBuilder);
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
    txBuilder.add_inputs_from(coreUtxos, 2);
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

  _makeMultiAsset(assets) {
    const AssetsMap = {};
    for (const asset of assets) {
      const { unit, quantity } = asset;
      const [policy, assetName] = unit.split(".");

      if (!Array.isArray(AssetsMap[policy])) {
        AssetsMap[policy] = [];
      }
      AssetsMap[policy].push({
        unit: Buffer.from(assetName, "ascii").toString("hex"),
        quantity,
      });
    }

    const multiAsset = SerializationLib.Instance.MultiAsset.new();

    for (const policy in AssetsMap) {
      const ScriptHash = SerializationLib.Instance.ScriptHash.from_bytes(
        Buffer.from(policy, "hex")
      );
      const Assets = SerializationLib.Instance.Assets.new();

      const _assets = AssetsMap[policy];

      for (const asset of _assets) {
        const AssetName = SerializationLib.Instance.AssetName.new(
          Buffer.from(asset.unit, "hex")
        );
        const BigNum = SerializationLib.Instance.BigNum.from_str(
          asset.quantity.toString()
        );
        Assets.insert(AssetName, BigNum);
      }

      multiAsset.insert(ScriptHash, Assets);
    }

    return multiAsset;
  }

  private async _addOutputsJustADA({ txBuilder, outputs }) {
    await Promise.all(
      outputs.map(async (output, i) => {
        if (output.address == undefined || output.address.length == 0) {
          throw MakeTxError.NoRecipientsAddress;
        }

        await Promise.all(
          Object.keys(output.assets).map(async (assetId, j) => {
            // if lovelace
            if (assetId === "lovelace") {
              if (output.assets[assetId] < MIN_ADA_REQUIRED) {
                throw MakeTxError.LovelaceTooLittle;
              }
              await this._addPaymentAda({
                txBuilder,
                address: StringToAddress(output.address),
                lovelace: output.assets[assetId],
              });
            } // end if (assetId === "lovelace")
          })
        );
      })
    );
  }

  private async _addOutputs({ txBuilder, outputs }) {
    const txOutputs = SerializationLib.Instance.TransactionOutputs.new();
    console.log(999, txOutputs);

    outputs.map((output, i) => {
      if (output.address === undefined || output.address.length === 0) {
        throw MakeTxError.NoRecipientsAddress;
      }
      console.log(11, output);

      // add lovelace
      let outputValue = SerializationLib.Instance.Value.new(
        SerializationLib.Instance.BigNum.from_str(
          "2000000" // the minimum UTXO value
        )
      );
      console.log(22, output.assets["lovelace"], outputValue);

      let assets: {}[] = [];
      Object.keys(output.assets).map(async (assetId, j) => {
        if (assetId !== "lovelace") {
          console.log(33, assetId, output.assets[assetId]);
          assets.push({
            unit: assetId,
            quantity: output.assets[assetId],
          });
        }
      });
      console.log(44, "assets", assets);

      const multiAsset = this._makeMultiAsset(assets);
      outputValue.set_multiasset(multiAsset);
      console.log(55, "multiAsset", multiAsset);

      txOutputs.add(
        SerializationLib.Instance.TransactionOutput.new(
          StringToAddress(output.address),
          outputValue
        )
      );
    });

    console.log(66, "adding", txOutputs);

    for (let i = 0; i < txOutputs.len(); i++) {
      console.log(77, "adding", i);
      txBuilder.add_output(txOutputs.get(i));
    }

    console.log(88, "txBuilder", txBuilder);
  }

  payToAddress(txBuilder, address, assets) {
    const output = SerializationLib.Instance.TransactionOutput.new(
      SerializationLib.Instance.Address.from_bech32(address),
      assetsToValue(assets)
    );
    txBuilder.add_output(output);
    return this;
  }

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

    const txBuilder = SerializationLib.Instance.TransactionBuilder.new(
      await this._getTxBuilderConfig()
    );
    // end: init

    // add outputs
    // await this._addOutputsJustADA({ txBuilder, outputs });

    // new add outputs
    await this._addOutputs({ txBuilder, outputs });

    // add utxo
    console.log("_addInputUtxo");
    await this._addInputUtxo({ txBuilder });

    // add change
    console.log("_addChange");
    await this._addChange({ txBuilder });

    const transactionHex = await this._buildTransaction({ txBuilder });

    return transactionHex;
  }
}
