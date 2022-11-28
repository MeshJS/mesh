import { useEffect, useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import useWallet from '../../../../contexts/wallet';
import ConnectCipWallet from '../../../common/connectCipWallet';
import Input from '../../../ui/input';
import { Transaction } from '@martifylabs/mesh';

export default function DelegateStake() {
  const { wallet, walletConnected } = useWallet();
  const [userInput, setUserInput] = useState<string>(
    'pool1mhww3q6d7qssj5j2add05r7cyr7znyswe2g6vd23anpx5sh6z8d'
  );
  const [rewardAddress, setRewardAddress] = useState<string>(
    'stake_test1uzx0ksy9f4qnj2mzfdncqyjy84sszh64w43853nug5pedjgytgke9'
  );

  useEffect(() => {
    async function init() {
      const rewardAddresses = await wallet.getRewardAddresses();
      setRewardAddress(rewardAddresses[0]);
    }
    if (walletConnected) {
      init();
    }
  }, [walletConnected]);

  return (
    <SectionTwoCol
      sidebarTo="delegateStake"
      header="Delegate ADA to stakepool"
      leftFn={Left({ userInput, rewardAddress })}
      rightFn={Right({ userInput, setUserInput })}
    />
  );
}

function Left({ userInput, rewardAddress }) {
  let codeSnippet = `import { Transaction } from '@martifylabs/mesh';\n\n`;

  codeSnippet += `const rewardAddress = '${rewardAddress}';\n`;
  codeSnippet += `const poolId = '${userInput}';\n\n`;

  codeSnippet += `const tx = new Transaction({ initiator: wallet });\n`;
  codeSnippet += `tx.delegateStake(rewardAddress, poolId);\n`;
  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <>
      <p>
        Delegation is the process by which ADA holders delegate the stake
        associated with their ADA to a stake pool. Doing so, this allows ADA
        holders to participate in the network and be rewarded in proportion to
        the amount of stake delegated.
      </p>
      <Codeblock data={codeSnippet} isJson={false} />
    </>
  );
}

function Right({ userInput, setUserInput }) {
  const [state, setState] = useState<number>(0);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  const { wallet, walletConnected, hasAvailableWallets } = useWallet();

  async function runDemo() {
    setState(1);
    setResponseError(null);

    try {
      const rewardAddresses = await wallet.getRewardAddresses();
      const rewardAddress = rewardAddresses[0];

      const tx = new Transaction({ initiator: wallet });
      tx.registerStake(rewardAddress).delegateStake(rewardAddress, userInput);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      setResponse(txHash);
      setState(2);
    } catch (error) {
      setResponseError(`${JSON.stringify(error)}`);
      setState(0);
    }
  }

  return (
    <Card>
      <Input
        value={userInput}
        onChange={(e) => setUserInput(e.target.value)}
        placeholder="Pool ID"
        label="Pool ID"
      />
      {hasAvailableWallets && (
        <>
          {walletConnected ? (
            <>
              <RunDemoButton
                runDemoFn={runDemo}
                loading={state == 1}
                response={response}
              />
              <RunDemoResult response={response} />
            </>
          ) : (
            <ConnectCipWallet />
          )}
        </>
      )}
      <RunDemoResult response={responseError} label="Error" />
    </Card>
  );
}
