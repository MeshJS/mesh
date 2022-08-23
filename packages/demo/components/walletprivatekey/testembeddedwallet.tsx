import { useState, useEffect } from 'react';
import {
  EmbeddedWallet,
  TransactionService,
  BlockfrostProvider,
} from '@martifylabs/mesh';
import type { UTxO, Asset } from '@martifylabs/mesh';
import Button from '../ui/button';

const TestEmbeddedWallet = ({}) => {
  // from mnemonic
  const myaddress =
    'addr_test1qr3ctze63ps2swpynyqz9lkr39h0q5uq4uq74tlauqdkpukqju2u7lfjyefszazk3vfmd2umuhq2z26c9hpfya0fvk2qxtzvhd';
  const myencryptedRootKey =
    'abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef88abcdef888811abcdef88881119ee4461d9bba1a1f873b9b98a98ea63ae6fa11b600938d4efb100650d2cea5d4bd187d713494f422801bb477d67bc83b6fdb084f4dd3db731c81d42e22bfabd1285fbf5b4ea12d03d4a7233ec889beb32ed38ad7ec28c65ff56a69f43c0c9ec3cdb211339809221d538d222d204f104';
  const mypassword = '12345678';

  // from cli
  const paymentSkey =
    '58209e8103ad951b63344957c5f0bdfad4f4a311f20b39517018075f33765e95d2d6';
  const stakeSkey =
    '58200c3a757b78a02f9653804055c4650613c1aedb183f2de9e1f7d97a3d4908f033';
  const myCliDeriveEncryptedRootKey =
    'b24ccc9840cc7ea531a33601c7b4948e65933274ac774dfa61374b3684336dd8372ecfa87efcca576b492352802a1daa50a38f339333db6fa67a6538e928fb5b84e4294d4d492080ef810b401ca087036100336a9ad185a549d692bd|83efd0ffb6cb00bec172d6c73a3b219a9e7418952ee4bd24a2b4f99fcfd38f0d850a525889902d9b6c178cab21f3ba36727de6da308eaf7ba8f77f409ae1347c6d84ac06e1048fef7f248376b586951fb83dfad51ffd43ae1861fbc2';
  const myCliAddress =
    'addr_test1qqkkuejquhasdsas3f8gcp9lwhsmjy96xs88r7ck7syrjv0tsj06g0hd3sft7syldwrq33tj79t9hnjtzlq59xqm8dcqmvd5mm';

  async function makeTx() {
    const wallet = loadWallet();
    console.log('wallet', wallet);
    await _makeTx(wallet);
  }

  async function makeTxCli() {
    const wallet = loadCliWalletFromDerivedPrivateKey();
    console.log('wallet', wallet);
    await _makeTx(wallet);
  }

  async function _makeTx(wallet) {
    const sendToAddress =
      'addr_test1qq5tay78z9l77vkxvrvtrv70nvjdk0fyvxmqzs57jg0vq6wk3w9pfppagj5rc4wsmlfyvc8xs7ytkumazu9xq49z94pqzl95zt';
    const sendAmount = '1500000';

    const blockfrostProvider = new BlockfrostProvider(
      process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET!,
      0
    );

    // get utxos
    let utxos: UTxO[] = await blockfrostProvider.fetchAssetUtxosFromAddress(
      'lovelace',
      wallet.paymentAddress
    );
    console.log('utxos', utxos);

    // make tx
    const tx = new TransactionService();
    tx.sendLovelace(sendToAddress, sendAmount);
    tx.setTxInputs(utxos);
    tx.setChangeAddress(wallet.paymentAddress);

    const unsignedTx = await tx.build();
    console.log('unsignedTx', unsignedTx);

    // sign tx
    let signedTx = wallet.signTx(unsignedTx, mypassword);
    console.log('signedTx', signedTx);

    // let txHash = await blockfrostProvider.submitTx(signedTx);
    // console.log('txHash', txHash);
  }

  function getMnemonicCreateWallet() {
    const mnemonic = EmbeddedWallet.generate();
    console.log('mnemonic', mnemonic);

    const privatewallet = EmbeddedWallet.encryptMnemonic(mnemonic, '12345678');
    console.log('privatewallet', privatewallet);
  }

  function loadWallet() {
    const wallet = new EmbeddedWallet(myencryptedRootKey, mypassword, {
      accountIndex: 0,
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
    const privatekey = EmbeddedWallet.encryptSigningKeys(
      paymentSkey,
      stakeSkey,
      mypassword
    );
    console.log('privatekey', privatekey);
  }

  function loadCliWalletFromDerivedPrivateKey() {
    const wallet = new EmbeddedWallet(myCliDeriveEncryptedRootKey, mypassword, {
      accountIndex: 0,
    });
    console.log('wallet', wallet);
    console.log(
      'paymentAddress',
      wallet.paymentAddress,
      wallet.paymentAddress == myCliAddress
    );
    console.log('stakeAddress', wallet.stakeAddress);

    return wallet;
  }

  function getPolicyKey(){
    const policyKey = EmbeddedWallet.derivePolicyKey();
    console.log("policyKey", policyKey);
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
      <Button onClick={() => loadCliWalletFromDerivedPrivateKey()}>
        loadCliWalletFromDerivedPrivateKey
      </Button>
      <Button onClick={() => makeTx()}>makeTx</Button>
      <Button onClick={() => makeTxCli()}>makeTxCli</Button>

      {/* <Button onClick={() => getPolicyKey()}>getPolicyKey</Button> */}

      
    </>
  );
};

export default TestEmbeddedWallet;
