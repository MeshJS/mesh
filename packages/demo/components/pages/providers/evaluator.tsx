import { useEffect, useState } from 'react';
import SectionTwoCol from '../../common/sectionTwoCol';
import { demoAddresses } from '../../../configs/demo';
import { BadgeEvaluator } from './badges';
import { evaluateTxLeft, evaluateTxRight } from './evaluator/evaluateTx';
import { useWallet } from '@meshsdk/react';

export default function Evaluator({ evaluator, evaluatorName }) {
  const { wallet, connected } = useWallet();
  const [address, setAddress] = useState<string>(demoAddresses.testnet);
  // const [lovelace, setLovelace] = useState<string>('5000000');

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
        sidebarTo="evaluateTx"
        header="evaluateTx"
        leftFn={evaluateTxLeft({
          evaluatorName,
        })}
        rightFn={evaluateTxRight({
          evaluator,
        })}
        isH3={true}
        badge={<BadgeEvaluator />}
      />
    </>
  );
}
