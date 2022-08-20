import cryptoRandomString from 'crypto-random-string';
import { generateMnemonic, mnemonicToEntropy } from 'bip39';
import { csl } from '@mesh/core';
import { ISigner } from '@mesh/common/contracts';
import {
  buildBaseAddress, buildBip32PrivateKey, deserializeBip32PrivateKey,
  deserializeTx, deserializeTxHash, deserializeTxWitnessSet,
  fromBytes, fromUTF8, resolveTxHash,
} from '@mesh/common/utils';
import type { BaseAddress, PrivateKey } from '@mesh/core';

export class EmbeddedWallet implements ISigner {
  private readonly _baseAddress: BaseAddress;
  private readonly _paymentKey: PrivateKey;
  private readonly _stakeKey: PrivateKey;

  constructor(
    encryptedWalletKey: string, password: string,
    options = {} as Partial<CreateEmbeddedWalletOptions>,
  ) {
    try {
      const accountIndex = options.accountIndex ?? 1;
      const networkId = options.networkId ?? 0;

      const walletKey = EmbeddedWallet.decrypt(encryptedWalletKey, password);

      const {
        paymentKey, stakeKey,
      } = EmbeddedWallet.derive(walletKey, accountIndex);

      const baseAddress = buildBaseAddress(networkId, paymentKey, stakeKey);

      this._baseAddress = baseAddress;
      this._paymentKey = paymentKey;
      this._stakeKey = stakeKey;
    } catch (error) {
      throw error;
    }
  }

  get accountAddress(): string {
    return this._baseAddress
      .to_address()
      .to_bech32();
  }

  async signData(_payload: string): Promise<string> {
    throw new Error('Method not implemented.');
  }

  async signTx(unsignedTx: string, _partialSign: boolean): Promise<string> {
    const tx = deserializeTx(unsignedTx);

    const txHash = deserializeTxHash(
      resolveTxHash(fromBytes(tx.body().to_bytes()))
    );

    const txWitnessSet = deserializeTxWitnessSet(
      fromBytes(tx.witness_set().to_bytes())
    );

    const vkeyWitnesses = csl.Vkeywitnesses.new();

    vkeyWitnesses.add(csl.make_vkey_witness(txHash, this._paymentKey));
    vkeyWitnesses.add(csl.make_vkey_witness(txHash, this._stakeKey));

    txWitnessSet.set_vkeys(vkeyWitnesses);

    return fromBytes(
      csl.Transaction.new(
        tx.body(),
        txWitnessSet,
        tx.auxiliary_data()
      ).to_bytes()
    );
  }

  static encrypt(words: string[], password: string): string {
    const salt = cryptoRandomString({ length: 64 });
    const nonce = cryptoRandomString({ length: 24 });
    const entropy = mnemonicToEntropy(words.join(' '));
    const bip32PrivateKey = buildBip32PrivateKey(entropy);

    return csl.encrypt_with_password(
      fromUTF8(password), salt, nonce, fromBytes(bip32PrivateKey.as_bytes()),
    );
  }

  static generate(strength = 256): string[] {
    const mnemonic = generateMnemonic(strength);
    return mnemonic.split(' ');
  }

  private static decrypt(data: string, password: string): string {
    try {
      return csl.decrypt_with_password(fromUTF8(password), data);
    } catch (error) {
      throw new Error('The password is incorrect.');
    }
  }

  private static derive(walletKey: string, accountIndex: number) {
    const bip32PrivateKey = deserializeBip32PrivateKey(walletKey);

    const accountKey = bip32PrivateKey
      .derive(EmbeddedWallet.harden(1852)) // purpose
      .derive(EmbeddedWallet.harden(1815)) // coin type
      .derive(EmbeddedWallet.harden(accountIndex));

    const paymentKey = accountKey
      .derive(0) // external chain
      .derive(0)
      .to_raw_key();

    const stakeKey = accountKey
      .derive(2) // staking key
      .derive(0)
      .to_raw_key();

    return { paymentKey, stakeKey };
  }

  private static harden(path: number): number {
    return 0x80000000 + path;
  }
}

type CreateEmbeddedWalletOptions = {
  accountIndex: number;
  networkId: number;
};
