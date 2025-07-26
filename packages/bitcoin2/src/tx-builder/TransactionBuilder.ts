/* eslint-disable @typescript-eslint/no-non-null-assertion, no-magic-numbers */
import { GreedyInputSelector, InputSelector } from '../input-selection';
import {
  DerivedAddress,
  Network,
  validateBitcoinAddress,
  AddressValidationResult,
  UnsignedTransaction,
  isP2trAddress,
  INPUT_SIZE,
  OUTPUT_SIZE,
  TRANSACTION_OVERHEAD
} from '../common';
import { UTxO } from '../providers';
import { payments, script, Psbt } from 'bitcoinjs-lib';
import * as bitcoin from 'bitcoinjs-lib';

/**
 * A class to build Bitcoin transactions using a flexible input and output management system.
 */
export class TransactionBuilder {
  private psbt: Psbt;
  private network: Network;
  private feeRate: number;
  private knownAddresses: DerivedAddress[];
  private outputs: { address: string; value: bigint }[] = [];
  private utxos: UTxO[] = [];
  private changeAddress?: string;
  private signers: DerivedAddress[] = [];
  private inputSelector: InputSelector = new GreedyInputSelector();
  private opReturnData?: Buffer;

  /**
   * Initializes the transaction builder.
   *
   * @param network - The Bitcoin network (Mainnet or Testnet).
   * @param feeRate - The fee rate in BTC per kilobyte.
   * @param knownAddresses - The list of known addresses with their public keys.
   */
  constructor(network: Network, feeRate: number, knownAddresses: DerivedAddress[]) {
    this.feeRate = feeRate;
    this.knownAddresses = knownAddresses;
    this.network = network;
    const net = network === Network.Mainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
    this.psbt = new Psbt({ network: net });
  }

  /**
   * Sets the UTXO set that will be used to fund the transaction.
   *
   * @param utxos - Array of available UTXOs.
   * @returns The builder instance for chaining.
   */
  public setUtxoSet(utxos: UTxO[]): this {
    this.utxos = utxos;
    return this;
  }

  /**
   * Sets the change address where any remaining funds will be sent.
   *
   * @param changeAddress - The change address.
   * @returns The builder instance for chaining.
   */
  public setChangeAddress(changeAddress: string): this {
    if (validateBitcoinAddress(changeAddress, this.network) !== AddressValidationResult.Valid) {
      throw new Error(`Invalid change address: ${changeAddress}`);
    }
    this.changeAddress = changeAddress;
    return this;
  }

  /**
   * Sets the input selection strategy.
   *
   * @param inputSelector - An implementation of the InputSelector interface.
   * @returns The builder instance for chaining.
   */
  public setInputSelection(inputSelector: InputSelector): this {
    this.inputSelector = inputSelector;
    return this;
  }

  /**
   * Adds an output to the transaction.
   *
   * @param address - The destination address.
   * @param value - The amount to send (in satoshis as bigint).
   * @returns The builder instance for chaining.
   */
  public addOutput(address: string, value: bigint): this {
    if (validateBitcoinAddress(address, this.network) !== AddressValidationResult.Valid) {
      throw new Error(`Invalid recipient address: ${address}`);
    }
    this.outputs.push({ address, value });
    return this;
  }

  /**
   * Adds an OP_RETURN message to the transaction.
   *
   * @param message - The message to embed (string, UTF-8). Max 80 bytes after encoding.
   *                  If null, removes any existing OP_RETURN data.
   * @returns The builder instance for chaining.
   */
  public addOpReturnOutput(message: string | null): this {
    if (!message?.trim()) {
      this.opReturnData = undefined;
      return this;
    }

    const data = Buffer.from(message, 'utf8');

    if (data.length > 80) {
      throw new Error(`OP_RETURN message exceeds 80 bytes (actual: ${data.length}).`);
    }

    this.opReturnData = data;
    return this;
  }

  /**
   * Builds the transaction by selecting UTXOs (using either the provided input selector or a fallback),
   * adding inputs and outputs (including a change output if needed), and calculating fees.
   * If the change amount is below the dust threshold, it is added to the fee instead.
   *
   * @returns An UnsignedTransaction containing the PSBT context, fee, estimated virtual bytes, signers, and outputs.
   * @throws Error if funds are insufficient, no UTXOs are set, or if the change address is not provided.
   */
  public build(): UnsignedTransaction {
    if (!this.utxos || this.utxos.length === 0) {
      throw new Error('No UTXOs available to fund the transaction.');
    }
    if (!this.changeAddress) {
      throw new Error('Change address not set.');
    }
    if (this.outputs.length === 0) {
      throw new Error('No outputs have been added.');
    }

    const feeRateSatoshis = (this.feeRate * 100_000_000) / 1000;
    let selectedUTxOs: UTxO[] = [];
    let fee = 0;
    let coinselectOutputs: { address: string; value: number }[] = [];

    const result = this.inputSelector.selectInputs(
      this.changeAddress,
      this.utxos,
      this.outputs,
      feeRateSatoshis,
      !!this.opReturnData
    );
    if (!result) {
      throw new Error('Insufficient funds or coin selection failed.');
    }
    selectedUTxOs = result.selectedUTxOs;
    fee = result.fee;
    coinselectOutputs = result.outputs;

    for (const utxo of selectedUTxOs) {
      const knownAddr = this.knownAddresses.find((addr) => addr.address === utxo.address);
      if (!knownAddr) {
        throw new Error('Unknown address in UTXO set.');
      }
      this.signers.push(knownAddr);

      const net = this.network === Network.Mainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

      this.psbt.addInput({
        hash: utxo.txId,
        index: utxo.index,
        witnessUtxo: {
          script: payments.p2wpkh({ pubkey: Buffer.from(knownAddr.publicKeyHex, 'hex'), network: net }).output!,
          value: Number(utxo.satoshis)
        }
      });
    }

    coinselectOutputs.forEach(({ address, value }) => {
      if (isP2trAddress(address)) {
        const taprootPubKey = Buffer.from(bitcoin.address.fromBech32(address).data);
        this.psbt.addOutput({
          script: script.compile([bitcoin.opcodes.OP_1, taprootPubKey]),
          value
        });
      } else {
        this.psbt.addOutput({ address, value });
      }
    });

    if (this.opReturnData) {
      const embed = bitcoin.payments.embed({ data: [this.opReturnData] });
      this.psbt.addOutput({
        script: embed.output!,
        value: 0
      });
    }

    const opReturnOutput = this.opReturnData ? 1 : 0;
    const vBytes =
      selectedUTxOs.length * INPUT_SIZE +
      (coinselectOutputs.length + opReturnOutput) * OUTPUT_SIZE +
      TRANSACTION_OVERHEAD;

    return {
      context: this.psbt,
      toAddress: this.outputs[0].address,
      fee: BigInt(fee),
      amount: this.outputs[0].value,
      vBytes,
      signers: this.signers
    };
  }
}
