import { csl } from '../core';
import {
  fromBytes, toAddress, toTxUnspentOutput, toUnitInterval, toValue
} from '../common/utils';
import { WalletService } from '../wallet';
import type { TransactionBuilder } from '../core';
import type { Asset, Metadata, Protocol } from '../common/types';

export class TransactionService {
  private _txBuilder: TransactionBuilder;
  private _walletService: WalletService;

  constructor(walletService: WalletService, parameters?: Protocol) {
    this._txBuilder = TransactionService.createTxBuilder(parameters);
    this._walletService = walletService;
  }

  sendLovelace(address: string, lovelace: string): TransactionService {
    const txOutput = csl.TransactionOutputBuilder.new()
      .with_address(toAddress(address))
      .next()
      .with_coin(csl.BigNum.from_str(lovelace))
      .build();

    this._txBuilder.add_output(txOutput);

    return this;
  }

  sendNativeAssets(address: string, nativeAssets: Asset[]): TransactionService {
    const txOutput = csl.TransactionOutputBuilder.new()
      .with_address(toAddress(address))
      .next()
      .with_value(toValue(nativeAssets))
      .build();

    this._txBuilder.add_output(txOutput);

    return this;
  }

  setMetadata(key: number, value: Metadata): TransactionService {
    this._txBuilder.add_json_metadatum_with_schema(
      csl.BigNum.from_str(key.toString()),
      JSON.stringify(value),
      csl.MetadataJsonSchema.DetailedSchema
    );

    return this;
  }

  setTimeToLive(slot: number): TransactionService {
    this._txBuilder.set_ttl_bignum(
      csl.BigNum.from_str(slot.toString())
    );

    return this;
  }

  async build(): Promise<string> {
    const walletUtxos = await this._walletService.getUtxos();
    const txUnspentOutputs = csl.TransactionUnspentOutputs.new();

    walletUtxos.forEach((utxo) => {
      txUnspentOutputs.add(toTxUnspentOutput(utxo))
    });

    this._txBuilder.add_inputs_from(
      txUnspentOutputs, csl.CoinSelectionStrategyCIP2.LargestFirstMultiAsset
    );

    const changeAddress = toAddress(await this._walletService.getChangeAddress());
    this._txBuilder.add_change_if_needed(changeAddress);

    return fromBytes(this._txBuilder.build_tx().to_bytes());
  }

  private static createTxBuilder(
    parameters = {
      coinsPerUTxOWord: '4310',
      priceMem: 0.0577,
      priceStep: 0.0000721,
      minFeeA: 44,
      minFeeB: 155381,
      keyDeposit: '2000000',
      maxTxSize: 16384,
      maxValSize: '5000',
      poolDeposit: '500000000',
    }
  ): TransactionBuilder {
    const txBuilderConfig = csl.TransactionBuilderConfigBuilder.new()
      .coins_per_utxo_byte(csl.BigNum.from_str(parameters.coinsPerUTxOWord))
      .ex_unit_prices(
        csl.ExUnitPrices.new(
          toUnitInterval(parameters.priceMem.toString()),
          toUnitInterval(parameters.priceStep.toString())
        )
      )
      .fee_algo(
        csl.LinearFee.new(
          csl.BigNum.from_str(parameters.minFeeA.toString()),
          csl.BigNum.from_str(parameters.minFeeB.toString())
        )
      )
      .key_deposit(csl.BigNum.from_str(parameters.keyDeposit))
      .max_tx_size(parameters.maxTxSize)
      .max_value_size(parseInt(parameters.maxValSize))
      .pool_deposit(csl.BigNum.from_str(parameters.poolDeposit))
      .build();

    return csl.TransactionBuilder.new(txBuilderConfig);
  }
}
