import { csl } from '@mesh/core';
import { DEFAULT_PROTOCOL_PARAMETERS } from '@mesh/common/constants';
import { IFetcher, IInitiator, ISigner } from '@mesh/common/contracts';
import {
  deserializeTx, toAddress, toTxUnspentOutput,
} from '@mesh/common/utils';
import { EmbeddedWallet } from './embedded.service';
import type { Address, TransactionUnspentOutput } from '@mesh/core';
import type { DataSignature } from '@mesh/common/types';

const DEFAULT_PASSWORD = 'MARI0TIME';

export class NodeWallet implements IInitiator, ISigner {
  private readonly _fetcher: IFetcher;
  private readonly _wallet: EmbeddedWallet;

  constructor(options: CreateNodeWalletOptions) {
    this._fetcher = options.fetcher;

    switch (options.key.type) {
      case 'mnemonic':
        this._wallet = new EmbeddedWallet(
          options.networkId,
          EmbeddedWallet.encryptMnemonic(options.key.words, DEFAULT_PASSWORD),
        );
        break;
      case 'root':
        this._wallet = new EmbeddedWallet(
          options.networkId,
          EmbeddedWallet.encryptPrivateKey(options.key.bech32, DEFAULT_PASSWORD),
        );
        break;
    }
    }

  getPaymentAddress(accountIndex = 0): string {
    const account = this._wallet
      .getAccount(accountIndex, DEFAULT_PASSWORD);
    return account.enterpriseAddress;
  }

  getStakeKey(accountIndex = 0): string {
    const account = this._wallet
      .getAccount(accountIndex, DEFAULT_PASSWORD);
    return account.rewardAddress;
  }

  getUsedAddress(accountIndex = 0): Address {
    const account = this._wallet
      .getAccount(accountIndex, DEFAULT_PASSWORD);
    return toAddress(account.enterpriseAddress);
  }

  getUsedCollateral(
    _limit = DEFAULT_PROTOCOL_PARAMETERS.maxCollateralInputs,
  ): Promise<TransactionUnspentOutput[]> {
    throw new Error('Method not implemented.');
  }

  async getUsedUtxos(accountIndex = 0): Promise<TransactionUnspentOutput[]> {
    const account = this._wallet.getAccount(accountIndex, DEFAULT_PASSWORD);

    const utxos = await this._fetcher
      .fetchAddressUtxos(account.enterpriseAddress) ?? [];

    return utxos.map((utxo) => toTxUnspentOutput(utxo));
  }

  signData(address: string, payload: string, accountIndex = 0): DataSignature {
    try {
      return this._wallet.signData(accountIndex, DEFAULT_PASSWORD, address, payload);
    } catch (error) {
      throw new Error(`[NodeWallet] An error occurred during signData: ${error}.`);
    }
  }

  async signTx(
    unsignedTx: string, partialSign: boolean, accountIndex = 0,
  ): Promise<string> {
    try {
      const account = this._wallet.getAccount(accountIndex, DEFAULT_PASSWORD);
      const utxos = await this._fetcher
        .fetchAddressUtxos(account.enterpriseAddress) ?? [];

      const txSignatures = this._wallet.signTx(
        accountIndex, DEFAULT_PASSWORD, utxos,
        unsignedTx, partialSign,
      );

      const tx = deserializeTx(unsignedTx);
      const txWitnessSet = tx.witness_set();

      txWitnessSet.set_vkeys(txSignatures);

      const signedTx = csl.Transaction.new(
        tx.body(),
        txWitnessSet,
        tx.auxiliary_data()
      ).to_hex();

      return signedTx;
    } catch (error) {
      throw new Error(`[NodeWallet] An error occurred during signTx: ${error}.`);
    }
  }
}

type CreateNodeWalletOptions = {
  networkId: number;
  fetcher: IFetcher;
  key: {
    type: 'mnemonic';
    words: string[];
  } | {
    type: 'root';
    bech32: string;
  };
};
