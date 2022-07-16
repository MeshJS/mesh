import { Blockfrost } from "./provider/blockfrost.js";
import { MIN_ADA_REQUIRED } from "./global.js";
import { toHex, StringToBigNum, StringToAddress } from "./utils/converter.js";
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
}
