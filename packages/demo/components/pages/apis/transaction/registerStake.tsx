import { useEffect, useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../common/connectCipWallet';
import Input from '../../../ui/input';
import { Transaction } from '@meshsdk/core';

export default function RegisterStake() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>(
    'pool1mhww3q6d7qssj5j2add05r7cyr7znyswe2g6vd23anpx5sh6z8d'
  );
  const [rewardAddress, setRewardAddress] = useState<string>(
    'stake1qdzmqvfdnxsn4a3hd57x435madswynt4hqw8n7f2pdq05g4995re'
  );

  useEffect(() => {
    async function init() {
      const rewardAddresses = await wallet.getRewardAddresses();
      setRewardAddress(rewardAddresses[0]);
    }
    if (connected) {
      init();
    }
  }, [connected]);

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
  let codeSnippet = `import { Transaction } from '@meshsdk/core';\n\n`;

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
  code2 += `  "poolId": "${userInput}",\n`;
  code2 += `  "balance": "389290551",\n`;
  code2 += `  "rewards": "0",\n`;
  code2 += `  "withdrawals": "0"\n`;
  code2 += `}\n`;

  return (
    <>
      <p>
        New address must "register" before they can delegate to stakepools. To
        check if a reward address has been register, use{' '}
        <a href="https://meshjs.dev/providers/blockfrost#fetchAccountInfo">
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
  const { wallet, connected } = useWallet();

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
      {connected ? (
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
      <RunDemoResult response={responseError} label="Error" />
    </Card>
  );
}
