import { useState } from 'react';
import Button from '../ui/button';
import { MinaWallet } from '@martifylabs/mesh';

const TestMinaWallet = ({}) => {

  async function enableWallet() {
    const enabled = await MinaWallet.enable();
    console.log('TestMinaWallet res', enabled);
  }

  async function getWalletChangeAddress() {
    const changeAddress = await MinaWallet.getChangeAddress();
    console.log('changeAddress', changeAddress);
  }

  return (
    <>
      <h2>Mina</h2>
      <p className="lead"></p>
      <Button onClick={() => enableWallet()}>MinaWallet.enable</Button>
      <Button onClick={() => getWalletChangeAddress()}>
        MinaWallet.getWalletChangeAddress
      </Button>
    </>
  );
};

export default TestMinaWallet;
