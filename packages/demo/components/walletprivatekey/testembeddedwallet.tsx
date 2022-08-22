import { useState, useEffect } from 'react';
import {
  EmbeddedWallet,
  TransactionService,
  BlockfrostProvider,
} from '@martifylabs/mesh';
import type { UTxO, Asset } from '@martifylabs/mesh';
import Button from '../ui/button';

const TestEmbeddedWallet = ({}) => {
  const myaddress =
    'addr_test1qr3ctze63ps2swpynyqz9lkr39h0q5uq4uq74tlauqdkpukqju2u7lfjyefszazk3vfmd2umuhq2z26c9hpfya0fvk2qxtzvhd';
  const myencryptedRootKey =
    'abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef888811abcdef88881119ee4461d9bba1a1f873b9b98a98ea63ae6fa11b600938d4efb100650d2cea5d4bd187d713494f422801bb477d67bc83b6fdb084f4dd3db731c81d42e22bfabd1285fbf5b4ea12d03d4a7233ec889beb32ed38ad7ec28c65ff56a69f43c0c9ec3cdb211339809221d538d222d204f104';
  const mypassword = '12345678';

  async function makeTx() {
    const wallet = loadWallet();

    console.log('wallet', wallet);

    // get utxo from bf

    const blockfrostProvider = new BlockfrostProvider(
      process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
      0
    );

    let utxos: UTxO[] = 
      await blockfrostProvider.fetchAssetUtxosFromAddress(
        'lovelace',
        myaddress
      );
    console.log('utxos 1', utxos);

    // make tx

    const tx = new TransactionService();
    tx.sendLovelace(
      'addr_test1qq5tay78z9l77vkxvrvtrv70nvjdk0fyvxmqzs57jg0vq6wk3w9pfppagj5rc4wsmlfyvc8xs7ytkumazu9xq49z94pqzl95zt',
      '1500000'
    );
    tx.setTxInputs(utxos);
    tx.setChangeAddress(myaddress);

    const unsignedTx = await tx.build();
    console.log('unsignedTx', unsignedTx);

    // sign tx

    let signedTx = wallet.signTx(unsignedTx, mypassword);
    console.log('signedTx', signedTx);

    let txHash = await blockfrostProvider.submitTx(signedTx);
    console.log('txHash', txHash);
  }

  function getMnemonicCreateWallet() {
    const mnemonic = EmbeddedWallet.generate();
    console.log('mnemonic', mnemonic);

    const privatewallet = EmbeddedWallet.encryptMnemonic(mnemonic, '12345678');
    console.log('privatewallet', privatewallet);
  }

  function loadWallet() {
    const wallet = new EmbeddedWallet(myencryptedRootKey, mypassword, {
      accountIndex: 1,
    });
    console.log('wallet', wallet);
    console.log(
      'paymentAddress',
      wallet.paymentAddress,
      wallet.paymentAddress == myaddress
    );
    console.log('stakeAddress', wallet.stakeAddress);

    return wallet;
  }

  function loadCliWallet() {
    const paymentSkey =
      '58209e8103ad951b63344957c5f0bdfad4f4a311f20b39517018075f33765e95d2d6';
    const stakeSkey =
      '58200c3a757b78a02f9653804055c4650613c1aedb183f2de9e1f7d97a3d4908f033';
    const mypassword = '12345678';
    const privatekey = EmbeddedWallet.encryptXPrvKeys(
      paymentSkey,
      stakeSkey,
      mypassword
    );
    console.log('privatekey', privatekey);
  }

  return (
    <>
      <h2>Test Tx</h2>
      <p className="lead">
        Here we debug transactions with private key wallets.
      </p>
      <Button onClick={() => getMnemonicCreateWallet()}>
        getMnemonicCreateWallet
      </Button>
      <Button onClick={() => loadWallet()}>loadWallet</Button>
      <Button onClick={() => loadCliWallet()}>loadCliWallet</Button>
      <Button onClick={() => makeTx()}>makeTx</Button>
    </>
  );
};

export default TestEmbeddedWallet;
