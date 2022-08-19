import { csl } from '../core';
import { generateMnemonic, mnemonicToEntropy } from 'bip39';
import { deserializeTx, fromBytes } from '../common/utils';
// import cryptoRandomString from 'crypto-random-string';

export class WalletPrivateKeyService {
  private constructor() {}

  static createWalletStep1GetMnemonic(): string {
    const mnemonic = generateMnemonic(256);
    return mnemonic;
  }

  static createWalletStep2WithMnemonicAndPassword(mnemonic, password) {
    const paymentAddress = WalletPrivateKeyService.createWalletMnemonic({
      seedPhrase: mnemonic,
      password: password,
    });
    return paymentAddress;
  }

  static encryptWithPassword(password, rootKeyBytes) {
    const rootKeyHex = Buffer.from(rootKeyBytes, 'hex').toString('hex');
    const passwordHex = Buffer.from(password).toString('hex');

    // TODO, cannot use cryptoRandomString
    // const salt = cryptoRandomString({ length: 64 });
    // const nonce = cryptoRandomString({ length: 24 });
    const salt =
      'abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88';
    const nonce = 'abcdef888811abcdef888811';

    return csl.encrypt_with_password(passwordHex, salt, nonce, rootKeyHex);
  }

  static createWalletMnemonic({
    seedPhrase,
    password,
  }: {
    seedPhrase: string;
    password: string;
  }) {
    let entropy = mnemonicToEntropy(seedPhrase);
    let rootKey =
      WalletPrivateKeyService.fromBip39EntropyToBip32PrivateKey(entropy);

    const encryptedRootKey = WalletPrivateKeyService.encryptWithPassword(
      password,
      rootKey.as_bytes()
    );
    console.log('encryptedRootKey', encryptedRootKey);
    // lets store this encryptedRootKey with the oauth's UID

    const wallet = WalletPrivateKeyService.loadWallet({
      encryptedRootKey,
      password,
    });
    console.log('wallet', wallet);

    return wallet.paymentAddress;
  }

  static fromBip39EntropyToBip32PrivateKey(entropy) {
    return csl.Bip32PrivateKey.from_bip39_entropy(
      Buffer.from(entropy, 'hex'),
      Buffer.from('')
    );
  }

  static loadWallet({
    encryptedRootKey,
    password,
    accountIndex = 1,
    network = 0,
  }) {
    console.log(111, encryptedRootKey, password);
    let { paymentKey, stakeKey } = WalletPrivateKeyService.requestAccountKey(
      encryptedRootKey,
      password,
      accountIndex
    );

    const paymentKeyHash = paymentKey.to_public().hash();
    const stakeKeyHash = stakeKey.to_public().hash();
    const paymentAddress = csl.BaseAddress.new(
      network,
      csl.StakeCredential.from_keyhash(paymentKeyHash),
      csl.StakeCredential.from_keyhash(stakeKeyHash)
    )
      .to_address()
      .to_bech32();

    return {
      paymentAddress,
      paymentKeyHash,
      stakeKeyHash,
      paymentKey,
      stakeKey,
    };
  }

  static harden(num) {
    return 0x80000000 + num;
  }

  static decryptWithPassword(password, encryptedKeyHex) {
    const passwordHex = Buffer.from(password).toString('hex');
    let decryptedHex;
    try {
      decryptedHex = csl.decrypt_with_password(passwordHex, encryptedKeyHex);
    } catch (err) {
      throw 'Wrong password';
    }
    return decryptedHex;
  }

  static requestAccountKey(encryptedRootKey, password, accountIndex = 1) {
    let accountKey = csl.Bip32PrivateKey.from_bytes(
      Buffer.from(
        WalletPrivateKeyService.decryptWithPassword(password, encryptedRootKey),
        'hex'
      )
    )
      .derive(WalletPrivateKeyService.harden(1852)) // purpose
      .derive(WalletPrivateKeyService.harden(1815)) // coin type;
      .derive(WalletPrivateKeyService.harden(accountIndex));

    return {
      accountKey,
      paymentKey: accountKey.derive(0).derive(0).to_raw_key(),
      stakeKey: accountKey.derive(2).derive(0).to_raw_key(),
    };
  }

  static signTxWithPassword({
    unsignedTx,
    encryptedRootKey,
    password,
    accountIndex = 1,
    network = 0,
  }) {
    const { paymentKey, stakeKey } = WalletPrivateKeyService.loadWallet({
      encryptedRootKey,
      password,
      accountIndex,
      network,
    });

    const tx = deserializeTx(unsignedTx);

    const txWitnessSet = csl.TransactionWitnessSet.new();
    const vkeyWitnesses = csl.Vkeywitnesses.new();
    const txHash = csl.hash_transaction(tx.body());

    const pkey = csl.make_vkey_witness(txHash, paymentKey);
    vkeyWitnesses.add(pkey);
    const skey = csl.make_vkey_witness(txHash, stakeKey);
    vkeyWitnesses.add(skey);

    txWitnessSet.set_vkeys(vkeyWitnesses);

    // make tx
    const signedTx = fromBytes(
      csl.Transaction.new(
        tx.body(),
        txWitnessSet,
        tx.auxiliary_data()
      ).to_bytes()
    );

    return signedTx;
  }
}
