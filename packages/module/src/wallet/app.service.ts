import { csl } from '@mesh/core';
import { DEFAULT_PROTOCOL_PARAMETERS } from '@mesh/common/constants';
import { IFetcher, IInitiator, ISigner, ISubmitter } from '@mesh/common/contracts';
import { mergeSignatures } from '@mesh/common/helpers';
import {
  deserializeTx, toAddress, toTxUnspentOutput,
} from '@mesh/common/utils';
import { EmbeddedWallet } from './embedded.service';
import type {
  Address, TransactionUnspentOutput,
} from '@mesh/core';
import type { DataSignature } from '@mesh/common/types';

const DEFAULT_PASSWORD = 'MARI0TIME';

export type CreateAppWalletOptions = {
  networkId: number;
  fetcher: IFetcher;
  submitter: ISubmitter;
  key: {
    type: 'root';
    bech32: string;
  } | {
    type: 'cli';
    payment: string;
    stake?: string;
  } | {
    type: 'mnemonic';
    words: string[];
  };
};

export class AppWallet implements IInitiator, ISigner, ISubmitter {
  private readonly _fetcher: IFetcher;
  private readonly _submitter: ISubmitter;
  private readonly _wallet: EmbeddedWallet;

  constructor(options: CreateAppWalletOptions) {
    this._fetcher = options.fetcher;
    this._submitter = options.submitter;

    switch (options.key.type) {
      case 'mnemonic':
        this._wallet = new EmbeddedWallet(
          options.networkId,
          EmbeddedWallet
            .encryptMnemonic(options.key.words, DEFAULT_PASSWORD),
        );
        break;
      case 'root':
        this._wallet = new EmbeddedWallet(
          options.networkId,
          EmbeddedWallet
            .encryptPrivateKey(options.key.bech32, DEFAULT_PASSWORD),
        );
        break;
      case 'cli':
        this._wallet = new EmbeddedWallet(
          options.networkId,
          EmbeddedWallet.encryptSigningKeys(
            options.key.payment,
            options.key.stake ?? 'f0'.repeat(34),
            DEFAULT_PASSWORD,
          ),
        );
    }
  }

  getPaymentAddress(accountIndex = 0): string {
    const account = this._wallet
      .getAccount(accountIndex, DEFAULT_PASSWORD);
    return account.enterpriseAddress;
  }

  getStakeAddress(accountIndex = 0): string {
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
    throw new Error('getUsedCollateral not implemented.');
  }

  async getUsedUTxOs(accountIndex = 0): Promise<TransactionUnspentOutput[]> {
    const account = this._wallet
      .getAccount(accountIndex, DEFAULT_PASSWORD);
    const utxos = await this._fetcher
      .fetchAddressUTxOs(account.enterpriseAddress);

    return utxos.map((utxo) => toTxUnspentOutput(utxo));
  }

  signData(address: string, payload: string, accountIndex = 0): DataSignature {
    try {
      return this._wallet.signData(accountIndex, DEFAULT_PASSWORD, address, payload);
    } catch (error) {
      throw new Error(`[AppWallet] An error occurred during signData: ${error}.`);
    }
  }

  async signTx(
    unsignedTx: string, partialSign = false, accountIndex = 0,
  ): Promise<string> {
    try {
      const account = this._wallet
        .getAccount(accountIndex, DEFAULT_PASSWORD);
      const utxos = await this._fetcher
        .fetchAddressUTxOs(account.enterpriseAddress);

      const newSignatures = this._wallet.signTx(
        accountIndex, DEFAULT_PASSWORD,
        utxos, unsignedTx, partialSign,
      );

      const tx = deserializeTx(unsignedTx);
      const txWitnessSet = tx.witness_set();

      const txSignatures = mergeSignatures(
        txWitnessSet,
        newSignatures,
      );

      txWitnessSet.set_vkeys(txSignatures);

      const signedTx = csl.Transaction.new(
        tx.body(),
        txWitnessSet,
        tx.auxiliary_data()
      ).to_hex();

      return signedTx;
    } catch (error) {
      throw new Error(`[AppWallet] An error occurred during signTx: ${error}.`);
    }
  }

  submitTx(tx: string): Promise<string> {
    return this._submitter.submitTx(tx);
  }

  static brew(strength = 256): string[] {
    return EmbeddedWallet.generateMnemonic(strength);
  }
}
