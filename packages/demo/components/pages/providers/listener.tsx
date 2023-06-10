import { useEffect, useState } from 'react';
import SectionTwoCol from '../../common/sectionTwoCol';
import { demoAddresses } from '../../../configs/demo';
import { BadgeListener } from './badges';
import {
  onTxConfirmedLeft,
  onTxConfirmedRight,
} from './listener/onTxConfirmed';
import { onNextTxLeft, onNextTxRight } from './listener/onNextTx';
import { useWallet } from '@meshsdk/react';

export default function Listener({ listener, listenerName }) {
  const { wallet, connected } = useWallet();
  const [address, setAddress] = useState<string>(demoAddresses.testnet);
  const [lovelace, setLovelace] = useState<string>('5000000');

  useEffect(() => {
    async function init() {
      setAddress(
        (await wallet.getNetworkId()) === 1
          ? demoAddresses.mainnet
          : demoAddresses.testnet
      );
    }
    if (connected) {
      init();
    }
  }, [connected]);

  return (
    <>
      <SectionTwoCol
        sidebarTo="onTxConfirmed"
        header="onTxConfirmed"
        leftFn={onTxConfirmedLeft({
          listenerName,
          address,
          lovelace,
        })}
        rightFn={onTxConfirmedRight({
          listener,
          address,
          setAddress,
          lovelace,
          setLovelace,
        })}
        isH3={true}
        badge={<BadgeListener />}
      />
    </>
  );
}
