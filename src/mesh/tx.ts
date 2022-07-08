import {
  BigNum,
  Value,
  Address,
  TransactionUnspentOutput,
  TransactionOutput,
  TransactionBuilder,
  TransactionBuilderConfigBuilder,
  LinearFee,
  TransactionUnspentOutputs,
  Transaction,
  TransactionWitnessSet,
} from "@emurgo/cardano-serialization-lib-browser";
import { Blockfrost } from "../provider/blockfrost";
import { Core } from "./core";
import { MIN_ADA_REQUIRED } from "../global";
import { toHex, StringToBigNum, StringToAddress } from "../utils/converter";

export class Tx {
  private _blockfrost: Blockfrost;
  private _core: Core;

  constructor({ blockfrost, core }: { blockfrost: Blockfrost; core: Core }) {
    this._blockfrost = blockfrost;
    this._core = core;
  }

  async _getTxBuilderConfig() {
    const protocolParameters =
      await this._blockfrost.epochsLatestEpochProtocolParameters();

    let txBuilderConfig = TransactionBuilderConfigBuilder.new()
      .coins_per_utxo_word(
        BigNum.from_str(protocolParameters.coins_per_utxo_word)
      )
      .fee_algo(
        LinearFee.new(
          BigNum.from_str(protocolParameters.min_fee_a.toString()),
          BigNum.from_str(protocolParameters.min_fee_b.toString())
        )
      )
      .key_deposit(BigNum.from_str(protocolParameters.key_deposit))
      .pool_deposit(BigNum.from_str(protocolParameters.pool_deposit))
      .max_tx_size(protocolParameters.max_tx_size)
      .max_value_size(parseInt(protocolParameters.max_val_size))
      // .prefer_pure_change(true)
      .build();

    return txBuilderConfig;
  }

  async _addInputUtxo({ txBuilder }) {
    const utxos = await this._core.getUtxos();

    if (utxos === undefined) {
      throw "No utxos";
    }

    const coreUtxos = TransactionUnspentOutputs.new();
    utxos.forEach((utxo) => {
      coreUtxos.add(
        TransactionUnspentOutput.from_bytes(Buffer.from(utxo, "hex"))
      );
    });
    txBuilder.add_inputs_from(coreUtxos, 0);
  }

  async _addPaymentAda({
    txBuilder,
    address,
    lovelace,
  }: {
    txBuilder: TransactionBuilder;
    address: Address;
    lovelace: number;
  }) {
    txBuilder.add_output(
      TransactionOutput.new(
        address,
        Value.new(StringToBigNum(lovelace.toString()))
      )
    );
  }

  async _addPaymentAssets({ txBuilder }) {}
  async _complete({ txBuilder }) {}

  /**
   * baby steps, lets send ADA, from one wallet, to one wallet
   * @param address
   * @param lovelace
   * @returns
   */
  async makeSimpleTransaction({
    address,
    lovelace = 1000000,
  }: {
    address: string;
    lovelace?: number;
  }): Promise<string> {
    if (lovelace < MIN_ADA_REQUIRED) {
      throw "Lovelace must be greater than 1000000";
    }

    const txBuilder = TransactionBuilder.new(await this._getTxBuilderConfig());

    const recipientAddress = StringToAddress(address);
    const paymentAddress = StringToAddress(await this._core.getWalletAddress());

    await this._addInputUtxo({ txBuilder });

    await this._addPaymentAda({
      txBuilder,
      address: recipientAddress,
      lovelace: lovelace,
    });

    txBuilder.add_change_if_needed(paymentAddress);

    const txBody = txBuilder.build();

    const witnesses = TransactionWitnessSet.new();

    const transaction = Transaction.new(
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
    
    // check if inputs and outputs are equal

    // check if UTXOs has those inputs

    // if there are multiple `inputs`, this is multisig

    // perform coin selection and change

    return "";
  }
}
