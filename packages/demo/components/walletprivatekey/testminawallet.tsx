import { useState } from 'react';
import Button from '../ui/button';
import { MinaWallet } from '@martifylabs/mesh';

const TestMinaWallet = ({}) => {
  async function enableWallet() {
    const enabled = await MinaWallet.enable();
    console.log('enableWallet', enabled);
  }

  async function getWalletChangeAddress() {
    const changeAddress = await MinaWallet.getChangeAddress();
    console.log('changeAddress', changeAddress);
  }

  async function getWalletUtxo() {
    const utxos = await MinaWallet.getUtxos();
    console.log('utxos', utxos);
  }

  async function doSignTx() {
    const signedTx = await MinaWallet.signTx('unsignedTx', true);
    console.log('signedTx', signedTx);
  }

  return (
    <>
      <h2>Connect Mina on client dApp</h2>
      <p className="lead"></p>
      <Button onClick={() => enableWallet()}>MinaWallet.enable</Button>
      <Button onClick={() => getWalletChangeAddress()}>
        MinaWallet.getWalletChangeAddress
      </Button>
      <Button onClick={() => getWalletUtxo()}>MinaWallet.getUtxos</Button>
      <Button onClick={() => doSignTx()}>MinaWallet.signTx</Button>
    </>
  );
};

export default TestMinaWallet;
