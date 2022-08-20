import cryptoRandomString from 'crypto-random-string';
import { generateMnemonic, mnemonicToEntropy } from 'bip39';
import { csl } from '@mesh/core';
import { ISigner } from '@mesh/common/contracts';
import {
  buildAddress, buildBip32PrivateKey, deserializeBip32PrivateKey,
  deserializeTx, deserializeTxHash, deserializeTxWitnessSet,
  fromBytes, fromUTF8, resolveTxHash,
} from '@mesh/common/utils';
import type { Address, PrivateKey } from '@mesh/core';

export class EmbeddedWallet implements ISigner {
  private readonly _accountAddress: Address;
  private readonly _publicKey: PrivateKey;
  private readonly _stakeKey: PrivateKey;

  constructor(
    password: string,
    networkId: number,
    encryptedWalletKey: string,
    accountIndex = 1,
  ) {
    try {
      const walletKey = EmbeddedWallet.decrypt(encryptedWalletKey, password);

      const {
        publicKey, stakeKey,
      } = EmbeddedWallet.derive(walletKey, accountIndex);

      const address = buildAddress(networkId, publicKey, stakeKey);

      this._accountAddress = address;
      this._publicKey = publicKey;
      this._stakeKey = stakeKey;
    } catch (error) {
      throw error;
    }
  }

  get accountAddress() {
    return this._accountAddress;
  }

  async signData(payload: string): Promise<string> {
    throw new Error('Method not implemented.' + payload);
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

    vkeyWitnesses.add(csl.make_vkey_witness(txHash, this._publicKey));
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

    const publicKey = accountKey
      .derive(0) // external chain
      .derive(0)
      .to_raw_key();

    const stakeKey = accountKey
      .derive(2) // staking key
      .derive(0)
      .to_raw_key();

    return { publicKey, stakeKey };
  }

  private static harden(path: number): number {
    return 0x80000000 + path;
  }
}
