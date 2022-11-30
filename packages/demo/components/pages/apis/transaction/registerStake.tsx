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
import Link from 'next/link';

export default function RegisterStake() {
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
      sidebarTo="registerStake"
      header="Register Stake Address"
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
  codeSnippet += `tx.registerStake(rewardAddress);\n`;
  codeSnippet += `tx.delegateStake(rewardAddress, poolId);\n\n`;

  codeSnippet += `const unsignedTx = await tx.build();\n`;
  codeSnippet += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet += `const txHash = await wallet.submitTx(signedTx);`;

  let code2 = ``;
  code2 += `{\n`;
  code2 += `  "active": true,\n`;
  code2 += `  "poolId": "pool19658g9m7a6e7vtky76aefcwmm75wegf9xs3t024s38l87rqq4ky",\n`;
  code2 += `  "balance": "389290551",\n`;
  code2 += `  "rewards": "0",\n`;
  code2 += `  "withdrawals": "0"\n`;
  code2 += `}\n`;

  return (
    <>
      <p>
        New address must "register" before they can delegate to stakepools. To
        check if a reward address has been register, use{' '}
        <a href="https://mesh.martify.io/providers/blockfrost#fetchAccountInfo">
          blockchainProvider.fetchAccountInfo(rewardAddress)
        </a>
        . For example this account information, <code>active</code> shows the
        address is registered.
      </p>
      <Codeblock data={code2} isJson={false} />
      <p>
        You can chain with <code>delegateStake()</code> to register and delegate
        to a stake pool.
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
      tx.registerStake(rewardAddress);
      tx.delegateStake(rewardAddress, userInput);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      setResponse(txHash);
      setState(2);
    } catch (error) {
      setResponseError(JSON.stringify(error));
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
