import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import RunDemoButton from '../../../common/runDemoButton';
import RunDemoResult from '../../../common/runDemoResult';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { useWallet } from '@meshsdk/react';
import ConnectCipWallet from '../../../common/connectCipWallet';

export default function GetRewardAddresses() {
  return (
    <SectionTwoCol
      sidebarTo="getRewardAddresses"
      header="Get Reward Addresses"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[\n`;
  example += `  "stake_test1uzx0ksy9f4qnj2mzfdncqyjy84sszh64w43853nug5pedjgytgke9"\n`;
  example += `]\n`;

  return (
    <>
      <p>
        Returns a list of reward addresses owned by the wallet. A reward address
        is a stake address that is used to receive rewards from staking,
        generally starts from `stake` prefix. Example:
      </p>
      <Codeblock data={example} isJson={false} />
    </>
  );
}

function Right() {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const { wallet, connected } = useWallet();

  async function runDemo() {
    setLoading(true);
    let results = await wallet.getRewardAddresses();
    setResponse(results);
    setLoading(false);
  }
  return (
    <>
      <Card>
        <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
          Get Reward Addresses
          <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            Get stake addresses
          </p>
        </div>
        <Codeblock
          data={`const rewardAddresses = await wallet.getRewardAddresses();`}
          isJson={false}
        />
        {connected ? (
          <>
            <RunDemoButton
              runDemoFn={runDemo}
              loading={loading}
              response={response}
            />
            <RunDemoResult response={response} />
          </>
        ) : (
          <ConnectCipWallet />
        )}
      </Card>
    </>
  );
}
