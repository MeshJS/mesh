import { useState } from 'react';
import Button from '../ui/button';
import { MinaWallet } from '@martifylabs/mesh';

const TestMinaWallet = ({}) => {
  const [wallet, setWallet] = useState<MinaWallet | undefined>(undefined);

  async function enableWallet() {
    const _wallet = new MinaWallet();
    const enabled = await _wallet.enable();
    console.log('TestMinaWallet res', enabled);
    if (enabled) {
      setWallet(_wallet);
    }
  }

  async function getWalletChangeAddress() {
    const changeAddress = await wallet?.getChangeAddress();
    console.log('changeAddress', changeAddress);
  }

  return (
    <>
      <h2>Mina</h2>
      <p className="lead"></p>
      <Button onClick={() => enableWallet()}>MinaWallet.enable</Button>
      <Button onClick={() => getWalletChangeAddress()}>MinaWallet.getWalletChangeAddress</Button>
    </>
  );
};

export default TestMinaWallet;
